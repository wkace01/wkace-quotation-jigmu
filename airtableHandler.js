// node 24 버전에 내장된 전역 fetch를 그대로 사용합니다.
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

// ─── 고객 테이블 필드 ID 매핑 (tblyf3MAxBaEQCC26) ───────────────────────────
// 필드명 문자열 대신 ID 사용 → 필드명 변경 시에도 오류 없음
const CUSTOMER_FIELDS = {
    지역명:              'fld2etpKwV42tGVoU',  // singleSelect
    건물명:              'fldDbxCW6kw8XdAWp',  // singleLineText
    도로명주소:          'fld1s0uYPU54n5j6q',  // singleLineText
    지번주소:            'flde4BAWi8vrtAdjm',  // singleLineText
    우편번호:            'fldneW7Lk3QsoECVd',  // singleLineText
    거래처담당자:        'fldMIf0pW8NViFqtA',  // singleLineText
    거래처담당자직함:    'fldkeV9f9HQu4tCNZ',  // singleLineText
    거래처연락처:        'fld1jcJWfrRad1NDn',  // phoneNumber
    거래처담당자휴대전화:'fld53ADiKOuLV2EUb',  // phoneNumber
    거래처담당자이메일:  'fld0RnmYueu25EaZs',  // email
    정전무정전:          'fldvrYNqET4rhNN0C',  // singleSelect
    점검횟수:            'fldvmwiPSH2KaoG8I',  // number
    수전:                'fldTbfYW4NszWY5XL',  // number
    발전:                'fld6RLXOFjM3NgnBb',  // number
    태양광:              'fldsGdSQu8AVd2xyc',  // number
    연료전지:            'fldO39ErYUq2CoD1e',  // number
    고객메모:            'fld8eKfRUwpy01RcN',  // multilineText
    범위:                'fldk3niqb3dmqCOOO',  // multipleSelects
};

// ─── 견적 테이블 필드 ID 매핑 (tblx4lwYB78EMaLe3) ───────────────────────────
const QUOTE_FIELDS = {
    고객고유ID:      'fldzDc9SChlRML2Xd',  // multipleRecordLinks
    견적서발송일:    'fldWgroXnHKgo4fKN',  // date
    관리회사명:      'fldJ4UxVHEkHNNHK6',  // singleSelect — typecast:true 필수
    영업담당자:      'fldxUs3eNuAWk3ePy',  // singleLineText
    월차점검횟수:    'fldPxLTvOySAE9rKm',  // singleSelect
    월차점검:        'fldyPgXVmEjWSn2CQ',  // currency
    저압설비:        'fldcqo7EJ3Tf61dVJ',  // currency
    고압설비:        'fldmwNNGlNRoIpBgH',  // currency
    발전설비:        'fldRfoQFtzotpY8PU',  // currency
    열화상측정:      'fldPyLabnAQKegxN5',  // currency
    품질분석:        'fldyyxrOFNZMIsU8p',  // currency
    보고서작성:      'fld9UGeEzwA2viBiR',  // currency
    태양광발전설비:  'fldtd7yxHzN9M7CxE',  // currency
    추가점검범위:    'fld56edPkGk9Pxx4E',  // multipleSelects
};

// ─── 유틸 함수 ────────────────────────────────────────────────────────────────

function parseNumber(value) {
    if (!value) return null;
    if (typeof value === 'number') return value;
    const num = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
    return isNaN(num) ? null : num;
}

function normalizeMonthlyInspectionCount(value) {
    if (!value) return null;
    const normalized = String(value).trim();
    return /^\d+회$/.test(normalized) ? normalized : null;
}

function extractRegionPrefix(address) {
    if (!address) return '';
    const normalized = String(address).trim();
    if (!normalized) return '';
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const cityOrCountyToken = tokens.find(token => /[시군]$/.test(token));
    if (cityOrCountyToken) return cityOrCountyToken.slice(0, -1);
    const firstToken = tokens[0] || '';
    return firstToken.slice(0, 2);
}

function normalizeTopLevelRegion(token) {
    if (!token) return '';
    if (/(특별자치도|특별시|광역시|특별자치시|도)$/.test(token)) return token.slice(0, 2);
    return token;
}

