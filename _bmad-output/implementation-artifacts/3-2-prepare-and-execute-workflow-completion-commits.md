# Story 3.2: 워크플로우 완료 커밋 준비 및 실행

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

워크플로우 사용자로서,
플러그인이 적절한 시점에 워크플로우 아티팩트로부터 커밋을 준비하기를 원한다.
이를 통해 완료된 작업이 수동 기록 없이 Git 이력에 캡처된다.

## Acceptance Criteria

1. **주어진 조건** 완료 가능한 워크플로우 아티팩트가 존재하고 정책에 의해 커밋 동작이 허용된 경우
   **행동 시점** 플러그인이 완료를 준비할 때
   **기대 결과** 워크플로우의 변경된 아티팩트로 범위가 제한된 커밋 제안을 생성한다
   **그리고** 커밋 작업은 앞서 정의된 승인 모델의 적용을 받는다.
2. **주어진 조건** 사용자가 커밋 작업을 승인한 경우
   **행동 시점** 커밋 실행이 수행될 때
   **기대 결과** 결과 Git 이력에 관련 코드, 기술 문서 또는 기획 아티팩트가 포함된다
   **그리고** 커밋 실패 시 워크플로우 컨텍스트나 추적성 메타데이터를 폐기하지 않고 보고된다.

## Tasks / Subtasks

- [ ] 종료 시점의 완료 가능 아티팩트 집계 모델을 추가한다. (AC: 1)
  - [ ] `file.edited`와 워크플로우 상태를 이용해 세션별 변경 파일 목록, 아티팩트 유형(코드/기술 문서/기획 문서), 마지막 변경 시각을 누적하는 방식을 정의한다.
  - [ ] 워크플로우 정책의 `finalization` 값이 `commit-and-push` 또는 `commit-optional-push`일 때만 커밋 후보 계산이 열리도록 경계 조건을 명시한다.
  - [ ] 변경 파일이 없거나 허용 범위 밖 파일만 존재할 때는 커밋 제안을 만들지 않고 비차단 완료로 남기는 조건을 추가한다.

- [ ] Story 3.1 결과와 연결되는 `commitProposal` 생성기를 구현한다. (AC: 1)
  - [ ] `src/services/git/` 또는 `src/services/workflow/` 아래에 커밋 범위 계산 전용 서비스를 두고, 최소 필드 `kind`, `message`, `artifactScope`, `changeCountSummary`, `files`, `correlationId`를 표준화한다.
  - [ ] 커밋 메시지는 자유 문장 생성 대신 워크플로우명, 스토리/아티팩트 식별자, 변경 범위를 조합하는 규칙 기반 포맷으로 만든다.
  - [ ] `approval-policy-service`의 선택 우선순위에 `commitProposal`을 추가하되 기존 `initProposal`과 `branchProposal`보다 먼저 실행되지 않게 유지한다.

- [ ] 커밋 제안을 기존 승인 파이프라인에 연결한다. (AC: 1)
  - [ ] `classify-git-action.js`가 이미 지원하는 `commit` 경로를 실제 제안 객체와 연결한다.
  - [ ] `build-approval-request.js`와 `build-approval-explanation.js`에 커밋 제안 메타데이터가 빠짐없이 채워지는지 보강한다.
  - [ ] 승인 요청에는 커밋 범위 요약과 최종화 모드가 드러나야 하며, 원시 경로나 민감한 Git 세부값은 넣지 않는다.

- [ ] 승인 후 커밋 실행 경로를 완료 단계에 연결한다. (AC: 2)
  - [ ] `commit-service.js`의 기존 얇은 래퍼를 재사용하고, 실제 실행은 계속 `git-executor.js`를 단일 정규화 지점으로 사용한다.
  - [ ] 승인 성공 시점의 `workflowState.lastGitAction`, `lastGitResult`, `pendingRecoveryContext`가 커밋에도 일관되게 남도록 검증한다.
  - [ ] 커밋 실패는 Story 2.4/2.5에서 만든 분류와 복구 경로를 그대로 사용하고, 워크플로우 컨텍스트를 지우거나 새 오류 계약을 만들지 않는다.

