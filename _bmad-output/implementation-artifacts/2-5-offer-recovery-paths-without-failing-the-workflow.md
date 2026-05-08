# Story 2.5: Offer Recovery Paths Without Failing the Workflow

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want recovery choices when automation fails or is blocked,
so that I can retry, skip, or resolve issues manually without losing workflow progress.

## Acceptance Criteria

1. **Given** a Git action is denied, skipped, or fails during execution
   **When** the plugin resolves the action outcome
   **Then** it offers recovery paths such as retry, continue without automation, or continue after manual resolution
   **And** those options are explained in a way the user can act on immediately.
2. **Given** a recoverable automation failure occurs
   **When** the workflow proceeds after the failure
   **Then** the BMAD workflow is not treated as an immediate hard failure
   **And** subsequent workflow steps can continue subject to the user’s chosen recovery path.

## Tasks / Subtasks

- [x] Define a centralized recovery result model and state transitions for denied, skipped, and failed Git actions (AC: 1, 2)
  - [x] Add a recovery-state helper under `src/services/workflow/` or `src/services/approval/` that records the current action, failure classification, recoverability, offered choices, and chosen continuation path per `sessionID`.
  - [x] Reuse the existing object envelope style `{ outcome, reason, message, details }` and error shape `{ code, message, recoverable, details }` instead of introducing a parallel contract family.
  - [x] Ensure recovery state is session-scoped, shallow-copy-safe, and cleared with the existing `session.deleted` cleanup path.
  - [x] Model a single active recovery gate per session/action so approval and recovery do not race each other.

- [x] Implement recoverable vs non-recoverable classification rules for approval outcomes and Git execution failures (AC: 1, 2)
  - [x] Treat `deny`, `skip`, retryable conflicts, transient push rejection, detached/policy-mismatch branch state, and repository readiness issues with a safe manual path as recoverable.
  - [x] Treat corrupted session context, unknown action category, malformed proposal payload, cross-session mismatch, and invariant-breaking state corruption as non-recoverable.
  - [x] Preserve Story 2.4 failure classification as the single source of truth for machine-readable failure codes, and extend it only with recovery metadata such as `recoverable`, `recommendedChoice`, and `blockingScope`.
  - [x] Guarantee that non-recoverable automation errors stop only the automation path for the affected session and surface a controlled result instead of crashing the whole plugin runtime.

- [x] Implement retry / continue-without-automation / manual-resolution continuation semantics (AC: 1, 2)
  - [x] Define a recovery state machine with explicit states at minimum:
    - `planned`
    - `awaitingApproval`
    - `approved`
    - `executing`
    - `failed`
    - `awaitingRecovery`
    - `retryRequested`
    - `continuedWithoutAutomation`
    - `awaitingManualResolution`
    - `continuedAfterManualResolution`
    - `completed`
    - `abandoned`
  - [x] `retry` must create a fresh execution attempt tied to the same action identity and increment an attempt counter without losing the earlier audit trail.
  - [x] `continue without automation` must close the current automation gate, mark the action outcome as intentionally bypassed, and allow the BMAD workflow to keep running.
  - [x] `continue after manual resolution` must record that the user claims the prerequisite was resolved outside automation and reopen downstream workflow progression without pretending the plugin executed the Git change itself.

- [x] Define action-specific recovery options for `branch`, `init`, `commit`, and `push` actions (AC: 1, 2)
  - [x] `branch/create` and `branch/switch`: offer retry after branch state changes, continue without automation on current branch, or continue after manual checkout/create.
  - [x] `init`: offer retry, continue without Git automation for the rest of the session, or continue after manual `git init` and readiness recheck.
  - [x] `commit`: offer retry, continue without automatic finalization, or continue after manual commit verification; do not implement commit creation here because commit lifecycle remains Story 3.x scope.
  - [x] `push`: offer retry, continue with local-only completion, or continue after manual push verification; do not redefine commit success semantics when push fails.
  - [x] Require every recovery option to include immediate user-facing instructions and the next state transition that will occur if selected.

- [x] Integrate recovery gating with existing hooks, workflow state, and cleanup flow (AC: 1, 2)
  - [x] Extend `src/hooks/permission-asked.js` (recovery prompt delivery + recovery-choice routing) and `src/hooks/command-execute-before.js` (planning-time gate consultation via `isActionBlockedByGate`) so recovery prompts can be emitted and resolved without bypassing existing approval/state flow. `src/hooks/tool-execute-before.js` and `src/hooks/tool-execute-after.js` were intentionally NOT modified — recovery is a planning-time and approval-resolution-time concern, and Story 2.5 round-3 review confirmed those tool hooks have no recovery-relevant gating to perform (mutating-tool blocking is owned by the legacy guard, phase advancement is direction-safe). See Round 3 Architectural Note in Dev Notes.
  - [x] Keep `src/hooks/command-execute-before.js` thin; it should stash proposals and state pointers, while recovery orchestration lives in a dedicated service layer.
  - [x] Reuse `createWorkflowStateStore()` storage conventions and `createSessionHook()` cleanup logic so recovery state is erased with the session.
  - [x] Ensure a pending recovery gate blocks only later dependent Git automation for the same session, not unrelated non-Git workflow progress or other sessions.

- [x] Define audit/event contracts for recovery planning and resolution (AC: 1, 2)
  - [x] Emit structured events using existing `dot.case` naming and top-level envelope rules.
  - [x] Minimum new events:
    - `git.action.recovery.offered`
    - `git.action.recovery.selected`
    - `git.action.recovery.completed`
    - `git.action.recovery.blocked` for non-recoverable or invariant-breaking cases
  - [x] Include `workflow`, `command`, `outcome`, `timestamp`, `details.actionKind`, `details.actionId`, `details.failureCode`, `details.recoverable`, `details.choice`, and `details.attempt`.
  - [x] Keep audit best-effort and avoid logging raw secrets, full remote URLs, or arbitrary command arguments beyond already-approved minimal context patterns.

