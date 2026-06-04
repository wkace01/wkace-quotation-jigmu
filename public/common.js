// ============================================================================
// [공통 모듈] common.js
// 카카오 주소 검색 및 건축물대장 API 공통 유틸리티
// ============================================================================

const API_BASE_URL = (window.location.port === '3000' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : '';

// ── 서버 공개 설정 캐시 (빌딩 API 키 — Railway 환경변수에서 주입) ───────────
let _publicConfig = null;

async function getPublicConfig() {
    if (_publicConfig) return _publicConfig;
    const res = await fetch(`${API_BASE_URL}/api/public-config`);
    if (!res.ok) throw new Error('서버 설정을 불러올 수 없습니다.');
    _publicConfig = await res.json();
    return _publicConfig;
}

/**
 * 건축물대장 API를 브라우저에서 직접 호출하여 건물 면적 및 용도 정보 반환.
 * Railway 서버(해외 IP)가 한국 정부 API에 접근 불가이므로 브라우저(한국 IP)가 직접 호출한다.
 *
 * @param {object} info - { sigunguCd, bjdongCd, bun, ji } — Kakao Postcode bcode에서 추출
 */
async function fetchBuildingRegister(info) {
    const { sigunguCd, bjdongCd, bun, ji } = info;
    const config = await getPublicConfig();
    const key = config.buildingApiKey;
    if (!key) throw new Error('건축물대장 API 키가 서버에 설정되지 않았습니다.');

    const paddedBun = String(bun).padStart(4, '0');
    const paddedJi = String(ji || '0').padStart(4, '0');
    // serviceKey는 data.go.kr 발급 시 이미 URL 인코딩된 값이므로 encodeURIComponent 없이 직접 삽입
    const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo` +
        `?serviceKey=${key}` +
        `&sigunguCd=${encodeURIComponent(sigunguCd)}` +
        `&bjdongCd=${encodeURIComponent(bjdongCd)}` +
        `&bun=${paddedBun}&ji=${paddedJi}` +
        `&numOfRows=100&pageNo=1`;

    const res = await fetch(url);
    const rawText = await res.text();

    if (!res.ok) {
        throw new Error(`건축물대장 API 오류 (HTTP ${res.status})`);
    }

    // BOM 및 루트 노드 앞 공백 제거 후 XML 파싱 (브라우저 내장 DOMParser 사용)
    const xmlText = rawText.replace(/^﻿/, '').trimStart();
    if (!xmlText.startsWith('<')) {
        throw new Error('건축물대장 API가 유효하지 않은 응답을 반환했습니다.');
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const getXmlText = (tag) => xmlDoc.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

    const totalCount = parseInt(getXmlText('totalCount') || '0', 10);
    if (totalCount === 0) throw new Error('해당 지번에 건축물대장 정보가 없습니다.');

    const items = Array.from(xmlDoc.getElementsByTagName('item'));
    let target = items.find(item => item.getElementsByTagName('mainAtchGbCd')[0]?.textContent === '0');
    if (!target) target = items[0];

    const getVal = (tag) => target.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
    return {
        totArea: getVal('totArea'),
        mainPurpsCdNm: getVal('mainPurpsCdNm'),
        platArea: getVal('platArea'),
        archArea: getVal('archArea'),
        useAprDay: getVal('useAprDay'),
        bldNm: getVal('bldNm'),
        mainAtchGbCdNm: getVal('mainAtchGbCdNm')
    };
}

/**
 * 카카오 우편번호 서비스 위젯을 컨테이너에 임베드 (index.html 연동)
 */
function initKakaoPostcode(embedContainerId, onCompleteCallback) {
    const el = document.getElementById(embedContainerId);
    if (!el) {
        console.warn(`[Kakao] 컨테이너 요소(#${embedContainerId})를 찾을 수 없습니다.`);
        return;
    }

    if (!window.daum || !window.daum.Postcode) {
        console.warn("[Kakao] Postcode SDK 미준비 상태");
        return;
    }

    el.innerHTML = '';

    function doEmbed() {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
            requestAnimationFrame(doEmbed);
            return;
        }

        new daum.Postcode({
            oncomplete: function (data) {
                let addr = data.roadAddress || data.jibunAddress;
                let extraAddr = '';

                if (data.bname !== '' && /[동로가]$/g.test(data.bname)) extraAddr += data.bname;
                if (data.buildingName !== '' && data.apartment === 'Y') {
                    extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
                }
                if (extraAddr !== '') addr += ` (${extraAddr})`;

                if (typeof onCompleteCallback === 'function') {
                    onCompleteCallback(addr, data.buildingName, data);
                }
            },
            width: '100%',
            height: '100%'
        }).embed(el);
    }

    requestAnimationFrame(doEmbed);
}

// Global Export
window.wkCommon = {
    fetchBuildingRegister,
    initKakaoPostcode
};
