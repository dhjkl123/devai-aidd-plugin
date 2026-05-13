---
title: 'Layer 3 Mutating-Tool Guard ?쒓굅'
slug: 'remove-layer-3-mutating-tool-guard'
created: '2026-05-14'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['JavaScript ESM', 'Node.js assert-based tests', 'opencode hook plugin', 'esbuild-built distribution parity']
files_to_modify: ['src/hooks/tool-execute-before.js', 'src/services/workflow/mutating-tools.js', 'tests/regression.test.js', 'tests/unit/opencode-skill-workflow-guard.test.js', 'docs/source-files.md', 'docs/build-and-release.md', '_bmad-output/implementation-artifacts/tech-spec-remove-legacy-compatibility-layer.md', '_bmad-output/implementation-artifacts/4-3-preserve-existing-bmad-command-compatibility-through-the-wrapper.md']
code_patterns: ['hook factory with injected workflowState/pluginContext', 'ordered guard layers in tool.execute.before', 'session-scoped workflow phase transitions', 'shared frozen Set constants for tool classification', 'wrapper-vs-built regression parity']
test_patterns: ['async Node assert helpers in tests/regression.test.js', 'unit test runner list in tests/unit/opencode-skill-workflow-guard.test.js', 'byte-for-byte user-visible string assertions', 'wrapper and built plugin comparison after build']
---

# Tech-Spec: Layer 3 Mutating-Tool Guard ?쒓굅

**Created:** 2026-05-14

## Overview

### Problem Statement

?꾩옱 `src/hooks/tool-execute-before.js`??Layer 3??workflow session?먯꽌 `edit`, `write`, `patch`, `multiedit` 媛숈? ?뚯씪 蹂寃??꾧뎄瑜?李⑤떒?섍퀬 `Git workflow guard: create or switch to branch \`workflow\` before editing files for /<commandName>.` 硫붿떆吏瑜?throw?쒕떎. ???숈옉? BMAD workflow 以??뚯씪 蹂寃??먯껜瑜?留됱븘 ?ъ슜?먭? ?섎룄???뚰겕?뚮줈? 異⑸룎?쒕떎.

### Solution

`tool.execute.before`??Layer 3 mutating-tool throw瑜??쒓굅?쒕떎. Git ?먮룞?붾뒗 ?뚯씪 蹂寃쎌쓣 ?ъ쟾??留됰뒗 湲곕뒫???꾨땲?? 蹂寃??댄썑 phase 異붿쟻, touched files ?섏쭛, finalization, commit/push ?뱀씤 ?쒖븞???뺣뒗 湲곕뒫?쇰줈 ?좎??쒕떎.

### Scope

**In Scope:**
- `src/hooks/tool-execute-before.js`?먯꽌 workflow session mutating-tool 李⑤떒 濡쒖쭅 ?쒓굅
- `SAFE_READ_TOOLS` import/?ъ슜 ?꾩슂???ш???諛?遺덊븘?뷀븯硫??뺣━
- `src/services/workflow/mutating-tools.js`??`MUTATING_TOOLS` ?좎?
- `src/hooks/tool-execute-after.js`??mutating tool ??`"mutating"` phase 湲곕줉 ?좎?
- mutating-tool guard throw瑜?湲곕??섎뒗 regression/unit ?뚯뒪?몃? ???숈옉 湲곗??쇰줈 媛깆떊
- 愿??臾몄꽌? 湲곗〈 tech spec?먯꽌 ?쐌utating-tool guard 硫붿떆吏 蹂댁〈??怨꾩빟 ?쒓굅 ?먮뒗 媛깆떊
- wrapper/built parity? `npm test` ?듦낵

**Out of Scope:**
- Layer 0 pending approval/startup chain 李⑤떒 ?뺤콉 蹂寃?- Layer 1 bash+git block-until-init ?뺤콉 蹂寃?- Layer 2 question header/list guard ?뺤콉 蹂寃?- finalization, touched files, commit/push proposal ?먮쫫 蹂寃?- non-workflow session ?숈옉 蹂寃?- `MUTATING_TOOLS` 紐⑸줉 ?먯껜 蹂寃?
## Context for Development

### Codebase Patterns

