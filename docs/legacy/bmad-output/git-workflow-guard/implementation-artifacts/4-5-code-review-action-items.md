# Story 4.5 — Code Review Action Items

**Story file:** `_bmad-output/implementation-artifacts/4-5-maintain-regression-coverage-for-wrapper-and-distribution-behavior.md`
**Reviewer:** Adversarial Code Reviewer (BMAD code-review)
**Review date:** 2026-05-10
**Branch:** `epic4/stories`
**Implementation status at review (R1):** `review`
**Status after R2 auto-remediation:** `done`

---

## R2 OUTCOME (2026-05-10) — auto-remediation complete

| ID | Severity | Status | Notes |
|---|---|---|---|
| H-1 | HIGH | FIXED | `verifyBuiltArtifactExists` refactored to accept `{existsSyncFn, builtPath}` injection; verifier now exercises the actual function (negative + positive control) and source-contract guards against hollowed-body refactors. Mutation killed (gate emptying, message rewrite). |
| M-1 | MEDIUM | FIXED | `length >= 1` precondition added on both wrapper and built prompt arrays before deepEqual. Mutation killed (`prompts.length = 0` simulation). |
| M-2 | MEDIUM | FIXED | Non-workflow command negative path added across legacy/wrapper/built with `parts.length === 0` precondition + `runToolMutatingBefore` no-throw assertion. Mutation killed (swap to workflow command name). |
| M-3 | MEDIUM | FIXED | `runCommandExecuteBefore`/`runToolMutatingBefore` parameterised with `{sessionID,command,argumentsText}`; all Story 4.5 verifiers now use unique sessionIDs (`verifyStory45-prompt-parity-cmd`, `verifyStory45-mutating-positive`, `verifyStory45-mutating-neg-no-command`, `verifyStory45-mutating-neg-nonwf-command`, `verifyStory45-prompt-parity`). Default `"session-1"` preserved for backward compat. |
| L-1 | LOW | SKIPPED | After M-1's `length >= 1` precondition, the prompt-parity verifier is no longer a pure duplicate of `main()` lines 343–347. Story sub-task ("격리 단위로 잠근다") still satisfied. |
| L-2 | LOW | FIXED | Negative-trio temp workspace creation now happens inside `try{}` with `createdWorkspaces.push(ws)` accumulation; finally cleans every entry. |
| L-3 | LOW | SKIPPED-as-noted | Story File List "약 +400 라인" line-count traceability moved into the new "Review Round 2" section of the story file (now reflects the post-R2 cumulative line count of +710 / -8). |
| L-4 | LOW | FIXED | `verifyStory45LegacyWrapperBuiltHandlerShapesMatch` now cross-asserts `STORY_45_LEGACY_HOOK_KEYS === SUPPORTED_HOOK_KEYS \ WRAPPER_ONLY_HOOK_KEYS` set-equality in both directions. |
| L-5 | LOW | FIXED | `verifyStory45SrcIndexAuditEventListMatchesEmissions` JSDoc now explicitly states info-only scope and the intentional exclusion of `audit.error("plugin bootstrap failed", ...)`. |

