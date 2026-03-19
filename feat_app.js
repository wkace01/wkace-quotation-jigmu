// ---- Master Data (Linked from constants.js) ----
const { 
    QUOTATION_CONDITIONS, 
    ADJUSTMENT_COEFFICIENTS, 
    SALES_MANAGERS, 
    GRADE_STYLES, 
    GRADE_WAGES, 
    GRADE_ORDER,
    COND_RANGE_LABELS
} = window.CONSTANTS;

// ---- State ----
const state = {
    customerName: "",
    maintenanceFrequency: "2??,
    appointmentFrequency: "12媛쒖썡",
    floorArea: 0,
    address: "",      // UI ?쒖떆??(李멸퀬??
    roadAddress: "",  // ?먯뼱?뚯씠釉???μ슜 (?쒖? ?꾨줈紐?
    buildingName: "",
    jibunAddress: "",
    zonecode: "",
    purpose: "",
    useAprDay: "",
    manager: "",
    managerPhone: "",
    managerPosition: "",
    managerMobile: "",
    managerEmail: "",
    salesManager: "",
    salesManagerPhone: "",
    selectedEquipments: new Set(),
    condOverride: {},         // ?ъ슜?먭? ?섏젙??議곌굔??媛?{ key: value }
    _lastConditionArea: -1,  // ?댁쟾 援ш컙 異붿쟻 (援ш컙 蹂寃???override 珥덇린?붿슜)
    itemToggles: {
        appointment: true,
        maintenance: true,
        inspection: true
    },
    discount: 0, // ?좎씤??(%)
    results: {
        grade: "",
        coef: 1,
        inspectionWorkers: 0,
        maintenanceWorkers: 0,
        costs: { inspection: 0, maintenance: 0, appointment: 0, yearly: 0, monthly: 0 }
    }
};

// (Redundant constants removed, using window.CONSTANTS)

// ---- ?멸굔鍮??곗텧 ?ы띁 ----
// workers: ?ъ엯?몄썝, grade: 嫄대Ъ?깃툒 ???대떦 ?깃툒留??몄썝 諛곗젙, ?섎㉧吏 0
function calcLaborBreakdown(workers, grade) {
    const rows = GRADE_ORDER.map(g => ({
        grade: g,
        workers: g === grade ? workers : "",         // ?대떦 ?깃툒 ?꾨땲硫?鍮덉뭏
        wage: g === grade ? GRADE_WAGES[g] : "",     // ?대떦 ?깃툒 ?꾨땲硫??④???鍮덉뭏
        amount: g === grade ? workers * GRADE_WAGES[g] : 0,
    }));
    const labor = workers * (GRADE_WAGES[grade] || 0);        // 吏곸젒?멸굔鍮?    const expense = Math.round(labor * 0.1);                     // 吏곸젒寃쎈퉬 (?멸굔鍮꽸?0%)
    const general = Math.round(labor * 1.1);                     // ?쒓꼍鍮?  (?멸굔鍮꽸?10%)
    const tech = Math.round((labor + general) * 0.2);         // 湲곗닠猷?  ((?멸굔鍮??쒓꼍鍮?횞20%)
    return {
        rows, labor, expense, general, tech,
        total: labor + expense + general + tech
    };
}


function calcFloorGrade(area) {
    if (!area || area < 5000) return '';   // 5,000??誘몃쭔? ?대떦 ?놁쓬
    if (area < 15000) return '珥덇툒';       // 5,000 ?댁긽 ~ 15,000 誘몃쭔
    if (area < 30000) return '以묎툒';       // 15,000 ?댁긽 ~ 30,000 誘몃쭔
    if (area < 60000) return '怨좉툒';       // 30,000 ?댁긽 ~ 60,000 誘몃쭔
    return '?밴툒';                          // 60,000 ?댁긽
}

function updateGradeBadge(area) {
    const el = document.getElementById('floor-grade');
    if (!el) return;
    const grade = calcFloorGrade(area);
    if (!grade) {
        el.textContent = '?곕㈃???낅젰 ???먮룞 遺꾨쪟';
        el.style.color = 'var(--text-muted)';
        el.style.fontSize = '0.95rem';
        return;
    }
    const style = GRADE_STYLES[grade];
    el.textContent = grade;
    el.style.color = style.color;
    el.style.fontSize = '1.2rem';
}

// ---- Lookup Helpers ----
function lookupCondition(area) {
    // Find the highest bracket the area qualifies for
    let match = null;
    for (const c of QUOTATION_CONDITIONS) {
        if (area >= c.area) match = c;
    }
    return match;
}

function lookupCoef(area) {
    let match = null;
    for (const c of ADJUSTMENT_COEFFICIENTS) {
        if (area >= c.area) match = c;
    }
    return match;
}

// ---- Calculation ----
function calculate() {
    const area = state.floorArea || 0;
    const condition = lookupCondition(area);
    const coefObj = lookupCoef(area);

    if (!condition || !coefObj) {
        state.results.grade = "?곕㈃??遺議?(5,000???댁긽)";
        state.results.coef = 0;
        state.results.inspectionWorkers = 0;
        state.results.maintenanceWorkers = 0;
        state.results.costs = { inspection: 0, maintenance: 0, appointment: 0, yearly: 0, monthly: 0 };
        updateUI();
        return;
    }

    state.results.grade = condition.grade;
    state.results.coef = coefObj.coef;

    // Auto-update grade badge
    updateGradeBadge(area);

    // Workers - 議곌굔?쒖쓽 ?몃젰媛믪쓣 洹몃?濡?媛?몄샂 (override 諛섏쁺)
    const eff = getEffectiveCond(condition);
    state.results.inspectionWorkers = eff.inspectionWorkers;
    state.results.maintenanceWorkers = eff.maintenanceWorkers;

    // Costs - override瑜?諛섏쁺???좏슚??議곌굔媛??ъ슜
    state.results.costs.inspection = eff.yearlyInspection;
    state.results.costs.maintenance = eff.yearlyMaintenance;
    state.results.costs.appointment = eff.yearlyAppointment;

    // Total before discount
    const subtotal = eff.yearlyInspection + eff.yearlyMaintenance + eff.yearlyAppointment;
    // Apply discount
    const discountAmount = Math.round(subtotal * (state.discount / 100));
    state.results.costs.yearly = subtotal - discountAmount;
    state.results.costs.monthly = Math.floor(state.results.costs.yearly / 12);

    // \uc870\uac74\ud45c \ud328\ub110 \uc5c5\ub370\uc774\ud2b8
    updateConditionPanel(condition);

    updateUI();
}

// ?뺚?Condition Panel ?뺚?// (Redundant COND_RANGE_LABELS removed)

function getEffectiveCond(condition) {
    // override媛 ?덉쑝硫??ъ슜??媛? ?놁쑝硫?湲곕낯媛??ъ슜
    // ?? itemToggles媛 false?대㈃ 紐⑤뱺 愿??媛믪쓣 0?쇰줈 諛섏쟾
    const isApp = state.itemToggles.appointment;
    const isMaint = state.itemToggles.maintenance;
    const isInsp = state.itemToggles.inspection;

    return {
        monthlyAppointment: isApp ? (state.condOverride.monthlyAppointment ?? condition.monthlyAppointment) : 0,
        yearlyAppointment: isApp ? (state.condOverride.yearlyAppointment ?? condition.yearlyAppointment) : 0,
        yearlyMaintenance: isMaint ? (state.condOverride.yearlyMaintenance ?? condition.yearlyMaintenance) : 0,
        yearlyInspection: isInsp ? (state.condOverride.yearlyInspection ?? condition.yearlyInspection) : 0,
        inspectionWorkers: isInsp ? (state.condOverride.inspectionWorkers ?? condition.inspectionWorkers) : 0,
        maintenanceWorkers: isMaint ? (state.condOverride.maintenanceWorkers ?? condition.maintenanceWorkers) : 0,
    };
}