- hook factory 湲곕컲?쇰줈 `src/hooks/*`媛 workflow state, approval state, startup chain state瑜?二쇱엯諛쏆븘 ?덉씠?대퀎 guard瑜??ㅽ뻾?쒕떎.
- workflow phase??`src/services/workflow/workflow-state.js`? `advancePhaseIfWorkflowSession` 怨꾩뿴 ?ы띁濡?session-scoped state??湲곕줉?쒕떎.
- mutating tool ?앸퀎 Set? `src/services/workflow/mutating-tools.js`??怨듭쑀 紐⑤뱢濡?議댁옱?쒕떎.
- ?뚭? ?뚯뒪?몃뒗 wrapper? built plugin???숈옉 parity瑜?吏곸젒 鍮꾧탳?섎ŉ, 湲곗〈?먮뒗 mutating-tool guard 硫붿떆吏瑜?蹂댁〈 怨꾩빟?쇰줈 寃利앺뻽??
- `tool-execute-before.js`???꾩옱 ?쒖꽌??skill-trigger, Layer 1 bash+git block, Layer 0 pending approval/startup chain block, Layer 2 question-header/list guard, `advancePhaseIfWorkflowSession(..., "in-progress")`, Layer 3 mutating-tool guard??
- `tool-execute-after.js`??`finish` tool finalization??蹂꾨룄 泥섎━?섍퀬, `MUTATING_TOOLS.has(input?.tool)`?대㈃ `advancePhaseIfWorkflowSession(workflowState, sessionID, "mutating")`瑜??몄텧?쒕떎.
- `SAFE_READ_TOOLS`???꾩옱 ?ㅼ퐫?쒖뿉??`tool-execute-before.js`??Layer 3 safe-read 遺꾧린 ???ъ슜泥섍? ?녿떎.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/hooks/tool-execute-before.js` | Layer 0/1/2/3 guard ?ㅽ뻾 吏?? Layer 3 mutating-tool throw ?쒓굅 ??? |
| `src/hooks/tool-execute-after.js` | mutating tool ??workflow phase瑜?`"mutating"`?쇰줈 湲곕줉?섎뒗 湲곕뒫 ?좎? ??? |
| `src/services/workflow/mutating-tools.js` | `MUTATING_TOOLS` ?좎?. `SAFE_READ_TOOLS` export ?쒓굅 媛?μ꽦 寃????? |
| `tests/regression.test.js` | `verifyStory45WrapperBuiltMutatingToolGuardParity`, `verifyMutatingToolThrowMessagePreserved`, `verifyMutatingToolAdvancesPhase` 二쇰? 湲곕?媛?媛깆떊 ??? |
| `tests/unit/opencode-skill-workflow-guard.test.js` | Layer 0/Layer 1 ?곗꽑?쒖쐞? non-skill ?곹뼢 ?놁쓬 ?⑥쐞 ?뚯뒪??蹂댁〈 ?먮뒗 蹂닿컯 ??? |
| `docs/source-files.md` | `mutating-tools.js` ?ㅻ챸?먯꽌 safe-read guard ?섎? ?쒓굅 ??? |
| `docs/build-and-release.md` | ?뚯뒪??寃뚯씠???ㅻ챸?먯꽌 mutating-tool guard 硫붿떆吏 蹂댁〈 怨꾩빟 ?쒓굅 ??? |
| `_bmad-output/implementation-artifacts/tech-spec-remove-legacy-compatibility-layer.md` | 湲곗〈 ?쐌utating-tool guard message preserved??怨꾩빟怨?援ы쁽 吏??媛깆떊 ??? |
| `_bmad-output/implementation-artifacts/4-3-preserve-existing-bmad-command-compatibility-through-the-wrapper.md` | compatibility story??mutating-tool guard 蹂댁〈 ?ㅻ챸 媛깆떊 ??? |

### Technical Decisions

- `tool.execute.before`??workflow session?대씪??mutating tools瑜??덉슜?쒕떎.
- pending approval ?먮뒗 startup chain 以?non-question tool 李⑤떒? Layer 0?먯꽌 怨꾩냽 ?곗꽑 ?곸슜?쒕떎.
- non-git workspace?먯꽌 `bash` git command 李⑤떒? Layer 1?먯꽌 怨꾩냽 ?곸슜?쒕떎.
- question 愿??header/list guard??Layer 2?먯꽌 怨꾩냽 ?곸슜?쒕떎.
- mutating tool 異붿쟻? ?ъ쟾 李⑤떒???꾨땲??`tool.execute.after`??phase transition?쇰줈 ?좎??쒕떎.
- `SAFE_READ_TOOLS`??Layer 3 ?쒓굅 ???ъ슜泥섍? ?놁쑝硫??쒓굅?쒕떎. ?ㅻ쭔 ?ㅻⅨ ?뚯씪?먯꽌 李몄“ 以묒씠硫??대떦 ?ъ슜泥?湲곗??쇰줈 ?좎??쒕떎.
- built artifact parity ?뚯뒪?멸? ?덉쑝誘濡??뚯뒪 蹂寃???湲곗〈 build ?덉감媛 regression suite?먯꽌 ?ъ슜?섎뒗 dist ?뚯씪??媛깆떊?섎뒗吏 ?뺤씤?쒕떎.
- `docs/legacy/devai-git-workflow.js`??legacy reference ?대? `SAFE_READ_TOOLS`???꾪뻾 ?고????뚯뒪媛 ?꾨땲誘濡??대쾲 蹂寃쎌쓽 吏곸젒 ??곸씠 ?꾨땲??

## Implementation Plan

### Tasks

- [x] Task 1: Remove Layer 3 mutating-tool guard from `tool.execute.before`
  - File: `src/hooks/tool-execute-before.js`
  - Action: Delete the final Layer 3 block that reads `workflowState.get(input?.sessionID)` and throws `Git workflow guard: create or switch to branch \`workflow\` before editing files for /${state.commandName}.` for `MUTATING_TOOLS`.
  - Notes: Preserve all earlier logic: skill-trigger handling, Layer 1 bash+git block, Layer 0 approval/startup-chain block, Layer 2 question-header/list guard, and `advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress")`.

