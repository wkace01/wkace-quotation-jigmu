// ---- Master Data (Linked from constants.js) ----
const {
    JIGMU_BASE_PRICES,
    SALES_MANAGERS,
    REPRESENTATIVE_PURPOSE_MAP,
    REPRESENTATIVE_PURPOSE_OPTIONS
} = window.CONSTANTS;

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function mapToRepresentativePurpose(rawPurpose) {
    if (!rawPurpose) return '조회불가';
    const key = Object.keys(REPRESENTATIVE_PURPOSE_MAP).find(k => rawPurpose.includes(k));
    return key ? REPRESENTATIVE_PURPOSE_MAP[key] : '기타';
}

// ---- State ----
const state = {
    customerName: "",
    capReceiving: 0,
    capGeneration: 0,
    capSolar: 0,
    capOther: 0,
    estimateDate: "", // 견적일
    specialNote: "",  // 특이사항 입력
    address: "",      // UI 표시용 (참고용)
    addressDetail: "", // 상세 주소 직접 입력분
    roadAddress: "",  // 에어테이블 저장용 (표준 도로명)
    buildingName: "",
    jibunAddress: "",
    zonecode: "",
    manager: "",
    managerPhone: "",
    managerPosition: "",
    managerMobile: "",
    managerEmail: "",
    salesManager: "",
    salesManagerPhone: "",
    managementCompany: "",
    selectedEquipments: new Set(),
    condOverride: {},         // 사용자가 수정한 조건표 값 { key: value }
    itemToggles: {
        lowVoltage: true,
        highVoltage: true,
        generator: true,
        thermal: true,
        powerQuality: true,
        report: true,
        solarPanel: true,
        monthly: true
    },
    discount: 0, // 할인율 (%)
    // 점검 조건 옵션
    powerOutage: '무정전',      // '정전' | '무정전'
    inspectionCount: 1,       // 1 ~ 4 (점검횟수)
    monthlyApplicable: '없음', // '없음' | '있음'
    monthlyCount: 8,           // 8 | 12 (월차 연간 횟수)
    inspectionScope: '배전반',   // '배전반' | '배전반+EPS'
    representativePurpose: "",
    representativePurposeManuallyChanged: false,
    duplicateCheckChoice: null,
    skipAirtable: false,
    selectedTemplate: '직무고시 견적서 양식.xlsx',
    results: {
        totalCapacity: 0,
        costs: { lowVoltage: 0, highVoltage: 0, generator: 0, thermal: 0, powerQuality: 0, report: 0, solarPanel: 0, monthly: 0, yearlyTotal: 0 }
    }
};

// ---- Calculation ----
function calculate() {
    const totalCap = (state.capReceiving || 0) + (state.capGeneration || 0) + (state.capSolar || 0) + (state.capOther || 0);
    state.results.totalCapacity = totalCap;

    const eff = getEffectiveCond();

    state.results.costs.lowVoltage = eff.lowVoltage;
    state.results.costs.highVoltage = eff.highVoltage;
    state.results.costs.generator = eff.generator;
    state.results.costs.thermal = eff.thermal;
    state.results.costs.powerQuality = eff.powerQuality;
    state.results.costs.report = eff.report;
    state.results.costs.solarPanel = eff.solarPanel;
    // 월차점검비 = 회당 단가 × 연간 점검 횟수 (해당있음 시), 없음이면 0
    state.results.costs.monthly = state.monthlyApplicable === '있음'
        ? (eff.monthly || 0) * (state.monthlyCount || 8)
        : 0;

    const subtotal = eff.lowVoltage + eff.highVoltage + eff.generator + eff.thermal + eff.powerQuality + eff.report + eff.solarPanel;
    const discountAmount = Math.round(subtotal * (state.discount / 100));
    state.results.costs.yearlyTotal = subtotal - discountAmount;

    updateConditionPanel(eff);
    updateUI();
}

// ―― Condition Panel (직무고시 버전) ――

function getEffectiveCond() {
    // JIGMU_BASE_PRICES를 기본값으로, condOverride가 있으면 사용자 값 사용
    // itemToggles[key]가 false면 해당 항목 0으로 처리
    const bp = window.CONSTANTS.JIGMU_BASE_PRICES;
    const ov = state.condOverride;
    const tog = state.itemToggles;

    return {
        lowVoltage:  tog.lowVoltage  ? (ov.lowVoltage  ?? bp.lowVoltage)  : 0,
        highVoltage: tog.highVoltage ? (ov.highVoltage ?? bp.highVoltage) : 0,
        generator:   tog.generator   ? (ov.generator   ?? bp.generator)   : 0,
        thermal:     tog.thermal     ? (ov.thermal     ?? bp.thermal)     : 0,
        powerQuality:tog.powerQuality? (ov.powerQuality?? bp.powerQuality): 0,
        report:      tog.report      ? (ov.report      ?? bp.report)      : 0,
        solarPanel:  tog.solarPanel  ? (ov.solarPanel  ?? bp.solarPanel)  : 0,
        monthly:     tog.monthly     ? (ov.monthly     ?? bp.monthly)     : 0,
    };
}

function updateConditionPanel(eff) {
    const panel = document.getElementById('card-condition');
    if (!panel) return;

    const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

    // 패널 표시
    panel.style.display = 'block';

    // 직무고시 단가 inputs 채우기
    const inputs = [
        { id: 'cond-low-voltage',   val: fmt(eff.lowVoltage) },
        { id: 'cond-high-voltage',  val: fmt(eff.highVoltage) },
        { id: 'cond-generator',     val: fmt(eff.generator) },
        { id: 'cond-thermal',       val: fmt(eff.thermal) },
        { id: 'cond-power-quality', val: fmt(eff.powerQuality) },
        { id: 'cond-report',        val: fmt(eff.report) },
        { id: 'cond-solar-panel',   val: fmt(eff.solarPanel) },
        { id: 'cond-monthly',       val: fmt(eff.monthly) },
    ];

    inputs.forEach(item => {
        const el = document.getElementById(item.id);
        if (el && document.activeElement !== el) {
            el.value = item.val;
        }
    });

    document.getElementById('cond-discount-display').textContent = state.discount + '%';

    // 합계 표시
    const yearlySubtotal = eff.lowVoltage + eff.highVoltage + eff.generator + eff.thermal + eff.powerQuality + eff.report + eff.solarPanel;
    const discountAmount = Math.round(yearlySubtotal * (state.discount / 100));
    const yearlyTotal = yearlySubtotal - discountAmount;
    document.getElementById('cond-yearly-total').textContent = fmt(yearlyTotal) + '원';
    document.getElementById('cond-monthly-total').textContent = fmt(state.results.costs.monthly) + '원';

    // 수정된 필드 하이라이트 처리
    ['low-voltage', 'high-voltage', 'generator', 'thermal', 'power-quality', 'report', 'solar-panel', 'monthly'].forEach(key => {
        const el = document.getElementById('cond-' + key);
        if (!el) return;
        const stateKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (state.condOverride[stateKey] !== undefined) {
            el.style.background = '#fef3c7';
            el.style.borderColor = '#f59e0b';
        } else {
            el.style.background = '';
            el.style.borderColor = '#d1d5db';
        }
    });

    // Toggle 아이콘 및 행 상태 업데이트
    document.querySelectorAll('.btn-toggle-item').forEach(btn => {
        const item = btn.dataset.item;
        const isActive = state.itemToggles[item];
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = isActive ? 'fas fa-minus-circle' : 'fas fa-plus-circle';
        }
    });

    document.querySelectorAll('.cond-row[data-row-item]').forEach(row => {
        const item = row.dataset.rowItem;
        if (state.itemToggles[item] !== false) {
            row.classList.remove('item-disabled');
        } else {
            row.classList.add('item-disabled');
        }
    });
}

