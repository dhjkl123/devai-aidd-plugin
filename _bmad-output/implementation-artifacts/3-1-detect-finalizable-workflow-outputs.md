# Story 3.1: 완료 가능한 워크플로우 출력 감지

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

워크플로우 사용자로서,
플러그인이 워크플로우가 최종화 가능한 산출물을 만들었는지 판단하길 원한다,
그래서 실제로 기록할 가치가 있는 출력이 있을 때만 종료 시점 Git 작업이 제안되도록 한다.

## Acceptance Criteria

1. **Given** 워크플로우가 finish 단계에 도달했을 때
   **When** 플러그인이 워크플로우 결과를 평가하면
   **Then** 변경된 코드, 문서, 기획 산출물이 최종화 대상인지 판정한다
   **And** 그 판정은 워크플로우별 finalization policy를 따른다.
2. **Given** 최종화 가능한 산출물이 없을 때
   **When** 최종화 평가가 수행되면
   **Then** 플러그인은 불필요한 commit 제안을 만들지 않는다
   **And** 워크플로우는 비차단 경로로 종료될 수 있다.

## Tasks / Subtasks

- [ ] 최종화 출력 판정용 세션 상태 모델을 추가한다 (AC: 1, 2)
  - [ ] `src/services/workflow/workflow-state.js`에 Story 3.1 전용 상태 슬롯을 추가한다. 최소 후보: `touchedFiles`, `finalizationAssessment`, `finalizationArtifacts`, `commitProposal`.
  - [ ] 기존 `approvalCurrent`, `pendingActions`, `recoveryGate`, `lastGitResult`와 동일하게 `get()`에서 deep clone을 보장한다.
  - [ ] Story 2.5의 recovery gate가 `workflow-finalization` 범위를 막는 동안 finalization assessment가 commit/push 계획을 성급히 열지 않도록 상태 분리를 유지한다.

- [ ] 워크플로우 산출물 수집기를 구현한다 (AC: 1, 2)
  - [ ] `src/hooks/file-edited.js`를 더 이상 단순 위임만 하지 않도록 확장하고, session-scoped 파일 편집 이벤트를 누적 기록한다.
  - [ ] 런타임이 `file.edited`를 항상 보내지 않는 경우를 대비해 보조 수집 경로를 설계한다. 후보: `pluginContext`에서 제공 가능한 changed-files 조회 함수, 또는 Story 3.2 직전의 Git status snapshot 재사용.
  - [ ] 산출물 분류는 최소한 `code`, `technical-doc`, `planning-artifact`, `other` 네 범주를 구분하고, 절대경로/상대경로 혼용을 정규화한다.

- [ ] 최종화 가능성 판정 서비스를 구현한다 (AC: 1, 2)
  - [ ] 새 서비스 후보 `src/services/workflow/detect-finalizable-outputs.js`에 순수 함수 형태의 판정 로직을 둔다.
  - [ ] 입력은 최소한 `workflowContext`, `workflowPolicy`, `trackedFiles`, `repositorySnapshot`, `lastContinuationDecision`, `activeRecoveryGate`를 받는다.
  - [ ] 출력은 기존 envelope 스타일을 재사용한다: `{ outcome, reason, message, details }`.
  - [ ] `details`에는 `hasFinalizableOutputs`, `artifactScope`, `artifactKinds`, `matchedFiles`, `ignoredFiles`, `policyFinalization`, `shouldProposeCommit`, `shouldConsiderPushLater`를 담는다.

- [ ] workflow policy 기반 판정 규칙을 명시적으로 구현한다 (AC: 1, 2)
  - [ ] `commit-and-push`: 의미 있는 출력이 있으면 commit 준비 가능 상태를 연다. push 판단은 Story 3.3에서 이어받도록 별도 플래그만 남긴다.
  - [ ] `commit-optional-push`: planning artifact 중심 워크플로우에서도 실제 변경 파일이 존재할 때만 finalizable로 본다.
  - [ ] `no-forced-finalization`: 출력이 있어도 자동 commit 제안을 강제하지 않는다. 단, audit/traceability용 detection result는 남긴다.
  - [ ] `artifactKey`가 있는 정책은 `prd`, `architecture`, `epics`, `sprint-planning` 같은 singleton artifact 기대치와 실제 touched file 범위를 교차검증한다.

- [ ] finish 단계 진입과 finalization assessment 호출 경계를 추가한다 (AC: 1, 2)
  - [ ] `src/services/workflow/detect-workflow-context.js`가 이미 예약한 `finish` phase를 Story 3.1에서 실제 사용한다.
  - [ ] 훅에 직접 commit/push 로직을 넣지 말고, Story 3.2가 재사용할 수 있는 `advancePhase(..., "finish")` + assessment 호출 경계만 만든다.
  - [ ] `src/hooks/tool-execute-after.js`는 여전히 thin hook 원칙을 유지하고, finish 판정 오케스트레이션이 필요하면 전용 helper/service를 호출하는 수준에 그친다.