- [ ] 완료 단계 전이와 후속 Story 3.3 연계를 안전하게 정리한다. (AC: 1, 2)
  - [ ] 현재 `tool-execute-after.js`는 `in-progress`까지만 올리므로, `finish` 전이를 누가 언제 기록하는지 먼저 명시하고 그 지점에서만 커밋 평가가 일어나게 한다.
  - [ ] 커밋 성공 후에만 이후 Story 3.3의 `pushProposal` 평가가 열리도록 상태 플래그 또는 결과 조건을 남긴다.
  - [ ] 커밋이 없거나 실패한 경우 푸시 제안이 열리지 않도록 가드한다.

- [ ] 회귀 및 계약 테스트를 확장한다. (AC: 1, 2)
  - [ ] `tests/regression.test.js`에 `commitProposal` 선택 우선순위, 승인 요청 메타데이터, 성공/실패 envelope 반영, 무변경 시 미제안 시나리오를 추가한다.
  - [ ] 종료 단계에서 변경 파일이 코드/문서/기획 산출물로 혼합된 경우에도 범위 요약이 일관되는지 검증한다.
  - [ ] `nothing to commit`, pre-commit hook 실패, 저장소 상태 불일치가 Story 2.4/2.5 계약대로 복구 가능 실패로 남는지 검증한다.

## Dev Notes

- Epic 3의 목표는 "완료 및 추적 가능한 전달"이다. Story 3.2는 Story 3.1의 완료 가능 산출물 판정 결과를 받아 실제 `commitProposal`과 커밋 실행으로 연결하는 첫 번째 최종화 단계다.
- 이 저장소는 이미 `bmad-bmm-create-story`, `bmad-bmm-dev-story`, `bmad-bmm-quick-dev`, `bmad-bmm-qa-generate-e2e-tests`에 대해 `finalization: "commit-and-push"` 정책을 기본값으로 갖고 있다. 따라서 Story 3.2는 정책 해석을 새로 만들기보다 기존 `resolveWorkflowPolicy()` 결과를 소비해야 한다.
- 현재 코드베이스에는 `commit-service.js`, `push-service.js`, `git-executor.js`, `build-approval-explanation.js`의 커밋/푸시 경로가 이미 준비되어 있다. 반면 실제 `commitProposal` 생성과 종료 시점에서의 선택 로직은 아직 비어 있다. 핵심은 새 실행기를 만드는 것이 아니라 기존 골격을 실제 최종화 데이터와 연결하는 것이다.
- Story 2.5의 가장 중요한 학습은 "실패를 새 계약으로 갈라치지 말고 기존 envelope + recovery gate 위에 얹을 것"이다. 커밋 실패도 `git-executor.js`의 실패 envelope, `workflow-state.js`의 `pendingRecoveryContext`, `recovery-orchestrator.js`의 복구 게이트를 그대로 사용해야 한다.
- 최근 커밋 패턴은 개별 Story 산출물과 관련 소스/테스트를 함께 마무리한 뒤 에픽 브랜치로 병합하는 형태였다. `8ba998b Finish Epic 2: approval-driven Git execution and recovery`는 구현 파일과 `_bmad-output/implementation-artifacts/*.md`, `tests/regression.test.js`를 같이 포함했다. Story 3.2도 문서 스토리 파일과 구현/회귀 테스트가 함께 닫히는 흐름을 가정해야 한다.

### 이전 스토리 학습 반영

- `2-5-offer-recovery-paths-without-failing-the-workflow.md`는 커밋과 푸시를 "복구 옵션이 이미 정의된 action kind"로 다뤘다. 따라서 Story 3.2는 커밋 실행 자체를 도입하되, 실패 대응 UX나 상태 머신을 다시 설계하면 안 된다.
- Story 2.5 Dev Notes는 `workflowState`를 세션 단위 단일 저장소로 유지하고, hooks는 얇게 두며, 서비스 레이어가 상태 전이와 이벤트를 책임지도록 정리했다. Story 3.2도 같은 원칙을 따라 `command-execute-before.js`와 향후 종료 감지 hook에는 오케스트레이션만 남겨야 한다.
- Story 2.5 File List와 Change Log는 문서와 실제 구현 파일 간 추적성을 강조했다. Story 3.2는 커밋 범위 계산 시 `_bmad-output` 문서 파일도 코드와 동등한 최종화 후보로 취급해야 FR23과 Epic 3의 의도를 충족한다.