// ---- UI Rendering (직무고시 버전) ----
function updateUI() {
    const hasData = !!(state.address || state.customerName);

    document.getElementById('card-summary').style.display = (hasData && currentStep >= 2) ? 'block' : 'none';
    document.getElementById('card-detail').style.display = hasData ? 'block' : 'none';

    // Right Panel Elements
    const bottomActions = document.getElementById('card-bottom-actions');
    if (bottomActions && window.currentStep === 3) {
        bottomActions.style.display = 'flex';
    }

    // 우측 summary
    const totalCap = state.results.totalCapacity || 0;
    const resGrade = document.getElementById('res-grade');
    if (resGrade) resGrade.textContent = totalCap > 0 ? totalCap.toLocaleString() + ' kW' : '-';

    const resYearly = document.getElementById('res-yearly');
    if (resYearly) resYearly.textContent = '₩ ' + (state.results.costs.yearlyTotal || 0).toLocaleString();

    const resMonthly = document.getElementById('res-monthly');
    if (resMonthly) resMonthly.textContent = '₩ ' + (state.results.costs.monthly || 0).toLocaleString();

    renderTabs();
}

// ---- renderTabs (직무고시 버전) ----
function renderTabs() {
    const fmt = n => Math.round(n).toLocaleString('ko-KR');
    const c = state.results.costs;
    const totalCap = state.results.totalCapacity || 0;

    // 연차 성능점검 소계 및 할인 계산
    const yearlySubtotal = (c.lowVoltage || 0) + (c.highVoltage || 0) + (c.generator || 0) + (c.thermal || 0) + (c.powerQuality || 0) + (c.report || 0) + (c.solarPanel || 0);
    const discountRow = state.discount > 0
        ? `<tr style="color:#ef4444"><td>할인율 (${state.discount}%)</td><td>- ₩ ${fmt(Math.round(yearlySubtotal * (state.discount / 100)))}</td><td>견적 할인</td></tr>`
        : '';

    const tblTotal = document.getElementById('tbl-q-total');
    if (tblTotal) {
        tblTotal.innerHTML = `
            <tr><td>대상처명 (고객명)</td><td>${state.customerName || '-'}</td><td></td></tr>
            <tr><td>주소</td><td colspan="2">${state.address || '-'}</td></tr>
            <tr><td>총 설비용량</td><td>${totalCap > 0 ? totalCap.toLocaleString() + ' kW' : '-'}</td><td>수전+발전+태양광+기타</td></tr>
            <tr><td>담당자</td><td>${state.manager || '-'}${state.managerPosition ? ' (' + state.managerPosition + ')' : ''}</td><td>${state.managerPhone || ''}</td></tr>
            <tr style="border-top:1px solid var(--toss-border);"><td>저압 전기설비 점검</td><td>₩ ${fmt(c.lowVoltage || 0)}</td><td>${state.itemToggles.lowVoltage ? '포함' : '제외'}</td></tr>
            <tr><td>고압 전기설비 점검</td><td>₩ ${fmt(c.highVoltage || 0)}</td><td>${state.itemToggles.highVoltage ? '포함' : '제외'}</td></tr>
            <tr><td>예비발전 설비 점검</td><td>₩ ${fmt(c.generator || 0)}</td><td>${state.itemToggles.generator ? '포함' : '제외'}</td></tr>
            <tr><td>열화상 적외선측정</td><td>₩ ${fmt(c.thermal || 0)}</td><td>${state.itemToggles.thermal ? '포함' : '제외'}</td></tr>
            <tr><td>전원 품질분석</td><td>₩ ${fmt(c.powerQuality || 0)}</td><td>${state.itemToggles.powerQuality ? '포함' : '제외'}</td></tr>
            <tr><td>기록 및 보고서 작성</td><td>₩ ${fmt(c.report || 0)}</td><td>${state.itemToggles.report ? '포함' : '제외'}</td></tr>
            <tr><td>태양광 발전설비</td><td>₩ ${fmt(c.solarPanel || 0)}</td><td>${state.itemToggles.solarPanel ? '포함' : '제외'}</td></tr>
            ${discountRow}
            <tr style="font-weight:700; color:var(--toss-blue); border-top:2px solid var(--toss-blue);"><td>직무고시(전기안전)점검 합계</td><td>₩ ${fmt(c.yearlyTotal || 0)}</td><td>부가세 별도</td></tr>
            <tr style="font-weight:600;"><td>월차 점검비용 (회당)</td><td>₩ ${fmt(c.monthly || 0)}</td><td>${state.itemToggles.monthly ? '포함' : '제외'}</td></tr>
            <tr style="border-top:1px solid var(--toss-border); color:var(--toss-text-sub); font-size:0.85rem;"><td>정전 여부</td><td colspan="2">${state.powerOutage}</td></tr>
            <tr style="color:var(--toss-text-sub); font-size:0.85rem;"><td>점검 횟수</td><td colspan="2">연 ${state.inspectionCount}회</td></tr>
            <tr style="color:var(--toss-text-sub); font-size:0.85rem;"><td>월차점검</td><td colspan="2">${state.monthlyApplicable === '있음' ? '있음 (연 ' + state.monthlyCount + '회)' : '해당없음'}</td></tr>
            <tr style="color:var(--toss-text-sub); font-size:0.85rem;"><td>점검 범위</td><td colspan="2">${state.inspectionScope === '배전반+EPS' ? '수전실 내 배전반 + EPS실' : '수전실 내 배전반'}</td></tr>
        `;
    }
}




// ---- Building Register API (ported from 건축물대장-연면적-조회-서비스) ----
// (공통 기능인 주소 검색 및 대장 조회는 common.js의 window.wkCommon.getAddressInfo, fetchBuildingRegister 사용)

