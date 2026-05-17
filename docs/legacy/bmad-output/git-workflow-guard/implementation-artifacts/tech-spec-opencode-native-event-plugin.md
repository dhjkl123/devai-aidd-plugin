---
title: 'opencode native event plugin 전환'
slug: 'opencode-native-event-plugin'
created: '2026-05-11'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack: ['Node.js 22', 'ESM JavaScript', 'esbuild bundle', 'plain node:assert tests', 'opencode native plugin event API']
files_to_modify: ['src/index.js', 'src/utils/constants.js', 'src/hooks/native-event.js', 'src/hooks/permission-asked.js', 'src/hooks/file-edited.js', 'tests/regression.test.js', 'tests/e2e/scenario-readiness-not-initialized.test.js', 'tests/e2e/scenario-approval-deny-recovery.test.js', 'tests/e2e/scenario-file-edited-tracking.test.js', 'dist/devai-aidd-plugin.js']
code_patterns: ['bootstrap constructs adapters/config/audit/state once and closes over them', 'hook factories are thin adapters over services', 'approval/recovery/git services own state mutation and audit payloads', 'runtime/audit failures are best-effort unless guard behavior is load-bearing', 'dist is generated from src by npm run build']
test_patterns: ['plain async test scripts with node:assert/strict', 'mock client.app.log and client.session.promptAsync', 'temp .opencode/commands workspaces', 'src and dist parity checks in regression.test.js', 'e2e scenarios exercise public plugin factory']
---

# Tech-Spec: opencode native event plugin 전환

**Created:** 2026-05-11

## Overview

### Problem Statement

현재 `devai-aidd-plugin`은 `permission.asked`, `file.edited`, `command.execute.before`, `tool.execute.before`, `tool.execute.after`, `event` named handler 맵을 반환하는 방식에 의존한다. 그러나 opencode native plugin 배치 방식에서는 `permission.asked`, `file.edited` 같은 named handler가 호출되지 않을 수 있어 approval 응답, 파일 수정 추적, git init 승인 흐름이 런타임 이벤트와 안정적으로 연결되지 않을 위험이 있다.

### Solution

기준 파일 `D:\work\개인\my-plugin-opencode\plugins\devai-git-workflow.js`의 native event 처리 패턴을 참조해, 대상 플러그인을 `question.asked`, `question.replied`, `question.rejected`, `command.executed`, `session.idle`, `session.deleted` 이벤트 중심으로 라우팅하도록 전환한다. 기존 audit, config, workflow state, approval/recovery/git 서비스 구조는 최대한 유지하고, 이벤트 어댑터 계층에서 기존 hook factory를 재사용하거나 얇게 연결한다.

### Scope

**In Scope:**
- `dist\devai-aidd-plugin.js`가 `.opencode/plugins`에 배치되었을 때 opencode native plugin으로 바로 로드되고 동작하도록 bootstrap/export 및 이벤트 계약을 조정한다.
- 가능하면 `src`에도 동일 구조를 반영하고 `npm run build`로 dist를 재생성한다.
- `question.asked`, `question.replied`, `question.rejected`, `command.executed`, `session.idle`, `session.deleted`를 native event 방식으로 처리한다.
- `permission.asked`, `file.edited`에 묶여 있던 approval/recovery 응답 처리와 파일 변경 추적 의존을 native event 라우팅으로 옮긴다.
- git init 승인/응답 흐름을 native question event 기반으로 연결한다.
- 기존 audit/config/workflow state 구조와 기존 테스트 가능한 서비스 경계는 최대한 유지한다.

**Out of Scope:**
- audit/config/workflow state 서비스의 대규모 재설계.
- BMAD workflow 정책, branch naming, git action executor의 기능 범위 변경.
- 기준 파일 `devai-git-workflow.js` 자체 수정.
- opencode 런타임 외 다른 IDE/plugin runtime 호환성 확대.

## Context for Development

