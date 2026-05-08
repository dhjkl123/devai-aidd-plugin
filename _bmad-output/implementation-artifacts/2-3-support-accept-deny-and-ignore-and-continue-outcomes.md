# Story 2.3: Support Accept, Deny, and Ignore-and-Continue Outcomes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want to accept, deny, or ignore each proposed Git action,
So that I retain control over automation without losing momentum in the workflow.

## Acceptance Criteria

1. **Given** an approval request is active
   **When** the user selects accept, deny, or ignore-and-continue
   **Then** the plugin records the selected outcome against the current action and session context
   **And** subsequent behavior follows the selected outcome consistently.
2. **Given** the user denies or ignores a Git action
   **When** the plugin resolves the approval
   **Then** the repository is left unchanged for that action
   **And** the workflow continues without forcing the user to abandon the BMAD task.

## Tasks / Subtasks

- [x] approval outcome state machine을 `src/services/approval/` 계층에 추가한다 (AC: 1, 2)
  - [x] `src/services/approval/approval-resolution-state.js` 또는 동등 모듈을 생성하고 approval lifecycle의 표준 상태를 정의한다.
    - `pending`: approval request가 발행되었지만 아직 선택되지 않은 상태.
    - `accept`: 사용자가 제안된 Git action 실행을 허용한 상태.
    - `deny`: 사용자가 action을 거부했고 해당 action에 대한 repository mutation이 금지된 상태.
    - `ignore-and-continue`: 사용자가 action을 실행하지 않고 workflow만 계속 진행하기로 선택한 상태.
  - [x] 상태 전이는 최소한 `pending -> accept|deny|ignore-and-continue`만 허용하고, resolve 이후 동일 approval에 대한 추가 mutation을 금지하는 terminal state 규칙을 명시한다.
  - [x] approval result 객체의 기준 형식을 고정한다.
    - `{ approvalId, sessionID, actionId, actionKind, outcome, resolvedAt, resolvedBy, continuation, reasonCode, metadata }`
    - `continuation`은 `execute-now | continue-without-action` 중 하나로 표준화한다.
  - [x] `deny`와 `ignore-and-continue`는 둘 다 `continuation: "continue-without-action"`이지만 의미 차이를 보존한다.
    - `deny`: 정책/의도/리스크를 보고 명시적으로 거부.
    - `ignore-and-continue`: action은 건너뛰되 workflow 진행을 우선.

- [x] single-active-action 규칙과 optional queue 규칙을 정의한다 (AC: 1)
  - [x] 같은 `sessionID`에는 동시에 하나의 `activeApproval`만 허용한다.
  - [x] `branchProposal`, `initProposal`, 이후 Epic 3의 commit/push proposal은 모두 queue 가능한 planned action으로 취급하되, approval request는 queue head 하나만 활성화한다.
  - [x] `workflowState.activeApprovalId`가 존재하면 후속 planned action은 즉시 실행/요청하지 않고 `workflowState.pendingActions[]`에 적재한다.
  - [x] queue 정책은 FIFO를 기본으로 하고, Story 2.3 범위에서는 priority preemption을 도입하지 않는다.
  - [x] 이미 resolve되지 않은 approval이 있으면 동일 action에 대한 중복 `approval.requested` 발행을 금지한다.

- [x] workflow state 저장 위치와 lifecycle을 정의한다 (AC: 1, 2)
  - [x] 기존 `src/services/workflow/workflow-state.js`의 in-memory session store를 승인 상태의 1차 저장소로 사용한다.
  - [x] session state 확장 필드는 다음을 기준으로 제안한다.
    - `branchProposal`
    - `initProposal`
    - `activeApproval`
    - `pendingActions`
    - `approvalHistory`
    - `lastContinuationDecision`
  - [x] `activeApproval` 형식은 `approvalId`, `actionId`, `request`, `status`, `requestedAt`, `sourceEvent`를 포함한다.
  - [x] `approvalHistory`는 session 범위 traceability를 위한 append-only 배열로 유지하되, 장기 영속 저장소는 Story 2.3 범위 밖으로 둔다.
  - [x] `session.deleted` 이벤트 수신 시 `workflowState.clear(sessionID)`가 approval state, queue, history를 함께 제거하도록 lifecycle을 문서화한다.
  - [x] plugin 재시작 간 영속성은 도입하지 않는다. Story 2.3은 session memory 기준 일관성만 보장한다.

- [x] approval outcome을 consume할 hook/event 경로를 설계한다 (AC: 1, 2)
  - [x] `permission.asked` hook을 approval response ingress 후보로 사용한다. 런타임이 approval UI/permission 결과를 전달하는 가장 직접적인 훅이므로 Epic 2 approval resolution의 1차 소비 지점으로 둔다.
  - [x] `command.execute.before`는 proposal planning과 `approval.requested` 전 준비까지만 담당하고, outcome resolve는 담당하지 않는다.
  - [x] `tool.execute.before`와 `tool.execute.after`는 active approval이 unresolved일 때 action gating 상태를 보조적으로 확인하는 thin hook으로 유지한다.
  - [x] `event` hook의 `session.deleted`는 cleanup 전용이며, approval resolve 로직을 넣지 않는다.
  - [x] 런타임 제약상 `permission.asked` payload가 충분하지 않을 경우에만 별도 approval response adapter를 추가 후보로 두되, Story 2.3 문서에서는 기존 hook-first 통합을 기본안으로 유지한다.