let _lastBuildingResult = null; // store for apply button

async function fetchBuildingInfo() {
    const statusEl = document.getElementById('building-fetch-status');
    const panelEl = document.getElementById('building-result-panel');
    const contentEl = document.getElementById('building-result-content');
    const btn = document.getElementById('btn-fetch-building');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
    statusEl.style.display = 'block';
    statusEl.style.background = '#f0f9ff';
    statusEl.style.color = '#0369a1';
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 건축물대장 API 조회 중...';
    panelEl.style.display = 'none';

    try {
        // Kakao Postcode가 반환한 bcode(법정동코드 10자리)로 건축물대장 직접 조회
        // juso.go.kr 서버 프록시 불필요 — 브라우저(한국 IP)에서 직접 호출
        const sigunguCd = (state.bcode || '').slice(0, 5);
        const bjdongCd = (state.bcode || '').slice(5);

        // jibunAddress 에서 지번 번호 추출 (예: "서울 강남구 역삼동 123-4" → 본번 123, 부번 4)
        let bun = '', ji = '0';
        if (state.jibunAddress) {
            const m = state.jibunAddress.match(/(\d+)(?:-(\d+))?\s*$/);
            if (m) { bun = m[1]; ji = m[2] || '0'; }
        }

        if (!sigunguCd || !bun) {
            throw new Error('주소 정보가 부족합니다. 카카오 주소 검색을 다시 이용해 주세요.');
        }

        const target = await window.wkCommon.fetchBuildingRegister({ sigunguCd, bjdongCd, bun, ji });

        // 공통 반환 스키마에 맞춰 화면 매핑을 위한 형태 가공
        const sumMainArea = parseFloat(target.totArea || 0);
        const result = {
            '연면적': sumMainArea.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            '부속건축물면적': '0.00',
            '총연면적': sumMainArea.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            '주용도': target.mainPurpsCdNm || '-',
            '주용도_분포': target.mainPurpsCdNm || '-',
            '대지면적': target.platArea || '-',
            '건축면적': target.archArea || '-',
            '사용승인일': target.useAprDay || '-',
            '건축물명': target.bldNm || '-',
            '_rawMainArea': sumMainArea,
            '_rawPurpose': target.mainPurpsCdNm
        };
        _lastBuildingResult = result;

        // Render result cards
        const displayKeys = ['총연면적', '연면적', '부속건축물면적', '주용도', '대지면적', '건축면적', '사용승인일', '건축물명'];
        contentEl.innerHTML = displayKeys.map(k => `
            <div style="background:white; border:1px solid var(--border-color); border-radius:6px; padding:0.6rem 0.8rem;">
                <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">${k}</div>
                <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary)">${result[k] || '-'}</div>
            </div>
        `).join('') + `
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:0.6rem 0.8rem; grid-column:1/-1;">
                <div style="font-size:0.7rem; color:#3b82f6; margin-bottom:2px;">주용도 분포 (주건축물 기준)</div>
                <div style="font-weight:600; font-size:0.85rem; color:#1d4ed8">${result['주용도_분포'] || '-'}</div>
            </div>
        `;

        panelEl.style.display = 'block';
        statusEl.style.background = '#f0fdf4';
        statusEl.style.color = '#15803d';
        statusEl.style.textAlign = 'center';
        statusEl.innerHTML = '<span class="status-msg-pc">✅ 건축물대장 조회 성공! "✅ 이 값으로 적용" 버튼으로 값을 입력하세요.</span>' + 
                             '<span class="status-msg-mobile">✅ 건축물대장 조회 성공!<br>"✅ 이 값으로 적용" 버튼으로<br>값을 입력하세요.</span>';
    } catch (err) {
        statusEl.style.background = '#fef2f2';
        statusEl.style.color = '#b91c1c';
        statusEl.innerHTML = `❌ 오류: ${err.message}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> 건축물대장 조회';
    }
}

// ---- Kakao Address Search (on page load) ----
function initKakaoSearch() {
    window.wkCommon.initKakaoPostcode('kakao-embed-container', (roadAddr, buildingName, data) => {
        document.getElementById('address').value = roadAddr;
        if (buildingName) document.getElementById('customer-name').value = buildingName;

        state.address = roadAddr;
        state.buildingName = buildingName || '';
        state.customerName = buildingName || '';
        if (data) {
            state.roadAddress = data.roadAddress || roadAddr; // 표준 도로명 우선 저장
            state.jibunAddress = data.jibunAddress || data.autoJibunAddress || '';
            state.zonecode = data.zonecode || '';
            state.bcode = data.bcode || ''; // 법정동코드 10자리 (건축물대장 조회에 사용)
        }

        // Proceed to Step 2 automatically
        goToStep(2);

        // 고객 이력 조회 (비동기, 메인 흐름 차단 없음)
        loadCustomerHistory(state.roadAddress);

        calculate();

        // 검색 즉시 자동 조회 트리거
        setTimeout(() => document.getElementById('btn-fetch-building').click(), 500);
    });
}


document.getElementById('customer-name').addEventListener('input', (e) => {
    state.customerName = e.target.value;
    calculate();
});

// 조건표 기본값 복원 버튼
document.getElementById('btn-restore-cond').addEventListener('click', () => {
    state.condOverride = {};
    calculate();
});

// Building Register Lookup
document.getElementById('btn-fetch-building').addEventListener('click', fetchBuildingInfo);

document.getElementById('btn-apply-building').addEventListener('click', () => {
    if (!_lastBuildingResult) return;
    const bldName = _lastBuildingResult['건축물명'];

    // 직무고시: 건물명만 고객명에 반영
    if (bldName && bldName !== '-' && !state.customerName) {
        document.getElementById('customer-name').value = bldName;
        state.customerName = bldName;
    }

    // 대표 주용도 자동 설정 (사용자가 수동 변경하지 않은 경우만)
    if (!state.representativePurposeManuallyChanged) {
        const rawPurpose = _lastBuildingResult['_rawPurpose'] || '';
        const mapped = mapToRepresentativePurpose(rawPurpose);
        state.representativePurpose = mapped;
        const rpEl = document.getElementById('representative-purpose');
        if (rpEl) rpEl.value = mapped;
    }

    calculate();

    // Visual feedback
    const applyBtn = document.getElementById('btn-apply-building');
    applyBtn.textContent = '✅ 적용 완료!';
    applyBtn.style.background = '#059669';
    setTimeout(() => {
        applyBtn.innerHTML = '✅ 이 값으로 적용';
        applyBtn.style.background = '#10b981';
    }, 2000);
});

document.getElementById('manager').addEventListener('input', (e) => {
    state.manager = e.target.value;
    calculate();
});

// ---- 전화번호 자동 포맷팅 유틸 ----
function formatPhone(value) {
    // 숫자만 추출, 최대 11자리
    const digits = value.replace(/\D/g, '').slice(0, 11);
    const len = digits.length;

    if (digits.startsWith('02')) {
        // 서울 (02): 02-XXXX-XXXX 또는 02-XXX-XXXX
        if (len < 3) return digits;                                                    // 02
        if (len < 6) return digits.slice(0, 2) + '-' + digits.slice(2);               // 02-XXX
        if (len < 10) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5); // 02-XXX-XXXX
        return digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6);    // 02-XXXX-XXXX
    } else {
        // 010 / 031 등 3자리 국번
        if (len < 4) return digits;                                                    // 010
        if (len < 7) return digits.slice(0, 3) + '-' + digits.slice(3);               // 010-XXXX
        if (len < 11) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6); // 010-XXX-XXXX
        return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);    // 010-XXXX-XXXX
    }
}

const managerPhoneEl = document.getElementById('manager-phone');
if (managerPhoneEl) {
    managerPhoneEl.addEventListener('input', function () {
        const pos = this.selectionStart;             // 입력 전 커서 위치
        const before = this.value;
        const formatted = formatPhone(this.value);

        // 포맷팅 결과가 다를 때만 덮어쓰기 (그렇지 않으면 특정 환경에서 입력이 막히거나 씹히는 현상 발생)
        if (before !== formatted) {
            this.value = formatted;
            // 커서 위치 보정: 추가된 하이픈 수 만큼 앞으로 밀기
            const added = formatted.length - before.length;
            const newPos = Math.max(0, pos + added);
            this.setSelectionRange(newPos, newPos);
        }
        state.managerPhone = formatted;
    });
} else {
    console.error('[디버그] #manager-phone 요소를 찾을 수 없습니다.');
}

const managerMobileEl = document.getElementById('manager-mobile');
if (managerMobileEl) {
    managerMobileEl.addEventListener('input', function () {
        const pos = this.selectionStart;
        const before = this.value;
        const formatted = formatPhone(this.value);
        if (before !== formatted) {
            this.value = formatted;
            const added = formatted.length - before.length;
            const newPos = Math.max(0, pos + added);
            this.setSelectionRange(newPos, newPos);
        }
        state.managerMobile = formatted;
    });
}

document.getElementById('manager-position').addEventListener('input', (e) => {
    state.managerPosition = e.target.value;
    calculate();
});

document.getElementById('manager-email').addEventListener('input', (e) => {
    state.managerEmail = e.target.value;
    calculate();
});

const addressDetailEl = document.getElementById('address-detail');
if (addressDetailEl) {
    addressDetailEl.addEventListener('input', (e) => {
        state.addressDetail = e.target.value;
    });
}

const specialNoteEl = document.getElementById('special-note');
if (specialNoteEl) {
    specialNoteEl.addEventListener('input', (e) => {
        state.specialNote = e.target.value;
    });
}

// 영업 담당자 자동완성 또는 직접 입력
document.getElementById('sales-manager').addEventListener('input', (e) => {
    const enteredName = e.target.value;
    const manager = SALES_MANAGERS.find(m => m.name === enteredName);

    state.salesManager = enteredName;

    // 리스트에 존재하는 담당자라면 연락처 자동 기입
    if (manager) {
        state.salesManagerPhone = manager.phone;
        const phoneInput = document.getElementById('sales-manager-phone');
        if (phoneInput) {
            phoneInput.value = manager.phone;
        }
    }
});

// 영업 담당자 연락처 수동 입력
const smPhoneEl = document.getElementById('sales-manager-phone');
if (smPhoneEl) {
    smPhoneEl.addEventListener('input', function () {
        const pos = this.selectionStart;
        const before = this.value;
        const formatted = formatPhone(this.value);
        if (before !== formatted) {
            this.value = formatted;
            const added = formatted.length - before.length;
            const newPos = Math.max(0, pos + added);
            this.setSelectionRange(newPos, newPos);
        }
        state.salesManagerPhone = formatted;
    });
}

// 관리회사명
document.getElementById('management-company')?.addEventListener('input', (e) => {
    state.managementCompany = e.target.value;
});

// 견적일 설정 및 변경 감지
const estDateEl = document.getElementById('estimate-date');
if (estDateEl) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    estDateEl.value = `${yyyy}-${mm}-${dd}`;
    state.estimateDate = `${yyyy}년 ${parseInt(mm)}월 ${parseInt(dd)}일`;

    estDateEl.addEventListener('change', (e) => {
        const d = new Date(e.target.value);
        if(!isNaN(d.getTime())) {
            state.estimateDate = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
        } else {
            state.estimateDate = "";
        }
    });
}

// ---- Condition Table Inputs ----
const COND_INPUT_MAP = {
    'cond-low-voltage': 'lowVoltage',
    'cond-high-voltage': 'highVoltage',
    'cond-generator': 'generator',
    'cond-thermal': 'thermal',
    'cond-power-quality': 'powerQuality',
    'cond-report': 'report',
    'cond-solar-panel': 'solarPanel',
    'cond-monthly': 'monthly',
};
const COST_FIELDS = new Set(Object.keys(COND_INPUT_MAP));

Object.entries(COND_INPUT_MAP).forEach(([elId, stateKey]) => {
    const el = document.getElementById(elId);
    if (!el) return;

    el.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/,/g, '');
        const val = parseFloat(raw);
        if (!isNaN(val)) {
            state.condOverride[stateKey] = val;
        } else {
            delete state.condOverride[stateKey];
        }
        calculate();
    });

    if (COST_FIELDS.has(elId)) {
        el.addEventListener('focus', (e) => {
            const raw = e.target.value.replace(/,/g, '');
            e.target.value = raw;
        });
        el.addEventListener('blur', (e) => {
            const raw = parseFloat(e.target.value.replace(/,/g, ''));
            if (!isNaN(raw)) {
                e.target.value = Math.round(raw).toLocaleString('ko-KR');
            }
        });
    }
});

['cap-receiving', 'cap-generation', 'cap-solar', 'cap-other'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
        el.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value.replace(/,/g, '')) || 0;
            const stateKey = 'cap' + id.split('-')[1].charAt(0).toUpperCase() + id.split('-')[1].slice(1);
            state[stateKey] = val;
            calculate();
        });
    }
});


// Reset: show address search again (Step 1)
document.getElementById('btn-reset-addr').addEventListener('click', () => {
    // State reset
    state.address = "";
    state.customerName = "";
    state.buildingName = "";
    state.capReceiving = 0;
    state.capGeneration = 0;
    state.capSolar = 0;
    state.capOther = 0;
    state.purpose = "";
    state.managerPhone = "";
    state.salesManager = "";
    state.managementCompany = "";
    state.condOverride = {};
    state.itemToggles = { lowVoltage: true, highVoltage: true, generator: true, thermal: true, powerQuality: true, report: true, monthly: true };
    _lastBuildingResult = null;

    // Form fields reset
    ["customer-name", "cap-receiving", "cap-generation", "cap-solar", "cap-other", "purpose", "manager", "manager-phone", "sales-manager"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
    const mgmtCompanyInput = document.getElementById('management-company');
    if (mgmtCompanyInput) mgmtCompanyInput.value = '';

    // Building register UI reset
    document.getElementById('building-result-panel').style.display = 'none';
    document.getElementById('building-fetch-status').style.display = 'none';
    document.getElementById('building-result-content').innerHTML = '';

    // 대표 주용도 리셋
    state.representativePurpose = "";
    state.representativePurposeManuallyChanged = false;
    state.duplicateCheckChoice = null;
    const rpEl = document.getElementById('representative-purpose');
    if (rpEl) rpEl.value = '';

    // Re-init Kakao embed (clear and re-embed)
    const container = document.getElementById('kakao-embed-container');
    if (container) {
        container.innerHTML = '';
        initKakaoSearch();
    }

    goToStep(1);
});

// ---- Pill Toggle Group Handler Factory ----
function initPillToggleGroup(groupId, stateKey, callback) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            group.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const val = btn.dataset.value;
            state[stateKey] = isNaN(val) ? val : Number(val);
            if (callback) callback(val);
            calculate();
        });
    });
}

// 정전 여부
initPillToggleGroup('toggle-power-outage', 'powerOutage');

// 점검 횟수
initPillToggleGroup('toggle-inspection-count', 'inspectionCount');

// 월차점검 해당 여부
initPillToggleGroup('toggle-monthly-applicable', 'monthlyApplicable', (val) => {
    const row = document.getElementById('row-monthly-count');
    if (row) row.style.display = (val === '있음') ? 'flex' : 'none';
    // 없음 선택 시 monthly 토글 자동 off
    state.itemToggles.monthly = (val === '있음');
    calculate();
});

// 월차점검 횟수
initPillToggleGroup('toggle-monthly-count', 'monthlyCount');

// 점검 범위
initPillToggleGroup('toggle-inspection-scope', 'inspectionScope');

// Tab Switching (only buttons in #tab-bar)
document.getElementById('tab-bar').querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('tab-bar').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// LibreOffice PDF 서버 URL (상대 경로로 변경하여 통합 호스팅 환경에 대응)
// [개발 환경 주의] 로컬 환경(concurrently 등)에서는 프론트 3000번, 백엔드 3001번 등 포트가 분리될 수 있으므로
// 현재 호스트가 3000 번 포트일 경우 명시적으로 3001 번 백엔드를 바라보도록 분기 처리합니다.
const PDF_SERVER_URL = (window.location.port === '3000' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/generate-pdf'
    : '/generate-pdf';

// ---- Mapping Logic for Export ----
function generateMapping() {
    const d = state.results.costs;

    const mappingArray = [
            { name: "견적일", cell: "C6", value: state.estimateDate || "" },
            { name: "고객명", cell: "C7", value: state.customerName || "" },
            { name: "영업담당자", cell: "O10", value: state.salesManager || "" },
            { name: "영업담당자 연락처", cell: "V10", value: state.salesManagerPhone || "" },
            { name: "수전용량", cell: "U13", value: state.capReceiving ? `${state.capReceiving}KVA` : "0KVA" },
            { name: "발전용량", cell: "U14", value: state.capGeneration ? `${state.capGeneration}KW` : "0KW" },
            { name: "태양광용량", cell: "U15", value: state.capSolar ? `${state.capSolar}KW` : "0KW" },
            { name: "기타용량", cell: "U16", value: state.capOther ? `${state.capOther}KW` : "0KW" },
            { name: "특이사항", cell: "R17", value: state.specialNote || "" },
            { name: "담당자명", cell: "D47", value: state.manager || "" },
            { name: "담당자 직함", cell: "", value: state.managerPosition || "" },
            { name: "거래처 연락처", cell: "", value: state.managerPhone || "" },
            { name: "담당자 휴대전화", cell: "D48", value: state.managerMobile || "" },
            { name: "담당자 이메일", cell: "D49", value: state.managerEmail || "" },

            { name: "현장주소", cell: "D50", value: `${state.address || ""} ${state.addressDetail || ""}`.trim() },
            { name: "도로명주소", cell: "", value: state.roadAddress || "" },
            { name: "지번주소", cell: "", value: state.jibunAddress || "" },
            { name: "우편번호", cell: "", value: state.zonecode || "" },
            { name: "월차유지관리비", cell: "R21", value: d.monthly || 0 },
            { name: "저압점검", cell: "R22", value: d.lowVoltage || 0 },
            { name: "고압점검", cell: "R26", value: d.highVoltage || 0 },
            { name: "발전점검", cell: "R32", value: d.generator || 0 },
            { name: "열화상측정", cell: "R35", value: d.thermal || 0 },
            { name: "품질분석", cell: "R36", value: d.powerQuality || 0 },
            { name: "보고서작성", cell: "R37", value: d.report || 0 },
            { name: "태양광발전설비", cell: "R38", value: d.solarPanel || 0 },
            // 점검 조건 선택 옵션 → 엑셀 E열
            { name: "정전여부", cell: "E13", value: state.powerOutage || "무정전" },
            { name: "점검횟수", cell: "E14", value: `${state.inspectionCount || 1}회` },
            {
                name: "월차점검",
                cell: "E15",
                value: state.monthlyApplicable === "있음"
                    ? `${state.monthlyCount || 8}회`
                    : "해당사항 없음"
            },
            {
                name: "점검범위",
                cell: "E16",
                value: state.inspectionScope === "배전반+EPS"
                    ? "수전실내 배전반+EPS실 포함"
                    : "수전실내 배전반"
            },
            // 점검범위 배전반+EPS 선택 시 W22에 특수 문구 삽입
            {
                name: "점검범위추가문구",
                cell: "W22",
                value: state.inspectionScope === "배전반+EPS"
                    ? "각층 공용분전반/기계실MCC판넬 포함"
                    : ""
            },
            // U41 = R21(월차) + R22~R38(연차 전 항목) 총합계
            {
                name: "총합계",
                cell: "U41",
                value: (d.monthly || 0)
                    + (d.lowVoltage || 0)
                    + (d.highVoltage || 0)
                    + (d.generator || 0)
                    + (d.thermal || 0)
                    + (d.powerQuality || 0)
                    + (d.report || 0)
                    + (d.solarPanel || 0)
            }
        ];

    // ---- 점검 횟수 및 토글 조건에 따른 동그라미 표기 삭제 로직 ----
    let clearCells = [];

    if (state.inspectionCount === 1) {
        // 1회: K23~K37, L23~L37, M23~M37 삭제
        for (let r = 23; r <= 37; r++) {
            clearCells.push(`K${r}`, `L${r}`, `M${r}`);
        }
    } else if (state.inspectionCount === 2) {
        // 2회: K23~K37, M23~M37 삭제 (L은 유지)
        for (let r = 23; r <= 37; r++) {
            clearCells.push(`K${r}`, `M${r}`);
        }
    }

    if (!state.itemToggles.lowVoltage) {
        [23, 24, 25].forEach(r => clearCells.push(`K${r}`, `L${r}`, `M${r}`, `N${r}`));
    }
    if (!state.itemToggles.highVoltage) {
        [27, 28, 30].forEach(r => clearCells.push(`K${r}`, `L${r}`, `M${r}`, `N${r}`));
    }
    if (!state.itemToggles.generator) {
        [32, 33, 34].forEach(r => clearCells.push(`K${r}`, `L${r}`, `M${r}`, `N${r}`));
    }
    if (!state.itemToggles.thermal) {
        clearCells.push('K35', 'L35', 'M35', 'N35');
    }
    if (!state.itemToggles.powerQuality) {
        clearCells.push('K36', 'L36', 'M36', 'N36');
    }
    if (!state.itemToggles.report) {
        clearCells.push('K37', 'L37', 'M37', 'N37');
    }
    if (!state.itemToggles.solarPanel) {
        [38, 39, 40].forEach(r => clearCells.push(`K${r}`, `L${r}`, `M${r}`, `N${r}`));
    }

    // 중복 제거 후 빈 문자열("") 매핑
    const uniqueClearCells = [...new Set(clearCells)];
    uniqueClearCells.forEach(cell => {
        mappingArray.push({ name: `Clear_${cell}`, cell: cell, value: "" });
    });

    return {
        "직무 표지": [],
        "견적서": mappingArray
    };
}

// ---- 상태 표시 헬퍼 ----
function showStatusBar(msg, type) {
    const bar = document.getElementById('sheet-status-bar');
    if (!bar) return;
    const colors = {
        info: { bg: '#eff6ff', color: '#1d4ed8' },
        success: { bg: '#f0fdf4', color: '#15803d' },
        error: { bg: '#fef2f2', color: '#b91c1c' },
        warning: { bg: '#fffbeb', color: '#b45309' }
    };
    const c = colors[type] || colors.info;
    bar.style.background = c.bg;
    bar.style.color = c.color;
    bar.innerHTML = msg;
    bar.style.display = 'block';
}

// ---- PDF 버튼 활성/비활성 헬퍼 ----
function setPdfBtnEnabled(enabled) {
    const pdfBtn = document.getElementById('btn-save-pdf');
    if (!pdfBtn) return;
    pdfBtn.disabled = !enabled;
    pdfBtn.style.opacity = enabled ? '1' : '0.4';
    pdfBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
}

// PDF 저장 버튼 - 에어테이블 저장 먼저 → quotationId → PDF 생성(서버에서 Airtable 업로드 포함)
document.getElementById('btn-save-pdf').addEventListener('click', async () => {
    const mapping = generateMapping();
    const btn = document.getElementById('btn-save-pdf');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';
    showStatusBar('<i class="fas fa-spinner fa-spin"></i> PDF 생성 및 서버 동기화 중... (약 10~15초)', 'info');

    let pdfOk = false;
    let fileName = `${state.customerName || '견적서'}_견적서.pdf`;

    try {
        const pdfBody = { ...mapping };
        pdfBody.templateName = state.selectedTemplate;
        if (state.skipAirtable) pdfBody.skipAirtable = true;
        // 관리회사명 + 설비 용량: Excel 셀에 없는 값이므로 별도 메타 필드로 전달
        pdfBody._meta = {
            managementCompany: state.managementCompany || '',
            capReceiving:  state.capReceiving  || 0,
            capGeneration: state.capGeneration || 0,
            capSolar:      state.capSolar      || 0,
            capOther:      state.capOther      || 0,
            totalCapacity: state.results?.totalCapacity || 0
        };

        const pdfRes = await fetch(PDF_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pdfBody)
        });

        if (!pdfRes.ok) {
            const errData = await pdfRes.json().catch(() => ({ error: pdfRes.statusText }));
            throw new Error(errData.error || `서버 오류 (${pdfRes.status})`);
        }

        const blob = await pdfRes.blob();
        const disposition = pdfRes.headers.get('Content-Disposition') || '';
        
        // 파일명 추출 (표준 filename* 및 일반 filename 모두 대응)
        const nameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/) || disposition.match(/filename="?([^";]+)"?/);
        if (nameMatch) {
            fileName = decodeURIComponent(nameMatch[1].replace(/['"]/g, ''));
        }

        // 다운로드 트리거
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (downloadErr) {
            console.warn('[PDF Download] 자동 다운로드 실패 (모바일):', downloadErr.message);
        }
        pdfOk = true;
    } catch (pdfErr) {
        console.error('[PDF]', pdfErr);
        showStatusBar(`❌ 오류 발생: ${pdfErr.message}`, 'error');
    }

    if (pdfOk && state.skipAirtable) {
        showStatusBar(`✅ <b>${fileName}</b> 다운로드 완료 (에어테이블 저장 건너뜀)`, 'info');
    } else if (pdfOk) {
        showStatusBar(`✅ <b>${fileName}</b> 완료! (에어테이블 자동 동기화 적용됨)`, 'success');
    }

    btn.innerHTML = '<i class="fas fa-check-circle"></i> 처리 완료';
    setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-file-pdf"></i> 견적서 PDF 생성 및 자동 저장';
        btn.disabled = false;
    }, 3000);
});



// 에어테이블 저장 버튼 로직 (통합되었지만 버튼이 남아있을 경우를 대비해 유지 또는 기능 연결)
const btnAirtable = document.getElementById('btn-save-airtable');
if (btnAirtable) {
    btnAirtable.style.display = 'none'; // 통합되었으므로 UI에서 숨김 (디자인 유지 원칙에 따라 코드로 제어)
}
const btnJson = document.getElementById('btn-view-json');
if (btnJson) btnJson.style.display = 'none';

// 관리자 도구(JSON 확인) 트리거
const adminTrigger = document.getElementById('admin-trigger');
if (adminTrigger) {
    adminTrigger.addEventListener('click', async () => {
        // 모달 열기
        document.getElementById('modal-admin').style.display = 'flex';
        
        // JSON 데이터 갱신
        const mapping = generateMapping();
        document.getElementById('json-result').textContent = JSON.stringify(mapping, null, 2);

        // 템플릿 선택 동기화
        document.getElementById('select-template').value = state.selectedTemplate;

        // 서버 상태 체크
        const statusEl = document.getElementById('status-pdf-server');
        statusEl.textContent = '확인 중...';
        statusEl.style.color = 'var(--toss-text-muted)';
        
        try {
            const res = await fetch(`${BACKEND_URL}/health`);
            if (res.ok) {
                statusEl.textContent = '정상 (Connected)';
                statusEl.style.color = '#15803d';
            } else {
                throw new Error();
            }
        } catch {
            statusEl.textContent = '연결 실패 (Disconnected)';
            statusEl.style.color = '#b91c1c';
        }
    });
}

// 관리자 탭 전환
document.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.adminTab;
        
        // 버튼 활성화 처리
        btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 콘텐츠 표시 처리
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.style.display = (content.id === targetTab) ? 'flex' : 'none';
        });
    });
});

// 관리자: 수동 동기화
document.getElementById('btn-admin-manual-sync').addEventListener('click', async () => {
    const btn = document.getElementById('btn-admin-manual-sync');
    btn.disabled = true;
    btn.textContent = '전송 중...';
    
    try {
        const airResult = await window.airtableService.saveQuotation(state);
        alert('에어테이블 수동 동기화가 성공했습니다.');
        
        // 최근 기록 링크 업데이트
        if (airResult && airResult.quotationId) {
            const recordUrl = `https://airtable.com/appBAhIIrG3WhM1c1/tblx4lwYB78EMaLe3/${airResult.quotationId}`;
            const recentEl = document.getElementById('status-recent-record');
            if (recentEl) {
                recentEl.innerHTML = `<a href="${recordUrl}" target="_blank" style="color:var(--toss-blue); font-weight:600; text-decoration:none;">보기 <i class="fas fa-external-link-alt" style="font-size:0.75rem;"></i></a>`;
            }
        }
    } catch (err) {
        alert('동기화 실패: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '에어테이블 수동 동기화 실행';
    }
});

