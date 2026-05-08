# Story 2.4: Detect and Report Git Conflicts and Execution Failures

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want Git conflicts and execution failures to be detected and reported clearly,
so that I understand what failed, why it failed, and what needs attention without losing workflow traceability.

## Acceptance Criteria

1. **Given** a planned or approved Git action encounters a branch conflict, commit failure, push rejection, or repository state mismatch
   **When** the plugin evaluates or executes that action
   **Then** it detects the failure condition and classifies it consistently
   **And** it reports a clear explanation of the failure cause to the user.
2. **Given** audit logging is enabled
   **When** a Git execution failure is detected
   **Then** the plugin records the failed action result in a traceable way
   **And** audit logging failure itself does not interrupt the user workflow.

## Tasks / Subtasks

- [x] Define a Git execution failure classification contract in `src/services/git/` (AC: 1, 2)
  - [x] Create `src/services/git/classify-git-execution-failure.js` and export `classifyGitExecutionFailure({ action, error, repositorySnapshot, expectedState, workflowContext })`.
  - [x] Restrict canonical failure codes to `branch-conflict`, `branch-switch-mismatch`, `commit-failure`, `push-rejection`, `repository-state-mismatch`, `execution-unavailable`, and `unknown-git-failure`.
  - [x] Keep human-readable messages separate from machine-readable metadata.
  - [x] Do not pass raw stderr/stdout through the stack unchanged; normalize only the summary fields needed for explanation and audit.

- [x] Standardize a Git executor result envelope for future mutating execution paths (AC: 1, 2)
  - [x] Treat `src/services/git/git-executor.js` as the single normalization point for execution results.
  - [x] Design `executeGitAction({ plan, approval, repositorySnapshot, workflowContext })` to return `{ ok, status, action, code, message, details, audit, next }`.
  - [x] Normalize subprocess exceptions, git exit codes, stdout/stderr summaries, and preflight mismatches into the same envelope shape.
  - [x] Require `commit-service.js`, `push-service.js`, and future branch execution helpers to surface only executor envelopes instead of ad hoc errors.

- [x] Define a concrete failure taxonomy by Git action category (AC: 1)
  - [x] Branch failures:
    - `branch-conflict`: target branch already exists when create was expected, or checkout/switch fails because of conflicts.
    - `branch-switch-mismatch`: post-execution branch state does not match the approved target branch, including detached HEAD or HEAD drift.
  - [x] Commit failures:
    - `commit-failure`: nothing staged, invalid commit input, pre-commit or commit hook rejection, unresolved merge state, or non-zero `git commit` exit.
  - [x] Push failures:
    - `push-rejection`: non-fast-forward, remote rejection, missing upstream, auth failure, permission denial, or protected branch rejection.
  - [x] Repository state failures:
    - `repository-state-mismatch`: the observed repository state no longer matches the expected preconditions captured at plan or approval time.
  - [x] Execution environment failures:
    - `execution-unavailable`: git missing, timeout, cwd unavailable, subprocess spawn failure, or equivalent execution-layer unavailability.
    - `unknown-git-failure`: any failure that cannot be safely mapped to the standard taxonomy.

- [x] Define detection boundaries and surfacing boundaries (AC: 1, 2)
  - [x] Keep approval logic responsible only for allow, deny, ask, and skip decisions.
  - [x] Perform execution failure detection and classification only inside `src/services/git/`.
  - [x] Make `git-executor.js` responsible for preflight state validation, subprocess execution, and post-condition verification.
  - [x] Keep `commit-service.js`, `push-service.js`, and branch execution helpers limited to action intent assembly and executor invocation.
  - [x] Prevent hooks and legacy policy code from parsing raw git stderr directly; they should surface normalized envelopes only.

- [x] Separate human-readable explanations from machine-readable failure codes (AC: 1)
  - [x] Store the stable failure code in top-level `code`.
  - [x] Store the user-facing explanation in top-level `message`.
  - [x] Build messages from action kind, current branch, target branch, remote name, and mismatch summary without leaking sensitive details.
  - [x] Preserve structured hints such as `recoverable` and `suggestedRecoveryKind` for Story 2.5, but do not generate recovery choices in this story.