- [ ] approval/recovery 파이프라인과 충돌하지 않도록 최종화 제안 준비 구조를 만든다 (AC: 1, 2)
  - [ ] `src/services/approval/approval-policy-service.js`의 주석과 우선순위 설계를 Story 3.x 현실과 맞춘다. `commitProposal`, `pushProposal`는 Story 3.2/3.3에서 승격되므로 Story 3.1은 검출 결과만 준비한다.
  - [ ] `src/hooks/command-execute-before.js`가 init/branch planning 후 future finalization planning을 수용할 수 있게 확장 포인트를 만든다.
  - [ ] unresolved commit recovery gate가 열려 있을 때 `finalizationAssessment.details.shouldProposeCommit === false`가 되도록 방어한다.

- [ ] 구조화 감사 이벤트와 테스트를 추가한다 (AC: 1, 2)
  - [ ] 새 이벤트 후보: `workflow.finalization.evaluated`, `git.finalization.outputs.detected`, `git.finalization.outputs.skipped`.
  - [ ] 이벤트 envelope은 기존 규약을 따른다: `event`, `timestamp`, `workflow`, `command`, `outcome`, `details`.
  - [ ] `tests/regression.test.js`에 최소 다음 회귀를 추가한다:
    - [ ] file-edited 경로가 세션별 touched file를 누적하고 `session.deleted`에서 정리되는지
    - [ ] `commit-and-push` 정책 + 변경 파일 존재 시 `hasFinalizableOutputs === true`
    - [ ] 변경 파일 없음 또는 무관한 파일만 변경 시 `shouldProposeCommit === false`
    - [ ] `artifact-singleton` 정책에서 기대 artifact 범위와 실제 파일이 어긋나면 `reason`이 설명 가능한 값으로 분류되는지
    - [ ] recovery gate가 `workflow-finalization`을 막을 때 commit/push 준비가 열리지 않는지

## Dev Notes

### Story Intent

Story 3.1의 목표는 commit이나 push를 실행하는 것이 아니다. 그 전 단계에서 "이 세션의 워크플로우가 Git으로 기록할 만한 결과를 만들었는가?"를 안정적으로 판단하는 것이다.

이 스토리는 Story 3.2의 commit proposal, Story 3.3의 push proposal, Story 3.4의 audit traceability가 모두 의존하는 기반 계층이다. 따라서 훅에서 직접 `git commit`을 부르지 말고, 산출물 추적과 finalization assessment를 세션 상태에 축적하는 데 집중해야 한다.

### Epic 3 Context

- Epic 3 전체 목표는 "최종화와 추적 가능한 전달"이다. Story 3.1은 그 첫 단계로서 의미 있는 출력이 있을 때만 최종화 흐름을 연다.
- Story 3.2는 Story 3.1이 남긴 assessment를 바탕으로 commit proposal을 만든다.
- Story 3.3은 Story 3.2의 성공한 local commit 이후에만 remote 존재 여부를 보고 push를 고려한다.
- Story 3.4와 3.5는 Story 3.1이 놓친 산출물 판정 누락이 있으면 그대로 추적성 결함으로 이어진다.

### Verified Baseline Findings

- `src/config/defaults.js`에는 이미 workflow별 `finalization` 정책이 정의되어 있다. `bmad-bmm-create-story`, `bmad-bmm-dev-story`, `bmad-bmm-quick-dev`, `bmad-bmm-qa-generate-e2e-tests`는 `commit-and-push`, planning 계열은 주로 `commit-optional-push`, research/review 일부는 `no-forced-finalization`이다.
- `src/services/workflow/resolve-workflow-policy.js`는 `finalization`과 선택적 `artifactKey`를 포함한 normalized policy를 이미 반환한다. Story 3.1은 이 정책을 소비해야지 재해석하면 안 된다.
- `src/services/workflow/detect-workflow-context.js`는 `finish` phase를 예약해 두었지만 아직 downstream story에서 실제로 사용하지 않는다. Story 3.1이 이 예약값의 첫 소비자가 된다.
- `src/hooks/file-edited.js`는 현재 완전한 pass-through stub이다. 실제 산출물 추적은 아직 시작되지 않았다.
- `src/services/approval/approval-policy-service.js`는 `initProposal`/`branchProposal`까지만 우선순위를 구현하고 있고 주석에 `commitProposal`, `pushProposal`는 Story 3.x future라고 적혀 있다. Story 3.1은 이 빈 지점을 설계상 메워야 한다.
- `src/services/git/commit-service.js`와 `src/services/git/push-service.js`는 이미 thin wrapper로 존재한다. Story 3.1은 이 실행 계층으로 내려가기 전의 준비 계층만 다뤄야 한다.
- `src/services/workflow/workflow-state.js`는 approval, git execution result, recovery gate를 session-scoped + deep-clone 형태로 보관한다. finalization 관련 상태도 동일한 저장 규율을 따라야 한다.