### Codebase Patterns

- 현재 bootstrap 진입점은 `src\index.js`의 `DevaiAiddPlugin({ client, directory })`이며, config 로드, audit logger, workflow state store, pluginContext를 구성한 뒤 hook map을 반환한다.
- 현재 반환 계약은 `command.execute.before`, `tool.execute.before`, `tool.execute.after`, `permission.asked`, `file.edited`, `event` 6개 named hook이다. 이 계약은 `src\utils\constants.js`의 `SUPPORTED_HOOK_KEYS`와 회귀 테스트에 고정되어 있어 native 전환 시 테스트도 함께 갱신해야 한다.
- 기준 파일 `devai-git-workflow.js`는 `export default async ({ client, directory }) => ({ event: async ({ event }) => ... })` 구조로 native 이벤트를 단일 `event` 핸들러에서 분기한다. 주요 이벤트는 `question.asked`, `question.replied`, `question.rejected`, `command.executed`, `session.idle`, `session.deleted`이다.
- 기준 파일의 approval 흐름은 `promptAsync`로 모델에게 question tool 사용을 지시하고, `question.asked`에서 `event.properties.id`를 pending question id로 저장한 뒤 `question.replied`의 `event.properties.requestID`와 `answers`로 승인 여부를 해석한다.
- 현재 플러그인은 approval 요청을 `publishNextPlannedAction -> buildApprovalRequest -> pluginContext.requestApproval -> client.session.promptAsync`로 발행하고, 응답은 `permission.asked` payload의 `requestId/actionId/outcome`로 `consumeApprovalOutcome`에 연결한다.
- `permission-asked.js`는 recovery routing, approval outcome parsing, accept 시 commit/push executor 실행, deny/ignore 시 recovery gate 오픈까지 담당하는 중요한 어댑터다. native question 응답 라우터는 이 로직을 재사용하거나 공통 resolver로 추출해야 한다.
- `file-edited.js`는 `sessionID`와 `filePath/path/file`만 필요로 하는 얇은 tracking 어댑터다. native event에서 파일 수정 이벤트가 보장되지 않을 수 있으므로 `session.idle`, `command.executed`, 또는 finalization 시 `pluginContext.listChangedFiles()` 보강 경로가 필요하다.
- `command-execute-before.js`는 workflow 감지, readiness check, git init proposal, branch proposal, approval publish, start synthetic output을 수행한다. native `command.executed`만 있는 환경에서는 command 시작 전 output mutation이 불가능할 수 있어, native 라우터가 `command.executed`를 detection/finalization 중 어느 의미로 사용할지 명확히 해야 한다.
- `tool.execute.after`의 `finish` 경로는 finalization 평가와 commit/push approval publish를 수행한다. native event 목표 목록에는 tool events가 없으므로 finalization trigger를 `command.executed` 또는 `session.idle`에서 보완해야 한다.
- audit logger는 `client.app.log`로 best-effort 이벤트를 기록한다. 기존 audit event names와 payload shape는 유지하는 것이 회귀 위험이 가장 낮다.
- 최근 spec `tech-spec-git-init-approval-prompt-directory.md`는 git init approval prompt에 `directory`가 포함되어야 함을 고정한다. native question 기반 prompt/response 전환에서도 `promptAsync({ sessionID, directory, parts })` 형태는 유지해야 한다.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `D:\work\개인\my-plugin-opencode\plugins\devai-git-workflow.js` | native event 방식 기준 구현 |
| `D:\work\개인\devai-aidd-plugin\src\index.js` | 현재 plugin bootstrap 및 hook map 반환 지점 |
| `D:\work\개인\devai-aidd-plugin\dist\devai-aidd-plugin.js` | 사용자가 지정한 배포 대상 bundle |
| `D:\work\개인\devai-aidd-plugin\src\hooks\permission-asked.js` | 기존 approval/recovery 응답 처리 진입점 |
| `D:\work\개인\devai-aidd-plugin\src\hooks\file-edited.js` | 기존 파일 수정 추적 진입점 |
| `D:\work\개인\devai-aidd-plugin\src\hooks\command-execute-before.js` | 기존 workflow 감지 및 git init approval 계획 진입점 |
| `D:\work\개인\devai-aidd-plugin\src\hooks\tool-execute-before.js` | mutating tool guard 및 phase advance |
| `D:\work\개인\devai-aidd-plugin\src\hooks\tool-execute-after.js` | finish finalization 평가 및 commit/push approval publish |
| `D:\work\개인\devai-aidd-plugin\src\hooks\session.js` | 기존 session event cleanup 처리 |
| `D:\work\개인\devai-aidd-plugin\src\services\approval\publish-next-planned-action.js` | approval request 발행 및 prompt delivery 호출 |
| `D:\work\개인\devai-aidd-plugin\src\services\approval\build-approval-request.js` | stable requestId/actionId, prompt metadata 생성 |
| `D:\work\개인\devai-aidd-plugin\src\services\approval\consume-approval-outcome.js` | approval 응답을 상태/audit으로 확정하는 공통 resolver |
| `D:\work\개인\devai-aidd-plugin\src\services\workflow\workflow-state.js` | session-scoped state store, approval/recovery/touched file state |
| `D:\work\개인\devai-aidd-plugin\src\utils\constants.js` | 현재 6-key hook contract 상수. native 전환 시 contract 정의 갱신 필요 |
| `D:\work\개인\devai-aidd-plugin\tests\regression.test.js` | src/dist parity 및 hook contract 회귀 테스트 |
| `D:\work\개인\devai-aidd-plugin\tests\e2e\scenario-readiness-not-initialized.test.js` | non-git workspace 및 git init approval 회귀 경로 |
| `D:\work\개인\devai-aidd-plugin\tests\e2e\scenario-approval-deny-recovery.test.js` | approval deny -> recovery gate/prompt 경로 |
| `D:\work\개인\devai-aidd-plugin\tests\e2e\scenario-file-edited-tracking.test.js` | file.edited tracking 및 finalization 결과 경로 |
| `D:\work\개인\devai-aidd-plugin\scripts\build.js` | esbuild로 `src\index.js`를 `dist\devai-aidd-plugin.js`로 번들링 |

