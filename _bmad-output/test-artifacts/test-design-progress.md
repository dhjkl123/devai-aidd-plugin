---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-05-18'
inputDocuments:
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/README.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/package.json
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/src/index.js
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/tests/regression.test.js
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard/planning-artifacts/architecture.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard/implementation-artifacts/tech-spec-opencode-native-event-plugin.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/.agents/skills/bmad-testarch-test-design/resources/knowledge/adr-quality-readiness-checklist.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/.agents/skills/bmad-testarch-test-design/resources/knowledge/test-levels-framework.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/.agents/skills/bmad-testarch-test-design/resources/knowledge/risk-governance.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/.agents/skills/bmad-testarch-test-design/resources/knowledge/test-quality.md
---

# Step 01 - Detect Mode

## Mode Selection

- Selected mode: System-Level
- Rationale: The request targets end-to-end validation of the devai plugin's real TUI runtime flow rather than a single epic or story.
- Scope signals from the user: plugin load, prompt input, model response output, hook execution, log persistence, policy blocking/file mutation verification, and `npm run test:tui` execution path.

## Prerequisite Check

- Functional/system context available from [README.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/README.md) and existing project test inventory in [package.json](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/package.json).
- Architecture/technical context available from legacy planning and implementation artifacts under [docs/legacy/bmad-output/git-workflow-guard](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard).
- No dedicated PRD/ADR for this exact TUI E2E initiative was provided, but there is sufficient architecture and behavior context to design a system-level regression plan for the current plugin runtime.

## Proceed Decision

Proceed with System-Level test design using repository documentation, existing regression/e2e tests, and plugin runtime source as evidence.

# Step 02 - Load Context

## Configuration

- `tea_use_playwright_utils`: `true`
- `tea_use_pactjs_utils`: `false`
- `tea_pact_mcp`: `none`
- `tea_browser_automation`: `auto`
- `test_stack_type`: `auto`
- `test_artifacts`: `C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts`

## Stack Detection

- Detected stack: `backend/cli`
- Evidence:
  - No `playwright.config.*` or `cypress.config.*` file in the repository.
  - No browser-test signatures such as `page.goto` or `page.locator` in `tests/`.
  - The project is a Node.js ESM plugin/CLI runtime with plain Node test scripts and git-backed temp workspaces.

## Loaded Project Artifacts

- Product/system behavior: [README.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/README.md)
- Runtime and test entrypoints: [package.json](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/package.json), [src/index.js](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/src/index.js), [tests/regression.test.js](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/tests/regression.test.js)
- Architecture context: [architecture.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard/planning-artifacts/architecture.md)
- Runtime integration details: [tech-spec-opencode-native-event-plugin.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard/implementation-artifacts/tech-spec-opencode-native-event-plugin.md)
- Existing coverage footprint: `tests/unit/*`, `tests/e2e/*`, `tests/regression.test.js`

## Loaded Knowledge Fragments

- ADR readiness and system testability checklist
- Test levels framework
- Risk governance
- Test quality definition of done

## Tooling Evaluation Notes

- Browser exploration skipped: this request targets a real terminal TUI flow, not a browser UI.
- `agent-tui` exposes PTY sessions, screenshots, keyboard input, wait conditions, JSON output, and a daemon model, but its public README states Unix-only support and explicitly excludes native Windows runtimes.
- `pilotty` exposes daemon-managed PTY sessions, VT100 emulation, JSON responses, and multi-session support, but its public README also marks Windows as unsupported because it depends on Unix domain sockets and POSIX PTY APIs.
- `node-pty` supports Linux, macOS, and Windows, and is the strongest cross-platform base for a custom driver in this repository.
- `@xterm/headless` runs headless in Node.js and fits transcript/state capture for assertions, but it is a terminal emulation layer rather than a full PTY orchestration solution by itself.
- Exact public source for `agent-tty` could not be confirmed from repository/package lookups during this run, so it should be treated as unverified until a concrete repo or package is pinned.

## Context Sufficiency

- Sufficient to proceed with a system-level TUI E2E design.
- Main remaining uncertainty is execution portability on Windows for off-the-shelf PTY/TUI drivers, which directly increases the attractiveness of a custom `node-pty`-based harness for this repository.

# Step 03 - Risk And Testability

## Testability Concerns

### Actionable Concerns

