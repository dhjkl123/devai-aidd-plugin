---
title: 'Configurable Readiness Skip For Init And Baseline'
slug: 'configurable-readiness-skip-for-init-and-baseline'
created: '2026-05-13'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Node.js 22
  - opencode plugin runtime
  - JSONC layered runtime config
  - Ajv 2020 schema validation
  - Custom Node-based unit/regression/e2e test harness
files_to_modify:
  - src/config/defaults.js
  - src/config/load-config.js
  - src/hooks/command-execute-before.js
  - src/hooks/tool-execute-before.js
  - src/services/git/check-repository-readiness.js
  - src/services/git/startup-chain-planner.js
  - src/services/workflow/resolve-workflow-policy.js
  - src/config/validate-config.js
  - src/config/schema/runtime-config.schema.json
  - templates/devai-aidd-plugin.global.jsonc
  - tests/regression.test.js
  - tests/unit/opencode-skill-workflow-guard.test.js
code_patterns:
  - Effective policy is resolved once in bootstrap/pluginContext and consumed by workflow hooks.
  - Runtime config uses layered merge-recover-normalize flow: baseline < global < project.
  - Top-level config keys are strict schema fields, while nested branch/workflowPolicy/audit/debug sections remain forward-compatible.
  - Readiness, branch planning, startup chain planning, and approval publication are orchestrated from command-execute-before through workflowState.
  - tool-execute-before Layer 1 blocks bash git calls before workflow-session mutation rules and currently relies on initProposal plus physical .git presence.
test_patterns:
  - Unit tests use node:assert with direct module imports and synthetic stores/hooks
  - regression.test.js holds broad contract tests for config, readiness, and hook guard behavior
  - E2E scenarios execute real git workspaces for readiness and startup-chain flows
---

# Tech-Spec: Configurable Readiness Skip For Init And Baseline

**Created:** 2026-05-13

## Overview

### Problem Statement

BMAD workflow detection currently triggers the readiness `git init` and baseline commit guard regardless of whether JSONC workflow policy asks for git-backed workflow behavior. That makes temporary folders, greenfield exploration, and dotfile experiments pay an unavoidable git-init/baseline prompt cost. After the recent skill-channel workflow guard expansion, this constraint appears more often because the same readiness flow now applies to more entry points.

### Solution

Add a top-level JSONC option `readiness.skipInitAndBaseline: boolean` with a default of `true`. When enabled, the readiness layer must skip both `git init` and baseline commit gating as a single unit. However, if the effective workflow policy for the detected workflow requires repository-backed lifecycle behavior through `branchRequired === true` or `finalization === "commit-and-push"` or `"commit-optional-push"`, automatically override the skip and re-enable readiness gating. Emit one debug log line when that override is applied.

### Scope

**In Scope:**
- Add top-level `readiness.skipInitAndBaseline` to runtime config and schema.
- Treat `git init` and baseline commit as one readiness gate controlled by the new flag.
- Re-enable that gate automatically when effective workflow policy implies repo history is required.
- Make `command-execute-before` and `tool-execute-before` Layer 1 consume the same effective readiness decision so prompts and bash git blocking cannot diverge.
- Preserve existing config layer precedence so project JSONC can override global JSONC.
- Document the new key and override behavior in the global JSONC template comments.

**Out of Scope:**
- Per-workflow skip keys such as `workflowPolicy[name].skipInitAndBaseline`.
- Changes to the existing init proposal or baseline proposal UX beyond gating them on/off.
- New audit event types or expanded telemetry beyond one debug trace line for override activation.

## Context for Development

### Codebase Patterns