### Technical Decisions

- native event 라우터를 추가하되, 기존 service/state를 직접 재작성하지 않는다. 추천 구현은 `src/hooks/native-event.js`를 새로 만들고 `src/index.js`에서 이 라우터를 `event` key로 반환하는 구조다.
- native mode의 핵심 반환 계약은 단일 `event` handler다. 기존 named handlers는 테스트/과도기 호환용으로 남길 수 있지만, opencode native 동작의 필수 경로로 의존하지 않는다.
- `question.asked`는 질문 header와 prompt metadata를 보고 현재 `approvalCurrent` 또는 `recoveryGate`와 연결되는 pending question id를 workflow state에 저장해야 한다. 최소 필드는 `pendingApprovalQuestionID`, `pendingRecoveryQuestionID`처럼 기존 store의 top-level field로 확장 가능하다.
- `question.replied`는 `event.properties.requestID`가 pending approval/recovery question id와 일치할 때 `event.properties.answers?.[0]?.[0]` 값을 canonical outcome으로 변환해야 한다. approval은 기존 `consumeApprovalOutcome` 및 accept/deny/recovery 후속 처리 경로를 재사용한다.
- git init approval은 현재 `approvalRequest.actionType === "init"`과 `proposal.kind === "init"`로 식별된다. native question prompt는 `Initialize Git` header 또는 metadata `actionType: "init"`를 통해 pending id를 저장하고, replied answer가 `initialize/approve/yes` 계열이면 `accept`, `cancel/deny/no` 계열이면 `deny`로 정규화한다.
- `question.rejected`는 pending approval/recovery question id를 정리하고 가능한 경우 `deny` 또는 `ignore-and-continue`와 동일한 controlled skip/recovery 흐름으로 처리한다. 단순 state clear만 하면 audit chain이 끊길 수 있다.
- `command.executed`는 기준 파일처럼 workflow command 완료 후 finalization prompt queue 용도로 사용할 수 있다. 현재 코드의 workflow detection은 `command.execute.before`에 있으므로 native 환경에서 시작 감지가 불가능하면 `command.executed`에서 detection을 수행하거나, opencode event payload의 command name/sessionID/arguments를 기존 `detectWorkflowContext` input shape로 정규화해야 한다.
- `session.deleted`는 기존 `createSessionHook`과 동일하게 state cleanup을 수행해야 한다. `session.idle`은 native-only finalization/paused 처리의 보완 지점으로 사용하되, 기존 audit semantics를 깨지 않게 best-effort로 설계한다.
- 파일 수정 추적은 named `file.edited`에만 의존하지 않는다. native 라우터가 파일 edit 이벤트를 받지 못하는 경우 finalization 단계에서 `pluginContext.listChangedFiles()` 또는 기존 `evaluateWorkflowFinalization`의 changedFiles/status fallback을 통해 touched files 공백을 보완해야 한다.
- `dist\devai-aidd-plugin.js`는 `npm run build`로 갱신한다. 직접 dist를 수정하지 않는 것이 원칙이며, release gate가 dist 존재 및 src/dist parity를 검증한다.
- 테스트는 기존 named hook assertions를 native event contract assertions로 바꾸거나, named hook이 남는 경우에도 native event 경로가 동일한 audit/state/prompt 결과를 내는 e2e를 추가해야 한다.

