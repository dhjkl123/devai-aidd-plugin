---
title: 'Startup Run Lifecycle And Model-Driven Branch Strategy'
slug: 'startup-run-lifecycle-and-model-driven-branch-strategy'
created: '2026-05-15T00:00:00+09:00'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Node.js ESM plugin runtime'
  - 'session-scoped workflow state store'
  - 'native question/event routing'
  - 'Git CLI orchestration'
files_to_modify:
  - 'src/hooks/command-execute-before.js'
  - 'src/hooks/tool-execute-after.js'
  - 'src/index.js'
  - 'src/services/workflow/workflow-state.js'
  - 'src/services/workflow/workflow-run-lifecycle.js'
  - 'src/services/git/startup-chain-planner.js'
  - 'src/services/git/startup-chain-executor.js'
  - 'src/services/git/plan-branch-proposal.js'
  - 'src/services/git/resolve-branch-planning.js'
  - 'tests/unit/workflow-run-lifecycle.test.js'
  - 'tests/regression.test.js'
  - 'tests/e2e/scenario-startup-run-reentry.test.js'
code_patterns:
  - 'run-scoped lifecycle record layered on top of existing session state'
  - 'hybrid branch decision flow: model/provider decides, plugin validates and executes'
  - 'best-effort audit events for skip and fallback reasons'
  - 'preserve existing approval/recovery/startup slots instead of replacing them'
test_patterns:
  - 'unit tests for lifecycle helpers'
  - 'regression tests for re-entry suppression and model-decision fallback'
  - 'e2e replay test through real plugin bootstrap and native question events'
---

# Tech-Spec: Startup Run Lifecycle And Model-Driven Branch Strategy

**Created:** 2026-05-15T00:00:00+09:00

## Overview

### Problem Statement

The current startup chain is session-scoped but not run-scoped. That lets the same `command.executed -> command.execute.before` lifecycle reopen startup init/baseline/branch planning after the user already answered the startup questions. The same weakness can also discard finish-state intent and allow stray same-session re-entry after finalization. Separately, branch strategy is currently deterministic and plugin-hardcoded, which is too rigid for project-specific branching policies and contextual reuse of existing branches.

### Solution

Add a lightweight workflow-run lifecycle record inside the existing session state. Use it to mark startup-chain state as `not-started`, `question-pending`, `resolved`, or `execution-failed`, and to mark finalization as terminal for the current run. `command.execute.before` consults that run lifecycle before opening startup chain or branch planning again. In parallel, split branch planning into a hybrid path: the plugin gathers branch decision inputs and optionally asks a model/provider for a structured conclusion, then validates that conclusion and converts it into a normal branch proposal and git execution plan.

### Scope

**In Scope:**
- Add run-scoped startup/finalization lifecycle state without removing existing session-scoped approval/recovery fields
- Prevent startup chain reopening after startup resolution in the same session/run
- Preserve branch-related user decisions across later planning passes in the same run
- Prevent stray post-finalization `command.executed` from reopening startup logic
- Add explicit restart hooks so future intents like `다시 시작`, `재실행`, or `브랜치 다시 선택` can open a fresh run
- Add an optional model/provider branch-decision contract with plugin-side validation and deterministic fallback
- Audit why startup planning was skipped and why model branch decisions were accepted or rejected
- Add unit, regression, and e2e coverage

**Out of Scope:**
- Full replacement of existing `command.executed -> command.execute.before` reuse structure
- Letting the model execute git directly
- Introducing a brand-new user-facing branch-clarification prompt flow for `ask-user`
- Reworking recovery orchestration semantics beyond what is required to avoid duplicate startup re-entry

## Context for Development

### Codebase Patterns

