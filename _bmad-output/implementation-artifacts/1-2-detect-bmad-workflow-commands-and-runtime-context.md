# Story 1.2: Detect BMAD Workflow Commands and Runtime Context

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want the system to recognize the BMAD command and execution phase I started,
so that later Git decisions are based on the correct workflow context.

## Acceptance Criteria

1. **Given** a command is received by the runtime before execution
   **When** the command matches a configured or discovered BMAD workflow command
   **Then** the system classifies the workflow identity and records the command context for downstream policy resolution
   **And** the detection works without requiring the user to rename the existing BMAD command.
2. **Given** a session or tool event occurs after workflow start
   **When** the runtime processes the event
   **Then** the system preserves enough context to distinguish start, in-progress, and finish phases
   **And** non-workflow commands are ignored without blocking unrelated runtime behavior.

## Tasks / Subtasks

- [x] Extract workflow detection into a dedicated service module (AC: 1, 2)
  - [x] Create `src/services/workflow/detect-workflow-context.js` exporting a pure function that takes `(commandInput, workflowCommands)` and returns a workflow context object or `null` when the command does not match.
  - [x] Create `src/services/workflow/workflow-state.js` exporting a session-scoped store (Map-based, keyed by `sessionID`) with `set/get/clear` operations and an `advancePhase(sessionID, nextPhase)` helper.
  - [x] Define and export the workflow context shape (commandName, normalizedCommand, arguments, sessionID, detectedAt ISO-8601 timestamp, phase) from a single source so downstream stories can import it without duplication.
  - [x] Move the existing `normalizeCommandName` helper out of `src/policies/legacy/devai-git-workflo.js` and into `src/services/workflow/detect-workflow-context.js` so legacy and wrapper both call the same normalization.

- [x] Wire the detection service into the wrapper bootstrap (AC: 1)
  - [x] In `src/index.js`, construct the workflow state store once during bootstrap and pass it (along with `workflowCommands`) into a new factory injected into hook wrappers, instead of having state live only inside the legacy core closure.
  - [x] Update `src/hooks/command-execute-before.js` to call `detectWorkflowContext(input, workflowCommands)` first; on match, record the context in the workflow state store with `phase: "start"` BEFORE delegating to the legacy handler so legacy parity assertions continue to pass.
  - [x] Emit a structured `workflow.detected` audit event via the audit logger when a context is recorded; payload follows the architecture event contract (`event`, `timestamp`, `workflow`, `command`, `details`).
  - [x] Do not change legacy command semantics: legacy `start instruction` text, `synthetic` flag, and `metadata.phase: "start"` output parts must remain identical so `tests/regression.test.js` `normalizeOutputParts` deepEqual checks continue to pass.

- [x] Distinguish lifecycle phases through session/tool events (AC: 2)
  - [x] In `src/hooks/tool-execute-before.js` and `src/hooks/tool-execute-after.js`, look up workflow state by `sessionID` and, if present, call `advancePhase(sessionID, "in-progress")` on the FIRST tool event that follows `start`; subsequent advances must be idempotent.
  - [x] In `src/hooks/session.js`, on `session.deleted` events clear the workflow state for that `sessionID` (preserve current behavior). DO NOT introduce finalization detection here — finish-phase detection is owned by Story 3.1.
  - [x] When `detectWorkflowContext` returns `null` (non-workflow commands), every hook MUST return without touching the state store and without throwing, preserving non-workflow runtime behavior.
  - [x] Treat the `finish` phase as a reserved enum value that downstream stories will set; this story records the value in the lifecycle type definition but does not transition into it.