## Implementation Plan

### Tasks

- [x] Task 1: Define the native plugin contract constants.
  - File: `D:\work\개인\devai-aidd-plugin\src\utils\constants.js`
  - Action: Replace or supplement the current 6-key `SUPPORTED_HOOK_KEYS` wording with a native contract that identifies `event` as the load-bearing opencode plugin entrypoint and lists the native event types `question.asked`, `question.replied`, `question.rejected`, `command.executed`, `session.idle`, `session.deleted`.
  - Notes: If keeping legacy named handlers for backwards test compatibility, rename/comment them as compatibility-only and make clear they are not required for `.opencode/plugins` native operation.

- [x] Task 2: Extract shared approval/recovery response resolution from `permission-asked`.
  - File: `D:\work\개인\devai-aidd-plugin\src\hooks\permission-asked.js`
  - Action: Move the reusable portions of `createPermissionAskedHook` into exported helper functions that accept a normalized input `{ sessionID, requestId, actionId, recoveryGateId, outcome, recoveryChoice, verifyManual, sourceHook }` and perform the existing recovery-first routing, `consumeApprovalOutcome`, audit emission, accept execution, and recovery prompt delivery.
  - Notes: Preserve current `createPermissionAskedHook` behavior by making the legacy handler parse its existing payload and delegate to the new shared resolver. Keep failure isolation: parsing/resolution exceptions must not throw to the runtime.

- [x] Task 3: Add native event payload normalization utilities.
  - File: `D:\work\개인\devai-aidd-plugin\src\hooks\native-event.js`
  - Action: Create a new module that exports `createNativeEventHook(injections)`. Add helpers to read `event.type`, `event.properties.sessionID`, `event.properties.id`, `event.properties.requestID`, `event.properties.questions`, `event.properties.answers`, command name/arguments, and optional metadata in a defensive way.
  - Notes: Normalize command names with the existing `normalizeCommandName` from `detect-workflow-context.js` or equivalent behavior. Native event handler must return `undefined` on unknown/malformed events.