### Technical Requirements

- 최종화 가능성 판정은 "파일이 바뀌었는가"만 보면 안 된다. 아래를 함께 판단해야 한다.
  - 워크플로우 policy의 `finalization`
  - 워크플로우 identityStrategy 및 `artifactKey`
  - 세션에서 추적된 edited files
  - 현재 recovery gate가 finalization을 막고 있는지
  - 실행 실패 후 `continue-without-automation` 같은 continuation decision이 있었는지
- 산출물 분류는 repo-local 경로를 기준으로 한다. 최소 범주 예시:
  - `src/`, `tests/`, `scripts/`, `templates/`, `installer/` -> code/distribution-support
  - `_bmad-output/planning-artifacts/` -> planning-artifact
  - `_bmad-output/implementation-artifacts/` -> implementation-artifact
  - `README.md`, `CHANGELOG.md`, `docs/` -> technical-doc
- Story 3.1은 commit message 생성, staging 범위 계산, remote 확인을 하지 않는다. 그 책임은 각각 Story 3.2 / Story 3.3으로 넘긴다.
- 판정 결과가 "없음"이어도 audit-friendly해야 한다. `why no commit proposal was created`를 machine-readable하게 남겨야 후속 스토리와 리뷰가 단순해진다.

### Architecture Compliance

- 훅은 얇게 유지한다. 최종화 판단 로직은 새 workflow service 또는 git-finalization orchestration service로 보낸다.
- 기존 공통 envelope을 유지한다. 새 bool 플래그만 흩뿌리지 말고 `{ outcome, reason, message, details }`를 사용한다.
- 세션 상태는 `workflowState` 단일 저장소에 유지한다. 별도 전역 캐시나 숨은 singleton을 만들지 않는다.
- audit는 best-effort다. finalization detection audit 실패가 workflow completion을 망가뜨리면 안 된다.
- Story 2.5가 만든 recovery gate contract를 존중한다. `workflow-finalization` gate가 열려 있으면 commit/push 경로는 닫혀 있어야 한다.