- [x] approval request / resolve audit/event contract를 정의한다 (AC: 1, 2)
  - [x] 최소 구조화 이벤트 집합:
    - `approval.requested`
    - `approval.resolved`
    - `git.action.skipped`
  - [x] `approval.requested` payload 기준:
    - `{ event, timestamp, workflow, command, sessionID, approvalId, actionId, details: { actionKind, actionName, proposalKind, proposalReason, requiresApproval, phase } }`
  - [x] `approval.resolved` payload 기준:
    - `{ event, timestamp, workflow, command, sessionID, approvalId, actionId, outcome, details: { actionKind, continuation, phase, sourceHook, hadActiveApproval } }`
  - [x] `deny` 또는 `ignore-and-continue` 선택 시 `git.action.skipped`를 best-effort로 발행한다.
    - `details: { actionKind, actionId, reason: "approval-denied" | "approval-ignored", continuation: "continue-without-action" }`
  - [x] raw arguments, remote URL, credential, 자유 입력 장문 설명은 감사 payload에 넣지 않는다.
  - [x] Story 2.3은 execution success/failure event를 정의하지 않는다. 실제 `git.action.executed`, `git.action.failed` 분류는 Story 2.4/2.5 경계로 남긴다.

- [x] deny / ignore 이후 continuation semantics를 명시한다 (AC: 2)
  - [x] `deny`: 해당 action proposal을 terminally closed로 표시하고, 동일 session의 다음 workflow step은 계속 허용한다.
  - [x] `ignore-and-continue`: 해당 action을 skipped로 기록하고, workflow phase advancement와 후속 non-dependent 작업을 계속 허용한다.
  - [x] 두 outcome 모두 repository mutation 실행 경로로 진입하지 않는다.
  - [x] `deny`/`ignore-and-continue` 후 wrapper는 legacy core 또는 후속 BMAD step을 hard-fail로 바꾸지 않는다.
  - [x] 다만 후속 action이 선행 action의 성공을 전제로 할 경우에는 Story 2.3에서 failure로 취급하지 않고, 후속 planning 단계가 state를 읽어 action proposal을 보수적으로 생략하거나 `reasonCode`를 남기도록 한다.
  - [x] workflow abandon 강제는 금지한다. 사용자에게 “continue without Git automation” 경로를 남기는 것이 기본 동작이다.

- [x] action gating 규칙을 정의한다 (AC: 1, 2)
  - [x] `accept`가 되기 전까지 mutation-capable git executor는 호출될 수 없다.
  - [x] gating 판단은 thin hook에서 직접 분기하지 말고 `services/approval`의 단일 resolver 함수가 수행한다.
  - [x] `branchProposal`/`initProposal`/향후 `finalizeProposal`은 모두 공통 `plannedAction` 포맷으로 정규화한다.
    - `{ actionId, kind, action, proposal, requiresApproval, sessionID, phase, createdAt }`
  - [x] `accept` 시에만 해당 `plannedAction`이 실행 큐로 이동할 수 있다.
  - [x] `deny`/`ignore-and-continue` 시 해당 `plannedAction`은 queue에서 제거되고 history로만 남는다.
  - [x] queue head가 resolve되면 다음 pending action이 있더라도 즉시 실행하지 않고, 별도 `approval.requested` 발행 과정을 다시 거친다.

- [x] Story 2.4/2.5와의 경계를 명확히 둔다 (AC: 1, 2)
  - [x] Story 2.3은 “사용자 선택 결과를 기록하고 continuation을 결정”하는 것까지만 책임진다.
  - [x] 실제 Git 실행 중 발생하는 branch conflict, push rejection, detached state mismatch, non-zero exit 분류는 Story 2.4 책임이다.
  - [x] retry, manual recovery, skip-after-failure UI/flow는 Story 2.5 책임이다.
  - [x] 따라서 Story 2.3의 `accept` outcome은 “실행 허가”이지 “실행 성공”이 아니다.

- [x] 회귀 테스트와 계약 테스트 포인트를 정의한다 (AC: 1, 2)
  - [x] `tests/regression.test.js`에 다음 시나리오를 추가한다.
    - active approval이 없는 session에서 resolve 요청이 들어오면 no-op 또는 controlled error로 처리되는지.
    - `deny` 선택 시 `branchProposal` 또는 `initProposal`에 대응하는 mutation executor 호출 없이 `approval.resolved`와 `git.action.skipped`만 기록되는지.
    - `ignore-and-continue` 선택 시 queue head가 제거되고 workflow continuation marker가 저장되는지.
    - `accept` 선택 시 approval state가 resolved로 전환되고 후속 executor hand-off에 필요한 실행 토큰만 남는지.
    - 동일 session에 두 번째 approval request가 생성되더라도 첫 approval이 pending이면 queue 적재만 되고 second request가 활성화되지 않는지.
    - `session.deleted` 후 approval state, queue, history가 모두 정리되는지.
  - [x] 가능하면 `tests/contracts/approval-policy.contract.test.js` 또는 동등 위치에 event payload shape 검증을 추가한다. (구현: `tests/regression.test.js`의 `verifyBuildApprovalResolutionContracts`, `verifyApprovalRequestedAuditIncludesActionId`)
  - [x] `tests/integration/hooks.integration.test.js` 또는 동등 위치에 `command.execute.before -> approval.requested -> permission.asked -> approval.resolved` 흐름을 검증한다. (구현: `verifyPermissionAskedHookFlow`, `verifySessionDeletedClearsAllApprovalState`)
  - [x] legacy parity 회귀 포인트: deny/ignore가 있어도 기존 BMAD command 감지, output normalization, non-workflow bypass가 깨지지 않아야 한다. (기존 `main()` 회귀 시나리오에서 변함없이 통과)

### Review Follow-ups (AI)