### 기술 요구사항

- 승인/실행 결과 계약은 기존 표준 envelope `{ outcome, reason, message, details }`와 `git.action.executed` 감사 이벤트를 유지한다.
- 커밋 실행은 `commit-service.js`에서 직접 subprocess를 다루지 않는다. 실제 실행과 실패 분류는 모두 `git-executor.js`에 위임해야 한다.
- 감사 이벤트명은 계속 `dot.case`를 사용하고, 파일명은 `kebab-case.js` 규칙을 유지한다.
- 로그와 승인 프롬프트에는 전체 경로, 원격 URL, 임의 명령행 인자, 비정규화 stderr를 직접 싣지 않는다.
- Story 3.2는 원격 푸시 판단을 포함하지 않는다. 푸시는 Story 3.3 범위이며, Story 3.2는 "성공한 커밋 결과를 후속 단계가 참조할 수 있는 상태"까지만 책임진다.

### 구현 파일 후보

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js`
  - 현재는 레거시 핸들러 위임만 한다. Story 3.2 또는 3.1과 함께 세션별 수정 파일 집계를 붙일 가장 직접적인 지점이다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-after.js`
  - 현재는 무조건 `in-progress`로만 전이한다. 종료 시점 감지 또는 별도 종료 훅 연계 지점 검토가 필요하다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\workflow-state.js`
  - `commitProposal`, `finalizableArtifacts`, `finalizationSummary` 같은 최종화 상태 저장 필드가 필요할 가능성이 높다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\approval-policy-service.js`
  - `selectNextPlannedAction()` 우선순위에 `commitProposal`을 추가해야 한다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-request.js`
  - 커밋 제안이 들어왔을 때 prompt/metadata/actionId가 기대한 범위 요약을 담는지 확인 및 보강이 필요하다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-explanation.js`
  - 이미 `commitProposal.artifactScope`, `changeCountSummary`를 읽는다. 실제 제안 shape와 맞추는 작업이 필요하다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\classify-git-action.js`
  - `kind === "commit"` 분기는 이미 있으므로 실제 proposal creator와 연결만 되면 된다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\commit-service.js`
  - 실제 커밋 플랜 생성 진입점으로 재사용한다. 새 executor를 만들지 않는다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\git-executor.js`
  - 커밋 성공/실패 결과가 `workflowState`에 기록되는 최종 정규화 지점이다.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js`
  - Story 3.2의 우선순위, 승인 요청, 실행 결과, 무변경 예외, 복구 연결을 검증하는 주 테스트 파일이다.

### 테스트 포인트

- `commitProposal`이 없는 경우 `approval-policy-service`가 기존처럼 `initProposal`/`branchProposal`만 다루는지 확인한다.
- 완료 가능 파일이 있을 때 `commitProposal`이 생성되고 `approval.requested`의 `actionType === "commit"` 및 `metadata.finalization`이 유지되는지 확인한다.
- 승인 후 커밋 실행 성공 시 `workflowState.lastGitAction.kind === "commit"`과 `lastGitResult.status === "succeeded"`가 기록되는지 확인한다.
- `nothing to commit`, pre-commit hook 실패, 저장소 상태 드리프트가 `git-executor.js`의 실패 envelope와 복구 컨텍스트로 남는지 확인한다.
- `_bmad-output` 문서만 수정된 경우에도 커밋 범위 요약이 문서 산출물로 집계되는지 확인한다.
- 허용 범위 밖 파일만 변경되거나 실질 변경이 없을 때 커밋 제안이 생기지 않고 워크플로우가 비차단 완료로 남는지 확인한다.

### 프로젝트 구조 노트