- [x] Expand regression and contract coverage (AC: 1, 2)
  - [x] Extend `tests/regression.test.js` to invoke `command.execute.before` with a NON-workflow command (e.g., `/non-workflow-command`) and assert the wrapper produces zero `output.parts`, zero state entries, and no audit `workflow.detected` event.
  - [x] Add a wrapper-only assertion that a workflow command followed by a `read` tool call advances the recorded phase from `start` to `in-progress` while preserving the existing legacy-parity assertions for command output and mutating-tool error.
  - [x] Add a contract-style assertion (inline in the regression script is acceptable for now) that the audit log captured during wrapper bootstrap includes a `workflow.detected` entry with the expected payload keys (`event`, `timestamp`, `workflow`, `command`, `details`).
  - [x] Verify legacy parity still holds: `legacy` instance must produce the same prompts and mutating-tool error message as `wrapper` and `built` after the refactor (no behavior drift in legacy core).

- [x] Verify the build and runtime contract (AC: 1, 2)
  - [x] Run `npm run build && npm test` from a clean checkout; both must pass.
  - [x] Confirm the built `dist/devai-aidd-guard.js` exports the same plugin factory shape (`DevaiAiddGuardPlugin` and the `DevaiGitWorkflowPlugin` alias) and that the new workflow service modules are inlined into the bundle by `esbuild`.

### Review Follow-ups (AI)

- [x] [AI-Review][Medium] `detectWorkflowContext`가 `new Date().toISOString()`을 호출해 "순수 함수" 계약을 위반함 — `detectedAt` 주입을 훅 래퍼 레이어로 이전하거나 `now` 의존성을 인자로 받아 결정성 확보 [src/services/workflow/detect-workflow-context.js:40]
- [x] [AI-Review][Medium] phase 전환이 회귀 테스트에서 직접 단언되지 않음 — `workflowState`에 인스펙션 API를 추가하거나 다른 관찰 전략으로 `phase === "in-progress"`를 명시적으로 검증 [tests/regression.test.js:340-353]
- [x] [AI-Review][Medium] `sessionID` 누락 시 상태 스토어가 `undefined` 키로 오염될 수 있음 — 감지기 또는 훅에서 `sessionID` 필수 가드를 추가해 cross-session leakage 차단 [src/services/workflow/detect-workflow-context.js:39, src/hooks/command-execute-before.js:8]
- [x] [AI-Review][Medium] `tool.execute.after`의 phase 전환 경로가 테스트되지 않음 — `tool.execute.after` 호출을 회귀 테스트에 추가해 양쪽 훅 모두 커버 [tests/regression.test.js, src/hooks/tool-execute-after.js]
- [x] [AI-Review][Medium] `session.deleted`의 워크플로우 상태 클리어가 테스트되지 않음 — 회귀 테스트에서 `session.deleted` 이벤트 발사 후 후속 도구 이벤트가 phase를 advance시키지 않음을 단언 [tests/regression.test.js, src/hooks/session.js:5-7]
- [x] [AI-Review][Low] `audit.info` 호출의 외부 try/catch가 중복 — `src/audit/logger.js`가 이미 모든 목적지 오류를 흡수하므로 단순화 가능 [src/hooks/command-execute-before.js:10-24]
- [x] [AI-Review][Low] `commandName`과 `normalizedCommand`가 동일한 값을 중복 보유 — 향후 분기 계획이 없다면 단일 필드로 정리 [src/services/workflow/detect-workflow-context.js:36-37]
- [x] [AI-Review][Low] 상태 스토어의 mutability 정책 불일치 — `set`은 shallow copy, `advancePhase`는 in-place 변이, `get`은 라이브 참조 반환. 일관된 정책(예: get 시 사본 반환)으로 통일 [src/services/workflow/workflow-state.js:11-32]
- [x] [AI-Review][Low] `get()`의 `undefined`→`null` 강제 변환 제거 — `Map.get`이 반환하는 `undefined` 그대로 사용 [src/services/workflow/workflow-state.js:15-18]
- [x] [AI-Review][Low] `tool-execute-before.js`와 `tool-execute-after.js`가 바이트 단위 동일 — 공통 헬퍼 `advancePhaseIfWorkflowSession`로 DRY [src/hooks/tool-execute-before.js, src/hooks/tool-execute-after.js]
- [x] [AI-Review][Low] `WorkflowPhase` typedef이 JSDoc-only이라 `advancePhase`가 임의 문자열을 수용 — `WORKFLOW_PHASES` 상수를 export하고 런타임 검증 추가 [src/services/workflow/detect-workflow-context.js, src/services/workflow/workflow-state.js]
- [x] [AI-Review][Low] `tool.execute.after` 래퍼 경로의 phase 전환이 회귀 테스트에서 직접 단언되지 않음 — 팩토리 레벨 단언 추가 [tests/regression.test.js]
- [x] [AI-Review][Low] 동일 sessionID 재감지 동작이 회귀 단언으로 명시되지 않음 — re-detection 시 audit 재발행 + phase 리셋 단언 추가 [tests/regression.test.js, src/hooks/command-execute-before.js]

