---
title: 'State-Aware Git Startup Approval Chain'
slug: 'state-aware-git-startup-approval-chain'
created: '2026-05-12'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js ESM', 'opencode native plugin hooks', 'Git CLI', 'node:assert e2e tests']
files_to_modify: ['src/hooks/command-execute-before.js', 'src/hooks/native-event.js', 'src/hooks/permission-asked.js', 'src/index.js', 'src/services/approval/build-startup-chain-question-instruction.js', 'src/services/git/startup-chain-planner.js', 'src/services/git/startup-chain-executor.js', 'src/services/git/branch-action-service.js', 'src/services/git/baseline-commit-service.js', 'src/services/git/run-git-command.js', 'src/services/git/execute-approved-action.js', 'src/services/workflow/workflow-state.js', 'tests/unit/build-startup-chain-question-instruction.test.js', 'tests/regression.test.js', 'tests/e2e/scenario-init-chain.test.js', 'tests/e2e/scenario-readiness-not-initialized.test.js', 'tests/e2e/scenario-startup-chain-matrix.test.js', 'package.json']
code_patterns: ['service-layer pure planners', 'single native event router', 'session-scoped workflowState', 'executor envelope for mutating git actions', 'best-effort audit logging', 'promptAsync metadata for native question routing']
test_patterns: ['plain node scripts via npm test', 'node:assert/strict', 'real git binary in temporary workspaces', 'mock client.session.promptAsync and client.app.log']
---

# Tech-Spec: State-Aware Git Startup Approval Chain

**Created:** 2026-05-12

## Overview

### Problem Statement

At BMAD workflow startup, Git readiness handling is currently modeled as a sequence of single approvals. In a non-git workspace, only `git init` is fully routed through the event-handler approval and executor path. Baseline commit and branch create/switch are then published as later prompts. A workspace that has no `.git`, a workspace that has `.git` but no HEAD commit, a workspace with a baseline commit on a long-lived branch, and a workspace already on the correct branch all need different startup questions. The current single-action approval model does not represent that matrix in one user decision flow. Branch proposals and branch approvals already exist, but branch create/switch is not executed by the git executor and currently falls through as `unsupported-action-type`.

### Solution

At workflow start, derive the required startup Git actions from repository readiness and branch policy, then collect user intent with one multiple-question startup prompt. The prompt only collects approval. Execution remains sequential and executor-backed: `init -> baseline commit -> branch create/switch`. After each successful step, refresh the state needed by the next step so stale plans are not executed. Add branch create/switch as a first-class executor-backed git action.

### Scope

**In Scope:**
- Define the startup Git matrix for: no `.git`, git repo without HEAD commit, git repo with HEAD commit but branch action required, and already-ready repo.
- Add a startup prompt that includes only the questions required by the current matrix state.
- Route startup-chain question ids and multiple answers from native `question.asked` / `question.replied`.
- Execute `git init`, baseline commit, and branch create/switch through executor-backed sequential execution.
- Add branch create/switch executor support.
- Make existing single branch approval prompts execute branch actions on accept.
- Add startup chain state that is compatible with existing recovery, audit, and session cleanup.
- Add unit, regression, and e2e coverage.

**Out of Scope:**
- Do not include workflow output commits in the startup prompt. Workflow output commits remain a finish-phase finalization approval.
- Do not customize the baseline commit message.
- Do not create remotes, create PRs, or change push policy.
- Do not change the question tool UI itself.
- Do not add new support for environments without Git installed.

## Context for Development

### Codebase Patterns