function updateConditionPanel(condition) {
    const panel = document.getElementById('card-condition');
    if (!panel) return;

    // ?곕㈃??援ш컙???щ씪吏?寃쎌슦 override 由ъ뀑
    if (state._lastConditionArea !== condition.area) {
        state.condOverride = {};
        state._lastConditionArea = condition.area;
    }
    const eff = getEffectiveCond(condition);

    const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

    // ?⑤꼸 ?쒖떆
    panel.style.display = 'block';
    document.getElementById('cond-grade').textContent = condition.grade;
    document.getElementById('cond-range-label').textContent = COND_RANGE_LABELS[condition.area] || '';

    const inputs = [
        { id: 'cond-monthly-appointment', val: fmt(eff.monthlyAppointment) },
        { id: 'cond-yearly-appointment', val: fmt(eff.yearlyAppointment) },
        { id: 'cond-yearly-maintenance', val: fmt(eff.yearlyMaintenance) },
        { id: 'cond-yearly-inspection', val: fmt(eff.yearlyInspection) },
        { id: 'cond-inspection-workers', val: eff.inspectionWorkers },
        { id: 'cond-maintenance-workers', val: eff.maintenanceWorkers }
    ];

    inputs.forEach(item => {
        const el = document.getElementById(item.id);
        // ?ъ빱??以묒씤 ?섎━癒쇳듃??媛믪쓣 ??뼱?곗? ?딆쓬 (而ㅼ꽌 ??諛?jitter 諛⑹?)
        if (el && document.activeElement !== el) {
            el.value = item.val;
        }
    });

    const mFreq = document.getElementById('cond-maintenance-frequency');
    if (mFreq && document.activeElement !== mFreq) mFreq.value = state.maintenanceFrequency;
    const aFreq = document.getElementById('cond-appointment-frequency');
    if (aFreq && document.activeElement !== aFreq) aFreq.value = state.appointmentFrequency;

    document.getElementById('cond-discount-display').textContent = state.discount + '%';

    const subtotal = eff.yearlyAppointment + eff.yearlyMaintenance + eff.yearlyInspection;
    const discountAmount = Math.round(subtotal * (state.discount / 100));
    const yearlyTotal = subtotal - discountAmount;
    const monthlyTotal = Math.floor(yearlyTotal / 12);
    document.getElementById('cond-yearly-total').textContent = fmt(yearlyTotal) + '??;
    document.getElementById('cond-monthly-total').textContent = fmt(monthlyTotal) + '??;

    // ?섏젙???꾨뱶 ?섏씠?쇱씠??    ['monthly-appointment', 'yearly-appointment', 'yearly-maintenance', 'yearly-inspection', 'inspection-workers', 'maintenance-workers'].forEach(key => {
        const el = document.getElementById('cond-' + key);
        const stateKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (state.condOverride[stateKey] !== undefined) {
            el.style.background = '#fef3c7';
            el.style.borderColor = '#f59e0b';
        } else {
            el.style.background = '';
            el.style.borderColor = '#d1d5db';
        }
    });

    // Toggle \uc544\uc774\ucf58 \ubc0f \ud589 \uc0c1\ud0dc \uc5c5\ub370\uc774\ud2b8
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
        if (state.itemToggles[item]) {
            row.classList.remove('item-disabled');
        } else {
            row.classList.add('item-disabled');
        }
    });
}

// ---- UI Rendering ----
function updateUI() {
    const hasArea = state.floorArea > 0;
    const hasValidCondition = !!lookupCondition(state.floorArea);

    document.getElementById('card-summary').style.display = (hasArea && currentStep >= 2) ? 'block' : 'none';
    document.getElementById('card-detail').style.display = hasArea ? 'block' : 'none';
    if (!hasArea) document.getElementById('card-condition').style.display = 'none';

    // Right Panel Elements visibility are managed primarily by goToStep 
    // unless necessary to update within a step
    const bottomActions = document.getElementById('card-bottom-actions');
    if (bottomActions && window.currentStep === 3) {
        bottomActions.style.display = hasArea ? 'flex' : 'none';
    }

    if (!hasArea) return;

    document.getElementById('res-grade').textContent = state.results.grade;
    document.getElementById('res-coef').textContent = hasValidCondition ? state.results.coef.toFixed(2) : '-';
    document.getElementById('res-workers').textContent = hasValidCondition ? state.results.inspectionWorkers + " 紐? : '-';
    document.getElementById('res-maint-workers').textContent = hasValidCondition ? state.results.maintenanceWorkers + " 紐? : '-';
    document.getElementById('res-yearly').textContent = "??" + state.results.costs.yearly.toLocaleString();
    document.getElementById('res-monthly').textContent = "??" + state.results.costs.monthly.toLocaleString();

    renderTabs();
}

