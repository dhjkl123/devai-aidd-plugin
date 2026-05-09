# Story 3.2: 워크플로우 완료 커밋 준비 및 실행

Status: review

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

- [x] 종료 시점의 완료 가능 아티팩트 집계 모델을 추가한다. (AC: 1)
  - [x] `file.edited`와 워크플로우 상태를 이용해 세션별 변경 파일 목록, 아티팩트 유형(코드/기술 문서/기획 문서), 마지막 변경 시각을 누적하는 방식을 정의한다.
  - [x] 워크플로우 정책의 `finalization` 값이 `commit-and-push` 또는 `commit-optional-push`일 때만 커밋 후보 계산이 열리도록 경계 조건을 명시한다.
  - [x] 변경 파일이 없거나 허용 범위 밖 파일만 존재할 때는 커밋 제안을 만들지 않고 비차단 완료로 남기는 조건을 추가한다.

- [x] Story 3.1 결과와 연결되는 `commitProposal` 생성기를 구현한다. (AC: 1)
  - [x] `src/services/git/` 또는 `src/services/workflow/` 아래에 커밋 범위 계산 전용 서비스를 두고, 최소 필드 `kind`, `message`, `artifactScope`, `changeCountSummary`, `files`, `correlationId`를 표준화한다.
  - [x] 커밋 메시지는 자유 문장 생성 대신 워크플로우명, 스토리/아티팩트 식별자, 변경 범위를 조합하는 규칙 기반 포맷으로 만든다.
  - [x] `approval-policy-service`의 선택 우선순위에 `commitProposal`을 추가하되 기존 `initProposal`과 `branchProposal`보다 먼저 실행되지 않게 유지한다.

- [x] 커밋 제안을 기존 승인 파이프라인에 연결한다. (AC: 1)
  - [x] `classify-git-action.js`가 이미 지원하는 `commit` 경로를 실제 제안 객체와 연결한다.
  - [x] `build-approval-request.js`와 `build-approval-explanation.js`에 커밋 제안 메타데이터가 빠짐없이 채워지는지 보강한다.
  - [x] 승인 요청에는 커밋 범위 요약과 최종화 모드가 드러나야 하며, 원시 경로나 민감한 Git 세부값은 넣지 않는다.

- [x] 승인 후 커밋 실행 경로를 완료 단계에 연결한다. (AC: 2)
  - [x] `commit-service.js`의 기존 얇은 래퍼를 재사용하고, 실제 실행은 계속 `git-executor.js`를 단일 정규화 지점으로 사용한다.
  - [x] 승인 성공 시점의 `workflowState.lastGitAction`, `lastGitResult`, `pendingRecoveryContext`가 커밋에도 일관되게 남도록 검증한다.
  - [x] 커밋 실패는 Story 2.4/2.5에서 만든 분류와 복구 경로를 그대로 사용하고, 워크플로우 컨텍스트를 지우거나 새 오류 계약을 만들지 않는다.

- [x] 완료 단계 전이와 후속 Story 3.3 연계를 안전하게 정리한다. (AC: 1, 2)
  - [x] 현재 `tool-execute-after.js`는 `in-progress`까지만 올리므로, `finish` 전이를 누가 언제 기록하는지 먼저 명시하고 그 지점에서만 커밋 평가가 일어나게 한다.
  - [x] 커밋 성공 후에만 이후 Story 3.3의 `pushProposal` 평가가 열리도록 상태 플래그 또는 결과 조건을 남긴다.
  - [x] 커밋이 없거나 실패한 경우 푸시 제안이 열리지 않도록 가드한다.