### 구현 파일 후보

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js`
  - 세션별 edited file 추적 진입점.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\workflow-state.js`
  - `touchedFiles`, `finalizationAssessment`, `commitProposal` 저장/복제/정리 규칙 추가.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\detect-finalizable-outputs.js` (신규 후보)
  - 순수 판정 로직의 주 거점.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js`
  - future finalization planning을 위한 확장 포인트 연결.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\approval-policy-service.js`
  - Story 3.2/3.3로 이어질 proposal 우선순위 주석/선택 포인트 조정.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-after.js`
  - finish phase 진입 helper를 연결해야 한다면 여기서 얇게 위임.
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js`
  - Story 3.1 회귀 및 상태 격리 테스트 추가.

### Testing Requirements

- 기존 테스트 스타일을 유지해 `tests/regression.test.js`에 story-scoped verification function을 추가한다.
- 최소 검증 포인트:
  - edited file 누적/정리
  - workflow policy별 finalization 판정
  - artifactKey 기반 singleton planning artifact 판정
  - recovery gate가 finalization을 차단하는지
  - no-op 종료 경로에서 commit proposal이 생성되지 않는지
  - deep-clone된 state snapshot 외부 변조가 store 내부에 역류하지 않는지

### Previous Story Intelligence

- Story 2.5는 세션 상태를 늘릴 때 반드시 `workflowState.get()` deep clone 경계를 보존했다. Story 3.1도 touched file 목록과 assessment payload를 같은 수준으로 보호해야 한다.
- Story 2.5는 hook를 얇게 두고 `src/services/approval/`로 로직을 밀어 넣었다. Story 3.1도 `file-edited.js`와 `command-execute-before.js`에 판정 알고리즘을 직접 넣지 않는 편이 맞다.
- Story 2.5는 recovery gate가 `workflow-finalization` 범위를 막는 규칙을 이미 만들었다. Story 3.1이 이를 무시하면 commit/push 준비가 복구 중 세션을 뚫고 나가 회귀를 만든다.
- Story 2.5 리뷰 라운드에서 "문서의 주장과 실제 수정 파일이 어긋나는 문제"가 반복됐다. 이번 스토리는 Dev Notes에만 후보 파일을 쓰고, Dev Agent Record의 File List는 비워 실제 구현 완료 전 허위 이력을 만들지 않는다.

### Git Intelligence Summary

- 최근 큰 작업 패턴은 "서비스 추가 + 얇은 훅 수정 + 대형 회귀 테스트 추가" 조합이다.
- `8ba998b`와 `982ba5f`는 Epic 2 전반을 `src/services/approval/`, `src/services/git/`, `src/hooks/`, `tests/regression.test.js` 중심으로 확장했다.
- `a3a1e40`은 Story 1.5에서 `check-repository-readiness.js`, `build-init-proposal.js`, `run-git-command.js`를 신규 서비스로 분리하고 `command-execute-before.js`는 오케스트레이션만 유지했다.
- 따라서 Story 3.1도 한 파일에 거대한 로직을 몰기보다:
  - workflow service 신설
  - 최소 hook wiring
  - regression test 확장
  패턴을 따르는 것이 현재 저장소 관성에 맞다.

### Latest Tech Information

- 이 저장소는 `package.json` 기준 ESM Node.js 런타임과 `ajv@8.17.1`을 사용한다. Story 3.1 범위에서는 새 의존성을 추가할 근거가 없다.
- Ajv 공식 가이드는 스키마를 한 번 컴파일해 재사용하는 패턴을 권장한다. Story 3.1에서 새 runtime schema가 필요하더라도 매 호출 재컴파일은 피하는 편이 맞다.
- 최신 Node.js 문서에서는 `structuredClone`이 전역 객체로 제공된다. 현재 `workflow-state.js`가 이미 이 전제를 사용하므로 Story 3.1도 동일한 복제 전략을 유지하면 된다.

### Project Structure Notes

- 현재 구조는 `hooks -> services -> git/audit/config` 경계가 비교적 명확하다.
- finalization detection은 `services/workflow/` 또는 `services/git/` 어디에 둘지 선택이 필요하다.
  - 권장: "무엇이 산출물인가"는 workflow 문맥 문제이므로 `services/workflow/`에 두고,
  - Story 3.2의 commit assembly는 `services/git/commit-service.js` 쪽으로 넘긴다.
- `file.edited`는 현재 미구현이므로 Story 3.1이 최초 실질 소비자가 될 가능성이 높다. 단, 런타임 이벤트 보장 수준이 불명확하므로 fallback source를 설계해야 한다.

### References

- Epic 3 / Story 3.1 원문:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md` - `## Epic 3: Finalization and Traceable Delivery`, `### Story 3.1: Detect Finalizable Workflow Outputs`
- 제품 요구:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md` - Product Scope, Journey 1, FR7, FR8, FR23-FR26
- 아키텍처 경계:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md` - Cross-Cutting Concerns, Data Architecture, Communication Patterns, Project Structure & Boundaries
- 이전 스토리 학습:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\2-5-offer-recovery-paths-without-failing-the-workflow.md`
- workflow policy 기본값:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\defaults.js`
- policy resolution:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\resolve-workflow-policy.js`
- 세션 상태 저장소:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\workflow-state.js`
- 현재 planning ingress:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js`
- 현재 file-edited stub:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js`
- phase 전환 baseline:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-after.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\detect-workflow-context.js`
- 기존 commit/push 실행 경계:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\commit-service.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\push-service.js`
- approval queue 확장 포인트:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\approval-policy-service.js`
- 회귀 테스트 기준:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 최근 커밋 패턴 검토: `git log --oneline -5`, `git show --stat --oneline --summary -1 8ba998b`, `git show --stat --oneline --summary -1 982ba5f`, `git show --stat --oneline --summary -1 a3a1e40`
- 로컬 컨텍스트 검토: `src/config/defaults.js`, `src/services/workflow/resolve-workflow-policy.js`, `src/services/workflow/workflow-state.js`, `src/hooks/command-execute-before.js`, `src/hooks/file-edited.js`, `src/hooks/tool-execute-after.js`, `src/services/approval/approval-policy-service.js`, `src/services/git/commit-service.js`, `src/services/git/push-service.js`, `tests/regression.test.js`

### Completion Notes List

- 2026-05-09: `bmad-create-story` 워크플로우 기준으로 Epic 3 / Story 3.1 컨텍스트 문서를 생성했다.
- 2026-05-09: Epic 3 원문, PRD, architecture, 관련 소스/테스트, Epic 2 마지막 스토리, 최근 커밋 패턴을 반영해 구현 가드레일을 정리했다.
- 2026-05-09: 사용자 지시에 따라 `sprint-status.yaml`을 포함한 다른 파일은 수정하지 않았고, 대상 스토리 파일만 작성했다.
- 2026-05-09: 컨텍스트 생성 완료 - Status를 `ready-for-dev`로 설정하고 Dev Notes/Tasks/References를 구현 가능 수준으로 구체화했다.

### File List

