# Story 1.1: Register Runtime Hooks Through the Plugin Bootstrap

Status: done

## Story

As a plugin operator,
I want the plugin bootstrap to register the expected opencode/DevAI hooks,
so that workflow-aware Git guard behavior is activated consistently when the runtime loads the plugin.

## Acceptance Criteria

1. **Given** the plugin is loaded in a supported Node.js opencode/DevAI runtime  
   **When** the bootstrap entry point executes  
   **Then** it returns the expected hook map for command, tool, permission, file edit, and session events  
   **And** the bootstrap preserves the existing legacy core integration contract without requiring command changes.
2. **Given** the runtime loads the plugin in an unsupported or incomplete environment  
   **When** bootstrap dependencies are missing or invalid  
   **Then** the plugin fails in a controlled way that does not corrupt repository state  
   **And** the supported runtime requirement is explicit in logs or diagnostics.
3. **Given** legacy compatibility files may be required for supported installations  
   **When** the plugin bootstrap executes during ordinary runtime loading  
   **Then** it does not silently perform install/setup migration work as part of hook registration  
   **And** compatibility file generation policy is treated as a separate install/setup or legacy-compatibility concern.

## Tasks / Subtasks

- [x] Restore a valid bootstrap-to-legacy integration path (AC: 1, 2)
  - [x] Resolve the missing legacy entry imported by [src/index.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js:1) and [tests/regression.test.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js:8) without changing the external plugin factory contract.
  - [x] Keep `DevaiAiddGuardPlugin` as the bootstrap entry and continue exporting `DevaiGitWorkflowPlugin` as the compatibility alias from [src/index.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js:18).
  - [x] Ensure bootstrap initialization does not perform implicit install/setup migration work during ordinary runtime loading; startup may load config, register hooks, and emit diagnostics, but compatibility file generation policy belongs to explicit install/setup or legacy-compatibility behavior.

- [x] Return the complete runtime hook map from the bootstrap (AC: 1)
  - [x] Preserve the existing delegated wrappers for `command.execute.before`, `tool.execute.before`, `tool.execute.after`, and `event`.
  - [x] Replace the current placeholder-only behavior in [src/hooks/permission-asked.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js:1) and [src/hooks/file-edited.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js:1) with explicit, bounded hook handlers that are safe even when the legacy core has no dedicated implementation.
  - [x] Keep missing-handler behavior deterministic: no throw for optional unsupported hooks, no accidental state mutation, and no silent change to command names or hook names.

- [x] Add controlled bootstrap diagnostics for unsupported or incomplete runtime state (AC: 2)
  - [x] Fail fast with a clear error when required bootstrap dependencies or imports are unavailable.
  - [x] Emit runtime/bootstrap diagnostics through the existing audit logger path in [src/audit/logger.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\audit\logger.js:16) so supportability does not depend on `console` only.
  - [x] Make the supported runtime expectation explicit in diagnostics: Node.js ESM plugin runtime, packaged for Node 22, matching the current build target in [scripts/build.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\build.js:15).

- [x] Expand regression coverage around bootstrap registration and safety (AC: 1, 2)
  - [x] Update [tests/regression.test.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js:107) to verify the wrapper exposes all required hook keys, including `permission.asked` and `file.edited`.
  - [x] Add assertions that placeholder hooks are either valid no-ops or delegated handlers with stable behavior across wrapper and built artifact variants.
  - [x] Ensure `npm run build && npm test` passes from a clean checkout. The original failure mode was a missing `src/policies/legacy/devai-git-workflo.js`; the regression now also requires a prebuilt `dist/devai-aidd-guard.js` so build and test failures are attributed correctly.

### Review Follow-ups (AI)

