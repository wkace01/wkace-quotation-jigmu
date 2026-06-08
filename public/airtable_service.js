/**
 * Airtable Integration Service for 직무고시 Quotation Automation (Proxy-Only Version)
 * All sensitive requests go through /airtable-proxy on the server.
 *
 * ※ 필드 키는 모두 Field ID(fldXXX) 기반으로 매핑 (필드명 변경에 무관)
 * ※ BASE_ID: appBAhIIrG3WhM1c1 (전기사업부(직무고시) DB)
 */

const AIRTABLE_CONFIG = {
    BASE_ID: 'appBAhIIrG3WhM1c1',
    TABLE_CUSTOMER:  'tblyf3MAxBaEQCC26', // 고객
    TABLE_QUOTATION: 'tblx4lwYB78EMaLe3',  // 견적
};

// ── 고객 테이블 필드 ID ──────────────────────────────────────────────────────
const CUSTOMER_FIELDS = {
    고객고유ID:       'fldjg5XxFE70a8Qu1',  // primary (formula, read-only)
    건물명:           'fldDbxCW6kw8XdAWp',
    건물명_카카오:    'fld1m8AZx50IfvQBu',
    도로명주소:       'fld1s0uYPU54n5j6q',
    지번주소:         'flde4BAWi8vrtAdjm',
    우편번호:         'fldneW7Lk3QsoECVd',
    지역명:           'fld2etpKwV42tGVoU',  // singleSelect (typecast으로 자동 생성)
    대표주용도:       'fldTTA9Dx3u3eo35B',  // singleSelect — 핵심 중복 체크 기준
    담당자:           'fldMIf0pW8NViFqtA',
    담당자직함:       'fldkeV9f9HQu4tCNZ',
    전화번호:         'fld1jcJWfrRad1NDn',
    휴대전화:         'fld53ADiKOuLV2EUb',
    이메일:           'fld0RnmYueu25EaZs',
};

// ── 견적 테이블 필드 ID ──────────────────────────────────────────────────────
const QUOTATION_FIELDS = {
    고객고유ID:     'fldzDc9SChlRML2Xd',  // multipleRecordLinks
    견적서발송일:   'fldWgroXnHKgo4fKN',
    관리회사명:     'fldJ4UxVHEkHNNHK6',  // singleSelect
    영업담당자:     'fldxUs3eNuAWk3ePy',
    추가점검범위:   'fld56edPkGk9Pxx4E',  // multipleSelects (배전반/EPS)
    월차점검횟수:   'fldPxLTvOySAE9rKm',  // singleSelect (8회~12회)
    월차점검:       'fldyPgXVmEjWSn2CQ',  // currency
    저압설비:       'fldcqo7EJ3Tf61dVJ',  // currency
    고압설비:       'fldmwNNGlNRoIpBgH',  // currency
    발전설비:       'fldRfoQFtzotpY8PU',  // currency
    열화상측정:     'fldPyLabnAQKegxN5',  // currency
    품질분석:       'fldyyxrOFNZMIsU8p',  // currency
    보고서작성:     'fld9UGeEzwA2viBiR',  // currency
    태양광발전설비: 'fldtd7yxHzN9M7CxE',  // currency
    견적금액:       'fldfQmqwco2liExSm',  // formula (read-only)
};

// 백엔드 서버 URL 설정
const BACKEND_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : '';

const PROXY_URL = `${BACKEND_URL}/airtable-proxy`;

// ── 동시 저장 안정화 유틸 ──────────────────────────────────────────────────