// 관리자: 강제 초기화 (기존 리셋 버튼 기능 활용)
document.getElementById('btn-admin-reset').addEventListener('click', () => {
    if (confirm('정말로 모든 입력 데이터를 초기화하고 1단계로 돌아가시겠습니까?')) {
        document.getElementById('btn-reset-addr').click();
        document.getElementById('modal-admin').style.display = 'none';
        showStatusBar('시스템이 성공적으로 초기화되었습니다.', 'success');
    }
});

// 관리자: 견적서 양식 선택
document.getElementById('select-template').addEventListener('change', (e) => {
    state.selectedTemplate = e.target.value;
});

// 관리자: Airtable 저장 ON/OFF 토글
document.getElementById('btn-toggle-airtable').addEventListener('click', () => {
    state.skipAirtable = !state.skipAirtable;
    const btn = document.getElementById('btn-toggle-airtable');
    if (state.skipAirtable) {
        btn.textContent = 'OFF';
        btn.style.background = '#fee2e2';
        btn.style.color = '#b91c1c';
    } else {
        btn.textContent = 'ON';
        btn.style.background = '#dcfce7';
        btn.style.color = '#15803d';
    }
});

document.getElementById('btn-admin-close').addEventListener('click', () => {
    document.getElementById('modal-admin').style.display = 'none';
});

