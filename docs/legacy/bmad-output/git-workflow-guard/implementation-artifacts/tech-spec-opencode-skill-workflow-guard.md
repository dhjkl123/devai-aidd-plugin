---
title: 'opencode Skill 호출에 워크플로 가드 확장'
slug: 'opencode-skill-workflow-guard'
created: '2026-05-13'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Node.js 22 (ESM)
  - opencode plugin runtime (.opencode/plugins)
files_to_modify:
  - src/utils/constants.js
  - src/config/load-config.js
  - src/index.js
  - src/services/workflow/detect-workflow-context.js
  - src/services/workflow/workflow-state.js
  - src/hooks/tool-execute-before.js
  - src/hooks/native-event.js
code_patterns:
  - "best-effort try/catch around audit and side-channel I/O"
  - "Set-based name discovery from .opencode/<dir>/*"
  - "debug logger 게이트 (pluginContext.debug.log)"
  - "synthetic output.parts text injection"
test_patterns:
  - "in-process harness 호출 (loadWorkflowSkills, detectWorkflowContext)"
  - "tool.execute.before mock으로 input.tool 분기 검증"
---

# Tech-Spec: opencode Skill 호출에 워크플로 가드 확장

**Created:** 2026-05-13

## Overview

### Problem Statement

현재 플러그인은 `.opencode/commands/*.md` 슬래시 커맨드만 워크플로 가드 대상으로 인식한다. 그러나 사용자가 BMAD 워크플로를 Skill 형태(`.opencode/skills/<name>/SKILL.md`)로도 호출하기 시작했고, 특히 **모델이 자율적으로 Skill 도구를 호출**하는 케이스는 `command.executed` 이벤트를 발행하지 않아 readiness→branch/init→approval 파이프라인이 우회된다. 결과적으로 동일한 BMAD 작업(예: `/bmad-create-story`를 Skill로 호출)이 가드 없이 코드를 변경하는 회피 경로가 존재한다.

### Solution

`.opencode/skills/<name>/SKILL.md` 디렉터리 스캔으로 skill 이름을 디스커버하여 기존 `workflowCommands` Set과 **동일한 자료구조**(`workflowNames`)에 통합한다. 트리거 채널은 두 갈래로 받는다: (a) 사용자가 `/skill-name` 슬래시로 호출 → 기존 `command.executed` 경로 그대로 동작, (b) 모델이 Skill 도구로 호출 → `tool.execute.before`에서 `input.tool === "skill"` 분기로 동일한 `commandExecuteBeforeHandler`를 어댑트 호출. (b) 경로는 첫 릴리스에서 진단 로그를 켜둔 채로 배포하여 실제 opencode 런타임이 보내는 페이로드 모양을 확정한 뒤 정식 가드로 승격한다.

### Scope

**In Scope:**
- `.opencode/skills/<name>/SKILL.md` 기반 skill 이름 디스커버리
- 기존 `workflowCommands` → `workflowNames`로 의미 확장 (commands + skills 통합 Set)
- `tool.execute.before`에 skill-tool 분기 추가: `input.tool === "skill"`(또는 별칭) 감지 시 `commandExecuteBeforeHandler` 어댑트 호출
- 진단 로그: skill 호출이 어느 채널/어떤 키로 들어오는지 캡처 (`pluginContext.debug.log`)
- 슬래시 호출(`/skill-name`) 시 기존 `command.executed` 경로가 자연히 매칭되도록 디스커버리 통합
- 한 세션 안에서 같은 skill의 중복 트리거 방지 (commandExecuteBefore + tool 양쪽에서 동일 sessionID로 들어왔을 때)

**Out of Scope:**
- Skill 호출 시 안내 텍스트 채널 변경 — skill 경로에서는 `output.parts` 주입이 runtime에 닿지 않으므로(C1 참조) start-instruction 문구 자체가 모델에 전달되지 않음. 모델 가이드는 **Layer 0 throw 메시지의 인라인 `instructionText`**가 단일 채널이며, 이 채널은 commands와 동일한 빌더(`buildQuestionInstruction`)를 재사용하므로 문구 차별화 논의 자체가 의미 없음.
- jsonc `commandTypeMap` / `workflowPolicy`에 skill 전용 키 추가 — 사용자가 필요 시 같은 키스페이스에 추가 (이미 분기 없음, 이름만 일치하면 자동 적용)
- `tool.execute.after`/`file.edited`에는 변경 없음 (sessionID로 이미 추적되므로)

