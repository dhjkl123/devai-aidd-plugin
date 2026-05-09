# Story 3.3: 원격 저장소가 사용 가능한 경우에만 푸시 제안

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

워크플로우 사용자로서,
푸시 동작이 유효하고 관련 있을 때만 제안되기를 원한다,
그래서 원격 게시가 방해가 아니라 도움이 되도록 한다.

## Acceptance Criteria

1. **주어진 조건** 워크플로우 커밋이 성공적으로 완료된 경우
   **동작 시점** 플러그인이 푸시 동작을 평가하면
   **기대 결과** 푸시를 제안하기 전에 원격 저장소가 구성되어 있는지 확인해야 한다
   **그리고** 유효한 원격이 없으면 푸시 제안을 억제해야 한다.
2. **주어진 조건** 원격 저장소가 구성되어 있고 푸시 정책이 이를 허용하는 경우
   **동작 시점** 푸시 최종화를 평가하면
   **기대 결과** 플러그인은 푸시 제안을 별도의 승인 통제 액션으로 생성해야 한다
   **그리고** 거부되거나 실패한 푸시는 이미 기록된 로컬 커밋을 무효화하지 않아야 한다.

## Tasks / Subtasks

- [ ] 워크플로 최종화 경로에서 push 제안 적격성 판정을 추가한다. (AC: 1, 2)
  - [ ] Story 3.1/3.2가 남길 최종화 컨텍스트를 기준으로 `commit` 성공 이후에만 push 평가가 시작되도록 계약을 정의한다.
  - [ ] `checkRepositoryReadiness()`가 이미 제공하는 `details.hasRemote` / `details.remoteNames`를 재사용하고, 원격 미구성 시 push proposal을 만들지 않는 단일 판정 헬퍼를 둔다.
  - [ ] `workflowPolicy.finalization`이 `commit-and-push` 또는 push 허용 의미를 갖는 경우에만 push 경로가 열리도록 하고, `no-forced-finalization`에서는 push 계획을 억제한다.

- [ ] push proposal 객체와 승인 요청 연결부를 완성한다. (AC: 2)
  - [ ] `src/services/git/push-service.js`의 `buildPushAction()`을 재사용하는 proposal/plan 빌더를 정의하고 `remoteName`, `branchName`, `targetBranch`, `correlationId`를 표준화한다.
  - [ ] `src/services/approval/approval-policy-service.js`의 planned action 선택 우선순위에 `commitProposal`, `pushProposal`를 Story 3.x 규칙에 맞게 추가한다.
  - [ ] `src/services/approval/classify-git-action.js`, `build-approval-request.js`, `build-approval-explanation.js`의 기존 push 지원 경로를 그대로 사용해 push를 별도 승인 액션으로 게시한다.
  - [ ] 승인 프롬프트와 메타데이터에는 remote URL 전체를 넣지 않고, 기존 redaction 규칙대로 remote name과 branch label만 노출한다.

- [ ] push 거부/실패가 로컬 커밋 성공을 되돌리지 않도록 상태/복구 의미를 연결한다. (AC: 2)
  - [ ] `permission-asked` 승인 해석 결과에서 push `deny` / `ignore-and-continue`는 로컬 커밋 완료 상태를 유지한 채 원격 게시만 생략하도록 기록한다.
  - [ ] push 실행 실패는 Story 2.4의 `push-rejection` envelope 및 Story 2.5 recovery gate를 재사용하되, commit 성공 여부를 덮어쓰지 않도록 상태 필드를 분리한다.
  - [ ] commit recovery gate의 `workflow-finalization` 차단 의미와 push recovery gate의 `git-only` 차단 의미가 충돌하지 않도록 최종화 순서를 정리한다.

- [ ] 감사 이벤트와 세션 상태를 Story 3 최종화 문맥에 맞게 보강한다. (AC: 1, 2)
  - [ ] `git.action.planned`, `approval.requested`, `approval.resolved`, `git.action.executed`, `git.action.skipped`가 push 액션에서도 동일 계약으로 기록되는지 보장한다.
  - [ ] 원격이 없어서 push를 억제한 경우에는 불필요한 승인 요청을 만들지 말고, 필요하면 non-blocking planned/finalization 판단 결과만 남긴다.
  - [ ] 세션 상태에는 commit 완료 후 push 평가에 필요한 최소 정보만 저장하고, raw remote URL/credential/argv는 저장하지 않는다.