1. Real TUI driver portability is the primary architectural blocker.
   - Evidence: the requested first-choice candidates `agent-tui` and `pilotty` publicly document Unix-only or no-Windows support.
   - Impact: this repository is currently developed in a Windows/PowerShell environment, so a naive adoption would fail locally or require Linux-only execution.
   - Required change: choose either `node-pty` as the default cross-platform driver or explicitly scope `test:tui` to Linux CI while keeping a documented Windows fallback.

2. Real model output is inherently nondeterministic and cannot be asserted with exact text equality.
   - Evidence: the user explicitly requires observing real model responses and avoiding exact-match assertions.
   - Impact: without stable-signal assertions, tests will flap on harmless wording drift.
   - Required change: formalize signal-based assertions around plugin logs, hook side effects, keywords, file mutations, policy-block messaging, and fatal-error absence.

3. Runtime observability is strong inside current mock-client tests but weaker at the external `devai` process boundary.
   - Evidence: current E2E tests inspect `client.app.log` and `promptAsync` directly; a true PTY test will not have that in-memory access.
   - Impact: plugin load, hook execution, and approval/policy outcomes may become opaque unless the runtime emits them to a durable sink.
   - Required change: standardize a fixture log destination and artifact directory that the PTY harness can inspect after each run.

4. Fixture isolation must extend from git state to model/provider state.
   - Evidence: current tests already isolate repos with temp workspaces, but TUI E2E adds credential, config, artifact, and transcript state.
   - Impact: leaked session state or shared logs will cause cross-test contamination and false outcomes.
   - Required change: each scenario needs its own workspace root, `.opencode` config, log path, artifact path, and optional seeded prompt/config fixtures.

5. Policy-block and file-mutation verification requires scenario-specific fixtures rather than one generic smoke flow.
   - Evidence: target behaviors include policy denial messages, hook execution, and optional file edits.
   - Impact: a single happy-path test would miss the regression-prone enforcement layer that is the plugin's core value.
   - Required change: provide dedicated fixtures for read-only prompt flow, mutating prompt flow, and policy-block flow.

## Testability Assessment Summary

### What Works Well

- Current repository tests already use real git binaries and temporary workspaces, which matches the desired black-box style.
- The plugin is designed around stable audit-style events and workflow state transitions, which are suitable for stable-signal assertions.
- The test runner is intentionally lightweight Node-based scripting, so adding a PTY suite does not require introducing a full browser test framework.
- Existing regression coverage already separates happy path, denial/recovery path, startup chain, and workflow detection, which provides a strong scenario source for the new TUI layer.

### Architecturally Significant Requirements

- `ASR-01` ACTIONABLE: `npm run test:tui` must launch the real `devai` TUI process, not call plugin functions directly.
- `ASR-02` ACTIONABLE: the TUI harness must verify signal-level outcomes only, never full-model exact output.
- `ASR-03` ACTIONABLE: plugin load, hook execution, and policy outcomes must be externally observable through file logs or artifacts.
- `ASR-04` ACTIONABLE: every TUI scenario must run in an isolated temp workspace with independent config, transcript, logs, and cleanup.
- `ASR-05` ACTIONABLE: the chosen PTY layer must support Windows execution or the suite must declare Linux CI as the authoritative environment with an explicit local fallback.
- `ASR-06` FYI: existing in-process E2E tests remain the faster diagnostic layer; TUI E2E should stay focused on real runtime regression coverage, not duplicate every lower-level permutation.
- `ASR-07` FYI: artifact capture should include terminal transcript and structured fixture outputs so failures are reviewable after CI runs.