## Context for Development

### Codebase Patterns

- **Best-effort I/O**: `audit.info(...)` 호출과 외부 트리거는 모두 `try { await audit.info(...) } catch {}` 래핑. 부트스트랩과 훅 핸들러는 절대 throw 하지 않는다 (`src/index.js:97-111`).
- **Set-based discovery**: `loadWorkflowCommands(directory, fsAdapter)` (`src/config/load-config.js:374`) — `fsAdapter.readdirSync` → `.md` 필터 → 확장자 제거 → `Set`. 동일 패턴을 `loadWorkflowSkills`로 미러링.
- **Workflow detection**: `detectWorkflowContext(input, set, { detectedAt })` (`src/services/workflow/detect-workflow-context.js:35`) — `input.command`를 normalize한 뒤 Set 멤버십만 검사. 자료구조가 같으면 코드 변경 없이 통합.
- **Native event router**: `src/hooks/native-event.js`의 `handleCommandExecuted`는 native payload를 `{ command, arguments, sessionID }`로 어댑트해 `commandExecuteBeforeHandler`를 호출. Skill 경로도 같은 어댑트 함수를 재사용.
- **Tool guard**: `src/hooks/tool-execute-before.js`는 이미 `input.tool` 기반 분기(`"bash"`, `"question"`)를 갖고 있어 `"skill"` 분기 추가 위치가 명확.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| src/config/load-config.js | `loadWorkflowCommands` 미러로 `loadWorkflowSkills` 추가 위치 |
| src/index.js | 부트스트랩에서 두 Set을 합쳐 핸들러 팩토리에 주입 |
| src/services/workflow/detect-workflow-context.js | Set 멤버십 검사기 — 시그니처 변경 없음, 인자 Set만 더 큰 걸 전달 |
| src/hooks/native-event.js | `handleCommandExecuted` 어댑트 함수 재사용 (private export 필요) |
| src/hooks/tool-execute-before.js | `input.tool === "skill"` 분기 신규 추가 |
| src/utils/constants.js | `PROJECT_CONFIG_DIR` ("`.opencode`") 재사용 + 신규 상수 `SKILLS_SUBDIR = "skills"` |

### Technical Decisions

0. **검출 레이어 vs 정책 레이어의 직교성 (핵심 전제)**:
   가드 플로우는 두 개의 독립 레이어로 구성된다.
   - **검출 레이어**: `.opencode/commands/*.md` 또는 (본 spec 이후) `.opencode/skills/<name>/SKILL.md` 존재 여부. 이름이 Set에 있으면 `detectWorkflowContext`가 워크플로 컨텍스트를 생성하고 readiness 체크 진입.
   - **정책 레이어**: jsonc `workflowPolicy[<name>]`. 어떤 가드 단계를 켜고 끌지 결정.
     - `branchRequired === true`만 브랜치 질문 발동 (`branch-service.js:153`, `startup-chain-planner.js:47`). `false`/미설정이면 `evaluateBranchStrategy`가 `requirement: "unnecessary"` 반환 → 질문 없음.
     - `finalization === "commit-and-push"` 또는 `"commit-optional-push"`만 완료 commit/push 질문 발동 (`detect-finalizable-outputs.js:105-117`). `"no-forced-finalization"`/미설정이면 질문 없음.
     - `git init` / baseline commit 질문은 정책과 무관하게 **readiness 결과로만** 발동(repo 없음 / `hasCommit === false`).
   - `safeDefaultPolicy()` = `{ branchRequired: false, finalization: "no-forced-finalization" }`이며, 베이스라인 jsonc에는 `workflowPolicy` 블록이 없어 모든 이름이 디폴트로 fallback. → **기본 동작은 "init/baseline만 가드, 브랜치·완료 commit은 opt-in"**.
   - 본 spec은 검출 레이어만 확장한다. 정책 레이어 코드는 손대지 않는다. Skill에 브랜치/완료 가드를 적용하려는 사용자는 jsonc에 entry 추가만으로 켤 수 있다.

1. **단일 Set 통합 vs 분리 Set**: 단일 `workflowNames` Set으로 통합. 이유: `detectWorkflowContext`, `resolveWorkflowPolicy`, `branch.commandTypeMap` 등 모든 다운스트림이 "이름 → 정책" 모델이라 commands/skills 구분이 의미 없음. 통합하면 jsonc 사용자가 skill 이름을 그대로 `commandTypeMap`/`workflowPolicy`에 적어 동일 정책을 적용 가능. (위 0번 전제에 따라 정책 entry가 없어도 검출은 작동.)
2. **충돌 처리**: command와 skill에 동일한 이름이 있으면 같은 워크플로로 취급(중복 제거됨, Set 특성). 디버그 로그에 "name collision" 1줄 남김.