- [x] 회귀 및 계약 테스트를 확장한다. (AC: 1, 2)
  - [x] `tests/regression.test.js`에 `commitProposal` 선택 우선순위, 승인 요청 메타데이터, 성공/실패 envelope 반영, 무변경 시 미제안 시나리오를 추가한다.
  - [x] 종료 단계에서 변경 파일이 코드/문서/기획 산출물로 혼합된 경우에도 범위 요약이 일관되는지 검증한다.
  - [x] `nothing to commit`, pre-commit hook 실패, 저장소 상태 불일치가 Story 2.4/2.5 계약대로 복구 가능 실패로 남는지 검증한다.

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] `git add -- <files>` 후 pathspec 없는 `git commit -m ...`만 실행하는 현재 경로에서, 사전에 stage된 다른 파일이 함께 commit되지 않도록 실제 commit 범위를 승인된 `proposal.files`로 제한하고 regression test를 추가한다. [src/services/git/run-git-command.js, src/services/git/execute-approved-action.js, tests/regression.test.js]
- [x] [AI-Review][MEDIUM] finish approval / commit 실행 경로에서 공백, rename, C-quoted path가 포함된 changed file 케이스를 regression test로 고정하여 `git add -- <files>` pathspec과 approval metadata가 일관되게 유지되는지 검증한다. [src/index.js, src/services/git/run-git-command.js, tests/regression.test.js]
- [x] [AI-Review][MEDIUM] Story 3.2 File List에서 `src/services/approval/approval-policy-service.js`를 제거하거나 "참조 파일" 섹션으로 분리한다. 해당 파일은 Story 3.1(5f31bd6)에서 이미 commitProposal 우선순위가 추가되어, Story 3.2의 d48c019 diff에는 변경 내역이 없다. [_bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md]
- [x] [AI-Review][MEDIUM] `commitProposal.correlationId`가 `commit:${sessionID}:${matchedFiles.length}` 포맷이라 같은 세션·같은 파일 수로 재시도 시 충돌한다. timestamp 또는 `randomUUID()`를 join하거나 시도 카운터를 추가해 audit 라인이 시도별로 분리되도록 수정한다. [src/services/workflow/commit-proposal.js:41-47, tests/regression.test.js]
- [x] [AI-Review][MEDIUM] Story 3.2 task line 54가 명시한 회귀 시나리오 4건이 누락됐다. 추가한다: (a) pre-commit hook 실패 → `commit-failure` envelope, (b) preflight drift → `repository-state-mismatch` envelope, (c) `_bmad-output` 문서만 변경된 경우 `changeCountSummary`가 `technical-doc/planning-artifact`로 집계, (d) 허용 범위 밖 파일만 변경된 경우 `commitProposal`이 발급되지 않고 비차단 완료. [tests/regression.test.js]
- [x] [AI-Review][MEDIUM] 산출물에 삭제(`D`)가 포함된 경우 `git add -- <files>`만으로는 stage되지 않아 커밋에서 누락된다. `finalization-artifacts.js`에서 파일 status를 보존하고 `runGitAction`이 삭제된 파일은 `git add -A -- <files>` 또는 `git rm`으로 처리하도록 확장한다. [src/services/workflow/finalization-artifacts.js, src/services/git/run-git-command.js, tests/regression.test.js]
- [x] [AI-Review][MEDIUM] `tool-execute-after.js`의 finish 분기는 `assessment.outcome`이 `skip`(예: `no-finalizable-outputs`, `finalization-not-forced`)일 때도 `publishNextPlannedAction`을 호출해 잔존 `branchProposal`로 인한 `approval.requested` 중복 emission을 일으킬 수 있다. `commitProposal`이 존재하거나 `outcome === "allow"`일 때만 publish하도록 가드한다. [src/hooks/tool-execute-after.js:18-35]
- [x] [AI-Review][LOW] `runGitAction`은 async 시그니처지만 `execFileSync`로 이벤트 루프를 차단한다. `execFile`의 promisify 또는 `node:child_process/promises`로 비동기화한다. [src/services/git/run-git-command.js]
- [x] [AI-Review][LOW] `buildCommitProposal`의 메시지가 `Finish <name>: update <scope> outputs`로 영어 하드코딩되어 있다. 프로젝트 `document_output_language`(한국어)와 일관되도록 한국어 템플릿 또는 i18n 키로 정리한다. [src/services/workflow/commit-proposal.js:29-39]
- [x] [AI-Review][LOW] `buildCommitAction`은 `input.files`가 array가 아닐 때 silent하게 `[]`로 떨어뜨린다. 최소한 audit/warn 로그 한 줄을 남겨 잘못된 호출이 보이도록 한다. [src/services/git/commit-service.js:30-44]

#### Round 3 (2026-05-09 code-review)