- [x] Expand regression and contract coverage for continuation behavior and edge cases (AC: 1, 2)
  - [x] Add unit tests for recovery classification, state transitions, gate release rules, retry counters, and manual-resolution confirmation handling.
  - [x] Add integration-style tests to prove a denied/skipped/failed action does not immediately hard-fail the workflow session.
  - [x] Add action-specific tests for `branch`, `init`, `commit`, and `push` recovery options and dependency gating.
  - [x] Preserve legacy parity for unrelated mutating-tool protections and ensure recovery additions do not alter non-workflow command behavior.

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Retry leaves the recovery gate persistently active in `state: "planned"` with `blockingScope: "git-only"` for the same `actionKind`, so the next `command-execute-before` planning pass calls `isActionBlockedByGate` and emits `git.action.recovery.blocked` instead of publishing a fresh approval request. End-to-end retry never produces a new approval cycle, breaking AC1's retry option and the AC2 continuation contract. Reproduced via `selectRecoveryChoice({ choice: "retry" })` followed by `isActionBlockedByGate(gate, "branch")` returning `{ blocked: true, reason: "same-action-blocked" }`. Fix options: (a) clear the gate at the end of the retry branch in `selectRecoveryChoice`, or (b) make `isActionBlockedByGate` treat `gate.continuationPhase === "terminal"` as gate-released so retry's terminal continuation is honored. [src/services/approval/recovery-orchestrator.js:437-454, src/services/approval/recovery-orchestrator.js:631-652, src/hooks/command-execute-before.js:207-228]
- [x] [AI-Review][MEDIUM] Recovery options are modeled in the gate (`gate.options[].instructions / nextState / blockingScope`) and emitted as `git.action.recovery.offered` audit events, but no prompt-delivery adapter (analogous to `pluginContext.requestApproval` -> `client.session.promptAsync`) actually presents the options to the user. Without that path, the user cannot select retry / continue-without-automation / manual-resolution and the gate stays open indefinitely. AC1's "those options are explained in a way the user can act on immediately" is therefore only data-shape complete. Decide whether prompt delivery is in-scope for Story 2.5 or deferred; if in-scope, add a `pluginContext.requestRecoveryDecision(gate)` adapter wired through `permission-asked.js` (or a dedicated recovery hook) and feed the user's choice into `selectRecoveryChoice` / `confirmManualResolution`. [src/hooks/permission-asked.js:173-189, src/services/approval/recovery-orchestrator.js, src/index.js]
- [x] [AI-Review][LOW] `verifySelectRetryIncrementsAttempt` only asserts gate state/attempt/events but does not verify that subsequent planning is unblocked after retry. Add an assertion that `isActionBlockedByGate(readRecoveryGate(store, sessionID), "branch").blocked === false` after the retry, or drive a fresh `command-execute-before` cycle and assert a new `approval.requested` event is emitted. This test gap is what masked the HIGH finding. [tests/regression.test.js:5880-5924]
- [x] [AI-Review][LOW] `_openBlockedGate` returns `outcome: "opened"` even though the gate enters `state: "abandoned"` immediately, which is inconsistent with `_openRecoverableGate` whose `"opened"` means `awaitingRecovery`. Consider either returning a distinct outcome (`"blocked"` / `"abandoned-on-open"`) for the non-recoverable open path, or document the current shape so callers do not branch on the assumption that `"opened"` always implies a non-terminal gate. [src/services/approval/recovery-orchestrator.js:719-781]
- [x] [AI-Review][HIGH] Recovery `selected` / `completed` / `blocked` events emitted via the `permission-asked` path lose `workflow` / `command` attribution. `_openRecoverableGate` and `_openBlockedGate` do not persist `workflow` / `command` onto the gate object, so `permission-asked.js` reads `activeRecoveryGate.workflow ?? null` / `activeRecoveryGate.command ?? null` (both undefined), and `buildEventEnvelope` then writes `workflow: null, command: null` into the audit payload. Story 2.5 audit contract (Task #6) requires `workflow` and `command` on every recovery event; without them, audit consumers that group/filter by workflow miss Story 2.5's `selected` / `completed` / `blocked` events while `offered` (emitted directly by the orchestrator with full params) is correctly attributed. Fix: persist `workflow` / `command` on the gate at open time and have `buildEventEnvelope` (or the hook) fall back to `gate.workflow` / `gate.command` when params are null. Add a regression assertion that the `selected` event for a deny-path retry carries `workflow === "<workflow-name>"`, not null. [src/services/approval/recovery-orchestrator.js:691-712, src/services/approval/recovery-orchestrator.js:733-776, src/services/approval/recovery-orchestrator.js:124-153, src/hooks/permission-asked.js:304-307]
- [x] [AI-Review][MEDIUM] `command-execute-before.js` emits `git.action.recovery.blocked` with a divergent `details` shape from the orchestrator's emission of the same event name. The hook writes `details: { actionKind, actionId, blockingScope, reason, source, sessionID }`, while the orchestrator's `buildEventEnvelope` path writes `actionKind, actionId, correlationId, failureCode, recoverable, blockingScope, attempt, gateId, sessionID, source` plus the `selected` / `completed`-specific extras. Story 2.5 audit contract (Task #6) names `failureCode`, `recoverable`, `attempt` as MINIMUM details for the recovery event family. The current asymmetry forces audit consumers to branch on emission origin even though the event name is identical. Fix: route the hook's emission through `buildEventEnvelope` (or a shared gate-to-event helper exported from the orchestrator), or at minimum add `failureCode: activeRecoveryGate.reason`, `recoverable: activeRecoveryGate.recoverable`, `attempt: activeRecoveryGate.attempt`, and `gateId: activeRecoveryGate.gateId` to the hook's payload. [src/hooks/command-execute-before.js:213-228, src/services/approval/recovery-orchestrator.js:124-153]
- [x] [AI-Review][LOW] `_bmad-output/planning-artifacts/architecture.md` does not list the four new Story 2.5 audit events (`git.action.recovery.offered` / `.selected` / `.completed` / `.blocked`). The same file was edited in this session to add Story 2.4 `approval.resolution.failed` / `approval.prompt.delivery.failed` / `git.readiness.checked`, so the omission is documentation drift, not an architectural decision. Architecture.md is also not in the Story 2.5 File List even though it was modified, so the change is undocumented at two layers. Fix: append the four recovery events to the audit/event registry section of architecture.md and add architecture.md to the Story 2.5 File List with a brief Change Log note. [_bmad-output/planning-artifacts/architecture.md:339-352]
- [x] [AI-Review][LOW] `isActionBlockedByGate` does not honour `gate.continuationPhase === "terminal"` as a release signal. The retry path now persists the gate at `state: "planned"` with `continuationPhase: "terminal"` and then awaits `selected` + `completed` audit emission before calling `clearGate`. Two `await` yields sit between persist and clear; in that window any concurrent reader (e.g. a re-entrant `command.execute.before`) sees `state === "planned"` (not in `TERMINAL_RECOVERY_STATES`) and gets `{ blocked: true, reason: "same-action-blocked" }` even though the retry has already finalised. The original [HIGH] review proposed both fixes (a) clear-gate and (b) treat `continuationPhase === "terminal"` as released; only (a) was applied. Adding (b) is defensive — single-threaded Node sequential routing makes the race rare in practice, but a future change that introduces a parallel ingress path would re-open the same regression that the [HIGH] originally caught. Fix: at the top of `isActionBlockedByGate`, return `{ blocked: false, reason: "gate-terminal-phase" }` when `gate.continuationPhase === "terminal"`. [src/services/approval/recovery-orchestrator.js:644-665, src/services/approval/recovery-orchestrator.js:481-541]
- [x] [AI-Review][MEDIUM] Story Task #5 claimed `src/hooks/tool-execute-before.js` and `src/hooks/tool-execute-after.js` were extended for recovery, but `grep -n "recovery" src/hooks/tool-execute-*.js` returns no matches — those hooks were never modified for Story 2.5. The defensible architectural decision is that recovery is a planning-time concern (handled by `command-execute-before.js`) and an approval-resolution-time concern (handled by `permission-asked.js`); the tool-execute hooks have no recovery-relevant gating to perform. Fix: amend Task #5 to accurately describe which hooks were extended and add a Round 3 Architectural Note in Dev Notes explaining the decision. [_bmad-output/implementation-artifacts/2-5-offer-recovery-paths-without-failing-the-workflow.md (Tasks/Subtasks Task #5)]
- [x] [AI-Review][LOW] `_openBlockedGate` initialises `gate.history` with two entries — a synthetic `awaitingRecovery` precursor and the actual `abandoned` state — even though the gate was opened directly into `abandoned` and never held `awaitingRecovery`. Audit consumers reconstructing the timeline from `gate.history` would be misled. Fix: initialise history with a single `abandoned` entry that reflects the gate's real lifecycle. [src/services/approval/recovery-orchestrator.js:850-854]
- [x] [AI-Review][LOW] `OUTCOME_ALIASES` and `RECOVERY_CHOICE_ALIASES` in `permission-asked.js` rely on an implicit disjointness invariant — recovery-first routing means a single overlapping key would silently re-route an approval reply through the recovery layer (or vice versa). The disjointness was not asserted anywhere, so a future alias addition could break routing without a regression catching it. Fix: lift both alias maps into a shared `permission-asked-aliases.js` module and add a regression test (`verifyPermissionAskedAliasDisjointness`) that asserts the key sets stay disjoint. [src/hooks/permission-asked.js:55-81 → src/services/approval/permission-asked-aliases.js (new)]
- [x] [AI-Review][LOW] `_bmad-output/implementation-artifacts/sprint-status.yaml` was modified by code-review rounds (review timestamp + last_review note) but never appeared in the Story 2.5 File List, which mirrors the same architecture.md drift caught in round 2. Fix: add `sprint-status.yaml` to the File List with this round's status update note.

## Dev Notes

### Story Intent

Story 2.4 owns failure detection, classification, and human-readable reporting. Story 2.5 begins only after an action outcome already exists: approval denied, approval skipped/ignored, or Git execution failed. Its job is to convert that outcome into a controlled continuation path so automation failure does not immediately become BMAD workflow failure.

This story does not execute final commit/push lifecycle logic. It defines the recovery envelope, state machine, gating rules, and audit contracts that later branch/init/commit/push executors must honor. Commit and push execution remain Epic 3 scope; Story 2.5 only standardizes how recovery is offered when those actions are denied or fail.

### Verified Baseline Findings

- The current wrapper already stores session-scoped workflow context in `src/services/workflow/workflow-state.js` and clears it on `session.deleted` in `src/hooks/session.js`. Story 2.5 should extend this same storage boundary instead of creating a new global cache.
- `src/hooks/command-execute-before.js` already records `readiness`, `initProposal`, and `branchProposal` into workflow state and emits `git.action.planned` plus `git.readiness.checked` audit events. Recovery must attach to these planned/executed actions rather than inventing a second planning channel.
- `src/hooks/permission-asked.js` is currently a thin pass-through to legacy handlers. That makes it the natural hook boundary for later approval/recovery prompt integration, but the actual branching logic should live in a service, not the hook.
- `src/audit/logger.js` already enforces best-effort client/file/HTTP logging. Story 2.5 must keep recovery event emission non-blocking and must not let audit sink failures abort workflow continuation.
- `src/services/git/check-repository-readiness.js` already uses the standardized result shape `{ outcome, reason, message, details }` and differentiates `allow`, `ask`, and `skip`. Recovery should reuse that outcome vocabulary rather than introducing ad hoc booleans.
- The architecture already prescribes event names such as `approval.requested`, `approval.resolved`, `git.action.planned`, `git.action.executed`, and `git.action.skipped`, plus error objects with `recoverable: true|false`. Story 2.5 should extend these contracts, not replace them.

### Technical Requirements

- Recovery must distinguish two layers:
  - **action outcome**: what just happened (`deny`, `skip`, `failed`, `completed`)
  - **continuation choice**: what the user wants next (`retry`, `continue-without-automation`, `manual-resolution`)
- A failure is **recoverable** when the plugin still has a coherent action identity, session identity, and next-step choices that can be presented safely. Examples:
  - branch conflict or branch mismatch
  - init denied or skipped
  - missing remote or push rejection with local work preserved
  - commit precondition mismatch where manual or retry resolution is possible
  - transient Git execution failure where retry is meaningful
- A failure is **non-recoverable** when state integrity is broken or the plugin cannot safely describe the next action. Examples:
  - missing or mismatched `sessionID`
  - missing proposal/action kind for an approval result
  - impossible transition such as recovery selection without prior failure
  - malformed stored recovery payload
  - cross-session recovery response applied to the wrong action
- Deny/skip outcomes are not hard failures by themselves. They are controlled user choices and therefore must enter `awaitingRecovery` or a direct continuation path, not a fatal plugin exception.
- The recovery model must preserve action identity:
  - `actionKind`: `branch` | `init` | `commit` | `push`
  - `actionId`: stable ID for the specific proposal/execution chain
  - `attempt`: integer starting at `1`, incremented on retry
  - `blockingScope`: `none` | `git-only` | `session-git` | `workflow-finalization`
- `continue without automation` means:
  - current automation action is intentionally bypassed
  - BMAD content-generation work continues
  - dependent future Git automation is either suppressed or re-gated according to the action kind
- `continue after manual resolution` means:
  - the plugin records the user-selected manual path
  - the system may re-run readiness/policy validation where applicable
  - the plugin must not falsely mark the original Git action as executed by automation

### Retry / Skip / Manual-Resolution State Machine

- Canonical progression:
  - `planned -> awaitingApproval -> approved -> executing -> completed`
  - `planned -> awaitingApproval -> denied -> awaitingRecovery`
  - `planned -> awaitingApproval -> skipped -> awaitingRecovery`
  - `approved -> executing -> failed -> awaitingRecovery`
- Recovery branches:
  - `awaitingRecovery -> retryRequested -> planned`
  - `awaitingRecovery -> continuedWithoutAutomation`
  - `awaitingRecovery -> awaitingManualResolution -> continuedAfterManualResolution`
- Terminal expectations:
  - `completed` means the automation action finished successfully
  - `continuedWithoutAutomation` means the workflow may continue but the current Git action is closed as bypassed
  - `continuedAfterManualResolution` means the workflow may continue after user-managed remediation
  - `abandoned` is reserved for controlled stop of the automation path when the user declines all continuation or a non-recoverable state is reached
- Non-recoverable transition rule:
  - `failed -> git.action.recovery.blocked -> abandoned`
  - This is a controlled automation stop, not a process crash; other sessions and unrelated hooks must continue to work

### Action-Specific Recovery Options

- `branch/create`
  - Retry: after user changed branch state, naming input, or resolved an existing branch conflict
  - Continue without automation: keep working on the current branch, but mark branch policy as bypassed for this session
  - Continue after manual resolution: user manually created/checked out the target branch, then requests the workflow to continue
- `branch/switch`
  - Retry: attempt switch again after branch state changed
  - Continue without automation: remain on current branch and suppress automatic branch enforcement for this session
  - Continue after manual resolution: user manually switched to the expected branch, then requests continuation
- `init`
  - Retry: re-run readiness after fixing environment or Git availability
  - Continue without automation: disable Git automation for the remaining session because repository prerequisite is still absent
  - Continue after manual resolution: user manually ran `git init` and asks for readiness revalidation before later Git actions
- `commit`
  - Retry: re-attempt commit preparation/execution after preconditions are fixed
  - Continue without automation: complete the BMAD workflow without automatic commit creation
  - Continue after manual resolution: user manually committed artifacts and asks the plugin to continue with post-commit semantics
- `push`
  - Retry: re-attempt push after authentication/network/remote issues change
  - Continue without automation: preserve local commit as successful and finish without remote publication
  - Continue after manual resolution: user manually pushed and asks the plugin to continue from a pushed state

### Workflow Continuation Rules and Gating Release Conditions

- Recovery gates are session-local. A blocked Git action must never freeze unrelated sessions.
- A pending recovery gate blocks only dependent later Git automation for the same session.
- Gating rules by action kind:
  - `init` unresolved: suppress all later Git automation proposals in the same session because repository readiness is a prerequisite for branch/commit/push.
  - `branch` unresolved: allow BMAD work to continue, but later finalization logic in Story 3.x must inspect the recovery outcome before assuming branch policy compliance.
  - `commit` unresolved: allow BMAD workflow completion semantics, but do not automatically move to push planning unless commit success or manual commit resolution has been recorded.
  - `push` unresolved: do not invalidate a successful local commit; local finalization may stand even if push is skipped or manually handled.
- Gating is released only when one of the following becomes true:
  - a retry is selected and a fresh `planned` action replaces the failed one
  - `continue without automation` is recorded and downstream policy marks the dependency as bypassable
  - `continue after manual resolution` is recorded and any required recheck succeeds or is explicitly waived by design
  - the action is classified non-recoverable and the automation path is explicitly closed as `abandoned`
- The plugin must not silently clear a recovery gate just because the next hook fired. Recovery closure must be explicit and audit-visible.

### Audit / Event Contracts

- Reuse the existing event envelope:

```js
{
  event: "git.action.recovery.offered",
  timestamp: "ISO-8601",
  workflow: "bmad-bmm-quick-dev",
  command: "bmad-bmm-quick-dev",
  outcome: "ask" | "allow" | "deny" | "skip",
  details: {}
}
```

- New recovery events:
  - `git.action.recovery.offered`
  - `git.action.recovery.selected`
  - `git.action.recovery.completed`
  - `git.action.recovery.blocked`
- Recommended `details` fields:
  - `actionKind`
  - `actionId`
  - `attempt`
  - `failureCode`
  - `recoverable`
  - `choice`
  - `blockingScope`
  - `recommendedChoice`
  - `requiresRecheck`
  - `continuedWorkflowPhase`
- Existing events that must remain aligned:
  - `approval.requested`
  - `approval.resolved`
  - `git.action.planned`
  - `git.action.executed`
  - `git.action.skipped`
- Logging constraints:
  - never store raw secrets, credentials, or full remote URLs
  - do not log arbitrary command arguments unless already minimized by existing policy
  - keep audit best-effort so sink failures do not interrupt recovery handling

### Architecture Compliance

- Keep hooks thin. Recovery orchestration belongs in `src/services/approval/` or `src/services/workflow/`, not in `src/hooks/*`.
- Reuse the existing in-memory session state pattern in `src/services/workflow/workflow-state.js`; do not add global mutable singletons.
- Preserve the architecture direction:
  - hooks -> workflow context -> approval/policy decision -> git orchestration -> audit/event logging
- Reuse standardized object contracts:
  - result envelope `{ outcome, reason, message, details }`
  - error envelope `{ code, message, recoverable, details }`
- Treat recovery as part of the approval-governed Git control model defined in architecture, not as a separate exception framework.

### Library / Framework Requirements

- No new dependency is required. Story 2.5 should be implementable with the current Node.js ESM runtime and existing project utilities.
- Prefer plain objects and session-scoped store entries over external state-machine libraries.
- Keep audit emission on the existing logger path in `src/audit/logger.js`.
- Preserve existing ESM/import style and runtime assumptions used by `src/index.js` and current hook factories.

### File Structure Requirements

- Expected new or updated implementation areas:
  - `src/services/approval/` for recovery-option construction and approval/recovery outcome resolution
  - `src/services/workflow/` for session recovery state helpers and transition guards
  - `src/hooks/permission-asked.js` for routing recovery prompts once the service exists
  - `src/hooks/tool-execute-before.js` and/or `src/hooks/tool-execute-after.js` for dependent gating checks tied to session phase
  - `tests/regression.test.js` for wrapper-level continuation and non-hard-failure coverage
- Do not put substantial recovery decision logic directly in:
  - `src/index.js`
  - `src/hooks/session.js`
  - `src/audit/logger.js`
- Keep `session.deleted` cleanup ownership in `src/hooks/session.js`; recovery state should be cleared through the same session lifecycle instead of inventing a separate disposer.

### Testing Requirements

- Required verification commands after implementation:
  - `npm run build`
  - `npm test`
- Required unit coverage:
  - recoverable vs non-recoverable classification
  - retry attempt increment and state reset
  - gate release rules for retry, skip, and manual-resolution paths
  - invalid transition protection such as selecting recovery before a failure exists
- Required integration/regression coverage:
  - denied branch action does not hard-fail the workflow session
  - skipped init action disables later Git automation without breaking non-Git BMAD progression
  - failed commit action does not auto-trigger push planning
  - failed push action preserves previously successful local commit semantics
  - session cleanup removes recovery state on `session.deleted`
  - non-workflow commands remain unaffected
- Required edge cases:
  - repeated retries on the same action preserve audit trail and increment `attempt`
  - manual resolution selected but verification/recheck fails
  - recovery response arrives for the wrong `sessionID` or stale `actionId`
  - approval denied after a newer retry attempt has already replaced the old action
  - detached HEAD or missing remote causes recoverable continuation, not uncontrolled throw
  - audit logger failure during recovery event emission does not interrupt workflow continuation

### Previous Story Intelligence

- Story 1.4 established proposal-first branch behavior and explicitly avoided performing Git mutation inside planning logic. Story 2.5 must preserve that separation: recovery choices describe what happens next, but they do not silently perform side effects in the wrong layer.
- Story 1.5 established readiness results and init proposal storage under workflow state. Story 2.5 should build on that stored `readiness`/`initProposal` context rather than recomputing repository state from scratch unless the user explicitly selected retry or manual-resolution recheck.
- Story 2.4 is the direct prerequisite. Its failure classification must feed the recovery system instead of duplicating branch conflict, push rejection, or repository mismatch detection. Recovery state must consume Story 2.4's normalized failure envelope `{ ok, status, action, code, message, details, audit, next }` as input; do not re-derive failure codes inside the recovery layer.
- Stories 2.1, 2.2, and 2.3 are already on disk under `src/services/approval/` (`build-approval-request.js`, `build-approval-explanation.js`, `build-approval-resolution.js`, `consume-approval-outcome.js`, `approval-resolution-state.js`, `approval-policy-service.js`, `classify-git-action.js`, `redact-approval-fields.js`). Story 2.5 must extend that approval service surface for recovery prompt construction and resolution rather than introducing a parallel approval pipeline. In particular, the `accept | deny | ignore-and-continue` resolution vocabulary from Story 2.3 must be the input that feeds `awaitingRecovery` transitions; do not rename it.
- Redaction rules established by Stories 2.1 and 2.2 (under `src/services/approval/redact-approval-fields.js`) must be honored by recovery event payloads; recovery audit details must not re-expose any field those stories already redact.

### Git Intelligence Summary

- Recent history is still dominated by Epic 1 story completion and merges:
  - `f5ddbc6` Merge branch `epic1/stories` into `master`
  - `edbac78` Merge branch `epic1/story1-5` into `epic1/stories`
  - `a3a1e40` Finish story 1-5 repository readiness review
  - `29e0035` Merge branch `epic1/story1-4` into `epic1/stories`
  - `30e317b` Finish story 1-4 branch strategy review
- That history indicates the current codebase has planning/readiness groundwork but not Epic 2 recovery orchestration yet. Story 2.5 should therefore reuse current wrapper/state/audit patterns instead of assuming a mature approval executor already exists everywhere.
- Stories 2.1 through 2.4 are uncommitted in the working tree only. Story 2.5 must layer on top of those uncommitted scaffolds without claiming the recovery state machine itself is already implemented; it is not.

### Latest Tech Information

- Runtime: Node.js 22 (ESM, top-level imports already in use across `src/`). Use Node built-ins only — no new dependency is required for the recovery state machine. `node:crypto.randomUUID()` is acceptable for any new correlation/recovery IDs that must be unique across attempts.
- Build: esbuild bundles `src/index.js` into `dist/index.js`. New recovery modules under `src/services/approval/` and `src/services/workflow/` must remain ESM-compatible (no dynamic `require()`, no CommonJS-only utilities) so the existing bundler configuration is unaffected.
- Testing: project uses `node --test` style via `npm test`. Recovery tests should reuse that runner; do not introduce a parallel test framework. Required verification commands after implementation are `npm run build` and `npm test`.
- Audit transport: `src/audit/logger.js` already supports best-effort client/file/HTTP sinks. Recovery events must reuse `audit.info(...)` / `audit.error(...)`; both swallow sink errors internally — recovery handlers must never await an ack or re-raise audit failures.

### Project Context Reference

- No `project-context.md` exists in this repository. There is no project-wide AI rules document to align against; rely on `architecture.md`, `prd.md`, and the in-tree code conventions exclusively.

### Story Completion Status

- Story 2.5 context analysis is complete. The dev agent has the recovery state machine, recoverable vs non-recoverable classification rules, action-specific recovery options for `branch`, `init`, `commit`, and `push`, gating release conditions, audit event contracts, and the explicit Story 2.4 / Epic 3 boundaries. Recommended next step: run `dev-story` against this file and begin by introducing the recovery-state helper under `src/services/approval/` (or `src/services/workflow/`) that consumes Story 2.4's `{ ok, status, action, code, message, details, audit, next }` envelope, then wire `permission-asked.js` and the tool-execute hooks for recovery prompts, then add regression coverage in `tests/regression.test.js`. Do NOT implement commit creation or push execution here; those remain Epic 3 scope.

### Round 3 Architectural Note: tool-execute Hooks Are Intentionally Not Recovery-Aware

Story Task #5 originally read "Extend `permission-asked.js`, `tool-execute-before.js`, `tool-execute-after.js`, and session-scoped workflow orchestration so recovery prompts can be emitted and resolved without bypassing existing approval/state flow." The round-3 review caught that `tool-execute-before.js` and `tool-execute-after.js` were never modified for Story 2.5.

The architectural decision (confirmed in round 3) is that recovery has two ingress points only:

- **Planning-time gating** — owned by `command-execute-before.js`. Before publishing a fresh approval request, the planning hook calls `readRecoveryGate` + `isActionBlockedByGate`. A `session-git`-scoped gate suppresses all later Git planning; a `git-only` gate suppresses only the same `actionKind`; a `workflow-finalization` gate suppresses commit/push planning specifically.
- **Approval-resolution-time gating** — owned by `permission-asked.js`. After `consumeApprovalOutcome` resolves a `deny`/`ignore-and-continue`, the hook opens a recovery gate, delivers the prompt via `pluginContext.requestRecoveryDecision`, and routes the user's recovery choice back to `selectRecoveryChoice`/`confirmManualResolution`.

The tool-execute hooks (`tool-execute-before.js` / `tool-execute-after.js`) are responsible for phase advancement (`in-progress`) and tool blocking (legacy guard). They have no recovery-relevant decision to make:

- Mutating-tool blocking is owned by the legacy guard; it does not consult workflow state for Git automation.
- Phase advancement to `in-progress` is direction-safe regardless of whether a recovery gate is open.
- The runtime never invokes Git mutations through the tool-execute path as part of automation; Git execution goes through `git-executor.js` after approval succeeds, not through `tool.execute.*`.

Adding a recovery-gate read inside `tool-execute-*.js` would therefore be defensive code with no observable effect — pure noise that violates the "hooks thin" rule from the architecture's Project Structure & Boundaries section. Task #5 has been amended to reflect this decision.

### Project Structure Notes

- Architecture reserves future folders such as `src/services/approval/`, `src/commands/`, and `src/events/`. Story 2.5 should prefer those intended locations when introducing recovery orchestration rather than growing the legacy core or overloading hook files.
- The current repository already demonstrates the preferred layering:
  - `src/index.js` bootstraps
  - `src/hooks/` routes runtime events
  - `src/services/` owns domain logic
  - `src/audit/` owns structured logging
- Continuation semantics belong to Epic 2. Actual final commit/push creation and execution remain Epic 3. Story 2.5 must document that boundary explicitly so the dev agent does not pull finalization logic forward.

### References

- Epic 2 story definition: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5: Offer Recovery Paths Without Failing the Workflow]
- Epic 2 failure/reporting prerequisite: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4: Detect and Report Git Conflicts and Execution Failures]
- Recovery-related functional requirements: [Source: _bmad-output/planning-artifacts/prd.md#Exception Handling & Recovery] (FR19, FR20, FR21, FR22)
- Approval-driven behavior and continuation constraints: [Source: _bmad-output/planning-artifacts/prd.md#Approval-Driven Execution]
- Architecture approval model: [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- Architecture event/command model: [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- Architecture result/error/state contracts: [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns], [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- Architecture project boundaries: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- Session-scoped workflow state store: [Source: src/services/workflow/workflow-state.js]
- Session cleanup hook: [Source: src/hooks/session.js]
- Existing proposal/readiness staging: [Source: src/hooks/command-execute-before.js]
- Existing permission hook boundary: [Source: src/hooks/permission-asked.js]
- Existing audit logger contract: [Source: src/audit/logger.js]
- Existing readiness result model: [Source: src/services/git/check-repository-readiness.js]
- Existing workflow policy/finalization defaults: [Source: src/config/defaults.js]
- Regression baseline: [Source: tests/regression.test.js]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content _bmad/bmm/workflows/4-implementation/create-story/workflow.md`
- `Get-Content _bmad-output/implementation-artifacts/1-4-compute-branch-strategy-and-candidate-branch-names.md`
- `Get-Content _bmad-output/implementation-artifacts/1-5-check-repository-readiness-and-propose-initialization.md`
- `Get-Content _bmad-output/planning-artifacts/epics.md`
- `Get-Content _bmad-output/planning-artifacts/architecture.md`
- `Get-Content _bmad-output/planning-artifacts/prd.md`
- `Get-Content src/services/workflow/workflow-state.js`
- `Get-Content src/hooks/session.js`
- `Get-Content src/hooks/permission-asked.js`
- `Get-Content src/hooks/command-execute-before.js`
- `Get-Content src/audit/logger.js`
- `Get-Content src/services/git/check-repository-readiness.js`
- `Get-Content src/config/defaults.js`
- `Get-Content tests/regression.test.js`
- `git log -5 --oneline`

### Completion Notes List

- Created the Story 2.5 implementation-context document with explicit recovery-path scope boundaries against Story 2.4 and Epic 3 finalization work.
- Defined recoverable vs non-recoverable rules, retry/skip/manual-resolution state transitions, action-specific recovery options, gating release conditions, audit contracts, and test strategy.
- Kept write scope to the single user-authorized file only; no other repository files were modified.
- 2026-05-09: Added Latest Tech Information, Project Context Reference, and Story Completion Status sections; expanded Previous Story Intelligence to consume Story 2.4's failure envelope and reference Stories 2.1–2.3 approval scaffolding under `src/services/approval/`.
- 2026-05-09 (dev-story): Implemented the recovery state vocabulary (`src/services/approval/recovery-state.js`) with the canonical states, blocking scopes, recovery choices, action kinds, and a transition validator that rejects illegal jumps such as `completed → planned`.
- 2026-05-09 (dev-story): Implemented the recovery classifier (`src/services/approval/classify-recovery.js`) consuming Story 2.4's failure envelope as the single source of truth. Approval `deny`/`ignore-and-continue` are recoverable with `continue-without-automation` recommended; `execution-unavailable` and `unknown-git-failure` are non-recoverable; Story 2.4's `recoverable: false` is honored without re-derivation; invariant violations (cross-session, missing kind) are non-recoverable and routed to a controlled-stop path.
- 2026-05-09 (dev-story): Implemented action-specific recovery options for branch/init/commit/push (`src/services/approval/build-recovery-options.js`). Each option carries `choice`, `label`, `instructions`, `nextState`, and `blockingScope`. Init recovery scopes to `session-git`; commit recovery scopes to `workflow-finalization`; branch and push scope to `git-only`. Non-recoverable failures collapse to a single `abandon` option.
- 2026-05-09 (dev-story): Implemented the recovery orchestrator (`src/services/approval/recovery-orchestrator.js`) which opens gates from approval or executor outcomes, persists the gate under `workflowState[sessionID].recoveryGate`, validates user choice transitions, increments the `attempt` counter on retry, supports two-step manual-resolution (`selectRecoveryChoice` + `confirmManualResolution`), and emits the four canonical audit events (`git.action.recovery.offered/selected/completed/blocked`). All audit emission is best-effort; state mutation precedes emission so audit-sink failures cannot leave the gate in an inconsistent state.
- 2026-05-09 (dev-story): Wired `permission-asked.js` to call `openRecoveryFromApproval` after `consumeApprovalOutcome` resolves a `deny` or `ignore-and-continue` outcome. Recovery side-effects are wrapped so a throw never surfaces to the runtime.
- 2026-05-09 (dev-story): Wired `command-execute-before.js` to consult `readRecoveryGate` + `isActionBlockedByGate` before publishing the next approval request. Blocked planning passes emit `git.action.recovery.blocked` instead of issuing a phantom approval prompt.
- 2026-05-09 (dev-story): Extended `workflow-state.js` `get()` with deep-clone protection for `recoveryGate` so callers cannot mutate gate state, options, or history through the returned snapshot. Existing `session.deleted` cleanup in `src/hooks/session.js` already disposes the gate alongside other session state.
- 2026-05-09 (dev-story): Added 12 new regression test functions covering: state-machine vocabulary and transition rules; recoverable/non-recoverable classification across approval and execution paths; action-specific option building; orchestrator gate-open from approval and execution; retry attempt increment; continue-without-automation terminal; manual-resolution two-step + single-shot; gating rules per action kind; invariant violations producing blocked events instead of throws; deep-clone protection + session-cleanup; integration verifying that a denied approval through the wrapper does NOT hard-fail the workflow session.
- 2026-05-09 (dev-story): `npm run build` and `npm test` both pass with the new modules and tests in place. Existing Story 2.1–2.4 regression coverage is unaffected.
- 2026-05-09 (dev-story review-followups): ✅ Resolved review finding [HIGH]: retry path in `selectRecoveryChoice` now calls `clearGate(workflowState, sessionID)` after emitting the selected + completed events, so subsequent `command-execute-before` planning passes see no active gate and republish a fresh approval cycle instead of emitting `git.action.recovery.blocked`. The audit trail (selected + completed events with full history) is preserved.
- 2026-05-09 (dev-story review-followups): ✅ Resolved review finding [MEDIUM]: added `pluginContext.requestRecoveryDecision(gate)` adapter in `src/index.js` mirroring `requestApproval` and a pure prompt builder in `src/services/approval/build-recovery-prompt.js`. `permission-asked.js` now (1) delivers the recovery prompt via the adapter after `openRecoveryFromApproval` returns `outcome: "opened"`, and (2) detects recovery-choice payloads (`retry` / `continue-without-automation` / `manual-resolution` / `abandon`) on incoming `permission.asked` events and dispatches them to `selectRecoveryChoice` or `confirmManualResolution`. Approval and recovery vocabularies are disjoint, so routing is unambiguous. AC1's "options are explained in a way the user can act on immediately" is now satisfied end-to-end.
- 2026-05-09 (dev-story review-followups): ✅ Resolved review finding [LOW]: strengthened `verifySelectRetryIncrementsAttempt` to assert (a) `readRecoveryGate(store, sessionID) === null` after retry, (b) `isActionBlockedByGate(null, "branch").blocked === false`, and (c) a fresh `openRecoveryFromApproval` after retry produces a brand-new gate with a different `gateId`. This is the test gap that originally masked the HIGH finding.
- 2026-05-09 (dev-story review-followups): ✅ Resolved review finding [LOW]: `_openBlockedGate` now returns `{ outcome: "blocked", gate, event }` instead of `"opened"`, disambiguating the non-recoverable controlled-stop path from `_openRecoverableGate`'s `"opened"` (which always denotes a gate still awaiting a user decision). Updated the JSDoc return types on `openRecoveryFromApproval` / `openRecoveryFromExecution` and the two existing regression assertions.
- 2026-05-09 (dev-story review-followups): added 3 new regression tests — `verifyBuildRecoveryPromptContracts` (pure prompt builder shape), `verifyRecoveryPromptDeliveredAfterDeny` (wrapper-level prompt delivery via mock client), and `verifyRecoveryChoiceRoutingThroughPermissionAsked` (end-to-end deny → recovery prompt → retry choice → fresh approval cycle). `npm run build` and `npm test` both pass.
- 2026-05-09 (dev-story review-followups round 2): ✅ Resolved review finding [HIGH]: `_openRecoverableGate` and `_openBlockedGate` now persist `workflow` and `command` onto the gate object at open time, AND `buildEventEnvelope` falls back to `gate.workflow` / `gate.command` when the `workflow` / `command` params are null. As a result, `selected` / `completed` / `blocked` events emitted via the `permission-asked` recovery routing path (which previously sourced workflow/command from the unpersisted gate fields) now carry full attribution. Audit consumers that group/filter by workflow no longer miss Story 2.5's selected/completed/blocked stream.
- 2026-05-09 (dev-story review-followups round 2): ✅ Resolved review finding [MEDIUM]: introduced `buildHookBlockedEvent` exported from `src/services/approval/recovery-orchestrator.js`. `command-execute-before.js` now routes its `git.action.recovery.blocked` emission through this shared helper, which delegates to `buildEventEnvelope`. Both hook-emitted and orchestrator-emitted `git.action.recovery.blocked` events now share the canonical minimum `details` keys: `actionKind`, `actionId`, `failureCode`, `recoverable`, `blockingScope`, `attempt`, `gateId`, `correlationId`, `sessionID`, `source`. The hook still surfaces the planning-pass `actionKind` (which can differ from `gate.actionKind` when a `session-git`-scoped gate blocks unrelated kinds) via `extraDetails`.
- 2026-05-09 (dev-story review-followups round 2): ✅ Resolved review finding [LOW]: appended `git.action.recovery.offered`, `.selected`, `.completed`, `.blocked` to the audit/event registry section of `_bmad-output/planning-artifacts/architecture.md`. `architecture.md` is also added to the File List with a Change Log entry.
- 2026-05-09 (dev-story review-followups round 2): ✅ Resolved review finding [LOW]: `isActionBlockedByGate` now returns `{ blocked: false, reason: "gate-terminal-phase" }` when `gate.continuationPhase === "terminal"`. This is defense in depth on top of the round-1 HIGH fix that clears the gate after retry — even if a future parallel ingress path re-introduces the persist→clear race window, a concurrent reader will treat the gate as released because the orchestrator has already finalised the retry continuation.
- 2026-05-09 (dev-story review-followups round 2): added 3 new regression tests — `verifyRecoveryGatePersistsWorkflowCommandAttribution` (gate persists workflow/command and emits them via fallback when params are null, including the cross-session abandon path), `verifyHookBlockedEventMatchesOrchestratorShape` (hook envelope carries every required `details` key), and `verifyTerminalContinuationPhaseReleasesGate` (defense-in-depth release signal). `npm run build` and `npm test` both pass with all Story 2.5 tests intact.
- 2026-05-09 (dev-story review-followups round 3): ✅ Resolved review finding [MEDIUM]: amended Task #5 to accurately describe that only `permission-asked.js` and `command-execute-before.js` were extended for recovery, and added a "Round 3 Architectural Note" in Dev Notes documenting why `tool-execute-before.js` / `tool-execute-after.js` were intentionally NOT modified (recovery is a planning-time and approval-resolution-time concern; the tool-execute layer has no recovery-relevant gating to perform).
- 2026-05-09 (dev-story review-followups round 3): ✅ Resolved review finding [LOW]: `_openBlockedGate` now initialises `gate.history` with a single `{state: "abandoned", choice: "abandon"}` entry that reflects the gate's actual lifecycle. The previous synthetic `awaitingRecovery` precursor entry would have misled audit consumers reconstructing the timeline from `gate.history`.
- 2026-05-09 (dev-story review-followups round 3): ✅ Resolved review finding [LOW]: lifted `OUTCOME_ALIASES` and `RECOVERY_CHOICE_ALIASES` from `permission-asked.js` into a shared `src/services/approval/permission-asked-aliases.js` module so the recovery-first-routing disjointness invariant is enforceable from a single source of truth. The hook now imports the alias maps from the shared module, and a new regression test (`verifyPermissionAskedAliasDisjointness`) asserts the key sets stay disjoint and confirms the round-3 history-shape fix.
- 2026-05-09 (dev-story review-followups round 3): ✅ Resolved review finding [LOW]: added `sprint-status.yaml` to the Story 2.5 File List so file-list documentation drift across review rounds is closed (mirrors the round-2 architecture.md fix).
- 2026-05-09 (dev-story review-followups round 3): added 1 new regression test — `verifyPermissionAskedAliasDisjointness` (vocabulary disjointness + round-3 history shape). `npm run build` and `npm test` both pass with all Story 2.5 tests intact.

### File List

- `_bmad-output/implementation-artifacts/2-5-offer-recovery-paths-without-failing-the-workflow.md` (modified — story status, completion notes, change log, review follow-up checkboxes [x]; round-3: amended Task #5 wording, added Round 3 Architectural Note explaining why tool-execute hooks are not recovery-aware)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — round-3 LOW fix: track this round's review status update; mirrors round-2 architecture.md File List fix)
- `_bmad-output/planning-artifacts/architecture.md` (modified — round-2 LOW fix: appended four `git.action.recovery.*` events to the structured audit/event registry)
- `src/services/approval/recovery-state.js` (new — state machine vocabulary, transition validator)
- `src/services/approval/classify-recovery.js` (new — recoverable vs non-recoverable classifier)
- `src/services/approval/build-recovery-options.js` (new — action-specific recovery options)
- `src/services/approval/recovery-orchestrator.js` (modified — round-2 HIGH fix: persist workflow/command on the gate at open time and add gate fallback in buildEventEnvelope; round-2 MEDIUM fix: export `buildHookBlockedEvent` shared envelope helper; round-2 LOW fix: `isActionBlockedByGate` honours `continuationPhase === "terminal"` as a release signal; round-3 LOW fix: `_openBlockedGate` initialises `gate.history` with a single `abandoned` entry reflecting the gate's actual lifecycle)
- `src/services/approval/build-recovery-prompt.js` (new — MEDIUM fix: pure prompt builder that turns a recovery gate into the user-facing prompt envelope consumed by `requestRecoveryDecision`)
- `src/services/approval/permission-asked-aliases.js` (new — round-3 LOW fix: shared APPROVAL_OUTCOME_ALIASES + RECOVERY_CHOICE_ALIASES so the recovery-first-routing disjointness invariant is enforceable from a single source of truth)
- `src/services/workflow/workflow-state.js` (modified — added `recoveryGate` field deep-clone on `get()` and documented Story 2.5 storage contract)
- `src/hooks/permission-asked.js` (modified — MEDIUM fix: routes recovery-choice payloads to `selectRecoveryChoice`/`confirmManualResolution`; delivers recovery prompt via `pluginContext.requestRecoveryDecision` after deny/ignore-and-continue; round-3 LOW fix: imports alias maps from the shared `permission-asked-aliases.js` module)
- `src/hooks/command-execute-before.js` (modified — round-2 MEDIUM fix: emits `git.action.recovery.blocked` via the shared `buildHookBlockedEvent` so hook-emitted and orchestrator-emitted blocked events share the canonical minimum `details` keys)
- `src/index.js` (modified — MEDIUM fix: added `pluginContext.requestRecoveryDecision(gate)` adapter mirroring `requestApproval`; passes `pluginContext` into `permission-asked` injections)
- `tests/regression.test.js` (modified — 16 Story 2.5 regression tests including 3 round-2 follow-up tests and 1 round-3 follow-up test: `verifyPermissionAskedAliasDisjointness` covering vocabulary disjointness + round-3 history shape)

### Change Log

- 2026-05-08: Created Story 2.5 implementation context for workflow-safe recovery paths, continuation semantics, and audit/test guardrails.
- 2026-05-09: Aligned Story 2.5 with Story 2.4 failure envelope, declared Stories 2.1–2.3 approval scaffolding already on disk, and added Latest Tech Information, Project Context Reference, and Story Completion Status sections.
- 2026-05-09 (dev-story): Implemented the recovery state machine, classifier, action-specific option builder, and orchestrator under `src/services/approval/`; wired `permission-asked.js` and `command-execute-before.js` to open and honor recovery gates; added Story 2.5 deep-clone protection and field documentation to `workflow-state.js`; expanded `tests/regression.test.js` with 12 new contract + integration tests covering classification, options, orchestrator, gating, invariant violations, isolation, cleanup, and the wrapper-level no-hard-failure-on-deny guarantee. `npm run build` and `npm test` both pass.
- 2026-05-09 (code-review): Adversarial review found 1 HIGH (retry path leaves gate blocking same-action planning), 1 MEDIUM (recovery prompt never delivered to user, AC1 data-only), and 2 LOW (retry test coverage gap, `_openBlockedGate` outcome naming). All four recorded as Review Follow-ups (AI) action items; story status reverted to `in-progress` until follow-ups land.
- 2026-05-09 (dev-story review-followups): Addressed all 4 code-review findings (1 HIGH, 1 MEDIUM, 2 LOW). HIGH: retry path in `selectRecoveryChoice` now clears the gate from the store after the selected + completed events are emitted, restoring the AC1 retry-then-fresh-approval cycle. MEDIUM: introduced `pluginContext.requestRecoveryDecision(gate)` adapter, `src/services/approval/build-recovery-prompt.js` pure builder, and recovery-choice routing in `permission-asked.js` so `retry` / `continue-without-automation` / `manual-resolution` / `abandon` responses dispatch to the orchestrator end-to-end. LOW: strengthened `verifySelectRetryIncrementsAttempt` to assert post-retry `readRecoveryGate` returns null, `isActionBlockedByGate` is unblocked, and a fresh approval-deny re-opens with a new `gateId`. LOW: `_openBlockedGate` now returns `outcome: "blocked"` and JSDoc return types updated. Added 3 review-followup regression tests. `npm run build` and `npm test` both pass.
- 2026-05-09 (code-review round 2): Adversarial code review against the post-followup branch found 1 HIGH (workflow/command attribution lost on `selected`/`completed`/`blocked` events emitted via `permission-asked` because the gate object does not persist workflow/command), 1 MEDIUM (`command-execute-before.js` emits `git.action.recovery.blocked` with a divergent `details` shape from the orchestrator's emission of the same event name), and 2 LOW (architecture.md missing the four new recovery audit events; `isActionBlockedByGate` does not honour `continuationPhase === "terminal"` as a defense-in-depth release signal during the retry persist→clear window). All four recorded as new Review Follow-ups (AI) action items; `npm run build` and `npm test` still pass with the previous fixes; story status reverted to `in-progress` until follow-ups land.
- 2026-05-09 (dev-story review-followups round 2): Addressed all 4 round-2 code-review findings (1 HIGH, 1 MEDIUM, 2 LOW). HIGH: `_openRecoverableGate` and `_openBlockedGate` persist `workflow` and `command` onto the gate at open time, and `buildEventEnvelope` falls back to `gate.workflow` / `gate.command` when params are null, so `selected` / `completed` / `blocked` events emitted via `permission-asked` recovery routing now carry full attribution. MEDIUM: introduced `buildHookBlockedEvent` shared envelope builder exported from `recovery-orchestrator.js`; `command-execute-before.js` routes its `git.action.recovery.blocked` emission through it so the hook and orchestrator emissions share the canonical minimum `details` keys. LOW: appended the four `git.action.recovery.*` events to the structured audit/event registry in `architecture.md` and added the file to the Story 2.5 File List with this Change Log entry. LOW: `isActionBlockedByGate` returns `{ blocked: false, reason: "gate-terminal-phase" }` when `gate.continuationPhase === "terminal"`, defending against future parallel ingress paths that could re-introduce the persist→clear race window. Added 3 round-2 regression tests; `npm run build` and `npm test` both pass.
- 2026-05-09 (code-review round 3): Adversarial code review against the post-round-2 branch found 1 MEDIUM (Task #5 false claim that tool-execute hooks were extended for recovery — they were never modified) and 3 LOW (`_openBlockedGate` history initialised with a synthetic `awaitingRecovery` precursor entry that misleads timeline reconstruction; alias-map disjointness invariant in `permission-asked.js` not asserted anywhere; `sprint-status.yaml` modified by review rounds but never appeared in File List).
- 2026-05-09 (dev-story review-followups round 3): Addressed all 4 round-3 code-review findings (1 MEDIUM, 3 LOW). MEDIUM: amended Task #5 to accurately describe that only `permission-asked.js` and `command-execute-before.js` were extended for recovery, and added a Round 3 Architectural Note in Dev Notes explaining why tool-execute hooks are intentionally NOT recovery-aware. LOW: `_openBlockedGate` now initialises `gate.history` with a single `{state: "abandoned", choice: "abandon"}` entry reflecting the gate's actual lifecycle. LOW: lifted `OUTCOME_ALIASES` + `RECOVERY_CHOICE_ALIASES` into `src/services/approval/permission-asked-aliases.js` and added `verifyPermissionAskedAliasDisjointness` to assert the disjointness invariant + round-3 history shape. LOW: added `sprint-status.yaml` to the File List. `npm run build` and `npm test` both pass with 16 Story 2.5 regression tests intact.