2-a. **jsonc 정책에서 channel 분리하지 않음**:
   `workflowPolicy[<name>]`은 채널(슬래시 command vs Skill 도구 호출) 구분 없이 동일하게 적용한다. 근거:
   - `branchRequired`/`finalization`은 워크플로의 본질에 묶임(채널 무관). 동일 이름이면 동일 의도라는 게 합리적 가정.
   - 분리 시 `WorkflowContext`에 `kind` 필드를 추가하고 `resolveWorkflowPolicy`, `branch-service`, `finalization`, audit 전반에 분기를 끌어들여야 함 → 본 spec의 "검출 레이어만 건드린다" 전제가 깨짐.
   - 미래에 채널별 차별화가 필요해지면 `workflowPolicy[name].channels: ["command", "skill"]` 옵션 필드를 후방 호환으로 추가하면 됨. 통합 → 분리는 쉽고, 분리 → 통합은 어렵다.
3. **Skill 도구 이름 후보**: opencode SDK가 `input.tool`에 어떤 값을 넣는지(`"skill"`, `"Skill"`, `"launch-skill"`, 등) 미확정. 1차 구현은 케이스 인센서티브 매칭 + 후보 토큰 집합(`SKILL_TOOL_TOKENS = new Set(["skill", "launch-skill", "invokeskill"])`)으로 시작, 진단 로그로 실제 토큰 확인 후 다음 패치에서 좁힌다.
4. **Skill 인자 추출**: `input.tool === "skill"`일 때 `toolArgs.skill` / `toolArgs.name` / `toolArgs.skillName` 중 첫 매칭을 commandName으로 어댑트. 미매칭 시 진단 로그만 남기고 가드 비활성(fail-open) — 정확한 키 확정 전에 정상 skill 호출을 막지 않기 위함.
5. **중복 트리거 방지**: `workflowState.get(sessionID)?.commandName === resolvedName` 이면 `commandExecuteBeforeHandler` 재호출 생략. 슬래시(`command.executed`)와 모델 호출(`tool.execute.before`)이 같은 세션에서 연달아 들어오는 케이스 차단.
6. **부트스트랩 안전성**: `loadWorkflowSkills`는 디렉터리 부재 시 빈 Set 반환(현 `loadWorkflowCommands`와 동일). `readdirSync` 실패는 try/catch로 흡수해 부트스트랩 진행.

7. **(C1) Instruction 전달 채널 — skill 경로**:
   `tool.execute.before`의 `output` 객체는 `{ args }` 형태이며 `parts` 필드를 지원하지 않는다. 따라서 skill-trigger가 `commandExecuteBeforeHandler`를 합성 `output = { parts: [] }`로 호출해도 그 안에 푸시된 start-instruction 텍스트는 runtime에 도달하지 않는다. **모델 가이드의 실제 전달 채널은 Layer 0가 다음 비-`question` 도구 호출에서 던지는 throw 메시지**(`tool-execute-before.js:149-163`)이며, 그 본문에 `buildQuestionInstruction(...).instructionText`가 인라인되어 있다. 즉 skill 경로는 다음 순서로 작동한다:
   1. skill 도구가 호출됨 → skill-trigger 분기 발동 → `commandExecuteBeforeHandler`가 readiness/init/branch proposal을 세팅하고 `approvalCurrent` 또는 `startupChainCurrent`를 채움.
   2. 현재 hook이 정상 반환 → runtime이 skill 도구 본 실행을 시도.
   3. 그 실행 시도가 다시 `tool.execute.before`를 트리거 → Layer 0가 `approvalCurrent`를 보고 throw → 모델은 throw 메시지의 instruction을 받아 `question` 도구를 호출.
   `output.parts` 합성은 의도적 no-op이며 native-event 경로(`command.executed`)와의 호출 시그니처 호환을 위해서만 유지한다.