function normalizeRoadAddress(address) {
    if (!address) return '';
    const normalized = String(address)
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/([가-힣A-Za-z])(\d)/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return '';
    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return '';
    if (tokens[0].endsWith('특별자치도')) tokens[0] = tokens[0].slice(0, 2);
    return tokens.join(' ');
}

/**
 * 429(Rate Limit) 자동 재시도 + 지수 백오프
 * retryStatuses 에 포함된 상태코드 응답 시 최대 3회 재시도
 */
async function fetchWithRetry(url, options, retryStatuses = [429]) {
    let lastRes;
    for (let i = 1; i <= 3; i++) {
        lastRes = await fetch(url, options);
        if (!retryStatuses.includes(lastRes.status) || i === 3) break;
        await new Promise(r => setTimeout(r, 300 * i)); // 300ms, 600ms 백오프
    }
    return lastRes;
}

/** 빈 값(null / undefined / '') 필드 제거 */
function cleanFields(fields) {
    const result = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v !== null && v !== undefined && v !== '') result[k] = v;
    }
    return result;
}

// ─── 1. 기존 고객 찾기 (건물명 + 도로명 주소 매칭) ──────────────────────────
// 필터 수식은 필드명 문자열 사용 (Airtable formula 규격)
async function findCustomer(buildingName, address) {
    if (!AIRTABLE_API_KEY || !BASE_ID) return null;
    const filter = `AND({건물명}="${buildingName}", {도로명 주소}="${address}")`;
    const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('고객')}?filterByFormula=${encodeURIComponent(filter)}&maxRecords=1`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) throw new Error('Airtable 고객 검색 실패: ' + await res.text());
    const data = await res.json();
    return data.records.length > 0 ? data.records[0].id : null;
}

// ─── 2. 신규 고객 생성 ────────────────────────────────────────────────────────
async function createCustomer(fields) {
    if (!AIRTABLE_API_KEY || !BASE_ID) throw new Error('Airtable Configuration Missing');

    const safe = cleanFields(fields);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('고객')}`;
    const makeOptions = (f) => ({
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ fields: f }], typecast: true })
    });

    let res = await fetchWithRetry(url, makeOptions(safe), [429]);

    // 422: singleSelect 필드(지역명, 정전무정전) 제거 후 1회 재시도
    if (res.status === 422) {
        const { [CUSTOMER_FIELDS.지역명]: _a, [CUSTOMER_FIELDS.정전무정전]: _b, ...fallback } = safe;
        console.warn('⚠️ 고객 생성 422 → singleSelect 필드 제외 재시도');
        res = await fetchWithRetry(url, makeOptions(fallback), [429]);
    }

    if (!res.ok) throw new Error('Airtable 고객 생성 실패: ' + await res.text());
    const data = await res.json();
    return data.records[0].id;
}

// ─── 2-1. 기존 고객 업데이트 ─────────────────────────────────────────────────
async function updateCustomer(recordId, fields) {
    if (!AIRTABLE_API_KEY || !BASE_ID) throw new Error('Airtable Configuration Missing');

    const safe = cleanFields(fields);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('고객')}`;
    const makeOptions = (f) => ({
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ id: recordId, fields: f }], typecast: true })
    });

    let res = await fetchWithRetry(url, makeOptions(safe), [429]);

    // 422: singleSelect 필드 제거 후 1회 재시도
    if (res.status === 422) {
        const { [CUSTOMER_FIELDS.지역명]: _a, [CUSTOMER_FIELDS.정전무정전]: _b, ...fallback } = safe;
        console.warn('⚠️ 고객 업데이트 422 → singleSelect 필드 제외 재시도');
        res = await fetchWithRetry(url, makeOptions(fallback), [429]);
    }

    if (!res.ok) throw new Error('Airtable 고객 수정 실패: ' + await res.text());
    const data = await res.json();
    return data.records[0].id;
}

// ─── 3. 신규 견적 생성 ────────────────────────────────────────────────────────
async function createQuote(fields) {
    if (!AIRTABLE_API_KEY || !BASE_ID) throw new Error('Airtable Configuration Missing');

    const safe = cleanFields(fields);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('견적')}`;
    const makeOptions = (f) => ({
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ fields: f }], typecast: true })
    });

    let res = await fetchWithRetry(url, makeOptions(safe), [429]);

    // 422: singleSelect 필드(영업담당자, 월차점검횟수) 제거 후 1회 재시도
    if (res.status === 422) {
        const { [QUOTE_FIELDS.영업담당자]: _a, [QUOTE_FIELDS.월차점검횟수]: _b, ...fallback } = safe;
        console.warn('⚠️ 견적 생성 422 → singleSelect 필드 제외 재시도');
        res = await fetchWithRetry(url, makeOptions(fallback), [429]);
    }

    if (!res.ok) throw new Error('Airtable 견적 생성 실패: ' + await res.text());
    const data = await res.json();
    const record = data.records[0];
    return {
        id: record.id,
        quoteUniqueId: record.fields?.['견적 고유 ID'] || record.id
    };
}