> 2026-05-09 code-review (post-implementation, status=review). 전부 액션 아이템으로 누적. 코드는 미수정.
> 2026-05-09 dev follow-up (status=in-progress → review). 전 항목 해소. 회귀 테스트 갱신 + 추가 (총 11종 → 14종).
> 2026-05-09 second code-review (status=review, 옵션 1 자동 수정). 0 HIGH / 0 MEDIUM / 2 LOW 발견 후 즉시 수정.

- [x] [AI-Review][LOW] `parseApprovalOutcome`이 `input.action`을 fallback 후보에 포함해 unrelated permission event의 tool/operation 명("allow"/"block"/"skip" 등)이 우연히 alias 테이블과 충돌해 active approval을 silent close할 위험. `matchesActiveApproval` 가드가 1차 보호하지만, 후보를 dedicated decision key(`outcome | decision | response | choice`)로만 좁히는 편이 안전. [src/hooks/permission-asked.js:50-65]
  - **해소**: `parseApprovalOutcome` 후보에서 `input.action` 제거. 이유 주석을 함수 docstring에 명시. 회귀 테스트 `verifyPermissionAskedHookIgnoresGenericActionField` 추가 — `requestId` echo + `action:"allow"`가 들어와도 approval은 닫히지 않고 `approval.resolution.failed(reason="unknown-outcome")`이 발행되며, dedicated key(`decision: "accept"`)는 정상 resolve 경로를 유지함을 검증.
- [x] [AI-Review][LOW] `tool.execute.before` / `tool.execute.after` factory에 `pluginContext`가 주입되지만 destructure되지 않아 dead injection. LOW-3에서 `permission.asked`의 동일 노이즈를 제거한 정책과 일관성을 위해 정리. [src/index.js:167-168, src/hooks/tool-execute-before.js:3, src/hooks/tool-execute-after.js:3]
  - **해소**: `index.js`의 두 hook factory 호출에서 `pluginContext` 주입 제거. 추가 회귀 테스트는 불필요 — 기존 `npm run build && npm test`가 두 hook의 phase 진행 contract를 이미 그린으로 검증.

- [x] [AI-Review][MEDIUM] queue advancement가 production flow에서 dead code임. `consume-approval-outcome.js:128-134`의 head 제거 분기는 `pendingActions[0].actionId === resolution.actionId`일 때만 발동하지만 `command-execute-before.js:302`의 `candidateActionId !== activeActionId` 가드가 실제 흐름에서 그 등식을 막는다. 또한 `selectNextPlannedAction` (`approval-policy-service.js:41-59`)는 `pendingActions`를 보지 않아 큐 항목이 다음 approval로 promote되지 않는다. 회귀 테스트 `verifyConsumeApprovalOutcomeQueueAdvancement`는 production이 만들지 않는 fixture(헤드 actionId === active actionId)를 사용해 gap을 가린다. 결정 필요: ① `command-execute-before`가 active도 큐 head로 밀어 넣도록 리팩터, 또는 ② `consume-approval-outcome` 큐 head 제거 분기 삭제 + `selectNextPlannedAction`이 `pendingActions` head를 우선으로 보도록 변경. [src/services/approval/consume-approval-outcome.js:128, src/hooks/command-execute-before.js:286-326, src/services/approval/approval-policy-service.js:41-59, tests/regression.test.js:3984-4067]
  - **해소(옵션 ②)**: `consume-approval-outcome.js`에서 큐 head 제거 분기 삭제, `selectNextPlannedAction`이 `pendingActions[0].proposal`을 priority 0로 반환, `command-execute-before.js`의 promote 분기에서 `pendingActions[0].actionId === approvalRequest.actionId`이면 큐 head를 shift. 큐 advancement는 이제 단일 위치(promotion)에서 발생.
  - 테스트: `verifyConsumeApprovalOutcomeQueueAdvancement` 삭제 → `verifyConsumeApprovalOutcomeLeavesQueueIntact`(resolver는 큐를 건드리지 않음) + `verifyCommandExecuteBeforePromotesQueueHead`(promote 시 head shift)로 분리.
- [x] [AI-Review][MEDIUM] `approval.requested` audit `details` shape이 스토리 task 명세와 다르다. 명세: `{ actionKind, actionName, proposalKind, proposalReason, requiresApproval, phase }`. 실제: `{ requestId, actionId, actionType, proposalKind, phase, sessionID, explanationFallback }`. 누락된 `actionKind`/`actionName`/`proposalReason`/`requiresApproval`을 보강하거나, 스토리 명세를 현재 형태로 갱신해 실제와 일치시키고 `approval.resolved`/`git.action.skipped` 와의 비대칭을 정리할 것. [src/hooks/command-execute-before.js:236-253, _bmad-output/implementation-artifacts/2-3-support-accept-deny-and-ignore-and-continue-outcomes.md:73-74]
  - **해소**: `command-execute-before.js`의 `approval.requested` audit details에 `actionKind / actionName / proposalKind / proposalReason / requiresApproval / phase` 명세 키를 추가. 기존 `requestId / actionId / actionType / sessionID / explanationFallback`은 traceability superset로 유지(audit consumer 파급 최소화).
  - 테스트: `verifyApprovalRequestedAuditDetailsShape` 추가.
- [x] [AI-Review][MEDIUM] Git vs Story File List 불일치: `_bmad-output/planning-artifacts/architecture.md`(modified, `approval.prompt.delivery.failed`/`git.readiness.checked` 추가)와 `_bmad-output/implementation-artifacts/sprint-status.yaml`(modified)이 본 스토리 File List에 누락. 해당 변경이 본 스토리 책임인지 확인하고 File List에 반영하거나 분리. [_bmad-output/planning-artifacts/architecture.md:339-348]
  - **해소**: 본 스토리에서 발생한 `architecture.md`(approval.resolution.failed 이벤트 등재 포함) 및 `sprint-status.yaml`(스토리 상태 전이) 변경을 File List에 반영.