8. **(C2) skill-trigger Layer 순서 — Layer 1 직전, Layer 0보다 반드시 먼저**:
   분기 코드는 `createToolExecuteBeforeHook` 본문 진입 직후, **Layer 1(bash+git block) 직전**에 배치한다. 이유: skill-trigger 분기가 `commandExecuteBeforeHandler`를 호출해 `approvalCurrent`를 세팅하지만 **본 호출 사이클의 같은 hook 안에서 Layer 0이 그 결과를 보는 일은 없다**(approval이 세팅되어도 Layer 0의 차단은 다음 도구 호출 사이클에서 발동). 그러나 진단 로그와 분기 일관성을 위해 가능한 가장 위쪽에 두는 게 안전. 만약 Layer 0보다 *뒤*에 두면 첫 호출 시 Layer 0이 `approvalCurrent === null`을 보고 통과해버려, 첫 사이클이 종료되기 전에 skill 도구 자체가 실행될 위험은 없지만(첫 호출 시 approval이 아직 비어있음) — **C7의 7-3 단계가 작동하려면 그 이전 어느 시점에 approval이 세팅돼 있어야 함**. 첫 호출에 대해서는 다음 사이클(runtime이 hook 반환 후 도구 본 실행 → 다시 hook을 호출하는 사이클)에서 Layer 0이 비로소 차단을 수행한다. 결론: 순서는 의미가 있고 **본 hook 진입 직후 첫 번째 Layer로 고정**.

9. **(H1) 진행 중 워크플로 보호 — skill-trigger 단락 조건 강화**:
   단순히 `commandName === resolvedName`만 비교하면 진행 중 workflow A의 approval이 펜딩인 상태에서 모델이 다른 skill B를 호출했을 때 컨텍스트가 B로 덮어써지고 A의 approval은 미아 상태가 된다. 단락 조건을 다음으로 강화:
   ```
   skip skill-trigger if (
     workflowState.get(sessionID)?.commandName === resolvedName ||
     workflowState.get(sessionID)?.approvalCurrent != null ||
     workflowState.get(sessionID)?.startupChainCurrent != null
   )
   ```
   즉 진행 중인 approval/startup chain이 있으면 새 skill 호출이 들어와도 워크플로 컨텍스트를 건드리지 않는다. 단, **모든 정상 도구 호출 사이클에서는 Layer 0/startup chain guard가 차단을 담당하므로** 진행 중 가드 자체는 여전히 정상 작동한다.

## Implementation Plan

### Tasks

순서는 의존성 기준(아래로 갈수록 위 단계 산출물 사용).

- [x] **Task 1: 상수 추가** — `src/utils/constants.js`
   - `export const SKILLS_SUBDIR = "skills";`
   - `export const SKILL_TOOL_TOKENS = Object.freeze(new Set(["skill", "launch-skill", "invokeskill"]));`

- [x] **Task 2: 디스커버리 함수** — `src/config/load-config.js`
   - `loadWorkflowCommands` 바로 아래에 `loadWorkflowSkills(directory, fsAdapter)` 추가.
   - 경로: `path.join(directory, PROJECT_CONFIG_DIR, SKILLS_SUBDIR)`.
   - 로직: 디렉터리 존재 확인 → `readdirSync(..., { withFileTypes: true })` → `isDirectory()`이고 그 안에 `SKILL.md`가 있는 항목만 채택 → 디렉터리명을 Set으로 반환.
   - `existsSync` / `readdirSync` 호출은 try/catch로 감싸 빈 Set fallback.

- [x] **Task 3: 부트스트랩 통합** — `src/index.js`
   - `loadWorkflowCommands(directory, fsAdapter)` 호출 직후 `loadWorkflowSkills(directory, fsAdapter)` 호출.
   - 두 Set을 합친 `workflowNames = new Set([...commands, ...skills])` 생성.
   - 이름 충돌 시 `debugLogger.log("bootstrap", "name collision between command and skill", { name })`.
   - `commandExecuteBeforeHandler` 팩토리에 기존 `workflowCommands` 자리에 `workflowNames` 주입 (변수명만 갈아끼우거나, 호환을 위해 `workflowCommands: workflowNames`로 키 이름 유지).
   - `audit.info("plugin bootstrap", ...)` payload에 `workflowSkillCount` 추가.