- `src/index.js` loads runtime config once at bootstrap, exposes `pluginContext.runtimeConfig`, and resolves workflow policy through `pluginContext.resolvePolicy(context)`.
- `loadRuntimeConfig` follows `DEFAULT_PLUGIN_CONFIG -> BASELINE_TEMPLATE_TEXT -> global JSONC -> project JSONC`, validates each candidate layer, and only normalizes after validation succeeds.
- `DEFAULT_PLUGIN_CONFIG` intentionally keeps top-level sections present as empty objects. Adding a new strict top-level `readiness` section should follow the same pattern.
- `command-execute-before` owns readiness evaluation, startup-chain planning, baseline detection, and start-instruction generation. It stores `readiness`, `initProposal`, and `commitProposal` back into workflow state.
- `checkRepositoryReadiness` is a pure-ish synchronous service that always probes repo state and currently emits either `ask(git-not-initialized)` or `allow(repository-ready)` unless the git runner is unavailable.
- `tool-execute-before` Layer 1 currently blocks `bash` git commands when `initProposal` is pending, init approval is active, or the workspace lacks `.git`. It does not currently consult resolved workflow policy or runtime readiness config.
- Schema validation exists in two mirrored definitions: runtime source schema in `validate-config.js` and bundled JSON schema in `src/config/schema/runtime-config.schema.json`.
- Test coverage is centralized rather than granular: contract-heavy assertions live in `tests/regression.test.js`, while focused unit behavior for recent skill-trigger logic lives in `tests/unit/opencode-skill-workflow-guard.test.js`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/hooks/command-execute-before.js` | Resolves workflow policy, performs readiness, and seeds workflow state. |
| `src/hooks/tool-execute-before.js` | Layer 1 bash git block that must honor the same effective readiness decision. |
| `src/services/git/check-repository-readiness.js` | Current unconditional init/baseline readiness decision point. |
| `src/services/git/startup-chain-planner.js` | Startup-chain entry point that can currently reintroduce init/baseline steps before direct proposal logic runs. |
| `src/services/workflow/resolve-workflow-policy.js` | Safe default policy resolver that defines effective `branchRequired` and `finalization`. |
| `src/config/defaults.js` | Defines always-present top-level config containers; likely needs `readiness: {}` added. |
| `src/config/load-config.js` | Layered merge/recovery/normalization path that determines global < project precedence. |
| `src/config/validate-config.js` | Source-of-truth runtime config validator used by load pipeline. |
| `src/config/schema/runtime-config.schema.json` | Bundled schema mirror that must stay in sync with validator shape. |
| `templates/devai-aidd-plugin.global.jsonc` | Baseline template comments for operator-facing config documentation. |
| `tests/regression.test.js` | Existing readiness/config/bash-git block contract suite to extend. |
| `tests/unit/opencode-skill-workflow-guard.test.js` | Existing focused tool-hook unit harness pattern reusable for Layer 1 skip cases. |
| `_bmad-output/implementation-artifacts/tech-spec-opencode-skill-workflow-guard.md` | Prior decision record explaining detection/policy orthogonality and current workflow guard model. |

### Technical Decisions

1. The new key is a top-level `readiness` section, not a per-workflow policy field. This keeps the feature aligned with the user's stated scope and preserves policy semantics for branch/finalization as the override source.
2. Default `skipInitAndBaseline` is `true`, which changes the safe default from “always gate init/baseline” to “skip unless the resolved workflow policy proves git history is required.” This must be explicitly documented because it is not behavior-preserving.
3. Effective readiness gating should be computed from two inputs only: merged runtime config and resolved workflow policy for the detected workflow. Do not introduce a second policy resolver inside `tool-execute-before`; instead persist a derived gate decision in workflow state during `command-execute-before` and let Layer 1 consume that state.
4. Override conditions are policy-derived and load-bearing:
   - `branchRequired === true`
   - `finalization === "commit-and-push"`
   - `finalization === "commit-optional-push"`
5. A small shared helper should own the gate computation. Best fit is a dedicated service/helper rather than expanding `resolve-workflow-policy.js`, because the latter should remain policy-resolution-only and the new decision combines config + policy into readiness behavior.
6. Override traceability requires only one debug log line. It should identify the workflow name, the configured skip value, and the policy field that forced readiness back on.
7. The Layer 1 bash+git block must not block `git status` or similar commands when readiness skip is effectively active. If prompts are skipped but bash git is still blocked, the system contradicts itself.
8. `DEFAULT_PLUGIN_CONFIG`, validator schema, bundled schema, and baseline template must all be updated together for the new top-level section. Because top-level `additionalProperties` is `false`, omitting any of these creates either validation failure or missing-container inconsistency.
9. The derived readiness-gate state must be recomputed on every workflow detection and overwritten in workflow state together with the refreshed `readiness` snapshot. Do not rely on carried-forward session state for this field.
10. Startup-chain behavior must use the same effective readiness decision as direct proposal publishing. If skip is active, startup-chain planning must not reintroduce init or baseline steps through a side path.
11. Invalid `readiness.skipInitAndBaseline` values should follow the existing config pipeline contract: validation rejects the offending layer first, then normalization only fills the default for the surviving effective config. Normalization must not “rescue” a bad value inside an otherwise invalid layer.

## Implementation Plan

### Tasks

- [ ] Task 1: Add the new top-level readiness config shape
  - File: `src/config/defaults.js`
  - Action: Add `readiness: {}` to `DEFAULT_PLUGIN_CONFIG` so the new strict top-level section is always present in the default container shape.
  - Notes: Follow the existing pattern used for `branch`, `workflowPolicy`, `audit`, and `debug`.

- [ ] Task 2: Validate and document the readiness config in both schema sources
  - File: `src/config/validate-config.js`
  - Action: Add a top-level `readiness` object schema with `skipInitAndBaseline: { type: "boolean" }` and description text that documents default `true` semantics and policy override behavior.
  - Notes: Keep top-level `additionalProperties: false`; the new section must be explicitly registered.
  - File: `src/config/schema/runtime-config.schema.json`
  - Action: Mirror the same `readiness` schema in the bundled JSON schema.
  - Notes: Source and bundled schemas must remain byte-for-byte semantically aligned.

- [ ] Task 3: Normalize and preserve the new readiness section through config loading
  - File: `src/config/load-config.js`
  - Action: Ensure `normalizeConfig` leaves `readiness` as a plain object and sets `skipInitAndBaseline` to `true` when absent in the accepted effective config.
  - Notes: Preserve existing precedence `baseline < global < project`; project JSONC must still override global JSONC.

- [ ] Task 4: Introduce a shared effective-readiness decision helper
  - File: `src/services/git/check-repository-readiness.js` or a new adjacent helper such as `src/services/git/resolve-readiness-gate.js`
  - Action: Centralize computation of whether init/baseline gating is active based on `runtimeConfig.readiness.skipInitAndBaseline` plus resolved workflow policy override conditions.
  - Notes: Return enough detail to explain why the gate is enabled, including whether an override fired and which policy field triggered it.

- [ ] Task 5: Apply the effective-readiness decision during command startup
  - File: `src/hooks/command-execute-before.js`
  - Action: Compute the effective readiness gate immediately after resolving workflow policy, pass it into readiness evaluation, and suppress init/baseline proposal publication when the gate is inactive.
  - Notes: This includes both the `git-not-initialized` path and the `hasCommit === false` baseline path. Overwrite the derived gate result in workflow state on every detected workflow so later tool-hook decisions cannot reuse stale values from a previous workflow in the same session.

- [ ] Task 6: Extend readiness results to carry gate metadata
  - File: `src/services/git/check-repository-readiness.js`
  - Action: Accept the effective readiness gate input and, when skip is active, avoid returning `ask(git-not-initialized)` or causing downstream baseline prompt generation while still probing repo state enough for branch/finalization logic.
  - Notes: Preserve current `skip` fallback behavior on git-runner failure and current remote-probe behavior.

- [ ] Task 7: Align startup-chain planning with readiness skip
  - File: `src/services/git/startup-chain-planner.js`
  - Action: Make startup-chain planning consume the same effective readiness decision so init/baseline steps are omitted when skip is active and reappear only when policy override re-enables readiness.
  - Notes: This closes the side path where startup-chain logic runs before direct init/baseline proposal publishing in `command-execute-before`.

- [ ] Task 8: Keep Layer 1 bash git blocking consistent with readiness skip
  - File: `src/hooks/tool-execute-before.js`
  - Action: Replace the current unconditional `!dirIsGit` blocking logic with a check against the derived readiness gate stored in workflow state, while preserving blocking when init approval/proposal is actually active.
  - Notes: The non-workflow race-safe path should still block when no workflow state exists and the directory is not a git repo; only tracked workflow sessions with effective skip active should bypass the block.

- [ ] Task 9: Emit override trace logging
  - File: `src/hooks/command-execute-before.js` or the shared readiness helper call site
  - Action: Add one `pluginContext.debug.log(...)` line when config skip is `true` but policy override re-enables readiness.
  - Notes: Include workflow name, configured skip value, and the triggering override cause (`branchRequired` or `finalization` value).

- [ ] Task 10: Document the operator-facing configuration
  - File: `templates/devai-aidd-plugin.global.jsonc`
  - Action: Add a commented `readiness` section that explains `skipInitAndBaseline`, default `true`, and the automatic re-enable cases.
  - Notes: Keep wording consistent with the actual behavior change; this template is the baseline operators read first.

- [ ] Task 11: Extend tests across config, readiness, startup-chain, and Layer 1 guard behavior
  - File: `tests/regression.test.js`
  - Action: Add config-loading, readiness-contract, startup-chain, and bash-git-block regression cases for default skip, explicit false, project-overrides-global, and policy override re-enable scenarios.
  - Notes: Prefer extending the existing contract suites where similar assertions already live.
  - File: `tests/unit/opencode-skill-workflow-guard.test.js`
  - Action: Add focused hook tests that show Layer 1 allows git commands only when workflow state says readiness skip is effectively active.
  - Notes: Reuse the existing synthetic workflow-state/debug-log harness style.

### Acceptance Criteria

- [ ] AC 1: Given no explicit readiness override in either JSONC layer, when `loadRuntimeConfig` resolves the effective config, then `config.readiness.skipInitAndBaseline === true`.
- [ ] AC 2: Given global JSONC sets `readiness.skipInitAndBaseline` to one value and project JSONC sets it to the opposite value, when runtime config is resolved, then the project value wins in the effective config.
- [ ] AC 3: Given `readiness.skipInitAndBaseline === true` and a workflow whose resolved policy has `branchRequired !== true` and `finalization === "no-forced-finalization"`, when `command.execute.before` runs in a non-git directory, then workflow state contains no `initProposal` and no init approval is published.
- [ ] AC 4: Given `readiness.skipInitAndBaseline === true` and a git repository with no commits and a workflow whose resolved policy does not require repo history, when `command.execute.before` runs, then workflow state contains no baseline `commitProposal`.
- [ ] AC 5: Given `readiness.skipInitAndBaseline === false`, when `command.execute.before` runs in a non-git directory, then readiness behaves exactly as before and publishes the init proposal path.
- [ ] AC 6: Given `readiness.skipInitAndBaseline === true` and resolved workflow policy `branchRequired === true`, when readiness is evaluated, then init/baseline gating is re-enabled and one debug log line records the override cause.
- [ ] AC 7: Given `readiness.skipInitAndBaseline === true` and resolved workflow policy `finalization === "commit-and-push"`, when readiness is evaluated, then init/baseline gating is re-enabled and one debug log line records the override cause.
- [ ] AC 8: Given `readiness.skipInitAndBaseline === true` and resolved workflow policy `finalization === "commit-optional-push"`, when readiness is evaluated, then init/baseline gating is re-enabled and one debug log line records the override cause.
- [ ] AC 9: Given `readiness.skipInitAndBaseline === true` and a workflow whose resolved policy does not require repo history, when startup-chain planning runs, then no init step and no baseline step are included in the startup chain.
- [ ] AC 10: Given `readiness.skipInitAndBaseline === true` and a workflow whose resolved policy requires repo history, when startup-chain planning runs, then init/baseline steps are still included as needed and one debug log line records the override cause.
- [ ] AC 11: Given one workflow in a session stores effective readiness skip as active and a later workflow in the same session resolves to override-on, when `command.execute.before` handles the later workflow, then workflow state is overwritten with the later gate decision and Layer 1 follows the later workflow rather than the earlier one.
- [ ] AC 12: Given a tracked workflow session where effective readiness skip is active, when the model invokes `bash` with `git status`, then `tool-execute-before` Layer 1 does not throw `BASH_GIT_BLOCK_MESSAGE`.
- [ ] AC 13: Given a tracked workflow session where readiness has been re-enabled by policy override and no init approval has been completed yet, when the model invokes `bash` with a git command, then `tool-execute-before` Layer 1 still throws the existing canonical block message.
- [ ] AC 14: Given no workflow session exists yet and the directory is not a git repository, when the model invokes `bash` with a git command, then the race-safe non-workflow Layer 1 block still throws the canonical block message.
- [ ] AC 15: Given invalid JSONC such as `"readiness": { "skipInitAndBaseline": "yes" }`, when config validation runs, then the layer is rejected by schema validation and recovery falls back to the last valid layer rather than normalizing the bad value in place.

## Additional Context

### Dependencies

- Existing runtime config load/merge pipeline must already support adding a new strict top-level section.
- Existing debug logger path through `pluginContext.debug.log` is sufficient for override tracing.
- Readiness skip must coexist with current workflow-state flags like `gitInitSkipped` and `baselineSkipped` without changing their meaning.
- `src/index.js` already provides `pluginContext.runtimeConfig` and `pluginContext.resolvePolicy`; no new bootstrap dependency should be necessary beyond consuming those existing surfaces.

### Testing Strategy

- Add config validation/load tests that cover:
  - implicit default `true`
  - explicit `false`
  - project-overrides-global
  - invalid non-boolean recovery
- Add readiness contract tests that cover:
  - non-git workspace with skip active
  - no-commit repo with skip active
  - branchRequired override
  - `commit-and-push` override
  - `commit-optional-push` override
- Add startup-chain tests that cover:
  - skip-active workflow omits init/baseline startup-chain steps
  - override-active workflow still plans init/baseline startup-chain steps
- Add hook tests for `command-execute-before` to prove init/baseline prompts disappear when skip is active and return when override applies.
- Add Layer 1 tool-hook tests to prove:
  - tracked skipped session allows `git status`
  - tracked overridden session still blocks
  - non-workflow non-git session still blocks
  - later workflows in the same session overwrite earlier readiness-gate state
- Manual verification after implementation:
  - run a policy-light BMAD workflow in a temp non-git directory and confirm no init prompt appears
  - run a branch-required BMAD workflow in the same directory and confirm init gating reappears with one debug log line
  - run `npm test` to confirm no regression across existing readiness/startup-chain contracts

### Notes

- Because the default is now `true`, release notes and template comments must explicitly call out that repo bootstrapping is no longer the default behavior for policy-light workflows.
- Keep the override model centralized. If `command-execute-before` and `tool-execute-before` each infer it differently, future regressions will be difficult to diagnose.
- High-risk area: preserving the race-safe Layer 1 behavior for pre-workflow `bash git ...` calls while relaxing only tracked sessions with effective readiness skip.
- Known limitation: because this is a global readiness flag, all policy-light workflows inherit the skip unless their resolved policy triggers the override. That breadth is intentional for this change.