// ---- Initialize ----
// 카카오 Postcode 스크립트 로드 완료 후 initKakaoSearch()를 실행합니다.
// index.html의 동적 로드 방식과 연동: 이미 로드됐으면 즉시, 아니면 콜백으로.
function _startKakaoSearch() {
    if (typeof daum !== 'undefined' && typeof daum.Postcode !== 'undefined') {
        initKakaoSearch();
    } else {
        // daum이 아직 준비되지 않은 경우 100ms 후 재시도
        console.warn('[카카오맵] daum.Postcode 미준비 - 재시도 중...');
        setTimeout(_startKakaoSearch, 100);
    }
}

if (window._kakaoPostcodeLoaded) {
    // 스크립트가 이미 로드 완료된 경우 (즉시 실행)
    _startKakaoSearch();
} else {
    // 아직 로드 중인 경우: index.html의 onload 콜백 등록
    window._onKakaoPostcodeReady = _startKakaoSearch;
}

// ---- Adjuster Buttons (+/-) ----
document.querySelectorAll('.btn-adj').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = btn.dataset.target;
        const adj = parseFloat(btn.dataset.adj);
        const stateKey = COND_INPUT_MAP[targetId];
        if (!stateKey) return;

        const base = window.CONSTANTS.JIGMU_BASE_PRICES;
        const currentVal = state.condOverride[stateKey] ?? base[stateKey];

        const newVal = Math.max(0, currentVal + adj);
        state.condOverride[stateKey] = newVal;

        calculate();
    });
});