- [x] **Task 4: Skill 도구 분기 + 무조건 진단 로그** — `src/hooks/tool-execute-before.js`
   - 파일 상단: `import { SKILL_TOOL_TOKENS } from "../utils/constants.js";`
   - `createToolExecuteBeforeHook` 인자에 `commandExecuteBeforeHandler`, `workflowNames`, `runtimeConfig` 주입.
   - **배치 위치는 hook 함수 본문 진입 직후, Layer 1(bash+git block) 직전**(Technical Decision 8). 이 순서는 AC4-a로 검증.

   **(F1) 무조건 진단 로그 — SKILL_TOOL_TOKENS 매칭과 독립**:
   추측 토큰 셋이 빗나가도 실제 토큰을 캡처할 수 있도록, SKILL_TOOL_TOKENS 검사 *이전*에 모든 `tool.execute.before` 호출에 대해 1세션·1툴네임 당 1회 debug 로그를 남긴다. 이게 D1 캡처의 단일 근거가 된다.
   ```js
   // F1: unconditional unknown-tool-name observation log.
   // Fires BEFORE the skill-trigger matching block so an incorrect
   // SKILL_TOOL_TOKENS guess does NOT silence the diagnostic. Dedup is
   // session-scoped (workflowState.observedToolNames(sessionID) returns a Set).
   if (runtimeConfig?.config?.debug?.enabled === true && typeof input?.tool === "string") {
     const seen = workflowState?.observedToolNames?.(input.sessionID);
     if (seen && !seen.has(input.tool)) {
       seen.add(input.tool);
       pluginContext?.debug?.log?.("tool-execute-before", "tool name observed (first time this session)", {
         sessionID: input?.sessionID,
         toolName: input.tool,
         toolArgsKeys: toolArgs && typeof toolArgs === "object" ? Object.keys(toolArgs) : null,
         matchesSkillTokenSet: SKILL_TOOL_TOKENS.has(input.tool.toLowerCase()),
       });
     }
   }
   ```
   `workflowState.observedToolNames(sessionID)`는 본 Task에서 신설. 반환: 세션 스코프 `Set<string>`, 부재 시 lazy 생성. (참고: `src/services/workflow/workflow-state.js`에 헬퍼 추가.)

   **(F2) skillName 추출 우선순위 — `name` 제거**:
   `toolArgs.name`은 너무 일반적이라 무관 도구의 `name` 필드와 우연 매칭될 위험. 워크플로 트리거 후보는 `skill`/`skillName` 두 키만 사용. `name`은 진단 로그에 별도 필드(`fallbackNameField`)로만 기록해 추후 D1 캡처에서 `name`이 실제 후보 토큰인지 운영자가 판정.

   ```js
   // Layer: skill-as-workflow trigger
   // 위치: hook 본문 최상단, F1 진단 로그 직후, Layer 1 직전.
   // 순서 변경은 AC4-a 회귀 테스트가 차단한다.
   if (typeof input?.tool === "string" && SKILL_TOOL_TOKENS.has(input.tool.toLowerCase())) {
     // F2: 트리거 후보는 skill/skillName만. name은 진단용으로만.
     const skillName = toolArgs?.skill ?? toolArgs?.skillName ?? null;
     const fallbackNameField = typeof toolArgs?.name === "string" ? toolArgs.name : null;
     pluginContext?.debug?.log?.("tool-execute-before", "skill tool invocation observed", {
       sessionID: input?.sessionID,
       toolName: input.tool,
       resolvedSkillName: skillName,
       fallbackNameField,
       toolArgsKeys: toolArgs && typeof toolArgs === "object" ? Object.keys(toolArgs) : null,
     });
     const priorState = workflowState?.get?.(input.sessionID);
     const guardBusy =
       priorState?.approvalCurrent != null || priorState?.startupChainCurrent != null;
     if (
       typeof skillName === "string" &&
       workflowNames.has(skillName) &&
       priorState?.commandName !== skillName &&
       !guardBusy
     ) {
       // output.parts는 runtime에 닿지 않는다(Technical Decision 7). 합성 객체는
       // commandExecuteBeforeHandler 시그니처 호환용. 모델 가이드는 Layer 0 throw가 담당.
       const adaptedInput = { command: skillName, arguments: "", sessionID: input.sessionID };
       const adaptedOutput = { parts: [] };
       try {
         await commandExecuteBeforeHandler(adaptedInput, adaptedOutput);
       } catch (error) {
         pluginContext?.debug?.log?.("tool-execute-before", "skill-trigger handler invocation failed (best-effort)", {
           sessionID: input?.sessionID,
           resolvedSkillName: skillName,
           error: error?.message ?? String(error),
         });
       }
     }
   }
   ```
   - 이 분기는 readiness/branch/init/approval 파이프라인을 깨우기만 한다. 다음 도구 호출 사이클에서 Layer 0이 결과(activeApproval, initProposal 등)를 보고 throw로 차단한다.