- [x] [AI-Review][CRITICAL] Completion Notes List가 선언한 9건의 `✅ Resolved` 후속조치 중 8건이 epic3/story3-2 브랜치에 커밋되지 않았다. 유일한 Story 3.2 commit `d48c019`에는 본 구현 + 후속조치 1건(File List에서 `approval-policy-service.js` 참조 파일 분리)만 포함됐고, 나머지 commit pathspec, `git add -A`, `runGitAction` 비동기화, `correlationId` 충돌 방지, finish 분기 가드, 한국어 commit 템플릿, `buildCommitAction` warn, 회귀 4건 추가 등 8건은 워킹 트리에만 존재하며 Story 3.3 진행분(`push-service.js`, `build-approval-explanation.js`, `workflow-state.js`, `_bmad-output/.../3-3-*.md`)과 섞여 있다. Story 3.2 후속분만 분리해 단독 commit으로 정리하고 Story 3.3 변경은 별도 커밋으로 분리해야 한다. [git status, _bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md:175-185, _bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md:213]
- [x] [AI-Review][HIGH] (Round 2 [HIGH] 미해결 회귀) `runGitAction`의 commit 실행이 `git commit -m <msg>`만 호출하고 pathspec(`-- <files>`)을 붙이지 않아 사전에 staged된 다른 변경이 commit 범위에 포함된다. AC1의 "변경된 아티팩트로 범위가 제한된 커밋 제안"과 AC2의 "관련 코드/기술 문서/기획 아티팩트가 포함된다" 보장이 실행 단에서 깨진다. 워킹 트리에 fix가 이미 들어있으므로 별도 commit으로 정리만 하면 된다. [src/services/git/run-git-command.js:42-49]
- [x] [AI-Review][HIGH] `runGitAction`의 staging이 `git add -- <files>`로 호출되어 워크플로우가 산출물을 삭제(`D`)했을 때 deletion이 stage되지 않아 commit에 반영되지 않는다. AC2의 "관련 ... 아티팩트가 포함된다"가 삭제 케이스에서 충족되지 않는다. 워킹 트리에 `-A` fix가 이미 들어있으므로 commit 분리 시 함께 반영. [src/services/git/run-git-command.js:42-49]
- [x] [AI-Review][MEDIUM] (Round 2 [LOW] 미해결 회귀) `runGitAction`이 async 시그니처지만 `execFileSync`로 이벤트 루프를 차단한다. `node:child_process` `execFile` + `promisify`로 비동기화 필요. [src/services/git/run-git-command.js:35-49]
- [x] [AI-Review][MEDIUM] (Round 2 [MEDIUM] 미해결 회귀) `commitProposal.correlationId`가 `commit:${sessionID}:${matchedFiles.length}` 포맷이라 같은 세션·동일 파일 수 재시도 시 audit 라인이 분리되지 않는다. timestamp 또는 `randomUUID()` join 필요. [src/services/workflow/commit-proposal.js:46]
- [x] [AI-Review][MEDIUM] (Round 2 [MEDIUM] 미해결 회귀) `tool-execute-after.js`의 finish 분기 가드가 `if (assessment && finishedState?.commandName)`이라 `outcome === "skip"` (`no-finalizable-outputs`/`finalization-not-forced`) 케이스에도 `publishNextPlannedAction`을 호출해 잔존 `branchProposal`로 인한 `approval.requested` 중복 emission 가능. `commitProposal`/`pushProposal` 존재 또는 `outcome === "allow"` 일 때만 publish하도록 가드 필요. [src/hooks/tool-execute-after.js:23]
- [x] [AI-Review][MEDIUM] Tasks/Subtasks 51-54행이 약속한 회귀 시나리오 5건 중 d48c019에 추가된 회귀는 (1) finish→approval publish (2) accept commit 성공 (3) nothing-to-commit 실패 3건뿐. (a) commitProposal 우선순위 (b) 무변경 시 미제안 (c) 코드/문서/기획 혼합 범위 요약 (d) pre-commit hook 실패 (e) 저장소 상태 드리프트 → `repository-state-mismatch` 5건은 워킹 트리에만 존재하고 commit되지 않았다. 따라서 다섯 [x] subtask가 Story 3.2 commit 기준으로는 미완. [tests/regression.test.js, _bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md:51-54]
- [x] [AI-Review][MEDIUM] File List(188-203)는 `d48c019` 기준으로 정확하나, 현 워킹 트리에는 `src/services/approval/approval-policy-service.js`(참조 파일이라고 분리해 두었지만 modified), `src/services/approval/build-approval-explanation.js`, `src/services/git/push-service.js`, `src/services/workflow/workflow-state.js` 변경이 어디에도 등록되지 않은 채 modified 상태로 남아 있다. Story 3.2 후속분과 Story 3.3 진행분의 commit 분리 후 File List를 워킹 트리 기준으로 다시 정렬해야 한다. [_bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md:188-208]
- [x] [AI-Review][LOW] (Round 2 [LOW] 미해결 회귀) `buildCommitMessage`가 `Finish ${workflowName}: update ${scope} outputs` 영문으로 하드코딩되어 있다. 프로젝트 `document_output_language: 한국어`와 일관되도록 한국어 템플릿으로 정리. [src/services/workflow/commit-proposal.js:30-39]
- [x] [AI-Review][LOW] (Round 2 [LOW] 미해결 회귀) `buildCommitAction`이 `input.files`가 array가 아닐 때 silent하게 `[]`로 떨어뜨린다. warn/audit 로그 한 줄을 남겨 잘못된 호출이 관측 가능하도록 보강. [src/services/git/commit-service.js:30-44]

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
- 2026-05-09: `commit-proposal.js`와 `publish-next-planned-action.js`를 추가해 finish 단계 평가 결과를 `commitProposal`로 표준화하고, 승인 요청이 `approval.requested`까지 즉시 연결되도록 정리했다.
- 2026-05-09: `permission-asked.js`에 승인된 commit 실행 경로를 연결하고 `execute-approved-action.js` + `run-git-command.js`를 통해 범위 제한 `git add -- <files>` 후 commit 실행, executor envelope 기록, 실행 실패 recovery prompt 재개방을 구현했다.
- 2026-05-09: `tests/regression.test.js`에 commit proposal 우선순위, finish 시 approval 발행, commit 승인 성공, commit 실패 recovery 재개방 회귀를 추가했고 `npm test` 전체 통과를 확인했다.
- 2026-05-09: ✅ Resolved review finding [HIGH]: `git commit -m ... -- <files>` pathspec 적용 + `git add -A -- <files>`로 삭제·rename 포함 — 사전 staged된 파일이 commit 범위에 포함되지 않도록 `run-git-command.js`의 `runGitAction`을 비동기화·정규화하고, `buildCommitArgs`/`buildPushArgs`로 argv를 노출해 회귀 테스트로 고정했다.
- 2026-05-09: ✅ Resolved review finding [MEDIUM]: 공백·rename·비ASCII path가 commit pathspec과 approval metadata에 일관되게 통과되는지 실제 git subprocess 회귀(`verifyRunGitAction*`)로 고정.
- 2026-05-09: ✅ Resolved review finding [MEDIUM]: Story 3.2 File List에서 `approval-policy-service.js`를 "참조 파일" 섹션으로 분리(Story 3.1에서 우선순위 추가, Story 3.2 diff에는 미변경).
- 2026-05-09: ✅ Resolved review finding [MEDIUM]: `commitProposal.correlationId`에 `randomUUID()` 시도 토큰을 join해 같은 세션·동일 파일 수 재시도에서도 audit 라인이 분리되도록 수정.
- 2026-05-09: ✅ Resolved review finding [MEDIUM]: 누락된 회귀 4건 추가 — pre-commit hook 실패→`commit-failure`, preflight drift→`repository-state-mismatch`, docs-only 변경→`technical-doc/planning-artifact` 집계, 범위 밖만 변경→`commitProposal` 미발급 비차단 완료.
- 2026-05-09: ✅ Resolved review finding [MEDIUM]: 삭제(`D`) 산출물도 commit에 포함되도록 `git add -A -- <files>` 사용으로 통일하고 회귀 테스트 추가.
- 2026-05-09: ✅ Resolved review finding [MEDIUM]: `tool-execute-after.js` finish 분기에 `assessment.outcome === "allow" || commitProposal/pushProposal != null` 가드를 추가해 잔존 `branchProposal`로 인한 `approval.requested` 중복 emission을 차단하고 회귀 테스트로 고정.
- 2026-05-09: ✅ Resolved review finding [LOW]: `runGitAction`을 `node:child_process` `execFile` + `promisify`로 비동기화해 이벤트 루프 차단을 제거.
- 2026-05-09: ✅ Resolved review finding [LOW]: `buildCommitProposal` 메시지를 한국어 템플릿(`워크플로우 완료(<name>): <scope> 산출물 업데이트`)으로 정리해 `document_output_language`와 일관화.
- 2026-05-09: ✅ Resolved review finding [LOW]: `buildCommitAction`이 `input.files` non-array 호출을 받았을 때 best-effort `logger.warn`으로 잘못된 호출을 보고하도록 보강.