- [x] Define structured audit event payloads and best-effort logging behavior (AC: 2)
  - [x] Standardize on `git.action.executed` with `outcome: "failed"` rather than inventing multiple failure-only event names.
  - [x] Include action, code, phase, workflow, session, correlation ID, and summarized stderr kind in the event payload.
  - [x] If audit logging fails, keep the main execution envelope intact and record only `audit.logged: false` plus minimal logging error metadata.
  - [x] Ensure audit logging failure never blocks workflow continuation or masks the primary Git failure cause.

- [x] Extend workflow state with execution failure context (AC: 1, 2)
  - [x] Allow `workflow-state.js` to store `lastGitAction`, `lastGitResult`, `lastGitFailure`, and `pendingRecoveryContext`.
  - [x] Persist the normalized envelope into workflow state from the actual Git execution integration point.
  - [x] Preserve the distinction between approval success and execution success by modeling `approved-but-failed` implicitly through separate approval and result fields.

- [x] Add regression and integration coverage for execution failures (AC: 1, 2)
  - [x] Add representative fixtures for branch conflict, branch switch mismatch, commit failure, push rejection, and repository drift.
  - [x] Verify canonical code mapping, result envelope shape, and message generation.
  - [x] Verify that audit logger failures do not interrupt the workflow.
  - [x] Verify that repository state mismatches short-circuit execution before additional mutating commands run.

## Dev Notes

### Story Intent

This story is the first execution-failure contract story in Epic 2. Earlier stories establish detection, planning, repository readiness, and approval-oriented state. Story 2.4 begins after an action has been planned or approved and focuses on one problem only: when a mutating Git action fails, the plugin must detect the failure, classify it consistently, explain it clearly, and preserve traceable audit metadata without breaking workflow continuity. Recovery choices, retry options, and user decision trees belong to Story 2.5 and should not be implemented here.

### Verified Baseline Findings

- The current codebase includes planning and readiness helpers in `src/services/git/`, but there is no standardized mutating Git executor yet.
- `src/hooks/command-execute-before.js` already establishes a best-effort audit pattern and stores planning and readiness context in `workflowState`.
- `src/services/workflow/workflow-state.js` is a session-scoped in-memory store with shallow-copy semantics (and `structuredClone` for nested approval fields) and is suitable for lightweight execution result tracking.
- `src/audit/logger.js` already implements best-effort behavior for client, file, and HTTP logging. That behavior must remain intact. The exposed surface is `audit.info(message, extra)` and `audit.error(message, extra)`; both swallow sink errors internally and never throw to the caller — Story 2.4 must not assume a third event helper or a returned ack.
- The architecture requires approval-governed Git control, structured audit events, and explicit stateful operation flow. Story 2.4 must follow those constraints and avoid ad hoc error handling.
- Story 2.3 is implemented and ships approval decision capture under `src/services/approval/` (see `_bmad-output/implementation-artifacts/2-3-support-accept-deny-and-ignore-and-continue-outcomes.md`). Story 2.5 is explicitly responsible for recovery path presentation. Story 2.4 sits between them as the execution-failure normalization layer.

### Partial Scaffolding Already On Disk

Some Story 2.4 contract surfaces are partially scaffolded in the working tree (uncommitted) and the dev agent should EXTEND them rather than recreate them:

- `src/services/git/classify-git-execution-failure.js` already exports `classifyGitExecutionFailure(...)` and a frozen `FAILURE_CODES` map covering all seven canonical codes listed below. It implements the preflight-drift / execution-unavailable / action-kind detection order, summarized stderr/stdout (no raw passthrough), and emits `recoverable` plus `suggestedRecoveryKind` hints. Treat its public signature as the contract; only widen it if a missing case is found.
- `src/services/approval/` exists with Story 2.1–2.3 helpers (`approval-policy-service.js`, `approval-resolution-state.js`, `build-approval-explanation.js`, `build-approval-request.js`, `build-approval-resolution.js`, `classify-git-action.js`, `consume-approval-outcome.js`, `redact-approval-fields.js`). The Story 2.4 executor result envelope must integrate through that layer rather than re-implementing approval/decision parsing.
- `src/hooks/command-execute-before.js`, `src/hooks/permission-asked.js`, `src/index.js`, `src/services/workflow/workflow-state.js`, and `tests/regression.test.js` carry uncommitted in-flight changes from Stories 2.1–2.3. Re-read them before editing to avoid clobbering approval state plumbing already in place.
- `src/services/git/git-executor.js`, `src/services/git/commit-service.js`, and `src/services/git/push-service.js` do NOT exist yet. They are part of Story 2.4's expected work; the architecture target file structure references them as future additions, not current files.