- [x] **Task 5: native-event 어댑트 함수 export** — `src/hooks/native-event.js`
   - `handleCommandExecuted` 안의 어댑트 코드(adaptedInput/adaptedOutput 빌드 + handler 호출)를 `adaptAndInvokeCommandHandler` 헬퍼로 분리하고 named export.
   - `tool-execute-before.js`에서 이 헬퍼를 import해 동일 어댑트 코드를 재사용 (Step 4의 인라인 어댑트 대체).

- [x] **Task 6: 진단 로그 1차 가시화** — `src/index.js`
   - `runtimeConfig.config.debug.enabled === true`일 때 부트스트랩 시점에 `workflowNames` 멤버를 한 번 dump (skill 디스커버리가 의도대로 잡혔는지 확인).

- [x] **Task 7: 회귀 테스트 추가** — `tests/`
   - `loadWorkflowSkills`: 디렉터리 없음/있음/`SKILL.md` 없는 디렉터리 무시/충돌 케이스.
   - `detectWorkflowContext`가 합쳐진 Set에 대해서도 동일하게 동작.
   - `tool-execute-before` mock: `input.tool="skill"` + 매칭 skillName → `commandExecuteBeforeHandler`가 1회 호출됨. 동일 세션 재호출 시 0회.
   - **(F1) 진단 로그 분기 독립성**: `runtimeConfig.config.debug.enabled === true`이고 `input.tool === "totally-unknown-token"` (SKILL_TOOL_TOKENS 미포함)으로 호출 → debug.log가 정확히 1회 호출됨(`matchesSkillTokenSet: false` 포함). 동일 sessionID + 동일 toolName으로 재호출 시 추가 호출 0회. SKILL_TOOL_TOKENS에 새 토큰을 추가하면 분기 동작이 자동 변경됨.
   - **(F2) `name` 우회 매칭 방지**: `input.tool="skill"` + `toolArgs.name="bmad-create-story"`(skill 키 없음) + `bmad-create-story`가 workflowNames에 포함된 상태로 호출 → `commandExecuteBeforeHandler`가 호출되지 *않음*(skillName이 null). fallbackNameField는 debug log에는 기록됨.
   - **(F5) Layer 순서 회귀 — AC4-a 실현 방법**: spy를 layer 함수에 직접 걸지 않고(인라인 if라 불가) **debug.log 호출 시퀀스 + Layer 0가 throw하는 시나리오**로 검증:
     1. `runtimeConfig.config.debug.enabled = true` 세팅.
     2. `workflowState`에 `approvalCurrent != null` 사전 주입(Layer 0가 throw할 조건).
     3. `input.tool = "skill"`, `toolArgs.skill = "<workflowNames에 없는 임의 이름>"` (skill-trigger의 진단 로그는 찍지만 handler 호출은 없음).
     4. hook 호출 → Layer 0가 throw하기 *전*에 skill-trigger 진단 로그(`"skill tool invocation observed"`)가 debug.log spy에 기록되어야 함. 기록되지 않으면 순서 회귀.
     5. 보조 검증: F1 진단 로그(`"tool name observed"`)는 skill-trigger 진단 로그보다 *앞서* 호출되어야 함(spy 호출 인덱스 비교).
   - 기존 commands 전 경로 회귀 0건 — 본 변경 머지 직전 main 브랜치에서 캡처한 baseline test 결과(JUnit XML 또는 Jest --listTests 출력)와 비교. baseline 캡처는 PR 디스크립션에 첨부.

### Acceptance Criteria

- [x] **AC1 — Skill 디스커버리**
- Given `.opencode/skills/bmad-create-story/SKILL.md` 파일이 존재
- When `loadWorkflowSkills(directory, fsAdapter)`를 호출
- Then 반환 Set이 `"bmad-create-story"`를 포함

- [x] **AC1-edge — SKILL.md 없는 디렉터리는 무시**
- Given `.opencode/skills/empty-dir/` 디렉터리가 있고 그 안에 `SKILL.md`가 없음
- When `loadWorkflowSkills`를 호출
- Then 반환 Set이 `"empty-dir"`를 포함하지 않음

- [x] **AC1-edge — skills 디렉터리 부재**
- Given `.opencode/skills/`가 존재하지 않음
- When `loadWorkflowSkills`를 호출
- Then 반환은 빈 Set이며 throw 없음