- [x] [AI-Review][LOW] `permission-asked.js:136-148`이 발행하는 `approval.resolution.failed` 이벤트가 `architecture.md`의 구조화 필수 이벤트 목록에 등재되지 않음. enforcement guideline에 따라 architecture 문서에 추가하거나 이벤트명을 기존 이벤트로 흡수. [src/hooks/permission-asked.js:136-148, _bmad-output/planning-artifacts/architecture.md:337-348]
  - **해소**: `architecture.md`의 "구조화 필수 이벤트" 목록에 `approval.resolution.failed` 추가.
- [x] [AI-Review][LOW] prompt `metadata`에 `actionId` 누락으로 `permission-asked` ingress의 actionId echo 경로가 사실상 사용 불가. requestId echo만 작동. metadata에 `actionId` 주입 또는 docs에 echo path가 requestId 전용임을 명시. [src/index.js:138-146, src/hooks/permission-asked.js:78-81]
  - **해소**: `src/index.js`의 promptAsync metadata에 `actionId: request.actionId` 추가. 테스트 `verifyPromptMetadataIncludesActionId` 추가.
- [x] [AI-Review][LOW] `createPermissionAskedHook(legacyHandlers, { workflowState, audit })`이 `pluginContext`를 사용하지 않지만 `src/index.js:165`는 주입함. 인터페이스 노이즈 → 주입 제거 또는 hook이 사용 의도가 있다면 명시. [src/hooks/permission-asked.js:104, src/index.js:164-168]
  - **해소**: `src/index.js`의 `createPermissionAskedHook` 호출에서 `pluginContext` 주입 제거.
- [x] [AI-Review][LOW] `consumeApprovalOutcome`의 `reasonCode` 파라미터가 `permission-asked` ingress에서 주입되지 않아 dead path. 사용 시점이 명확해질 때까지 시그니처에서 제거하거나, `deny`/`ignore` 시 표준 reasonCode를 함께 주입하도록 ingress 확장. [src/services/approval/consume-approval-outcome.js:75, src/hooks/permission-asked.js:117-122]
  - **해소**: `permission-asked.js`의 ingress가 `deny → "approval-denied"`, `ignore-and-continue → "approval-ignored"`, `accept → null`로 표준 reasonCode를 `consumeApprovalOutcome`에 주입. resolution snapshot이 `reasonCode`를 보유. 테스트 `verifyPermissionAskedHookInjectsReasonCode` 추가.
- [x] [AI-Review][LOW] `permission-asked`가 active approval에 매치되었으나 `parseApprovalOutcome`이 null을 돌려주면 audit 없이 silent skip. unknown outcome 가시성 확보용으로 `approval.resolution.failed`(또는 동등 이벤트)를 발행. [src/hooks/permission-asked.js:115-129]
  - **해소**: active match 후 outcome이 null이면 `approval.resolution.failed`(reason="unknown-outcome")를 best-effort로 발행. 테스트 `verifyPermissionAskedHookEmitsResolutionFailedOnUnknownOutcome` 추가.
- [x] [AI-Review][LOW] `workflow-state.js` 헤더 코멘트 "Approval status values: awaitingApproval ... resolved by Story 2.3+"가 실제 동작과 미세 불일치. 실제 resolve 후 `approvalCurrent`는 `null`이며 별도 status 전이 필드가 없다. 코멘트를 정확히 갱신. [src/services/workflow/workflow-state.js:33-34]
  - **해소**: 헤더 코멘트를 실제 동작(`approvalCurrent === null` + `approvalHistory` 마지막 항목의 terminal outcome)을 반영하도록 갱신.

## Dev Notes

### Story Intent

Story 2.3은 Story 2.1이 발행한 approval request와 Story 2.2가 구성한 설명 프롬프트를 실제 사용자 선택 결과로 닫아 주는 resolution 계층이다. 핵심은 `accept`, `deny`, `ignore-and-continue`를 session/action 문맥에 묶어 추적 가능하게 기록하고, `deny`와 `ignore-and-continue`에서는 repository mutation 없이 workflow를 계속 가게 만드는 것이다. 이 스토리는 Git 실행 자체를 다루지 않는다. 즉, `accept`는 executor로 넘어갈 자격을 부여할 뿐이며 실제 실행 성공/실패 분류와 복구는 Story 2.4/2.5가 책임진다.

### Verified Baseline Findings

- 현재 `src/hooks/command-execute-before.js`는 workflow 감지 후 `readiness`, `initProposal`, `branchProposal`을 `workflowState`에 적재하고 `git.action.planned`, `git.readiness.checked`, `workflow.detected` audit를 발행한다.
- 현재 `src/services/workflow/workflow-state.js`는 in-memory `Map` 기반 session store이며 `set/get/clear/advancePhase`만 제공한다. approval queue/history/active state는 아직 없다.
- 현재 `src/hooks/session.js`는 `session.deleted`에서 `workflowState.clear(sessionID)`를 호출한다. 따라서 approval state lifecycle도 이 cleanup 경로에 붙이는 것이 자연스럽다.
- `src/hooks/tool-execute-before.js`와 `src/hooks/tool-execute-after.js`는 매우 얇은 thin hook 구조를 유지하고 있다. 2.3에서도 복잡한 승인 판정은 hook 내부가 아니라 service로 밀어 넣는 편이 architecture boundary와 일치한다.
- `src/hooks/permission-asked.js`는 현재 legacy delegate만 수행한다. Epic 2 approval resolution의 가장 현실적인 진입점은 이 hook을 확장해 런타임 approval 결과를 해석하는 방식이다.
- `src/audit/logger.js`는 client/file/http 모두 best-effort 기록 구조이며 logging failure가 workflow를 차단하지 않는다. approval resolve 기록도 같은 규칙을 따라야 한다.
- 아키텍처 문서는 승인 대기 상태를 별도 `awaitingApproval` 상태로 명시하고, 필수 구조화 이벤트로 `approval.requested`, `approval.resolved`, `git.action.planned`, `git.action.executed`, `git.action.skipped`를 요구한다.