// ---- Item Toggles (Include/Exclude) ----
document.querySelectorAll('.btn-toggle-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const item = btn.dataset.item;
        const currentActiveItems = Object.keys(state.itemToggles).filter(k => state.itemToggles[k]);

        // \ucd5c\uc18c 1\uac1c \uc720\uc9c0 \uc870\uac74
        if (state.itemToggles[item] && currentActiveItems.length <= 1) {
            alert("\ucd5c\uc18c 1\uac1c \uc774\uc0c1\uc758 \ud56d\ubaa9(\uc120\uc784/\uc720\uc9c0/\uc131\ub2a5)\uc774 \ud3ec\ud568\ub418\uc5b4\uc57c \ud569\ub2c8\ub2e4.");
            return;
        }

        state.itemToggles[item] = !state.itemToggles[item];
        calculate();
    });
});

// ---- Discount Adjuster Buttons ----
document.querySelectorAll('.btn-adj-discount').forEach(btn => {
    btn.addEventListener('click', () => {
        const adj = parseFloat(btn.dataset.adj);
        // 할인율 범위 제한 (0% ~ 100%)
        state.discount = Math.min(100, Math.max(0, state.discount + adj));
        calculate();
    });
});

// ---- Step Navigation Wizard ----
let currentStep = 1;

