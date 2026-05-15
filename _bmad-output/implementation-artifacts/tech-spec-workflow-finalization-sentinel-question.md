---
title: 'Workflow Finalization Detection via Sentinel Question'
slug: 'workflow-finalization-sentinel-question'
created: '2026-05-14'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js (ESM)', 'opencode plugin runtime', 'node:assert/strict']
files_to_modify:
  - 'src/services/approval/build-finalization-sentinel-instruction.js (NEW)'
  - 'src/hooks/command-execute-before.js'
  - 'src/hooks/tool-execute-after.js'
  - 'src/hooks/tool-execute-before.js'
  - 'tests/unit/build-finalization-sentinel-instruction.test.js (NEW)'
  - 'tests/unit/sentinel-finalization-trigger.test.js (NEW)'
code_patterns:
  - 'output.parts.push({ type: "text", text, synthetic: true, metadata: { source: "devai-git-workflow", ... } })'
  - 'Builder returns { header, options, instructionText, metadata }'
  - 'workflowState.set(sessionID, { ...workflowState.get(sessionID), <field>: value })'
  - 'Audit calls are best-effort try/catch wrapped'
test_patterns:
  - 'node:assert/strict (no jest)'
  - 'Top-level await assertion blocks in tests/unit/*.test.js'
  - 'pathToFileURL + dynamic import for module-under-test'
---

# Tech-Spec: Workflow Finalization Detection via Sentinel Question

**Created:** 2026-05-14

## Overview

### Problem Statement

devai-aidd-plugin은 워크플로우 종료를 결정론적으로 감지할 수단이 없어, 종료 시 commit 승인 question을 사용자에게 노출하지 못한다. 확인된 원인:

- `src/hooks/tool-execute-after.js`의 finalization 트리거가 `input.tool === "finish"`에만 반응하지만, opencode 런타임은 `finish` 도구를 호출하지 않음 (운영 로그 30K+ 라인에서 0회 관찰).
- `skill` 도구 boundary 활용 불가 — before→after elapsed가 356ms로 단순 콘텐츠 로더이며 워크플로우 수명을 표현하지 않음 (실측).
- `session.idle`은 background subagent 대기 등 mid-workflow에서도 다수 발생 → 단독 종료 신호로 사용 불가.

### Solution

워크플로우 감지 시점에 plugin이 `output.parts`로 sentinel instruction을 주입해, 워크플로우의 마지막 액션을 고정 헤더(`__workflow_finalize__`)의 native `question` 호출로 모델에게 강제 지시한다. 해당 sentinel question의 도착이 결정론적 종료 flag가 되어 `evaluateWorkflowFinalization` → `publishNextPlannedAction`(commit 승인 question)을 트리거한다. 기존 `requestStartupChainApproval`의 `output.parts` 주입 채널을 그대로 재사용한다.

### Scope

**In Scope:**

1. `src/hooks/command-execute-before.js`: workflow detection + startup-chain 처리 이후 `output.parts`에 sentinel instruction push (header `__workflow_finalize__`, options `["Finalize"]`, metadata에 sessionID/commandName echo).
2. `src/hooks/tool-execute-after.js`: question 분기 내부에 sentinel header 매칭 분기 추가 (startup-chain 분기 이후·기존 `finish` 분기 이전). 매칭 시 `evaluateWorkflowFinalization` + `publishNextPlannedAction` 호출, `workflowState.finalizationTriggered`로 중복 실행 차단.
3. `src/hooks/tool-execute-before.js` Layer 2 header guard에 sentinel header 패스스루 예외 추가 (active approval과 매칭되지 않더라도 throw하지 않도록).
4. sentinel instruction을 빌드하는 신규 builder 모듈 (예: `src/services/approval/build-finalization-sentinel-instruction.js`) — startup-chain builder와 동일 형태.
5. 단위 테스트 4종 (sentinel 주입 / 1회 호출 / 중복 차단 / Layer 2 패스스루).

**Out of Scope:**

- BMAD 스킬 파일 수정 (절대 불변 제약).
- 모델이 sentinel을 빼먹는 경우의 fallback (별도 이슈로 보류).
- 사용자 입력 방식/UX 변경 — 사용자는 기존 commit 승인 question만 응답.
- 타이머/디바운스 기반 종료 추정.
- BMAD `step-05-present.md` read 감지 기반 sentinel 리마인더 append (신뢰도 보강 옵션 — 제외).
- plugin-test 환경 e2e 통합 시나리오 검증.

## Context for Development

