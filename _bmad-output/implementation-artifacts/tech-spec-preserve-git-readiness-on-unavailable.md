---
title: 'Preserve Git Readiness on Unavailable Checks'
slug: 'preserve-git-readiness-on-unavailable'
created: '2026-05-13'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4, 11, 12]
tech_stack: ['Node.js ES modules', 'opencode plugin hooks', 'synchronous git readiness probes', 'node:assert tests', 'e2e scenario tests']
files_to_modify: ['src/services/git/check-repository-readiness.js', 'src/services/git/startup-chain-planner.js', 'src/hooks/command-execute-before.js', 'src/services/git/startup-chain-executor.js', 'src/services/git/execute-approved-action.js', 'src/services/workflow/workflow-state.js', 'tests/unit/build-startup-chain-question-instruction.test.js', 'tests/regression.test.js', 'tests/e2e/scenario-init-chain.test.js']
code_patterns: ['readiness objects use outcome/reason/details contract', 'workflowState is session-scoped and updated by shallow merge', 'startup-chain planning is pure and driven by readiness + state', 'git diagnostics are best-effort and must not block workflow execution']
test_patterns: ['unit tests are standalone node scripts with node:assert/strict', 'regression.test.js contains named async verifier functions', 'e2e tests bootstrap plugin handlers against temporary workspaces']
---

# Tech-Spec: Preserve Git Readiness on Unavailable Checks

**Created:** 2026-05-13

## Overview

### Problem Statement

`checkRepositoryReadiness()` returns `outcome: "skip"` and `reason: "readiness-check-unavailable"` when a git probe times out or fails unexpectedly. The unavailable result currently reuses `createBaseDetails()`, so `details.isGitRepository === false` and `details.hasCommit === false` are persisted into `workflowState.readiness`.

`startup-chain-planner.js` then interprets those fallback booleans as real repository state. Its current init condition is effectively `!isGitRepository || reason === "git-not-initialized"`, and its baseline condition is `!hasCommit`. After a transient `ETIMEDOUT` / `spawnSync git ETIMEDOUT`, the planner can regenerate `["init", "baseline", "branch"]` even for a repository where `git init`, baseline commit, and branch state were already known good in the same session.

### Solution

Treat `readiness-check-unavailable` as a diagnostic event, not as a repository state transition. Startup init must only be planned for the explicit `ask/git-not-initialized` readiness contract. For that real non-git state, preserve the existing startup-chain UX and ask `init`, `baseline`, and `branch` together when policy requires the downstream steps. For unavailable readiness, create no startup steps from fallback `isGitRepository:false` / `hasCommit:false` details. When a new readiness check is unavailable, preserve the previous known-good readiness in `workflowState.readiness` and store unavailable diagnostics separately in `workflowState.latestReadinessError`.

Follow-up finding from the 2026-05-13 debug log: preserving `workflowState.readiness` is not enough if branch planning ignores the preserved branch. After startup-chain init/baseline/branch succeeds, a later `readiness-check-unavailable` can still cause `/bmad-quick-dev` re-entry to publish a separate `Create Branch` approval. The hook recomputes `currentBranch` from `input.currentBranch`, `input.branch`, or `pluginContext.resolveCurrentBranch()`, but native `command.executed` events often provide none of those. In that case `currentBranch` becomes `null`, `buildBranchProposal()` treats the action as `branch/create` with `reason:"no-current-branch"`, and `publishNextPlannedAction()` asks the user again even though preserved readiness already contains `details.branch:"feat/no-ticket-bmad-quick-dev"`. Branch planning must use preserved `readiness.details.branch` as the fallback current branch before generating a new proposal.

### Scope

**In Scope:**