const CUSTOMER_RECHECK_DELAY_MS = 400;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function buildCustomerFormula(targetAddress, representativePurpose) {
    const normAddr    = targetAddress.replace(/\s/g, '').replace(/'/g, "\\'");
    const normPurpose = (representativePurpose || '').replace(/'/g, "\\'");
    return `AND(SUBSTITUTE({${CUSTOMER_FIELDS.도로명주소}}, ' ', '')='${normAddr}',{${CUSTOMER_FIELDS.대표주용도}}='${normPurpose}')`;
}

// 신규 고객 생성 직전: 동일 주소에 이미 다른 고객이 있으면 건물명에 (대표주용도) 접미사 추가
async function applyBuildingNameSuffix(fields, targetAddress, representativePurpose, displayBuildingName) {
    if (!displayBuildingName) return;
    const normAddr = targetAddress.replace(/\s/g, '').replace(/'/g, "\\'");
    const addrOnlyFormula = `SUBSTITUTE({${CUSTOMER_FIELDS.도로명주소}}, ' ', '')='${normAddr}'`;
    const existing = await findCustomerRecords(addrOnlyFormula);
    if (existing.length > 0) {
        fields[CUSTOMER_FIELDS.건물명] = `${displayBuildingName}(${representativePurpose || '기타'})`;
    }
}

function sortCustomerRecords(records) {
    return [...(records || [])].sort((a, b) => {
        const aTime = a.createdTime ? new Date(a.createdTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.createdTime ? new Date(b.createdTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
    });
}

async function fetchAirtableWithRetry(url, options = {}, retryStatuses = [429, 500, 502, 503, 504]) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(url, options);
            if (!retryStatuses.includes(response.status) || attempt === 3) {
                return response;
            }
            lastError = new Error(`HTTP ${response.status}`);
        } catch (err) {
            lastError = err;
            if (attempt === 3) throw err;
        }
        await delay(300 * Math.pow(2, attempt - 1));
    }
    throw lastError;
}

async function findCustomerRecords(formula) {
    const searchUrl = `${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_CUSTOMER}?filterByFormula=${encodeURIComponent(formula)}&returnFieldsByFieldId=true`;
    const response = await fetchAirtableWithRetry(searchUrl, {}, [429, 500, 502, 503, 504]);
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`고객 조회 실패 (${response.status}): ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(`Airtable 오류: ${data.error.message || JSON.stringify(data.error)}`);
    return sortCustomerRecords(data.records || []);
}

async function patchCustomerRecord(recordId, patchFields) {
    const patchRes = await fetchAirtableWithRetry(
        `${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_CUSTOMER}/${recordId}`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: patchFields, typecast: true })
        },
        [429, 500, 502, 503, 504]
    );
    if (!patchRes.ok) {
        const patchErr = await patchRes.json().catch(() => ({}));
        throw new Error(`고객 정보 업데이트 실패 (${patchRes.status}): ${patchErr.error?.message || ''}`);
    }
    return recordId;
}

async function createCustomerRecord(fields) {
    // POST는 429만 재시도 — 5xx 재시도 시 중복 고객 생성 위험
    const createRes = await fetchAirtableWithRetry(
        `${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_CUSTOMER}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields, typecast: true })
        },
        [429]
    );
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok || createData.error) {
        throw new Error(createData.error?.message || createData.error || `고객 생성 실패 (${createRes.status})`);
    }
    return createData.id;
}

// ──────────────────────────────────────────────────────────────────────────