## Dev Notes

### Story Intent

This story is the workflow-context foundation for Epic 1. Stories 1.3 (policy resolution), 1.4 (branch strategy computation), 1.5 (repository readiness), and the entire Epic 2 approval flow depend on a stable, structured workflow context being available from the moment a BMAD command starts. Implement detection and lifecycle bookkeeping ONLY — do not pull policy resolution, branch naming, or approval prompts into this story even if they are tempting adjacent additions.

### Verified Baseline Findings

- Workflow command discovery already exists in two places that must converge:
  - `src/config/load-config.js` `loadWorkflowCommands` reads `.opencode/commands/*.md` from the project directory through the FS adapter.
  - `src/policies/legacy/devai-git-workflo.js` re-implements an FS-direct version of the same loader (line 22) and exposes a private `normalizeCommandName` (line 18). Story 1.1 already eliminated the duplicate disk read by passing the wrapper-loaded set in; the legacy fallback path remains for direct legacy use.
- Today the only "context" stored is `states.set(input.sessionID, { commandName, lifecycle: "active" })` inside the legacy core (`src/policies/legacy/devai-git-workflo.js:77`). Lifecycle is implicitly toggled to `"mutating"` in `tool.execute.after` (`src/policies/legacy/devai-git-workflo.js:120`). There is no explicit `start` / `in-progress` / `finish` phase model.
- The legacy core emits a `start` instruction `output.parts` entry with `metadata.phase: "start"` (`src/policies/legacy/devai-git-workflo.js:86-94`). Regression at `tests/regression.test.js:232-242` asserts exact deepEqual parity for these parts between legacy/wrapper/built. The refactor MUST preserve this exact structure.
- `src/hooks/*.js` are currently thin pass-through wrappers that only delegate to the legacy handlers. There is no detection logic in the wrapper layer yet. Story 1.2 is the first story to put substantive workflow logic in the wrapper boundary.
- `src/services/workflow/` does NOT exist yet. The architecture target structure (`_bmad-output/planning-artifacts/architecture.md` "Project Structure & Boundaries") expects this folder to host detection, policy resolution, and state.

### Technical Requirements

- Maintain the ESM Node 22 runtime contract from `package.json` and the wrapper bootstrap conventions established in Story 1.1. Do not introduce CommonJS, top-level await beyond what `src/index.js` already uses, or new runtime dependencies.
- Workflow detection must be a pure function: input is the runtime `commandInput` (with `command`, `arguments`, `sessionID`) and the `workflowCommands` Set; output is either the workflow context object or `null`. No I/O, no logger calls, no time mutation inside the pure detector — push side effects into the hook wrapper.
- The workflow state store must be in-memory only and scoped to the bootstrap closure. No file persistence, no global mutable singletons exported from a module, and no cross-session leakage. This matches the architecture's `state management patterns` rule: "Implicit global mutable state is forbidden."
- Hook entry points must remain thin. Detection, state lookup, and audit event emission belong in workflow service helpers; the hook itself orchestrates the call sequence and delegates to the legacy core.
- Audit event emission must be best-effort and non-blocking. Reuse `audit.info(...)` from `src/audit/logger.js`; never let an audit failure interrupt detection or downstream legacy behavior.
- Do NOT introduce policy resolution (Story 1.3), branch strategy (Story 1.4), repository readiness (Story 1.5), or approval prompts (Epic 2). The workflow context produced here is the input contract those stories will consume; keep the surface deliberately narrow.