- [x] Task 2: Clean up mutating/safe-read imports and constants
  - File: `src/hooks/tool-execute-before.js`
  - Action: Remove `MUTATING_TOOLS` and `SAFE_READ_TOOLS` imports if they are no longer used after Task 1.
  - File: `src/services/workflow/mutating-tools.js`
  - Action: Keep `MUTATING_TOOLS` because `src/hooks/tool-execute-after.js` still uses it for `"mutating"` phase tracking. Remove `SAFE_READ_TOOLS` only if no runtime source or tests import it after Task 1.
  - Notes: If `SAFE_READ_TOOLS` is removed, update comments in this file so it no longer claims both before/after hooks import the module.

- [x] Task 3: Preserve mutating phase tracking in `tool.execute.after`
  - File: `src/hooks/tool-execute-after.js`
  - Action: Leave the `else if (MUTATING_TOOLS.has(input?.tool)) { advancePhaseIfWorkflowSession(..., "mutating") }` branch intact.
  - Notes: Do not change finalization behavior for `finish`, startup-chain answer resolution, recovery prompt delivery, or non-mutating `"in-progress"` phase handling.

- [x] Task 4: Update regression tests to assert mutating tools are allowed before execution
  - File: `tests/regression.test.js`
  - Action: Replace `verifyStory45WrapperBuiltMutatingToolGuardParity` expectations so wrapper and built both do not throw for workflow-session `edit`/`write`/`patch`/`multiedit` in `tool.execute.before`.
  - Action: Exercise all four mutating tools explicitly: `edit`, `write`, `patch`, and `multiedit`. Do not satisfy this task with only one representative mutating tool.
  - Action: After each allowed `tool.execute.before` call, assert the workflow state is still tracked and has phase `"in-progress"` before any matching `tool.execute.after` call runs.
  - Action: Rename the helper to match the new contract, for example `verifyStory45WrapperBuiltMutatingToolBeforeAllowsParity`.
  - Action: Remove or rewrite `verifyMutatingToolThrowMessagePreserved`; the new assertion should confirm Layer 3's old message is not thrown for workflow mutating tools.
  - Notes: Keep existing non-workflow assertions as pass-through behavior, but update wording from ?쐅uard must not fire??to ?쐌utating tool before-hook remains allowed.??