window.airtableService = {
    /**
     * 1. 고객 저장/수정, 견적 기록 통합 실행
     */
    saveQuotation: async (state) => {
        try {
            console.log('[Airtable] Starting save process...');

            const customerId = await window.airtableService.upsertCustomer(state);

            // 레이트 리밋 방지
            await new Promise(resolve => setTimeout(resolve, 350));

            const quotationResult = await window.airtableService.createQuotation(customerId, state);
            const quotationId = quotationResult.id;

            return { success: true, customerId, quotationId };
        } catch (error) {
            console.error('[Airtable] Overall process error:', error);
            throw error;
        }
    },

    /**
     * 2. 시/군 단위 지역 추출
     */
    extractRegion: (address) => {
        if (!address) return '';
        const parts = address.split(' ');
        if (parts.length < 1) return '';
        const first = parts[0];

        const metroMap = {
            '서울특별시': '서울', '인천광역시': '인천', '부산광역시': '부산', '대구광역시': '대구',
            '대전광역시': '대전', '광주광역시': '광주', '울산광역시': '울산', '세종특별자치시': '세종',
            '세종시': '세종'
        };
        if (metroMap[first]) return metroMap[first];

        const shortMetros = ['서울', '인천', '부산', '대구', '대전', '광주', '울산', '세종'];
        for (const m of shortMetros) {
            if (first.startsWith(m)) return m;
        }

        if (parts.length > 1) {
            return parts[1].replace(/[시군]$/, '');
        }

        return first.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '');
    },

    /**
     * 3. 고객 정보 Upsert
     *
     * 중복 완화:
     *   1차 조회 → 없으면 400ms 대기 후 재조회 → 그래도 없으면 POST
     *   POST 직후 재조회하여 중복 후보 감지 시 경고 로그
     */
    upsertCustomer: async (state) => {
        const {
            address, roadAddress, buildingName,
            manager, managerPhone, managerPosition, managerMobile, managerEmail,
            jibunAddress, zonecode, representativePurpose, duplicateCheckChoice
        } = state;

        const targetAddress = roadAddress || address;

        const displayBuildingName = state.customerName || buildingName || '';
        const kakaoBuildingName   = buildingName || '';

        const formula = buildCustomerFormula(targetAddress, representativePurpose);

        // 연락처 자동 분류
        let finalPhone  = managerPhone  || '';
        let finalMobile = managerMobile || '';

        if (finalPhone && finalPhone.startsWith('010') && !finalMobile) {
            finalMobile = finalPhone;
            finalPhone  = '';
        } else if (finalMobile && !finalMobile.startsWith('010') && !finalPhone) {
            finalPhone  = finalMobile;
            finalMobile = '';
        }

        const fields = {
            [CUSTOMER_FIELDS.건물명]:        displayBuildingName,
            [CUSTOMER_FIELDS.건물명_카카오]: kakaoBuildingName,
            [CUSTOMER_FIELDS.도로명주소]:    targetAddress,
            [CUSTOMER_FIELDS.지번주소]:      jibunAddress || '',
            [CUSTOMER_FIELDS.우편번호]:      zonecode     || '',
            [CUSTOMER_FIELDS.지역명]:        window.airtableService.extractRegion(targetAddress),
            [CUSTOMER_FIELDS.대표주용도]:    representativePurpose || '조회불가',
            [CUSTOMER_FIELDS.담당자]:        manager          || '',
            [CUSTOMER_FIELDS.담당자직함]:    managerPosition  || '',
            [CUSTOMER_FIELDS.전화번호]:      finalPhone,
            [CUSTOMER_FIELDS.휴대전화]:      finalMobile,
            [CUSTOMER_FIELDS.이메일]:        managerEmail || '',
        };

        // PATCH용: 빈 값 필드 제외 (기존 데이터 보호)
        const patchFields = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => {
                if (v === null || v === undefined) return false;
                if (typeof v === 'string' && v.trim() === '') return false;
                if (Array.isArray(v)      && v.length === 0)  return false;
                return true;
            })
        );

        // ── 1차 조회 ──────────────────────────────────────────────────────
        const initialRecords = await findCustomerRecords(formula);
        if (initialRecords.length > 0) {
            if (initialRecords.length > 1) {
                console.warn(`[Airtable] 중복 고객 후보 ${initialRecords.length}건 감지: ${targetAddress}`);
            }
            if (duplicateCheckChoice === 'new') {
                await applyBuildingNameSuffix(fields, targetAddress, representativePurpose, displayBuildingName);
                return await createCustomerRecord(fields);
            }
            return await patchCustomerRecord(initialRecords[0].id, patchFields);
        }

        // ── 경합 완화: 생성 직전 재조회 ──────────────────────────────────
        await delay(CUSTOMER_RECHECK_DELAY_MS);
        const preCreateRecords = await findCustomerRecords(formula);
        if (preCreateRecords.length > 0) {
            if (preCreateRecords.length > 1) {
                console.warn(`[Airtable] 생성 직전 중복 고객 후보 ${preCreateRecords.length}건 감지: ${targetAddress}`);
            }
            return await patchCustomerRecord(preCreateRecords[0].id, patchFields);
        }

        // ── 신규 생성 ─────────────────────────────────────────────────────
        await applyBuildingNameSuffix(fields, targetAddress, representativePurpose, displayBuildingName);
        const createdRecordId = await createCustomerRecord(fields);

        // ── 생성 직후 중복 후보 감지 (로그만) ────────────────────────────
        const postCreateRecords = await findCustomerRecords(formula);
        if (postCreateRecords.length > 1) {
            const canonicalRecordId = postCreateRecords[0].id;
            console.warn(
                `[Airtable] 고객 생성 후 중복 후보 ${postCreateRecords.length}건 감지: ` +
                `${targetAddress}. 대표=${canonicalRecordId}, 생성=${createdRecordId}`
            );
            return canonicalRecordId;
        }

        return createdRecordId;
    },

    /**
     * 4. 견적 기록 생성
     */
    createQuotation: async (customerId, state) => {
        const {
            results, salesManager, managementCompany,
            inspectionScope, monthlyApplicable, monthlyCount,
            quotationDate
        } = state;

        const c = results?.costs || {};
        const today     = new Date().toISOString().split('T')[0];
        const quoteDate = quotationDate || today;

        // 점검 범위 → 추가 점검범위 multipleSelects 매핑
        const scopeOptions = inspectionScope === '배전반+EPS'
            ? ['수전실 내 배전반', '각층공용분전반', '기계실MCC판넬']
            : ['수전실 내 배전반'];

        const fields = {
            [QUOTATION_FIELDS.고객고유ID]:   [customerId],
            [QUOTATION_FIELDS.견적서발송일]: quoteDate,
            [QUOTATION_FIELDS.추가점검범위]: scopeOptions,
            // 개별 비용 필드 (견적 금액은 formula로 자동 합산)
            [QUOTATION_FIELDS.저압설비]:     c.lowVoltage   || 0,
            [QUOTATION_FIELDS.고압설비]:     c.highVoltage  || 0,
            [QUOTATION_FIELDS.발전설비]:     c.generator    || 0,
            [QUOTATION_FIELDS.열화상측정]:   c.thermal      || 0,
            [QUOTATION_FIELDS.품질분석]:     c.powerQuality || 0,
            [QUOTATION_FIELDS.보고서작성]:   c.report       || 0,
            [QUOTATION_FIELDS.태양광발전설비]: c.solarPanel  || 0,
        };

        // 월차점검: 해당있음인 경우만 비용·횟수 저장
        if (monthlyApplicable === '있음') {
            fields[QUOTATION_FIELDS.월차점검]   = c.monthly || 0;
            fields[QUOTATION_FIELDS.월차점검횟수] = `${monthlyCount || 8}회`;
        }

        // 영업 담당자: null 전송 금지
        if (salesManager) fields[QUOTATION_FIELDS.영업담당자] = salesManager;
        // 관리회사명: 값 있을 때만 (typecast:true로 신규 옵션 자동 생성)
        if (managementCompany) fields[QUOTATION_FIELDS.관리회사명] = managementCompany;

        const quotationUrl = `${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_QUOTATION}`;
        const makePostOptions = (f) => ({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: f, typecast: true })
        });

        // POST는 429만 재시도 — 5xx 재시도 시 중복 견적 생성 위험
        let response = await fetchAirtableWithRetry(quotationUrl, makePostOptions(fields), [429]);

        // 422 + 영업담당자 포함 → 담당자 제외 후 1회 재시도
        if (response.status === 422 && QUOTATION_FIELDS.영업담당자 in fields) {
            const { [QUOTATION_FIELDS.영업담당자]: _dropped, ...fallbackFields } = fields;
            response = await fetchAirtableWithRetry(quotationUrl, makePostOptions(fallbackFields), [429]);
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = err.error?.message || err.error || JSON.stringify(err);
            throw new Error(`견적 저장 실패 (HTTP ${response.status}): ${msg}`);
        }

        return await response.json();
    },
};