- Runtime is a Node.js ESM plugin. `src/index.js` returns the hook map from `DevaiAiddGuardPlugin()`. In the native runtime, the `event` hook handles `command.executed`, `question.asked`, `question.replied`, `question.rejected`, and `session.deleted`.
- `command.executed` is delegated by `src/hooks/native-event.js` to `commandExecuteBeforeHandler`. Startup matrix planning should live under `command-execute-before` or below it in services so both native and compatibility entry points share the behavior.
- `src/hooks/command-execute-before.js` performs workflow detection, readiness checking, baseline detection, branch planning, approval publishing, and synthetic start-instruction insertion. The startup chain planner should run after readiness is known and before the existing `publishNextPlannedAction()` call.
- Readiness comes from `src/services/git/check-repository-readiness.js`. The key matrix fields are `details.isGitRepository`, `details.hasCommit`, `details.branch`, `details.hasRemote`, and `details.remoteNames`.
- Existing approval publishing is based on the single `approvalCurrent` slot and `pendingActions` queue in `src/services/approval/publish-next-planned-action.js`. Startup chain state should not overload `approvalCurrent`; use separate startup-chain state fields.
- The native question router currently reads only `questions[0]` and `answers[0]`. Multiple-question support requires a parser that extracts question ids, headers, and answer labels as arrays/maps.
- `src/index.js` has `pluginContext.requestApproval()` for single approval prompts. Startup chain should use a separate `pluginContext.requestStartupChainApproval(chainRequest)` adapter.
- Mutating Git execution goes through `src/services/git/git-executor.js` and `executeGitAction()`. The executor already accepts `kind: "branch"`, but runner dispatch and approved-action dispatch do not yet handle branch actions.
- `src/services/git/run-git-command.js` currently executes only `commit`, `push`, and `init`. It needs an `action.kind === "branch"` branch.
- `src/services/git/execute-approved-action.js` currently dispatches only `init`, `commit`, and `push`. It needs `branch/create` and `branch/switch` dispatch.
- `src/services/git/branch-service.js` computes branch strategy and branch proposals. Actual branch action planning should live in a new `branch-action-service.js` to keep pure strategy logic separate from execution planning.
- Workflow output commits are created during finish-phase finalization in `src/services/workflow/evaluate-workflow-finalization.js`. Keep them out of startup chain.
- Tests use plain Node scripts with `node:assert/strict`. E2E tests use a real Git binary in temporary workspaces and mock only `client.session.promptAsync` and `client.app.log`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/hooks/command-execute-before.js` | Startup chain planner call site and duplicate single-approval prevention. |
| `src/hooks/native-event.js` | Multiple question asked/replied routing and startup chain answer dispatch. |
| `src/hooks/permission-asked.js` | Existing single branch approval accept gate. |
| `src/index.js` | Add `pluginContext.requestStartupChainApproval()`. |
| `src/services/git/check-repository-readiness.js` | Matrix input values. |
| `src/services/git/startup-chain-planner.js` | New planner for required startup steps. |
| `src/services/approval/build-startup-chain-question-instruction.js` | New startup prompt/instruction/metadata builder. |
| `src/services/git/startup-chain-executor.js` | New sequential executor for startup answers. |
| `src/services/git/branch-action-service.js` | New branch action builder and `executeBranch()`. |
| `src/services/git/baseline-commit-service.js` | New shared baseline commit helper service. |
| `src/services/git/run-git-command.js` | Add `buildBranchArgs()` and `action.kind === "branch"` runner dispatch. |
| `src/services/git/execute-approved-action.js` | Add single branch approval dispatch and use shared baseline helpers. |
| `src/services/workflow/workflow-state.js` | Deep-clone startup chain state fields. |
| `tests/e2e/helpers.js` | Reuse temp repo setup. |
| `tests/e2e/scenario-init-chain.test.js` | Extend existing init chain to verify branch execution. |
| `tests/e2e/scenario-readiness-not-initialized.test.js` | Preserve non-git readiness behavior. |
| `tests/e2e/scenario-startup-chain-matrix.test.js` | New matrix e2e coverage. |
| `tests/regression.test.js` | Add planner/parser/branch executor regression coverage. |
| `package.json` | Add new unit/e2e tests to `npm test`. |

### Technical Decisions

- Startup chain separates approval collection from execution. Multiple questions collect intent; each accepted step executes through the git executor.
- Store startup chain state in `workflowState` as `startupChainCurrent`, `pendingStartupQuestion`, and `startupChainHistory`.
- When startup chain is active, do not publish the existing single approval prompt for the same startup actions.
- Multiple-question runtime contract is explicit. The question tool should be called with a `questions[]` array. Each item should have `{ id, header, options }`. Ids use `${startupChainId}:init`, `${startupChainId}:baseline`, and `${startupChainId}:branch`.
- `question.replied.properties.answers` supports these shapes in order: `[{ id, answer }]`, `{ [id]: answer }`, and nested array order such as `[[answer1], [answer2], ...]`. If no shape maps safely, do not execute the chain.
- `requestStartupChainApproval()` sends one text part through `promptAsync` and puts the machine-readable contract in metadata: `{ startupChainId, startupChain: true, questionKeys, questionIds, questionHeaders, questionOptions }`.
- Startup fallback must be explicit. If startup prompt delivery fails before the user sees it, clear `startupChainCurrent` and `pendingStartupQuestion`, seed equivalent sequential proposal slots, and call `publishNextPlannedAction()`. After a user has submitted startup answers, do not silently fallback; audit the unmatched answer and reissue the startup prompt.
- Extract baseline `.gitignore` and baseline answer handling into `src/services/git/baseline-commit-service.js`. Do not duplicate the private helpers from `execute-approved-action.js`.
- Startup chain execution lives in `startup-chain-executor.js` and delegates to existing `executeInit()`, existing `executeCommit()`, and new `executeBranch()`.
- Build the baseline commit proposal immediately before execution using `pluginContext.listChangedFiles()`.
- Recompute branch proposal after baseline commit succeeds, never before HEAD exists.
- Branch commands use `git switch -c <name>` and `git switch <name>`. Older Git fallback to `checkout` is out of scope for this spec.
- Branch runner returns `observedState.headBranch` so executor branch post-condition checks are meaningful.
- Fix the existing single branch approval path too, otherwise branch prompts outside startup chain still do not execute.
- Startup chain audit does not pretend to be normal `approval.requested`. Use `startup.chain.requested` and `startup.chain.resolved` for chain-level user intent. Actual git operations still emit existing `git.action.executed` audits.
- Workflow output commit remains finish-phase only.

## Implementation Plan

### Tasks

- [ ] Task 1: Add branch action service.
  - File: `src/services/git/branch-action-service.js`
  - Action: Add `buildBranchAction({ proposal, correlationId })` and `executeBranch(params)`.
  - Notes: `proposal.action === "create"` maps to `{ kind: "branch", operation: "create", branchName: proposal.name, targetBranch: proposal.name }`. `proposal.action === "switch"` maps to `{ kind: "branch", operation: "switch", branchName: proposal.name, targetBranch: proposal.name }`. `executeBranch()` delegates to `executeGitAction()`.

- [ ] Task 2: Add branch Git CLI args and runner dispatch.
  - File: `src/services/git/run-git-command.js`
  - Action: Export `buildBranchArgs(action)` and add `action.kind === "branch"` dispatch in `runGitAction()`.
  - Notes: Create uses `["switch", "-c", branchName]`. Switch uses `["switch", targetBranch]`. Missing branch/target throws. After execution, read `symbolic-ref --short HEAD` and return `observedState: { headBranch }`.

- [ ] Task 3: Wire branch approval execution into existing single approval path.
  - File: `src/services/git/execute-approved-action.js`
  - Action: Add a branch for `approvalRequest.actionType === "branch/create" || approvalRequest.actionType === "branch/switch"` when `proposal.kind === "branch"`, then call `executeBranch()`.
  - Notes: On success, clear `branchProposal` and refresh `readiness.details.branch` from observed state.

- [ ] Task 4: Allow branch accept to call executor.
  - File: `src/hooks/permission-asked.js`
  - Action: Add `result.resolution?.actionKind === "branch"` to the ACCEPT execution gate.
  - Notes: Failed branch envelopes should use the existing `openRecoveryFromExecution()` path.

- [ ] Task 5: Add startup chain planner.
  - File: `src/services/git/startup-chain-planner.js`
  - Action: Add `buildStartupChainPlan({ readiness, workflowContext, workflowPolicy, branchConfig, currentBranch, state })`.
  - Notes: Return `{ shouldAsk, reason, steps, branchPreview }`. Steps include only required `init`, `baseline-commit`, and/or `branch`. If `gitInitSkipped` or `baselineSkipped` is set, return `shouldAsk: false`.

- [ ] Task 6: Extract reusable baseline commit helpers.
  - File: `src/services/git/baseline-commit-service.js`
  - Action: Add `normalizeBaselineAnswer(answer)`, `appendGitignoreRules(directory, rules, audit)`, and `resolveBaselineCommitFiles({ answer, proposal, directory, listChangedFiles, audit })`.
  - Notes: Move baseline-related private logic out of `execute-approved-action.js`. Both the existing single commit path and startup chain executor must import this helper.

- [ ] Task 7: Add startup multiple-question instruction builder.
  - File: `src/services/approval/build-startup-chain-question-instruction.js`
  - Action: Add `buildStartupChainQuestionInstruction(chainPlan)` to produce header, questions array, instruction text, and metadata.
  - Notes: Each question object includes `{ key, id, header, options }`. Ids use `${startupChainId}:${key}`. Reuse existing baseline labels. Branch options are `Approve (Recommended)` and `Ignore and continue`.

- [ ] Task 8: Add startup prompt adapter.
  - File: `src/index.js`
  - Action: Add `pluginContext.requestStartupChainApproval(chainRequest)`.
  - Notes: `client.session.promptAsync()` uses one text part with metadata `{ startupChain: true, startupChainId, questionKeys, questionIds, questionHeaders, questionOptions }`. Prompt text includes an example question tool call with `questions: [{ id, header, options }, ...]`. Keep single `requestApproval()` unchanged.

- [ ] Task 9: Persist startup chain state.
  - File: `src/services/workflow/workflow-state.js`
  - Action: Deep-clone `startupChainCurrent`, `pendingStartupQuestion`, and `startupChainHistory` in `get()`.
  - Notes: `session.deleted` still clears state through the existing `clear()`.

- [ ] Task 10: Publish startup chain from command start.
  - File: `src/hooks/command-execute-before.js`
  - Action: Call startup chain planner after readiness and before branch planning/single publish. If `chainPlan.shouldAsk`, set `startupChainCurrent`, call `pluginContext.requestStartupChainApproval()`, and skip `publishNextPlannedAction()`.
  - Notes: If `requestStartupChainApproval` is unavailable or prompt delivery fails, clear startup chain state, convert the planner result into existing sequential proposal slots, and call `publishNextPlannedAction()`.

- [ ] Task 11: Route startup multiple-question events.
  - File: `src/hooks/native-event.js`
  - Action: On `question.asked`, detect startup chain question ids/headers and store `pendingStartupQuestion`. On `question.replied`, extract all answers and pass them to the startup chain executor.
  - Notes: Keep existing `readReplyAnswer()` for single approval. Add `readReplyAnswers(props, pendingStartupQuestion)`. Supported answer shapes are `[{ id, answer }]`, `{ [id]: answer }`, and nested array order. On mapping failure, do not execute; emit `startup.chain.answer.unmatched` and reissue the startup prompt.

- [ ] Task 12: Add startup chain executor.
  - File: `src/services/git/startup-chain-executor.js`
  - Action: Add `executeStartupChain({ workflowState, sessionID, chain, answers, pluginContext, audit })`.
  - Notes: If init is skipped, set `gitInitSkipped` and skip downstream steps. If baseline is skipped, set `baselineSkipped` and skip branch. Execute only accepted steps. Use `baseline-commit-service.js` for baseline file/gitignore handling. Return failed envelopes immediately so recovery can open.

- [ ] Task 13: Integrate startup execution recovery.
  - File: `src/hooks/native-event.js`
  - Action: If `executeStartupChain()` returns a failed envelope, call the same recovery path used by approval execution: `openRecoveryFromExecution()` and `requestRecoveryDecision()`.
  - Notes: Extract the private recovery prompt delivery logic from `permission-asked.js` into a shared helper, or otherwise reuse it without duplicate behavior. Startup answer intent is audited as `startup.chain.resolved`; git execution remains `git.action.executed`.

- [ ] Task 14: Add planner and instruction unit tests.
  - File: `tests/unit/build-startup-chain-question-instruction.test.js`
  - Action: Test non-git, no-HEAD, branch-only, and ready matrix prompt output.
  - Notes: Add this unit test to `npm test`.

- [ ] Task 15: Add regression coverage.
  - File: `tests/regression.test.js`
  - Action: Test `buildBranchArgs`, `executeApprovedAction` branch dispatch, `permission-asked` branch accept gate, native multiple-answer parser, and startup planner.
  - Notes: Update any existing branch-unsupported expectation to the new behavior.

- [ ] Task 16: Add matrix e2e coverage.
  - File: `tests/e2e/scenario-startup-chain-matrix.test.js`
  - Action: Verify the four-state startup matrix with real Git temp workspaces.
  - Notes: Cases: non-git, git without HEAD, git with HEAD on main requiring branch, git with HEAD already on valid branch. Add to `package.json` test chain.

- [ ] Task 17: Update existing e2e scenarios.
  - File: `tests/e2e/scenario-init-chain.test.js`
  - Action: Extend branch prompt verification to branch execution verification.
  - Notes: Simulate branch approval after baseline commit, then assert `git symbolic-ref --short HEAD` equals the candidate branch.

- [ ] Task 18: Preserve fallback sequential behavior.
  - File: `src/hooks/command-execute-before.js`
  - Action: Preserve existing sequential init/baseline/branch publish when startup prompt delivery is not available before the user sees a startup prompt.
  - Notes: Pre-delivery fallback degrades to sequential slots. Post-delivery answer mismatch reissues the startup prompt. Do not fallback after partial execution. Test adapter-missing and malformed-answer cases separately.

### Acceptance Criteria

- [ ] AC 1: Given non-git workspace and branch-required workflow, when `command.executed` is handled, then one startup chain prompt is delivered with questions for init, baseline commit, and branch approval.
- [ ] AC 2: Given git repo with no HEAD commit, when workflow starts, then startup chain prompt excludes init and includes baseline commit plus branch approval.
- [ ] AC 3: Given git repo with HEAD commit on a long-lived branch and branch policy requires a feature branch, when workflow starts, then startup chain prompt includes only branch approval.
- [ ] AC 4: Given git repo with HEAD commit already on the computed valid branch, when workflow starts, then no startup chain prompt and no single branch prompt is delivered.
- [ ] AC 5: Given non-git startup chain answers approve init, setup gitignore and commit, and approve branch, when `question.replied` is handled, then `.git` exists, `HEAD` exists, and current branch equals the planned branch.
- [ ] AC 6: Given non-git startup chain answer skips init, when answers are handled, then no git command is executed and workflow state sets `gitInitSkipped === true`.
- [ ] AC 7: Given no-HEAD repo answer skips baseline commit, when answers are handled, then no branch create/switch is executed and workflow state sets `baselineSkipped === true`.
- [ ] AC 8: Given baseline commit answer is `Setup .gitignore and Commit (Recommended)`, when baseline executes, then `.gitignore` receives the default/sensitive rules before changed files are committed.
- [ ] AC 9: Given branch create approval from existing single approval path, when user accepts, then `executeApprovedAction()` executes `git switch -c <branch>`.
- [ ] AC 10: Given branch switch approval from existing single approval path, when user accepts, then `executeApprovedAction()` executes `git switch <branch>`.
- [ ] AC 11: Given branch execution succeeds but observed branch does not match target branch, when executor verifies post-condition, then a failed envelope with branch mismatch classification is returned.
- [ ] AC 12: Given branch execution fails because branch already exists or is invalid, when executor returns a failed envelope, then recovery gate is opened using the existing execution recovery flow.
- [ ] AC 13: Given native `question.replied` contains multiple answers, when startup chain is pending, then answers are mapped to startup question keys and raw answer labels are preserved.
- [ ] AC 14: Given native `question.replied` contains `[{ id, answer }]`, object-map answers, or nested array answers, when startup chain is pending, then parser maps answers to `init`, `baseline`, and `branch` keys using ids first and order only as fallback.
- [ ] AC 15: Given native `question.replied` does not contain enough answer structure for startup chain before any git execution, when handling the event, then no git action executes, `startup.chain.answer.unmatched` is audited, and the startup prompt is reissued.
- [ ] AC 16: Given startup prompt delivery fails before the user sees it, when command start handling continues, then `startupChainCurrent` is cleared and equivalent existing sequential proposals are published.
- [ ] AC 17: Given startup chain prompt is active, when `publishNextPlannedAction()` would otherwise publish init/baseline/branch single approval, then no duplicate single approval prompt is delivered and stale proposal slots are not left publishable.
- [ ] AC 18: Given startup chain prompt is delivered, when audit logs are inspected, then `startup.chain.requested` includes `startupChainId`, question keys, action ids, and correlation ids without pretending to be a normal `approval.requested`.
- [ ] AC 19: Given startup chain answers are resolved, when audit logs are inspected, then `startup.chain.resolved` records raw answer labels and per-step decisions while actual git operations still emit `git.action.executed`.
- [ ] AC 20: Given baseline commit executes from startup chain and from existing single approval path, when setup-gitignore option is selected, then both paths use the same `baseline-commit-service.js` helper and produce equivalent `.gitignore` and committed file behavior.
- [ ] AC 21: Given workflow produces finalizable outputs later, when finish finalization runs, then result commit approval is still generated separately and was not included in startup chain.
- [ ] AC 22: Given `session.deleted`, when event is handled, then startup chain state is cleared with the rest of session workflow state.
- [ ] AC 23: Given full `npm test`, when all unit/regression/e2e tests run, then existing init, approval, recovery, file-edited, and workflow detection scenarios continue to pass.

## Additional Context

### Dependencies

- Git CLI must be installed and available on PATH in test/runtime environments.
- Runtime must expose enough `question.asked` and `question.replied` structure to correlate multiple questions. If it only reliably returns a single answer, implementation must fallback to existing sequential prompt flow before the startup prompt is shown.
- No new npm dependencies are required.
- Branch executor depends on Git supporting `git switch`. If compatibility with older Git versions becomes required, add fallback to `git checkout` in a separate change.

### Testing Strategy

- Add unit coverage for startup chain question builder.
- Add regression coverage for startup planner, native multiple-answer parser, branch args builder, branch approved-action dispatch, and branch recovery failure.
- Add e2e matrix coverage using real git temp workspaces.
- Update existing init-chain e2e to verify branch execution, not only branch prompt publication.
- Run `npm test` after implementation. Because the change touches native routing, approval state, and actual git commands, partial test runs are not enough for final verification.

### Notes

- This file is intentionally written in ASCII English to avoid Windows PowerShell mojibake when fresh agents inspect it with `Get-Content`.
- Highest risk: startup chain state competing with `approvalCurrent`. Keep startup chain state separate and make duplicate prompt prevention explicit.
- Second risk: multiple-question runtime shape may differ between versions. Build parser defensively and preserve sequential fallback before prompt delivery.
- Third risk: branch create on unborn HEAD. Matrix must never execute branch before baseline commit creates HEAD.
- Fourth risk: stale branch preview in prompt. Treat branch question as approval for creating or switching to the computed workflow branch after baseline succeeds, then recompute before execution.
- Future consideration: If users want to customize baseline commit message or branch name interactively, that should be a separate spec because it changes question schema and validation.