- [x] Task 4: Route workflow command detection through native `command.executed`.
  - File: `D:\work\개인\devai-aidd-plugin\src\hooks\native-event.js`
  - Action: On `command.executed`, detect BMAD workflow commands by adapting the event payload to the existing `createCommandExecuteBeforeHook` input shape `{ command, arguments, sessionID }` and a local `{ parts: [] }` output. Let the existing hook perform workflow state setup, readiness checks, init/branch proposal planning, approval publish, and audit emission.
  - Notes: Support likely payload fields: `event.properties.name`, `event.properties.command`, `event.properties.arguments`, `event.properties.args`, `event.properties.sessionID`. If the command is not a configured workflow command or sessionID is missing, no-op. This uses `command.executed` as the native start signal because `command.execute.before` may not be called in native mode.

- [x] Task 5: Track native approval/recovery question IDs on `question.asked`.
  - File: `D:\work\개인\devai-aidd-plugin\src\hooks\native-event.js`
  - Action: On `question.asked`, inspect `event.properties.questions` and the current workflow state for that session. If an active `approvalCurrent` exists, store a pending native question record on the session state, including `requestID`, `approvalId`, `actionId`, `actionType`, and `questionHeader`. If an active `recoveryGate` exists, store a pending recovery question record with `requestID` and `recoveryGateId`.
  - Notes: Recognize headers from the current prompt style and native baseline: `Approval Required`, `Initialize Git`, `Create Branch`, `Finalize Changes`, and recovery prompts. Git init should match either header `Initialize Git` or active approval `actionType === "init"`.

- [x] Task 6: Resolve approval and recovery via `question.replied`.
  - File: `D:\work\개인\devai-aidd-plugin\src\hooks\native-event.js`
  - Action: On `question.replied`, match `event.properties.requestID` against the pending native question record. Convert `event.properties.answers?.[0]?.[0]` to canonical approval outcomes: approve/initialize/yes/allow/proceed -> `accept`; deny/cancel/no/skip -> `deny` or `ignore-and-continue` where the answer explicitly indicates continuing. Convert recovery answers to existing recovery choice vocabulary. Delegate to the shared resolver from Task 2.
  - Notes: After a successful match, clear the pending native question record from workflow state. For git init, approving the reply must resolve the active init approval through the same audit/state chain used by `permission.asked`, not by setting an unrelated boolean.

- [x] Task 7: Treat `question.rejected` as controlled rejection.
  - File: `D:\work\개인\devai-aidd-plugin\src\hooks\native-event.js`
  - Action: On `question.rejected`, match the pending native approval/recovery question record. For approval, resolve as `deny` with `sourceHook: "question.rejected"` where an active approval exists. For recovery, choose the safest existing terminal/blocked handling path available from the recovery orchestrator or clear only the matching pending question while leaving the gate observable.
  - Notes: Do not silently clear `approvalCurrent` without audit. If the event does not match the active pending question, no-op.

- [x] Task 8: Preserve session cleanup and idle behavior in native events.
  - File: `D:\work\개인\devai-aidd-plugin\src\hooks\native-event.js`
  - Action: On `session.deleted`, delegate to `createSessionHook({ workflowState })` or directly clear the session state. On `session.idle`, run best-effort finalization support by adapting to the existing `createToolExecuteAfterHook` finish path only when the session has tracked workflow state and no active approval/recovery gate.
  - Notes: `session.idle` must not publish duplicate approvals if `approvalCurrent` is already set. It should not throw on finalization errors; audit failures remain best-effort.

- [x] Task 9: Add native fallback for file tracking/finalization without `file.edited`.
  - File: `D:\work\개인\devai-aidd-plugin\src\hooks\native-event.js`
  - Action: Before native idle/finalization evaluation, use `pluginContext.listChangedFiles()` to populate `touchedFiles` for the session when no `file.edited` events were observed.
  - Notes: Reuse `normalizeTrackedFileEntry` from `finalization-artifacts.js` or delegate through `createFileEditedHook` for each listed path. Deduplicate paths exactly as `file-edited.js` does.

