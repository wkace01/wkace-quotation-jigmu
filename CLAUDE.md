# 에이전트 행동 지침 - 정보통신사업부 견적서 자동화 프로젝트

## 브랜치 전략 및 개발 워크플로우

### 핵심 원칙
- **`main` 브랜치에 직접 코드를 수정하지 않는다.**
- 모든 수정 작업은 반드시 `feature/...` 브랜치를 만들어서 진행한다.
- 커밋은 기능 단위로 작게 나눠서 의미 있는 메시지와 함께 남긴다.

### 브랜치 구조
```
main                  ← 배포 버전 (안정적, 직접 수정 금지)
  └─ feature/<작업명>  ← 모든 개발/수정 작업
```

### 작업 시작 전 필수 절차
1. `main` 브랜치가 최신 상태인지 확인 (`git pull origin main`)
2. 작업 브랜치 생성: `git checkout -b feature/<작업명>`
3. 해당 브랜치에서만 코드 수정

### 작업 완료 후 절차
1. 변경사항 커밋 (`git add`, `git commit -m "..."`)
2. 원격 브랜치 푸시 (`git push origin feature/<작업명>`)
3. GitHub에서 PR 생성: `feature/<작업명>` → `main`
4. PR 머지 후 자동 배포 (Railway/Render)

### 롤백이 필요한 경우
- `git revert <커밋ID>` 로 기록을 유지하며 되돌린다.
- 배포 플랫폼(Railway/Render)에서 이전 배포 버전으로 Redeploy 가능.

### 커밋 메시지 컨벤션
- `feat:` 새 기능 추가
- `fix:` 버그 수정
- `refactor:` 로직 개선 (기능 변화 없음)
- `chore:` 설정, 의존성 변경

---

## 코드 수정 시 주의사항

- `정보통신사업부 견적서 양식_ver1.xlsx` 는 **절대 수정하지 않는다.** PDF 생성용 원본 템플릿이다.
- `common.js` 수정 시 인코딩 깨짐 이슈 주의 — 부분 수정이 아닌 전체 파일 재작성 방식으로 처리한다.
- Airtable API Key는 서버 환경변수(`AIRTABLE_API_KEY`)에서만 사용, 프론트엔드 코드에 노출 금지.

---

## 로컬 개발 환경

- 서버 실행: `node server.js` → `http://localhost:3001`
- LibreOffice가 설치되어 있어야 PDF 생성 가능
  - Windows: `C:\Program Files\LibreOffice\program\soffice.exe`
  - Docker/Linux: `soffice` (전역 명령어)