- [x] [AI-Review][Medium] Add regression coverage for the baseline missing-bootstrap-dependency/import failure mode so the suite verifies the specific restored path, not only invalid runtime input. [tests/regression.test.js]
- [x] [AI-Review][Low] Align optional-chaining style across hook factories — `permission-asked.js` and `file-edited.js` use `legacyHandlers?.["…"]` while the others use `legacyHandlers["…"]`; `src/index.js:61-63` already guarantees a non-null map so the defensive `?.` is dead. [src/hooks/permission-asked.js:3, src/hooks/file-edited.js:3]
- [x] [AI-Review][Low] Avoid duplicate `loadWorkflowCommands` disk reads — wrapper diagnostics call it at `src/index.js:40` and the legacy core re-reads in `src/policies/legacy/devai-git-workflo.js:55`; share the result or move diagnostics inside the legacy core.
- [x] [AI-Review][Low] Decouple build from regression run — `tests/regression.test.js:191-194` invokes `scripts/build.js` inline, coupling test execution to build execution; prefer `npm run build && npm test` so failures are attributed correctly.
- [x] [AI-Review][Low] Decide whether `permission.asked` / `file.edited` no-ops should leave an audit trail when no legacy handler exists — currently they return `undefined` silently, which makes future regressions hard to diagnose. [src/hooks/permission-asked.js:8, src/hooks/file-edited.js:8]

## Dev Notes

### Story Intent

This story is the bootstrap integrity gate for the rest of Epic 1. The next stories assume the plugin can be loaded by the runtime, resolve configuration, and expose a stable hook surface. Do not implement workflow classification logic, branch policy decisions, Git execution, or install/setup migration policy in this story beyond what is required to restore and harden bootstrap registration.

### Verified Baseline Findings

- `npm test` currently fails on 2026-05-08 because the test script checks `src/policies/legacy/devai-git-workflo.js`, but that file does not exist in the repository.
- [src/index.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js:1) imports the same missing legacy path, so bootstrap cannot succeed as the code stands.
- The wrapper already intends to expose six runtime entries:
  - `command.execute.before`
  - `tool.execute.before`
  - `tool.execute.after`
  - `permission.asked`
  - `file.edited`
  - `event`
- Two hook wrappers are still TODO-only stubs:
  - [src/hooks/permission-asked.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js:1)
  - [src/hooks/file-edited.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js:1)

### Technical Requirements

- Preserve the ESM runtime model already declared in [package.json](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\package.json:1). The bootstrap and built artifact must remain importable as ECMAScript modules.
- Preserve the current thin-wrapper architecture:
  - `src/index.js` owns adapter construction, config loading, compatibility bridge generation, audit logger setup, and hook map assembly.
  - `src/hooks/*.js` stay thin and delegate to either the legacy core or explicit bounded wrapper behavior.
- Keep audit logging best-effort and non-blocking. Logging failures must never block plugin bootstrap. Reuse the existing behavior in [src/audit/logger.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\audit\logger.js:16).
- Do not introduce a database, background service, or alternate runtime bootstrap path. The architecture and PRD both constrain persistence to config files plus in-memory/session state.
- Treat compatibility bridge-file generation policy as out of scope for Story 1.1 runtime bootstrap behavior. If compatibility files are required, they should be defined through install/setup or explicit legacy-migration behavior, not silently implied by hook registration alone.

### Architecture Compliance

- This story satisfies the Epic 1 startup contract from the planning artifacts: the plugin must integrate with the opencode/DevAI runtime plugin system and apply behavior through startup/session/tool hooks before later stories add policy resolution.
- Maintain backward compatibility with existing BMAD commands. The wrapper must not require users to rename commands or change invocation style.
- Unsupported or unimplemented hook behavior must be explicit and bounded. A hook may be a no-op, but it must not imply capabilities the runtime cannot actually provide.
- Compatibility bridge-file lifecycle rules belong to install/setup or legacy-compatibility planning and should not be used to expand Story 1.1 beyond bootstrap registration concerns.

### Library / Framework Requirements