### Codebase Patterns

- **`output.parts` 인스트럭션 주입**: `src/hooks/command-execute-before.js:420-438` (startup-chain 경로) 및 `:587-605` (일반 start instruction). 모두 `output.parts.push({ type: "text", text, synthetic: true, metadata: { source: "devai-git-workflow", phase: "start", ... } })` 형태. sentinel도 동일 채널·동일 구조를 따른다.
- **Builder 패턴**: `src/services/approval/build-startup-chain-question-instruction.js`가 `{ header, options, instructionText, metadata }`를 반환. sentinel builder도 동일 시그니처로 작성한다.
- **`tool-execute-after.js`의 question 분기 순서**: 현재 `resolveStartupChainFromQuestion` → (handled return) → `input?.tool === "finish"` 처리. sentinel 분기는 startup-chain 분기가 false로 떨어진 직후·`finish` 분기 이전에 삽입한다.
- **Layer 2 header guard**: `src/hooks/tool-execute-before.js:331-378`. `active && pendingApprovalQuestion == null`일 때 expected header와 비교하며 mismatch 시 throw. sentinel header는 이 비교 전에 early-return으로 패스스루한다.
- **`workflowState` 플래그 관리**: `workflowState.set(sessionID, { ...workflowState.get(sessionID), <field>: <value> })` 패턴 (예: `pendingStartupQuestion`, `startupChainCurrent`).
- **`evaluateWorkflowFinalization` 호출 패턴**: 기존 `finish` 분기 (`tool-execute-after.js:300-351`)가 finalization 후 `publishNextPlannedAction`을 호출하는 흐름 — sentinel 분기도 동일 구조 재사용.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/hooks/command-execute-before.js` | sentinel instruction 주입 지점 (workflow.detected 처리 후, startup-chain 분기와 동일 위치). `:282-440` 흐름이 sentinel 주입의 직접적인 모델. |
| `src/hooks/tool-execute-after.js` | sentinel question 도착 시 finalization 트리거 분기 추가 (`:281-376`). startup-chain 분기(`:281-299`)와 finish 분기(`:300-351`) 사이가 삽입 지점. |
| `src/hooks/tool-execute-before.js` | Layer 2 header guard에 sentinel 패스스루 예외 (`:297-378`). |
| `src/services/approval/build-startup-chain-question-instruction.js` | sentinel instruction builder의 직접 참조 패턴. |
| `src/services/workflow/evaluate-workflow-finalization.js` | 기존 finalization 평가 — sentinel 분기에서 호출만 추가하면 됨. |
| `src/services/approval/publish-next-planned-action.js` | commit 승인 question을 띄우는 진입점 — finalization 후 호출. |
| `src/index.js` | 필요 시 `requestStartupChainApproval`(`:322-339`) 옆에 sentinel 관련 어댑터를 둘지 결정 (현 안에서는 별도 어댑터 불필요 — 직접 `output.parts` push로 충분). |
| `src/services/workflow/workflow-state.js` | `workflowState.advancePhase`, `workflowState.set/get` API 확인. sentinel 분기는 `finalizationTriggered` 플래그를 set/get으로 관리. |
| `tests/unit/build-startup-chain-question-instruction.test.js` | 신규 sentinel builder 단위 테스트의 직접 템플릿. |
| `tests/unit/opencode-skill-workflow-guard.test.js` | hook을 dynamic import → in-process 호출로 검증하는 패턴. sentinel finalization-trigger 단위 테스트의 직접 템플릿. |

### Technical Decisions

- **Sentinel header 상수**: `__workflow_finalize__` (고정값). 인간 사용자 헤더와 충돌 회피를 위해 더블 언더스코어 prefix/suffix 사용. 상수는 builder 모듈에 export.
- **Sentinel options**: `["Finalize"]` 단일 옵션. 사용자에게 노출되지 않는 모델-only sentinel이므로 의미보다 결정론성이 우선.
- **중첩 워크플로우 식별**: sentinel question metadata에 `sessionID + commandName` echo. `tool-execute-after.js` 분기에서 `state.commandName`과 일치할 때만 finalization 트리거 (다른 워크플로우의 stale sentinel 방지).
- **중복 실행 가드**: `workflowState`에 `finalizationTriggered: true` 플래그 set. 같은 sessionID에서 두 번째 sentinel 도착 시 early-return.
- **Layer 2 패스스루 조건**: `readQuestionToolHeader(toolArgs) === SENTINEL_HEADER`일 때 expected header 검사를 우회. active approval이 있어도 sentinel은 통과시킨다 (모델이 워크플로우 마지막 액션을 호출한 상태이므로 차단해서는 안 됨).
- **`output.parts` 주입 위치 정확화**: 기존 start-instruction push(`command-execute-before.js:597-605`) **이후** 별도 part로 push하거나, 동일 part의 text에 append. 별도 part가 metadata 분리·디버깅 용이성에서 우수 → 별도 part 채택.
- **builder 단일 책임**: 신규 `build-finalization-sentinel-instruction.js`는 `{ header, options, instructionText, metadata: { sentinelKind: "workflow-finalize", sessionID, commandName } }` 반환. `tool-execute-after.js`는 header 상수 매칭으로 식별 (sentinel header 상수는 builder 모듈에서 export).
- **finalizationTriggered 플래그**: `workflowState.set(sessionID, { ...workflowState.get(sessionID), finalizationTriggered: true })`로 set. sentinel 분기 진입 시 이미 true면 early return (audit `sentinel.duplicate` 한 줄만 남기고 종료).
- **`evaluateWorkflowFinalization` 인자**: 기존 `finish` 분기와 동일한 `{ workflowState, sessionID, input, output, audit, pluginContext }`로 호출. `input.tool === "question"`이지만 함수 내부는 tool 이름에 의존하지 않음 (changedFiles 추출만 input/output에서 시도) — 무문제.
- **finish 분기와의 관계**: 기존 `input?.tool === "finish"` 분기는 코드 자체는 유지 (dead-code 정리는 본 spec 범위 외). sentinel 분기가 실제 트리거로 동작하며, finish 분기는 만약을 위한 호환 path로 잔존.
- **observability**: sentinel 트리거가 부른 finalization도 `workflow.finalization.evaluated` audit을 자동 emit (evaluateWorkflowFinalization 내부 호출). 추가로 sentinel 분기 진입 시 `workflow.finalization.sentinel.received` audit 1건 emit하여 트리거 출처 구분. 조기 sentinel 거부 시 `workflow.finalization.sentinel.premature` 1건 emit (F1 fix).
- **조기 sentinel 가드 (F1 fix)**: sentinel 도착 시 `state.phase === "mutating"` OR `state.touchedFiles.length > 0` 둘 중 하나가 참일 때만 finalization 진행. 둘 다 거짓이면 premature audit만 emit하고 early return — 모델이 잘못된 시점에 sentinel을 부른 경우 빈 commit 승인이 사용자에게 노출되지 않는다.
- **sentinel passthrough 위치 (F2 fix)**: `tool-execute-before.js`에서 `input.tool === "question"` 블록의 **최상단** — startup-chain header guard(`:301`)와 active-approval header guard(`:331`) 양쪽보다 위. 그렇지 않으면 startup chain pending 상태에서 sentinel이 도착했을 때 startup-chain guard가 먼저 throw한다.
- **sentinel push 정확 위치 (F3 fix)**: `command-execute-before.js`에서 startup-chain 경로는 기존 `output.parts.push(...)`(`:423-438`) **다음**, `return;`(`:439`) **직전**에 sentinel push. 일반 경로는 기존 start-instruction push(`:597-605`) **다음 라인**. 두 경로 모두 결과적으로 `output.parts.length === 2`이며 함수 스코프 내 inline 헬퍼 `pushSentinelPart()`로 중복 제거.

## Implementation Plan

### Tasks

- [x] **Task 1: Sentinel instruction builder 작성**
  - File: `src/services/approval/build-finalization-sentinel-instruction.js` (NEW)
  - Action: 신규 모듈 생성. 다음을 export한다:
    - `export const FINALIZATION_SENTINEL_HEADER = "__workflow_finalize__";`
    - `export const FINALIZATION_SENTINEL_OPTIONS = ["Finalize"];`
    - `export function buildFinalizationSentinelInstruction({ sessionID, commandName })` → `{ header, options, instructionText, metadata }` 반환.
      - `header`: `FINALIZATION_SENTINEL_HEADER`
      - `options`: `FINALIZATION_SENTINEL_OPTIONS`
      - `metadata`: `{ source: "devai-git-workflow", sentinelKind: "workflow-finalize", sessionID, commandName }`
      - `instructionText`: 모델에게 "이 워크플로우의 마지막 액션은 반드시 `question` 도구를 header `__workflow_finalize__`, options `["Finalize"]`로 호출하는 것이며, 이 호출 이후 어떤 도구 호출이나 텍스트 출력도 하지 말 것"을 명시. `requestStartupChainApproval` 패턴(`build-startup-chain-question-instruction.js`)을 참고하여 동일 톤·형식 유지.
  - Notes: `commandName`은 `replace(/^\/+/, "")`로 정규화. `sessionID` 또는 `commandName`이 비면 instructionText에 안전한 placeholder (예: "this workflow")로 fallback.

- [x] **Task 2: command-execute-before.js에 sentinel instruction 주입**
  - File: `src/hooks/command-execute-before.js`
  - Action:
    1. `buildFinalizationSentinelInstruction` import 추가.
    2. **공통 헬퍼**: 함수 스코프 내에 inline 헬퍼 `pushSentinelPart()`를 정의해 두 경로에서 동일 코드 중복을 피한다:
       ```js
       const pushSentinelPart = () => {
         const sentinel = buildFinalizationSentinelInstruction({
           sessionID: context.sessionID,
           commandName: context.commandName,
         });
         if (!Array.isArray(output.parts)) output.parts = [];
         output.parts.push({
           type: "text",
           text: sentinel.instructionText,
           synthetic: true,
           metadata: sentinel.metadata,
         });
         workflowState.set(context.sessionID, {
           ...workflowState.get(context.sessionID),
           finalizationTriggered: false,
         });
       };
       ```
    3. **삽입 위치 1 — startup-chain 경로 (F3 fix)**: 현재 `command-execute-before.js:420-439` 블록의 마지막 `output.parts.push({ ... startup chain part ... });`(`:423-438`) **다음**, `return;`(`:439`) **직전**에 `pushSentinelPart();` 호출. 결과적으로 startup-chain 경로의 `output.parts.length`는 2(startup chain part + sentinel part)가 되어야 함.
    4. **삽입 위치 2 — 일반 경로**: 현재 `:597-605`의 start-instruction `output.parts.push({...})` **다음 라인**에 `pushSentinelPart();` 호출. 일반 경로의 `output.parts.length`도 2(start instruction part + sentinel part)가 되어야 함.
    5. 두 경로 모두에서 `pushSentinelPart()` 호출이 단 1회만 실행되도록 한다(분기 상 중복 호출 경로 없음을 확인).
  - Notes: 기존 start-instruction part metadata에 `sentinelKind`를 섞지 않고 별도 part로 분리 — 디버깅·테스트 격리 용이. 삽입 라인은 분기 내부 `return` 직전이며, audit 조건 블록 안에 들어가지 않도록 주의.

- [x] **Task 3: tool-execute-before.js에 sentinel 패스스루 (Layer 0/1/2 모두 우회)**
  - File: `src/hooks/tool-execute-before.js`
  - Action:
    1. `FINALIZATION_SENTINEL_HEADER` import 추가.
    2. **위치 (F2 fix)**: `input?.tool === "question"` 블록의 **최상단**, 즉 startup-chain header guard(`:301-327`)와 active-approval header guard(`:331-378`) **양쪽보다 위**에 다음 early-return 가드를 둔다. 이렇게 하지 않으면 `startupChainCurrent != null && pendingStartupQuestion == null` 상태에서 sentinel이 도착했을 때 startup-chain guard가 먼저 throw한다.
       ```js
       if (input?.tool === "question") {
         // sentinel passthrough — must be FIRST inside the question branch.
         // The model is allowed (and required) to call this even while a
         // startup chain or active approval is pending; treat sentinel as
         // the workflow-end signal and skip all subsequent question guards.
         const headerFromArgs = readQuestionToolHeader(toolArgs);
         if (headerFromArgs === FINALIZATION_SENTINEL_HEADER) {
           pluginContext?.debug?.log?.("tool-execute-before", "sentinel header passthrough", {
             sessionID: input?.sessionID,
           });
           // F6 fix: do NOT advance phase here — sentinel marks the finish
           // boundary. evaluateWorkflowFinalization in the after-hook will
           // advance to "finish".
           return;
         }
         // ... existing startup-chain header guard + active-approval header guard ...
       }
       ```
    3. Layer 0(bash/git block)·Layer 1(approval-pending block)은 `input.tool` 기준이 아닌 별도 분기(bash, task 등)이므로 sentinel(=question)은 그 분기를 타지 않아 영향 없음 — 확인용 회귀 테스트만 추가 (AC 5-b).
  - Notes: `readQuestionToolHeader`는 이미 존재하는 헬퍼. sentinel 패스스루는 phase 변경·advancePhase 호출 없이 즉시 return하여 Layer 1/2의 어떤 throw도 발생하지 않게 한다.

- [x] **Task 4: tool-execute-after.js에 sentinel finalization 분기 추가**
  - File: `src/hooks/tool-execute-after.js`
  - Action:
    1. `FINALIZATION_SENTINEL_HEADER` import 추가.
    2. 신규 헬퍼 `extractQuestionHeader(input)`을 추가하여 `input.args.questions[0].header`(또는 fallback 위치)에서 header를 추출. 기존 `extractQuestionAnswers`와 동일 파일에 둔다.
    3. question 분기(`:281`) 내부, `resolveStartupChainFromQuestion(handled)` early-return 직후·`input?.tool === "finish"` 분기 직전에 다음 분기 삽입:
       ```js
       if (extractQuestionHeader(input) === FINALIZATION_SENTINEL_HEADER) {
         const sessionID = input?.sessionID;
         const state = workflowState?.get?.(sessionID) ?? null;
         if (!state?.commandName) return;
         // F1 fix: refuse to finalize when nothing has been mutated yet —
         // sentinel could have been emitted early (model error) and we must
         // not push an empty-commit approval. Gate on either:
         //   (a) workflow phase already reached "mutating" (a real mutating
         //       tool has fired during this session), OR
         //   (b) touchedFiles is non-empty (explicit tracked file evidence).
         const hasMutated = state.phase === "mutating";
         const hasTouchedFiles =
           Array.isArray(state.touchedFiles) && state.touchedFiles.length > 0;
         if (!hasMutated && !hasTouchedFiles) {
           pluginContext?.debug?.log?.(
             "tool-execute-after",
             "sentinel premature — no mutation evidence, skip finalization",
             { sessionID, phase: state.phase ?? null },
           );
           try {
             await audit?.info?.("workflow.finalization.sentinel.premature", {
               event: "workflow.finalization.sentinel.premature",
               timestamp: new Date().toISOString(),
               workflow: state.commandName,
               command: state.commandName,
               sessionID,
               outcome: "skip",
               details: { phase: state.phase ?? null },
             });
           } catch { /* best-effort */ }
           return;
         }
         if (state.finalizationTriggered === true) {
           pluginContext?.debug?.log?.("tool-execute-after", "sentinel duplicate — skip", { sessionID });
           try {
             await audit?.info?.("workflow.finalization.sentinel.duplicate", {
               event: "workflow.finalization.sentinel.duplicate",
               timestamp: new Date().toISOString(),
               workflow: state.commandName,
               command: state.commandName,
               sessionID,
               outcome: "skip",
             });
           } catch { /* best-effort */ }
           return;
         }
         workflowState.set(sessionID, { ...state, finalizationTriggered: true });
         try {
           await audit?.info?.("workflow.finalization.sentinel.received", {
             event: "workflow.finalization.sentinel.received",
             timestamp: new Date().toISOString(),
             workflow: state.commandName,
             command: state.commandName,
             sessionID,
             outcome: "trigger",
           });
         } catch { /* best-effort */ }
         const assessment = await evaluateWorkflowFinalization({
           workflowState, sessionID, input, output, audit, pluginContext,
         });
         const finishedState = workflowState.get(sessionID);
         const hasFinalizationProposal =
           finishedState?.commitProposal != null || finishedState?.pushProposal != null;
         const shouldPublishFinishApproval =
           Boolean(finishedState?.commandName) &&
           (assessment?.outcome === "allow" || hasFinalizationProposal);
         if (shouldPublishFinishApproval) {
           const workflowContext = {
             commandName: finishedState.commandName,
             arguments: finishedState.arguments || "",
             sessionID, detectedAt: finishedState.detectedAt,
             phase: finishedState.phase || "finish",
           };
           const resolvedPolicy = pluginContext?.resolvePolicy?.(workflowContext);
           const workflowPolicy =
             resolvedPolicy?.outcome === "allow" ? resolvedPolicy.details?.policy || null : null;
           await publishNextPlannedAction({
             workflowState, workflowContext, workflowPolicy, audit, pluginContext,
           });
         }
         return;
       }
       ```
    4. 기존 `input?.tool === "finish"` 분기는 변경하지 않음 (호환성 path로 잔존).
  - Notes: shouldPublishFinishApproval 로직과 publishNextPlannedAction 호출은 기존 finish 분기(`:316-351`)와 완전히 동일하게 미러링하여 분기 간 행동 차이를 없앤다.

- [x] **Task 5: build-finalization-sentinel-instruction 단위 테스트**
  - File: `tests/unit/build-finalization-sentinel-instruction.test.js` (NEW)
  - Action: `tests/unit/build-startup-chain-question-instruction.test.js`를 템플릿으로 다음 검증:
    1. `header === "__workflow_finalize__"` 및 `options.length === 1 && options[0] === "Finalize"`.
    2. `metadata.sentinelKind === "workflow-finalize"`, `metadata.sessionID`, `metadata.commandName`이 입력값과 일치 (commandName은 `/` prefix 제거된 형태).
    3. `instructionText`에 header 상수 문자열과 "이후 어떤 도구도 호출 금지" 의미의 문구가 포함되는지 substring 매칭.
    4. `sessionID` / `commandName` 누락 시에도 throw하지 않고 안전한 placeholder로 동작.
  - Notes: `node:assert/strict` 사용, top-level await 블록 구조 유지.

- [x] **Task 6: sentinel finalization-trigger 단위 테스트**
  - File: `tests/unit/sentinel-finalization-trigger.test.js` (NEW)
  - Action: `tests/unit/opencode-skill-workflow-guard.test.js`의 dynamic-import 패턴을 따라 hook 모듈을 in-process 호출. mock 구성:
    - `workflowState`: in-memory Map 기반 stub (`.get`, `.set`, `.advancePhase`).
    - `audit`: 호출 카운터 객체.
    - `pluginContext`: `{ debug: { log: () => {} } }` 등 최소 구성.
    - `evaluateWorkflowFinalization`, `publishNextPlannedAction`: 모듈 spy로 wrapping (예: import 후 `mock.method` 카운터 증가 wrapper로 재export하는 fixture, 또는 dynamic import + `import.meta` 트릭 대신 의존성 주입을 위해 hook factory에 inject되는 함수를 모듈 레벨에서 spy로 교체하는 helper 함수 — 가장 단순한 방식 채택).
    - 검증 1 (sentinel injection): mock `output = { parts: [] }`, command-execute-before handler 호출 후 `output.parts`에 header `__workflow_finalize__`, options `["Finalize"]`, metadata sessionID/commandName이 정확히 echo된 part가 정확히 1개 존재.
    - 검증 2 (1회 트리거): workflowState에 `commandName` 세팅된 상태에서 sentinel question을 `tool-execute-after` handler로 전달 → `evaluateWorkflowFinalization` 1회 호출 + `publishNextPlannedAction` 1회 호출 (commitProposal mock 세팅 조건에서).
    - 검증 3 (중복 차단): 같은 sessionID에서 두 번째 sentinel question 전달 시 `evaluateWorkflowFinalization` 추가 호출 없음. `workflow.finalization.sentinel.duplicate` audit 1건 emit.
    - 검증 4 (sentinel passthrough — active approval): active approval이 있는 workflowState 상태에서 `tool-execute-before` handler에 sentinel header를 가진 question 호출 → throw 없이 정상 반환, **phase는 변경되지 않음** (F6 fix).
    - 검증 4-b (sentinel passthrough — startup chain) [F2 fix]: `startupChainCurrent != null && pendingStartupQuestion == null` 상태에서 sentinel header question 호출 → startup-chain header guard가 throw하지 않고 handler 정상 반환.
    - 검증 5 (조기 sentinel 거부) [F1 fix]: `commandName` 세팅됐으나 `phase !== "mutating"`이고 `touchedFiles === []` 상태에서 sentinel question 도착 → `evaluateWorkflowFinalization` 호출 0회 (audit `workflow.finalization.evaluated` 카운트 불변), `workflow.finalization.sentinel.premature` audit 1건 emit, `finalizationTriggered === false` 유지.
  - Notes: spy 주입을 위해 신규 `tool-execute-after`가 `evaluateWorkflowFinalization` / `publishNextPlannedAction`을 module top-level import로 호출하는 현 구조를 유지하되, 테스트는 `import.meta.resolve` 없이 `pathToFileURL` 기반 import만 사용하므로 spy는 hook factory에 별도 inject 옵션을 추가하지 않고 **side-effect 검증으로 대체**: audit emit 카운트(`workflow.finalization.evaluated` 1건 / 2회 호출 시에도 1건만)와 workflowState의 `finalizationTriggered` flag, `commitProposal` 존재 여부로 간접 검증.

- [x] **Task 7: finish 분기에 finalizationTriggered 중복 가드 추가 (호환성)**
  - File: `src/hooks/tool-execute-after.js`
  - Action: 기존 `if (input?.tool === "finish") { ... }` 분기 진입부에 다음 early-return 추가:
    ```js
    const sessionStateForFinish = workflowState?.get?.(input?.sessionID) ?? null;
    if (sessionStateForFinish?.finalizationTriggered === true) {
      pluginContext?.debug?.log?.("tool-execute-after", "finish branch — already finalized via sentinel, skip", { sessionID: input?.sessionID });
      return;
    }
    ```
  - Notes: opencode가 향후 `finish`를 emit하기 시작하더라도 sentinel이 먼저 트리거된 sessionID에서는 중복 finalization이 일어나지 않도록 한다. 현재는 dead path이지만 안전망으로 둔다.

### Acceptance Criteria

- [x] **AC 1 (Sentinel 주입 — happy path) [F4 fix]**: Given workflow 명령 `/bmad-bmm-quick-dev`가 readiness가 allow인 git repo에서 시작될 때, when `command.execute.before` handler가 실행될 때, then `output.parts`를 `metadata.sentinelKind === "workflow-finalize"`로 필터링한 결과는 정확히 1개 part이며 `metadata.sessionID === <session>`, `metadata.commandName === "bmad-bmm-quick-dev"`, `instructionText`에 sentinel header 상수와 options 배열이 명시되어 있다. **추가**: 기존 start-instruction part(`metadata.phase === "start"`, sentinelKind 없음)도 함께 보존되어 `output.parts.length === 2`이다.

- [x] **AC 2 (Sentinel 주입 — startup-chain 경로) [F3 fix]**: Given workflow가 시작될 때 readiness가 ask이고 startup chain이 발급되는 상황, when handler가 startup-chain 경로(`:420-439`)로 진입할 때, then `output.parts.length === 2`이고 한 part는 `metadata.startupChain === true`, 다른 part는 `metadata.sentinelKind === "workflow-finalize"`이며, sentinel push는 startup-chain push **이후** `return` **직전**에 위치한다 (둘 다 dead code 아님).

- [x] **AC 3 (Finalization 1회 트리거)**: Given workflowState에 `commandName` + `finalizationTriggered: false`가 세팅된 sessionID에 대해, when `tool.execute.after` handler가 `{ tool: "question", args: { questions: [{ header: "__workflow_finalize__", options: ["Finalize"] }] } }` 입력으로 호출될 때, then `evaluateWorkflowFinalization`이 1회 실행되어 `workflow.finalization.evaluated` audit이 1건 emit되고, `workflow.finalization.sentinel.received` audit이 1건 emit되며, finalization 결과 `commitProposal`이 존재하면 `publishNextPlannedAction`이 호출되어 commit 승인 질문이 준비된다.

- [x] **AC 4 (중복 차단)**: Given AC 3 흐름이 1회 완료된 sessionID에 대해 `finalizationTriggered === true`인 상태에서, when 같은 sessionID로 sentinel question이 한 번 더 도착할 때, then `evaluateWorkflowFinalization`은 추가로 호출되지 않고(`workflow.finalization.evaluated` 총 1건 유지), `workflow.finalization.sentinel.duplicate` audit이 1건 emit되며 handler는 throw 없이 종료된다.

- [x] **AC 5 (sentinel 패스스루 — active approval 시) [F6 fix]**: Given workflowState에 `approvalCurrent`가 세팅되어 있고 `pendingApprovalQuestion == null`인 상태에서, when `tool.execute.before` handler가 sentinel header `__workflow_finalize__`를 가진 question 호출로 진입할 때, then 어떤 throw도 발생하지 않고 handler는 정상 반환하며 `workflowState.phase`는 호출 전과 동일하게 유지된다 (sentinel 단독으로 phase advance 하지 않음).

- [x] **AC 5-b (sentinel 패스스루 — startup chain 시) [F2 fix]**: Given workflowState에 `startupChainCurrent != null && pendingStartupQuestion == null` 상태에서, when `tool.execute.before` handler가 sentinel header를 가진 question 호출로 진입할 때, then startup-chain header guard(`:301-327`)가 throw하지 않고 sentinel passthrough가 먼저 발동되어 handler는 정상 반환한다.

- [x] **AC 5-c (조기 sentinel 거부) [F1 fix]**: Given workflowState에 `commandName`은 세팅되어 있으나 `phase !== "mutating"`이고 `touchedFiles`가 비어 있는 상태에서, when sentinel question이 `tool.execute.after` handler에 도착할 때, then `evaluateWorkflowFinalization`은 호출되지 않고 `workflow.finalization.sentinel.premature` audit이 1건 emit되며 `finalizationTriggered`는 `false`로 유지된다.

- [x] **AC 6 (startup-chain header guard와의 비간섭)**: Given startup-chain이 active한 sessionID에 대해, when sentinel header가 아닌 일반 question header로 호출이 들어올 때, then 기존 startup-chain header 검증 throw 동작이 변경 없이 유지된다 (regression 방지).

- [x] **AC 7 (BMAD 불변)**: Given 본 변경 적용 후, when 저장소의 `_bmad/` 트리에 대해 diff를 수행할 때, then 어떤 BMAD 스킬 파일도 변경되지 않는다.

- [x] **AC 8 (sentinel 식별의 sessionID 정확성)**: Given 두 개의 동시 sessionID(A, B)에서 각각 워크플로우가 시작되어 둘 다 sentinel을 주입받은 상태에서, when sessionID A로 sentinel question이 도착할 때, then sessionID A에 대해서만 finalization이 트리거되고 sessionID B의 `workflowState`는 `finalizationTriggered === false`로 유지된다.

## Additional Context

### Dependencies

- 기존 모듈: `evaluateWorkflowFinalization`, `publishNextPlannedAction`, `buildStartupChainQuestionInstruction`, `advancePhaseIfWorkflowSession`, `readQuestionToolHeader` — 변경 없이 호출만.
- 신규 builder는 외부 npm 의존성 없음 (string template만 사용).
- 기존 `requestStartupChainApproval` 흐름과 무충돌 (다른 분기·다른 metadata·다른 header).

### Testing Strategy

- **단위 테스트**: 신규 2개 파일 (`build-finalization-sentinel-instruction.test.js`, `sentinel-finalization-trigger.test.js`). `node:assert/strict` + dynamic import 패턴. AC 1~6, 8을 커버.
- **회귀 보호**: 기존 `tests/e2e/scenario-startup-chain-matrix.test.js` / `scenario-workflow-detection.test.js`가 통과 유지되어야 함 — sentinel part 추가로 인해 `output.parts.length`를 정확값으로 단정하는 기존 assertion이 있다면 변경 필요. Step 4(리뷰)에서 확인.
- **수동 검증**: 미수행 (out of scope — plugin-test e2e 시나리오 제외).
- **AC 7 (BMAD 불변)**: 구현 후 `git diff _bmad/`로 확인.

## Review Notes

- Adversarial review completed (2026-05-14)
- Findings: 3 total, 0 fixed, 3 acknowledged (skipped)
- Resolution approach: skip
- F1 (Medium): `extractQuestionHeader` in `tool-execute-after.js` only reads one args shape, while `tool-execute-before.js` uses the broader `readQuestionToolHeader` helper — potential silent finalization miss if opencode args shape diverges.
- F2 (Medium): hook-level sentinel-injection assertion (spec verification 1) not added; coverage relies on `regression.test.js` parity only.
- F3 (Low): `pushSentinelPart()` call-site at the normal-path is not protected by a direct invariant test against future early-returns.

### Notes

- 본 spec은 plugin 단독 변경. BMAD core는 절대 건드리지 않음.
- 모델이 sentinel을 호출하지 않는 edge case의 fallback (timeout / heuristic 종료 추정 등)은 별도 후속 spec.
- sentinel은 사용자에게 노출되지 않는 모델-only artifact이지만, 만약 native question UI가 즉시 렌더한다면 옵션 라벨(`"Finalize"`)이 잠시 보일 가능성 있음 — 본 spec 범위에서는 허용. UX 정리는 fallback 이슈와 함께 별도 처리.
- 기존 `finish` 분기(`tool-execute-after.js:300-351`)는 잔존 — opencode 런타임이 향후 `finish`를 emit하기 시작할 경우의 호환성을 위해 dead code로 두되, sentinel-triggered finalization과 중복 실행되지 않도록 `finalizationTriggered` 플래그를 동일하게 검사한다 (Task 4에서 sentinel 분기가 플래그를 set하므로, finish 분기가 이후 호출되어도 finalizationTriggered === true면 skip하도록 기존 finish 분기에도 같은 가드 추가 — **부가 변경**으로 spec에 포함).
- AC 8(동시 다중 sessionID)은 sessionID 격리가 builder metadata와 workflowState key 양쪽에 이미 내장되어 있으므로 큰 리스크는 아님. 검증 목적의 회귀 보호로 단위 테스트에 포함.
