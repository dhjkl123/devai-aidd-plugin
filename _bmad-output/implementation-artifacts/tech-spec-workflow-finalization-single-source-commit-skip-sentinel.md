---
title: 'Workflow finalization: single source + commit/skip sentinel'
slug: 'workflow-finalization-single-source-commit-skip-sentinel'
created: '2026-05-14'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack: ['Node.js ESM (Node 22)', 'opencode plugin runtime']
files_to_modify:
  - src/hooks/file-edited.js (delete)
  - src/index.js (L29 import, L447 handler entry)
  - src/services/workflow/evaluate-workflow-finalization.js
  - src/services/workflow/finalization-artifacts.js
  - src/hooks/tool-execute-after.js
  - src/services/approval/build-finalization-sentinel-instruction.js
  - src/hooks/tool-execute-after.js (commit bypass via executeApprovedAction)
  - tests/unit/build-finalization-sentinel-instruction.test.js
  - tests/unit/sentinel-finalization-trigger.test.js
  - tests/e2e/scenario-file-edited-tracking.test.js (delete)
code_patterns:
  - 'Named hooks registered in src/index.js DevaiAiddGuardPlugin return object'
  - 'workflowState.set(sessionID, { ...prev, ...patch }) for state transitions'
  - 'audit.info(eventName, payload) wrapped in try/catch — best-effort'
  - 'opencode question output.metadata.answers shape: [[label], ...] positional'
  - 'commit execution path: executeApprovedAction({ workflowState, sessionID, approvalRequest, resolution, pluginContext, audit })'
test_patterns:
  - 'node:test + assert/strict'
  - 'pathToFileURL + dynamic import() for ESM modules from project root'
  - 'createStubStore() in-memory workflowState mock'
---

# Tech-Spec: Workflow finalization — single source + commit/skip sentinel

**Created:** 2026-05-14

## Overview

### Problem Statement

devai-aidd-plugin의 워크플로우 finalization은 변경 파일 출처를 두 채널(`file-edited` 훅의 `workflowState.touchedFiles`와 `evaluateWorkflowFinalization`의 `listChangedFiles()` fallback)에 의존하지만, 운영에서 두 채널 모두 실패한다:

- opencode 런타임이 `file.edited` 이벤트에 `sessionID`를 넣지 않은 채 발행 → `src/hooks/file-edited.js:14` early-return으로 `touchedFiles`가 비어 있음.
- `extractChangedFiles`의 `listChangedFiles` fallback은 `!isSingletonArtifactPolicy && fallbackFiles.length === 0` 조건이지만 audit에 호출 흔적이 없고 `matchedFiles: []` + `ignoredFiles: []`로 동시 빈 배열만 남음 — 실제 호출이 안 되었거나 결과 누락.

결과: sentinel finalization은 정확한 시점에 트리거되지만 `hasFinalizableOutputs: false`로 commit 승인 prompt가 사용자에게 표시되지 않는다.

추가로, 현재 sentinel question은 단일 옵션 `["Finalize"]` 모델-only artifact이고, commit 승인은 별도의 두 번째 question으로 띄워진다. 사용자 입장에서는 "워크플로우 끝났다 + commit 할까?"를 한 번에 묻는 것이 자연스러우며 현재 흐름은 동일 의도에 대한 중복 prompt 문제를 일으킨다.

### Solution

**(A) 단일 git status 소스 전환:** `file-edited` 훅을 제거하고 `evaluateWorkflowFinalization`이 모든 경로에서 항상 `pluginContext.listChangedFiles()`를 호출해 변경 파일 목록을 확보한다. baseline commit이 워크플로우 시작 시 clean 상태를 보장하므로 git status 결과 ≈ 워크플로우 산출물이다. sentinel premature 가드는 `state.phase === "mutating"` 단일 신호로 축소한다. classifier에 root-level 코드 파일(`.html`, `.js`, `.ts`, `.tsx`, `.jsx`, `.mjs`, `.cjs`, `.css`, `.json`)을 "code"로 인식하는 분기를 추가해 일반 웹 프로젝트에서도 commit 대상으로 인식되게 한다.