- Change startup-chain planning so `init` is created only when `readiness.outcome === "ask" && readiness.reason === "git-not-initialized"`.
- Change startup-chain planning so `baseline` and `branch` are created for either a real `git-not-initialized` startup chain or a known initialized repository, but never from `readiness-check-unavailable` fallback booleans.
- Add a readiness state preservation policy that prevents `readiness-check-unavailable` from overwriting prior `repository-ready` or otherwise known-good readiness.
- Update branch planning so `currentBranch` falls back to preserved `readiness.details.branch` when native command input does not include a branch and no resolver is configured.
- Preserve existing diagnostic logging fields: `failedProbe`, `failedProbeDurationMs`, `probeTrace`, `errorCode`, `errorName`, `errorStatus`, `errorSignal`, `errorMessage`, `stderrSummary`.
- Add unit and regression coverage for unavailable readiness after successful init and for re-entry after successful branch creation. Existing e2e startup-chain happy paths remain unchanged.

**Out of Scope:**

- Increasing git probe timeout values is not required for this change.
- Fully eliminating the root cause of git probe timeouts is outside this spec.
- Large refactors of git init, baseline commit, branch execution, approval routing, or startup-chain answer parsing are outside this spec.

## Context for Development

### Codebase Patterns

- `src/services/git/check-repository-readiness.js` is the canonical readiness probe. It returns structured readiness objects and intentionally catches probe failures into `readiness-check-unavailable`.
- `src/hooks/command-execute-before.js` orchestrates workflow detection, readiness checking, startup-chain planning, direct init/baseline proposal setup, branch planning, and audit/debug logging.
- `src/services/git/startup-chain-planner.js` is a pure planner. It must not infer repository initialization from fallback booleans on unavailable diagnostics.
- `src/services/git/startup-chain-executor.js` refreshes readiness after init, baseline, and branch startup-chain steps and writes the refreshed value back to `workflowState`.
- `src/services/git/execute-approved-action.js` refreshes readiness after approved init and branch actions and writes the refreshed value back to `workflowState`.
- `src/services/workflow/workflow-state.js` deep-clones selected state fields. Any new nested state field such as `latestReadinessError` should be cloned like `readinessGate` and startup-chain fields.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/services/git/check-repository-readiness.js` | Emits `repository-ready`, `git-not-initialized`, `readiness-gate-skipped`, and `readiness-check-unavailable` readiness objects. |
| `src/services/git/startup-chain-planner.js` | Builds init/baseline/branch startup-chain steps from readiness and policy. Main bug trigger is here. |
| `src/hooks/command-execute-before.js` | First readiness check and first persistence point for `workflowState.readiness`. Also invokes startup-chain planner. |
| `src/services/git/startup-chain-executor.js` | Refreshes readiness after startup-chain actions and can currently overwrite state with unavailable results. |
| `src/services/git/execute-approved-action.js` | Refreshes readiness after single approval actions and can currently overwrite state with unavailable results. |
| `src/services/workflow/workflow-state.js` | Session store clone behavior for adding a diagnostic state field. |
| `tests/unit/build-startup-chain-question-instruction.test.js` | Existing startup-chain planner/question unit coverage. Add direct planner assertions here or split a new unit test. |
| `tests/regression.test.js` | Existing readiness, hook, and startup-chain regression coverage. Best place for state preservation verifier. |
| `tests/e2e/scenario-init-chain.test.js` | Existing full init -> baseline -> branch startup-chain e2e scenario. Extend or add adjacent regression for transient unavailable refresh. |

### Technical Decisions

- Do not change the public shape of `checkRepositoryReadiness()` for this fix. It may continue to return unavailable details with base false values because callers should stop treating unavailable as real repo state.
- Add a small helper for state writes, preferably near git readiness code, to keep preservation behavior consistent across hook and executors. Candidate name: `resolveReadinessStateUpdate({ previousReadiness, nextReadiness })` or `preserveKnownGoodReadiness({ current, next })`.
- Define `readiness-check-unavailable` as non-authoritative. It updates `latestReadinessError`, but it must not replace a previous authoritative readiness.
- Define authoritative readiness as:
  - `outcome: "allow"` with `reason: "repository-ready"` and `details.isGitRepository === true`
  - `outcome: "allow"` with `reason: "readiness-gate-skipped"` only when it carries known repository facts from a successful probe; do not treat skip-active base false values as known-ready
  - `outcome: "ask"` with `reason: "git-not-initialized"` for the real non-git case
- For this bug, the minimum preservation requirement is prior `repository-ready`. The implementation may also preserve any prior readiness whose `details.isGitRepository === true` over an unavailable result.
- `latestReadinessError` stores the full unavailable readiness object. This is simpler and preserves existing diagnostic fields without inventing a second diagnostic shape.
- When a new successful authoritative readiness arrives, clear `latestReadinessError` to avoid stale timeout diagnostics being mistaken for the current state. When a new unavailable result arrives, replace `latestReadinessError` with the latest unavailable object.
- Debug logging should continue to log unavailable checks at their occurrence site. The state preservation helper should not remove `failedProbe`, `failedProbeDurationMs`, `probeTrace`, or error fields from logs.

## Current Code Flow Analysis

1. `checkRepositoryReadiness()` initializes fallback details with `isGitRepository:false`, `branch:null`, `hasCommit:false`, `hasRemote:false`, and remote names empty.
2. When any unexpected git probe error escapes the internal handling, `buildUnavailableResult()` returns:
   - `outcome: "skip"`
   - `reason: "readiness-check-unavailable"`
   - `details` containing base false values plus diagnostic error fields.
3. `command-execute-before.js` calls `checkRepositoryReadiness()`, logs diagnostics, and currently persists the result directly as `workflowState.readiness`.
4. The same hook immediately calls `buildStartupChainPlan({ readiness, readinessGate, ... })`.
5. `startup-chain-planner.js` currently pushes `init` when `gateEnabled && (!isGitRepository || readiness.reason === "git-not-initialized")`.
6. The planner currently pushes `baseline` when `gateEnabled && !hasCommit`.
7. Because unavailable details default to false, a timeout result is indistinguishable from a real non-git/no-commit state to the planner.
8. `startup-chain-executor.js` refreshes readiness after successful startup-chain steps and writes the returned readiness directly into state.
9. `execute-approved-action.js` refreshes readiness after approved init/branch actions and writes the returned readiness directly into state.
10. A known-good `repository-ready` can therefore be overwritten by a later unavailable result from any of these write points, and the next workflow re-entry can regenerate startup init/baseline/branch steps.
11. Even after state preservation is added, branch planning can still regenerate a standalone `branch/create` proposal if `resolveCurrentBranch()` returns `null` and the effective preserved readiness branch is not used as a fallback.
12. The observed log sequence demonstrates this second path: after the startup chain reached `repository-ready` on `feat/no-ticket-bmad-quick-dev`, the next command re-entry saw a raw `ETIMEDOUT`, preserved readiness as ready, skipped startup-chain re-ask, then published `branch/create` because current branch resolution had no fallback to `readiness.details.branch`.

## Implementation Plan

### Tasks

- [x] Task 1: Tighten startup-chain planner repository-state gates
  - File: `src/services/git/startup-chain-planner.js`
  - Action: Replace `!isGitRepository || readiness?.reason === "git-not-initialized"` with an explicit `needsInit` predicate: `readiness?.outcome === "ask" && readiness?.reason === "git-not-initialized"`.
  - Action: Add `isUnavailable` predicate: `readiness?.reason === "readiness-check-unavailable"`.
  - Action: Add `repositoryKnownInitialized` predicate: `readiness?.outcome === "allow" && readiness?.reason === "repository-ready" && details.isGitRepository === true`.
  - Action: Add `shouldPlanStartupBaseline` predicate: `gateEnabled && !isUnavailable && (needsInit || (repositoryKnownInitialized && details.hasCommit === false))`.
  - Action: Add `shouldEvaluateStartupBranch` predicate: `!isUnavailable && (needsInit || (repositoryKnownInitialized && details.hasCommit === true))`.
  - Action: Keep the existing real non-git startup-chain behavior: when `needsInit` is true and branch policy requires a branch, the planner may still return `["init", "baseline", "branch"]` in one chain.
  - Notes: A real no-commit initialized repo still returns `allow/repository-ready` with `isGitRepository:true` and `hasCommit:false`, so baseline remains valid. A real non-git workspace still returns `ask/git-not-initialized`, so the existing combined init/baseline/branch startup chain remains valid. An unavailable result returns no startup steps.

- [x] Task 2: Add shared readiness preservation helper
  - File: `src/services/git/readiness-state-policy.js`
  - Action: Export a helper that accepts previous readiness and next readiness and returns `{ readiness, latestReadinessError }`.
  - Action: If `nextReadiness.reason !== "readiness-check-unavailable"`, return `readiness: nextReadiness` and `latestReadinessError: null`.
  - Action: If `nextReadiness.reason === "readiness-check-unavailable"` and previous readiness is authoritative/known-good, return previous readiness as `readiness` and next readiness as `latestReadinessError`.
  - Action: If there is no previous authoritative readiness, return `readiness: null` and `latestReadinessError: nextReadiness`.
  - Notes: Prefer keeping `workflowState.readiness` as the last authoritative readiness. This makes downstream planners read stable repository facts and diagnostics read `latestReadinessError`.

- [x] Task 3: Apply preservation policy in command startup hook
  - File: `src/hooks/command-execute-before.js`
  - Action: After `checkRepositoryReadiness()` returns and debug logging/audit timing are captured, resolve the state update through the shared helper using `workflowState.get(context.sessionID)?.readiness` as previous readiness.
  - Action: Persist `readinessGate`, effective `readiness`, and `latestReadinessError` instead of blindly setting `readiness` to the raw check result.
  - Action: Pass the effective preserved readiness, not the raw unavailable result, to `buildStartupChainPlan()`, direct init proposal logic, branch planning, start-instruction generation, and audit fields that describe current workflow readiness.
  - Action: Keep raw unavailable diagnostics in debug logs and optionally audit a separate `git.readiness.unavailable` or continue using `git.readiness.checked` with `outcome:"skip"`.
  - Notes: The raw result should remain observable for timeout investigation, but it must not drive startup-chain planning.

- [x] Task 4: Apply preservation policy in startup-chain executor refreshes
  - File: `src/services/git/startup-chain-executor.js`
  - Action: Change `refreshReadiness()` or the `updateState()` calls after init/baseline/branch to preserve known-good readiness over `readiness-check-unavailable`.
  - Action: When refresh returns unavailable after successful init, do not replace a fallback or newly inferred known-ready state with base false values.
  - Action: If branch action succeeds and the refresh is unavailable, preserve the previous readiness while applying only `details.branch` from the branch envelope if available. Keep previous `reason`, `message`, `hasCommit`, `hasRemote`, and `remoteNames`; update `checkedAt` only if the helper already has a clear convention for merge timestamps.
  - Notes: This closes the exact observed sequence where init succeeds, one refresh confirms ready, and a later refresh timeout re-poisons state.

- [x] Task 5: Apply preservation policy in single approval executor refreshes
  - File: `src/services/git/execute-approved-action.js`
  - Action: After approved init success, run the same preservation helper before `workflowState.set({ readiness: refreshedReadiness, ... })`.
  - Action: After approved branch success, run the same preservation helper before storing refreshed readiness.
  - Action: Keep the existing catch fallback behavior, but ensure any synthetic fallback has `isGitRepository:true` after successful init or branch and does not regress `hasCommit` if prior state knew `hasCommit:true`.
  - Notes: This prevents the same bug outside startup-chain execution.

- [x] Task 6: Clone new diagnostic state safely
  - File: `src/services/workflow/workflow-state.js`
  - Action: Deep-clone `latestReadinessError` in store `get()` behavior like `readinessGate`, `startupChainCurrent`, and histories.
  - Notes: This avoids tests or callers mutating nested diagnostic details in the store.

- [x] Task 7: Add planner unit coverage for unavailable readiness
  - File: `tests/unit/build-startup-chain-question-instruction.test.js` or new `tests/unit/startup-chain-planner.test.js`
  - Action: Add a case where readiness is `skip/readiness-check-unavailable` with `details.isGitRepository:false` and `details.hasCommit:false`.
  - Action: Assert `buildStartupChainPlan()` returns no `init`, `baseline`, or `branch` steps.
  - Action: Keep existing real `ask/git-not-initialized` case expecting `["init", "baseline", "branch"]`.

- [x] Task 8: Add workflowState preservation regression coverage
  - File: `tests/regression.test.js`
  - Action: Add a verifier that seeds a session with `readiness: { outcome:"allow", reason:"repository-ready", details:{ isGitRepository:true, hasCommit:true, branch:"main" } }`.
  - Action: Run the command hook with a stubbed `gitRunner` or plugin context that causes `checkRepositoryReadiness()` to return `readiness-check-unavailable`.
  - Action: Assert `workflowState.get(sessionID).readiness.reason === "repository-ready"` and `latestReadinessError.reason === "readiness-check-unavailable"`.
  - Action: Assert no `startupChainCurrent` is created and no startup-chain request with `questionKeys:["init","baseline","branch"]` is emitted.

- [x] Task 9: Add e2e or targeted regression for post-init transient unavailable
  - File: `tests/e2e/scenario-init-chain.test.js` or `tests/regression.test.js`
  - Action: Simulate successful startup-chain init/baseline/branch and then a later readiness timeout in the same session.
  - Action: Re-enter the workflow command.
  - Action: Assert no new Initialize Git startup question is emitted.
  - Notes: If e2e stubbing of timeout is awkward, implement this as a regression test around the hook/executor with controlled `gitRunner`.

- [x] Task 10: Update diagnostics documentation or inline comments
  - File: `src/services/git/check-repository-readiness.js` and/or relevant hook comments
  - Action: Add a concise comment documenting that unavailable results are diagnostic and non-authoritative.
  - Action: Do not remove existing diagnostic fields unless they are duplicated; prefer retaining them until timeout root cause investigation is complete.

- [x] Task 11: Use preserved readiness branch as branch-planning fallback
  - File: `src/hooks/command-execute-before.js`
  - Action: Add a hook-local helper such as `resolveEffectiveCurrentBranch(input, context, pluginContext, effectiveReadiness)` that returns `resolveCurrentBranch(input, context, pluginContext) ?? trustedReadinessBranch(effectiveReadiness) ?? null`.
  - Action: `trustedReadinessBranch(effectiveReadiness)` may return a branch only when all of these are true: `effectiveReadiness.outcome === "allow"`, `effectiveReadiness.reason === "repository-ready"`, `effectiveReadiness.details.isGitRepository === true`, `effectiveReadiness.details.hasCommit === true`, and `effectiveReadiness.details.branch` is a non-empty string.
  - Action: Do not trust readiness branch fallback from `readiness-gate-skipped`, `git-not-initialized`, no-commit repositories, detached/empty branch state, or any raw unavailable result.
  - Action: Call that helper in both hook sites that currently resolve current branch: the startup-chain preview path before `buildStartupChainPlan()` and the direct branch-publish path before `planBranchProposal()`.
  - Action: Keep explicit command input and `pluginContext.resolveCurrentBranch()` higher priority than preserved readiness, because those represent the freshest observed runtime branch when present.
  - Action: Do not use `rawReadiness.details.branch` when `rawReadiness.reason === "readiness-check-unavailable"`; only use the effective preserved readiness branch.
  - Action: When the raw readiness probe succeeds, `resolveReadinessStateUpdate()` makes that raw result the effective readiness. In that normal case the helper still reads only `effectiveReadiness`, not a parallel raw-readiness field.
  - Action: Do not move this fallback into `src/services/git/startup-chain-planner.js`. That planner must remain a pure consumer of the supplied `currentBranch`; the hook is responsible for computing the effective current branch before calling it.
  - Action: Treat preserved readiness branch as a fallback only when no explicit/runtime branch is available. It is not allowed to override `input.currentBranch`, `input.branch`, or `pluginContext.resolveCurrentBranch()`.
  - Action: The "already on target branch" check is exact string equality between the effective current branch and the computed candidate branch. Do not introduce additional normalization in this fix.
  - Notes: This closes the observed path where preserved readiness says the session is already on `feat/no-ticket-bmad-quick-dev`, but branch planning still sees `currentBranch:null` and creates a redundant `branch/create` proposal.

- [x] Task 12: Add regression coverage for redundant branch prompt after preserved readiness
  - File: `tests/regression.test.js`
  - Action: Primary reproduction should model the observed sequence: complete or simulate a startup-chain branch success so effective readiness is `repository-ready`, `hasCommit:true`, and `details.branch` exactly equals the computed candidate branch.
  - Action: Re-enter the workflow with no `input.currentBranch`, no `input.branch`, and no `pluginContext.resolveCurrentBranch()`, while injected `gitRunner` throws an `ETIMEDOUT` error that makes `checkRepositoryReadiness()` return `readiness-check-unavailable`.
  - Action: Assert no approval publication side effect occurs: `branchProposal == null`, `approvalCurrent == null`, `pendingActions` is empty/unchanged, `pluginContext.requestApproval` is not called, and no captured approval request has `actionType:"branch/create"` or header `Create Branch`.
  - Action: Assert `latestReadinessError.reason === "readiness-check-unavailable"` remains available for diagnostics.
  - Action: Add three priority companion cases where each explicit/runtime source returns a different branch than preserved readiness: `input.currentBranch`, `input.branch`, and `pluginContext.resolveCurrentBranch()`. Assert branch planning uses the explicit/runtime branch and still creates the appropriate create/switch proposal when policy requires it.
  - Action: Split the two hook-site consistency checks into separate tests. Startup-chain preview test: with `ask/git-not-initialized` or known initialized startup-chain planning, assert `buildStartupChainPlan()` receives the effective fallback branch and therefore does not preview a duplicate branch step when the fallback branch equals the candidate. Direct branch-publish test: with no startup-chain prompt path, assert `planBranchProposal()` receives the same effective fallback branch and no standalone `branch/create` approval is published when the fallback branch equals the candidate.
  - Action: Each hook-site test must fail if only the other site is patched. Avoid a single broad test that can pass because one path masks the other.
  - Action: Add a direct planner purity case: call `buildStartupChainPlan()` with readiness containing `details.branch` equal to the candidate but pass `currentBranch:null`; assert the planner behaves only from the supplied `currentBranch` and does not read `readiness.details.branch` internally.
  - Action: Approval routing must not be refactored for this fix, but publication side effects must be inspected in tests to prove no redundant approval was surfaced.

### Acceptance Criteria

- [x] AC 1: Given readiness is `outcome:"skip"` and `reason:"readiness-check-unavailable"` with `details.isGitRepository:false`, when `buildStartupChainPlan()` runs, then no `init` startup step is created.
- [x] AC 2: Given readiness is `outcome:"skip"` and `reason:"readiness-check-unavailable"` with `details.hasCommit:false`, when `buildStartupChainPlan()` runs, then no `baseline` startup step is created.
- [x] AC 3: Given readiness is `outcome:"skip"` and `reason:"readiness-check-unavailable"` and branch policy requires a branch, when `buildStartupChainPlan()` runs, then no `branch` startup step is created from fallback branch state.
- [x] AC 4: Given readiness is `outcome:"ask"` and `reason:"git-not-initialized"`, when `buildStartupChainPlan()` runs for a branch-required workflow, then the existing combined `init`, `baseline`, and `branch` startup flow is still planned.
- [x] AC 5: Given readiness is `outcome:"allow"`, `reason:"repository-ready"`, `details.isGitRepository:true`, and `details.hasCommit:false`, when `buildStartupChainPlan()` runs, then baseline is still planned and init is not planned.
- [x] AC 6: Given readiness is `outcome:"allow"`, `reason:"repository-ready"`, `details.isGitRepository:true`, `details.hasCommit:true`, and the current branch violates branch policy, when `buildStartupChainPlan()` runs, then branch is still planned.
- [x] AC 7: Given `workflowState.readiness` is `repository-ready`, when a new command-start readiness probe returns `readiness-check-unavailable`, then `workflowState.readiness` remains the prior `repository-ready` value.
- [x] AC 8: Given a new command-start readiness probe returns `readiness-check-unavailable`, when state is updated, then unavailable diagnostics are available under `workflowState.latestReadinessError`.
- [x] AC 8a: Given `workflowState.latestReadinessError` is set from a prior unavailable probe, when a later readiness probe returns an authoritative non-unavailable result, then `workflowState.latestReadinessError` is cleared.
- [x] AC 9: Given `git init` and baseline commit completed in a session, when a later readiness refresh returns `readiness-check-unavailable`, then the same session does not emit another Initialize Git startup-chain question.
- [x] AC 10: Given unavailable readiness includes `failedProbe`, `failedProbeDurationMs`, `probeTrace`, and error fields, when debug logs are captured, then those fields remain present for timeout investigation.
- [x] AC 11: Given preserved readiness is `repository-ready` with `details.branch` equal to the computed candidate branch, when command re-entry has no explicit current branch and raw readiness is `readiness-check-unavailable`, then branch planning must not create a `branch/create` proposal.
- [x] AC 12: Given native `command.executed` re-entry after startup-chain branch success, when `resolveCurrentBranch()` cannot resolve a branch but effective readiness has `details.branch`, then `publishNextPlannedAction()` must not ask `Create Branch` for the same branch.
- [x] AC 13: Given explicit `input.currentBranch`, `input.branch`, or `pluginContext.resolveCurrentBranch()` returns a branch that differs from preserved readiness, branch planning must prefer the explicit/runtime branch over the preserved readiness branch.
- [x] AC 14: Given the hook calls `buildStartupChainPlan()` and later `planBranchProposal()` in separate code paths, both paths must use the same effective current-branch resolver and must not diverge on preserved branch fallback behavior.
- [x] AC 15: Given `buildStartupChainPlan()` is called directly by tests or future callers, it must not perform readiness-branch fallback internally; callers must pass the already resolved effective `currentBranch`.
- [x] AC 16: Given effective readiness is not trusted for branch fallback (`readiness-gate-skipped`, `git-not-initialized`, `hasCommit:false`, empty branch, or unavailable raw result with no preserved ready state), branch planning must not use `readiness.details.branch` as current branch.
- [x] AC 17: Given redundant branch prompt prevention succeeds, approval publication state must remain clean: no branch proposal, no current branch approval, no queued branch action, and no `requestApproval` call for `branch/create`.

## Additional Context

### Dependencies

- No new npm dependency is required.
- The change depends on existing readiness contracts from `checkRepositoryReadiness()`.
- The change should remain compatible with the existing readiness skip override behavior in `resolveReadinessGate()`.

### Testing Strategy

- Unit:
  - Add direct planner coverage for `readiness-check-unavailable` producing no startup steps.
  - Keep or extend existing startup-chain question tests for real `git-not-initialized`, initialized/no-commit, initialized/commit-on-main, and already-valid-branch cases.
- Regression:
  - Add a hook-level test where known-good `workflowState.readiness` survives a later unavailable probe.
  - Add a state cloning assertion for `latestReadinessError` if the new field is stored in workflow state.
  - Add an executor-level test for startup-chain refresh or single approval refresh preserving known-good state on unavailable.
- E2E:
  - Keep the existing startup-chain happy paths as full pipeline coverage.
  - Do not force a real `spawnSync git ETIMEDOUT` in e2e; timeout simulation belongs in deterministic regression tests with injected git runners.
- Full verification:
  - Run `npm test`.

### Risks / Cautions

- Do not accidentally suppress real `git-not-initialized`. The planner must still treat explicit `ask/git-not-initialized` as authoritative.
- Do not treat `readiness-gate-skipped` with base false details as known-ready. Skip-active workflows intentionally bypass init/baseline gating, but that is not proof that a repository exists.
- Do not break the existing startup-chain UX for real non-git workspaces. `ask/git-not-initialized` should still be able to produce `init`, `baseline`, and `branch` in one prompt.
- Be careful with audit semantics. User-facing workflow readiness should use the effective preserved readiness, while debug/audit diagnostics should still expose the raw unavailable check where useful.
- Avoid stale branch planning after unavailable refresh. Branch steps should be created only from either explicit `ask/git-not-initialized` startup-chain intent or known initialized state, never from unavailable fallback details. After successful branch execution, prefer observed branch state from the executor envelope when available.
- Avoid losing the preserved branch during command re-entry. If native command input omits branch information, branch planning must use effective `workflowState.readiness.details.branch` before assuming there is no current branch.
- Avoid over-trusting preserved readiness. The preserved branch is a last-resort fallback for missing runtime branch data, not an authoritative replacement for explicit `input.currentBranch`, `input.branch`, or `pluginContext.resolveCurrentBranch()`.
- Trust preserved readiness branch only after an authoritative ready state with a real commit. A branch name from skipped readiness, non-git readiness, no-commit readiness, or unavailable raw diagnostics is not enough evidence to suppress branch planning.
- Keep `startup-chain-planner.js` pure. It should not inspect readiness branch fallback rules; the hook must compute and pass a resolved `currentBranch` consistently to both startup-chain preview and direct branch proposal planning.
- Keep changes local to readiness state policy and startup-chain gating. Do not refactor approval queues or executor envelopes as part of this fix.

### Notes

- The root cause of the timeout can continue to be investigated through existing diagnostics. This spec fixes the state-poisoning bug independently.
- The most important invariant after this change: an unavailable readiness check can record diagnostics, but it cannot make a known initialized repository look uninitialized.
- If the previous readiness was `ask/git-not-initialized` and a later probe is unavailable before any successful git action, the helper intentionally does not promote unavailable fallback details. Successful init/baseline/branch actions provide explicit inferred-ready fallbacks through the executor path.

## Review Notes

- Adversarial review completed.
- Findings: 10 total, 6 fixed automatically, 2 addressed by scope clarification, 2 skipped as undecided/noise.
- Resolution approach: auto-fix.

## Follow-up Review Notes

- 2026-05-13 log review found an unresolved branch re-prompt path after readiness preservation. The fix above is captured and implemented as Tasks 11-12 and AC 11-17.
- Quick-dev implementation completed. Verification: `node tests/regression.test.js`, `node --check src/hooks/command-execute-before.js`, `node --check src/services/git/startup-chain-planner.js`, `node --check tests/regression.test.js`, and `bun run test` all passed.
- Quick-dev adversarial review found one real coverage gap: AC 16 was only indirectly tested. Fixed by adding hook-level untrusted-readiness cases for empty branch, no-commit readiness, and `readiness-gate-skipped`; `node tests/regression.test.js` and `bun run test` passed afterward.
