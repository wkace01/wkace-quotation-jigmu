// ---- Master Data ----
// 異쒖쿂: ?뺣낫?듭떊 寃ъ쟻 議곌굔??(?대?吏 湲곗?)
window.CONSTANTS = {
    QUOTATION_CONDITIONS: [
        // 5,000?댁긽 ~ 10,000誘몃쭔: 珥덇툒
        { area: 5000, grade: "珥덇툒", monthlyAppointment: 80000, yearlyAppointment: 960000, yearlyMaintenance: 360000, yearlyInspection: 1080000, inspectionWorkers: 4, maintenanceWorkers: 4 },
        // 10,000?댁긽 ~ 15,000誘몃쭔: 珥덇툒
        { area: 10000, grade: "珥덇툒", monthlyAppointment: 80000, yearlyAppointment: 960000, yearlyMaintenance: 405000, yearlyInspection: 1335000, inspectionWorkers: 4, maintenanceWorkers: 4 },
        // 15,000?댁긽 ~ 30,000誘몃쭔: 以묎툒
        { area: 15000, grade: "以묎툒", monthlyAppointment: 130000, yearlyAppointment: 1560000, yearlyMaintenance: 495000, yearlyInspection: 1245000, inspectionWorkers: 6, maintenanceWorkers: 6 },
        // 30,000?댁긽 ~ 60,000誘몃쭔: 怨좉툒
        { area: 30000, grade: "怨좉툒", monthlyAppointment: 150000, yearlyAppointment: 1800000, yearlyMaintenance: 600000, yearlyInspection: 1600000, inspectionWorkers: 8, maintenanceWorkers: 8 },
        // 60,000?댁긽 ~ 150,000誘몃쭔: ?밴툒
        { area: 60000, grade: "?밴툒", monthlyAppointment: 180000, yearlyAppointment: 2160000, yearlyMaintenance: 1044000, yearlyInspection: 3756000, inspectionWorkers: 10, maintenanceWorkers: 10 },
        // 150,000?댁긽: ?밴툒
        { area: 150000, grade: "?밴툒", monthlyAppointment: 200000, yearlyAppointment: 2400000, yearlyMaintenance: 1035000, yearlyInspection: 3465000, inspectionWorkers: 10, maintenanceWorkers: 10 }
    ],

    ADJUSTMENT_COEFFICIENTS: [
        // 異쒖쿂: ?곕㈃?곸뿉 ?곕Ⅸ 議곗젙怨꾩닔 ??(?대?吏 湲곗?)
        { area: 5000, coef: 1.15 },  // 5,000  ?댁긽 ~ 10,000 誘몃쭔
        { area: 10000, coef: 1.30 },  // 10,000 ?댁긽 ~ 15,000 誘몃쭔
        { area: 15000, coef: 1.45 },  // 15,000 ?댁긽 ~ 20,000 誘몃쭔
        { area: 20000, coef: 1.60 },  // 20,000 ?댁긽 ~ 25,000 誘몃쭔
        { area: 25000, coef: 1.75 },  // 25,000 ?댁긽 ~ 30,000 誘몃쭔
        { area: 30000, coef: 1.90 },  // 30,000 ?댁긽 ~ 35,000 誘몃쭔
        { area: 35000, coef: 2.05 },  // 35,000 ?댁긽 ~ 40,000 誘몃쭔
        { area: 40000, coef: 2.20 },  // 40,000 ?댁긽 ~ 45,000 誘몃쭔
        { area: 45000, coef: 2.35 },  // 45,000 ?댁긽 ~ 50,000 誘몃쭔
        { area: 50000, coef: 2.50 },  // 50,000 ?댁긽 ~ 55,000 誘몃쭔
        { area: 55000, coef: 2.65 },  // 55,000 ?댁긽 ~ 60,000 誘몃쭔
        { area: 60000, coef: 2.80 },  // 60,000 ?댁긽
    ],

    SALES_MANAGERS: [
        { name: "諛뺤쭊泥?, phone: "010-7130-8285" },
        { name: "?꾪븰鍮?, phone: "010-4259-2044" },
        { name: "怨듬??", phone: "010-2486-8571" },
        { name: "?댄깭??, phone: "010-3855-3416" },
        { name: "?꾨Т??, phone: "010-5269-5357" },
        { name: "源?쒗썕", phone: "010-5393-1308" },
        { name: "?댁젙援?, phone: "010-5474-3414" },
        { name: "?댁듅??, phone: "010-2395-5603" },
        { name: "源?숈닔", phone: "010-3255-2473" },
        { name: "源李ъ쭊", phone: "010-4101-5891" },
        { name: "?좏솉誘?, phone: "010-6550-7169" },
        { name: "?쒖텣援?, phone: "010-9162-2995" },
        { name: "諛뺣???, phone: "010-4458-3472" },
        { name: "?댁슦??, phone: "010-2494-4756" },
        { name: "怨좎쑄??, phone: "010-2871-5485" }
    ],

    GRADE_STYLES: {
        '珥덇툒': { color: '#2563eb', label: '珥덇툒' },
        '以묎툒': { color: '#16a34a', label: '以묎툒' },
        '怨좉툒': { color: '#d97706', label: '怨좉툒' },
        '?밴툒': { color: '#dc2626', label: '?밴툒' }
    },

    GRADE_WAGES: {
        '?밴툒': 330713,
        '怨좉툒': 301470,
        '以묎툒': 272298,
        '珥덇툒': 234973,
    },

    GRADE_ORDER: ['?밴툒', '怨좉툒', '以묎툒', '珥덇툒'],

    // ?곕㈃??援ш컙 ?덉씠釉?(怨꾩궛???붿빟??
    COND_RANGE_LABELS: {
        5000: "5,000??10,000??,
        10000: "10,000??15,000??,
        15000: "15,000??30,000??,
        30000: "30,000??60,000??,
        60000: "60,000??150,000??,
        150000: "150,000???댁긽"
    }
};