### Technical Requirements

- approval resolution은 session-scoped, in-memory state를 기준으로 동작한다. 전역 mutable singleton이나 별도 파일 영속 저장소를 추가하지 않는다.
- outcome state model은 반드시 `pending`, `accept`, `deny`, `ignore-and-continue` 네 가지를 사용한다. `approved`, `rejected`, `skip` 등 임의 동의어를 새로 만들지 않는다.
- 각 approval request는 `approvalId`와 `actionId`를 가져야 하며, audit/event/history는 둘 모두를 포함해 request와 proposal을 역추적 가능하게 유지한다.
- `deny`와 `ignore-and-continue`에서는 어떤 형태의 git executor도 호출되지 않아야 한다. `child_process`, `gitRunner`, working tree mutation 경로 진입은 모두 금지다.
- action gating은 service가 결정하고 hook은 결과만 위임한다. hook에서 `if (approve) git ...` 형태의 직접 분기를 만들면 architecture anti-pattern이다.
- approval resolve는 idempotent해야 한다. 이미 terminal state인 approval에 동일 결과가 다시 들어오면 중복 mutation 없이 no-op 또는 controlled rejection으로 끝나야 한다.
- unresolved approval이 있을 때 후속 action proposal은 queue에 적재될 수 있지만 자동 실행되거나 자동 승인 요청되면 안 된다.
- `ignore-and-continue`는 “실패”가 아니라 “선택된 skip”으로 분류한다. 따라서 Story 2.4 failure taxonomy와 섞지 않는다.

### Outcome State Model

승인 상태 모델은 다음 단일 state machine으로 고정한다.

```text
planned -> pending -> accept
                  -> deny
                  -> ignore-and-continue
```

- `planned`: proposal이 존재하지만 아직 approval request가 활성화되지 않은 내부 준비 상태. queue item에서만 보인다.
- `pending`: 현재 사용자 선택 대기 중인 활성 approval.
- `accept`: terminal. executor hand-off 가능.
- `deny`: terminal. mutation 금지, workflow continuation 허용.
- `ignore-and-continue`: terminal. mutation 금지, workflow continuation 허용.

권장 결과 객체:

```js
{
  approvalId: "apr_...",
  actionId: "act_...",
  sessionID: "session-123",
  actionKind: "branch" | "init" | "commit" | "push" | "finalize",
  status: "accept" | "deny" | "ignore-and-continue",
  previousStatus: "pending",
  continuation: "execute-now" | "continue-without-action",
  resolvedAt: "2026-05-08T12:34:56.000Z",
  sourceHook: "permission.asked",
  metadata: {
    phase: "start" | "in-progress" | "finish"
  }
}
```

### Single-Active-Action / Queue Rule

- 세션당 동시에 하나의 `activeApproval`만 허용한다.
- 후속 action은 `pendingActions[]`에 FIFO로 적재한다.
- queue item은 proposal 종류와 무관한 공통 포맷을 사용한다.

```js
{
  actionId: "act_...",
  approvalId: null,
  kind: "branch" | "init" | "commit" | "push" | "finalize",
  action: "create" | "switch" | "git-init" | "commit" | "push",
  proposal: { ... },
  requiresApproval: true,
  phase: "start",
  createdAt: "2026-05-08T12:34:56.000Z"
}
```

- `branchProposal`과 `initProposal`를 그대로 병렬 활성화하지 말고, 공통 action queue로 정규화해 순차 처리하는 방향이 안전하다.
- Story 2.3 시점에서는 dependency graph까지 도입하지 않는다. 선행 action이 거부되어도 workflow 자체는 계속하되, 후속 proposal 생성 단계가 현재 state를 읽어 불필요한 action을 생략하면 된다.

### State Storage and Lifecycle

- 1차 저장소: `src/services/workflow/workflow-state.js`의 session 메모리 store.
- 권장 state shape:

```js
{
  sessionID,
  commandName,
  phase,
  readiness,
  branchProposal,
  initProposal,
  activeApproval: {
    approvalId,
    actionId,
    status: "pending",
    request,
    requestedAt,
    sourceEvent: "approval.requested"
  } | null,
  pendingActions: [],
  approvalHistory: [],
  lastContinuationDecision: null
}
```

- `approvalHistory`는 append-only로 유지한다. activeApproval을 resolve할 때 history에 복사하고 active slot은 비운다.
- plugin 프로세스 종료 후 복원은 지원하지 않는다. Story 2.3은 세션 메모리 스코프만 책임진다.
- `session.deleted`에서 현재 이미 호출 중인 `workflowState.clear(sessionID)`가 approval state까지 포함해 삭제하도록 유지한다. 별도 cleanup 파일 저장은 도입하지 않는다.

### Hook / Event Consumption Design

- `command.execute.before`
  - 역할: proposal planning, queue seed, 첫 approval request 준비.
  - 비역할: 사용자의 outcome 소비, resolve 처리, executor 호출.
- `permission.asked`
  - 역할: approval UI 결과를 받아 `accept|deny|ignore-and-continue`로 해석하는 primary ingress.
  - 여기서 `activeApproval` 조회, terminal 전이, history append, continuation marker 저장을 수행한다.
- `tool.execute.before`
  - 역할: unresolved approval이 있을 때 mutation-capable tool flow가 진행되어도 되는지 gating 판단을 위임받아 확인.
  - 비역할: 자체적으로 approval prompt 생성/해결.