- [x] Task 5: Add/adjust guard-priority regression coverage
  - File: `tests/regression.test.js`
  - Action: Ensure a workflow session with active `approvalCurrent` still throws the existing Layer 0 pending-approval message before any mutating-tool allowance can matter.
  - Action: Ensure a workflow session with `startupChainCurrent` and no pending startup question still throws the existing Layer 0 startup-chain message before any mutating-tool allowance can matter.
  - Action: Ensure a non-git workspace `bash` git command still throws `BASH_GIT_BLOCK_MESSAGE` from Layer 1.
  - Notes: These tests prove removal is limited to Layer 3 and does not weaken pending approval/startup/git-init safety gates.

- [x] Task 6: Keep mutating phase regression coverage
  - File: `tests/regression.test.js`
  - Action: Keep `verifyMutatingToolAdvancesPhase` or equivalent coverage that invokes `tool.execute.after` with a mutating tool and asserts `workflowState.get(sessionID).phase === "mutating"`.
  - Notes: Ensure the test still asserts no `lifecycle` key is introduced.

- [x] Task 7: Review unit test expectations for skill workflow guard
  - File: `tests/unit/opencode-skill-workflow-guard.test.js`
  - Action: Keep existing Layer 1 readiness-skip/override tests. Add a small workflow-session mutating before-hook pass-through test if regression coverage does not already cover the unit-level behavior.
  - Notes: Do not weaken tests for skill-trigger dedup, busy approval, startup-chain busy state, or question-tool routing.

- [x] Task 8: Update source and release documentation
  - File: `docs/source-files.md`
  - Action: Update `mutating-tools.js` description so it explains `MUTATING_TOOLS` is used for phase tracking in `tool.execute.after`; remove safe-read guard wording if `SAFE_READ_TOOLS` is removed.
  - File: `docs/build-and-release.md`
  - Action: Replace ?쐌utating-tool guard message??parity language with the new contract: wrapper/built tests verify mutating before-hook pass-through and mutating phase tracking.

- [x] Task 9: Update historical implementation artifacts that still declare the old contract
  - File: `_bmad-output/implementation-artifacts/tech-spec-remove-legacy-compatibility-layer.md`
  - Action: Mark the old ?쐌utating-tool guard message preserved??AC/implementation notes as superseded by this change; replace with ?쐌utating tools are not blocked in before-hook; after-hook tracks phase.??  - File: `_bmad-output/implementation-artifacts/4-3-preserve-existing-bmad-command-compatibility-through-the-wrapper.md`
  - Action: Update compatibility notes so they no longer require forwarding or preserving the legacy mutating-tool throw.
  - Notes: Preserve historical context where useful, but make the current intended contract unambiguous.

- [x] Task 10: Build and verify
  - File: `package.json` scripts / generated built artifact path used by tests
  - Action: Run the repository's normal build/test gate, expected command `npm test` and any build step required by the existing test suite.
  - Notes: If `npm test` already builds internally, do not add a redundant build step. If wrapper/built parity uses a checked-in dist file, regenerate it through the established build script.

### Acceptance Criteria

- [x] AC 1: Given a tracked workflow session with no pending approval and no startup chain, when `tool.execute.before` receives `edit`, `write`, `patch`, or `multiedit`, then it does not throw the old Layer 3 message `Git workflow guard: create or switch to branch \`workflow\` before editing files for /<commandName>.`.
- [x] AC 2: Given a tracked workflow session with `approvalCurrent` set and `pendingApprovalQuestion == null`, when `tool.execute.before` receives a non-question mutating tool, then the existing Layer 0 pending-approval message is thrown before any pass-through behavior.
- [x] AC 3: Given a tracked workflow session with `startupChainCurrent` set and `pendingStartupQuestion == null`, when `tool.execute.before` receives a non-question mutating tool, then the existing Layer 0 startup-chain message is thrown before any pass-through behavior.
- [x] AC 4: Given a non-git workspace where initialization has not been approved or is pending, when `tool.execute.before` receives `bash` with a git command such as `git status`, then it still throws `BASH_GIT_BLOCK_MESSAGE`.
- [x] AC 5: Given a tracked workflow session, when `tool.execute.after` receives `edit`, `write`, `patch`, or `multiedit`, then `workflowState.get(sessionID).phase === "mutating"`.
- [x] AC 6: Given `tool.execute.after` records a mutating phase, when the workflow state object is inspected, then it does not contain a legacy `lifecycle` field.
- [x] AC 7: Given a non-workflow session or a non-workflow command path, when a mutating tool reaches `tool.execute.before`, then behavior remains pass-through and no workflow guard state is created.
- [x] AC 8: Given wrapper and built plugin variants, when the updated regression helper exercises workflow-session mutating tools in `tool.execute.before`, then both variants share the same allow/no-throw behavior.
- [x] AC 9: Given wrapper and built plugin variants, when the updated regression helper exercises mutating tools in `tool.execute.after`, then both variants preserve `"mutating"` phase tracking.
- [x] AC 10: Given the docs and implementation artifacts are searched for ?쐌utating-tool guard message preserved??or the old branch-switch throw contract, when the implementation is complete, then no current contract requires preserving that throw.
- [x] AC 11: Given the final change set is complete, when `npm test` is run, then the full test suite passes.