### Architecture Compliance

- Folder placement: new code lives under `src/services/workflow/`. Do not put detection logic in `src/hooks/` or `src/policies/legacy/`. Reference: `_bmad-output/planning-artifacts/architecture.md` "Project Structure & Boundaries → File Structure Patterns".
- Naming: file names use `kebab-case.js`; exported functions use `camelCase`; the workflow context type uses `PascalCase` if a typedef-style JSDoc is added; event identifiers use `dot.case` (`workflow.detected`). Reference: architecture "Implementation Patterns & Consistency Rules → Naming Patterns".
- Audit event payload follows the standard event envelope:

  ```js
  {
    event: "workflow.detected",
    timestamp: "<ISO-8601>",
    workflow: "<workflowCommand>",
    command: "<workflowCommand>",
    details: { sessionID, hasArguments: boolean, source: "command.execute.before" }
  }
  ```

  Do not include the raw `arguments` string in the audit payload — the architecture's audit rule is "minimum approval and execution metadata only; no sensitive content." Reference: PRD "Compliance & Regulatory" + architecture "Communication Patterns → Event System Patterns".
- Keep the legacy core untouched at the behavioral level. The wrapper records context BEFORE delegating, so the legacy handler still runs and the regression deepEqual checks pass. If a legacy handler is missing for an optional hook, the wrapper detection path must still be safe (no throw, no audit error spam).
- Do not introduce a database, background timer, or external service. The architecture's data decision is "file-based persistence + in-memory session state only." All of Story 1.2 lives in process memory.

### Library / Framework Requirements

- No new runtime dependencies. The detection service can be implemented with built-in `Map`, `Set`, and `Date.toISOString()`. Adding a third-party state library, validator, or event bus is explicitly out of scope.
- Continue using the existing `audit` logger; do not replace it with a new event bus in this story. Reference: `src/audit/logger.js`.
- Build target stays `esbuild` ESM Node 22. New service files must be importable from `src/index.js` without changes to `scripts/build.js`. The bundler picks up newly imported modules automatically; verify by running `npm run build` and confirming `dist/devai-aidd-guard.js` regenerates without warnings.

### File Structure Requirements

- New files for this story:
  - `src/services/workflow/detect-workflow-context.js` — pure detector + shared `normalizeCommandName` helper.
  - `src/services/workflow/workflow-state.js` — in-memory session-scoped state store with `set / get / clear / advancePhase`.
- Modified files for this story:
  - `src/index.js` — instantiate the workflow state store once during bootstrap and inject it into hook factories.
  - `src/hooks/command-execute-before.js` — invoke detection, record context, emit `workflow.detected`, then delegate to legacy.
  - `src/hooks/tool-execute-before.js` — read state by `sessionID`; on first match advance phase to `in-progress` (idempotent).
  - `src/hooks/tool-execute-after.js` — same idempotent advance hook (covers tools that finish without a `before` event-stream signal).
  - `src/hooks/session.js` — clear state on `session.deleted`; do not introduce `finish` here.
  - `src/policies/legacy/devai-git-workflo.js` — leave behavior intact; it may continue to maintain its own `states` Map for legacy parity. The new wrapper-side state store is additive, not a replacement.
  - `tests/regression.test.js` — extend with non-workflow command, phase-advance, and audit-payload assertions described in Tasks.
- Do not create new top-level folders (`src/events/`, `src/commands/`) yet — they belong to later stories per the architecture migration order. Story 1.2 only adds `src/services/workflow/`.
- Do not move existing legacy files. The architecture migration plan is incremental; mass folder moves outside the story scope risk silent regression.

### Testing Requirements