- `tool.execute.after`
  - 역할: accept 이후 executor가 hand-off를 완료했다면 queue advancement를 보조할 수 있으나, Story 2.3에서는 execution success를 확정하지 않는다.
- `event(session.deleted)`
  - 역할: state cleanup only.

### Audit / Event Contracts

#### `approval.requested`

```js
{
  event: "approval.requested",
  timestamp: "<ISO-8601>",
  workflow: "<commandName>",
  command: "<commandName>",
  sessionID: "<sessionID>",
  approvalId: "<approvalId>",
  actionId: "<actionId>",
  details: {
    actionKind: "branch" | "init" | "commit" | "push" | "finalize",
    actionName: "create" | "switch" | "git-init" | "commit" | "push",
    proposalKind: "branch" | "init" | "finalize",
    proposalReason: "<reason code or short text>",
    requiresApproval: true,
    phase: "start" | "in-progress" | "finish"
  }
}
```

#### `approval.resolved`

```js
{
  event: "approval.resolved",
  timestamp: "<ISO-8601>",
  workflow: "<commandName>",
  command: "<commandName>",
  sessionID: "<sessionID>",
  approvalId: "<approvalId>",
  actionId: "<actionId>",
  outcome: "accept" | "deny" | "ignore-and-continue",
  details: {
    actionKind: "branch" | "init" | "commit" | "push" | "finalize",
    continuation: "execute-now" | "continue-without-action",
    phase: "start" | "in-progress" | "finish",
    sourceHook: "permission.asked",
    hadActiveApproval: true
  }
}
```

#### `git.action.skipped`

```js
{
  event: "git.action.skipped",
  timestamp: "<ISO-8601>",
  workflow: "<commandName>",
  command: "<commandName>",
  sessionID: "<sessionID>",
  actionId: "<actionId>",
  outcome: "deny" | "ignore-and-continue",
  details: {
    actionKind: "branch" | "init" | "commit" | "push" | "finalize",
    reason: "approval-denied" | "approval-ignored",
    continuation: "continue-without-action"
  }
}
```

- `approval.requested`와 `approval.resolved`는 필수 구조화 이벤트다.
- `git.action.skipped`는 deny/ignore 선택의 후속 상태를 machine-readable하게 남기기 위해 필요하다.
- logging failure는 best-effort이며 workflow를 차단하지 않는다.

### Continuation Semantics After Deny / Ignore

- `deny`
  - 해당 proposal은 폐기된다.
  - state에는 `approvalHistory`와 `lastContinuationDecision`만 남고 executor queue에서는 제거된다.
  - BMAD workflow는 계속된다.
  - 동일 action을 다시 제안하려면 후속 planning 단계가 새 `actionId`로 별도 proposal을 만들어야 한다.
- `ignore-and-continue`
  - 의미적으로는 “이번 액션은 실행하지 않음”이다.
  - state와 audit에는 skipped로 남긴다.
  - workflow는 계속되며, 후속 단계는 “Git automation 없이 계속 진행 중”이라는 문맥을 읽을 수 있어야 한다.
- 공통 규칙
  - 둘 다 repository mutation 금지.
  - 둘 다 workflow abandon 강제 금지.
  - 둘 다 hard failure 아님.
  - 둘 다 Story 2.4 failure handling으로 에스컬레이션하지 않음.

### Architecture Compliance

- 훅은 thin entrypoint만 담당하고 승인 해석 로직은 `src/services/approval/`로 분리한다.
- 상태는 명시적 컨텍스트 객체로 전달하고 전역 mutable state를 만들지 않는다.
- 이벤트명은 `dot.case`, 내부 키는 `camelCase`를 유지한다.
- approval-sensitive flow는 direct util call이 아니라 command/event 중심으로 구조화해야 한다.
- `services/approval`은 “판정과 승인 요청/결과 생성”, `services/git`은 “실제 실행”이라는 경계를 유지한다.
- `accept` outcome이 나오더라도 Story 2.3 안에서 `services/git` 실행으로 넘어가 성공/실패를 해석하지 않는다.

### Library / Framework Requirements

- 새 npm dependency 추가 금지. Node 22 표준 기능과 기존 프로젝트 구조만 사용한다.
- 식별자 생성은 경량 헬퍼로 충분하다. 별도 UUID 라이브러리 도입이 필요 없다면 피한다.
- 감사 기록은 기존 `src/audit/logger.js`를 재사용한다.
- queue/state 로직은 plain object + array + Map 기반으로 구현한다.

### File Structure Requirements

- 권장 신규 파일:
  - `src/services/approval/approval-resolution-state.js`
  - `src/services/approval/build-approval-resolution.js`
  - `src/services/approval/consume-approval-outcome.js`
- 권장 수정 파일:
  - `src/hooks/permission-asked.js`
  - `src/hooks/command-execute-before.js`
  - `src/hooks/tool-execute-before.js`
  - `src/services/workflow/workflow-state.js`
  - 필요 시 `src/audit/` 또는 `src/events/`의 event constant/helper
- 수정 금지 또는 경계 유지:
  - `src/policies/legacy/devai-git-workflo.js`의 legacy behavior contract
  - 실제 git execution failure taxonomy를 포함하는 새 executor logic
  - 장기 영속 저장소, DB, 파일 기반 approval ledger

### Testing Requirements

- 필수 검증 명령:
  - `npm run build`
  - `npm test`