### Review Follow-up Amendments

- [x] F2 Amendment: Before-hook phase expectation is explicit. Given a tracked workflow session starts at phase `"start"`, when an allowed mutating tool reaches `tool.execute.before`, then immediately after the before-hook returns and before any `tool.execute.after` call runs, `workflowState.get(sessionID).phase === "in-progress"`.
- [x] F3 Amendment: Mutating-tool coverage must enumerate all four tools. Regression and parity tests must exercise `edit`, `write`, `patch`, and `multiedit` as separate cases for both before-hook allow/no-throw behavior and after-hook `"mutating"` phase tracking. A single representative mutating tool is not enough.

## Additional Context

### Dependencies

- No new runtime dependencies are required.
- The change depends on the existing workflow state store and `advancePhaseIfWorkflowSession` behavior.
- The change depends on the existing `MUTATING_TOOLS` definition staying available to `src/hooks/tool-execute-after.js`.
- Wrapper/built parity depends on the existing build pipeline producing the artifact used by regression tests.

### Testing Strategy

- Regression: update `tests/regression.test.js` helper(s) that currently expect mutating-tool throws so they assert allow/no-throw parity for wrapper and built.
- Regression: assert before-hook phase separately: after an allowed mutating `tool.execute.before` call and before any `tool.execute.after` call, `workflowState.get(sessionID).phase` must be `"in-progress"`.
- Regression: enumerate all four mutating tools (`edit`, `write`, `patch`, `multiedit`) for before-hook allow/no-throw parity and after-hook `"mutating"` phase tracking. Do not rely on one representative mutating tool.
- Regression: retain or add explicit assertions for Layer 0 pending approval, Layer 0 startup chain, and Layer 1 bash+git block priority.
- Regression: keep `tool.execute.after` mutating phase tests and the no-`lifecycle` assertion.
- Unit: add or adjust `tests/unit/opencode-skill-workflow-guard.test.js` only where useful to cover before-hook pass-through at hook-factory level.
- Documentation verification: search for old guard-preservation language and update current-contract docs/artifacts.
- Final gate: run `npm test`.

### Notes

- The riskiest part is accidentally weakening Layer 0 or Layer 1 while deleting Layer 3. Keep the edit tightly scoped to the final mutating guard block.
- Do not remove `MUTATING_TOOLS`; it is still the single source for after-hook mutating phase detection.
- `SAFE_READ_TOOLS` appears runtime-dead after Layer 3 removal. Removing it is acceptable if imports and docs are updated consistently.
- Historical artifacts can mention that the old behavior existed, but they must not present the old mutating-tool throw as the current required contract.
- 援ы쁽? ?꾩쭅 吏꾪뻾?섏? ?딅뒗?? quick spec ?뱀씤 ??蹂꾨룄 援ы쁽 ?④퀎?먯꽌 吏꾪뻾?쒕떎.

## Review Notes

- Adversarial code review completed.
- Findings: 1 total, 1 fixed, 0 skipped.
- Resolution approach: auto-fix.
- Fixed finding: renamed the wrapper/built mutating before-hook parity helper to describe pass-through parity accurately; workflow-session phase behavior remains covered by direct hook-factory tests.