- 현재 구조는 `hooks -> services -> audit/state` 흐름을 강제한다. Story 3.2는 hook에서 Git 세부 실행이나 메시지 합성을 직접 처리하면 안 된다.
- `approval-policy-service.js` 주석에 이미 "future: commitProposal, pushProposal — added by Story 3.x"가 선언되어 있다. Story 3.2는 그 예정된 확장 지점을 사용하는 것이 맞다.
- `file.edited.js`가 아직 pass-through이므로, Story 3.2 구현 시 산출물 집계 책임을 여기에 둘지 별도 서비스에 둘지 먼저 정리해야 한다. 추천은 hook은 수집만 하고 분류/요약은 서비스로 분리하는 방식이다.

### 최신 기술 정보

- 추가 웹 리서치는 필수로 보이지 않는다. 이 스토리의 핵심 기술 선택은 외부 SaaS API가 아니라 현재 저장소에 이미 고정된 Node.js ESM 런타임과 `ajv@8.17.1`, Git CLI 실행 계약 재사용에 있다.
- 런타임 기준은 `src/index.js`의 `SUPPORTED_RUNTIME = "Node.js ESM plugin runtime (Node 22 target)"`를 따른다. 새 유틸리티를 추가해도 CommonJS 호환 레이어를 만들지 말고 ESM 기준을 유지한다.

### References

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.ko.md` - `에픽 3 > 스토리 3.2`, `스토리 3.3`, `스토리 3.4`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md` - `Epic 3: Finalization and Traceable Delivery`, `Story 3.2: Prepare and Execute Workflow Completion Commits`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\implementation-readiness-report-2026-05-07.md` - `FR7`, `FR23`, `FR26`, `Independence and Dependency Assessment`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md` - `Ajv 8.17.1`, `dot.case`, `kebab-case.js`, `project structure`, `git.action.planned`, `git.action.executed`, `approval.requested`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md` - `FR7`, `FR23`, `NFR7`, `NFR11`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\2-5-offer-recovery-paths-without-failing-the-workflow.md` - `Dev Notes`, `Technical Requirements`, `File List`, `Change Log`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\defaults.js` - `workflowPolicy.bmad-bmm-create-story`, `workflowPolicy.bmad-bmm-dev-story`, `finalization`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\resolve-workflow-policy.js` - `buildSafeDefaultPolicy()`, `resolveWorkflowPolicy()`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\approval-policy-service.js` - `selectNextPlannedAction()`, `evaluateRequestGate()`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-request.js` - `buildActionId()`, `buildApprovalRequest()`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-explanation.js` - `buildCommitExplanation()`, `FINALIZATION_RATIONALE`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\classify-git-action.js` - `kind === "commit"`, `isAllowedActionType()`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\commit-service.js` - `buildCommitAction()`, `executeCommit()`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\git-executor.js` - `executeGitAction()`, `buildAuditEvent()`, `persistEnvelopeToWorkflowState()`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\workflow-state.js` - `lastGitResult`, `pendingRecoveryContext`, `recoveryGate`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js` - `workflow.detected`, `git.action.planned`, approval gating
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-after.js` - 현재 `in-progress` 전이만 수행
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js` - 현재 pass-through
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js` - `SUPPORTED_RUNTIME`, `requestApproval()`, `requestRecoveryDecision()`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` - `buildApprovalRequest`, `commitExplanation`, `lastGitResult`, Story 2.5 recovery coverage

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 최근 커밋 패턴 확인: `git log -5 --oneline`
- 변경 파일 패턴 확인: `git log -5 --name-only --pretty=format:'__COMMIT__ %h %s'`
- Epic 3/Story 3.2 텍스트 확인: `epics.ko.md`, `epics.md`
- 기존 최종화/복구 골격 확인: `src/services/git/*`, `src/services/approval/*`, `src/services/workflow/*`, `src/hooks/*`

### Completion Notes List

- 2026-05-09: Story 3.2 컨텍스트 생성 완료 - Epic 3 전체 목표, Story 3.2 인수 조건, PRD/아키텍처 제약, Story 2.5 복구 학습, 최근 커밋 패턴, 구현 후보 파일, 테스트 포인트를 반영한 `ready-for-dev` 스토리 문서를 작성했다.

### File List