function renderTabs() {
    const fmt = n => Math.round(n).toLocaleString('ko-KR');

    // Tab 1: Summary
    const subtotal = state.results.costs.inspection + state.results.costs.maintenance + state.results.costs.appointment;
    const discountRow = state.discount > 0
        ? `<tr style="color:#ef4444"><td>?좎씤??(${state.discount}%)</td><td>- ??${Math.round(subtotal * (state.discount / 100)).toLocaleString()}</td><td>寃ъ쟻 ?좎씤</td></tr>`
        : '';

    document.getElementById('tbl-q-total').innerHTML = `
        <tr><td>??곷Ъ (怨좉컼紐?</td><td>${state.customerName || '-'}</td><td></td></tr>
        <tr><td>?곕㈃??/td><td>${state.floorArea.toLocaleString()} ??/td><td>?깃툒: <span style="font-weight:600; color:var(--toss-blue);">${state.results.grade}</span></td></tr>
        <tr><td>?대떦???뺣낫</td><td>${state.manager || '-'} ${state.managerPosition ? '(' + state.managerPosition + ')' : ''}</td><td>${state.managerPhone || '-'} ${state.managerMobile ? ' / ' + state.managerMobile : ''}</td></tr>
        <tr><td>?깅뒫?먭?</td><td>??${state.results.costs.inspection.toLocaleString()}</td><td>??1??/td></tr>
        <tr><td>?좎??먭?</td><td>??${state.results.costs.maintenance.toLocaleString()}</td><td>${state.maintenanceFrequency}</td></tr>
        <tr><td>?꾪긽?좎엫</td><td>??${state.results.costs.appointment.toLocaleString()}</td><td>${state.appointmentFrequency}</td></tr>
        ${discountRow}
        <tr style="font-weight:700; color:var(--toss-blue)"><td>理쒖쥌 ?⑷퀎 (?곌컙)</td><td>??${state.results.costs.yearly.toLocaleString()}</td><td>遺媛??蹂꾨룄</td></tr>
        <tr style="font-weight:600"><td>???⑸???/td><td>??${state.results.costs.monthly.toLocaleString()}</td><td>첨12</td></tr>
    `;

    // Tab 2: Inspection
    const inspB = calcLaborBreakdown(state.results.inspectionWorkers, state.results.grade);
    document.getElementById('tbl-q-inspection').innerHTML =
        inspB.rows.filter(r => r.workers > 0).map(r => `
        <tr style="font-weight:600; color:var(--toss-text-main);">
            <td>${r.grade} ?뺣낫?듭떊湲곗닠??/td>
            <td>${r.workers}紐?횞 ??${r.wage.toLocaleString()}</td>
            <td>??${r.amount.toLocaleString()}</td>
        </tr>`).join('') + `
        <tr style="border-top:1px solid var(--toss-border); font-weight:700;">
            <td>吏곸젒?멸굔鍮??뚭퀎</td><td></td><td>??${inspB.labor.toLocaleString()}</td>
        </tr>
        <tr><td>吏곸젒寃쎈퉬</td><td>?멸굔鍮?횞 10%</td><td>??${inspB.expense.toLocaleString()}</td></tr>
        <tr><td>?쒓꼍鍮?/td><td>?멸굔鍮?횞 110%</td><td>??${inspB.general.toLocaleString()}</td></tr>
        <tr><td>湲곗닠猷?/td><td>(?멸굔鍮?+ ?쒓꼍鍮? 횞 20%</td><td>??${inspB.tech.toLocaleString()}</td></tr>
        <tr style="font-weight:700; color:var(--toss-blue)">
            <td>?곗텧 ?⑷퀎</td><td></td><td>??${inspB.total.toLocaleString()}</td>
        </tr>
        <tr style="color:${state.results.costs.inspection - inspB.total >= 0 ? 'var(--toss-green)' : 'var(--toss-red)'}">
            <td>議곗젙 湲덉븸</td>
            <td>紐⑺몴湲덉븸 ???곗텧?⑷퀎</td>
            <td>${state.results.costs.inspection - inspB.total >= 0 ? '+' : ''}??${(state.results.costs.inspection - inspB.total).toLocaleString()}</td>
        </tr>
        <tr style="font-weight:700; border-top:1px solid var(--toss-border); color:var(--toss-text-main);">
            <td>理쒖쥌 ?⑷퀎 (紐⑺몴湲덉븸)</td><td>寃ъ쟻 議곌굔???곸슜</td><td>??${state.results.costs.inspection.toLocaleString()}</td>
        </tr>`;

    // Tab 3: Maintenance
    const maintB = calcLaborBreakdown(state.results.maintenanceWorkers, state.results.grade);
    document.getElementById('tbl-q-maintenance').innerHTML =
        maintB.rows.filter(r => r.workers > 0).map(r => `
        <tr style="font-weight:600; color:var(--toss-text-main);">
            <td>${r.grade} ?뺣낫?듭떊湲곗닠??/td>
            <td>${r.workers}紐?횞 ??${r.wage.toLocaleString()}</td>
            <td>??${r.amount.toLocaleString()}</td>
        </tr>`).join('') + `
        <tr style="border-top:1px solid var(--toss-border); font-weight:700;">
            <td>吏곸젒?멸굔鍮??뚭퀎</td><td></td><td>??${maintB.labor.toLocaleString()}</td>
        </tr>
        <tr><td>吏곸젒寃쎈퉬</td><td>?멸굔鍮?횞 10%</td><td>??${maintB.expense.toLocaleString()}</td></tr>
        <tr><td>?쒓꼍鍮?/td><td>?멸굔鍮?횞 110%</td><td>??${maintB.general.toLocaleString()}</td></tr>
        <tr><td>湲곗닠猷?/td><td>(?멸굔鍮?+ ?쒓꼍鍮? 횞 20%</td><td>??${maintB.tech.toLocaleString()}</td></tr>
        <tr style="font-weight:700; color:var(--toss-blue)">
            <td>?곗텧 ?⑷퀎</td><td></td><td>??${maintB.total.toLocaleString()}</td>
        </tr>
        <tr style="color:${state.results.costs.maintenance - maintB.total >= 0 ? 'var(--toss-green)' : 'var(--toss-red)'}">
            <td>議곗젙 湲덉븸</td>
            <td>紐⑺몴湲덉븸 ???곗텧?⑷퀎</td>
            <td>${state.results.costs.maintenance - maintB.total >= 0 ? '+' : ''}??${(state.results.costs.maintenance - maintB.total).toLocaleString()}</td>
        </tr>
        <tr style="font-weight:700; border-top:1px solid var(--toss-border); color:var(--toss-text-main);">
            <td>理쒖쥌 ?⑷퀎 (紐⑺몴湲덉븸)</td><td>寃ъ쟻 議곌굔???곸슜</td><td>??${state.results.costs.maintenance.toLocaleString()}</td>
        </tr>`;

    // Tab 4: Appointment
    document.getElementById('tbl-q-appointment').innerHTML = `
        <tr><td>?좎엫 ?깃툒</td><td>${state.results.grade} 1紐?/td><td>?곕㈃??湲곗?</td></tr>
        <tr><td>???④?</td><td>??${(state.results.costs.appointment / 12).toLocaleString()}</td><td>횞 12媛쒖썡</td></tr>
        <tr style="font-weight:700; color:var(--toss-text-main);"><td>?곌컙 ?좎엫 ?⑷퀎</td><td></td><td>??${state.results.costs.appointment.toLocaleString()}</td></tr>
    `;

    // ?곗씠??湲곗? ?좉? ?⑤꼸 (tab2, tab3 怨듯넻)
    ['tab2', 'tab3'].forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (!tab) return;

        // 湲곗〈 ?좉? ?쒓굅 ???ъ깮??        const old = tab.querySelector('.data-ref-toggle-wrap');
        if (old) old.remove();

        const condition = lookupCondition(state.floorArea);
        const coefObj = lookupCoef(state.floorArea);
        if (!condition || !coefObj) return;

        const eff = getEffectiveCond(condition);

        const wrap = document.createElement('div');
        wrap.className = 'data-ref-toggle-wrap';
        wrap.style.cssText = 'margin-top:0.75rem;';

        const btn = document.createElement('button');
        btn.innerHTML = '<i class="fas fa-database"></i> ?곗씠??湲곗? 蹂닿린';
        btn.style.cssText = [
            'background:var(--toss-input-bg)', 'border:none', 'border-radius:100px',
            'padding:0.5rem 1rem', 'cursor:pointer', 'font-size:0.85rem', 'font-weight:600',
            'color:var(--toss-text-sub)', 'display:flex', 'align-items:center', 'gap:0.4rem',
            'transition: background 0.2s', 'width: fit-content'
        ].join(';');

        const panel = document.createElement('div');
        panel.style.cssText = [
            'display:none', 'margin-top:0.6rem', 'background:#f8fafc',
            'border:1px solid #e5e7eb', 'border-radius:8px', 'padding:0.9rem 1rem',
            'font-size:0.82rem', 'color:#374151'
        ].join(';');

        // ?몄엫?④?
        const wageRows = GRADE_ORDER.map(g =>
            `<tr ${g === condition.grade ? 'style="font-weight:700;color:var(--primary-color)"' : ''}>
                <td style="padding:2px 8px">${g} 湲곗닠??/td>
                <td style="padding:2px 8px; text-align:right">??${GRADE_WAGES[g].toLocaleString()}</td>
                <td style="padding:2px 8px; color:#9ca3af">${g === condition.grade ? '???곸슜 ?깃툒' : ''}</td>
            </tr>`
        ).join('');

        // ?곸슜 議곌굔??        const condRows = [
            ['?곕㈃??援ш컙', COND_RANGE_LABELS[condition.area] || '-'],
            ['?깃툒', condition.grade],
            ['?깅뒫?먭? (??', `??${fmt(eff.yearlyInspection)}`],
            ['?깅뒫?먭? ?몃젰', `${eff.inspectionWorkers}紐?],
            ['?좎??먭? (??', `??${fmt(eff.yearlyMaintenance)}`],
            ['?좎??먭? ?몃젰', `${eff.maintenanceWorkers}紐?],
            ['?꾪긽?좎엫 (??', `??${fmt(eff.monthlyAppointment)}`],
            ['?꾪긽?좎엫 (??', `??${fmt(eff.yearlyAppointment)}`],
        ].map(([k, v]) =>
            `<tr><td style="padding:2px 8px;color:#6b7280">${k}</td><td style="padding:2px 8px;font-weight:600">${v}</td></tr>`
        ).join('');

        // 議곗젙怨꾩닔
        const coefRows = ADJUSTMENT_COEFFICIENTS.map(c =>
            `<tr ${c.area === coefObj.area ? 'style="font-weight:700;color:var(--primary-color)"' : ''}>
                <td style="padding:2px 8px">${COND_RANGE_LABELS[c.area] || c.area.toLocaleString() + '?≪씠??}</td>
                <td style="padding:2px 8px;text-align:right">${c.coef.toFixed(2)}</td>
                <td style="padding:2px 8px;color:#9ca3af">${c.area === coefObj.area ? '???꾩옱 ?곸슜' : ''}</td>
            </tr>`
        ).join('');

        panel.innerHTML = (() => {
            const wageHtml = GRADE_ORDER.map(g => {
                const a = g === condition.grade;
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid var(--toss-border);gap:0.5rem;">
                    <span style="display:flex;align-items:center;gap:0.5rem;">
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:40px;flex-shrink:0;">${a ? '<span style="background:var(--toss-blue);color:white;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:6px;">?곸슜</span>' : ''}</span>
                        <span style="font-size:0.85rem;font-weight:${a ? '700' : '500'};color:${a ? 'var(--toss-blue)' : 'var(--toss-text-main)'};white-space:nowrap;">${g} 湲곗닠??/span>
                    </span>
                    <span style="font-size:0.85rem;font-weight:${a ? '700' : '600'};color:${a ? 'var(--toss-blue)' : 'var(--toss-text-sub)'};font-variant-numeric:tabular-nums;white-space:nowrap;">??${GRADE_WAGES[g].toLocaleString()}</span>
                </div>`;
            }).join('');

            const coefHtml = ADJUSTMENT_COEFFICIENTS.map(c => {
                const a = c.area === coefObj.area;
                const label = (COND_RANGE_LABELS[c.area] || '')
                    .replace(' ???곕㈃??, '').replace(/ ??g, '').replace('< ', '<');
                return `<div style="background:${a ? 'var(--toss-blue)' : 'var(--toss-input-bg)'};color:${a ? 'white' : 'var(--toss-text-main)'};border-radius:var(--radius-sm);padding:0.5rem 0.75rem;text-align:center;white-space:nowrap;border:1px solid ${a ? 'var(--toss-blue)' : 'var(--toss-border)'}; flex: 1 1 calc(25% - 0.5rem); min-width: 80px;">
                    <div style="font-size:0.7rem;opacity:${a ? .9 : .6};margin-bottom:2px;">${label || c.area.toLocaleString() + '??'}</div>
                    <div style="font-size:0.95rem;font-weight:700;">${c.coef.toFixed(2)}</div>
                </div>`;
            }).join('');

            const COND_ROWS = [
                { label: '?깃툒', fn: c => `<span style="font-weight:700;color:${GRADE_STYLES[c.grade]?.color || 'var(--toss-text-main)'}">${c.grade}</span>` },
                { label: '?깅뒫?먭? (??', fn: c => '??' + fmt(c.yearlyInspection) },
                { label: '?깅뒫?먭? ?몃젰', fn: c => c.inspectionWorkers + '紐? },
                { label: '?좎??먭? (??', fn: c => '??' + fmt(c.yearlyMaintenance) },
                { label: '?좎??먭? ?몃젰', fn: c => c.maintenanceWorkers + '紐? },
                { label: '?꾪긽?좎엫 (??', fn: c => '??' + fmt(c.monthlyAppointment) },
                { label: '?꾪긽?좎엫 (??', fn: c => '??' + fmt(c.yearlyAppointment) },
            ];

            const thCells = QUOTATION_CONDITIONS.map(c => {
                const a = c.area === condition.area;
                return `<th style="padding:0.5rem 0.75rem;font-size:0.75rem;font-weight:${a ? '700' : '600'};background:${a ? 'var(--toss-blue)' : 'var(--toss-input-bg)'};color:${a ? 'white' : 'var(--toss-text-sub)'};border-bottom:2px solid ${a ? 'var(--toss-blue)' : 'var(--toss-border)'};text-align:center;white-space:nowrap;">
                    ${(COND_RANGE_LABELS[c.area] || '').replace(' ???곕㈃??<', '<br><').replace(/??g, '??)}
                    ${a ? '<div style="font-size:0.65rem;opacity:.9;margin-top:4px;background:rgba(255,255,255,0.2);padding:2px 4px;border-radius:4px;">?꾩옱 ?곸슜 援ш컙</div>' : ''}
                </th>`;
            }).join('');

            const bodyRows = COND_ROWS.map(row => {
                const tds = QUOTATION_CONDITIONS.map(c => {
                    const a = c.area === condition.area;
                    return `<td style="padding:0.5rem 0.75rem;font-size:0.85rem;text-align:center;border-bottom:1px solid var(--toss-border);background:${a ? 'var(--toss-blue-bg)' : 'transparent'};font-weight:${a ? '700' : '500'};color:${a ? 'var(--toss-blue)' : 'var(--toss-text-main)'};white-space:nowrap;">${row.fn(c)}</td>`;
                }).join('');
                return `<tr>
                    <td style="padding:0.5rem 0.75rem;font-size:0.8rem;color:var(--toss-text-sub);background:var(--toss-input-bg);border-bottom:1px solid var(--toss-border);border-right:1px solid var(--toss-border);white-space:nowrap;font-weight:600;">${row.label}</td>
                    ${tds}
                </tr>`;
            }).join('');

            return `
            <div style="display:grid;grid-template-columns:1fr;gap:1rem;margin-bottom:1rem; @media (min-width: 768px) { grid-template-columns: 1fr 2fr; }">
                <div style="background:var(--toss-card-bg);border:1px solid var(--toss-border);border-radius:var(--radius-md);padding:1rem;box-shadow:var(--shadow-sm);">
                    <div style="font-size:0.9rem;font-weight:700;color:var(--toss-text-main);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
                        <i class="fas fa-coins" style="color:var(--toss-blue);"></i> ?깃툒蹂??몄엫?④? (???맞룹씪)
                    </div>
                    ${wageHtml}
                </div>
                <div style="background:var(--toss-card-bg);border:1px solid var(--toss-border);border-radius:var(--radius-md);padding:1rem;box-shadow:var(--shadow-sm);">
                    <div style="font-size:0.9rem;font-weight:700;color:var(--toss-text-main);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
                        <i class="fas fa-chart-line" style="color:var(--toss-blue);"></i> ?곕㈃??議곗젙怨꾩닔
                    </div>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">${coefHtml}</div>
                </div>
            </div>
            <div style="background:var(--toss-card-bg);border:1px solid var(--toss-border);border-radius:var(--radius-md);padding:1rem;overflow-x:auto;box-shadow:var(--shadow-sm);">
                <div style="font-size:0.9rem;font-weight:700;color:var(--toss-text-main);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">
                    <i class="fas fa-table" style="color:var(--toss-blue);"></i> 寃ъ쟻 議곌굔??(?꾩껜 援ш컙)
                </div>
                <table style="width:100%;border-collapse:collapse;min-width:700px;">
                    <thead><tr>
                        <th style="padding:0.5rem 0.75rem;font-size:0.8rem;font-weight:700;background:var(--toss-input-bg);color:var(--toss-text-main);border-bottom:2px solid var(--toss-border);border-right:1px solid var(--toss-border);text-align:left;white-space:nowrap;">??ぉ</th>
                        ${thCells}
                    </tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>`;
        })();


        btn.addEventListener('click', () => {
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'block';
            btn.innerHTML = open
                ? '<i class="fas fa-database"></i> ?곗씠??湲곗? 蹂닿린'
                : '<i class="fas fa-chevron-up"></i> ?곗씠??湲곗? ?묎린';
        });

        wrap.appendChild(btn);
        wrap.appendChild(panel);
        tab.appendChild(wrap);
    });
}


// ---- Building Register API (ported from 嫄댁텞臾쇰????곕㈃??議고쉶-?쒕퉬?? ----
// (怨듯넻 湲곕뒫??二쇱냼 寃??諛????議고쉶??common.js??window.wkCommon.getAddressInfo, fetchBuildingRegister ?ъ슜)

let _lastBuildingResult = null; // store for apply button

async function fetchBuildingInfo() {
    const statusEl = document.getElementById('building-fetch-status');
    const panelEl = document.getElementById('building-result-panel');
    const contentEl = document.getElementById('building-result-content');
    const btn = document.getElementById('btn-fetch-building');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 議고쉶 以?..';
    statusEl.style.display = 'block';
    statusEl.style.background = '#f0f9ff';
    statusEl.style.color = '#0369a1';
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 二쇱냼 蹂??諛?嫄댁텞臾쇰???API ?몄텧 以?..';
    panelEl.style.display = 'none';

    try {
        const addrInfo = await window.wkCommon.getAddressInfo(state.address);
        const target = await window.wkCommon.fetchBuildingRegister(addrInfo);

        // 怨듯넻 諛섑솚 ?ㅽ궎留덉뿉 留욎떠 ?붾㈃ 留ㅽ븨???꾪븳 ?뺥깭 媛怨?        const sumMainArea = parseFloat(target.totArea || 0);
        const result = {
            '?곕㈃??: sumMainArea.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            '遺?띻굔異뺣Ъ硫댁쟻': '0.00',
            '珥앹뿰硫댁쟻': sumMainArea.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            '二쇱슜??: target.mainPurpsCdNm || '-',
            '二쇱슜??遺꾪룷': target.mainPurpsCdNm || '-',
            '?吏硫댁쟻': target.platArea || '-',
            '嫄댁텞硫댁쟻': target.archArea || '-',
            '?ъ슜?뱀씤??: target.useAprDay || '-',
            '嫄댁텞臾쇰챸': target.bldNm || '-',
            '_rawMainArea': sumMainArea,
            '_rawPurpose': target.mainPurpsCdNm
        };
        _lastBuildingResult = result;

        // Render result cards
        const displayKeys = ['珥앹뿰硫댁쟻', '?곕㈃??, '遺?띻굔異뺣Ъ硫댁쟻', '二쇱슜??, '?吏硫댁쟻', '嫄댁텞硫댁쟻', '?ъ슜?뱀씤??, '嫄댁텞臾쇰챸'];
        contentEl.innerHTML = displayKeys.map(k => `
            <div style="background:white; border:1px solid var(--border-color); border-radius:6px; padding:0.6rem 0.8rem;">
                <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">${k}</div>
                <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary)">${result[k] || '-'}</div>
            </div>
        `).join('') + `
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:0.6rem 0.8rem; grid-column:1/-1;">
                <div style="font-size:0.7rem; color:#3b82f6; margin-bottom:2px;">二쇱슜??遺꾪룷 (二쇨굔異뺣Ъ 湲곗?)</div>
                <div style="font-weight:600; font-size:0.85rem; color:#1d4ed8">${result['二쇱슜??遺꾪룷'] || '-'}</div>
            </div>
        `;

        panelEl.style.display = 'block';
        statusEl.style.background = '#f0fdf4';
        statusEl.style.color = '#15803d';
        statusEl.style.textAlign = 'center';
        statusEl.innerHTML = '<span class="status-msg-pc">??嫄댁텞臾쇰???議고쉶 ?깃났! "????媛믪쑝濡??곸슜" 踰꾪듉?쇰줈 媛믪쓣 ?낅젰?섏꽭??</span>' + 
                             '<span class="status-msg-mobile">??嫄댁텞臾쇰???議고쉶 ?깃났!<br>"????媛믪쑝濡??곸슜" 踰꾪듉?쇰줈<br>媛믪쓣 ?낅젰?섏꽭??</span>';
    } catch (err) {
        statusEl.style.background = '#fef2f2';
        statusEl.style.color = '#b91c1c';
        statusEl.innerHTML = `???ㅻ쪟: ${err.message}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> 嫄댁텞臾쇰???議고쉶';
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
            state.roadAddress = data.roadAddress || roadAddr; // ?쒖? ?꾨줈紐??곗꽑 ???            state.jibunAddress = data.jibunAddress || data.autoJibunAddress || '';
            state.zonecode = data.zonecode || '';
        }

        // Proceed to Step 2 automatically
        goToStep(2);

        calculate();

        // 寃??利됱떆 ?먮룞 議고쉶 ?몃━嫄?        setTimeout(() => document.getElementById('btn-fetch-building').click(), 500);
    });
}


document.getElementById('customer-name').addEventListener('input', (e) => {
    state.customerName = e.target.value;
    calculate();
});

document.getElementById('floor-area').addEventListener('input', (e) => {
    state.floorArea = parseFloat(e.target.value) || 0;
    updateGradeBadge(state.floorArea);

    // ?곕㈃?곸쓣 吏곸젒 ?낅젰??寃쎌슦 移대뱶 ?쒖떆 蹂댁옣
    // (Step Wizard?먯꽌 ?먮룞 愿由щ릺誘濡??섎룞 display 議곗젅 ?앸왂)

    calculate();
});

// 議곌굔??湲곕낯媛?蹂듭썝 踰꾪듉
document.getElementById('btn-restore-cond').addEventListener('click', () => {
    state.condOverride = {};
    state._lastConditionArea = -1; // 援ш컙 ?ш퀎??媛뺤젣 ?몃━嫄?    calculate();
});

// Building Register Lookup
document.getElementById('btn-fetch-building').addEventListener('click', fetchBuildingInfo);

document.getElementById('btn-apply-building').addEventListener('click', () => {
    if (!_lastBuildingResult) return;
    // Fill floor area with raw total (二쇨굔異뺣Ъ ?곕㈃??
    const rawArea = _lastBuildingResult['_rawMainArea'];
    const purpose = _lastBuildingResult['_rawPurpose'];
    const bldName = _lastBuildingResult['嫄댁텞臾쇰챸'];

    if (rawArea) {
        document.getElementById('floor-area').value = rawArea.toFixed(2);
        state.floorArea = rawArea;
    }
    // ?ъ슜?뱀씤???먮룞 ?낅젰
    const aprDay = _lastBuildingResult['?ъ슜?뱀씤??];
    if (aprDay && aprDay !== '-') {
        // YYYYMMDD ??YYYY-MM-DD ?щ㎎??        const fmt = aprDay.length === 8
            ? `${aprDay.slice(0, 4)}-${aprDay.slice(4, 6)}-${aprDay.slice(6, 8)}`
            : aprDay;
        document.getElementById('use-apr-day').value = fmt;
        state.useAprDay = fmt;
    }
    // 二쇱슜??(?곸쐞 3媛?
    const topPurpose = _lastBuildingResult['二쇱슜??];
    if (topPurpose && topPurpose !== '-') {
        document.getElementById('purpose').value = topPurpose;
        state.purpose = topPurpose;
    }
    if (bldName && bldName !== '-' && !state.customerName) {
        document.getElementById('customer-name').value = bldName;
        state.customerName = bldName;
    }
    calculate();

    // Visual feedback
    const btn = document.getElementById('btn-apply-building');
    btn.textContent = '???곸슜 ?꾨즺!';
    btn.style.background = '#059669';
    setTimeout(() => {
        btn.innerHTML = '????媛믪쑝濡??곸슜';
        btn.style.background = '#10b981';
    }, 2000);
});


document.getElementById('purpose').addEventListener('input', (e) => {
    state.purpose = e.target.value;
});

document.getElementById('use-apr-day').addEventListener('input', (e) => {
    state.useAprDay = e.target.value;
});

document.getElementById('manager').addEventListener('input', (e) => {
    state.manager = e.target.value;
});

// ---- ?꾪솕踰덊샇 ?먮룞 ?щ㎎???좏떥 ----
function formatPhone(value) {
    // ?レ옄留?異붿텧, 理쒕? 11?먮━
    const digits = value.replace(/\D/g, '').slice(0, 11);
    const len = digits.length;

    if (digits.startsWith('02')) {
        // ?쒖슱 (02): 02-XXXX-XXXX ?먮뒗 02-XXX-XXXX
        if (len < 3) return digits;                                                    // 02
        if (len < 6) return digits.slice(0, 2) + '-' + digits.slice(2);               // 02-XXX
        if (len < 10) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5); // 02-XXX-XXXX
        return digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6);    // 02-XXXX-XXXX
    } else {
        // 010 / 031 ??3?먮━ 援?쾲
        if (len < 4) return digits;                                                    // 010
        if (len < 7) return digits.slice(0, 3) + '-' + digits.slice(3);               // 010-XXXX
        if (len < 11) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6); // 010-XXX-XXXX
        return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);    // 010-XXXX-XXXX
    }
}