## Risk Assessment Matrix

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | TECH | `agent-tui` and `pilotty` are Unix-only, creating an immediate Windows execution mismatch. | 3 | 3 | 9 | Default to `node-pty` driver, keep `@xterm/headless` for transcript/state rendering, and treat third-party drivers as optional adapters. | Plugin Dev | Pre-implementation |
| R-002 | OPS | Real model responses vary across runs, causing flaky PTY assertions. | 3 | 3 | 9 | Assert stable signals only, set bounded scenario prompts, capture transcripts, and require retry-safe waits instead of timing sleeps. | QA + Plugin Dev | Pre-implementation |
| R-003 | DATA | File mutations or fixture artifacts may leak across scenarios and corrupt later runs. | 2 | 3 | 6 | One temp repo per test, unique log/artifact roots, explicit teardown, and changed-file assertions scoped to fixture-owned paths. | QA | Pre-implementation |
| R-004 | BUS | The suite may miss core plugin regressions if it only checks screen text and not hook/log side effects. | 2 | 3 | 6 | Make `plugin_loaded`, `hook_called`, policy-block text, artifact creation, and file mutation part of the P0 oracle set. | QA + Plugin Dev | Pre-implementation |
| R-005 | SEC | CI or local runs may expose provider credentials or accidentally execute unrestricted mutating flows. | 2 | 3 | 6 | Use dedicated low-privilege test credentials, fixture-scoped workspaces, and deny-by-default policy scenarios for dangerous operations. | DevOps + Plugin Dev | Before CI enablement |
| R-006 | PERF | PTY startup, model latency, and transcript capture can make PR runs too slow or too expensive. | 2 | 2 | 4 | Keep PR suite to a small P0 smoke set, push broader denial/recovery or long scenarios to nightly, and cap prompt size aggressively. | QA | Test rollout |
| R-007 | OPS | Terminal timing races may cause false negatives when the driver snapshots before output stabilizes. | 2 | 2 | 4 | Use deterministic wait primitives such as screen-hash settle, keyword wait, or log-line wait; ban fixed sleeps in the suite. | QA | During implementation |

## Highest Risk Summary

- R-001 and R-002 are release blockers for the TUI strategy itself.
- If cross-platform driver choice and nondeterministic assertion policy are not settled first, implementation effort will be wasted.
- R-003 through R-005 are next priority because they determine whether failures are trustworthy and safe to run in CI.

# Step 04 - Coverage Plan

## Coverage Matrix

| Test ID | Scenario | Test Level | Priority | Risk Link | Core Assertions |
| ------- | -------- | ---------- | -------- | --------- | --------------- |
| P0-001 | `devai` launches with the devai plugin enabled and the plugin bootstrap path is observed in a real TUI session. | E2E | P0 | R-001, R-004 | process exits cleanly or remains interactive as expected, `plugin_loaded` signal exists, fatal error absent |
| P0-002 | User prompt is typed into the real TUI and a real model response is rendered back to the terminal. | E2E | P0 | R-002 | prompt echo or acceptance is visible, response contains scenario keyword set, fatal error absent |
| P0-003 | A mutating workflow scenario causes the plugin hook to run and a fixture-owned file or artifact to change. | E2E | P0 | R-003, R-004 | `hook_called` signal exists, target file diff or artifact creation observed, unexpected files unchanged |
| P0-004 | A policy-block scenario is triggered and the terminal shows a deny/block message while forbidden mutation does not occur. | E2E | P0 | R-004, R-005 | block-related keyword visible, `hook_called` or policy log emitted, blocked file stays unchanged |
| P1-001 | Plugin logs are persisted to the expected path and can be correlated with the terminal transcript. | E2E | P1 | R-003, R-004 | log file exists, contains session-correlated signals, transcript artifact exists |
| P1-002 | Multi-step prompt flow still preserves stable plugin signals across more than one interaction turn. | E2E | P1 | R-002, R-007 | multiple stable keywords detected, hook/log counts match expectation, no fatal error |
| P1-003 | Recovery or denial branch preserves observability and leaves workspace in a clean denied state. | E2E | P1 | R-003, R-004 | denial/recovery keyword visible, no forbidden file mutation, artifact/log trail complete |
| P1-004 | Non-mutating informational prompt completes without false-positive policy blocks. | E2E | P1 | R-004 | response rendered, hook either absent or expected read-only hook only, no block message |
| P2-001 | Provider or network instability is surfaced as a controlled failure with usable artifacts. | E2E | P2 | R-002, R-007 | failure message is actionable, transcript and logs captured, no hung PTY after timeout |
| P2-002 | Alternate terminal sizes or resize events do not break signal extraction. | E2E | P2 | R-007 | keyword/log assertions still pass across terminal dimensions |
| P2-003 | Localized or Korean prompt text still allows stable keyword and hook detection. | E2E | P2 | R-002 | response contains configured Korean signal set or hook/log signals substitute reliably |

## Driver Evaluation Order

1. `agent-tty`
   - Status: exact public package/repo not confirmed in this run.
   - Decision: do not commit architecture to it until a concrete maintained source is pinned.