- Required verification commands: `npm run build` and `npm test`. Both must pass from a clean checkout per the Story 1.1 build/test contract.
- Regression focus areas to extend in `tests/regression.test.js`:
  - Non-workflow command path: confirm wrapper outputs zero parts, no state entry, no `workflow.detected` audit log.
  - Workflow command path: confirm wrapper records `phase: "start"` and emits exactly one `workflow.detected` audit entry per command invocation.
  - Phase advance path: confirm a `read` tool call after `start` transitions phase to `in-progress`; a SECOND `read` call must NOT emit a duplicate audit event or duplicate state mutation (idempotency check).
  - Legacy parity: existing `normalizeOutputParts` deepEqual and mutating-tool error parity must still hold; do not regress these assertions.
- For the audit-payload contract, prefer asserting the SHAPE (presence of `event`, `timestamp`, `workflow`, `command`, `details`) rather than the exact timestamp value, because timestamps are non-deterministic.
- The architecture target test layout (`tests/contracts/`, `tests/integration/`) is NOT required for this story. Keep new assertions in the existing `tests/regression.test.js` to match Story 1.1's working pattern; relocating tests is an Epic 4 concern.

### Previous Story Intelligence

- Story 1.1 (`_bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md`) established that the wrapper layer (`src/index.js` + `src/hooks/*.js`) is the correct place for new orchestration; the legacy core stays untouched as a parity baseline. Follow this pattern: extend the wrapper, leave the legacy core alone unless behavior parity is impossible.
- Story 1.1 review surfaced four "low" findings that shape this story's style:
  - Hook factories use direct `legacyHandlers["…"]` access — keep that style for new hook code.
  - Avoid duplicate disk reads — the wrapper already loads `workflowCommands` once and passes it into the legacy core; the new detection service must reuse this same set rather than re-reading the commands directory.
  - The regression test expects a prebuilt `dist/devai-aidd-guard.js` and runs `npm run build && npm test` as a sequence — your task list reflects this contract.
  - Optional hooks should leave a small audit trail when they make a meaningful state decision instead of silently no-oping. Apply this principle to `workflow.detected`: it is the audit signal that workflow detection happened.
- Story 1.1's sprint-change-proposal (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md`) deferred compatibility-bridge file generation to Story 4.2. Story 1.2 must NOT take on configuration migration concerns; it consumes whatever `loadRuntimeConfig` produces.

### Git Intelligence Summary