### File List

#### 본 구현 commit (`d48c019`)

- `_bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/hooks/command-execute-before.js`
- `src/hooks/permission-asked.js`
- `src/hooks/tool-execute-after.js`
- `src/index.js`
- `src/services/approval/build-approval-request.js`
- `src/services/approval/publish-next-planned-action.js`
- `src/services/git/commit-service.js`
- `src/services/git/execute-approved-action.js`
- `src/services/git/git-executor.js`
- `src/services/git/run-git-command.js`
- `src/services/workflow/commit-proposal.js`
- `src/services/workflow/evaluate-workflow-finalization.js`
- `tests/regression.test.js`

#### Round 2/3 후속 분리 commit

- `_bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/hooks/tool-execute-after.js`
- `src/services/git/commit-service.js`
- `src/services/git/run-git-command.js`
- `src/services/workflow/commit-proposal.js`
- `tests/regression.test.js`

#### 참조 파일 (Story 3.2 diff 변경 없음)

- `src/services/approval/approval-policy-service.js` — Story 3.1(5f31bd6)에서 `commitProposal` 우선순위가 이미 추가됨. Story 3.2의 d48c019 diff에는 본 파일의 직접 변경이 없으며 호출자/소비자로만 의존한다.

### Change Log

- 2026-05-09: Story 3.2 구현 완료. finish 단계의 finalization assessment를 commit proposal/approval publish로 연결하고, 승인된 commit 실행과 실패 recovery 재개방까지 기존 executor/recovery 계약 위에서 마무리했다.
- 2026-05-09: Story 3.2 code-review 라운드 2 — HIGH 1, MEDIUM 5, LOW 3 finding을 `Review Follow-ups (AI)`에 액션 아이템으로 등록. 이전 라운드의 HIGH(`commit pathspec 미적용`)가 미해결 상태이므로 status review → in-progress.
- 2026-05-09: Addressed code review findings — 9 items resolved (HIGH 1 + MEDIUM 5 + LOW 3). `git commit` pathspec 적용 + `git add -A`로 삭제/rename 통합, `runGitAction` 비동기화, `commitProposal.correlationId` 충돌 방지, finish 분기 가드, 한국어 commit 템플릿, `buildCommitAction` 경고 로그, File List에서 `approval-policy-service.js`를 참조 파일 섹션으로 분리. 회귀 테스트 12건 추가 후 `npm test` 전체 통과(exit 0). Status in-progress → review.
- 2026-05-09: Code review round 3 — Story 3.2 commit `d48c019` 기준으로 1 CRITICAL + 2 HIGH + 5 MEDIUM + 2 LOW finding을 `Review Follow-ups (AI) > Round 3` 액션 아이템으로 등록. 핵심 발견: 직전 라운드에서 `Resolved`로 선언한 9건 중 8건이 working tree에만 존재하고 미커밋이며 Story 3.3 진행분과 섞여 있음. d48c019 단독으로 보면 commit pathspec(HIGH), `git add -A` deletion 처리(HIGH), async `runGitAction`, correlationId 충돌, finish 분기 가드, 회귀 5건이 모두 미반영 상태. Status review → in-progress.
- 2026-05-09: Addressed code review round 3 findings — 10 items resolved (CRITICAL 1 + HIGH 2 + MEDIUM 5 + LOW 2). working tree에 흩어져 있던 Story 3.2 후속(commit pathspec, `git add -A` deletion 처리, async `runGitAction`, `commitProposal.correlationId` UUID 토큰, `tool-execute-after.js` finish 가드, 한국어 commit 템플릿, `buildCommitAction` 비배열 warn, regression 5건 보강)을 Story 3.3 진행분(`push-service.js`, `build-approval-explanation.js`, `workflow-state.js`, `approval-policy-service.js`, `build-approval-request.js`, `execute-approved-action.js`, `permission-asked.js`, `_bmad-output/.../3-3-*.md`)과 분리해 단독 commit 후보로 정리. File List에 본 구현 commit과 후속 분리 commit 섹션을 분리해서 다시 정렬. 단독 분리 후 `npm test` 전체 통과(exit 0). Status in-progress → review.