// 중복 고객 사전 체크 — goToStep(3) 에서 호출
window.airtableService.checkDuplicateCustomer = async (address, representativePurpose) => {
    if (!address || !representativePurpose) return null;
    const formula  = buildCustomerFormula(address, representativePurpose);
    const records  = await findCustomerRecords(formula);
    return records.length > 0 ? records[0] : null;
};

// 고객 고유 ID로 견적 이력 직접 조회
async function fetchCustomerQuotations(customerUniqueId) {
    if (!customerUniqueId) return [];
    const QF = {
        고객고유ID:   QUOTATION_FIELDS.고객고유ID,    // multipleRecordLinks
        발송일:       QUOTATION_FIELDS.견적서발송일,
        견적금액:     QUOTATION_FIELDS.견적금액,      // formula (readable)
        영업담당자:   QUOTATION_FIELDS.영업담당자,
        점검범위:     QUOTATION_FIELDS.추가점검범위,
        월차횟수:     QUOTATION_FIELDS.월차점검횟수,
    };
    try {
        const qFormula = encodeURIComponent(`{${QF.고객고유ID}}='${customerUniqueId.replace(/'/g, "\\'")}'`);
        const qUrl = `${PROXY_URL}/${AIRTABLE_CONFIG.BASE_ID}/${AIRTABLE_CONFIG.TABLE_QUOTATION}`
            + `?filterByFormula=${qFormula}`
            + `&sort[0][field]=${QF.발송일}&sort[0][direction]=desc`
            + `&maxRecords=10&returnFieldsByFieldId=true`;
        const res = await fetch(qUrl);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.records || []).map(r => {
            const f = r.fields;
            return {
                date:         f[QF.발송일]      || '',
                serviceTypes: f[QF.점검범위]    || [],
                totalAmount:  Number(f[QF.견적금액] || 0),
                salesManager: typeof f[QF.영업담당자] === 'string' ? f[QF.영업담당자] : '',
                maintFreq:    f[QF.월차횟수]    || '',
                appFreq:      '',
            };
        });
    } catch (e) {
        console.warn('[DupModal] 견적 이력 조회 오류:', e.message);
        return [];
    }
}