**(B) Commit/Skip sentinel 통합:** sentinel question을 `["Commit", "Skip"]` 두 옵션으로 변경하고, `tool-execute-after.js`에서 첫 답변을 소문자 토큰 매칭("commit"/"skip")으로 분기한다. "Commit"이면 `evaluateWorkflowFinalization` 후 commit 승인 prompt를 우회하고 곧장 자동 실행한다(중복 prompt 방지). "Skip"이면 finalization 평가를 호출하지 않고 `workflow.finalization.sentinel.skipped` audit 1건 emit + `finalizationTriggered=true` 설정으로 재호출 방지.

### Scope

**In Scope:**

Part A — file-edited 제거 및 단일 소스 전환
1. `src/hooks/file-edited.js` 모듈 삭제
2. `src/index.js`에서 `createFileEditedHook` import 및 `"file.edited"` named handler 등록 제거
3. `evaluate-workflow-finalization.js`의 `extractChangedFiles()`를 단순화: 모든 경로에서 항상 `listChangedFiles()` 호출 후 input/output `changedFiles`와 merge (singleton policy 분기 제거)
4. sentinel premature 가드를 `state.phase === "mutating"` 단일 조건으로 축소
5. `mergeTrackedFiles(finishedState.touchedFiles, ...)` 호출부는 touchedFiles 누적 경로가 사라졌으므로 사실상 git status 결과만 입력 — 코드는 그대로 두되 touchedFiles 인자는 빈 배열로 안전하게 처리
6. `classifyTrackedFileKind`에 root-level 코드 파일 확장자 분기 추가
7. `tests/e2e/scenario-file-edited-tracking.test.js` 삭제
8. `tests/unit/sentinel-finalization-trigger.test.js` Verify 5(premature) 갱신: hasTouchedFiles 의존 제거

Part B — sentinel question에 commit/skip 선택지 통합
1. `build-finalization-sentinel-instruction.js`:
   - `FINALIZATION_SENTINEL_OPTIONS = ["Commit", "Skip"]`
   - `FINALIZATION_SENTINEL_HEADER`는 그대로 유지(detection 안정성)
   - `instructionText`를 두 옵션 의미에 맞게 갱신 (Commit=plugin이 자동 commit, Skip=commit 건너뛰고 워크플로우 종료, sentinel 호출 후 모델은 더 이상 도구 호출 금지)
2. `tool-execute-after.js` sentinel 분기에 응답 파싱 추가:
   - 기존 `extractQuestionAnswers(output)` 재사용
   - 첫 답변을 trim + lowercase로 토큰 매칭: "commit"이면 진행, "skip"이면 audit emit 후 종료
   - 두 경로 모두 `finalizationTriggered=true` 설정
3. Commit 선택 시 commit 승인 prompt 우회:
   - `publishNextPlannedAction` 또는 그 호출 경로에 "sentinel pre-approved commit" 플래그를 전달, commit 단계의 approval question을 skip하고 곧장 execute
4. `tests/unit/build-finalization-sentinel-instruction.test.js`, `tests/unit/sentinel-finalization-trigger.test.js` 갱신

**Out of Scope:**

- BMAD `_bmad/` 트리 변경
- opencode 런타임 수정 (sessionID 전파 문제는 우회만)
- 신규 워크플로우 추가
- commit proposal staging 전략 변경 (이미 동작)
- push 단계 일체 (원격 repo는 별도 기획 단계 — sentinel "Commit" 분기는 commit 실행 후 종료, push 위임 없음)
- `workflow-state.js`의 `touchedFiles` 필드 정의 제거 (다른 코드 참조 가능성 — 단 file-edited는 더 이상 쓰지 않음)

## Context for Development

### Codebase Patterns

