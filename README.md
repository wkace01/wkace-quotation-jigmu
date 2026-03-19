# 견적서 자동화 템플릿 (Quotation Automation Boilerplate)

이 레포지토리는 각 **사업부별 견적서 자동화 프로젝트**를 빠르게 세팅하기 위한 공통 뼈대(Template)입니다. 
새로운 사업부의 프로젝트를 시작할 때 본 레포지토리를 복제(Clone)하여 사용하세요.

## 🚀 새 사업부 프로젝트 시작하기 (Getting Started)

### 1. 템플릿 복제 (Clone)
GitHub에서 `Use this template` 버튼을 눌러 새 레포지토리를 생성하거나, 로컬에서 이 템플릿 폴더를 복사하여 `직무고시사업부` 등 새로운 폴더를 생성합니다.

### 2. 초기 환경 세팅
```bash
npm install
```
`.env.example` 파일을 복사하여 `.env` 파일을 생성하고, 필요한 값들을 채워 넣습니다.
- `PORT`: 기존에 사용 중인 포트와 겹치지 않게 설정 (예: 3001, 3002...)
- `AIRTABLE_API_KEY`: Airtable 접근 권한 토큰 

### 3. 사업부별 커스텀 (Customizing)

**① 엑셀 양식 교체**
- `server.js`의 `TEMPLATE_PATH` 변수 수정 (템플릿 엑셀 경로)
- `server.js`의 Airtable `fieldId` 수정 (첨부파일 필드 ID)
- 새 사업부 전용 엑셀 파일(`.xlsx`)을 루트 폴더 경로에 둡니다.

**② 프론트엔드 UI 수정 (`feat_index.html` / `main_index.html`)**
- `<title>` 및 `<h1>` 태그의 `정보통신사업부`를 `직무고시사업부` 등으로 변경.
- 불필요한 입력 폼을 삭제하고 새 사업부에 필요한 폼(예: 점검면적, 인원 등)을 추가.

**③ 계산 로직 수정 (`feat_app.js`)**
- `calculateTotal()` 또는 관련 수식 함수를 찾아 새 사업부 견적 로직으로 변경
- 변경된 폼에서 데이터를 가져와(Payload 구성) 서버로 전달하도록 `mapping` 객체 수정.

## 📄 주요 파일 설명
- `server.js`: 서버 구동 및 엑셀 -> PDF 변환, 에어테이블 연동 로직
- `feat_app.js`: 프론트엔드 핵심 비즈니스 로직 및 엑셀 셀 매핑(Mapping) 구성
- `feat_index.html`: 사용자 화면 (입력 폼)
- `.env.example`: 환경 변수 샘플 파일

---

**💡 주의사항:** 
- 기존 정보통신사업부의 `feat_app.js` 로직이 일부 남아 있을 수 있으니, 새 사업부 요구사항에 맞춰 코드를 깨끗하게 다듬고 엑셀 타겟 셀 위치(A12, D14 등)를 꼼꼼히 매핑하세요!