const managerPhoneEl = document.getElementById('manager-phone');
if (managerPhoneEl) {
    managerPhoneEl.addEventListener('input', function () {
        const pos = this.selectionStart;             // ?낅젰 ??而ㅼ꽌 ?꾩튂
        const before = this.value;
        const formatted = formatPhone(this.value);

        // ?щ㎎??寃곌낵媛 ?ㅻ? ?뚮쭔 ??뼱?곌린 (洹몃젃吏 ?딆쑝硫??뱀젙 ?섍꼍?먯꽌 ?낅젰??留됲엳嫄곕굹 ?뱁엳???꾩긽 諛쒖깮)
        if (before !== formatted) {
            this.value = formatted;
            // 而ㅼ꽌 ?꾩튂 蹂댁젙: 異붽????섏씠????留뚰겮 ?욎쑝濡?諛湲?            const added = formatted.length - before.length;
            const newPos = Math.max(0, pos + added);
            this.setSelectionRange(newPos, newPos);
        }
        state.managerPhone = formatted;
    });
} else {
    console.error('[?붾쾭洹? #manager-phone ?붿냼瑜?李얠쓣 ???놁뒿?덈떎.');
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

// ?곸뾽 ?대떦??蹂寃????곕씫泥??먮룞 ?낅젰
document.getElementById('sales-manager').addEventListener('change', (e) => {
    const selectedName = e.target.value;
    const manager = SALES_MANAGERS.find(m => m.name === selectedName);

    state.salesManager = selectedName;
    state.salesManagerPhone = manager ? manager.phone : "";

    // UI ?낅뜲?댄듃
    const phoneInput = document.getElementById('sales-manager-phone');
    if (phoneInput) {
        phoneInput.value = state.salesManagerPhone;
    }
});

// ---- Condition Table Inputs ----
const COND_INPUT_MAP = {
    'cond-monthly-appointment': 'monthlyAppointment',
    'cond-yearly-appointment': 'yearlyAppointment',
    'cond-yearly-maintenance': 'yearlyMaintenance',
    'cond-yearly-inspection': 'yearlyInspection',
    'cond-inspection-workers': 'inspectionWorkers',
    'cond-maintenance-workers': 'maintenanceWorkers',
};
const COST_FIELDS = new Set(['cond-monthly-appointment', 'cond-yearly-appointment', 'cond-yearly-maintenance', 'cond-yearly-inspection']);

Object.entries(COND_INPUT_MAP).forEach(([elId, stateKey]) => {
    const el = document.getElementById(elId);
    if (!el) return;

    // input: strip commas ??parse ??save override ??recalc
    el.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/,/g, '');
        const val = parseFloat(raw);
        if (!isNaN(val)) {
            state.condOverride[stateKey] = val;

            // ???④? ?섏젙 ???곌컙 ?⑷퀎 ?먮룞 怨꾩궛 (?먮뒗 諛섎?)
            if (elId === 'cond-monthly-appointment') {
                state.condOverride.yearlyAppointment = val * 12;
            } else if (elId === 'cond-yearly-appointment') {
                state.condOverride.monthlyAppointment = val / 12;
            }
        } else {
            delete state.condOverride[stateKey];
            if (elId === 'cond-monthly-appointment') delete state.condOverride.yearlyAppointment;
            if (elId === 'cond-yearly-appointment') delete state.condOverride.monthlyAppointment;
        }
        calculate();
    });

    // focus: show raw number (no commas) for easier editing
    if (COST_FIELDS.has(elId)) {
        el.addEventListener('focus', (e) => {
            const raw = e.target.value.replace(/,/g, '');
            e.target.value = raw;
        });
        // blur: reformat with commas
        el.addEventListener('blur', (e) => {
            const raw = parseFloat(e.target.value.replace(/,/g, ''));
            if (!isNaN(raw)) {
                e.target.value = Math.round(raw).toLocaleString('ko-KR');
            }
        });
    }
});