- 회귀 테스트 핵심 포인트:
  - `accept`는 실행 허가만 남기고 state를 정확히 전환하는지.
  - `deny`는 mutation 없이 `approval.resolved(outcome=deny)`와 `git.action.skipped(reason=approval-denied)`를 남기는지.
  - `ignore-and-continue`는 mutation 없이 continuation marker를 남기는지.
  - active approval이 있는 동안 후속 proposal이 queue로만 들어가는지.
  - terminal approval에 대한 중복 resolve가 idempotent한지.
  - `session.deleted` cleanup이 approval state 전체를 제거하는지.
- 권장 추가 테스트:
  - `tests/contracts/audit-events.contract.test.js`에 `approval.requested` / `approval.resolved` / `git.action.skipped` payload shape 검증.
  - `tests/integration/hooks.integration.test.js`에 `command.execute.before -> permission.asked -> state cleanup/continuation` 흐름 검증.

### Previous Story Intelligence

- Story 1.4는 `branchProposal`을 계산하고 state에 적재하지만 승인 요청이나 resolve를 수행하지 않는다. 2.3은 이 proposal이 더 이상 단순 stash가 아니라 approval queue item으로 승격되는 경로를 설계해야 한다.
- Story 1.5는 non-git repository에서 `initProposal`을 생성하고 branch planning보다 우선시한다. 2.3은 `initProposal`도 branch와 동일한 approval outcome state machine으로 처리하되, deny/ignore 시 repository mutation 없이 continuation을 허용해야 한다.
- Story 2.1/2.2는 approval request와 설명문 생성이 목표다. 2.3은 그 request를 consume하는 쪽이며, prompt body 생성 규칙을 다시 정의하지 않는다.
- 현재 코드의 `session.deleted` cleanup, best-effort audit, thin hook 원칙은 그대로 유지해야 한다.

### Story 2.4 / 2.5 Boundary

- Story 2.3이 다루는 것
  - approval pending/resolve state
  - accept/deny/ignore-and-continue 기록
  - queue advancement
  - no-mutation continuation semantics
  - structured audit trail
- Story 2.4가 다루는 것
  - 실제 git 실행 실패 탐지
  - non-zero exit, conflict, rejection, repo mismatch 분류
  - failure cause 설명
- Story 2.5가 다루는 것
  - retry, manual recovery, skip-after-failure 선택지
  - failure 이후 continuation UX/flow

### References

