---
title: 'Model-Driven Finalization Commit Delegation'
slug: 'model-driven-finalization-commit-delegation'
created: '2026-05-15T00:11:08+09:00'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Node.js'
  - 'ESM plugin runtime'
  - 'Native question/prompt hook orchestration'
  - 'Git subprocess integration'
  - 'Node built-in test runner'
files_to_modify:
  - 'src/hooks/command-execute-before.js'
  - 'src/hooks/tool-execute-before.js'
  - 'src/hooks/tool-execute-after.js'
  - 'src/services/approval/build-finalization-sentinel-instruction.js'
  - 'src/services/workflow/evaluate-workflow-finalization.js'
  - 'src/services/git/execute-approved-action.js'
  - 'src/index.js'
  - 'tests/unit/sentinel-finalization-trigger.test.js'
  - 'tests/unit/build-finalization-sentinel-instruction.test.js'
  - 'tests/regression.test.js'
code_patterns:
  - 'Hook-driven workflow orchestration across command.execute.before, tool.execute.before, and tool.execute.after'
  - 'Instruction-builder pattern for forcing model/native Question tool behavior'
  - 'Workflow state mutation with terminal flags such as finalizationTriggered, approvalCurrent, and commitProposal'
  - 'Plugin-context indirection for gitRunner, gitActionRunner, listChangedFiles, and prompt delivery'
  - 'Best-effort audit/debug logging with non-throwing observability'
test_patterns:
  - 'Focused unit tests for sentinel builder and sentinel trigger behavior'
  - 'Regression coverage for finalization, commit proposal, and git execution contracts'
---

# Tech-Spec: Model-Driven Finalization Commit Delegation

**Created:** 2026-05-15T00:11:08+09:00

## Overview

### Problem Statement

The current workflow finalization path relies on the plugin to receive the finalization signal, connect the user response to the commit/skip branch, and directly execute Git-aware final commit behavior. In practice, the plugin-side Git subprocess path is intermittently unstable, which makes final commit creation unreliable and can also interfere with clean workflow completion. The resulting behavior is that the finalization question may appear, but `Commit` can still fail before the workflow reaches a clean terminal state.

### Solution

Keep sentinel as an internal finalization trigger only, and delegate the actual user-facing finalization choice to the model via hook-injected instructions. The plugin should strongly instruct the model to call the `Question` tool with `Commit` and `Skip`, include a suggested commit message, and require the model to either perform the commit with that suggested message or skip automatic commit while still completing the user-invoked workflow through its normal terminal path.

### Scope

**In Scope:**
- Redefine sentinel as an internal trigger rather than a user-answer collection mechanism
- Inject model-facing finalization instructions that require a `Question` tool call with `Commit` and `Skip`
- Surface a suggested commit message as part of the finalization flow
- Define `Commit` behavior so the model performs commit execution using the suggested message
- Define `Skip` behavior so the workflow completes without automatic commit
- Guarantee that both `Commit` and `Skip` end in successful completion of the workflow the user originally invoked
- Prevent duplicate finalization loops, redundant approvals, or recovery-mode endings for the normal `Commit`/`Skip` branches

**Out of Scope:**
- Full redesign of startup Git init, baseline commit, or branch planning chains
- Push automation redesign
- Root-cause elimination of intermittent Git subprocess ETIMEDOUT/SIGTERM failures
- Broad rework of generic bash/git blocking policy outside the finalization path

## Context for Development

### Codebase Patterns