- Runtime packaging remains Node.js ESM:
  - Node.js current docs state that JavaScript is treated as ESM when `package.json` sets `"type": "module"`. This matches the current package configuration.  
    Source: [Node.js ESM docs](https://nodejs.org/download/release/latest-jod/docs/api/esm.html)
- Build output remains esbuild-based and Node-targeted:
  - esbuild documents that Node-focused bundles default to CommonJS unless format is explicitly set; the current build intentionally forces `--format=esm`, so bootstrap changes must preserve that expectation.  
    Source: [esbuild API docs](https://esbuild.github.io/api/)

### File Structure Requirements

- Primary implementation files for this story:
  - [src/index.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js:1)
  - [src/hooks/command-execute-before.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js:1)
  - [src/hooks/tool-execute-before.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-before.js:1)
  - [src/hooks/tool-execute-after.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-after.js:1)
  - [src/hooks/permission-asked.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js:1)
  - [src/hooks/file-edited.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js:1)
  - [src/hooks/session.js](C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\session.js:1)
  - A restored or corrected legacy core entry under `src/` that satisfies both bootstrap imports and regression tests
- Do not move bootstrap responsibilities into test code, build scripts, or config modules.
- Do not broaden this story into the fuller future architecture folder map described in the architecture draft. Implement only the minimum source layout needed to restore and harden the current bootstrap path.

### Testing Requirements

- Required verification:
  - `npm test`
  - `npm run build`
- Regression focus:
  - wrapper module can be imported
  - built artifact can be imported after build
  - all expected hook keys are present
  - wrapper and built variants preserve legacy parity where a legacy handler exists
  - optional hooks remain safe when no legacy handler exists
- Add tests for the specific failure mode discovered in baseline: missing bootstrap dependency/import should fail clearly and early.

### Git Intelligence Summary

- Recent commits are planning-artifact heavy, not implementation heavy:
  - `dfaf0d9` merged sprint planning output
  - `576fa74` created sprint status
  - `110a0ac` merged epics and readiness artifacts
- There is no prior implementation story file to inherit code-level learnings from. The dev agent should treat the current repository state and failing test baseline as the authoritative starting point.

### Project Structure Notes

- The architecture document describes a larger target structure including `services/`, `events/`, and `policies/legacy/`, but the current repository only contains `adapters/`, `audit/`, `config/`, `hooks/`, `utils/`, and `src/index.js`.
- For this story, prioritize coherence with the actual repository over aspirational structure in the architecture draft.
- Any restored legacy path must align both runtime bootstrap imports and regression-test imports; do not fix one and leave the other stale.
- Installation/setup-time compatibility file generation is a separate concern from runtime bootstrap registration and should be coordinated with the legacy compatibility story rather than expanded further here.

### References

- Epic and story definition: [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Workflow-Aware Safe Start]
- Product scope and compatibility requirements: [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements]
- Architecture constraints and target runtime: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- Bootstrap implementation baseline: [Source: src/index.js]
- Hook wrapper baseline: [Source: src/hooks/permission-asked.js], [Source: src/hooks/file-edited.js], [Source: src/hooks/session.js]
- Regression baseline: [Source: tests/regression.test.js]
- Build target baseline: [Source: scripts/build.js]
- Official runtime references:
  - [Node.js ESM docs](https://nodejs.org/download/release/latest-jod/docs/api/esm.html)
  - [esbuild API docs](https://esbuild.github.io/api/)

## Change Log

- 2026-05-08: Restored the legacy bootstrap entry, hardened wrapper hook registration, added bootstrap failure diagnostics, and expanded regression coverage to rebuild and verify the built artifact.
- 2026-05-08: Addressed the Story 1.1 review follow-up by adding fixture-based regression coverage for the missing legacy bootstrap import path and re-running the required validations.
- 2026-05-08: Code review — AC1/AC2 verified, AC3 bootstrap-side compatibility-file generation deferred to Story 4.2 per sprint-change-proposal-2026-05-08; recorded four LOW follow-ups (hook style, duplicate command reads, build/test coupling, silent no-op hooks). Status held at `in-progress` until Story 1.1 AC text is amended per Proposals A/B and Story 4.2 takes over the compatibility-file generation. `npm test` and `npm run build` pass.
- 2026-05-08: Addressed the four remaining LOW review follow-ups — aligned hook factories on direct `legacyHandlers["…"]` access, removed the duplicate `loadWorkflowCommands` disk read by passing the wrapper-loaded set into the legacy core, decoupled the build from the regression run (regression now requires a prebuilt `dist/devai-aidd-guard.js`), and added a bootstrap-time audit entry that records which optional hooks register as no-ops. `npm run build && npm test` pass.
- 2026-05-08: Code review (post Story 4.2 deferral) — fixed two LOW findings: (1) clarified the clean-checkout task wording to reflect the `npm run build && npm test` contract, and (2) aligned `permission.asked` / `file.edited` hook factories on an explicit `(input)` signature for consistency with the other wrappers. Compatibility-bridge file generation concerns remain deferred to Story 4.2 per sprint-change-proposal-2026-05-08. `npm run build && npm test` pass; status moved to `done`.

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npm test` on 2026-05-08 fails with `MODULE_NOT_FOUND` for `src/policies/legacy/devai-git-workflo.js`.
- `npm test` on 2026-05-08 passes after restoring `src/policies/legacy/devai-git-workflo.js`, rebuilding `dist/devai-aidd-guard.js`, and extending regression assertions for wrapper-only hooks.
- `npm run build` on 2026-05-08 passes and regenerates `dist/devai-aidd-guard.js`.
- `npm test` on 2026-05-08 passes with the added fixture-based regression that removes `src/policies/legacy/devai-git-workflo.js` from a temporary copied source tree and verifies the bootstrap import fails with an explicit missing-module error.
- `npm run build && npm test` on 2026-05-08 pass after the LOW follow-up fixes; regression now expects a prebuilt `dist/devai-aidd-guard.js` and reports `wrapperLogs: 3` / `builtLogs: 3`, reflecting the new bootstrap audit entry for no-op hook registration.

### Completion Notes List

- Restored the missing legacy bootstrap source file at `src/policies/legacy/devai-git-workflo.js` so source imports, syntax checks, and regression tests all resolve the same path.
- Updated bootstrap error handling in `src/index.js` to validate runtime inputs, emit explicit diagnostics, and fail with a supported-runtime message instead of an opaque module or environment error.
- Replaced the TODO-only wrapper implementations for `permission.asked` and `file.edited` with deterministic delegated-or-no-op handlers.
- Expanded `tests/regression.test.js` so it rebuilds the artifact before comparison, verifies wrapper-only hook registration, and checks the bootstrap failure message shape for invalid runtime input.
- Resolved the review follow-up by adding a fixture-based regression that proves the restored `src/policies/legacy/devai-git-workflo.js` path is required for bootstrap import success and fails clearly when removed.
- Verified the story with `npm test` and `npm run build`.
- 2026-05-08 review follow-up: startup-time compatibility file generation conflicts with the story's read-only bootstrap requirement and will be handled through a separate correct-course change proposal instead of forcing a bootstrap-only fix into Story 1.1.
- ✅ Resolved review finding [Low]: hook factories now use direct `legacyHandlers["…"]` access in `src/hooks/permission-asked.js` and `src/hooks/file-edited.js`, matching the other hook wrappers and the non-null map guarantee from `src/index.js`.
- ✅ Resolved review finding [Low]: duplicate `loadWorkflowCommands` disk reads removed — `src/index.js` now passes the wrapper-loaded `workflowCommands` set into `DevaiGitWorkflowPlugin`, which keeps a fallback path for direct legacy use.
- ✅ Resolved review finding [Low]: regression test no longer invokes `scripts/build.js`; it now asserts `dist/devai-aidd-guard.js` exists with a clear "run `npm run build` before `npm test`" message so build and test failures are attributed correctly.
- ✅ Resolved review finding [Low]: bootstrap now emits a single audit entry through `audit.info("plugin bootstrap registered no-op hooks", …)` whenever `permission.asked` / `file.edited` register without a legacy handler, removing the silent-no-op blind spot without adding per-invocation noise.
- ✅ Resolved review finding [Low]: clean-checkout task wording now states the `npm run build && npm test` contract introduced by the build/test decoupling so the Tasks/Subtasks reflect the post-follow-up reality.
- ✅ Resolved review finding [Low]: `permission.asked` and `file.edited` hook factories now use an explicit `(input)` signature, mirroring the single-argument call convention used by the runtime/regression test and removing the stylistic outlier introduced by the previous `(...args)` spread.

### File List

- _bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/hooks/file-edited.js
- src/hooks/permission-asked.js
- src/index.js
- src/policies/legacy/devai-git-workflo.js
- tests/regression.test.js
