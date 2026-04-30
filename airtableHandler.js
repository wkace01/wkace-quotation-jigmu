// node 24 버전에 내장된 전역 fetch를 그대로 사용합니다.
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

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

    if (cityOrCountyToken) {
        return cityOrCountyToken.slice(0, -1);
    }

    const firstToken = tokens[0] || '';
    return firstToken.slice(0, 2);
}

function normalizeTopLevelRegion(token) {
    if (!token) return '';

    if (/(특별자치도|특별시|광역시|특별자치시|도)$/.test(token)) {
        return token.slice(0, 2);
    }

    return token;
}

function extractAddressSummary(address) {
    if (!address) return '';

    const normalized = String(address).trim();
    if (!normalized) return '';

    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return '';

    const topLevel = normalizeTopLevelRegion(tokens[0]);
    const cityCountyDistrict = tokens.find((token, index) => index > 0 && /[시군구]$/.test(token));

    if (topLevel && cityCountyDistrict) {
        return `${topLevel} ${cityCountyDistrict}`;
    }

    return topLevel || '';
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

    if (tokens[0].endsWith('특별자치도')) {
        tokens[0] = tokens[0].slice(0, 2);
    }

    return tokens.join(' ');
}

// 1. 기존 고객 찾기 (건물명 + 도로명 주소 매칭)
async function findCustomer(buildingName, address) {
    if (!AIRTABLE_API_KEY || !BASE_ID) return null;
    const filter = `AND({건물명}="${buildingName}", {도로명 주소}="${address}")`;
    const url = `https://api.airtable.com/v0/${BASE_ID}/고객?filterByFormula=${encodeURIComponent(filter)}&maxRecords=1`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) throw new Error('Airtable 고객 검색 실패: ' + await res.text());
    const data = await res.json();
    return data.records.length > 0 ? data.records[0].id : null;
}

// 2. 신규 고객 생성
async function createCustomer(fields) {
    if (!AIRTABLE_API_KEY || !BASE_ID) throw new Error("Airtable Configuration Missing");
    
    // 빈 필드 제거
    Object.keys(fields).forEach(key => {
        if (fields[key] === null || fields[key] === undefined || fields[key] === '') {
            delete fields[key];
        }
    });

    const url = `https://api.airtable.com/v0/${BASE_ID}/고객`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    if (!res.ok) throw new Error('Airtable 고객 생성 실패: ' + await res.text());
    const data = await res.json();
    return data.records[0].id;
}

// 2-1. 기존 고객 정보 업데이트
async function updateCustomer(recordId, fields) {
    if (!AIRTABLE_API_KEY || !BASE_ID) throw new Error("Airtable Configuration Missing");
    
    // 빈 필드 제거 (업데이트 시에도 빈 값은 전송하지 않음)
    Object.keys(fields).forEach(key => {
        if (fields[key] === null || fields[key] === undefined || fields[key] === '') {
            delete fields[key];
        }
    });

    const url = `https://api.airtable.com/v0/${BASE_ID}/고객`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ id: recordId, fields }], typecast: true })
    });
    if (!res.ok) throw new Error('Airtable 고객 수정 실패: ' + await res.text());
    const data = await res.json();
    return data.records[0].id;
}

// 3. 신규 견적 생성
async function createQuote(fields) {
    if (!AIRTABLE_API_KEY || !BASE_ID) throw new Error("Airtable Configuration Missing");

    // 빈 필드 제거
    Object.keys(fields).forEach(key => {
        if (fields[key] === null || fields[key] === undefined || fields[key] === '') {
            delete fields[key];
        }
    });

    const url = `https://api.airtable.com/v0/${BASE_ID}/견적`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    if (!res.ok) throw new Error('Airtable 견적 생성 실패: ' + await res.text());
    const data = await res.json();
    const record = data.records[0];
    return {
        id: record.id,
        quoteUniqueId: record.fields['견적 고유 ID'] || record.id // 수식 필드가 없을 경우 레코드 ID를 대안으로 사용
    };
}