- [x] **AC2 — 슬래시 호출 경로(검출 통합, command.executed가 실제로 발행될 때만)**
- Given commands 디렉터리에 `bmad-create-story.md`가 존재하는 표준 케이스
- When `command.executed` 네이티브 이벤트가 도착
- Then 기존 commands와 동일하게 readiness→branch/init→approval 파이프라인이 실행됨
- **NOTE**: skills 디렉터리에만 존재하는 이름이 `/<name>` 슬래시 입력 시 `command.executed`를 발행하는지는 opencode runtime 동작에 의존. 본 AC는 그 경로를 보장하지 **않으며**, "diagnostic verification" 항목으로 추적(Notes 섹션 참조).

- [x] **AC3 — 모델 자율 호출 경로**
- Given `input.tool === "skill"`, `toolArgs.skill === "bmad-create-story"`, 해당 이름이 `workflowNames`에 포함, `priorState?.commandName !== "bmad-create-story"`, `priorState?.approvalCurrent == null`, `priorState?.startupChainCurrent == null`
- When `tool.execute.before`가 호출
- Then `commandExecuteBeforeHandler`가 어댑트된 입력으로 1회 호출되고 워크플로 컨텍스트가 세션에 기록됨

- [x] **AC4 — 중복/충돌 트리거 방지**
- Given 다음 중 하나라도 참인 상태:
  - 동일 세션에서 같은 skill이 이미 활성(`commandName === resolvedName`)
  - 진행 중 approval이 있음(`approvalCurrent != null`)
  - 진행 중 startup chain이 있음(`startupChainCurrent != null`)
- When 같은 또는 다른 skill의 `tool.execute.before`가 도착
- Then `commandExecuteBeforeHandler`는 호출되지 않으며 진행 중인 워크플로 컨텍스트는 보존됨

- [x] **AC4-a — Layer 순서 회귀 (debug.log 시퀀스 기반)**
- Given `runtimeConfig.config.debug.enabled = true`, `workflowState`에 `approvalCurrent != null` 사전 주입(Layer 0가 throw할 조건), `input.tool = "skill"`, `toolArgs.skill = "<workflowNames 미포함 임의 이름>"`, debug.log spy 설치
- When `createToolExecuteBeforeHook`가 호출
- Then spy 호출 시퀀스가 다음 순서로 기록됨: ① `"tool name observed (first time this session)"` (F1) → ② `"skill tool invocation observed"` (skill-trigger) → ③ Layer 0 throw. ②가 ③ 이전에 호출되지 않으면 FAIL.
- **NOTE**: Layer 함수 분리 없이 검증하기 위해 spy 대상은 debug.log 호출 인덱스다(F5 해결).

- [x] **AC4-b — F1 진단 로그 분기 독립성**
- Given `debug.enabled = true`, `input.tool = "totally-unknown-token"` (SKILL_TOOL_TOKENS 미포함), 신규 sessionID
- When hook 호출
- Then debug.log가 `"tool name observed"` 메시지로 정확히 1회 호출되며 payload에 `matchesSkillTokenSet: false` 포함. 동일 sessionID + 동일 toolName 재호출 시 추가 호출 0회.

- [x] **AC4-c — F2 `name` 우회 매칭 방지**
- Given `input.tool = "skill"`, `toolArgs = { name: "bmad-create-story" }` (skill/skillName 키 없음), `bmad-create-story`가 workflowNames에 포함
- When hook 호출
- Then `commandExecuteBeforeHandler`가 호출되지 *않음*. `"skill tool invocation observed"` 로그의 `resolvedSkillName`은 null, `fallbackNameField`는 `"bmad-create-story"`.

- [x] **AC5 — 비-skill 도구는 영향 없음**
- Given `input.tool` 값이 `SKILL_TOOL_TOKENS`에 없음 (예: `"bash"`, `"edit"`)
- When `tool.execute.before` 분기 로직 통과
- Then skill-trigger 분기는 no-op, 기존 Layer 0/1/2/3 동작 그대로

- [x] **AC6 — fail-open (skillName 미해석)**
- Given `input.tool === "skill"`이지만 `toolArgs`에서 skill 이름을 추출 불가
- When 분기 로직 실행
- Then 진단 로그(`skill tool invocation observed`)만 남기고 가드는 발동하지 않으며 throw 없음

- [x] **AC7 — 부트스트랩 안전성**
- Given `loadWorkflowSkills`가 어떤 이유로든 throw 직전 상태 (`readdirSync` 권한 오류 등)
- When 부트스트랩 실행
- Then 빈 Set으로 fallback, `DevaiAiddGuardPlugin`은 정상 반환

