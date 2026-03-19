/**
 * Master Data for Quotation Automation
 */

export const LABOR_RATES = {
    "특급 기술자": 330713,
    "고급 기술자": 301470,
    "중급 기술자": 272298,
    "초급 기술자": 234973
};

export const QUOTATION_CONDITIONS = [
    { area: 5000, label: "5,000㎡~1만㎡", grade: "초급", monthlyTotal: 225000, yearlyTotal: 2700000, monthlyAppointment: 80000, yearlyAppointment: 960000, yearlyMaintenance: 405000, yearlyInspection: 1335000, inspectionWorkers: 4, maintenanceWorkers: 4 },
    { area: 10000, label: "1만㎡~1.5만㎡", grade: "초급", monthlyTotal: 225000, yearlyTotal: 2700000, monthlyAppointment: 80000, yearlyAppointment: 960000, yearlyMaintenance: 405000, yearlyInspection: 1335000, inspectionWorkers: 4, maintenanceWorkers: 4 },
    { area: 15000, label: "1.5만㎡~3만㎡", grade: "중급", monthlyTotal: 300000, yearlyTotal: 3600000, monthlyAppointment: 120000, yearlyAppointment: 1440000, yearlyMaintenance: 540000, yearlyInspection: 1620000, inspectionWorkers: 6, maintenanceWorkers: 6 },
    { area: 30000, label: "3만㎡~6만㎡", grade: "고급", monthlyTotal: 400000, yearlyTotal: 4800000, monthlyAppointment: 170000, yearlyAppointment: 2040000, yearlyMaintenance: 720000, yearlyInspection: 2040000, inspectionWorkers: 8, maintenanceWorkers: 8 },
    { area: 60000, label: "6만㎡ 이상", grade: "특급", monthlyTotal: 500000, yearlyTotal: 6000000, monthlyAppointment: 200000, yearlyAppointment: 2400000, yearlyMaintenance: 90000, yearlyInspection: 2700000, inspectionWorkers: 10, maintenanceWorkers: 10 }
];

export const ADJUSTMENT_COEFFICIENTS = [
    { area: 5000, coef: 1.15 },
    { area: 10000, coef: 1.30 },
    { area: 15000, coef: 1.50 },
    { area: 30000, coef: 1.75 },
    { area: 60000, coef: 2.00 }
];

export const EQUIPMENT_ITEMS = [
    { id: 1, category: "1. 통신설비", name: "케이블설비", baseWorker: 0.29 },
    { id: 2, category: "1. 통신설비", name: "배관설비", baseWorker: 0.58 },
    { id: 3, category: "1. 통신설비", name: "국선인입설비", baseWorker: 0.17 },
    { id: 4, category: "1. 통신설비", name: "단자함설비", baseWorker: 0.24 },
    { id: 5, category: "1. 통신설비", name: "이동통신구내선로설비", baseWorker: 0.06 },
    { id: 6, category: "1. 통신설비", name: "전화설비", baseWorker: 0.10 },
    { id: 7, category: "1. 통신설비", name: "방송 공동수신 안테나시설", baseWorker: 0.89 },
    { id: 8, category: "1. 통신설비", name: "종합유선방송 구내전송선로설비", baseWorker: 0.52 },
    { id: 9, category: "2. 방송설비", name: "방송음향설비", baseWorker: 0.50 },
    { id: 10, category: "3. 정보설비", name: "네트워크설비", baseWorker: 1.85 },
    { id: 11, category: "3. 정보설비", name: "전자출입(통제)시스템", baseWorker: 0.83 },
    { id: 12, category: "3. 정보설비", name: "영상정보처리기기 시스템", baseWorker: 0.81 },
    { id: 13, category: "3. 정보설비", name: "원격검침시스템", baseWorker: 0.52 },
    { id: 14, category: "3. 정보설비", name: "주차관제시스템", baseWorker: 2.45 },
    { id: 15, category: "3. 정보설비", name: "주차유도시스템", baseWorker: 0.66 },
    { id: 16, category: "3. 정보설비", name: "무인택배시스템", baseWorker: 0.77 },
    { id: 17, category: "3. 정보설비", name: "비상벨설비", baseWorker: 0.44 },
    { id: 18, category: "3. 정보설비", name: "홈네트워크 이용자설비(전유부분)", baseWorker: 0.03 },
    { id: 19, category: "3. 정보설비", name: "빌딩안내시스템(BIS)", baseWorker: 1.69 },
    { id: 20, category: "3. 정보설비", name: "전기시계시스템", baseWorker: 0.46 },
    { id: 21, category: "3. 정보설비", name: "통합 SI시스템", baseWorker: 0.46 },
    { id: 22, category: "3. 정보설비", name: "시설관리시스템(FMS)", baseWorker: 0.54 },
    { id: 23, category: "3. 정보설비", name: "건물에너지관리시스템(BEMS)", baseWorker: 0.76 },
    { id: 24, category: "3. 정보설비", name: "지능형 인원계수 시스템", baseWorker: 0.56 },
    { id: 25, category: "3. 정보설비", name: "지능형 경계감시 시스템", baseWorker: 0.80 },
    { id: 26, category: "3. 정보설비", name: "스마트 병원 설비(의료용 너스콜)", baseWorker: 2.12 },
    { id: 27, category: "3. 정보설비", name: "스마트 도난방지 시스템", baseWorker: 0.17 },
    { id: 28, category: "3. 정보설비", name: "스마트 공장 시스템", baseWorker: 0.31 },
    { id: 29, category: "3. 정보설비", name: "스마트 도서관 시스템", baseWorker: 0.52 },
    { id: 30, category: "3. 정보설비", name: "지능형 이상음원 시스템", baseWorker: 0.64 },
    { id: 31, category: "3. 정보설비", name: "IoT기반 지하공간 안전관리 시스템", baseWorker: 0.13 },
    { id: 32, category: "3. 정보설비", name: "디지털 사이니지", baseWorker: 0.56 },
    { id: 33, category: "4. 기타설비", name: "통신용 전원설비", baseWorker: 1.66 },
    { id: 34, category: "4. 기타설비", name: "통신 접지설비", baseWorker: 0.12 }
];

export const SALES_MANAGERS = [
    { name: "박진철", phone: "010-7130-8285" },
    { name: "임학빈", phone: "010-4259-2044" },
    { name: "공대은", phone: "010-2486-8571" },
    { name: "이태평", phone: "010-3855-3416" },
    { name: "전무승", phone: "010-5269-5357" },
    { name: "김태훈", phone: "010-5393-1308" },
    { name: "이정국", phone: "010-5474-3414" },
    { name: "이승학", phone: "010-2395-5603" },
    { name: "김학수", phone: "010-3255-2473" },
    { name: "김찬진", phone: "010-4101-5891" },
    { name: "신홍민", phone: "010-6550-7169" },
    { name: "한춘교", phone: "010-9162-2995" },
    { name: "박민수", phone: "010-4458-3472" },
    { name: "이우현", phone: "010-2494-4756" },
    { name: "고윤성", phone: "010-2871-5485" }
];