- Epic 2 and Story 2.3 requirements: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3: Support Accept, Deny, and Ignore-and-Continue Outcomes]
- Epic 2 surrounding context: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1: Present Approval Requests for Planned Git Actions], [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2: Explain Intent and Expected Impact in Approval Prompts], [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4: Detect and Report Git Conflicts and Execution Failures], [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5: Offer Recovery Paths Without Failing the Workflow]
- Approval-driven execution FRs: [Source: _bmad-output/planning-artifacts/prd.md#Approval-Driven Execution]
- Failure isolation and traceability FRs: [Source: _bmad-output/planning-artifacts/prd.md#Failure Handling & Recovery], [Source: _bmad-output/planning-artifacts/prd.md#Traceability & Review Support]
- Architecture approval/event rules: [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security], [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns], [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- Architecture folder boundaries: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- Current planning/state baseline: [Source: src/hooks/command-execute-before.js], [Source: src/hooks/permission-asked.js], [Source: src/hooks/tool-execute-before.js], [Source: src/hooks/tool-execute-after.js], [Source: src/hooks/session.js], [Source: src/services/workflow/workflow-state.js], [Source: src/audit/logger.js]
- Story 1.4 baseline: [Source: _bmad-output/implementation-artifacts/1-4-compute-branch-strategy-and-candidate-branch-names.md]
- Story 1.5 baseline: [Source: _bmad-output/implementation-artifacts/1-5-check-repository-readiness-and-propose-initialization.md]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Completion Notes List

- Story 2.3 구현용 컨텍스트 문서를 작성했다.
- approval outcome state model, single-active-action queue 규칙, session lifecycle, hook consumption 경로, audit contracts, deny/ignore continuation semantics, Story 2.4/2.5 경계를 구체화했다.
- 현재 코드베이스의 workflow state, readiness/init proposal, branch proposal, thin hook, audit logger 기준선 위에서 구현 방향을 제안했다.
- 2026-05-09: 구현 완료. `services/approval`에 outcome state machine(`approval-resolution-state.js`), payload builder(`build-approval-resolution.js`), 단일 resolver(`consume-approval-outcome.js`)를 추가하고, `permission-asked` hook을 approval ingress로 확장하여 `approval.resolved` / `git.action.skipped` 이벤트를 발행하도록 구성했다.
- `build-approval-request.js`에 `actionId`(action fingerprint 기반)와 `buildActionId` helper를 추가했고, `command-execute-before.js`는 `approval.requested` audit details에 `actionId`를 포함하며 active approval이 pending인 동안 들어온 후속 plannedAction을 `pendingActions[]` FIFO 큐에 적재한다.
- `workflow-state.js`의 `get`이 `pendingActions`/`lastContinuationDecision`도 `structuredClone`으로 deep clone하여 외부 mutation으로부터 store를 보호한다.
- regression 테스트에 11개 시나리오를 추가했다: state machine 계약, payload builder 계약, actionId 계약, audit `actionId` 노출, accept/deny/ignore-and-continue resolver, idempotent resolve, queue advancement, permission-asked end-to-end ingress, session.deleted cleanup. `npm run build && npm test`가 모두 green이다.
- 2026-05-09 (post code-review): 9건 finding(3 MED / 6 LOW) 전부 해소.
  - **MED-1 (queue advancement dead code)**: 옵션 ② 채택. `consume-approval-outcome.js`의 큐 head 제거 분기 삭제, `selectNextPlannedAction`이 `pendingActions[0].proposal`을 priority 0로 반환, `command-execute-before.js`의 promote 분기에서 큐 head shift. 큐 advancement는 단일 위치(promotion)에서만 발생.
  - **MED-2 (audit details shape)**: `approval.requested` audit details에 명세 키(`actionKind / actionName / proposalKind / proposalReason / requiresApproval / phase`) 추가. 기존 traceability 키(`requestId / actionId / actionType / sessionID / explanationFallback`)는 superset로 유지.
  - **MED-3 (File List 누락)**: `architecture.md`/`sprint-status.yaml` 변경을 File List에 반영.
  - **LOW-1**: `architecture.md`의 구조화 필수 이벤트 목록에 `approval.resolution.failed` 등재.
  - **LOW-2**: `src/index.js`의 promptAsync metadata에 `actionId` 주입 → permission-asked의 actionId echo 경로 활성화.
  - **LOW-3**: `createPermissionAskedHook`에서 `pluginContext` 주입 제거.
  - **LOW-4**: `permission-asked.js` ingress가 `deny → "approval-denied"`, `ignore-and-continue → "approval-ignored"`, `accept → null`로 표준 `reasonCode`를 resolver에 주입.
  - **LOW-5**: active match 후 unknown outcome일 때 `approval.resolution.failed(reason="unknown-outcome")` 발행 (best-effort).
  - **LOW-6**: `workflow-state.js` 헤더 코멘트를 실제 동작(approvalCurrent=null + approvalHistory tail의 terminal outcome)에 맞게 갱신.
  - 회귀 테스트에 4건 추가 + 1건 분할 (총 14종): `verifyConsumeApprovalOutcomeQueueAdvancement`를 `verifyConsumeApprovalOutcomeLeavesQueueIntact` + `verifyCommandExecuteBeforePromotesQueueHead`로 대체, `verifyApprovalRequestedAuditDetailsShape`, `verifyPromptMetadataIncludesActionId`, `verifyPermissionAskedHookEmitsResolutionFailedOnUnknownOutcome`, `verifyPermissionAskedHookInjectsReasonCode` 추가. `npm run build && npm test` 모두 green.

### File List

- `_bmad-output/implementation-artifacts/2-3-support-accept-deny-and-ignore-and-continue-outcomes.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — Story 2.3 status 전이: backlog → in-progress → review → in-progress → review)
- `_bmad-output/planning-artifacts/architecture.md` (modified — 구조화 필수 이벤트 목록에 `approval.prompt.delivery.failed` / `git.readiness.checked` / `approval.resolution.failed` 추가)
- `src/services/approval/approval-resolution-state.js` (new)
- `src/services/approval/build-approval-resolution.js` (new)
- `src/services/approval/consume-approval-outcome.js` (new — post-review: 큐 head 제거 분기 삭제)
- `src/services/approval/build-approval-request.js` (modified — `actionId`/`buildActionId`)
- `src/services/approval/approval-policy-service.js` (modified — `selectNextPlannedAction`이 `pendingActions[0].proposal` priority 0로 반환)
- `src/services/workflow/workflow-state.js` (modified — `pendingActions`/`lastContinuationDecision` 보호; post-review: 헤더 코멘트 갱신)
- `src/hooks/command-execute-before.js` (modified — `actionId` audit, queue 적재; post-review: details shape 명세 정렬, queue head promotion shift)
- `src/hooks/permission-asked.js` (modified — approval ingress; post-review: 표준 `reasonCode` 주입, unknown outcome `approval.resolution.failed` 발행)
- `src/index.js` (modified — `permission.asked` hook에 `workflowState`/`audit` 주입; post-review: `pluginContext` 주입 제거, prompt metadata에 `actionId` 추가)
- `tests/regression.test.js` (modified — Story 2.3 시나리오 15종: state machine 계약, payload builder 계약, actionId 계약, audit `actionId` 노출, accept/deny/ignore-and-continue resolver, idempotent resolve, resolver leaves queue intact, command-execute-before promotes queue head, permission-asked end-to-end ingress, session.deleted cleanup, audit details shape, prompt metadata actionId, unknown outcome `approval.resolution.failed`, ingress `reasonCode` 주입, generic `action` field ignored)

### Change Log

- 2026-05-08: Story 2.3 구현 컨텍스트 문서 초안 작성.
- 2026-05-09: Story 2.3 구현 완료 (status: ready-for-dev → review). approval outcome state machine, resolver, audit payload builder, permission-asked 확장, regression 시나리오 추가.
- 2026-05-09: code-review 수행 (status: review → in-progress). 0 HIGH / 3 MEDIUM / 6 LOW finding을 "Review Follow-ups (AI)"에 누적 (코드 미수정).
- 2026-05-09: Addressed code review findings — 9 items resolved (3 MEDIUM / 6 LOW). queue advancement 흐름 단일화(옵션 ②), `approval.requested` audit details 명세 정렬, prompt metadata에 actionId 주입, `approval.resolution.failed` 등재 + unknown outcome 가시성, `reasonCode` 표준 주입, `pluginContext` 노이즈 제거, `workflow-state.js` 헤더 코멘트 정합. 회귀 테스트 14종으로 확장. status: in-progress → review.
- 2026-05-09: Second code-review pass (옵션 1 auto-fix). 0 HIGH / 0 MEDIUM / 2 LOW 즉시 수정. (1) `parseApprovalOutcome`에서 generic `input.action` fallback 제거 → unrelated permission event의 tool name이 alias 테이블과 충돌하지 않음. (2) `tool.execute.before` / `tool.execute.after` factory의 unused `pluginContext` 주입 제거. 회귀 테스트 1종 추가(15종). `npm run build && npm test` 그린.

변경 파일 경로: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\2-3-support-accept-deny-and-ignore-and-continue-outcomes.md`
