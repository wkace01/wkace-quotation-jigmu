---
description: 안전하게 로컬 개발 후 메인으로 병합하는 Git 기반 개발 워크플로우
---

새로운 기능을 추가하거나 코드를 수정할 때는 항상 메인(`main`) 브랜치를 직접 수정하지 않고, 이 가이드에 따라 별도 브랜치에서 작업합니다. 

## 작업 순서

1. **메인 브랜치 최신화 및 이동**
   항상 가장 최신 상태의 메인 코드에서 시작합니다.
   ```bash
   git checkout main
   git pull origin main
   ```

2. **신규 작업 브랜치(Branch) 생성**
   작업할 내용에 맞춰 새로운 이름의 브랜치를 생성하고 이동합니다.
   ```bash
   git checkout -b feature/[작업명]
   # 예: git checkout -b feature/update-v1
   ```

3. **로컬 개발 및 커밋(Commit)**
   - 코드를 수정하고 로컬 테스트 환경을 띄워(예: `npm run dev` 등) 확인합니다.
   - 단일 기능이나 유의미한 수정사항이 완료될 때마다 롤백을 위해 커밋합니다.
   ```bash
   git add .
   git commit -m "[작업분류]: 작업 내용 요약"
   # 예: git commit -m "UI: 거래처 담당자 텍스트 변경"
   ```

4. **로컬 테스트 환경(`test_environment`) 최종 점검**
   필요하다면 `test_environment`에서 빌드 결과를 올리고 실제와 동일한 환경에서 에러 확인 및 버그 여부를 재차 테스트합니다. 버그가 있다면 계속 수정 후 커밋합니다.

5. **완료된 내용 원격 저장소에 백업 (Push)**
   테스트가 모두 끝난 작업용 브랜치를 원격(GitHub)에 백업차원에서 올려둡니다.
   ```bash
   git push origin feature/[작업명]
   ```

6. **메인 브랜치 병합 (Merge) 및 최종 푸시**
   기능에 문제가 없음이 확정되면, 메인 브랜치로 코드를 통합합니다.
   ```bash
   git checkout main
   git merge feature/[작업명]
   git push origin main
   ```
   *이후 메인 코드를 기준으로 실 배포를 진행합니다.*

## 에이전트 핵심 지침사항 (Agent Directives)
- 사용자가 기능을 변경해 달라고 지시할 시, 현재 체크아웃 되어있는 브랜치가 무엇인지 확인(`git branch --show-current`) 하라.
- 만약 현재 브랜치가 `main` 또는 `stable`이라면, 즉각적인 코드 수정을 멈추고 **"현재 메인 브랜치에 있으므로, 코드를 안전하게 보호하기 위해 별도의 작업용 브랜치(예: feature/xxx)를 만들고 시작할까요?"**라고 사용자에게 제안하여 허락을 먼저 구하라.
- 코드 롤백을 원할 시, 현재 위치한 팁(커밋)을 기준으로 `git log`를 분석하여 제안을 건네라.