**Mutation testing summary** (all four mutations killed, exit 1 with the verifier's specific AssertionError):

| Mutation | Killed by | Evidence |
|---|---|---|
| `verifyBuiltArtifactExists` body emptied | H-1 verifier | `negative path threw=null` AssertionError after re-run |
| `verifyBuiltArtifactExists` message rewritten without `npm run build` token | H-1 verifier | `assert.match` failed on the regex `/npm run build/` |
| Wrapper/built prompts forced to `[]` before deepEqual | M-1 verifier | `wrapper must publish at least one approval prompt` AssertionError |
| Non-workflow command swapped to workflow command | M-2 verifier | `non-workflow command must produce zero output parts; got 1` AssertionError |

`npm test` exit 0; `npm run build` exit 0 after the R2 changes.

---

## R1 ORIGINAL FINDINGS (kept for traceability)

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 3 |
| LOW | 5 |

`npm test` passes. The 3-variant comparison and the M-1 carry-over (set-equal hook keys vs `SUPPORTED_HOOK_KEYS`) and the L-3 carry-over (`audit.info` set-equality with JSDoc) are both genuine set-equal assertions and would catch directional drift in either direction. The biggest defect is one verifier whose body does not actually exercise the regression gate it claims to lock; everything else is structural fragility / redundancy / minor comment drift.

---

## HIGH — must fix

### H-1. `verifyStory45RegressionGateAbortsWithoutBuiltArtifact` is tautological — it tests `node:assert/strict`, not the regression gate.

**File:** `tests/regression.test.js:12288–12331`

**What the verifier actually does:**

```js
let threw = null;
try {
  assert.equal(
    fs.existsSync(fixtureDist),         // false — fixture path was never created
    true,
    "missing dist/devai-aidd-guard.js — run `npm run build` before `npm test`",
  );
} catch (error) { threw = error; }
assert.ok(threw, ...);
assert.match(threw.message, /missing dist\/devai-aidd-guard\.js/, ...);
assert.match(threw.message, /npm run build/, ...);
```

**Why this is wrong:**

The verifier neither calls `verifyBuiltArtifactExists()` nor spawns the regression suite against a missing-dist fixture. It just calls `assert.equal(false, true, "<MESSAGE>")` and verifies that the AssertionError's `.message` contains the literal string the verifier itself just passed in. This is a closed loop — it passes for any `<MESSAGE>` the author types and would still pass even if:

- `verifyBuiltArtifactExists()` were deleted from `tests/regression.test.js`.
- `main()` no longer called `verifyBuiltArtifactExists()` first.
- The actual `verifyBuiltArtifactExists()` message were rewritten to something else (e.g. dropping "npm run build").

The story sub-task explicitly says this verifier must catch "회귀 스위트 자체가 silent skip 되는 사고" — but the implementation does not exercise the gate at all. The Completion Note ("실제 `dist/`를 건드리지 않고 임시 fixture 경로의 부재 검증으로 silent-skip 사고를 차단") overstates what the code does.

**Suggested remediation (any one of):**

1. Spawn `node tests/regression.test.js` (or just `--input-type=module --eval "import('.../regression.test.js')"`) inside a fixture project root whose `dist/devai-aidd-guard.js` is absent and assert non-zero exit + stderr regex (mirrors the proven pattern in `verifyMissingLegacyBootstrapDependencyFails` at lines 165–206).
2. Read `verifyBuiltArtifactExists.toString()` and assert the literal `"missing dist/devai-aidd-guard.js"` and `"npm run build"` strings appear in the source — text-level guard, weaker but at least not tautological.
3. Refactor `verifyBuiltArtifactExists()` to accept an injected `existsSync` and `expectedPath`, then test it with a fake `() => false` adapter and assert the throw shape.

This is HIGH not CRITICAL because the silent-skip risk is partly mitigated by `main()` already calling `verifyBuiltArtifactExists()` before any Story 4.5 verifier runs. But the new verifier adds zero real coverage on top of that, contrary to its stated purpose.

---

## MEDIUM — should fix

### M-1. `verifyStory45BuiltArtifactPromptParityWithWrapper` is vacuously satisfied by both arrays being empty.

**File:** `tests/regression.test.js:12262–12278`

**Issue:**

```js
const wrapperPrompts = wrapper.mock.prompts.map(summarizePrompt);
const builtPrompts = built.mock.prompts.map(summarizePrompt);
assert.deepEqual(builtPrompts, wrapperPrompts, "...");
```

If a future change causes the `command.execute.before` flow to publish zero prompts on `/bmad-bmm-quick-dev` (e.g. an approval-policy regression silently disables prompt emission), both arrays are `[]` and `deepEqual` passes — vacuous parity. Story 4.5's stated goal is to *lock* prompt-metadata parity against esbuild drift; locking zero against zero locks nothing.

**Suggested remediation:** add an explicit precondition — `assert.ok(wrapperPrompts.length >= 1, "expected wrapper to publish at least one approval prompt for /bmad-bmm-quick-dev")` — *before* the deepEqual.

Note: `main()` lines 343–347 already does the same deepEqual without a length precondition, so this is a pre-existing weakness duplicated into the Story 4.5 verifier. Story 4.5 had an opportunity to *strengthen* the assertion and instead duplicated it as-is.

### M-2. `verifyStory45LegacyWrapperBuiltMutatingToolGuardParity` negative path only covers the "no command issued" case, not the "non-workflow command issued" case.

**File:** `tests/regression.test.js:12157–12190`

**Issue:**

The negative trio is freshly instantiated, then `runToolMutatingBefore` is called immediately *without* any preceding `command.execute.before`. So no workflow state for `session-1` exists for any variant, and the guard correctly does not fire. The verifier's comment says "Skip workflow detection: only fire a non-workflow command (or none)" — implementation chose "none".

The "non-workflow command" path (where `command.execute.before` *is* called with a non-workflow command and the guard then must remain silent) is exercised in `main()` at lines 366–399, but only for the wrapper variant, not for legacy or built. The Story 4.5 verifier could have closed that gap; it didn't. As written it's a redundant subset of `main()` for legacy/built.

**Suggested remediation:** in the negative trio, fire `command.execute.before` with a non-workflow command (`/non-workflow-command`) on each of legacy/wrapper/built before the mutating-tool call. That validates the actual non-workflow-session contract for all three variants and gives the verifier non-trivial coverage beyond what `main()` already does.

### M-3. `verifyStory45LegacyWrapperBuiltMutatingToolGuardParity` re-uses `session-1` for both positive and negative trios — risk of cross-contamination if `instantiate` ever returns shared state.

**File:** `tests/regression.test.js:12128–12194`

**Issue:**

Both the positive trio (`trio.legacy/wrapper/built`) and the negative trio (`negLegacy/negWrapper/negBuilt`) reuse `sessionID: "session-1"` (hard-coded by `runToolMutatingBefore`/`runCommandExecuteBefore`). The current implementations create fresh handler closures per `instantiate()` call so no state leaks between trios — the test is correct *today*. But the re-use is a brittleness footgun: if `createWorkflowStateStore()` or any future shared-state singleton is introduced (or if a global module-scoped Map appears in `tool.execute.before`), the negative trio's "no state for session-1" assumption silently breaks and the test fails for the wrong reason.

**Suggested remediation:** parameterise `runToolMutatingBefore(handlers, sessionID = "session-1")` (and `runCommandExecuteBefore` similarly) and pass `"session-neg-1"` in the negative trio. This is a one-line change that makes the test robust to future shared-state mistakes.

---

## LOW — nice to fix

### L-1. `verifyStory45BuiltArtifactPromptParityWithWrapper` is a near-exact duplicate of `main()` lines 343–347.

**File:** `tests/regression.test.js:12262–12278` vs `tests/regression.test.js:343–347`

Both compare `built.mock.prompts.map(summarizePrompt)` to `wrapper.mock.prompts.map(summarizePrompt)` after the same `runCommandExecuteBefore` invocation, with the same `summarizePrompt` shape. The Story 4.5 verifier adds a more descriptive error message but no new assertion. Acceptable per the story sub-task ("격리 단위로 잠근다" — isolated lock), but adds maintenance surface without information gain. Consider folding into the same code path or adding a length precondition (covered in M-1) so the duplication actually buys something.

### L-2. Negative-trio temp workspaces are created *before* the inner `try {` — leak risk on `createTempWorkspace` failure.

**File:** `tests/regression.test.js:12161–12190`

```js
const negLegacyWs = createTempWorkspace();   // line 12161
const negWrapperWs = createTempWorkspace();  // 12162 — if this throws, negLegacyWs leaks
const negBuiltWs = createTempWorkspace();    // 12163 — if this throws, negLegacyWs/negWrapperWs leak
try { ... } finally { /* rmSync */ }
```

`createTempWorkspace()` is unlikely to throw mid-sequence in practice, but the pattern is brittle. Move all three workspace creations inside the `try` (or accumulate created paths in an array and clean each in the finally regardless of which throw stage was reached).

### L-3. Story File List claims "약 +400 라인" but actual addition is 505 lines.

**File:** Story 4.5 file → `### File List` section.

`git diff --stat` reports `tests/regression.test.js | 505 +++…` (505 inserted). The "approximately 400" estimate is off by ~25%. Update the File List to reflect actual line count for traceability.

### L-4. Story task wording "wrapper/built parity로만 검증하고 legacy 비교에서는 명시적으로 제외" is implemented via the `STORY_45_LEGACY_HOOK_KEYS` constant — good — but the constant is *not* derived from `SUPPORTED_HOOK_KEYS \ WRAPPER_ONLY_HOOK_KEYS`.

**File:** `tests/regression.test.js:11931–11936`

```js
const STORY_45_LEGACY_HOOK_KEYS = Object.freeze([
  "command.execute.before",
  "tool.execute.before",
  "tool.execute.after",
  "event",
]);
```

This duplicates the SOT relationship and is asserted to be consistent in the verifier body via the disjointness/membership loops. So the verifier *would* catch drift between this constant and `SUPPORTED_HOOK_KEYS`. Functionally fine. But a stronger anchor would compute `STORY_45_LEGACY_HOOK_KEYS = SUPPORTED_HOOK_KEYS.filter(k => !WRAPPER_ONLY_HOOK_KEYS.includes(k))` inside the verifier so the SOT remains the single source. Current shape risks: a future maintainer adds a key to `SUPPORTED_HOOK_KEYS \ WRAPPER_ONLY_HOOK_KEYS` and forgets to extend `STORY_45_LEGACY_HOOK_KEYS`; the disjointness loop catches it but the failure message mentions "expected legacy" rather than "missing from `STORY_45_LEGACY_HOOK_KEYS`", which is harder to debug.

### L-5. JSDoc audit-event verifier (`verifyStory45SrcIndexAuditEventListMatchesEmissions`) excludes `audit.error` calls by design — consider documenting that boundary explicitly.

**File:** `tests/regression.test.js:12348–12397`

The regex `/audit\.info\(\s*"([^"]+)"/g` correctly excludes `audit.error("plugin bootstrap failed", ...)` (line 402 of `src/index.js`). The JSDoc header at `src/index.js:20–23` lists "best-effort bootstrap audit emissions" and intentionally excludes the error path. This is a deliberate scope boundary, and the L-3 contract (per Story 4.3 review) covers info-only emissions. Good.

But the verifier's docstring says "the audit-event list documented … must match the actual `audit.info(\"<name>\", ...)` first-argument set" without explicitly noting the info/error split. A future maintainer might introduce an `audit.warn(...)` or move `plugin bootstrap` to `audit.error` (e.g. when `validation.valid === false`) and unintentionally break the contract. Add a one-liner in the verifier's JSDoc making the info-only scope explicit, and consider a follow-up to also lock the error-path emissions if that contract matures.

---

## Story 4.3 → Story 4.5 carry-over verdict

| Carry-over item | Origin | Verdict |
|---|---|---|
| **M-1 body** (SOT-vs-export drift, set-equal hook keys) | Story 4.3 R2 review | **충실히 흡수** — `verifyStory45LegacyWrapperBuiltHandlerShapesMatch` performs genuine set-equality (size + every-key-in-both directions, both for SOT↔wrapper↔built and for legacy↔legacyExpected). Asymmetric drift in either direction (e.g. dropping `permission.asked` from `SUPPORTED_HOOK_KEYS` while keeping it in the wrapper hook map) fires here. WRAPPER_ONLY ⊆ SUPPORTED also asserted. WRAPPER_ONLY ∩ legacy === ∅ also asserted. M-1 body fully closed. |
| **L-3** (audit-event JSDoc list ↔ emissions) | Story 4.3 R2 review | **충실히 흡수** — `verifyStory45SrcIndexAuditEventListMatchesEmissions` performs symmetric set-equality on the JSDoc backtick-quoted token set vs the `audit.info("<name>", ...)` first-argument set. False positives (regex grabbing unrelated text) are blocked by the scoping anchor "best-effort bootstrap audit emissions" + parenthetical-only capture. False negatives (missing emissions) are blocked by the symmetric `for (const name of headerEvents)` and `for (const name of emittedEvents)` loops. L-3 closed. Minor scope-documentation nit captured as L-5. |

Both Story 4.3 R2 carry-overs are genuinely closed. Neither verifier degrades to a one-direction subset comparison.

---

## Acceptance Criteria validation

| AC | Status | Evidence |
|---|---|---|
| AC1 — legacy/wrapper/built command-prompt + mutating-tool parity asserted across 3 variants, drift reported before release | **IMPLEMENTED** | `verifyStory45LegacyWrapperBuiltCommandPromptParity` (deepEqual on normalized `parts`, both wrapper↔legacy and built↔legacy axes); `verifyStory45LegacyWrapperBuiltMutatingToolGuardParity` (byte-for-byte `error.message` parity across all three variants on workflow session). `npm test` passes; `mutatingToolError` value confirmed in test stdout. AC1 covered, with the M-2/M-3 caveats above. |
| AC2 — regression suite continues to act as quality gate; maintainer can detect drift before deploy | **IMPLEMENTED** | All 7 Story 4.5 verifiers register on `main().then(() => …)` chain (lines 12564–12570) with the required "Story 4.5 — wrapper/built regression gate" comment. README has the `npm run build && npm test` paragraph at line 183. AC2 covered, with the H-1 caveat about the abort-on-missing-dist meta-guard adding zero real coverage above what `main()` already enforces. |

---

## Tasks audit (claimed `[x]` vs reality)

All 7 verifier functions exist and are registered. No false claim. README paragraph exists at the correct location. `package.json` test script preserved (no shortening, all `node --check` calls intact). No edits to `src/index.js`, `src/policies/legacy/devai-git-workflo.js`, `scripts/build.js`, `scripts/make-release.js`, `package.json` — guardrails respected.

---

## Final verdict

**CRITICAL 없음.**

`npm test` passes. The Story 4.3 R2 carry-overs (M-1 body, L-3) are genuinely absorbed — both verifiers perform symmetric set-equality, not subset comparisons. The 3-variant comparison stays anchored on `SUPPORTED_HOOK_KEYS` as a single source of truth.

The single HIGH (H-1) is a hollow meta-guard that does not actually validate the silent-skip protection it claims to add. It does not break the suite — passes today, will pass tomorrow even if the underlying gate weakens — but it adds zero confidence beyond what `main()` already provides. Recommend fixing before merging Epic 4.

The MEDIUM items are tractable hardening: add a `length >= 1` precondition to the prompt-parity verifier (M-1), close the non-workflow-command coverage gap for legacy/built (M-2), and parameterise `sessionID` to remove cross-trio contamination risk (M-3).