- The most recent five commits (`dfaf0d9`, `576fa74`, `110a0ac`, `e2bf242`, `3e4a1d9`) are all planning/sprint artifacts. There is no production source code commit between Story 1.1 completion and the start of Story 1.2; the dev agent should treat the current `src/` tree (with Story 1.1's bootstrap changes) as the authoritative starting point.
- Story 1.1's implementation already added `src/policies/legacy/devai-git-workflo.js`, the audit no-op-hook log entry in `src/index.js`, and the `dist/devai-aidd-guard.js` build expectation in `tests/regression.test.js`. Build on those — do not undo them.
- The current branch is `codex/bmad/epic1/story1-1`; coordinate with the human operator before opening a new branch. Branch creation/switching is itself an Epic 1 / Epic 2 automation concern that this story does not implement.

### Project Structure Notes

- The architecture document describes a richer target structure (`src/services/workflow/`, `src/services/approval/`, `src/services/git/`, `src/events/`, `src/commands/`). Story 1.2 only materializes `src/services/workflow/`. Resist the temptation to scaffold empty placeholder folders; create only what the tasks above require.
- `src/policies/legacy/devai-git-workflo.js` is intentionally untouched at the behavioral level. The legacy core may continue to maintain its own `states` Map for the `tool.execute.before` mutating-tool guard; the wrapper-side state store is additive context for downstream stories. If you are tempted to delete the legacy `states` Map, STOP — that breaks Story 1.1's regression parity contract.
- The compatibility bridge marker (`LEGACY_COMPAT_MARKER_FILE_NAME`) and bridge generation are owned by Story 4.2. Do not modify `ensureLegacyProjectConfigCompatibility` or its call site.

### References

- Epic and story definition: [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Workflow-Aware Safe Start]
- Functional and non-functional requirements: [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements] (FR1, FR4, FR27, FR28, FR30; NFR1, NFR4, NFR5, NFR13)
- Architecture target folder layout: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- Architecture event contracts: [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- Architecture naming and pattern rules: [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- Story 1.1 implementation precedent: [Source: _bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md]
- Sprint-change scope boundary: [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md]
- Bootstrap implementation baseline: [Source: src/index.js]
- Legacy core baseline: [Source: src/policies/legacy/devai-git-workflo.js]
- Hook wrapper baseline: [Source: src/hooks/command-execute-before.js], [Source: src/hooks/tool-execute-before.js], [Source: src/hooks/tool-execute-after.js], [Source: src/hooks/session.js]
- Audit logger baseline: [Source: src/audit/logger.js]
- Configuration loader and command discovery: [Source: src/config/load-config.js]
- Regression baseline: [Source: tests/regression.test.js]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (1M context)

### Debug Log References

### Completion Notes List

- `src/services/workflow/detect-workflow-context.js` 생성: `normalizeCommandName` 및 `detectWorkflowContext` 순수 함수, `WorkflowPhase`/`WorkflowContext` JSDoc typedef 포함.
- `src/services/workflow/workflow-state.js` 생성: in-memory Map 기반 세션 범위 상태 스토어 (`set/get/clear/advancePhase`). `advancePhase`는 멱등 처리.
- `src/policies/legacy/devai-git-workflo.js`: 로컬 `normalizeCommandName` 제거 후 서비스 모듈에서 import. 동작은 동일하게 유지.
- `src/index.js`: `createWorkflowStateStore` import 추가; `workflowState` 인스턴스를 부트스트랩 클로저 내에서 생성 후 각 훅 팩토리에 주입.
- `src/hooks/command-execute-before.js`: `detectWorkflowContext` 호출 후 컨텍스트 기록, `workflow.detected` audit 이벤트 발행(best-effort). 이후 legacy 핸들러에 위임.
- `src/hooks/tool-execute-before.js` / `tool-execute-after.js`: 세션 상태 조회 후 `advancePhase("in-progress")` 호출(멱등). 비-워크플로우 세션은 무통과.
- `src/hooks/session.js`: `session.deleted` 이벤트 시 워크플로우 상태 클리어. legacy 핸들러 위임 유지.
- `tests/regression.test.js`: 비-워크플로우 명령 경로(zero parts, zero guard, no audit), audit 페이로드 shape, 단계 전진 멱등성, legacy 패리티 검증 추가.
- `npm run build && npm test` 모두 통과. `status: "passed"`.
- ✅ 코드 리뷰 follow-up 10건 처리 완료 (Medium 5, Low 5). 상세:
  - [Medium] `detectWorkflowContext` 순수성 회복 — `detectedAt`를 호출자가 옵션으로 주입하도록 변경; 훅 래퍼에서 `new Date().toISOString()` 주입.
  - [Medium] phase 전환을 회귀 테스트에서 직접 단언 — `workflow-state.js`/`detect-workflow-context.js`를 직접 import하여 `phase === "in-progress"` 명시적 검증 + 멱등성/미상 세션 no-op 단위 검증 추가.
  - [Medium] `sessionID` 누락 가드 추가 — `detectWorkflowContext`가 `sessionID` 미존재 시 `null` 반환; `advancePhaseIfWorkflowSession`은 `sessionID` 누락/미상 세션을 안전하게 no-op.
  - [Medium] `tool.execute.after` 경로 테스트 추가 — wrapper 핸들러를 통해 호출 후 추가 audit 이벤트가 발생하지 않음을 단언.
  - [Medium] `session.deleted` 클리어 테스트 추가 — `event` 핸들러로 삭제 후 후속 mutating 도구가 legacy guard를 트리거하지 않음을 단언.
  - [Low] `command-execute-before`의 try/catch 제거 — `audit.info`는 `src/audit/logger.js`에서 이미 모든 목적지 오류를 흡수하므로 중복 방어 코드 정리.
  - [Low] `commandName`/`normalizedCommand` 중복 제거 — 단일 `commandName` 필드로 정리, JSDoc typedef도 동기화.
  - [Low] workflow-state mutability 정책 통일 — `get`이 사본을 반환하도록 변경하여 외부 변이가 store에 누설되지 않음을 보장.
  - [Low] `get()`의 `undefined`→`null` 강제 변환 제거 — `Map.get`이 반환하는 `undefined`를 그대로 노출.
  - [Low] `tool-execute-before/after` DRY 처리 — 공통 헬퍼 `advancePhaseIfWorkflowSession`을 `detect-workflow-context.js`에서 export하여 양쪽 훅이 동일하게 호출.
- 리팩터 후 `npm run build && npm test` 재실행: 모두 통과. legacy 패리티(`normalizeOutputParts` deepEqual + mutating-tool error 메시지) 유지 확인.
- ✅ 2차 코드 리뷰 follow-up 3건 처리 (Low 3건). 상세:
  - [Low] `WORKFLOW_PHASES` 상수 export + `advancePhase` 런타임 가드 — 잘못된 phase 문자열(예: `"in_progress"`) 입력 시 즉시 throw하여 typo로 인한 silent drift 차단.
  - [Low] `tool.execute.after` 래퍼 phase 전환을 팩토리 레벨에서 직접 단언 — 인스펙션 가능한 `workflowState`로 hook을 직접 호출하고 `phase === "in-progress"`를 검증.
  - [Low] 동일 sessionID 재감지 동작 단언 추가 — 두 번째 invocation에서 audit 재발행 + 단위 레벨에서 `set`이 phase를 `"start"`로 리셋함을 확인.
- 2차 follow-up 후 `npm run build && npm test` 재실행: 모두 통과. legacy 패리티 유지 확인.

### File List

- src/services/workflow/detect-workflow-context.js (신규)
- src/services/workflow/workflow-state.js (신규)
- src/index.js (수정)
- src/hooks/command-execute-before.js (수정)
- src/hooks/tool-execute-before.js (수정)
- src/hooks/tool-execute-after.js (수정)
- src/hooks/session.js (수정)
- src/policies/legacy/devai-git-workflo.js (수정)
- tests/regression.test.js (수정)
- _bmad-output/implementation-artifacts/sprint-status.yaml (수정)

## Change Log

- 2026-05-08: Story 1.2 구현 완료 — 워크플로우 감지 서비스 (`src/services/workflow/`) 생성, 래퍼 훅에 감지 및 단계 관리 로직 추가, `workflow.detected` audit 이벤트 발행, `normalizeCommandName` 공유화, 회귀 테스트 확장.
- 2026-05-08: 코드 리뷰 수행 — Medium 5건, Low 5건 발견. Review Follow-ups (AI) 섹션에 액션 아이템 등록. Status를 review → in-progress로 전환.
- 2026-05-08: 코드 리뷰 follow-up 10건 모두 처리 — `detectedAt` 호출자 주입(순수성 회복), `sessionID` 누락 가드, `commandName` 단일 필드 정리, workflow-state `get` 사본 반환, audit try/catch 제거, `advancePhaseIfWorkflowSession` 공통 헬퍼로 DRY, 회귀 테스트에 phase 전환/`tool.execute.after`/`session.deleted` 단언 추가. Status를 in-progress → review로 전환.
- 2026-05-08: 2차 코드 리뷰 수행 — Critical/High/Medium 0건, Low 3건. 자동 수정 옵션으로 모두 처리: `WORKFLOW_PHASES` 런타임 가드, `tool.execute.after` 래퍼 phase 단언, 동일 sessionID 재감지 단언. `npm run build && npm test` 통과. Status를 review → done으로 전환.