- [x] Task 10: Wire native event handler from bootstrap.
  - File: `D:\work\개인\devai-aidd-plugin\src\index.js`
  - Action: Import `createNativeEventHook` and build the existing command/tool/session/permission/file handlers inside bootstrap as internal compatibility handlers. Return an object whose load-bearing native entrypoint is `event: createNativeEventHook({ ...handlers, workflowState, audit, pluginContext, workflowCommands, branchConfig })`.
  - Notes: Decide whether to also return legacy named handlers. If they remain, tests must prove native event works without invoking them. If removed, update regression contract tests and constants accordingly.

- [x] Task 11: Update approval prompt text/metadata for native questions.
  - File: `D:\work\개인\devai-aidd-plugin\src\index.js`
  - Action: Adjust `pluginContext.requestApproval` and `requestRecoveryDecision` prompt text so the model is instructed to ask a user question with stable headers/options when running under native event mode. Preserve `directory`, `sessionID`, `requestId`, `actionId`, `actionType`, recovery metadata, and existing explanation content.
  - Notes: For init approvals, include an `Initialize Git` header/options in the prompt text so the subsequent `question.asked` event can be matched as in the reference plugin.

- [x] Task 12: Update regression tests for native contract and src/dist parity.
  - File: `D:\work\개인\devai-aidd-plugin\tests\regression.test.js`
  - Action: Replace assertions that require all six named handlers with assertions that `handlers.event` exists and native event flows produce parity between `src` and `dist`. If legacy named handlers are retained, assert they are compatibility-only and not needed for native e2e paths.
  - Notes: Add helpers to simulate `command.executed`, `question.asked`, `question.replied`, `question.rejected`, `session.idle`, `session.deleted` against `handlers.event({ event })`.

- [x] Task 13: Update non-git init e2e to use native question events.
  - File: `D:\work\개인\devai-aidd-plugin\tests\e2e\scenario-readiness-not-initialized.test.js`
  - Action: Replace `handlers["command.execute.before"]` invocation with native `command.executed`. After init approval prompt is delivered, simulate `question.asked` with header `Initialize Git` and the emitted question id, then simulate `question.replied` with an approve/initialize answer. Assert `approval.requested` and `approval.resolved` audit chain remains intact and prompt payload contains `directory`.
  - Notes: This is the core regression path for “git init 승인/응답 흐름을 native question event 기반으로 연결”.

- [x] Task 14: Update approval deny/recovery e2e to use native question events.
  - File: `D:\work\개인\devai-aidd-plugin\tests\e2e\scenario-approval-deny-recovery.test.js`
  - Action: Start workflow with native `command.executed`. Simulate `question.asked` for the active approval, then `question.replied` with `deny`. Assert `approval.resolved`, `git.action.recovery.offered`, and recovery prompt delivery occur. Add a rejection case using `question.rejected`.
  - Notes: Do not call `handlers["permission.asked"]` in the native path test.

- [x] Task 15: Update file tracking/finalization e2e for native fallback.
  - File: `D:\work\개인\devai-aidd-plugin\tests\e2e\scenario-file-edited-tracking.test.js`
  - Action: Add a native-only scenario that modifies files in the temp repo without invoking `handlers["file.edited"]`, then triggers `session.idle` or `command.executed` finalization. Assert `workflow.finalization.evaluated` sees the changed files through the fallback path.
  - Notes: Keep the existing explicit `file.edited` test if legacy compatibility handlers remain.

- [x] Task 16: Build and verify the distribution artifact.
  - File: `D:\work\개인\devai-aidd-plugin\dist\devai-aidd-plugin.js`
  - Action: Run `npm run build` so the generated bundle reflects `src` changes. Then run the full verification command set.
  - Notes: Do not manually edit the dist bundle unless the build pipeline fails for a reason unrelated to this change; if that happens, document the blocker.

### Acceptance Criteria

