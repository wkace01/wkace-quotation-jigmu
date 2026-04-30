// ============================================================================
// [공통 모듈] common.js
// 카카오 주소 검색 및 건축물대장 API 공통 유틸리티
// ============================================================================

const API_BASE_URL = (window.location.port === '3000' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : '';

/**
 * 1. 도로명주소 API로 지번 정보(행정코드, 번지) 반환
 */
async function getAddressInfo(keyword) {
    const url = `${API_BASE_URL}/api/address-info?keyword=${encodeURIComponent(keyword)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '주소 API 오류');
    return data;
}

/**
 * 2. 건축물대장 API를 호출하여 건물 면적 및 용도 정보 반환
 */
async function fetchBuildingRegister(info) {
    const { sigunguCd, bjdongCd, bun, ji } = info;
    const params = new URLSearchParams({ sigunguCd, bjdongCd, bun, ji: ji || '0' });
    const url = `${API_BASE_URL}/api/building-register?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '건축물대장 API 오류');
    return data;
}

/**
 * 3. 카카오 우편번호 서비스 위젯을 컨테이너에 임베드 (index.html 연동)
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

    // 기존 내용 초기화
    el.innerHTML = '';

    function doEmbed() {
        // 컨테이너가 DOM에 렌더링되어 실제 크기가 잡혀있는지 확인
        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
            // 크기가 아직 0이면 다음 애니메이션 프레임에서 재시도
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

                // 콜백 호출 (addr, buildingName, 원본 data 전달)
                if (typeof onCompleteCallback === 'function') {
                    onCompleteCallback(addr, data.buildingName, data);
                }
            },
            width: '100%',
            height: '100%'
        }).embed(el);
    }

    // requestAnimationFrame으로 레이아웃 완료 후 embed 실행
    requestAnimationFrame(doEmbed);
}

// Global Export
window.wkCommon = {
    getAddressInfo,
    fetchBuildingRegister,
    initKakaoPostcode
};
