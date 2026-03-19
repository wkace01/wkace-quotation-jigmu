# UI/텍스트 명칭 및 렌더링 순서 변경 구현 계획

## Goal Description
요구사항 [1]번에 따라 프론트엔드의 텍스트 명칭을 변경하고, 조건표 UI 요소들의 랜더링 순서를 조정합니다. 또한 '위탁 선임 횟수'를 '성능 점검 횟수'로 대체하며 기본값을 지정합니다.

> [!IMPORTANT]
> **User Review Required (확인 필요)**
> '위탁 선임 횟수' UI를 '성능 점검 횟수'로 대체함에 따라, 에어테이블로 전송하는 데이터 필드명도 `위탁 선임 횟수`에서 `성능 점검 횟수`로 변경해야 하는지 확인이 필요합니다. (아니면 견적서 PDF 생성/프론트 UI용으로만 텍스트를 변경하면 되는지 알려주세요!)

## Proposed Changes

### Front-End (HTML/JS)
#### [MODIFY] [index.html](file:///c:/Users/Master/Documents/Project/견적서 자동화 프로젝트/정보통신사업부/public/index.html)
- `담당자명` 텍스트 라벨을 `거래처 담당자`로 일괄 변경합니다.
- `<div class="cond-group-title">` 구조를 재배치하여 렌더링 순서를 조정합니다.
  - **순서:** 1. 성능점검 비용 (성능점검 단가, 성능 점검 횟수) -> 2. 유지점검 비용 (유지점검 단가, 유지 점검 횟수) -> 3. 위탁선임 비용 (위탁 선임 횟수 12개월, 월 단가, 연간 합계)
- 기존 `위탁 선임 횟수` 입력 필드를 `성능 점검 횟수`로 변경하고 ID를 `cond-inspection-frequency`로 수정합니다. Placeholder는 `1회`로 변경합니다. (선임위탁 그룹에는 '12개월' 고정 필드를 별도로 추가합니다.)

#### [MODIFY] [app_step.js](file:///c:/Users/Master/Documents/Project/견적서 자동화 프로젝트/정보통신사업부/public/app_step.js)
- `state.inspectionFrequency = "1회"`를 도입합니다.
- `updateConditionPanel` 등에서 새로 생성한 `cond-inspection-frequency` ID를 바라보도록 스크립트를 수정합니다.
- 3단계 견적 요약 테이블(Tab 1) 생성 로직 수정:
  - 성능점검 결괏값 비고란에 고정 텍스트('연 1회') 대신 새로 만든 `state.inspectionFrequency` 값이 출력되도록 매핑합니다.
  - 위탁선임 결괏값 비고란은 더 이상 횟수를 입력받지 않으므로 고정 텍스트('12개월' 등)로 변경합니다.

#### [MODIFY] [airtable_service.js](file:///c:/Users/Master/Documents/Project/견적서 자동화 프로젝트/정보통신사업부/public/airtable_service.js)
- 견적 기록 생성 시 `fields['위탁 선임 횟수']` 파라미터를 유저 피드백에 맞춰 (예: `fields['성능 점검 횟수']`) 전송하도록 로직을 수정합니다.

***

## Verification Plan

### Manual Verification
1. 로컬 환경에서 `npm run dev` 실행 후 브라우저 접속
2. **시각적 UI 검증:**
   - [2단계] '건물 정보' 패널에서 '거래처 담당자'로 텍스트가 정상 변경되었는지 확인.
   - [2단계] '적용 견적 조건' 패널에서 그룹 순서가 `성능점검` -> `유지점검` -> `위탁선임` 순인지 확인.
   - [2단계] 성능 점검 횟수가 기본 1회로 표시되는지 확인.
3. **로직(동작) 검증:**
   - 횟수를 '1회'에서 '2회'로 변경 시 우측 요약 패널 및 3단계 탭에 값이 즉시 반영되는지 확인.
   - 3단계 최종 견적서 뷰 테이블에서 '성능점검'의 비고란이 정상적으로 매핑되었는지 확인.