document.getElementById('cond-maintenance-frequency').addEventListener('input', (e) => {
    state.maintenanceFrequency = e.target.value;
    updateUI();
});
document.getElementById('cond-appointment-frequency').addEventListener('input', (e) => {
    state.appointmentFrequency = e.target.value;
    updateUI();
});


// Reset: show address search again (Step 1)
document.getElementById('btn-reset-addr').addEventListener('click', () => {
    // State reset
    state.address = "";
    state.customerName = "";
    state.buildingName = "";
    state.floorArea = 0;
    state.purpose = "";
    state.useAprDay = "";
    state.managerPhone = "";
    state.salesManager = "";
    state.maintenanceFrequency = "2??;
    state.appointmentFrequency = "12媛쒖썡";
    state.condOverride = {};
    state.itemToggles = { appointment: true, maintenance: true, inspection: true };
    state._lastConditionArea = -1;
    _lastBuildingResult = null;

    // Form fields reset
    document.getElementById('customer-name').value = "";
    document.getElementById('floor-area').value = "";
    document.getElementById('floor-grade').value = "";
    document.getElementById('use-apr-day').value = "";
    document.getElementById('purpose').value = "";
    document.getElementById('manager').value = "";
    document.getElementById('manager-phone').value = "";
    document.getElementById('sales-manager').value = "";

    // Building register UI reset
    document.getElementById('building-result-panel').style.display = 'none';
    document.getElementById('building-fetch-status').style.display = 'none';
    document.getElementById('building-result-content').innerHTML = '';

    // Re-init Kakao embed (clear and re-embed)
    const container = document.getElementById('kakao-embed-container');
    if (container) {
        container.innerHTML = '';
        initKakaoSearch();
    }
    
    goToStep(1);
});