- [ ] 회귀 및 계약 테스트를 추가한다. (AC: 1, 2)
  - [ ] 원격 없음: commit 성공 후에도 push proposal/approval가 생성되지 않는 테스트를 추가한다.
  - [ ] 원격 있음 + 정책 허용: push proposal이 queue/pending approval에 distinct action으로 게시되는 테스트를 추가한다.
  - [ ] push 거부: 로컬 commit 결과는 유지되고 workflow는 계속 진행되는 테스트를 추가한다.
  - [ ] push 실패(`push-rejection`): recovery gate가 열리더라도 commit 성공 상태와 traceability 메타데이터는 유지되는 테스트를 추가한다.
  - [ ] remote label redaction: push 승인 요청/감사 payload 어디에도 full remote URL이 들어가지 않는 테스트를 유지 또는 확장한다.

## Dev Notes

- Story 3.3의 핵심은 "push 실행" 자체보다 "push를 제안해도 되는 시점과 조건"을 정확히 정의하는 것이다. commit이 성공하기 전에는 push를 계획하면 안 되고, 원격이 없거나 정책이 허용하지 않으면 승인 프롬프트도 만들면 안 된다.

- 현재 코드베이스에는 push의 하위 구성요소가 이미 일부 준비되어 있다.
  - `src/services/git/push-service.js`는 표준 push action plan과 executor 호출 경계를 제공한다.
  - `src/services/approval/classify-git-action.js`는 `kind: "push"`를 별도 승인 액션으로 분류할 수 있다.
  - `src/services/approval/build-approval-request.js`와 `build-approval-explanation.js`는 push proposal을 받아 승인 프롬프트/메타데이터를 만들 수 있다.
  - 즉 Story 3.3은 새 승인 체계를 발명하는 작업이 아니라, Story 3.2 commit 완료 이후 이 기존 조각들을 finalization 경로에 연결하는 작업이어야 한다.

### Project Structure Notes

- `src/hooks/command-execute-before.js`는 현재 init/branch planning과 approval publishing만 담당한다. Story 3.3 구현 시 이 파일에 finalization 전부를 몰아넣기보다, 얇은 hook + service orchestration 경계를 유지해야 한다.
- `src/services/approval/approval-policy-service.js`는 아직 `initProposal`, `branchProposal`, `pendingActions` 중심으로만 동작하며 주석에도 `commitProposal`, `pushProposal`이 future work로 남아 있다. Story 3.3에서는 이 우선순위 확장을 명시적으로 마무리해야 한다.
- `src/services/workflow/detect-workflow-context.js`는 `finish` phase를 예약만 해둔 상태다. Story 3.3은 Story 3.1/3.2가 finish phase와 finalizable artifact 판단을 제공한다는 전제 위에서 동작해야 하며, 이 스토리 단독으로 phase 체계를 다시 설계하면 안 된다.
- `src/services/git/check-repository-readiness.js`는 `hasRemote`와 `remoteNames`를 이미 정규화해서 반환한다. 원격 존재 판정은 이 계약을 재사용해야 하며, `git remote -v` raw 문자열을 다른 곳에서 중복 파싱하지 않는다.

### 구현 가드레일

- push proposal은 commit 성공 이후의 "후속 액션"이어야 한다. commit이 `deny`, `skip`, `failed`, `awaitingRecovery` 상태라면 push는 계획하지 않는다.
- push proposal은 distinct approval-governed action이어야 한다. commit approval와 합쳐서 하나의 프롬프트로 만들지 않는다.
- remote URL 전체, credential, raw stderr는 prompt/metadata/audit/state 어디에도 노출하지 않는다. remote name(`origin` 등)과 branch label만 사용한다.
- push `deny` 또는 push 실행 실패는 local commit을 무효화하지 않는다. 사용자-facing 결과와 session state에서 "로컬 기록 완료, 원격 게시 미완료"를 구분할 수 있어야 한다.
- push recovery는 Story 2.5의 공통 recovery orchestrator를 재사용하되, commit recovery와 blocking scope가 달라야 한다.
  - commit unresolved: `workflow-finalization` 차단
  - push unresolved: `git-only` 차단
- hook는 thin, 상태 전이와 판정은 service에 둔다. Epic 2에서 정착한 패턴과 달라지면 회귀 가능성이 커진다.