// 메인 파이프라인 함수: JSON 데이터(mapping) -> Airtable 저장 로직
async function syncToAirtable(data) {
    if (!AIRTABLE_API_KEY || !BASE_ID) {
        console.warn("⚠️ 에어테이블 연동 생략: 환경변수 AIRTABLE_API_KEY 또는 AIRTABLE_BASE_ID 가 없습니다.");
        return null;
    }

    const flatMapping = {};
    for (const sheetValues of Object.values(data)) {
        if (Array.isArray(sheetValues)) {
            for (const item of sheetValues) {
                if (item.name && item.value !== "") {
                    flatMapping[item.name] = item.value;
                }
            }
        }
    }

    const buildingName = flatMapping["고객명"] || '';
    const rawRoadAddress = flatMapping["도로명주소"] || flatMapping["현장주소"] || '';
    const rawJibunAddress = flatMapping["지번주소"] || '';
    const roadAddress = normalizeRoadAddress(rawRoadAddress);
    const jibunAddress = normalizeRoadAddress(rawJibunAddress);
    const zonecode = String(flatMapping["우편번호"] || '').trim();
    const regionName = extractRegionPrefix(roadAddress);
    const addressSummary = extractAddressSummary(roadAddress);

    // 고객 테이블 매핑
    const customerFields = {
        "지역명": regionName,
        "건물명": buildingName,
        "주소": addressSummary,
        "도로명 주소": roadAddress,
        "지번 주소": jibunAddress,
        "우편번호": zonecode,
        "거래처 담당자": flatMapping["담당자명"] || '',
        "거래처 담당자 직함": flatMapping["담당자 직함"] || '',
        "거래처 연락처": flatMapping["거래처 연락처"] || '',
        "거래처 담당자 휴대전화": flatMapping["담당자 휴대전화"] || '',
        "거래처 담당자 이메일": flatMapping["담당자 이메일"] || '',
        "정전/무정전": flatMapping["정전여부"] || '',
        "점검횟수": parseNumber(flatMapping["점검횟수"]),
        "수전": parseNumber(flatMapping["수전용량"]),
        "발전": parseNumber(flatMapping["발전용량"]),
        "태양광": parseNumber(flatMapping["태양광용량"]),
        "연료전지": parseNumber(flatMapping["기타용량"]), // 사용자 피드백 적용
        "고객 메모": flatMapping["특이사항"] || '',
    };
    
    // 점검범위 (고객 테이블 Multiple Selects 변환: "전기실", "EPS")
    if (flatMapping["점검범위"]) {
        const scopeStr = flatMapping["점검범위"];
        const scopeArr = [];
        if (scopeStr.includes("배전반") || scopeStr.includes("전기실")) scopeArr.push("전기실");
        if (scopeStr.includes("EPS")) scopeArr.push("EPS");
        if (scopeArr.length > 0) customerFields["범위"] = scopeArr;
    }

    // Step 1: 중복 고객 처리 (건물명 및 주소 비교)
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

    // 견적일자 포맷팅 ('2026년 4월 4일' -> '2026-04-04')
    let dateStr = null;
    if (flatMapping["견적일"]) {
        const dateMatch = flatMapping["견적일"].match(/(\d+)년\s*(\d+)월\s*(\d+)일/);
        if (dateMatch) {
            dateStr = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
        }
    }

    // 견적 테이블 매핑
    const monthlyInspectionCount = normalizeMonthlyInspectionCount(flatMapping["월차점검"]);
    const quoteFields = {
        "고객 고유 ID": [customerId],
        "견적서 발송일": dateStr,
        "영업 담당자": flatMapping["영업담당자"] || '',
        "월차점검 횟수": monthlyInspectionCount,
        "월차점검": parseNumber(flatMapping["월차유지관리비"]),
        "저압설비": parseNumber(flatMapping["저압점검"]),
        "고압설비": parseNumber(flatMapping["고압점검"]),
        "발전설비": parseNumber(flatMapping["발전점검"]),
        "열화상측정": parseNumber(flatMapping["열화상측정"]),
        "품질분석": parseNumber(flatMapping["품질분석"]),
        "보고서작성": parseNumber(flatMapping["보고서작성"]),
        "태양광 발전설비": parseNumber(flatMapping["태양광발전설비"])
    };

    // 점검범위추가문구 (견적 테이블 Multiple Selects 변환: "각층공용분전반", "기계실MCC판넬")
    if (flatMapping["점검범위추가문구"]) {
        const extraStr = flatMapping["점검범위추가문구"];
        const extraArr = [];
        if (extraStr.includes("공용분전반")) extraArr.push("각층공용분전반");
        if (extraStr.includes("MCC")) extraArr.push("기계실MCC판넬");
        if (extraArr.length > 0) quoteFields["추가 점검범위"] = extraArr;
    }

    // Step 2: 신규 견적 생성
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