window.goToStep = async function(step) {
    // Basic Validation before leaving current step
    if (step === 2 && currentStep === 1) {
        if (!state.address) {
            alert("주소를 먼저 검색하고 선택해주세요.");
            return;
        }
    }
    if (step === 3 && currentStep === 2) {
        if (!state.representativePurpose) {
            alert("대표 주용도를 선택해주세요.");
            const rpEl = document.getElementById('representative-purpose');
            if (rpEl) rpEl.focus();
            return;
        }
        // 중복 고객 사전 체크
        const checkAddress = state.roadAddress || state.address;
        if (checkAddress) {
            try {
                const duplicate = await window.airtableService.checkDuplicateCustomer(
                    checkAddress, state.representativePurpose
                );
                if (duplicate) {
                    const choice = await window.showDuplicateCustomerModal(duplicate, state.representativePurpose);
                    if (choice === 'cancel') return;
                    state.duplicateCheckChoice = choice;
                } else {
                    state.duplicateCheckChoice = null;
                }
            } catch (e) {
                console.warn('[중복체크] 조회 실패, 계속 진행:', e.message);
                state.duplicateCheckChoice = null;
            }
        }
    }

    currentStep = step;

    // Update Header Navigation Indicators
    document.querySelectorAll('.step-indicator').forEach((el, index) => {
        const i = index + 1;
        el.classList.remove('active', 'completed');
        if (i < currentStep) {
            el.classList.add('completed');
        } else if (i === currentStep) {
            el.classList.add('active');
        }
    });

    // Toggle Content Panes
    document.querySelectorAll('.step-content').forEach(el => {
        el.classList.remove('active');
    });
    const activePane = document.getElementById(`step${step}-content`);
    if (activePane) {
        activePane.classList.add('active');
    }
    
    // Explicit visibility toggles (Right Panel Elements)
    document.getElementById('card-summary').style.display = (step >= 2) ? 'block' : 'none';
    document.getElementById('card-bottom-actions').style.display = (step === 3) ? 'flex' : 'none';

    // 고객 이력 패널: 1단계 복귀 시 초기화
    const _chPanel = document.getElementById('customer-history-panel');
    if (_chPanel && step === 1) {
        _chPanel.style.display = 'none';
        _chPanel.innerHTML = '';
    }

    // Kakao Map iFrame fix: re-init when going back to step 1
    if (step === 1) {
        const kakaoContainer = document.getElementById('kakao-embed-container');
        if (kakaoContainer) {
            kakaoContainer.innerHTML = ''; // clear broken iframe
            if (typeof initKakaoSearch === 'function') initKakaoSearch();
        }
    }

    const container = document.querySelector('.container');
    if (container) {
        if (step === 1) container.classList.add('step1-mode');
        else container.classList.remove('step1-mode');
    }
    
    // Auto trigger recalculate for safety
    calculate();
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

(function initRepresentativePurposeSelect() {
    const el = document.getElementById('representative-purpose');
    if (!el) return;
    REPRESENTATIVE_PURPOSE_OPTIONS.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        el.appendChild(option);
    });
    el.addEventListener('change', (e) => {
        state.representativePurpose = e.target.value;
        state.representativePurposeManuallyChanged = true;
    });
})();

