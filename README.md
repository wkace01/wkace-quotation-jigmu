# 직무고시 스마트 견적서

이 레포지토리는 우경정보통신 **직무고시사업부 견적서 자동화 시스템**의 실제 실행 코드입니다.

> 현재 이 워크스페이스의 실제 실행 구조 요약은 [current_runtime_structure.md](/C:/Users/Master/Documents/Antigravity program/직무고시 견적서/docs/current_runtime_structure.md), 개선 백로그는 [improvement_priorities.md](/C:/Users/Master/Documents/Antigravity program/직무고시 견적서/docs/improvement_priorities.md) 를 참고하세요.

## 실행 방법

```bash
npm install
npm start
```

기본 로컬 주소는 `http://localhost:3001` 입니다.

## 환경변수

`.env.example` 파일을 복사해 `.env`를 만들고 실제 값을 채웁니다. `.env`는 Git에 올리면 안 됩니다.

| 변수명 | 용도 |
| :--- | :--- |
| `PORT` | 로컬 서버 포트 |
| `AIRTABLE_API_KEY` | Airtable 저장 및 PDF 첨부 업로드 |
| `AIRTABLE_BASE_ID` | 직무고시 Airtable Base ID |
| `JUSO_API_KEY` | 도로명주소 API 서버 프록시 |
| `BUILDING_API_KEY` | 건축물대장 API 서버 프록시 |

## 주요 운영 파일

- `public/index.html`: 실제 사용자 화면
- `public/app_step.js`: 견적 계산, 상태 관리, 엑셀 셀 매핑
- `public/common.js`: 카카오 주소 검색 UI 및 서버 프록시 호출
- `server.js`: 정적 파일 제공, API 프록시, 엑셀/PDF 생성, Airtable 업로드
- `airtableHandler.js`: Airtable 고객/견적 테이블 저장 로직

`feat_*` 파일은 현재 운영 기준 파일이 아니라 레거시/백업 파일입니다.