### Failure Taxonomy

#### Canonical Failure Codes

- `branch-conflict`
  - Target branch already exists when create was expected.
  - Checkout or switch fails because the working tree conflicts with the target branch transition.
- `branch-switch-mismatch`
  - The approved target branch does not match the observed branch after execution.
  - Detached HEAD or HEAD drift produces an invalid post-condition even if the command exited successfully.
- `commit-failure`
  - `git commit` exits non-zero.
  - No staged changes exist.
  - Hooks reject the commit.
  - Merge state or index state prevents commit completion.
- `push-rejection`
  - Non-fast-forward push rejection.
  - Missing upstream configuration.
  - Auth or permission rejection.
  - Protected branch or server-side hook rejection.
- `repository-state-mismatch`
  - The repository state observed at execution time no longer matches the expected branch, HEAD, staged changes, or working tree conditions captured earlier.
- `execution-unavailable`
  - Git binary not found.
  - Subprocess spawn failure.
  - Timeout.
  - Working directory unavailable.
- `unknown-git-failure`
  - Any execution failure that cannot be safely classified into the known taxonomy.

#### Taxonomy Rules

- Every execution failure must map to exactly one canonical code.
- Post-condition failure counts as failure even when the raw git process exits successfully.
- `repository-state-mismatch` should win before mutating execution when drift is detected during preflight validation.
- Recoverability is metadata, not the failure code itself.

### Error / Result Envelope Shape

#### Standard Envelope

```js
{
  ok: false,
  status: "failed", // planned | awaiting-approval | executing | succeeded | failed | skipped
  action: {
    kind: "branch" | "commit" | "push" | "init" | "finalize",
    operation: "create" | "switch" | "commit" | "push" | "git-init" | "finalize",
    correlationId: "<session-scoped-or-generated-id>",
  },
  code: "push-rejection",
  message: "The remote rejected the push for the current branch. The remote history may be ahead of the local branch.",
  details: {
    exitCode: 1,
    signal: null,
    stderrSummary: "non-fast-forward",
    stdoutSummary: null,
    branch: "feat/ABC-123-example",
    targetBranch: "feat/ABC-123-example",
    remoteName: "origin",
    expectedState: {
      headBranch: "feat/ABC-123-example",
      repositoryReady: true,
    },
    observedState: {
      headBranch: "feat/ABC-123-example",
      hasRemote: true,
    },
    recoverable: true,
    suggestedRecoveryKind: "retry-after-sync",
  },
  audit: {
    attempted: true,
    logged: true,
    loggingError: null,
  },
  next: {
    continueWorkflow: true,
    requiresRecoveryChoice: true,
  },
}
```

#### Envelope Rules

- `message` is the human-facing explanation.
- `code` is the stable machine-facing discriminator.
- `details` is structured metadata for audits, tests, and later recovery logic.
- `next.requiresRecoveryChoice` is a hint for Story 2.5, not a recovery implementation in this story.
- Expected Git failures should return envelopes, not throws.

### Human-Readable Message vs Machine-Readable Code

- Codes must remain short, stable, and enum-like.
  - Example: `push-rejection`
  - Example: `repository-state-mismatch`
- Messages must describe the failure in plain language.
  - Example: `The commit was approved, but no staged changes were available to create a commit.`
  - Example: `The repository changed after approval, so the planned Git action can no longer run safely.`
- Tests should primarily lock the code and required metadata, not exact full message wording.

### Audit Event Shape and Best-Effort Logging Rules

#### Recommended Audit Event

```js
{
  event: "git.action.executed",
  timestamp: "<ISO-8601>",
  workflow: "<workflow-command>",
  command: "<workflow-command>",
  outcome: "failed",
  details: {
    sessionID: "<session-id>",
    phase: "end",
    actionKind: "push",
    operation: "push",
    code: "push-rejection",
    branch: "feat/ABC-123-example",
    targetBranch: "feat/ABC-123-example",
    remoteName: "origin",
    recoverable: true,
    stderrSummary: "non-fast-forward",
    correlationId: "<id>"
  }
}
```

#### Best-Effort Rules