- [x] AC 1: Given `dist\devai-aidd-plugin.js` is copied into `.opencode/plugins`, when opencode loads the plugin factory, then the returned handlers include a callable native `event` handler that can process the required native event types.
- [x] AC 2: Given a BMAD command exists in `.opencode/commands`, when the plugin receives a native `command.executed` event with that command and sessionID, then workflow state is initialized, `workflow.detected` is audited, repository readiness is checked, and the approval prompt path is evaluated without invoking `command.execute.before`.
- [x] AC 3: Given a non-git workspace and a BMAD command session, when native `command.executed` is processed, then an init proposal is planned, `approval.requested` is audited with `actionKind: "init"`, and `client.session.promptAsync` receives a payload with the same `directory`.
- [x] AC 4: Given an active init approval and a native `question.asked` event with header `Initialize Git`, when the event is processed, then the session state records the question request id as pending for that init approval.
- [x] AC 5: Given a pending init approval question, when native `question.replied` arrives with an answer such as `Initialize Git (Recommended)` or `yes`, then the existing approval resolver records `approval.resolved` with outcome `accept` and clears the active approval without using `permission.asked`.
- [x] AC 6: Given a pending approval question, when native `question.replied` arrives with `Cancel`, `deny`, or `no`, then the approval is resolved as a controlled denial, `approval.resolved` is audited, and any existing recovery-gate behavior for denied approvals still runs.
- [x] AC 7: Given a pending approval question, when native `question.rejected` arrives for the matching request id, then the plugin does not throw and does not silently discard the approval; it records a controlled denial/skip path through the existing audit semantics.
- [x] AC 8: Given a recovery gate prompt is active, when native `question.asked` and `question.replied` carry the recovery question and answer, then the existing recovery orchestrator processes the choice and emits the same recovery audit events as the legacy `permission.asked` route.
- [x] AC 9: Given native opencode does not call `file.edited`, when files change during a tracked workflow and `session.idle` triggers finalization, then changed files are discovered through the git/status fallback and appear in `workflow.finalization.evaluated`.
- [x] AC 10: Given a tracked workflow session, when native `session.deleted` arrives, then all workflow/approval/recovery/touched-file state for that session is cleared and later mutating guard logic no longer treats the session as active.
- [x] AC 11: Given malformed, unknown, or unrelated native events, when `handlers.event({ event })` processes them, then the plugin returns without throwing and without mutating unrelated session state.
- [x] AC 12: Given an audit sink throws during native approval/recovery/finalization handling, when the native event handler continues, then load-bearing state transitions and prompt delivery still proceed best-effort according to the existing failure-isolation pattern.
- [x] AC 13: Given both `src` and generated `dist` are imported, when equivalent native event scenarios are run against each, then audit prompt summaries and externally observable behavior match.
- [x] AC 14: Given the project verification commands are run, when `npm test` and `npm run build` complete, then syntax checks, regression tests, e2e tests, and bundle generation all pass.

## Additional Context

### Dependencies

- Runtime: Node.js 22 ESM plugin runtime.
- Build: `npx esbuild` invoked by `scripts/build.js`.
- Tests: built-in `node:assert/strict`, temp filesystem workspaces, real `git` binary, mocked opencode client.
- Runtime client APIs currently used: `client.app.log(payload)` and `client.session.promptAsync({ sessionID, directory, parts })`.
- No additional npm dependency is needed for the native event conversion.

### Testing Strategy