- **Hook 등록:** `src/index.js`가 plugin bootstrap 시점에 `createFileEditedHook` 등을 named handler로 opencode runtime에 등록. handler 제거는 import + 등록 두 곳 모두 손봐야 한다.
- **Question 응답 추출:** `tool-execute-after.js`의 `extractQuestionAnswers(output)`가 opencode `question` 도구의 `output.metadata.answers` (배열의 배열) 구조를 파싱한다. 단일 선택은 `[[label]]` 형태로 들어옴 — `answers[0]?.[0]`을 trim + lowercase로 토큰 매칭.
- **Audit emit 패턴:** `audit.info(eventName, { event, timestamp, workflow, command, sessionID, outcome, details })` 호출, `try/catch`로 감싸 best-effort. 신규 이벤트(`workflow.finalization.sentinel.skipped`)도 동일 형태.
- **Workflow state 전이:** `workflowState.set(sessionID, { ...prev, ...patch })` 패턴. phase는 `advancePhase`로만 전이.
- **Commit 승인 우회:** 기존 commit 승인은 `publishNextPlannedAction` → `selectNextPlannedAction` → 승인 question emit 흐름. sentinel pre-approved 플래그는 `workflowState`에 저장하거나 `workflowContext`로 전달해 commit 단계가 question을 건너뛰고 곧장 execute하게 한다 (구체 구현은 `publish-next-planned-action.js` 진입점에서 결정).

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/hooks/file-edited.js` | 제거 대상 — 현재 sessionID 없는 이벤트로 인해 동작 안 함 |
| `src/index.js` | hook import + `"file.edited"` named handler 등록 두 곳 제거 (대략 L24-29, L444-447) |
| `src/services/workflow/evaluate-workflow-finalization.js` | `extractChangedFiles()` L8-47 단순화, `mergeTrackedFiles` L80-87 입력부 처리 |
| `src/services/workflow/finalization-artifacts.js` | `classifyTrackedFileKind` L48-69에 root-level 코드 확장자 분기 추가, `splitFinalizableFiles` L108-132 그대로 |
| `src/hooks/tool-execute-after.js` | sentinel 분기 L297-417: premature 가드 축소, 응답 파싱 + commit/skip 분기 추가 |
| `src/services/approval/build-finalization-sentinel-instruction.js` | `FINALIZATION_SENTINEL_OPTIONS` 변경, `instructionText` 두 옵션 의미로 갱신 |
| `src/services/approval/publish-next-planned-action.js` | sentinel pre-approved 시 commit 단계 question 우회 진입점 |
| `tests/unit/build-finalization-sentinel-instruction.test.js` | options 배열 + instructionText 검증 갱신 |
| `tests/unit/sentinel-finalization-trigger.test.js` | Verify 2/3/5에 Commit/Skip 분기 검증 추가 |
| `tests/e2e/scenario-file-edited-tracking.test.js` | 삭제 |

### Technical Decisions

1. **단일 소스 = git status (`listChangedFiles`):** baseline commit이 워크플로우 시작 시 clean 상태를 보장하므로 untracked + modified가 곧 워크플로우 산출물이다. singleton artifact policy 분기는 제거 — `artifactScopeMatches`가 별도로 scope를 강제하므로 무관 파일이 들어와도 ignored로 분류된다.
2. **Premature guard = phase 단일 신호:** mutating 도구가 한 번도 호출되지 않은 워크플로우는 산출물이 없다 — `state.phase === "mutating"` 한 가지로 충분. `hasTouchedFiles` OR 분기 제거.
3. **Sentinel options = `["Commit", "Skip"]` + 토큰 매칭:** 첫 답변 문자열을 `String(answer).trim().toLowerCase()` 후 `"commit"` / `"skip"`과 정확 비교. 라벨 표기 변경에 강하고 가독성도 유지.
4. **Commit 선택 시 중복 prompt 우회:** sentinel "Commit" 응답은 commit 의사에 대한 사용자 승인이다 — `publishNextPlannedAction` 호출 시 `workflowContext` 또는 `workflowState`에 `sentinelPreApprovedCommit: true` 플래그를 전달해 commit 단계가 approval question을 skip하고 곧장 commit을 execute하게 한다. push 단계는 여전히 별도 승인.
5. **Skip 응답 처리:** `evaluateWorkflowFinalization` 호출 없이 종료. `workflow.finalization.sentinel.skipped` audit 1건 emit. `finalizationTriggered=true`를 설정해 재호출(예: `finish` 도구 후속 호출)도 차단.
6. **listChangedFiles 실패 안전성:** try/catch로 빈 배열 반환 — finalization은 `hasFinalizableOutputs: false`로 자연 종료, throw 금지(기존 동작 유지).
7. **트레이드오프 — 동시 다중 워크플로우 격리 약화:** 한 세션이 다른 세션의 dirty 파일을 commit 대상에 포함시킬 수 있다. 현 plugin 사용 패턴(단일 활성 워크플로우)에서는 실질적 영향이 없으나 향후 다중 워크플로우 동시 실행을 도입하면 session-scoped tracking을 재도입해야 한다.
8. **sentinel header 상수 불변:** `FINALIZATION_SENTINEL_HEADER = "__workflow_finalize__"`는 plugin 내부 매칭 식별자이므로 변경 금지. 사용자에게 보이는 question text/label만 새 의미에 맞게 갱신.
9. **Commit 우회 메커니즘 — executeApprovedAction 직접 호출:** `publishNextPlannedAction`은 항상 `pluginContext.requestApproval`을 호출해 사용자 prompt를 띄운다(approval 우회 옵션 없음). 따라서 sentinel "Commit" 분기에서는 `publishNextPlannedAction`을 호출하지 않고, 대신:
   (a) `evaluateWorkflowFinalization`으로 `commitProposal` 생성,
   (b) `buildApprovalRequest`로 `approvalRequest` 합성,
   (c) `audit.info("approval.requested", { ... outcome: "ask", details: { sentinelPreApproved: true } })` 한 건 emit (감사 추적 보존),
   (d) `executeApprovedAction({ workflowState, sessionID, approvalRequest, resolution: { resolvedAt: now, decision: "sentinel-pre-approved" }, pluginContext, audit })` 직접 호출로 commit 실행.
   이 방식은 `publishNextPlannedAction`의 시그니처 변경을 피한다. **Push 위임은 본 spec out-of-scope** — 원격 repo 기획 단계에서 별도 처리.

10. **`pluginContext.listChangedFiles()` 반환 계약 (F3 보완):** `src/index.js:194-204` 구현 + `src/services/workflow/parse-status-porcelain.js`의 `parseStatusPorcelainPaths` 출력으로 확정:
    - **반환 타입:** `string[]` — repo-relative 경로 문자열의 배열.
    - **경로 형식:** posix-style separator(`/`), `git status --short --untracked-files=all` payload를 C-quote 디코딩한 결과. 절대 경로 아님, trim되지 않음.
    - **Rename 처리:** `R old -> new` 라인은 두 경로(old, new)로 expand되어 둘 다 배열에 포함됨.
    - **실패 시:** try/catch로 `[]` 반환 (예: git 미초기화, 명령 실패).
    - **`normalizeTrackedFileEntry` 호환성:** 이 함수는 `string | { path, kind }` 양쪽을 다루며, string 입력 시 `classifyTrackedFileKind`로 kind 자동 분류. listChangedFiles 결과는 추가 wrapping 없이 `.map(normalizeTrackedFileEntry).filter(Boolean)`로 안전하게 정규화된다 (`evaluate-workflow-finalization.js:84-86` 기존 패턴 그대로).

## Implementation Plan

### Tasks

순서는 의존성을 따른다: classifier 보강(독립) → evaluator 단순화(classifier 결과 사용) → file-edited 제거(state 의존 없어진 뒤) → sentinel options/instruction(데이터) → tool-execute-after 사용자 응답 처리 + commit 우회(앞의 모두 사용) → 테스트 정리.

- [x] **Task 1: classifier에 root-level 코드 파일 분기 추가**
  - File: `src/services/workflow/finalization-artifacts.js`
  - Action: `classifyTrackedFileKind`에 새 분기 추가 — `normalizedPath`가 `/`를 포함하지 않고(즉 root-level) 확장자가 `.html`, `.htm`, `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.jsx`, `.css`, `.scss`, `.json` 중 하나면 `"code"` 반환. README.md/CHANGELOG.md/`docs/`/`_bmad-output/...` 분기보다 **위**에 위치(우선순위).
  - Notes: `CODE_PREFIXES` 매칭은 기존대로 유지 — 새 분기는 root-level일 때만 적용(`!normalizedPath.includes("/")`).

- [x] **Task 2: evaluateWorkflowFinalization extractChangedFiles 단순화**
  - File: `src/services/workflow/evaluate-workflow-finalization.js`
  - Action:
    1. `extractChangedFiles(input, output, pluginContext, workflowPolicy)` 시그니처에서 `workflowPolicy` 인자 제거(사용처 없음).
    2. `isSingletonArtifactPolicy` 분기 및 `fallbackFiles.length === 0` 가드 삭제.
    3. `output.changedFiles`, `input.changedFiles`, `input.args.changedFiles`를 먼저 push한 뒤, **항상** `pluginContext?.listChangedFiles` 가 함수면 호출해서 결과를 push (try/catch는 유지).
    4. 호출부(`mergeTrackedFiles(... extractChangedFiles(...))`)에서 `workflowPolicy` 인자 제거.
  - Notes: `finishedState.touchedFiles`는 빈 배열로 들어올 가능성이 높아졌으나 `mergeTrackedFiles`는 안전. workflowState의 `touchedFiles` 필드 정의는 그대로 유지.

- [x] **Task 3: file-edited 훅 파일 삭제 및 등록 해제**
  - File 1: `src/hooks/file-edited.js`
  - Action 1: 파일 전체 삭제.
  - File 2: `src/index.js`
  - Action 2: L29의 `import { createFileEditedHook } from "./hooks/file-edited.js";` 제거. L447의 `"file.edited": createFileEditedHook({ workflowState, pluginContext }),` 라인 제거 (반환 객체에서 키 자체 삭제 — undefined 키 남기지 말 것).
  - Notes: opencode 런타임은 미등록 이벤트를 그냥 무시함. 별도 마이그레이션 불필요.

- [x] **Task 4: sentinel options 및 instructionText 갱신**
  - File: `src/services/approval/build-finalization-sentinel-instruction.js`
  - Action:
    1. `FINALIZATION_SENTINEL_OPTIONS`를 `["Commit", "Skip"]`로 변경.
    2. `FINALIZATION_SENTINEL_HEADER`는 `"__workflow_finalize__"` 그대로 유지.
    3. `instructionText` 본문을 두 옵션 의미에 맞게 재작성:
       - 사용자에게 보이는 질문 의도: "Workflow {workflowLabel} has produced its outputs. Choose **Commit** to let the plugin commit the changes, or **Skip** to end the workflow without committing."
       - "HOW to call" 섹션은 그대로 — `question` 도구 1회 호출 + 이후 모델은 어떤 도구도 추가 호출 금지(이는 Commit/Skip 양쪽 모두 동일).
       - "DO NOT call the sentinel" 섹션의 premature 규칙은 유지.
    4. `optionsPreview`/`argsPreview`는 그대로 `JSON.stringify`로 옵션을 노출(테스트에서 정확한 라벨 확인 가능).
  - Notes: 반환 객체의 `metadata.sentinelKind: "workflow-finalize"`는 유지.

- [x] **Task 5: tool-execute-after sentinel 분기 — premature 가드 축소 + 응답 파싱**
  - File: `src/hooks/tool-execute-after.js`
  - Action:
    1. sentinel 분기(`extractQuestionHeader(input) === FINALIZATION_SENTINEL_HEADER` 블록) 안에서 `hasTouchedFiles` 계산 삭제, premature 가드를 `if (state.phase !== "mutating") { audit('.premature') + return }` 로 축소(`hasMutated` 변수도 인라인화).
    2. `extractQuestionAnswers(output)`로 응답 추출. 첫 슬롯(`answers?.[0]`)을 `String(value ?? "").trim().toLowerCase()`로 정규화해 `decision`을 결정:
       - `"commit"` → commit 분기로 진행
       - `"skip"` → skip 분기
       - 그 외(빈 문자열, null, unknown) → skip 분기와 동일하게 처리하되 audit `details.reason: "unrecognized-answer"` 부가하여 emit. finalization은 평가하지 않음.
    3. `finalizationTriggered=true` 설정은 양쪽 분기 모두에서 1회 실행(현재 위치 유지).
    4. duplicate 가드(`finalizationTriggered === true` 체크)는 premature 가드 **뒤**, 응답 분기 **앞**에서 그대로 작동(현 위치 유지).

- [x] **Task 6: Skip 응답 분기 처리**
  - File: `src/hooks/tool-execute-after.js`
  - Action: `decision === "skip"` (혹은 unrecognized)일 때:
    1. `workflowState.set(sessionID, { ...state, finalizationTriggered: true })` 설정.
    2. `audit.info("workflow.finalization.sentinel.skipped", { event, timestamp, workflow, command, sessionID, outcome: "skip", details: { phase: state.phase ?? null, reason: "user-skipped" | "unrecognized-answer" } })` 1건 emit (try/catch best-effort).
    3. early `return` — `evaluateWorkflowFinalization`/`publishNextPlannedAction` 호출 금지.
  - Notes: `finish` 도구 후속 호출 시 `tool-execute-after.js`의 finish 분기 L420-428에서 `finalizationTriggered === true`로 또 차단되므로 재호출 방지가 이중으로 보장됨.

- [x] **Task 7: Commit 응답 분기 — finalization 평가 + commit 직접 실행 + push 위임**
  - File: `src/hooks/tool-execute-after.js`
  - Action: `decision === "commit"`일 때 (현재 sentinel 분기 본체 흐름을 다음과 같이 재구성):
    1. `await audit.info("workflow.finalization.sentinel.received", { ... outcome: "trigger", details: { decision: "commit" } })` (기존 received audit에 details 부가).
    2. `const assessment = await evaluateWorkflowFinalization({ workflowState, sessionID, input, output, audit, pluginContext })`.
    3. `const finishedState = workflowState.get(sessionID)`. `finishedState.commitProposal`이 null이면 publish 우회 — commit할 게 없으면 push도 무의미 → 그대로 `return`.
    4. commit proposal이 있으면:
       a) `import { buildApprovalRequest } from "../services/approval/build-approval-request.js"` (상단에 추가).
       b) `import { executeApprovedAction } from "../services/git/execute-approved-action.js"` (상단에 추가).
       c) `workflowContext = { commandName, arguments: arguments||"", sessionID, detectedAt, phase: "finish" }` 구성.
       d) `resolvedPolicy = pluginContext?.resolvePolicy?.(workflowContext)`; `workflowPolicy = resolvedPolicy?.outcome === "allow" ? resolvedPolicy.details?.policy || null : null`.
       e) `approvalRequest = buildApprovalRequest({ sessionID, workflow: commandName, command: commandName, phase: "finish", actionType: "commit", proposal: finishedState.commitProposal, workflowContext, workflowPolicy, readiness: finishedState.readiness ?? null })`.
       f) `try { await audit.info("approval.requested", { event: "approval.requested", timestamp: now, workflow, command, sessionID, outcome: "ask", details: { actionKind: "commit", actionType: "commit", phase: "finish", requestId: approvalRequest.id, actionId: approvalRequest.actionId, sentinelPreApproved: true, finalizationMode: workflowPolicy?.finalization ?? null } }) } catch {}`.
       g) `workflowState.set(sessionID, { ...workflowState.get(sessionID), approvalCurrent: approvalRequest, approvalHistory: [...(prev.approvalHistory ?? []), approvalRequest] })`.
       h) `const executionResult = await executeApprovedAction({ workflowState, sessionID, approvalRequest, resolution: { resolvedAt: new Date().toISOString(), decision: "sentinel-pre-approved" }, pluginContext, audit })`.
    5. `return`. **Push 위임 없음** — 원격 repo 기획 단계가 본 spec 범위 밖이므로 commit 실행 후 그대로 종료.
  - Notes: `publishNextPlannedAction`을 sentinel 분기에서 호출하지 않는 것이 핵심. push 단계가 필요한 워크플로우는 향후 별도 spec에서 다룬다.

- [x] **Task 8: tests/e2e/scenario-file-edited-tracking.test.js 삭제**
  - File: `tests/e2e/scenario-file-edited-tracking.test.js`
  - Action: 파일 삭제.
  - Notes: 다른 e2e 파일이 이 파일을 require/import하는지 검색해 의존성 없음 확인.

- [x] **Task 9: tests/unit/build-finalization-sentinel-instruction.test.js 갱신**
  - File: `tests/unit/build-finalization-sentinel-instruction.test.js`
  - Action:
    1. `FINALIZATION_SENTINEL_OPTIONS` deep-equal 검증을 `["Commit", "Skip"]`로 변경.
    2. `instructionText`가 "Commit"과 "Skip" 두 라벨, 그리고 "do NOT call any other tool"을 포함하는지 검증.
    3. 기존 `header === "__workflow_finalize__"`, `metadata.sentinelKind === "workflow-finalize"` 검증은 유지.
    4. `argsPreview`(예시 JSON)가 두 옵션을 모두 포함하는지 한 줄 검증 추가.

- [x] **Task 10: tests/unit/sentinel-finalization-trigger.test.js 갱신**
  - File: `tests/unit/sentinel-finalization-trigger.test.js`
  - Action:
    1. Verify 2 갱신: sentinel 응답이 `metadata.answers = [["Commit"]]`일 때 — `workflow.finalization.sentinel.received` 1건 emit + `executeApprovedAction` mock이 1회 호출됨을 검증. `publishNextPlannedAction` 형태의 사용자 commit prompt가 발생하지 않음(또는 commit이 단일 경로로만 실행됨)을 검증.
    2. 새 Verify 2-b 추가: 응답이 `[["Skip"]]`일 때 — `workflow.finalization.sentinel.skipped` 1건 emit + `evaluateWorkflowFinalization`/`executeApprovedAction` mock이 호출되지 않음 검증. `finalizationTriggered === true`로 설정됨 검증.
    3. 새 Verify 2-c 추가: 응답이 unknown(`[["something"]]`)이면 skip 분기와 동일하게 `.skipped` audit emit, finalization 미호출.
    4. Verify 3(duplicate) 갱신: 첫 호출이 "Commit"으로 finalizationTriggered=true 설정한 후 두 번째 호출에서 `.duplicate` audit + commit/skip mock 추가 호출 없음.
    5. Verify 5(premature) 갱신: state.phase가 `"mutating"`이 아닐 때(예: `"in-progress"`) `.premature` audit emit + finalization 미호출. `touchedFiles` 필드는 더 이상 가드에 영향 없음을 명시.
  - Notes: `executeApprovedAction`은 module-level export이므로 dynamic import 후 spy로 감싸야 함 — 기존 `pathToFileURL` 패턴 유지. 가능하면 `pluginContext.gitActionRunner`를 mock하여 실제 git 호출 없이 `executeApprovedAction`이 envelope를 반환하도록.

- [x] **Task 11: 회귀 — 기존 unit 테스트 통과 확인**
  - File: 전체 `tests/unit/**`
  - Action: `node --test tests/unit/` 실행해 다른 unit 회귀가 깨지지 않는지 확인(특히 `evaluate-workflow-finalization` 단위 테스트가 있다면 singleton 분기 제거 영향 검토).
  - Notes: 깨진 회귀가 있으면 spec 범위 안에서 수정.

### Acceptance Criteria

- [ ] **AC 1 (Part A — file-edited 제거):** Given a fresh plugin bootstrap, when `DevaiAiddGuardPlugin` returns its hook map, then the returned object MUST NOT contain a `"file.edited"` key and `src/hooks/file-edited.js` MUST NOT exist in the source tree.

- [ ] **AC 2 (Part A — 단일 소스 호출):** Given a sentinel "Commit" path running with `state.phase === "mutating"` and `touchedFiles` empty, when `evaluateWorkflowFinalization` runs, then `pluginContext.listChangedFiles` MUST be called at least once (no `fallbackFiles.length === 0` precondition) and the audit `workflow.finalization.evaluated` event MUST reflect the merged file list.

- [ ] **AC 3 (Part A — classifier 보강):** Given a tracked file `index.html` (root-level), when `classifyTrackedFileKind("index.html")` is invoked, then it MUST return `"code"`. Same MUST hold for `script.js`, `app.ts`, `app.tsx`, `style.css`, `package.json`. Given `docs/README.md`, when classified, then result MUST remain `"technical-doc"` (no regression).

- [ ] **AC 4 (Part A — premature 가드):** Given `state.phase = "in-progress"` (no mutating tool called) and a sentinel `question` after-hook fires, when handler runs, then audit `workflow.finalization.sentinel.premature` MUST emit exactly once AND `evaluateWorkflowFinalization` MUST NOT be called AND `executeApprovedAction` MUST NOT be called.

- [ ] **AC 5 (Part B — sentinel options/instructionText):** Given `buildFinalizationSentinelInstruction({})`, when invoked, then return value `options` MUST deep-equal `["Commit", "Skip"]`, `header` MUST equal `"__workflow_finalize__"`, and `instructionText` MUST contain the substrings "Commit" and "Skip" and "do NOT call any other tool".

- [ ] **AC 6 (Part B — Commit 분기):** Given `state.phase === "mutating"`, `finalizationTriggered !== true`, listChangedFiles returns `["index.html"]`, and the sentinel question output has `metadata.answers = [["Commit"]]`, when the sentinel after-hook runs, then `evaluateWorkflowFinalization` is called exactly once AND `executeApprovedAction` is called exactly once with `actionType === "commit"` and `resolution.decision === "sentinel-pre-approved"` AND no separate commit-approval prompt is delivered via `pluginContext.requestApproval`.

- [ ] **AC 7 (Part B — Skip 분기):** Given the same preconditions but answer `[["Skip"]]`, when the sentinel after-hook runs, then `evaluateWorkflowFinalization` MUST NOT be called AND `executeApprovedAction` MUST NOT be called AND audit `workflow.finalization.sentinel.skipped` MUST emit exactly once AND `workflowState.get(sessionID).finalizationTriggered === true`.

- [ ] **AC 8 (Part B — Unknown 응답):** Given answer `[["NotAValidChoice"]]` or `null`, when the sentinel after-hook runs, then handler behaves identically to AC 7's Skip branch, with audit `details.reason === "unrecognized-answer"`.

- [ ] **AC 9 (Part B — 중복 prompt 방지):** Given a commit-only workflow that produces one tracked file and the user picks "Commit" at the sentinel, when the after-hook completes, then `pluginContext.requestApproval` MUST NOT have been called for the commit action (only `audit.approval.requested` with `details.sentinelPreApproved: true` is emitted).

- [ ] **AC 10 (Part B — push 미진행):** Given the user picks "Commit" at the sentinel, when commit execution finishes, then `publishNextPlannedAction` MUST NOT be called from the sentinel branch (push 위임은 본 spec out-of-scope; 향후 원격 repo 기획 단계에서 처리).

- [ ] **AC 11 (회귀 — duplicate 가드):** Given a session that has already triggered finalization (`finalizationTriggered === true`), when a second sentinel `question` after-hook fires, then audit `workflow.finalization.sentinel.duplicate` MUST emit and neither `evaluateWorkflowFinalization` nor `executeApprovedAction` are called again.

- [ ] **AC 12 (회귀 — finish 도구 후 sentinel 차단):** Given `finalizationTriggered === true` from a prior sentinel, when the `finish` tool's after-hook runs, then `evaluateWorkflowFinalization` MUST NOT be invoked (existing branch at `tool-execute-after.js:420-428` preserved).

- [ ] **AC 13 (테스트):** Given the full unit suite (`node --test tests/unit/`), when run, then ALL tests pass including the new Verify 2-b/2-c cases and the updated Verify 2/3/5.

- [ ] **AC 14 (e2e 정리):** Given the source tree, `tests/e2e/scenario-file-edited-tracking.test.js` MUST NOT exist and no other test file MUST import from it.

- [ ] **AC 15 (BMAD 트리 불변):** Given the workspace, when the implementation completes, then `_bmad/` MUST NOT have been modified (only `_bmad-output/implementation-artifacts/tech-spec-*.md` is allowed).

## Additional Context

### Dependencies

- 외부 의존성 추가 없음. opencode plugin runtime + 기존 `pluginContext.listChangedFiles` (= `git status --porcelain --untracked-files=all`).

### Testing Strategy

- **Unit (필수):**
  - `tests/unit/build-finalization-sentinel-instruction.test.js`: options 배열, header 상수, instructionText 내용 검증 (AC 5).
  - `tests/unit/sentinel-finalization-trigger.test.js`: premature/duplicate/Commit/Skip/Unknown 5개 분기 검증 (AC 4, 6, 7, 8, 11).
  - 신규 또는 기존 `finalization-artifacts` 단위에 root-level 파일 분류 검증 추가 (AC 3).
- **Unit (회귀 검토):**
  - `evaluate-workflow-finalization` 단위 테스트가 있다면 singleton 분기 제거 후 동작 확인.
- **E2E:** 기존 `scenario-file-edited-tracking.test.js` 삭제 (AC 14). 단일 소스 회귀는 unit + `executeApprovedAction` mock으로 대체.
- **수동 검증:** `C:\Users\user\Desktop\plugin-test` 같은 일반 웹 프로젝트에서 실제 워크플로우를 실행해 (a) sentinel question에 [Commit, Skip] 두 옵션 노출, (b) Commit 선택 시 별도 prompt 없이 commit 실행, (c) Skip 선택 시 commit 없이 종료, (d) audit log에 새 이벤트들 기록되는지 확인.

### Notes

- 운영 로그 증거: `C:\Users\user\Desktop\plugin-test\.opencode\devai-aidd-debug.log` ("event.type=file.edited {\"sessionID\":null}" 다수), `audit.log` (`matchedFiles: []` + `ignoredFiles: []`).
- 본 spec은 단일 소스 전환의 격리 트레이드오프를 명시적으로 수용한다 (Technical Decision 7).