// Tab Switching (only buttons in #tab-bar)
document.getElementById('tab-bar').querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('tab-bar').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// LibreOffice PDF ?쒕쾭 URL (?곷? 寃쎈줈濡?蹂寃쏀븯???듯빀 ?몄뒪???섍꼍?????
// [媛쒕컻 ?섍꼍 二쇱쓽] 濡쒖뺄 ?섍꼍(concurrently ???먯꽌???꾨줎??3000踰? 諛깆뿏??3001踰????ы듃媛 遺꾨━?????덉쑝誘濡?// ?꾩옱 ?몄뒪?멸? 3000 踰??ы듃??寃쎌슦 紐낆떆?곸쑝濡?3001 踰?諛깆뿏?쒕? 諛붾씪蹂대룄濡?遺꾧린 泥섎━?⑸땲??
const PDF_SERVER_URL = (window.location.port === '3000' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/generate-pdf'
    : '/generate-pdf';

// ---- Mapping Logic for Export ----
function generateMapping() {
    const today = new Date().toISOString().slice(0, 10);
    const costs = state.results.costs;
    const subtotal = costs.inspection + costs.maintenance + costs.appointment;

    // ?몄엫?④? 횞 ?ъ엯?몄썝 湲곕컲 ?멸굔鍮??곗텧
    const inspB = calcLaborBreakdown(state.results.inspectionWorkers, state.results.grade);
    const maintB = calcLaborBreakdown(state.results.maintenanceWorkers, state.results.grade);

    // ?좎엫 ?곗텧?댁뿭? 寃ъ쟻 議곌굔?????ъ엯?몄썝 ?꾨뱶媛 蹂꾨룄濡??놁쑝??
    // "?깃툒蹂??좎엫 ?몄썝?섏뿉 ?곕Ⅸ 1紐??쇰줈 ?좊떦???먰븯誘濡? 
    // ?좎엫 ?곹깭(itemToggles.appointment)媛 耳쒖졇?덉쑝硫?1紐낆쑝濡?怨꾩궛?⑸땲??
    const appWorkers = state.itemToggles.appointment ? 1 : 0;
    const appB = calcLaborBreakdown(appWorkers, state.results.grade);

    return {
        "?쒖?": [
            { name: "怨좉컼紐?, cell: "F10", value: state.customerName }
        ],
        "1. 寃ъ쟻??: [
            { name: "寃ъ쟻??, cell: "E8", value: today },
            { name: "怨좉컼紐?, cell: "E9", value: state.customerName },
            { name: "二쇱냼", cell: "J15", value: state.address },
            { name: "?ъ슜?뱀씤??, cell: "J16", value: state.useAprDay },
            { name: "二쇱슜??, cell: "J17", value: state.purpose },
            { name: "?곕㈃??, cell: "W17", value: state.floorArea },
            { name: "?대떦?먮챸", cell: "J18", value: state.manager },
            { name: "?대떦???곕씫泥?, cell: "W18", value: state.managerPhone },
            { name: "?곸뾽 ?대떦??, cell: "Q12", value: state.salesManager },
            { name: "?곸뾽 ?대떦???곕씫泥?, cell: "X12", value: state.salesManagerPhone },
            { name: "?깅뒫?먭?鍮?, cell: "T23", value: costs.inspection },
            { name: "?좎??먭?鍮?, cell: "T24", value: costs.maintenance },
            { name: "?꾪긽?좎엫鍮?, cell: "T25", value: costs.appointment },
            { name: "?⑷퀎(?좎씤??", cell: "T26", value: subtotal },
            { name: "理쒖쥌 ?곌컙 湲덉븸", cell: "T27", value: costs.yearly },
            { name: "???⑸???, cell: "T28", value: costs.monthly },
            { name: "嫄대Ъ?깃툒", cell: "Y25", value: state.results.grade }
        ],
        "2.1 ?깅뒫?먭? ?곗텧?댁뿭": [
            { name: "?깅뒫 ?밴툒 ?먭??몄썝 ??, cell: "E6", value: inspB.rows[0].workers },
            { name: "?깅뒫 怨좉툒 ?먭??몄썝 ??, cell: "E7", value: inspB.rows[1].workers },
            { name: "?깅뒫 以묎툒 ?먭??몄썝 ??, cell: "E8", value: inspB.rows[2].workers },
            { name: "?깅뒫 珥덇툒 ?먭??몄썝 ??, cell: "E9", value: inspB.rows[3].workers },
            { name: "?깅뒫 ?밴툒 ?먭? ?몄엫 ?④?", cell: "G6", value: inspB.rows[0].wage },
            { name: "?깅뒫 怨좉툒 ?먭? ?몄엫 ?④?", cell: "G7", value: inspB.rows[1].wage },
            { name: "?깅뒫 以묎툒 ?먭? ?몄엫 ?④?", cell: "G8", value: inspB.rows[2].wage },
            { name: "?깅뒫 珥덇툒 ?먭? ?몄엫 ?④?", cell: "G9", value: inspB.rows[3].wage },
            { name: "?멸굔鍮?, cell: "H10", value: inspB.labor },
            { name: "吏곸젒寃쎈퉬", cell: "H11", value: inspB.expense },
            { name: "?쒓꼍鍮?, cell: "H12", value: inspB.general },
            { name: "湲곗닠猷?, cell: "H13", value: inspB.tech },
            { name: "?깅뒫 ?곗텧?⑷퀎", cell: "H14", value: inspB.total },
            { name: "?깅뒫 議곗젙湲덉븸", cell: "H15", value: costs.inspection - inspB.total },
            { name: "?깅뒫 理쒖쥌?⑷퀎", cell: "H17", value: costs.inspection },
            { name: "?ъ엯?몃젰", cell: "O6", value: state.results.inspectionWorkers }
        ],
        "2.2 ?좎??먭? ?곗텧?댁뿭": [
            { name: "?좎? ?밴툒 ?먭??몄썝 ??, cell: "E6", value: maintB.rows[0].workers },
            { name: "?좎? 怨좉툒 ?먭??몄썝 ??, cell: "E7", value: maintB.rows[1].workers },
            { name: "?좎? 以묎툒 ?먭??몄썝 ??, cell: "E8", value: maintB.rows[2].workers },
            { name: "?좎? 珥덇툒 ?먭??몄썝 ??, cell: "E9", value: maintB.rows[3].workers },
            { name: "?좎? ?밴툒 ?먭? ?몄엫 ?④?", cell: "G6", value: maintB.rows[0].wage },
            { name: "?좎? 怨좉툒 ?먭? ?몄엫 ?④?", cell: "G7", value: maintB.rows[1].wage },
            { name: "?좎? 以묎툒 ?먭? ?몄엫 ?④?", cell: "G8", value: maintB.rows[2].wage },
            { name: "?좎? 珥덇툒 ?먭? ?몄엫 ?④?", cell: "G9", value: maintB.rows[3].wage },
            { name: "?멸굔鍮?, cell: "H10", value: maintB.labor },
            { name: "吏곸젒寃쎈퉬", cell: "H11", value: maintB.expense },
            { name: "?쒓꼍鍮?, cell: "H12", value: maintB.general },
            { name: "湲곗닠猷?, cell: "H13", value: maintB.tech },
            { name: "?좎? ?곗텧?⑷퀎", cell: "H14", value: maintB.total },
            { name: "?좎? 議곗젙湲덉븸", cell: "H15", value: costs.maintenance - maintB.total },
            { name: "?좎? 理쒖쥌?⑷퀎", cell: "H17", value: costs.maintenance },
            { name: "?ъ엯?몃젰", cell: "O6", value: state.results.maintenanceWorkers }
        ],
        "2.3 ?좎엫 ?곗텧?댁뿭": [
            { name: "?좎엫 ?밴툒 ?먭??몄썝 ??, cell: "E6", value: appB.rows[0].workers },
            { name: "?좎엫 怨좉툒 ?먭??몄썝 ??, cell: "E7", value: appB.rows[1].workers },
            { name: "?좎엫 以묎툒 ?먭??몄썝 ??, cell: "E8", value: appB.rows[2].workers },
            { name: "?좎엫 珥덇툒 ?먭??몄썝 ??, cell: "E9", value: appB.rows[3].workers },
            { name: "?좎엫 ?밴툒 ?먭? ?몄엫 ?④?", cell: "G6", value: appB.rows[0].wage },
            { name: "?좎엫 怨좉툒 ?먭? ?몄엫 ?④?", cell: "G7", value: appB.rows[1].wage },
            { name: "?좎엫 以묎툒 ?먭? ?몄엫 ?④?", cell: "G8", value: appB.rows[2].wage },
            { name: "?좎엫 珥덇툒 ?먭? ?몄엫 ?④?", cell: "G9", value: appB.rows[3].wage },
            { name: "?멸굔鍮?, cell: "H10", value: appB.labor },
            { name: "吏곸젒寃쎈퉬", cell: "H11", value: appB.expense },
            { name: "?쒓꼍鍮?, cell: "H12", value: appB.general },
            { name: "湲곗닠猷?, cell: "H13", value: appB.tech },
            { name: "?곗텧?⑷퀎", cell: "H14", value: appB.total },
            { name: "議곗젙湲덉븸", cell: "H15", value: costs.appointment - appB.total },
            { name: "理쒖쥌?⑷퀎", cell: "H17", value: costs.appointment },
            { name: "?ъ엯?몃젰", cell: "O6", value: 0 }
        ],
        "4. ?깅뒫?먭? ?섎웾?댁뿭": [
            { name: "議곗젙怨꾩닔", cell: "F4", value: state.results.coef }
        ]
    };
}

// ---- ?곹깭 ?쒖떆 ?ы띁 ----
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

// ---- PDF 踰꾪듉 ?쒖꽦/鍮꾪솢???ы띁 ----
function setPdfBtnEnabled(enabled) {
    const pdfBtn = document.getElementById('btn-save-pdf');
    if (!pdfBtn) return;
    pdfBtn.disabled = !enabled;
    pdfBtn.style.opacity = enabled ? '1' : '0.4';
    pdfBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
}

// PDF ???踰꾪듉 - LibreOffice ?쒕쾭 ?몄텧
document.getElementById('btn-save-pdf').addEventListener('click', async () => {
    const mapping = generateMapping();
    const btn = document.getElementById('btn-save-pdf');

    // ?곕㈃???좏슚??寃??    if (!state.floorArea || state.floorArea < 5000) {
        showStatusBar('?좑툘 ?곕㈃?곸쓣 癒쇱? ?낅젰?댁＜?몄슂. (5,000???댁긽)', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PDF ?앹꽦 以?..';
    showStatusBar('<i class="fas fa-spinner fa-spin"></i> Excel ?곗씠???낅젰 諛?LibreOffice PDF 蹂??以?.. (??10珥??뚯슂)', 'info');

    try {
        // 1. PDF ?쒕쾭 ?몄텧 (?ㅼ슫濡쒕뱶??
        const pdfRes = await fetch(PDF_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapping)
        });

        if (!pdfRes.ok) {
            const errData = await pdfRes.json().catch(() => ({ error: pdfRes.statusText }));
            throw new Error(errData.error || `PDF ?쒕쾭 ?ㅻ쪟 (${pdfRes.status})`);
        }

        // 2. PDF ?ㅼ슫濡쒕뱶 泥섎━
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const disposition = pdfRes.headers.get('Content-Disposition') || '';
        const nameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
        const fileName = nameMatch ? decodeURIComponent(nameMatch[1]) : `${state.customerName || '寃ъ쟻??}_寃ъ쟻??pdf`;

        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 3. ?먯뼱?뚯씠釉????諛?PDF ?낅줈??(?듯빀 ?숈옉)
        showStatusBar('<i class="fas fa-spinner fa-spin"></i> ?먯뼱?뚯씠釉?DB 湲곕줉 諛?PDF ?낅줈??以?..', 'info');
        try {
            const airResult = await window.airtableService.saveQuotation(state);
            showStatusBar(`??<b>${fileName}</b> ?ㅼ슫濡쒕뱶 諛??먯뼱?뚯씠釉?????깃났!`, 'success');
            
            // 愿由ъ옄 ?꾧뎄??理쒓렐 湲곕줉 ?낅뜲?댄듃
            if (airResult && airResult.quotationId) {
                const recordUrl = `https://airtable.com/appFEZaTg3yZU1QwW/tbloif1mheDqaRRuR/${airResult.quotationId}`;
                const recentEl = document.getElementById('status-recent-record');
                if (recentEl) {
                    recentEl.innerHTML = `<a href="${recordUrl}" target="_blank" style="color:var(--toss-blue); font-weight:600; text-decoration:none;">蹂닿린 <i class="fas fa-external-link-alt" style="font-size:0.75rem;"></i></a>`;
                }
            }
        } catch (airErr) {
            console.error('[Airtable Integration Error]:', airErr);
            showStatusBar(`??PDF???앹꽦?섏뿀?쇰굹, ?먯뼱?뚯씠釉???μ뿉 ?ㅽ뙣?덉뒿?덈떎: ${airErr.message}`, 'warning');
        }

        btn.innerHTML = '<i class="fas fa-check-circle"></i> 寃ъ쟻??諛쒗뻾 ?꾨즺';
        
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-file-pdf"></i> 寃ъ쟻??PDF ?앹꽦 諛????;
            btn.disabled = false;
        }, 3000);

    } catch (err) {
        console.error('寃ъ쟻 諛쒗뻾 ?ㅻ쪟:', err);
        let msg = err.message;
        if (err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
            msg = '?쒕쾭???곌껐?????놁뒿?덈떎. ?곕??먯뿉??<code>node server.js</code>瑜??뺤씤?댁＜?몄슂.';
        }
        showStatusBar(`???ㅻ쪟: ${msg}`, 'error');
        btn.innerHTML = '<i class="fas fa-file-pdf"></i> 寃ъ쟻??PDF ?앹꽦 諛????;
        btn.disabled = false;
    }
});



// ?먯뼱?뚯씠釉????踰꾪듉 濡쒖쭅 (?듯빀?섏뿀吏留?踰꾪듉???⑥븘?덉쓣 寃쎌슦瑜??鍮꾪빐 ?좎? ?먮뒗 湲곕뒫 ?곌껐)
const btnAirtable = document.getElementById('btn-save-airtable');
if (btnAirtable) {
    btnAirtable.style.display = 'none'; // ?듯빀?섏뿀?쇰?濡?UI?먯꽌 ?④? (?붿옄???좎? ?먯튃???곕씪 肄붾뱶濡??쒖뼱)
}
const btnJson = document.getElementById('btn-view-json');
if (btnJson) btnJson.style.display = 'none';

// 愿由ъ옄 ?꾧뎄(JSON ?뺤씤) ?몃━嫄?const adminTrigger = document.getElementById('admin-trigger');
if (adminTrigger) {
    adminTrigger.addEventListener('click', async () => {
        // 紐⑤떖 ?닿린
        document.getElementById('modal-admin').style.display = 'flex';
        
        // JSON ?곗씠??媛깆떊
        const mapping = generateMapping();
        document.getElementById('json-result').textContent = JSON.stringify(mapping, null, 2);
        
        // ?쒕쾭 ?곹깭 泥댄겕
        const statusEl = document.getElementById('status-pdf-server');
        statusEl.textContent = '?뺤씤 以?..';
        statusEl.style.color = 'var(--toss-text-muted)';
        
        try {
            const res = await fetch(`${BACKEND_URL}/health`);
            if (res.ok) {
                statusEl.textContent = '?뺤긽 (Connected)';
                statusEl.style.color = '#15803d';
            } else {
                throw new Error();
            }
        } catch {
            statusEl.textContent = '?곌껐 ?ㅽ뙣 (Disconnected)';
            statusEl.style.color = '#b91c1c';
        }
    });
}

// 愿由ъ옄 ???꾪솚
document.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.adminTab;
        
        // 踰꾪듉 ?쒖꽦??泥섎━
        btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 肄섑뀗痢??쒖떆 泥섎━
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.style.display = (content.id === targetTab) ? 'flex' : 'none';
        });
    });
});

// 愿由ъ옄: ?섎룞 ?숆린??document.getElementById('btn-admin-manual-sync').addEventListener('click', async () => {
    const btn = document.getElementById('btn-admin-manual-sync');
    btn.disabled = true;
    btn.textContent = '?꾩넚 以?..';
    
    try {
        const airResult = await window.airtableService.saveQuotation(state);
        alert('?먯뼱?뚯씠釉??섎룞 ?숆린?붽? ?깃났?덉뒿?덈떎.');
        
        // 理쒓렐 湲곕줉 留곹겕 ?낅뜲?댄듃
        if (airResult && airResult.quotationId) {
            const recordUrl = `https://airtable.com/appFEZaTg3yZU1QwW/tbloif1mheDqaRRuR/${airResult.quotationId}`;
            const recentEl = document.getElementById('status-recent-record');
            if (recentEl) {
                recentEl.innerHTML = `<a href="${recordUrl}" target="_blank" style="color:var(--toss-blue); font-weight:600; text-decoration:none;">蹂닿린 <i class="fas fa-external-link-alt" style="font-size:0.75rem;"></i></a>`;
            }
        }
    } catch (err) {
        alert('?숆린???ㅽ뙣: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '?먯뼱?뚯씠釉??섎룞 ?숆린???ㅽ뻾';
    }
});

// 愿由ъ옄: 媛뺤젣 珥덇린??(湲곗〈 由ъ뀑 踰꾪듉 湲곕뒫 ?쒖슜)
document.getElementById('btn-admin-reset').addEventListener('click', () => {
    if (confirm('?뺣쭚濡?紐⑤뱺 ?낅젰 ?곗씠?곕? 珥덇린?뷀븯怨?1?④퀎濡??뚯븘媛?쒓쿋?듬땲源?')) {
        document.getElementById('btn-reset-addr').click();
        document.getElementById('modal-admin').style.display = 'none';
        showStatusBar('?쒖뒪?쒖씠 ?깃났?곸쑝濡?珥덇린?붾릺?덉뒿?덈떎.', 'success');
    }
});

document.getElementById('btn-admin-close').addEventListener('click', () => {
    document.getElementById('modal-admin').style.display = 'none';
});

// ---- Initialize ----
// 移댁뭅??Postcode ?ㅽ겕由쏀듃 濡쒕뱶 ?꾨즺 ??initKakaoSearch()瑜??ㅽ뻾?⑸땲??
// index.html???숈쟻 濡쒕뱶 諛⑹떇怨??곕룞: ?대? 濡쒕뱶?먯쑝硫?利됱떆, ?꾨땲硫?肄쒕갚?쇰줈.
function _startKakaoSearch() {
    if (typeof daum !== 'undefined' && typeof daum.Postcode !== 'undefined') {
        initKakaoSearch();
    } else {
        // daum???꾩쭅 以鍮꾨릺吏 ?딆? 寃쎌슦 100ms ???ъ떆??        console.warn('[移댁뭅?ㅻ㏊] daum.Postcode 誘몄?鍮?- ?ъ떆??以?..');
        setTimeout(_startKakaoSearch, 100);
    }
}

if (window._kakaoPostcodeLoaded) {
    // ?ㅽ겕由쏀듃媛 ?대? 濡쒕뱶 ?꾨즺??寃쎌슦 (利됱떆 ?ㅽ뻾)
    _startKakaoSearch();
} else {
    // ?꾩쭅 濡쒕뱶 以묒씤 寃쎌슦: index.html??onload 肄쒕갚 ?깅줉
    window._onKakaoPostcodeReady = _startKakaoSearch;
}

// ---- Adjuster Buttons (+/-) ----
document.querySelectorAll('.btn-adj').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = btn.dataset.target;
        const adj = parseFloat(btn.dataset.adj);
        const stateKey = COND_INPUT_MAP[targetId];
        if (!stateKey) return;

        // ?꾩옱 媛?媛?몄삤湲?(lookupCondition??湲곕낯媛??먮뒗 ?꾩옱 override??媛?
        const area = state.floorArea || 0;
        if (area < 5000) return;
        const condition = lookupCondition(area);
        const currentVal = state.condOverride[stateKey] ?? condition[stateKey];

        // ?덈줈??媛?怨꾩궛 (0 誘몃쭔 諛⑹?)
        const newVal = Math.max(0, currentVal + adj);
        state.condOverride[stateKey] = newVal;

        // ?곕룞 濡쒖쭅 (???곌컙 ?④?)
        if (targetId === 'cond-monthly-appointment') {
            state.condOverride.yearlyAppointment = newVal * 12;
        } else if (targetId === 'cond-yearly-appointment') {
            state.condOverride.monthlyAppointment = newVal / 12;
        }

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
        // ?좎씤??踰붿쐞 ?쒗븳 (0% ~ 100%)
        state.discount = Math.min(100, Math.max(0, state.discount + adj));
        calculate();
    });
});

// ---- Step Navigation Wizard ----
let currentStep = 1;

window.goToStep = function(step) {
    // Basic Validation before leaving current step
    if (step === 2 && currentStep === 1) {
        if (!state.address) {
            alert("二쇱냼瑜?癒쇱? 寃?됲븯怨??좏깮?댁＜?몄슂.");
            return;
        }
    }
    if (step === 3 && currentStep === 2) {
        if (!state.floorArea || state.floorArea < 5000) {
            alert("?곕㈃?곸씠 遺議깊븯嫄곕굹 ?낅젰?섏? ?딆븯?듬땲?? (理쒖냼 5,000??");
            return;
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

// Start explicitly at Step 1
goToStep(1);