- [x] **AC8 — 기존 회귀 0건**
- Given commands-only 회귀 테스트 스위트가 존재
- When 본 변경을 머지 후 `npm test`(또는 프로젝트 표준 test runner) 실행
- Then 변경 전 통과한 모든 케이스가 통과(0 regression)

## Additional Context

### Dependencies

- Node.js 22 `fs.readdirSync({ withFileTypes: true })` 사용 (현재 fsAdapter가 이 옵션을 지원하는지 확인 필요; 미지원 시 어댑터에 옵션 추가 또는 `existsSync(join(skillDir, name, "SKILL.md"))` 폴백).
- opencode runtime의 `tool.execute.before` 시그니처는 SDK 1.14 기준 그대로 사용 (`input.tool`, `output.args` — `tool-execute-before.js` 주석 참조).

### Testing Strategy

- **단위**: `loadWorkflowSkills`, `detectWorkflowContext`(union Set).
- **통합 모킹**: `tool-execute-before` mock 호출 — skill 분기가 native-event의 어댑트 함수를 정확히 1회 호출하는지 spy 검증, 두 번째 호출이 단락되는지 검증.
- **수동 검증(진단)**: `debug.enabled=true`로 `.opencode/devai-aidd-debug.log`를 확인하여 모델이 Skill을 호출할 때 실제 `input.tool` 값과 `toolArgs` 키를 캡처. 1차 배포에서는 이 로그가 가장 중요한 산출물. 캡처 결과로 `SKILL_TOOL_TOKENS`와 skillName 키 후보를 다음 패치에서 좁힘.
- **수동 회귀**: 한 세션에서 `/bmad-create-story` 슬래시 호출과 모델 자율 호출을 연속 수행해 가드가 한 번만 발동하는지 확인.

### Diagnostic Verification (1차 릴리스 후 후속 확인 항목)

1차 릴리스는 진단 로그를 켜둔 채 배포하고 다음 항목을 1주일 내 수집/판정:
- **D1**: 모델이 Skill을 호출할 때 실제 `input.tool` 값(소문자/대문자, 토큰 형태)과 `toolArgs`의 skillName 키 이름. 결과로 `SKILL_TOOL_TOKENS`와 추출 키 순서를 좁힘.
- **D2 (구 AC2)**: `.opencode/skills/`에만 존재하는 이름을 `/<name>`으로 슬래시 입력 시 opencode runtime이 `command.executed`를 발행하는가? 발행하지 않는다면 슬래시 경로 통합은 검출 레이어만으로는 부족하므로 별도 보완 패치 필요.
- **D3**: skill 호출 시 `arguments`/`input`/`description` 같은 자유 텍스트 필드가 `toolArgs`에 포함되는가? 포함된다면 branch ticket 추출 정확도 향상을 위해 다음 패치에서 `adaptedInput.arguments`로 전달.

### Notes

- **fail-open 정책 근거**: opencode가 보내는 skill 호출 페이로드 키가 미확정이라 fail-closed로 시작하면 잘못된 키로 인해 모든 skill 호출이 막힐 위험이 있음. 1차 릴리스는 fail-open + 진단 로그로 모양을 확인한 뒤, 2차 패치에서 키가 확정되면 가드를 강화 (e.g., 매칭 실패 시 throw, 또는 fallback으로 skillName을 `toolArgs`의 stringify로 추론).
- **start-instruction 차별화 보류**: 모델이 자율 호출한 skill에서는 "사용자가 슬래시를 입력했다"는 가정이 무너지므로 안내 문구가 어색할 수 있음. 1차 릴리스에서 실제 동작을 보고 다음 스펙에서 문구 분기 여부를 결정.
- **jsonc 노출 & 운영 가이드**:
  - Skill 이름을 그냥 디렉터리에 두기만 하면 검출은 되지만 **브랜치 질문/완료 commit 질문은 발동하지 않음** (safe-default fallback). init/baseline-commit 가드만 작동.
  - 운영팀이 특정 skill에 브랜치 가드를 원하면 jsonc에 다음을 추가:
    ```jsonc
    "workflowPolicy": {
      "bmad-create-story": { "branchRequired": true, "finalization": "commit-and-push" }
    }
    ```
  - 브랜치 type prefix(`feat/`, `docs/` 등) 적용을 원하면 `branch.commandTypeMap`에도 skill 이름 추가.
  - Release note에 위 두 jsonc 키가 skill에도 동일하게 적용됨을 1단락으로 명시 권장.