- Audit logging is a secondary concern.
- `audit.info(...)` and `audit.error(...)` must remain swallow-on-failure.
- Audit failure must not overwrite the primary Git failure cause.
- The execution envelope should report whether audit logging succeeded through `audit.logged`.
- Avoid full stderr dumps, remote URLs, credentials, or other sensitive data in structured audit payloads.

### Detection Boundaries: Where to Detect and Where to Surface

#### Detection Layer

- `src/services/git/git-executor.js`
  - Preflight repository snapshot validation
  - Subprocess execution
  - Exit status and stdout/stderr normalization
  - Post-condition verification
  - Failure classification
- `src/services/git/commit-service.js`
  - Commit intent assembly
  - Expected state definition
  - Executor invocation only
- `src/services/git/push-service.js`
  - Push intent assembly
  - Expected state definition
  - Executor invocation only
- Future branch execution helper
  - Branch create or switch intent assembly
  - Executor invocation only

#### Surface Layer

- Approval resolution layer
  - Connect approved actions to execution results
  - Preserve the difference between approval success and execution success
- Workflow state
  - Store last action, last result, last failure, and pending recovery context
- Hooks or runtime integration points
  - Surface normalized `message` values to users or higher layers
  - Never parse raw git stderr directly
- Audit logger
  - Record structured events only

### Workflow State Guidance

Recommended shape:

```js
{
  sessionID,
  phase,
  readiness,
  branchProposal,
  approvalDecision,
  lastGitAction: {
    kind: "push",
    operation: "push",
    correlationId: "<id>",
    approvedAt: "<ISO-8601>",
  },
  lastGitResult: {
    status: "failed",
    code: "push-rejection",
    message: "...",
  },
  lastGitFailure: {
    code: "push-rejection",
    recoverable: true,
    expectedState: { ... },
    observedState: { ... },
  },
  pendingRecoveryContext: {
    source: "git-action-failure",
    correlationId: "<id>",
  },
}
```

Guiding rules:

- Do not overwrite approval decisions with execution outcomes.
- Approval success does not imply execution success.
- `pendingRecoveryContext` is only preparation data for Story 2.5.

### Story 2.5 Boundary

Story 2.4 must do the following:

- Detect failures
- Classify failures
- Explain failures
- Record audit traces
- Persist normalized execution results

Story 2.5 must do the following:

- Offer retry, skip, or manual-fix continuation choices
- Present recovery options to the user
- Apply recovery decisions
- Drive post-failure workflow orchestration

Story 2.4 answers `what failed and why`. Story 2.5 answers `what should happen next`.

### Technical Requirements

- Expected Git failures must return normalized envelopes rather than throw.
- Failure classification should stay in pure or near-pure helpers separate from subprocess logic.
- Reuse the `run-git-command.js` style where practical, but keep mutating execution helpers clearly separate from read-only readiness helpers.
- Snapshot comparison should cover at least branch identity, HEAD identity, remote presence, staged changes, and working tree assumptions.
- Message generation should remain deterministic enough for test coverage but flexible enough to avoid brittle exact-message coupling.
- `recoverable` and `suggestedRecoveryKind` are hints only. They are not user-facing recovery workflows in this story.

### Architecture Compliance

- Keep hooks thin and orchestration-only.
- Keep execution and classification logic in `src/services/git/`.
- Keep approval decisions in approval-layer code, not in executor code.
- Keep audit output routed through `src/audit/logger.js`.
- Update regression and contract coverage whenever new failure codes or envelope fields are introduced.

### Library / Framework Requirements

- No new npm dependency is required.
- Use Node.js built-ins only where needed, such as `child_process`, `path`, and optionally `crypto` for correlation IDs.
- Avoid tight coupling to exact Git stderr wording. Prefer classification from a combination of action type, exit status, snapshot checks, and coarse stderr summaries.
- Preserve the current esbuild ESM Node 22 build model.

### File Structure Requirements

- New expected files:
  - `src/services/git/git-executor.js`
  - `src/services/git/classify-git-execution-failure.js`
- Expected integration updates:
  - `src/services/git/commit-service.js`
  - `src/services/git/push-service.js`
  - Future branch execution helper or `git-workflow-service.js`
  - Approval resolution layer
  - `src/services/workflow/workflow-state.js`
  - Actual Git execution integration point in the runtime flow
- Guardrails:
  - Do not add raw Git failure parsing to hooks.
  - Do not push this logic back into legacy policy code.