// 중복 고객 팝업 — ESC/닫기 버튼 지원, 고객 이력 표시
window.showDuplicateCustomerModal = function(existingRecord, representativePurpose) {
    return new Promise((resolve) => {
        const buildingName     = existingRecord.fields?.[CUSTOMER_FIELDS.건물명] || '(건물명 없음)';
        const customerUniqueId = existingRecord.fields?.[CUSTOMER_FIELDS.고객고유ID] || '';

        document.getElementById('dup-customer-name').textContent = buildingName;
        const purposeLabel = document.getElementById('dup-purpose-label');
        if (purposeLabel) purposeLabel.textContent = representativePurpose || '동일 용도';

        const historyEl = document.getElementById('dup-history-list');
        if (historyEl) historyEl.innerHTML = '<p style="font-size:0.8rem;color:var(--toss-text-sub);margin:0;">이력 조회 중...</p>';

        const modal = document.getElementById('modal-duplicate-customer');
        modal.style.display = 'flex';

        if (historyEl && customerUniqueId) {
            fetchCustomerQuotations(customerUniqueId).then(records => {
                if (!records.length) {
                    historyEl.innerHTML = '<p style="font-size:0.8rem;color:var(--toss-text-sub);margin:0;">발송된 견적이 없습니다.</p>';
                    return;
                }
                historyEl.innerHTML = records.map(r => {
                    const scopeTags = (r.serviceTypes || []).map(s =>
                        `<span class="ch-tag">${escapeHtml(s)}</span>`
                    ).join('');
                    const amtTxt  = r.totalAmount > 0 ? r.totalAmount.toLocaleString() + '원' : '-';
                    const freqTxt = r.maintFreq ? `월차 ${escapeHtml(r.maintFreq)}` : '';
                    const subParts = [
                        r.salesManager ? `담당: ${escapeHtml(r.salesManager)}` : '',
                        freqTxt,
                    ].filter(Boolean).join(' · ');
                    return `
                    <div class="ch-record">
                        <div class="ch-record-top">
                            <span class="ch-record-date">${escapeHtml(r.date || '-')}</span>
                            <span class="ch-record-amount">${amtTxt}</span>
                        </div>
                        ${scopeTags ? `<div class="ch-tags">${scopeTags}</div>`        : ''}
                        ${subParts  ? `<div class="ch-record-sub">${subParts}</div>`  : ''}
                    </div>`;
                }).join('');
            });
        }

        function closeModal(choice) {
            modal.style.display = 'none';
            document.removeEventListener('keydown', onEsc);
            resolve(choice);
        }

        function onEsc(e) { if (e.key === 'Escape') closeModal('cancel'); }
        document.addEventListener('keydown', onEsc);

        document.getElementById('btn-dup-close').onclick        = () => closeModal('cancel');
        document.getElementById('btn-dup-use-existing').onclick = () => closeModal('existing');
        document.getElementById('btn-dup-create-new').onclick   = () => closeModal('new');
    });
};