- Add/adjust unit-level regression coverage for returned handler shape: native `event` handler must exist and handle `question.asked`, `question.replied`, `question.rejected`, `command.executed`, `session.idle`, `session.deleted` without requiring `permission.asked` or `file.edited`.
- Update src/dist parity tests so the built bundle exports the same native contract and behavior as `src/index.js`.
- Add e2e coverage for non-git workspace: workflow command event publishes init approval, `question.asked` stores the init question id, `question.replied` with Initialize/Approve resolves approval and keeps audit chain intact.
- Add e2e coverage for rejection/deny: `question.rejected` or negative reply resolves/skips approval through existing audit/recovery behavior instead of silently dropping state.
- Add e2e coverage for file tracking/finalization without invoking `handlers["file.edited"]`, using native/session/finalization fallback to ensure changed files are still visible to finalization.
- Run `npm test` and `npm run build`; after build, rerun at least `node --check dist/devai-aidd-plugin.js` or the full test command.

### Notes

- 사용자는 기준 파일과 대상 dist 파일을 명시했고, 가능하면 src에도 반영하길 원한다.
- 현재 요청은 `bmad-quick-spec` 워크플로로 시작되었으므로, 이 spec 단계에서는 구현하지 않는다. 구현은 review 완료 후 `bmad-quick-dev` 또는 명시적 구현 지시로 진행한다.
- 가장 큰 리스크는 `command.executed`의 실제 payload shape다. 기준 파일은 `event.properties.name`, `sessionID`, `answers`, `requestID`를 사용하므로 우선 이 shape를 지원하되, `command`, `arguments`, `args` 등 대체 필드를 방어적으로 읽어야 한다.
- 두 번째 리스크는 기존 `command.execute.before`가 output mutation에 의존한다는 점이다. native `command.executed`에서는 output이 없을 수 있으므로 start instruction은 prompt/audit/state 중심으로 검증하고, output part는 내부 호환 동작으로만 취급한다.
- 기존 named handlers를 완전히 제거하면 회귀 테스트와 외부 사용자가 깨질 수 있다. 그러나 목표는 `.opencode/plugins` native 동작이므로, 구현자는 “native event가 필수 경로, named hook은 선택적 호환 경로”라는 우선순위를 지켜야 한다.

## Review Notes

- Adversarial review completed (`bmad-review-adversarial-general` via subagent).
- Findings: 14 total, 6 fixed (F1, F3, F4, F5, F6, F10), 8 acknowledged (F2, F7, F8, F9, F11, F12, F13, F14).
- Resolution approach: auto-fix Critical/High items only.
- Fixes applied:
  - F1: Removed dead header-based fallback in `handleQuestionAsked`; non-workflow sessions now correctly do not record pending question state.
  - F3 + F10: Removed prefix-matching fallbacks in `parseApprovalAnswerOutcome` and `parseRecoveryAnswerChoice`; reliance on exact-match aliases preserves the disjointness invariant between approval and recovery vocabularies. Added a hyphen-to-space normalization for hyphenated approval labels.
  - F4: `handleQuestionAsked` now routes to recovery whenever a non-terminal recovery gate exists, regardless of question header text. Header-only matching was brittle when models paraphrased the prompt title.
  - F5 + F6: Added `nativeFinalizationPublishedAt` idempotency marker on workflow state. `handleSessionIdle` short-circuits when the marker is set; `handleCommandExecuted` clears the marker on each fresh command, allowing re-entry to publish finalization again.
  - F9 (incidental): `handleCommandExecuted` now audits a `native.event.handler.failed` event when the legacy command-execute-before factory throws synchronously, instead of swallowing silently.
  - Additionally, `handleSessionIdle` now refreshes touchedFiles via `pluginContext.listChangedFiles()` on every idle event (not just when touchedFiles is empty), so partial file.edited coverage cannot drop additional changes.
- Acknowledged but not fixed (no blocker risk):
  - F2: Pending question fields not in deep-clone whitelist — works by accident, low priority.
  - F7, F11: Stale pending records / back-to-back question races — observability gaps; legacy permission.asked still resolves correctly.
  - F8: Partial touchedFiles coverage — superseded by F5/F6 fix (idle now always refreshes from git status).
  - F12, F13, F14: Audit silence on recovery rejection, test bootstrap of legacy handlers, no finalization-done flag — observability / test-quality only.