### Testing Requirements

- Required verification commands after implementation:
  - `npm run build`
  - `npm test`
- Regression coverage
  - Approved branch create meets `already exists` failure and maps to `branch-conflict`.
  - Approved branch switch exits but lands on the wrong branch and maps to `branch-switch-mismatch`.
  - Commit exits with `nothing to commit` and maps to `commit-failure`.
  - Push exits with non-fast-forward and maps to `push-rejection`.
  - Preflight snapshot drift maps to `repository-state-mismatch` before mutating execution proceeds.
  - Timeout or subprocess spawn failure maps to `execution-unavailable`.
- Audit resilience coverage
  - When `audit.info` is internally swallowed because the underlying client/file/HTTP sink fails, the result envelope still returns the same failure code and message (per `src/audit/logger.js` best-effort contract).
  - `audit.logged` becomes `false` and the workflow continues.
- Integration coverage
  - Approval accepted, execution fails, workflow state stores both approval and failure.
  - Recovery context is preserved for Story 2.5 consumption.
  - Non-workflow or legacy-only paths remain unaffected.
- Contract coverage
  - Canonical failure code snapshot.
  - Result envelope required fields snapshot.
  - Audit event payload required fields snapshot.
  - Verify that `classifyGitExecutionFailure` from `src/services/git/classify-git-execution-failure.js` keeps its current public signature and `FAILURE_CODES` set; only extend, do not narrow.

### Previous Story Intelligence

- Story 2.3 implementation artifact `_bmad-output/implementation-artifacts/2-3-support-accept-deny-and-ignore-and-continue-outcomes.md` is present and shipped; it provides the approval-resolution outcome envelope (`accept`, `deny`, `ignore-and-continue`) and the `lastContinuationDecision` workflow-state field. Story 2.4 must consume those outcomes as input state and must not redefine approval semantics or rename the resolution shape.
- Story 1.4 (`1-4-compute-branch-strategy-and-candidate-branch-names.md`) established proposal-first branch behavior and the `{ outcome, reason, message, details }` envelope. Story 2.4 must reuse the same envelope vocabulary on the result side.
- Story 1.5 (`1-5-check-repository-readiness-and-propose-initialization.md`) established readiness results (`allow` / `ask` / `skip`) and the `readiness` / `initProposal` workflow-state slots. Story 2.4 must read those rather than recompute repository state from scratch when assembling `expectedState`.
- Stories 2.1 and 2.2 (`2-1-...md`, `2-2-...md`) established approval-request construction, redaction, and explanation fields under `src/services/approval/`. Story 2.4 must surface failure messages without leaking any field those stories already redact.
- Branch proposals and init proposals are both pre-execution artifacts. Story 2.4 starts only after execution becomes relevant.

### Git Intelligence Summary

- Recent commits (verified via `git log -10 --oneline` on `epic2/stories`):
  - `f5ddbc6` Merge branch `epic1/stories` into `master`
  - `edbac78` Merge branch `epic1/story1-5` into `epic1/stories`
  - `a3a1e40` Finish story 1-5 repository readiness review
  - `29e0035` Merge branch `epic1/story1-4` into `epic1/stories`
  - `30e317b` Finish story 1-4 branch strategy review
- Epic 2 stories 2.1 / 2.2 / 2.3 land in working-tree changes only (uncommitted on this branch), not in committed history yet. The repository currently has Epic 1 planning and readiness behavior committed and Epic 2 approval flow in progress, but no normalized mutating execution failure layer in either committed or uncommitted state.
- Story 2.4 should be treated as the baseline contract story that enables later recovery work. The dev agent should not assume an existing executor; only the classifier helper exists.

### Latest Tech Information

- Runtime: Node.js 22 (ESM, top-level imports already in use across `src/`). Use built-in `node:child_process` for git subprocesses, `node:path`, and optionally `node:crypto.randomUUID()` for `correlationId` generation. Do NOT add a new dependency for UUID, retry, or process management.
- Build: esbuild bundles `src/index.js` into `dist/index.js`. Story 2.4 must keep new modules ESM-import-compatible with the existing bundling configuration; no dynamic `require()`, no CommonJS-only utilities.
- Testing: `node --test` style is the project convention via `npm test`. Failures from `child_process.spawn` surface as errors with `code: "ENOENT"` (git missing) or `killed: true, signal: "SIGTERM"` (timeout) — the existing classifier already encodes those signals; reuse them rather than introducing new ones.