### 이전 스토리 학습 반영

- Epic 2 마지막 산출물은 recovery를 "실패를 감추는 장치"가 아니라 "실패 후에도 워크플로를 계속 진행시키는 상태 기계"로 정리했다. Story 3.3도 같은 원칙을 따라 push 실패를 전체 완료 실패로 승격시키지 말아야 한다.
- Story 2.5 문서에 따르면 push 실패는 이미 `push-rejection`으로 분류되고 recovery option도 정의돼 있다. Story 3.3은 이 실패 분류를 재사용해야지, push 전용 오류 모델을 새로 만들면 안 된다.
- Story 2.5는 recovery gate 차단 범위를 action kind별로 분리했다. 이 덕분에 commit recovery가 미해결이면 후속 push planning이 차단되고, push recovery는 원격 게시 관련 Git 자동화만 막도록 설계돼 있다. Story 3.3 구현은 이 차단 의미를 깨면 안 된다.

### 최근 커밋 패턴 인텔리전스

- 최근 커밋은 `Finish Epic 2: ...` 같은 스토리/에픽 단위 마감 커밋 후 `Merge branch 'epic2/stories' into master`처럼 통합되는 흐름을 보인다.
- 따라서 Story 3.3도 작은 서비스/테스트 단위 변경을 먼저 완성하고, 회귀 테스트 통과 후 스토리 단위 커밋으로 정리하는 패턴이 자연스럽다.
- merge 이전 단계에서 회귀 테스트로 계약을 고정하는 습관이 강하므로, Story 3.3 역시 테스트 없이 hook wiring만 추가하는 방식은 이 저장소의 최근 작업 패턴과 맞지 않는다.

### 구현 파일 후보

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\approval-policy-service.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-request.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-explanation.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\check-repository-readiness.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\push-service.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\git-executor.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\workflow-state.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js`

### 테스트 포인트

- 원격 미구성 저장소에서 finalization policy가 `commit-and-push`여도 push approval가 생성되지 않아야 한다.
- 원격이 하나 이상 있으면 push proposal은 commit과 다른 `actionId`를 가져야 하고, 별도의 `approval.requested` 이벤트를 발행해야 한다.
- push approval prompt는 `targetRemoteLabel`, `targetBranchLabel`, `finalizationMode`를 포함하되 full remote URL은 포함하지 않아야 한다.
- push `deny` / `ignore-and-continue` 후에도 commit 성공 기록과 traceability metadata는 남아 있어야 한다.
- `git.action.executed`가 push 실패를 기록해도 commit 성공 상태와 recovery gate 상태가 분리되어 유지돼야 한다.
- recovery gate가 unresolved commit을 가진 경우 push planning이 막히고, unresolved push는 다른 콘텐츠 작업을 막지 않아야 한다.

### 로컬 기술/의존성 메모

- 현재 저장소는 ESM 기반 Node.js 플러그인 구조를 사용하며 `package.json` 기준 런타임 의존성은 `ajv@8.17.1` 하나다.
- Story 3.3은 새 외부 라이브러리를 도입할 이유가 약하다. 필요한 기능은 기존 workflow state, approval, git service 계층 재사용으로 해결하는 것이 맞다.

### References

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md#Epic 3: Finalization and Traceable Delivery`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md#Story 3.3: Propose Push Only When a Remote Repository Is Available`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md#Integration Requirements`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md#Authentication & Security`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md#API & Communication Patterns`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md#Unified Project Structure`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md#Requirements to Structure Mapping`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\2-5-offer-recovery-paths-without-failing-the-workflow.md#Technical Requirements`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\2-5-offer-recovery-paths-without-failing-the-workflow.md#Previous Story Intelligence`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\defaults.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\approval-policy-service.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\classify-git-action.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-request.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-explanation.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\recovery-state.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\recovery-orchestrator.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\check-repository-readiness.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\push-service.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\detect-workflow-context.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 없음

### Completion Notes List

- 2026-05-09: Epic 3 / Story 3.3 컨텍스트 생성 완료. Epic 3 요구사항, PRD/Architecture 제약, Epic 2 Story 2.5 복구 상태 기계, 현재 소스/테스트 구조, 최근 커밋 패턴을 반영해 ready-for-dev 스토리 문서를 작성했다.

### File List