- `command.execute.before` is the orchestration choke point for workflow detection, readiness, startup-chain seeding, branch planning, and start instruction injection.
- `tool.execute.after` already owns terminal finalization cleanup, so run-finalization state should be updated there instead of inventing another completion path.
- `native-event` is the source of truth for question asked/replied mapping on the native runtime.
- Existing state already separates `startupChainCurrent`, `pendingStartupQuestion`, `approvalCurrent`, `recoveryGate`, `gitInitSkipped`, `baselineSkipped`, and `finalizationCompletion`; the new design should layer on top of these rather than collapsing them.
- Branch proposal execution already flows through executor-backed `branch/create` and `branch/switch`; the new model-decision layer should stop at proposal generation.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/hooks/command-execute-before.js` | Run lifecycle resolution, startup re-entry suppression, branch planning entry |
| `src/hooks/tool-execute-after.js` | Terminal finalization state updates |
| `src/services/workflow/workflow-state.js` | Deep clone support for new run-lifecycle state |
| `src/services/workflow/workflow-run-lifecycle.js` | New helper for run keying, explicit restart detection, startup/finalization status |
| `src/services/git/startup-chain-planner.js` | Startup chain planning using either delegated or deterministic branch preview |
| `src/services/git/startup-chain-executor.js` | Startup terminal state mutation after answer resolution and execution |
| `src/services/git/resolve-branch-planning.js` | New hybrid branch decision contract and validation layer |
| `src/services/git/plan-branch-proposal.js` | Persist audited branch proposal using the new resolver |
| `src/index.js` | Plugin-context helpers for local branch enumeration and optional branch-decision provider |

### Technical Decisions

- A workflow run is keyed by `commandName + normalized arguments` and stored as `workflowRunCurrent`.
- Explicit restart is an extension point, detected for now by restart-like phrases in arguments; when detected, a new run record is created and run-scoped terminal state is reset.
- Startup lifecycle states:
  - Before question issue: `not-started` (non-terminal)
  - Question issued but not answered: `question-pending` (non-terminal)
  - User answered and chain completed or intentionally skipped: `resolved` (terminal)
  - User answered and execution failed: `execution-failed` (terminal for startup re-entry; recovery handles next action)
- `command.execute.before` skips startup planning when the current run is already final, already startup-resolved, or still waiting on the previously issued startup question.
- Existing intentional same-session state carry-over remains valid for non-terminal arbitrary future fields. What changes is only that startup/finalization terminality is now explicit and respected.
- Branch strategy delegation is optional. If a provider returns no decision or an invalid decision, the plugin falls back to the existing deterministic branch proposal logic.
- Model/provider conclusions supported: `stay-on-current-branch`, `switch-to-existing-branch`, `reuse-current-matching-branch`, `create-new-branch`, `ask-user`.
- Project config remains guardrail-oriented. Existing `longLivedBranches`, `defaultMergeTarget`, and `validationRegex` continue to constrain acceptable branch actions; contextual selection lives in the provider decision.

## Implementation Plan

### Tasks

- [x] Add `workflow-run-lifecycle.js` for run keying, startup/finalization status, skip reasoning, and explicit restart detection
- [x] Persist `workflowRunCurrent` in session state and deep-clone it from the workflow store
- [x] Update `command.execute.before` to resolve whether the current invocation reuses the same run or starts a fresh run
- [x] Suppress startup-chain reopening when the current run already resolved startup or already finalized
- [x] Mark startup lifecycle terminal on startup-chain resolution, skip, and execution failure
- [x] Mark workflow-run finalization terminal whenever `finalizationCompletion` is written
- [x] Add hybrid branch planning service that accepts optional model/provider decisions, validates them, and falls back deterministically
- [x] Route startup planning and normal branch planning through the same branch resolver
- [x] Add unit, regression, and e2e coverage for lifecycle suppression and model-decision fallback

### Acceptance Criteria

- [x] Given startup chain already resolved for a workflow run, when the same session/run re-enters `command.execute.before`, then startup chain is not reopened
- [x] Given branch ignore/continue or recovery decisions already occurred in the same startup run, when later planning passes occur, then startup branch planning is not reopened
- [x] Given finalization completed for a workflow run, when a stray same-session `command.executed` arrives, then startup chain is not reopened
- [x] Given the user explicitly requests restart-like intent, when the same command re-enters with restart wording, then a fresh workflow run can be created
- [x] Given a model/provider returns `switch-to-existing-branch`, when the target exists locally, then the plugin emits a validated switch proposal
- [x] Given a model/provider returns an invalid branch decision, when the plugin validates it, then the plugin falls back to deterministic branch planning and emits an audit event
- [x] Given startup planning is skipped for run-lifecycle reasons, when audit logs are inspected, then `startup.chain.skipped` explains why

## Additional Context

### Dependencies

- Existing readiness check and startup-chain execution stack
- Existing branch executor-backed create/switch support
- Existing audit logger contract
- Existing project JSONC guardrails for branch validation

### Testing Strategy

- Unit-test run-key generation, restart detection, and skip reason resolution
- Regression-test same-run startup suppression and model-driven branch decision fallback
- E2E-test same-session replay after startup resolution through real bootstrap plus native question events

### Notes

- Intentional state reset semantics are preserved for ordinary re-entry while the run is still active. The change is that startup and finalization now become explicit terminal states, so those particular decisions do not get recomputed in later same-run passes.
- `ask-user` is represented structurally in the delegated branch decision contract, but this change intentionally does not add a new user-facing clarification UI path; it simply avoids synthesizing a git proposal from that conclusion.