2. `agent-tui`
   - Strengths: daemon model, PTY session control, screenshot/input/wait primitives, JSON output.
   - Weakness: Unix-only, native Windows unsupported.
   - Decision: acceptable only for Linux CI or optional adapter experiments.
3. `pilotty`
   - Strengths: PTY management, VT100 emulation, JSON snapshots, wait-for and settle primitives.
   - Weakness: Windows unsupported.
   - Decision: good Linux CI candidate, not the primary cross-platform choice.
4. `custom node-pty + @xterm/headless`
   - Strengths: `node-pty` is cross-platform and `@xterm/headless` can maintain terminal state in Node.js.
   - Weakness: highest implementation effort because orchestration, waits, and transcript handling must be built locally.
   - Recommended default: yes, for this repository.

## Assertion Strategy

- Never exact-match the full model completion.
- Assert only stable signals:
  - plugin log marker such as `plugin_loaded`
  - hook log marker such as `hook_called`
  - terminal contains one or more required keywords from a short allowlist
  - terminal does not contain fatal error markers
  - expected fixture file changed or did not change
  - expected artifact directory contains transcript/log outputs
- Prefer dual-channel oracles:
  - terminal text proves the user-visible path
  - file/log/artifact proves the plugin-side path

## Flaky-Prevention Strategy

- Ban fixed sleeps; use PTY wait conditions only.
- Wait on one of:
  - terminal hash stability
  - required keyword appearance
  - log-line appearance
  - process exit with bounded timeout
- Keep prompts narrowly scripted so the model has a short, obvious response path.
- Use fixture-specific keyword sets, not one global regex.
- Snapshot transcript continuously and persist the final buffer on timeout or failure.
- Enforce one temp workspace and one artifact root per test.
- Kill PTY sessions deterministically in teardown even after assertion failure.
- Split PR suite and nightly suite to keep the PR path small and repeatable.

## Fixture Structure

```text
tests/
  tui/
    driver/
      devai-driver.js
      waiters.js
      transcript-buffer.js
      assertions.js
    fixtures/
      projects/
        happy-path/
          opencode.jsonc
          prompts/
            prompt.txt
          expected/
            keywords.json
        mutate-file/
          opencode.jsonc
          input/
            seed.txt
          expected/
            changed-files.json
        policy-block/
          opencode.jsonc
          input/
            protected.txt
          expected/
            denied-keywords.json
      templates/
        devai-aidd-plugin.project.jsonc
    artifacts/
      .gitkeep
    scenario-plugin-load.test.js
    scenario-prompt-response.test.js
    scenario-mutate-file.test.js
    scenario-policy-block.test.js
```

## Execution Strategy

- PR:
  - Run P0 only.
  - Target runtime: under ~10-15 minutes total.
  - Goal: prove the plugin still loads, answers, mutates when allowed, and blocks when forbidden.
- Nightly:
  - Run P0 + P1.
  - Include longer multi-turn, denial/recovery, and transcript/log correlation scenarios.
- Weekly or on-demand:
  - Run P2 matrix.
  - Include provider instability handling, terminal size variants, and locale variants.

## Resource Estimates

- P0 implementation: ~24-32 hours
- P1 implementation: ~20-28 hours
- P2 implementation: ~12-20 hours
- P3 reserve / exploratory hardening: ~4-8 hours
- Total initial rollout: ~60-88 hours
- Likely delivery timeline: ~1.5-2.5 engineer-weeks

## Quality Gates

- P0 pass rate: 100%
- P1 pass rate: >=95%
- No open score 9 risks before enabling the suite in required CI
- Stable-signal assertion coverage for all P0 scenarios: 100%
- Every failing TUI test must emit transcript + logs + workspace diff artifacts
- PR suite runtime target: <=15 minutes

# Step 05 - Generate Output

## Output Files

- [test-design-architecture.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-architecture.md)
- [test-design-qa.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-qa.md)
- [opencode-aidd-plugin-handoff.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design/opencode-aidd-plugin-handoff.md)

## Completion Report

- Mode used: System-Level
- Execution mode used: sequential
- Key blockers:
  - Cross-platform PTY driver decision
  - External log/artifact observability
  - Stable-signal oracle policy
- Gate thresholds:
  - P0 100%
  - P1 >=95%
  - PR runtime <=15 minutes
- Open assumptions:
  - `devai` CLI/TUI is PTY-drivable in local and CI environments
  - test-only provider credentials can be provisioned