### Project Context Reference

- No `project-context.md` exists in this repository. There is no project-wide AI rules document to align against; rely on `architecture.md`, `prd.md`, and the in-tree code conventions exclusively.

### Story Completion Status

- Story 2.4 context analysis is complete. The dev agent has the canonical failure taxonomy, executor result envelope, audit event shape, detection/surface boundaries, partial-scaffolding inventory, testing matrix, and the Story 2.5 boundary. Recommended next step: run `dev-story` against this file and begin by introducing `src/services/git/git-executor.js`, then wire `commit-service.js` and `push-service.js` through it, then integrate envelope persistence into `workflow-state.js`. Do NOT extend `classify-git-execution-failure.js` to generate recovery choices.

### Project Structure Notes

- The repository currently implements only part of the architecture target structure.
- `src/services/git/` contains planning and readiness helpers, but not executor, commit, push, or finalization execution logic.
- This document is intentionally explicit so the implementation does not drift into ad hoc error handling when those files are introduced.
- In-memory workflow state plus structured audit events are sufficient for this story. No persistence layer expansion is required.

### References

- Epic 2 story definitions: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4: Detect and Report Git Conflicts and Execution Failures]
- PRD failure-notification requirements: [Source: _bmad-output/planning-artifacts/prd.md#Exception Handling & Recovery] (FR19, FR20; FR21 and FR22 belong to Story 2.5)
- Architecture service boundaries and event patterns: [Source: _bmad-output/planning-artifacts/architecture.md]
- Current command hook baseline: [Source: src/hooks/command-execute-before.js]
- Current permission hook baseline: [Source: src/hooks/permission-asked.js]
- Current workflow state baseline: [Source: src/services/workflow/workflow-state.js]
- Current audit logger contract: [Source: src/audit/logger.js]
- Current readiness baseline: [Source: src/services/git/check-repository-readiness.js]
- Current branch planning baseline: [Source: src/services/git/branch-service.js]
- Story 2.4 classifier scaffold (already on disk): [Source: src/services/git/classify-git-execution-failure.js]
- Approval service layer: [Source: src/services/approval/approval-policy-service.js], [Source: src/services/approval/approval-resolution-state.js], [Source: src/services/approval/build-approval-resolution.js], [Source: src/services/approval/consume-approval-outcome.js]
- Regression baseline: [Source: tests/regression.test.js]
- Prior story context: [Source: _bmad-output/implementation-artifacts/1-4-compute-branch-strategy-and-candidate-branch-names.md], [Source: _bmad-output/implementation-artifacts/1-5-check-repository-readiness-and-propose-initialization.md], [Source: _bmad-output/implementation-artifacts/2-1-present-approval-requests-for-planned-git-actions.md], [Source: _bmad-output/implementation-artifacts/2-2-explain-intent-and-expected-impact-in-approval-prompts.md], [Source: _bmad-output/implementation-artifacts/2-3-support-accept-deny-and-ignore-and-continue-outcomes.md]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Select-String -Path _bmad-output\\planning-artifacts\\epics.ko.md -Pattern 'Story 2.4|2.4|Epic 2' -Context 3,20`
- `Select-String -Path _bmad-output\\planning-artifacts\\architecture.md -Pattern 'git-executor|commit-service|push-service|approval|audit|workflow state|repository state|push rejection|commit failure|branch conflict' -Context 3,12`
- `Get-Content -Raw src/hooks/command-execute-before.js`
- `Get-Content -Raw src/services/workflow/workflow-state.js`
- `Get-Content -Raw src/audit/logger.js`

### Completion Notes List

- Fixed the scope on detection, classification, explanation, and audit traceability only.
- Defined a concrete failure taxonomy and canonical failure codes.
- Defined a standardized execution result envelope and audit event shape.
- Made the human-readable versus machine-readable split explicit.
- Preserved best-effort audit logging as a non-blocking rule.
- Drew a hard boundary between Story 2.4 and Story 2.5 recovery behavior.
- 2026-05-09: Reconciled previous-story intelligence with Story 2.3 artifact now on disk; added partial-scaffolding inventory for `classify-git-execution-failure.js` and `src/services/approval/`; added latest tech information, project context reference, story completion status, and explicit `npm run build`/`npm test` verification commands; refreshed git intelligence summary against current `git log -10` output.
- 2026-05-09: Implemented executor + commit/push services on top of the partial classifier scaffold. `src/services/git/git-executor.js` now owns preflight drift detection, subprocess delegation, post-condition verification, classifier routing, structured audit emission (best-effort), and workflow-state envelope persistence. `commit-service.js` and `push-service.js` are intentionally thin: `buildCommitAction` / `buildPushAction` produce action plans, and `executeCommit` / `executePush` only delegate to the executor — no subprocess plumbing, no stderr parsing, no approval semantics.
- 2026-05-09: Refined the classifier so that `repository-state-mismatch` requires an explicit `preflightDrift: true` signal. Generic `expectedState` ↔ `observedState` disagreement now falls through to the action-kind taxonomy, which makes `branch-switch-mismatch` reachable for branch post-condition failures (matching the documented taxonomy). Updated the regression test that previously locked the wrong behavior in.
- 2026-05-09: Extended `workflow-state.js` to deep-clone `lastGitAction`, `lastGitResult`, `lastGitFailure`, and `pendingRecoveryContext` on `get()`, mirroring the Story 2.1+ approval-isolation guarantee. The executor now persists the envelope into these slots from a single integration point, and a successful execution clears the prior `lastGitFailure` / `pendingRecoveryContext` while keeping `lastGitAction` and `lastGitResult` for traceability.
- 2026-05-09: Added Story 2.4 regression coverage in `tests/regression.test.js` for canonical code mapping (all seven codes), envelope shape, preflight short-circuit, subprocess failure routing, post-condition mismatch, structured audit payload + best-effort behavior, workflow-state mirror with deep-clone isolation, and commit/push service envelope contracts. `npm run build` and `npm test` pass clean (EXIT=0). The `[devai-aidd-guard] plugin bootstrap failed: A valid plugin directory is required.` line printed at the end is the existing bootstrap-shape verification fixture from Story 1.x — not a Story 2.4 regression.
- 2026-05-09: Code-review pass — addressed MEDIUM finding by removing dead `snapshotsAgree` helper from `src/services/git/classify-git-execution-failure.js`; the only live snapshot-agreement check now lives in `src/services/git/git-executor.js` so the two implementations cannot drift apart. `npm run build` and `npm test` re-run clean.

### File List

- `_bmad-output/implementation-artifacts/2-4-detect-and-report-git-conflicts-and-execution-failures.md` (status + tasks + dev agent record updates)
- `src/services/git/classify-git-execution-failure.js` (refined detection-order so `repository-state-mismatch` requires explicit `preflightDrift: true`; updated header docs)
- `src/services/git/git-executor.js` (new — `executeGitAction` envelope contract, preflight + subprocess delegation + post-condition verification + best-effort audit + workflow-state mirror)
- `src/services/git/commit-service.js` (new — `buildCommitAction` / `executeCommit`, executor-delegating only)
- `src/services/git/push-service.js` (new — `buildPushAction` / `executePush`, executor-delegating only)
- `src/services/workflow/workflow-state.js` (added deep-clone isolation for `lastGitAction`, `lastGitResult`, `lastGitFailure`, `pendingRecoveryContext`; documented Story 2.4 fields)
- `tests/regression.test.js` (Story 2.4 regression suite: classifier contract, executor envelope shape, preflight short-circuit, subprocess failure routing, post-condition mismatch, audit payload + best-effort, workflow-state mirror isolation, commit/push service envelopes)

### Change Log

- 2026-05-08: Created Story 2.4 implementation context document.
- 2026-05-09: Aligned story with Story 2.3 artifact on disk, declared partial scaffolding (`src/services/git/classify-git-execution-failure.js`, `src/services/approval/`), added latest tech information, project context reference, story completion status, refreshed git intelligence summary, and pinned testing verification commands.
- 2026-05-09: Implemented Story 2.4 executor + commit/push services + workflow-state mirror; refined classifier detection order so `repository-state-mismatch` requires explicit preflight assertion and `branch-switch-mismatch` is reachable; added regression coverage; status moved ready-for-dev → review.
- 2026-05-09: Code review (MEDIUM fix) — removed dead `snapshotsAgree` helper from `classify-git-execution-failure.js`; status moved review → done.

Changed file path: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\2-4-detect-and-report-git-conflicts-and-execution-failures.md`