- Finalization is coordinated through `command.execute.before`, `tool.execute.before`, and `tool.execute.after`, with the start hook injecting sentinel instructions and the after hook consuming the resulting question answer.
- User-facing approval prompting already relies on instruction builders and native `Question` tool expectations routed through `promptAsync` metadata and hook guards, so the finalization redesign should extend an existing model-delegation pattern rather than invent a new channel.
- Workflow completion semantics depend on workflow-state cleanup and on suppressing stale `approvalCurrent`, `commitProposal`, `branchProposal`, and `finalizationTriggered` values after terminal decisions.
- `evaluateWorkflowFinalization()` is the canonical finish-phase source of tracked outputs and commit proposal derivation; changing responsibility for the user-facing final question must not break output detection or audit events.
- Git execution is abstracted behind `pluginContext.gitRunner`, `pluginContext.gitActionRunner`, and `pluginContext.listChangedFiles`, which means the redesign can shift ownership between plugin and model without rewriting low-level runner plumbing everywhere.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/hooks/command-execute-before.js` | Detects workflow start, injects the sentinel instruction text, seeds `finalizationTriggered`, and handles readiness/startup-chain state before normal execution begins. |
| `src/hooks/tool-execute-before.js` | Enforces active approval and native `Question` tool contract rules, which likely need extension so model-driven finalization questions remain guarded but not mistaken for plugin-owned sentinel responses. |
| `src/hooks/tool-execute-after.js` | Current load-bearing finalization branch: parses sentinel `Commit`/`Skip`, calls `evaluateWorkflowFinalization()`, builds a commit proposal, and invokes `executeApprovedAction()` directly. |
| `src/services/approval/build-finalization-sentinel-instruction.js` | Defines the current sentinel instruction text, including the natural-language title, suggested commit message placeholder, and the rule that plugin takes over after the sentinel question. |
| `src/services/workflow/evaluate-workflow-finalization.js` | Computes finish-phase tracked files and finalization assessment, persists `finalizationAssessment`/`commitProposal`, and emits audit events for output detection. |
| `src/services/git/execute-approved-action.js` | Owns plugin-side commit execution and the follow-on completion state transitions; current finalization commit path depends on this service. |
| `src/index.js` | Bridges model-facing prompt delivery through `requestApproval`, `requestStartupChainApproval`, and `requestRecoveryDecision`, and wires plugin context helpers such as `gitActionRunner` and `listChangedFiles`. |
| `tests/unit/sentinel-finalization-trigger.test.js` | Pins the current sentinel behavior, including direct plugin-side commit execution on `Commit` and no-op completion on `Skip`. |
| `tests/unit/build-finalization-sentinel-instruction.test.js` | Pins sentinel instruction wording and currently asserts that plugin-owned commit behavior is described in the injected instruction. |
| `tests/regression.test.js` | Broad integration contract coverage for finalization, commit proposals, git execution, and question/approval behavior. |

### Technical Decisions

- Sentinel header contract is retained, but only as an internal trigger contract between plugin and model. It MUST NOT be the user-facing final question header and MUST NOT be used as the mechanism that carries the user's final `Commit`/`Skip` response back into plugin-owned commit execution.
- Sentinel should remain only as an internal finalization trigger emitted at workflow start and consumed as a signal that the workflow has reached its terminal phase; it should stop acting as the direct user-answer transport that triggers plugin-owned commit execution.
- The model should own the user-facing final question by calling the `Question` tool with `Commit` and `Skip`, reusing the existing strong-instruction pattern already used for other approvals.
- The suggested commit message should still originate from plugin-owned proposal logic so the workflow can preserve consistent message generation, but the model should be instructed to use that exact message when the user chooses `Commit`.
- `Commit` and `Skip` must both result in successful completion of the originally invoked workflow; neither branch should leave the workflow in recovery mode, approval-pending state, or an extra finalization loop.
- `Skip` completion is defined as a terminal workflow state in which `finalizationTriggered` is consumed, any active finalization proposal/request state is cleared, no recovery gate is opened, and later `finish`/re-entry processing for the same completed workflow session does not re-issue the finalization question unless a brand-new workflow run is detected.
- `Commit` completion is defined as a terminal workflow state reached only after the model-owned commit attempt is observed as successful and the same finalization cleanup rules are applied: clear finalization request/proposal state, mark the workflow as terminal, and suppress duplicate finalization prompts for that completed run.
- Delegated finalization requires a dedicated, scoped workflow-state allowance flag for the terminal window between delegated final question issuance and post-answer completion. That allowance must permit only the specific model-owned final question and final Git commit path for the current workflow session, and must be cleared immediately once `Commit` or `Skip` completion is recorded.
- The redesign must remove mixed ownership where both plugin and model can independently attempt the same final commit path, because the current overlap risks duplicate state transitions and unreliable terminal behavior.

## Implementation Plan

### Tasks

- [x] Task 1: Reframe finalization sentinel as an internal trigger only
  - File: `src/services/approval/build-finalization-sentinel-instruction.js`
  - Action: Rewrite the sentinel instruction so it no longer tells the model that the plugin will take over commit execution after the final question. Instead, instruct the model to use the sentinel as an internal end-of-workflow trigger, compute the suggested commit message, call the user-facing `Question` tool itself with `Commit` and `Skip`, and then complete the workflow according to the selected branch.
  - Notes: Preserve the hidden internal header contract if still needed for detection, but remove wording that implies plugin-owned commit/skip handling after the question is answered.

- [x] Task 2: Change workflow start injection to stage model-driven finalization behavior
  - File: `src/hooks/command-execute-before.js`
  - Action: Update the start-phase sentinel injection so the model receives strong instructions that the finalization question must be model-owned, emitted only at the end of the workflow, and followed by normal workflow termination semantics for both `Commit` and `Skip`.
  - Notes: Keep readiness/startup-chain behavior unchanged except where the finalization contract text must be updated.

- [x] Task 3: Remove plugin-owned sentinel answer execution from the finish hook
  - File: `src/hooks/tool-execute-after.js`
  - Action: Replace the current branch that parses sentinel `Commit`/`Skip`, evaluates finalization, builds a commit proposal, and directly calls `executeApprovedAction()`. The new behavior should treat sentinel as a workflow-finalization trigger/state transition only, then allow the model-owned final question + subsequent commit/skip actions to drive completion instead of plugin-side pre-approved commit execution.
  - Notes: This is the main responsibility shift. Ensure duplicate, premature, and already-finalized guards still work, but repurpose them around the new delegation model. The sentinel internal header must remain available for trigger matching, but final user answers must no longer flow through that header path.

- [x] Task 4: Redefine finish-phase state transitions so both branches terminate the workflow cleanly
  - Files: `src/hooks/tool-execute-after.js`, `src/services/workflow/evaluate-workflow-finalization.js`, `src/services/workflow/workflow-state.js`
  - Action: Define explicit terminal cleanup semantics so both `Commit` and `Skip` clear or transition any finalization-related state (`finalizationTriggered`, `approvalCurrent`, `commitProposal`, stale pending actions) without opening recovery or re-entering finalization.
  - Notes: The important contract is not only commit execution but successful workflow closure after either user decision. Write the exact terminal-state contract into workflow state so later `finish` or command re-entry cannot mistake a completed `Skip` branch for an unfinished workflow.

- [x] Task 5: Route suggested commit message generation into the delegated model flow
  - Files: `src/services/workflow/commit-proposal.js`, `src/services/workflow/evaluate-workflow-finalization.js`, `src/index.js`
  - Action: Ensure the suggested commit message is still deterministically generated by plugin logic and made available to the model-facing finalization instruction or question payload. If `Commit` is selected, the model must be instructed to use that exact message.
  - Notes: The message source should remain centralized so tests and downstream audits can assert stable behavior.

- [x] Task 6: Decide how model-owned commit execution is permitted and observed
  - Files: `src/hooks/tool-execute-before.js`, `src/index.js`, any git-guard logic touched by finalization
  - Action: Adjust question/git guard logic so a model that is in the delegated finalization path can ask the final `Question` and then perform the commit without being blocked by plugin assumptions that commit must come from `executeApprovedAction()`.
  - Notes: This requires a scoped allowance/state flag, not a broad git bypass. Specify exactly when the allowance is created, what tools/commands it permits, how it is tied to the current session, and when it is cleared on both `Commit` and `Skip`.

- [x] Task 7: Preserve audit/debug observability for delegated finalization
  - Files: `src/hooks/tool-execute-after.js`, `src/index.js`, `src/services/approval/*`, and relevant debug/audit helpers
  - Action: Update audit/debug events so operators can distinguish internal sentinel trigger, delegated question emission, commit branch completion, skip branch completion, and workflow terminal closure.
  - Notes: Existing `sentinel.received` / `sentinel.skipped` meanings may need revision because the plugin will no longer be the actor executing the commit branch itself.

- [x] Task 8: Update tests to match delegated finalization semantics
  - Files: `tests/unit/sentinel-finalization-trigger.test.js`, `tests/unit/build-finalization-sentinel-instruction.test.js`, `tests/regression.test.js`
  - Action: Replace assertions that currently expect sentinel `Commit` to immediately execute plugin-side commit logic. Add coverage for model-driven question wording, suggested message propagation, `Commit` branch terminal workflow completion, `Skip` branch terminal workflow completion, and prevention of duplicate/recovery side effects.
  - Notes: The current tests explicitly pin direct plugin commit behavior and will need coordinated updates.

### Acceptance Criteria

- [x] AC 1: Given a workflow that reaches finalization with eligible output changes, when the plugin injects finalization guidance, then sentinel remains an internal trigger and the model is instructed to ask the user a `Commit`/`Skip` question itself rather than handing user response ownership back to the plugin.
- [x] AC 2: Given the model reaches the terminal step of a workflow with finalizable changes, when it calls the user-facing final `Question` tool, then the question includes `Commit` and `Skip` and shows the exact suggested commit message generated by plugin logic.
- [x] AC 3: Given the user chooses `Commit`, when the model continues from the final question, then it uses the suggested commit message for commit execution and the originally invoked workflow reaches a normal successful terminal state with no extra recovery or duplicate finalization prompt.
- [x] AC 4: Given the user chooses `Skip`, when the model continues from the final question, then no automatic commit is performed and the originally invoked workflow still reaches a normal successful terminal state with no recovery flow and no repeated finalization prompt.
- [x] AC 4a: Given the user chooses `Skip`, when terminal cleanup completes, then `finalizationTriggered`, active finalization proposals/requests, and any delegated-finalization allowance state are cleared for that workflow run, and a later `finish` or command re-entry for the same completed run does not ask the finalization question again.
- [x] AC 5: Given a workflow hits finalization with no remaining working-tree changes, when finish-phase evaluation occurs, then the delegated finalization question is not re-issued and the workflow completes without opening an erroneous commit branch.
- [x] AC 6: Given the sentinel is triggered prematurely or more than once, when the plugin evaluates the event, then it preserves current premature/duplicate protection semantics and prevents repeated or invalid finalization branches from being exposed.
- [x] AC 7: Given delegated finalization is active, when the model asks the final question and follows either branch, then plugin state cleanup prevents stale `approvalCurrent`, `commitProposal`, or `finalizationTriggered` values from leaking into later workflow turns.
- [x] AC 7a: Given delegated finalization is active, when the model proceeds from the final question to the final commit path, then the plugin allows only that scoped session-bound final question/commit sequence and does not open a general-purpose Git allowance for unrelated commands or later turns.
- [x] AC 8: Given debug and audit logging are enabled, when delegated finalization runs, then operators can distinguish internal sentinel trigger, delegated final question path, and terminal completion outcome for both `Commit` and `Skip`.

## Additional Context

### Dependencies

- Existing workflow state model and finish-phase finalization detection
- Existing model instruction / `Question` tool integration path
- Existing suggested commit message generation logic or equivalent replacement path
- Existing audit/debug expectations around finalization and approval flows
- Existing git guard rules in `tool.execute.before` that may currently assume plugin-owned final Git execution

### Testing Strategy

- Update unit tests that currently assume sentinel `Commit` directly triggers plugin-side commit execution.
- Add or adjust regression coverage so model-driven finalization still preserves exact question contract, suggested commit message propagation, and terminal workflow cleanup.
- Verify both branches:
  - `Commit` leads to commit execution plus normal workflow completion
  - `Skip` leads to normal workflow completion with no recovery/failure state
- Preserve or explicitly revise observability expectations in debug/audit logs for finish-phase finalization.
- Run targeted unit tests for sentinel instruction and sentinel trigger behavior first, then broader regression coverage for finalization and guard contracts.

### Notes

- Existing sentinel and direct-commit specs already cover adjacent behavior, so this work likely modifies rather than replaces the surrounding finalization architecture.
- Special attention is needed around normal workflow termination semantics after either branch, especially avoiding stale `approvalCurrent`, `commitProposal`, or `finalizationTriggered` state.
- The highest-risk area is mixed ownership during transition: if plugin and model both believe they own final commit execution, the result could be duplicate commits, blocked Git commands, or workflows that appear complete but leave state pending.
- A second high-risk area is preserving guard strength: the redesign should delegate final question/commit behavior without opening a broad path for arbitrary Git usage outside the intended terminal workflow window.

## Review Notes
- Adversarial-style self review completed during implementation.
- Findings: 0 total, 0 fixed, 0 skipped.
- Resolution approach: skip