// Start explicitly at Step 1
goToStep(1);

// ── 고객 이력 대시보드 ──────────────────────────────────────────────────────
function renderCustomerHistory(data) {
    const panel = document.getElementById('customer-history-panel');
    if (!panel) return;
    if (!data) { panel.style.display = 'none'; panel.innerHTML = ''; return; }

    panel.style.display = 'block';

    // ① 신규 고객
    if (!data.exists) {
        panel.innerHTML = `
        <div class="card">
            <div class="ch-header">
                <span class="card-title" style="margin:0;font-size:1rem;">고객 이력</span>
                <span class="ch-badge new">✦ 신규 고객</span>
            </div>
            <p class="ch-empty">이 주소로 발송된 견적이 없습니다.</p>
        </div>`;
        return;
    }

    // ② 기존 고객
    const { customerName, customerUniqueId, representativePurpose: historyPurpose, records } = data;
    const count      = records.length;
    const latestDate = records[0]?.date || '';

    let daysSince = null, isRecent = false;
    if (latestDate) {
        daysSince = Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000);
        isRecent  = daysSince <= 90;
    }

    const purposeBadge = historyPurpose
        ? `<span class="ch-purpose-badge">${escapeHtml(historyPurpose)}</span>`
        : '';

    const uidHtml = customerUniqueId
        ? `<span class="ch-uid">${escapeHtml(customerUniqueId)}</span>${purposeBadge}`
        : purposeBadge;

    const warnBanner = isRecent
        ? `<div class="ch-warn-banner">⚠ 최근 ${daysSince}일 전 견적 발송됨 — 중복 발송 주의</div>`
        : '';

    const itemsHtml = records.map(r => {
        const scopeTags = (r.serviceTypes || []).map(s =>
            `<span class="ch-tag">${escapeHtml(s)}</span>`
        ).join('');
        const amtTxt = r.totalAmount > 0 ? r.totalAmount.toLocaleString() + '원' : '-';

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
            ${scopeTags ? `<div class="ch-tags">${scopeTags}</div>` : ''}
            ${subParts  ? `<div class="ch-record-sub">${subParts}</div>` : ''}
        </div>`;
    }).join('');

    const countBadge = isRecent
        ? `<span class="ch-badge warn">기존 고객 · ${count}건</span>`
        : `<span class="ch-badge exist">기존 고객 · ${count}건</span>`;

    panel.innerHTML = `
    <div class="card">
        <div class="ch-header">
            <span class="card-title" style="margin:0;font-size:1rem;">고객 이력</span>
            ${countBadge}
        </div>
        ${uidHtml}
        ${warnBanner}
        ${count > 0 ? `
        <div id="ch-history-list">${itemsHtml}</div>
        <button class="ch-toggle-btn"
            onclick="(function(btn){
                const list = document.getElementById('ch-history-list');
                const open = list.style.display !== 'none';
                list.style.display = open ? 'none' : 'block';
                btn.textContent = open ? '펼치기 ▼' : '접기 ▲';
            })(this)">
            접기 ▲
        </button>` : `<p class="ch-empty">발송된 견적이 없습니다.</p>`}
    </div>`;
}

async function loadCustomerHistory(roadAddress) {
    const panel = document.getElementById('customer-history-panel');
    if (!panel) return;
    if (!roadAddress) { panel.style.display = 'none'; panel.innerHTML = ''; return; }

    panel.style.display = 'block';
    panel.innerHTML = `
    <div class="card">
        <div class="ch-header" style="margin-bottom:0;">
            <span class="card-title" style="margin:0;font-size:1rem;">고객 이력</span>
        </div>
        <p class="ch-empty"><i class="ch-spin">⟳</i> 조회 중...</p>
    </div>`;

    try {
        const data = await window.airtableService.lookupCustomerHistory(roadAddress);
        renderCustomerHistory(data);
    } catch (e) {
        console.warn('[CustomerHistory] 렌더링 실패:', e);
        panel.style.display = 'none';
    }
}