// ─── 메인 파이프라인: JSON 데이터(mapping) → Airtable 저장 ───────────────────
async function syncToAirtable(data, meta = {}) {
    if (!AIRTABLE_API_KEY || !BASE_ID) {
        console.warn('⚠️ 에어테이블 연동 생략: 환경변수 AIRTABLE_API_KEY 또는 AIRTABLE_BASE_ID 가 없습니다.');
        return null;
    }

    // Excel 매핑 데이터 평탄화
    const flatMapping = {};
    for (const sheetValues of Object.values(data)) {
        if (Array.isArray(sheetValues)) {
            for (const item of sheetValues) {
                if (item.name && item.value !== '') {
                    flatMapping[item.name] = item.value;
                }
            }
        }
    }

    const buildingName   = flatMapping['고객명'] || '';
    const rawRoadAddress = flatMapping['도로명주소'] || flatMapping['현장주소'] || '';
    const rawJibunAddress = flatMapping['지번주소'] || '';
    const roadAddress    = normalizeRoadAddress(rawRoadAddress);
    const jibunAddress   = normalizeRoadAddress(rawJibunAddress);
    const zonecode       = String(flatMapping['우편번호'] || '').trim();
    const regionName     = extractRegionPrefix(roadAddress);

    // ── 고객 테이블 필드 (필드 ID 기반) ─────────────────────────────────────
    // "주소" 필드는 직무고시 Airtable에 존재하지 않으므로 제거
    // 도로명 주소·지번 주소로 충분히 저장됨
    const customerFields = {
        [CUSTOMER_FIELDS.지역명]:              regionName,
        [CUSTOMER_FIELDS.건물명]:              buildingName,
        [CUSTOMER_FIELDS.도로명주소]:          roadAddress,
        [CUSTOMER_FIELDS.지번주소]:            jibunAddress,
        [CUSTOMER_FIELDS.우편번호]:            zonecode,
        [CUSTOMER_FIELDS.거래처담당자]:        flatMapping['담당자명'] || '',
        [CUSTOMER_FIELDS.거래처담당자직함]:    flatMapping['담당자 직함'] || '',
        [CUSTOMER_FIELDS.거래처연락처]:        flatMapping['거래처 연락처'] || '',
        [CUSTOMER_FIELDS.거래처담당자휴대전화]:flatMapping['담당자 휴대전화'] || '',
        [CUSTOMER_FIELDS.거래처담당자이메일]:  flatMapping['담당자 이메일'] || '',
        [CUSTOMER_FIELDS.정전무정전]:          flatMapping['정전여부'] || '',
        [CUSTOMER_FIELDS.점검횟수]:            parseNumber(flatMapping['점검횟수']),
        [CUSTOMER_FIELDS.수전]:                parseNumber(flatMapping['수전용량']),
        [CUSTOMER_FIELDS.발전]:                parseNumber(flatMapping['발전용량']),
        [CUSTOMER_FIELDS.태양광]:              parseNumber(flatMapping['태양광용량']),
        [CUSTOMER_FIELDS.연료전지]:            parseNumber(flatMapping['기타용량']),
        [CUSTOMER_FIELDS.고객메모]:            flatMapping['특이사항'] || '',
    };

    // 점검범위 (multipleSelects)
    if (flatMapping['점검범위']) {
        const scopeStr = flatMapping['점검범위'];
        const scopeArr = [];
        if (scopeStr.includes('배전반') || scopeStr.includes('전기실')) scopeArr.push('전기실');
        if (scopeStr.includes('EPS')) scopeArr.push('EPS');
        if (scopeArr.length > 0) customerFields[CUSTOMER_FIELDS.범위] = scopeArr;
    }

    // ── Step 1: 고객 upsert ──────────────────────────────────────────────────
    let customerId = '';
    if (buildingName && roadAddress) {
        customerId = await findCustomer(buildingName, roadAddress);
    }

    if (!customerId) {
        customerId = await createCustomer(customerFields);
        console.log(`✅ 에어테이블 '고객' 테이블 신규 생성 완료: ${customerId}`);
    } else {
        await updateCustomer(customerId, customerFields);
        console.log(`✅ 기존 에어테이블 '고객' 레코드 업데이트 완료(중복 처리): ${customerId}`);
    }

    // 견적일 포맷팅 ('2026년 4월 4일' → '2026-04-04')
    let dateStr = null;
    if (flatMapping['견적일']) {
        const m = flatMapping['견적일'].match(/(\d+)년\s*(\d+)월\s*(\d+)일/);
        if (m) dateStr = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    }

    // ── 견적 테이블 필드 (필드 ID 기반) ─────────────────────────────────────
    const monthlyCount = normalizeMonthlyInspectionCount(flatMapping['월차점검']);
    const quoteFields = {
        [QUOTE_FIELDS.고객고유ID]:      [customerId],
        [QUOTE_FIELDS.견적서발송일]:    dateStr,
        [QUOTE_FIELDS.영업담당자]:      flatMapping['영업담당자'] || '',
        [QUOTE_FIELDS.월차점검횟수]:    monthlyCount,
        [QUOTE_FIELDS.월차점검]:        parseNumber(flatMapping['월차유지관리비']),
        [QUOTE_FIELDS.저압설비]:        parseNumber(flatMapping['저압점검']),
        [QUOTE_FIELDS.고압설비]:        parseNumber(flatMapping['고압점검']),
        [QUOTE_FIELDS.발전설비]:        parseNumber(flatMapping['발전점검']),
        [QUOTE_FIELDS.열화상측정]:      parseNumber(flatMapping['열화상측정']),
        [QUOTE_FIELDS.품질분석]:        parseNumber(flatMapping['품질분석']),
        [QUOTE_FIELDS.보고서작성]:      parseNumber(flatMapping['보고서작성']),
        [QUOTE_FIELDS.태양광발전설비]:  parseNumber(flatMapping['태양광발전설비']),
    };
    // 관리회사명: 웹 폼 입력값 (Excel 셀에 없으므로 meta로 전달받음)
    // singleSelect — typecast:true 로 신규 옵션 자동 생성
    if (meta.managementCompany) quoteFields[QUOTE_FIELDS.관리회사명] = meta.managementCompany;

    // 추가 점검범위 (multipleSelects)
    if (flatMapping['점검범위추가문구']) {
        const extraStr = flatMapping['점검범위추가문구'];
        const extraArr = [];
        if (extraStr.includes('공용분전반')) extraArr.push('각층공용분전반');
        if (extraStr.includes('MCC')) extraArr.push('기계실MCC판넬');
        if (extraArr.length > 0) quoteFields[QUOTE_FIELDS.추가점검범위] = extraArr;
    }

    // ── Step 2: 견적 생성 ────────────────────────────────────────────────────
    const result = await createQuote(quoteFields);
    console.log(`✅ 에어테이블 '견적' 테이블 신규 생성 완료: ${result.id} (${result.quoteUniqueId})`);

    return {
        customerId,
        quoteId: result.id,
        quoteUniqueId: result.quoteUniqueId,
        baseId: BASE_ID
    };
}

module.exports = { syncToAirtable };
