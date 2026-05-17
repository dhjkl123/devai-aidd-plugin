---
title: 'README가 명시하는 레거시 호환성 코드·문서 일괄 제거'
slug: 'remove-legacy-compatibility-layer'
created: '2026-05-11'
revised: '2026-05-11 (post-adversarial-review v2)'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Node.js 22 (ESM)'
  - 'esbuild (--bundle --platform=node --format=esm --target=node22)'
  - 'AJV 2020-12 (JSON Schema Draft 2020-12)'
  - 'node:test + node:assert/strict (no jest/vitest)'
files_to_modify:
  - 'src/utils/constants.js'
  - 'src/config/load-config.js'
  - 'src/services/compat/legacy-bridge-service.js [DELETE]'
  - 'src/services/workflow/mutating-tools.js [NEW — shared MUTATING_TOOLS / SAFE_READ_TOOLS]'
  - 'src/index.js'
  - 'src/policies/legacy/devai-git-workflo.js [DELETE]'
  - 'src/hooks/command-execute-before.js'
  - 'src/hooks/tool-execute-before.js'
  - 'src/hooks/tool-execute-after.js'
  - 'src/hooks/session.js'
  - 'src/hooks/permission-asked.js'
  - 'src/hooks/file-edited.js'
  - 'src/audit/logger.js'
  - 'templates/legacy-opencode-aidd-plugin.json [DELETE]'
  - 'scripts/make-release.js'
  - 'package.json'
  - 'tests/regression.test.js'
  - 'README.md'
  - 'CHANGELOG.md'
  - 'scripts/verify-release-gate.js [NEW — release gate enforcement, v2 review item 2]'
code_patterns:
  - 'layer-validate-recover merge pipeline (validateAndRecover with per-layer drop)'
  - 'best-effort audit emission (try/catch around every audit.info on bootstrap path)'
  - 'thin wrapper hook factory (legacyHandlers as first arg, delegate as last step) — REMOVED in this work'
  - 'frontmatter Story labels in JSDoc (Story 4.2/4.3/4.5 traceability)'
  - 'forward-compat additionalProperties: true on extension-prone schema sections'
  - 'wrapper phase tracking via advancePhaseIfWorkflowSession (single source of truth — no parallel `lifecycle` field after this work)'
test_patterns:
  - 'plain node:assert/strict, no test framework'
  - 'verifyXxx-named functions invoked sequentially in regression.test.js'
  - 'temp workspace via fs.mkdtempSync(os.tmpdir(), prefix)'
  - 'two-way handler shape comparison (wrapper vs built) — three-way reduced'
  - 'release tree fixture via RELEASE_TARGET_ROOT env override'
  - 'control-vs-experiment fixture pairing for ignored-input assertions (added in this work)'
---

# Tech-Spec: README가 명시하는 레거시 호환성 코드·문서 일괄 제거

**Created:** 2026-05-11
**Revised:** 2026-05-11 (adversarial review v2 — F1~F25 반영)

## Overview

### Problem Statement

현재 플러그인은 README "레거시 구성 호환성" 섹션이 설명하는 두 갈래의 호환 표면을 갖고 있다.

1. **외부 호환 layer (사용자 자산 호환)** — guard-tier 설정 파일(`devai-aidd-guard.{global,project}.jsonc`), 구버전 프로젝트 설정(`opencode-aidd-plugin.json`), 워크플로 정책(`devai-git-workflow.json`), mirror·marker 브리지 서비스, `compat.bridge.evaluated` 감사 이벤트, `DevaiGitWorkflowPlugin` 별칭 export, audit wire format에 박혀 있는 `service: "opencode-aidd-plugin"` 필드, `plugin bootstrap registered no-op hooks` audit emission.
2. **내부 frozen baseline** — `src/policies/legacy/devai-git-workflo.js`. README "기존 동작 유지 흐름"이 가리키는 활성 구현 디렉터리. 6개 hook factory가 모두 `legacyHandlers`를 받아 마지막 단계에서 delegate하는 구조. start instruction 문자열에 `"legacy BMAD hook contract"`라는 단어 노출.

이 두 표면 모두 사용자가 보는 설명·코드·런타임 출력 양쪽에서 깔끔하게 사라지길 원한다. 외부 호환 layer는 BREAKING CHANGE로 단번에 제거하고, 내부 baseline은 wrapper hook factories에 inline해서 `src/policies/legacy/` 폴더 자체를 없앤다. 사용자 가시 문자열에서도 `legacy` 단어를 제거한다(Option B).

### Solution (5축)

1. **Config layer 단순화** — `loadRuntimeConfig`의 머지 파이프라인을 `DEFAULT → globalConfig → projectConfig` 3-tier로 축소. guard-tier·legacy project·legacy workflow layer 읽기를 모두 제거한다. 사용자 자산은 그대로 무시한다(읽지 않음).
2. **Bridge·marker 서비스 삭제** — `src/services/compat/` 디렉터리 전체와 `compat.bridge.evaluated` 감사 이벤트 emission, marker constant·경로를 제거.
3. **내부 legacy baseline inline** — `src/policies/legacy/devai-git-workflo.js`의 4개 handler 로직을 wrapper hook factory에 inline. 6개 hook factory의 `legacyHandlers` 첫 인자도 함께 제거. `MUTATING_TOOLS`/`SAFE_READ_TOOLS` Set은 신규 공유 모듈 `src/services/workflow/mutating-tools.js`로 한 번만 정의(F8). lifecycle 필드는 wrapper의 phase 추적(`advancePhaseIfWorkflowSession`)에 통합 — 별도 `lifecycle` 필드를 두지 않음(F4/F13).
4. **Audit wire·심볼 정리** — `DevaiGitWorkflowPlugin` 별칭 export, `LEGACY_*`/`GUARD_LEGACY_*` constants, audit logger의 `legacyService` 필드, `plugin bootstrap registered no-op hooks` emission 제거. wire format `service` 필드를 `"devai-aidd-plugin"`로 통일.
5. **사용자 가시 문자열 정리 (Option B)** — start instruction 문자열을 `"Git workflow guard is active for /<commandName>."`로 단순화. `"Bootstrap compatibility mode is preserving the legacy BMAD hook contract."` 문장 자체를 제거. `metadata.source`는 `"devai-git-workflow"` 그대로 유지(외부 audit consumer 영향 최소화 — 이름은 README/구현엔 노출되지 않는 metadata 필드).

### Scope

**In Scope:**

- `src/utils/constants.js` — `GUARD_LEGACY_*`, `LEGACY_PROJECT_CONFIG_FILE_NAME`, `LEGACY_WORKFLOW_PROJECT_CONFIG_FILE_NAME`, `LEGACY_COMPAT_MARKER_FILE_NAME`, `LEGACY_PLUGIN_SERVICE_NAME`, `LEGACY_STATE_DIRECTORY_NAME` 상수 7개 제거.
- `src/config/load-config.js` — `readLegacyConfigs`, `validateAndRecover`의 guard·legacy layer, `resolveConfigPaths`의 legacy path resolve, `sources.has*Legacy*` 플래그 제거. 머지 순서 주석 갱신.
- `src/services/compat/legacy-bridge-service.js` — 파일 삭제. `src/services/compat/` 디렉터리도 비면 함께 삭제.
- `src/services/workflow/mutating-tools.js` — **신규 파일**. `MUTATING_TOOLS`, `SAFE_READ_TOOLS` Set을 단일 source로 export.
- `src/index.js` — `ensureLegacyProjectConfigCompatibility` import·호출, `compat.bridge.evaluated` 이벤트 emission, `DevaiGitWorkflowPlugin` import·별칭 export, `legacyHandlers` 위임 구조, `WRAPPER_ONLY_HOOK_KEYS.filter` 기반 `plugin bootstrap registered no-op hooks` emission, `plugin bootstrap` payload의 `hasLegacyProjectConfig` 키 제거. 6개 hook factory 호출의 첫 인자 제거.
- `src/policies/legacy/devai-git-workflo.js` — 파일 삭제. 4개 handler 로직(start instruction text, mutating-tool guard message, lifecycle 플립, session.deleted cleanup)을 hook factories에 inline. 사용자 가시 start instruction 문자열은 Option B로 단순화.
- `src/hooks/*.js` 6개 — `createXxxHook(legacyHandlers, deps)` 시그니처를 `createXxxHook(deps)`로 축소. JSDoc 헤더에서 `THIN WRAPPER over the legacy ...`, `WRAPPER_ONLY_HOOK_KEYS` 비대칭 언급 정리. `tool-execute-after.js`는 mutating tool 시 `advancePhaseIfWorkflowSession(workflowState, sessionID, "mutating")` 호출(별도 lifecycle 필드 없음).
- `src/audit/logger.js` — `LEGACY_PLUGIN_SERVICE_NAME` import 제거. `legacyService` 필드 제거. wire format `service` 필드 값을 modern name으로 통일.
- `templates/legacy-opencode-aidd-plugin.json` 삭제.
- `scripts/make-release.js` — JSDoc의 legacy template 제외 단락 삭제.
- `package.json` — `test` 스크립트에서 frozen baseline `node --check` invariant 제거. `version` MAJOR bump(BREAKING).
- `tests/regression.test.js` — Story 4.2 bridge·guard-legacy·legacy-vs-wrapper-vs-built 어설션 정리. 새 어설션(AC1~AC6, AC13~AC15)을 위한 `verifyXxx` 함수 추가.
- `README.md` — "레거시 구성 호환성" 섹션·머지 순서 §3·관련 bullet·디렉터리 개요 언급 제거. "롤백" 섹션 텍스트가 deleted compat 신호를 참조한다면 정리.
- `CHANGELOG.md` — BREAKING CHANGE 항목 추가.

**Out of Scope:**

- 기존 사용자 자산 마이그레이션·deprecation 안내 흐름 (사용자 결정: 그대로 무시).
- 새로운 audit 이벤트 추가 (`config.validation.failed`·`plugin bootstrap`만 유지).
- `DEFAULT_PLUGIN_CONFIG`의 동작 의미 변경.
- BMAD wrapper command 검출 로직(`detectWorkflowContext`, `normalizeCommandName`)의 외부 동작 변경.
- 빌드·릴리스 산출물 7종 목록 변경.
- 기존 사용자가 `.opencode/`에 남긴 잔여 mirror·marker 파일에 대한 자동 cleanup.

## Context for Development

### Codebase Patterns

- **Layer-validate-recover 머지 파이프라인** (`src/config/load-config.js`의 `validateAndRecover`) — layer 배열을 lowest→highest priority로 순회, 각 layer를 acceptedConfig 위에 머지한 candidate를 schema validate, 통과 시 채택·실패 시 drop. 본 작업은 이 알고리즘 자체는 유지하고 layer 배열만 7개 → 2개(globalConfig, projectConfig)로 축소.
- **best-effort audit emission** (`src/index.js` bootstrap, `src/hooks/*.js`) — 모든 `audit.info(...)` 호출은 try/catch로 감싸 NFR7/NFR8(audit 실패는 부트스트랩·hook을 막지 않음)을 만족.
- **Frozen 6-key hook contract** — `SUPPORTED_HOOK_KEYS = ["command.execute.before","tool.execute.before","tool.execute.after","permission.asked","file.edited","event"]`는 외부 계약. 6개 키 이름·개수·`async (input, output?) => any` 시그니처는 그대로 유지. `WRAPPER_ONLY_HOOK_KEYS`는 본 작업 후엔 의미가 약해지므로(모든 hook이 wrapper-side) export는 유지하되 주석에서 비대칭 언급 정리.
- **Hook factory delegate 패턴 — 폐기 대상** — 현재 6개 wrapper factory 모두 첫 인자로 `legacyHandlers`를 받아 마지막 단계에서 `await legacyHandlers[key]?.(input, output)` 호출. inline 후엔 `legacyHandlers`를 매개변수에서 제거하고 4개 hook의 마지막 delegate 단계만 inline 코드로 치환.
- **Wrapper phase 추적** (`advancePhaseIfWorkflowSession`) — wrapper의 `workflowState`에 phase 필드를 두고 `"in-progress"`, `"finish"` 등으로 업데이트. 본 작업에서 mutating tool 진입 시 `"mutating"` phase로 advance하여 legacy의 `state.lifecycle = "mutating"` 동작을 흡수(F4/F13). 별도 `lifecycle` 필드 추가 없음.
- **JSDoc Story 라벨** — `Story 4.2`, `Story 4.3`, `Story 4.5` 등의 라벨은 retrospective 추적 호환을 위해 본문 의미가 변하지 않는 곳은 그대로 유지하되, frozen baseline·bridge를 직접 가리키는 주석 블록은 제거.
- **Audit wire format** — `src/audit/logger.js`가 `client.app.log({ body: { service, level, message, extra } })` 형태로 송신. 현재 `service` 필드 값은 `LEGACY_PLUGIN_SERVICE_NAME = "opencode-aidd-plugin"`. 변경 후엔 `PLUGIN_SERVICE_NAME = "devai-aidd-plugin"`로 통일.
- **Token-anchored 편집 가이드** — 본 스펙은 라인 번호가 아닌 **함수명·심볼·grep 토큰**으로 편집 위치를 지정한다(F7). 라인 번호는 본문이 정리됨에 따라 drift하므로 task 본문에 직접 라인 번호를 박지 않는다.

### Files to Reference

| File | Anchor (token / symbol / section) | Purpose |
| ---- | --- | ------- |
| `src/utils/constants.js` | `LEGACY_PROJECT_CONFIG_FILE_NAME`, `GUARD_LEGACY_*`, `LEGACY_PLUGIN_SERVICE_NAME`, `LEGACY_STATE_DIRECTORY_NAME`, `LEGACY_COMPAT_MARKER_FILE_NAME` | 7개 export 정리. `SUPPORTED_HOOK_KEYS`, `WRAPPER_ONLY_HOOK_KEYS`는 유지. |
| `src/config/load-config.js` | `readLegacyConfigs`, `validateAndRecover`, `resolveConfigPaths`, `loadRuntimeConfig`, `// Story 4.2: legacy compatibility bridge ownership ...` | layer 머지 파이프라인을 2-tier로 축소. |
| `src/config/validate-config.js` | (검토만) | layer 이름 의존 없음. |
| `src/services/compat/legacy-bridge-service.js` | (전체 파일) | 삭제. `src/services/compat/`도 비면 함께 삭제. |
| `src/services/workflow/mutating-tools.js` | (신규) | `MUTATING_TOOLS`, `SAFE_READ_TOOLS` Set export. |
| `src/index.js` | `import { DevaiGitWorkflowPlugin }`, `import { ensureLegacyProjectConfigCompatibility }`, `compat.bridge.evaluated`, `plugin bootstrap registered no-op hooks`, `legacyHandlers`, `export { DevaiAiddGuardPlugin as DevaiGitWorkflowPlugin }` | bootstrap 정리. 6개 hook factory 호출 시그니처 단순화. |
| `src/policies/legacy/devai-git-workflo.js` | (전체 파일) | 삭제. 4개 handler를 wrapper에 inline. `loadWorkflowCommands` 사본은 task 단계에서 `src/config/load-config.js`와 시맨틱 동등성 검증 후 폐기(F18). |
| `src/hooks/command-execute-before.js` | `createCommandExecuteBeforeHook`, `legacyHandlers["command.execute.before"]` | start instruction push inline(Option B 문자열). `legacyHandlers` 인자 제거. |
| `src/hooks/tool-execute-before.js` | `createToolExecuteBeforeHook`, `legacyHandlers["tool.execute.before"]` | mutating-tool guard throw inline. `MUTATING_TOOLS`/`SAFE_READ_TOOLS`는 신규 공유 모듈에서 import. |
| `src/hooks/tool-execute-after.js` | `createToolExecuteAfterHook`, `legacyHandlers["tool.execute.after"]` | mutating tool 진입 시 `advancePhaseIfWorkflowSession(workflowState, sessionID, "mutating")` 호출. 별도 lifecycle 필드 없음. |
| `src/hooks/session.js` | `createSessionHook`, `legacyHandlers.event` | wrapper의 `workflowState.clear(sessionID)`가 이미 동일 sessionID를 정리하므로 단순 `legacyHandlers` 인자·delegate 제거. session.deleted 호출 조건이 동일한지 task 단계에서 검증(F16). |
| `src/hooks/permission-asked.js` | `createPermissionAskedHook`, `legacyHandlers["permission.asked"]` | wrapper-only. `legacyHandlers` 인자, fall-through 제거. JSDoc 정리. |
| `src/hooks/file-edited.js` | `createFileEditedHook`, `legacyHandlers["file.edited"]` | wrapper-only. `legacyHandlers` 인자, fall-through 제거. JSDoc 정리. |
| `src/audit/logger.js` | `LEGACY_PLUGIN_SERVICE_NAME`, `legacyService`, `service: record.legacyService` | import·필드·wire format 정리. |
| `templates/legacy-opencode-aidd-plugin.json` | (전체 파일) | 삭제. |
| `templates/opencode.jsonc.example` | `DevaiGitWorkflowPlugin` (검색) | grep으로 별칭 참조 없음 확인(Task 1). path만 참조하므로 변경 불필요(검증). |
| `scripts/make-release.js` | `templates/legacy-opencode-aidd-plugin.json is INTENTIONALLY EXCLUDED` | JSDoc 단락 삭제. 동작 불변. |
| `package.json` | `node --check src/policies/legacy/devai-git-workflo.js`, `version` | test invariant 제거. version MAJOR bump. |
| `tests/regression.test.js` | `legacyModuleUrl`, `legacyBridgeServiceModuleUrl`, `legacyModulePath`, `verifyStory42*Bridge*`, `verifyStory45LegacyWrapperBuiltHandlerShapesMatch`, `verifyConfigMergePrecedence` Test 2, `verifyEffectiveConfigNormalizationContract` Source C, "missing legacy dependency" | 어설션 정리. AC1~AC6, AC13~AC15용 신규 `verifyXxx` 추가. |
| `tests/e2e/helpers.js` | (검토만) | `DevaiAiddGuardPlugin` 통째 호출 — 변경 불필요. Task 1에서 grep 결과 0건 명시. |
| `tests/e2e/scenario-*.test.js` 4종 | (검토만) | grep 결과 0건 — Task 1에서 명시. |
| `installer/install.{ps1,sh}`, `installer/uninstall.ps1` | `DevaiGitWorkflowPlugin`, `opencode-aidd-plugin` (검색) | Task 1 consumer 인벤토리에서 grep — 별칭 직접 호출 / 레거시 service 이름 의존 여부 확인. |
| `README.md` | `## 레거시 구성 호환성`, `이전 버전과 충돌 없이 공존한다`, `compat.bridge.evaluated`, `policies/legacy`, `templates/legacy-opencode-aidd-plugin.json은 의도적으로 ... 제외한다`, `## 롤백` | 섹션·bullet·예시·롤백 텍스트 정리. |
| `CHANGELOG.md` | (전체 파일) | BREAKING CHANGE 항목 추가. |

### Technical Decisions

- **BREAKING CHANGE 명시** — semver MAJOR 단위 변경(`package.json.version` 1자리 올림). 사용자 결정: 기존 자산 그대로 무시. README "롤백" 섹션은 **section heading + 표준 install/uninstall 안내만 남기고 본문에서 `legacy`/`레거시`/`compat.bridge`/`devai-aidd-guard`/`opencode-aidd-plugin.json`/`devai-git-workflow.json`/별칭 export/`policies/legacy` 토큰을 모두 제거**한다(v2 review item 1 해결). 이전 버전 install 흐름 자체는 그대로 유지하지만 그 흐름을 설명하는 표현은 `release/devai-aidd-plugin/versions/<previous>/install.{ps1,sh}` 같은 modern path 어휘로만 작성.
- **Config sources 플래그 축소** — `sources` 객체에서 `hasGuardLegacyGlobalConfig`, `hasGuardLegacyProjectConfig`, `hasLegacyProjectConfig`, `hasLegacyWorkflowProjectConfig` 키를 모두 제거. 최종 shape는 `{ hasGlobalConfig: boolean, hasProjectConfig: boolean }`로 정확히 2개 키, 항상 boolean 값(F10). 빈 객체나 missing key는 AC1에서 fail 처리.
- **plugin bootstrap audit payload 정리** — `hasLegacyProjectConfig` 키 제거. 동시에 `plugin bootstrap registered no-op hooks` 이벤트 자체도 제거 — 비대칭이 사라져 의미 없어짐(F19).
- **`DevaiGitWorkflowPlugin` 별칭 제거** — installer·외부 manifest의 직접 참조 여부는 Task 1 consumer 인벤토리에서 grep으로 확인(F6). 발견 시 BREAKING CHANGE entry에 마이그레이션 가이드 포함.
- **Hook factory 시그니처 변경** — `createXxxHook(legacyHandlers, deps)` → `createXxxHook(deps)`. e2e helper는 `DevaiAiddGuardPlugin` 통째 호출이라 변경 없음.
- **Audit wire format `service` 필드 변경** — `service: "opencode-aidd-plugin"` → `service: "devai-aidd-plugin"`. 사용자 결정에 따라 wire format break를 받아들임. Task 1 consumer 인벤토리에서 hard-coded `"opencode-aidd-plugin"` literal 매치 여부 grep으로 확인(F5). 발견 시 BREAKING CHANGE entry에 마이그레이션 가이드 포함.
- **frozen baseline import-ability invariant 폐기** — `package.json` test 스크립트의 `node --check src/policies/legacy/devai-git-workflo.js`를 제거. 파일 삭제와 동일 commit으로 묶어 mid-implementation에서 깨지지 않게 함(F1/F2).
- **Lifecycle vs phase 통합 (F4 결정)** — legacy의 `state.lifecycle = "mutating"`을 wrapper의 phase 추적에 통합. mutating tool 진입 시 `advancePhaseIfWorkflowSession(workflowState, sessionID, "mutating")` 호출. 별도 `lifecycle` 필드 추가 없음. workflowState shape는 `{ ..., phase: "in-progress" | "mutating" | "finish" | ... }`으로 단일.
- **Start instruction 문자열 (F3 / Option B 결정)** — `"Git workflow guard is active for /<commandName>."`로 단순화. `"Bootstrap compatibility mode is preserving the legacy BMAD hook contract."` 문장 전체 제거. `metadata.source`는 `"devai-git-workflow"` 그대로(외부 audit consumer가 이 값으로 필터링한다면 변경 영향 큼 — 단순 문자열 message만 변경하는 쪽이 risk 낮음).
- **`plugin bootstrap registered no-op hooks` audit emission 제거 (F4 결정)** — wrapper-only 비대칭 자체가 inline으로 사라지므로 emission도 제거. `WRAPPER_ONLY_HOOK_KEYS` 상수 export 자체는 유지(다른 의미로도 향후 사용 가능).
- **MUTATING_TOOLS / SAFE_READ_TOOLS 공유 모듈 (F8 결정)** — 신규 파일 `src/services/workflow/mutating-tools.js`에서 `Object.freeze`된 Set으로 export. `tool-execute-before.js`와 `tool-execute-after.js` 둘 다 import — drift 방지.
- **src/policies/ 디렉터리 처리 (F21 결정)** — 현재 하위에 `legacy/`만 존재. 본 작업으로 `legacy/`를 삭제하면 빈 디렉터리가 되므로 `src/policies/` 자체도 삭제. 향후 새 policies가 필요하면 그때 다시 만든다.
- **Task 순서 — destructive 후행 (F1/F2 결정)** — 모든 import 제거·테스트 정리·심볼 cleanup이 끝난 다음에 파일 삭제를 묶어서 실행하는 순서로 task를 재정렬. mid-implementation에서 `npm test`가 ENOENT/import-fail로 깨지는 상태를 만들지 않는다.
- **regression 메시지 톤** — `verifyStory45LegacyWrapperBuiltHandlerShapesMatch`를 `verifyStory45WrapperBuiltHandlerShapesMatch`로 rename. legacy 비교 라인 제거.

## Implementation Plan

### Tasks

> **Implementation 원칙 (F1/F2 회피)**: Task 1~10은 코드 수정·신규 파일·테스트 정리(non-destructive). Task 11에서 atomic deletion bundle을 단일 commit으로 처리. Task 11 이전엔 어떤 commit에서도 `npm test`가 ENOENT/import-fail로 깨지지 않아야 한다.

- [x] **Task 1: 사전 grep 패스 + consumer 인벤토리 (F5/F6/F25 evidence)**
  - File: `(grep across repo + dist/)`
  - Action:
    - 저장소 전체 grep: `legacy`, `Legacy`, `LEGACY_`, `GUARD_LEGACY`, `aidd-guard`, `opencode-aidd-plugin\.json`, `devai-git-workflow\.json`, `compat\.bridge`, `legacy-bridge-service`, `DevaiGitWorkflowPlugin`, `policies/legacy`, `legacyService`, `legacyHandlers`, `Bootstrap compatibility mode`.
    - `installer/`, `templates/`, `dist/` 대상 hard-coded literal grep: `"opencode-aidd-plugin"` (string equality), `DevaiGitWorkflowPlugin` (symbol).
    - `tests/e2e/`에 대해 위 토큰 grep — 결과 0건임을 명시 캡처(F25).
  - Notes: 결과를 spec 보조 노트(별도 파일 또는 PR description)에 기록. 외부 consumer 발견 시 Task 16(CHANGELOG)에 마이그레이션 가이드 포함. 본 task는 코드 변경 없음 — 정보 수집만.

- [x] **Task 2: `loadWorkflowCommands` 시맨틱 동등성 검증 (F18)**
  - File: `(diff between two source files)`
  - Action: `src/policies/legacy/devai-git-workflo.js`의 `loadWorkflowCommands`(local fn)와 `src/config/load-config.js`의 `loadWorkflowCommands`(export fn) 본문을 diff. 동일 동작이면 폐기 가능, 다르면 차이를 spec 보조 노트에 기록 후 통합 방안 결정.
  - Notes: 본 task는 코드 변경 없음 — 비교만.

- [x] **Task 3: `MUTATING_TOOLS` / `SAFE_READ_TOOLS` 공유 모듈 신설 (F8)**
  - File: `src/services/workflow/mutating-tools.js` (NEW)
  - Action: 신규 파일 작성:
    ```js
    export const MUTATING_TOOLS = Object.freeze(new Set(["edit", "write", "patch", "multiedit"]));
    export const SAFE_READ_TOOLS = Object.freeze(new Set([
      "read", "glob", "grep", "list", "lsp",
      "webfetch", "websearch", "codesearch", "skill", "todoread",
    ]));
    ```
  - Notes: 두 Set의 element는 frozen baseline(`src/policies/legacy/devai-git-workflo.js`)에서 byte-for-byte 복사. JSDoc은 단일 source of truth임을 명시.

- [x] **Task 4: 4개 frozen handler를 hook factories에 inline (Option B + lifecycle→phase 통합)**
  - File: `src/hooks/command-execute-before.js`, `src/hooks/tool-execute-before.js`, `src/hooks/tool-execute-after.js`, `src/hooks/session.js`
  - Action:
    - `command-execute-before.js`: 기존 `legacyHandlers["command.execute.before"]` delegate(파일 끝 부분) 위치에 inline 코드 추가:
      ```js
      // Inlined start instruction (replaces former legacy delegate)
      if (workflowCommands && workflowCommands.has(context.commandName)) {
        if (!Array.isArray(output.parts)) output.parts = [];
        output.parts.push({
          type: "text",
          text: `Git workflow guard is active for /${context.commandName}.`,
          synthetic: true,
          metadata: { source: "devai-git-workflow", phase: "start" },
        });
      }
      ```
      이후 delegate 호출은 Task 5에서 제거.
    - `tool-execute-before.js`: `import { MUTATING_TOOLS, SAFE_READ_TOOLS } from "../services/workflow/mutating-tools.js";`. wrapper 본문의 `advancePhaseIfWorkflowSession` 호출 후 다음 inline 추가:
      ```js
      const state = workflowState?.get?.(input?.sessionID);
      if (state && state.commandName && input?.tool) {
        if (input.tool === "question" || SAFE_READ_TOOLS.has(input.tool)) {
          // safe — no guard
        } else if (MUTATING_TOOLS.has(input.tool)) {
          throw new Error(
            `Git workflow guard: create or switch to branch \`workflow\` before editing files for /${state.commandName}.`,
          );
        }
      }
      ```
      throw 메시지 문자열은 byte-for-byte 보존(AC8).
    - `tool-execute-after.js`: `import { MUTATING_TOOLS } from "../services/workflow/mutating-tools.js";`. wrapper의 finish-tool 분기 외 일반 분기에서, mutating tool인 경우 `advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "mutating")` 호출 추가. **별도 `lifecycle` 필드 set 금지 (F13)**. 기존 `legacyHandlers["tool.execute.after"]` delegate는 Task 5에서 제거.
    - `session.js`: 본 task에서는 코드 변경 없음. wrapper의 `workflowState.clear(sessionID)`가 이미 모든 `session.deleted` event에서 sessionID 무관하게 호출됨을 grep으로 확인. legacy의 `if (event?.type === "session.deleted" && sessionID) states.delete(sessionID)` 조건과 동일함을 spec 보조 노트에 기록(F16).
  - Notes: 본 task 완료 후 두 가지가 동시에 존재 — wrapper-side inline 동작 + legacy delegate 호출. 동작은 동일(legacy의 push/throw가 이미 wrapper-side에서 일어남). Task 5에서 delegate 호출만 제거.

- [x] **Task 5: 6개 hook factory 시그니처 정리 + delegate 호출 제거**
  - File: `src/hooks/command-execute-before.js`, `src/hooks/tool-execute-before.js`, `src/hooks/tool-execute-after.js`, `src/hooks/session.js`, `src/hooks/permission-asked.js`, `src/hooks/file-edited.js`
  - Action: 각 파일에서:
    - export 함수 시그니처 첫 인자 `legacyHandlers` 제거. 예: `createCommandExecuteBeforeHook(legacyHandlers, { ... })` → `createCommandExecuteBeforeHook({ ... })`.
    - 함수 본문 마지막의 `const handler = legacyHandlers["..."]; if (!handler) return; return handler(input, output);` 패턴 제거.
    - JSDoc 헤더에서 "THIN WRAPPER over the legacy ...", "Story 4.3 — frozen ...", `WRAPPER_ONLY_HOOK_KEYS` 비대칭 언급 정리. Story 라벨은 유지하되 본문 의미만 정리.
  - Notes: 본 task 완료 후 hook factories는 `legacyHandlers`를 더 이상 받지 않는다. 단 frozen baseline 파일은 아직 디스크에 존재(Task 11에서 삭제).

- [x] **Task 6: `src/index.js` bootstrap 정리**
  - File: `src/index.js`
  - Action:
    - import에서 `import { DevaiGitWorkflowPlugin } from "./policies/legacy/devai-git-workflo.js";` 제거.
    - import에서 `import { ensureLegacyProjectConfigCompatibility } from "./services/compat/legacy-bridge-service.js";` 제거.
    - bridge 호출 + `compat.bridge.evaluated` audit emission 블록 전체 삭제(`bridgeOutcome`, try/catch around `ensureLegacyProjectConfigCompatibility`, `audit.info("compat.bridge.evaluated", ...)` payload 모두).
    - `plugin bootstrap` audit payload에서 `hasLegacyProjectConfig: ...` 키 제거.
    - `legacyHandlers = await DevaiGitWorkflowPlugin(...)` 흐름 제거.
    - `WRAPPER_ONLY_HOOK_KEYS.filter(...)`로 `wrapperOnlyHooks` derive 및 `audit.info("plugin bootstrap registered no-op hooks", ...)` emission 블록 제거(F19).
    - 6개 hook factory 호출에서 `legacyHandlers` 첫 인자 제거.
    - 마지막 줄 `export { DevaiAiddGuardPlugin as DevaiGitWorkflowPlugin };` 제거. `default` export, named `DevaiAiddGuardPlugin` export만 유지.
    - JSDoc 헤더에서 "frozen legacy core", `DevaiGitWorkflowPlugin` 별칭, `compat.bridge.evaluated`, `plugin bootstrap registered no-op hooks` 언급 정리.
  - Notes: 본 task 완료 후 `src/index.js`는 더 이상 deleted-target 두 파일을 import하지 않는다. 그러나 두 파일은 디스크에 아직 존재. `npm test`는 `node --check src/policies/legacy/...` invariant 때문에 통과(legacy 파일은 import는 안 되지만 syntax-checkable). regression suite도 아직 legacy 참조가 있으므로 정상 통과.

- [x] **Task 7: `src/audit/logger.js` wire format 정리 (F5에 따라 consumer 인벤토리 결과 반영)**
  - File: `src/audit/logger.js`
  - Action:
    - import에서 `LEGACY_PLUGIN_SERVICE_NAME` 제거.
    - `formatRecord` 함수에서 `legacyService: LEGACY_PLUGIN_SERVICE_NAME,` 필드 제거.
    - `client.app.log` 호출에서 `service: record.legacyService,` 라인을 `service: record.service,`로 변경.
  - Notes: wire format break. Task 1 consumer 인벤토리에서 `"opencode-aidd-plugin"` literal을 사용하는 외부 audit consumer가 있다면 Task 16 CHANGELOG에 명시.

- [x] **Task 8: `src/utils/constants.js` 레거시 상수 export 제거**
  - File: `src/utils/constants.js`
  - Action: 다음 7개 export와 부속 주석 일괄 삭제:
    - `LEGACY_PROJECT_CONFIG_FILE_NAME`
    - `LEGACY_WORKFLOW_PROJECT_CONFIG_FILE_NAME`
    - `GUARD_LEGACY_GLOBAL_CONFIG_FILE_NAME`
    - `GUARD_LEGACY_PROJECT_CONFIG_FILE_NAME`
    - `LEGACY_PLUGIN_SERVICE_NAME`
    - `LEGACY_STATE_DIRECTORY_NAME`
    - `LEGACY_COMPAT_MARKER_FILE_NAME`
  - `PLUGIN_SERVICE_NAME`, `STATE_DIRECTORY_NAME`, `SUPPORTED_HOOK_KEYS`, `WRAPPER_ONLY_HOOK_KEYS`는 유지. 주석에서 "frozen legacy core" 표현 단순화.
  - Notes: Task 6/7 완료 후 실행. 그 전에 실행하면 `src/index.js`/`src/audit/logger.js`의 import가 깨짐.

- [x] **Task 9: `src/config/load-config.js` 머지 파이프라인 3-tier로 축소**
  - File: `src/config/load-config.js`
  - Action:
    - import에서 `GUARD_LEGACY_GLOBAL_CONFIG_FILE_NAME`, `GUARD_LEGACY_PROJECT_CONFIG_FILE_NAME`, `LEGACY_PROJECT_CONFIG_FILE_NAME`, `LEGACY_WORKFLOW_PROJECT_CONFIG_FILE_NAME`, `LEGACY_COMPAT_MARKER_FILE_NAME` 제거.
    - `readLegacyConfigs` 함수 전체 삭제.
    - `validateAndRecover` 시그니처를 `(globalConfig, projectConfig)`로 축소. `orderedLayers` 배열을 2개 요소로 축소. JSDoc 머지 순서 주석을 `DEFAULT → globalConfig → projectConfig`로 갱신. 기존 layer 7개 언급 모두 정리.
    - `resolveConfigPaths`에서 `guardLegacyGlobalConfigPath`, `guardLegacyProjectConfigPath`, `legacyProjectConfigPath`, `legacyWorkflowProjectConfigPath`, `legacyCompatMarkerPath` 5개 제거. 반환 객체도 축소.
    - `loadRuntimeConfig`에서 `readLegacyConfigs` 호출 제거. `validateAndRecover` 호출 인자를 `(globalConfig, projectConfig)`로 축소. `sources`에서 `hasGuardLegacyGlobalConfig`/`hasGuardLegacyProjectConfig`/`hasLegacyWorkflowProjectConfig`/`hasLegacyProjectConfig` 4개 제거. 최종 `sources` shape는 정확히 `{ hasGlobalConfig: boolean, hasProjectConfig: boolean }`(F10).
    - 파일 끝의 "Story 4.2: legacy compatibility bridge ownership ..." 주석 블록 삭제.
  - Notes: Task 8 완료 후 실행(import 의존성).

- [x] **Task 10: `tests/regression.test.js` 어설션 정리 + 신규 어설션 추가**
  - File: `tests/regression.test.js`
  - Action:
    - 변수 정의 제거: `legacyModuleUrl`(파일 상단), `legacyBridgeServiceModuleUrl`, `legacyModulePath`. 모든 사용처도 제거.
    - frozen baseline 파일 존재 검사·"missing legacy dependency" import-failure 테스트 전체 제거.
    - `verifyStory45LegacyWrapperBuiltHandlerShapesMatch` 함수 본문에서 legacy instantiate·output 비교 라인 제거 → wrapper-vs-built 비교만 남김. 함수 이름을 `verifyStory45WrapperBuiltHandlerShapesMatch`로 rename. 새 함수가 비교하는 메시지는 **Option B 단순화된 start instruction 문자열**과 mutating-tool throw 메시지(보존).
    - `verifyConfigMergePrecedence`의 "Test 2: legacy files are read..." 케이스 제거. 새 케이스 `verifyLegacyFilesIgnored` 추가 — control fixture(legacy 파일 없음)와 experiment fixture(legacy 파일 3종 모두 있음)의 effective config가 deepEqual(F11/AC2).
    - `verifyEffectiveConfigNormalizationContract`의 "Source C: legacy template" 케이스 제거. Source A/B만 유지.
    - Story 4.2 bridge 어설션(`verifyStory42BridgeNoOpOnEmptyWorkspace`, `verifyStory42BridgePreservesUserLegacyWithoutMarker`, 기타) 전체 제거.
    - 그 외 grep 결과의 잔여 `legacy*` / `aidd-guard` / `opencode-aidd-plugin\.json` / `devai-git-workflow\.json` / `compat\.bridge` / `legacyService` 참조 정리.
    - **신규 어설션 추가** (각각 별도 `verifyXxx` 함수, 기존 패턴 따름):
      - `verifySourcesShapeIsExactlyTwoBooleans` — AC1: `Object.keys(loadRuntimeConfig(...).sources).sort()` 결과가 `["hasGlobalConfig", "hasProjectConfig"]`이고 두 값 모두 boolean.
      - `verifyLegacyFilesIgnored` — AC2: 위 control-vs-experiment.
      - `verifyBridgeFilesNeverCreated` — AC3: 부트스트랩 후 `.opencode/.devai-aidd-plugin.compat.generated`, `opencode-aidd-plugin.json`, `devai-git-workflow.json`이 새로 존재하지 않음.
      - `verifyDeprecatedAuditEventsNotEmitted` — AC4: 부트스트랩 audit log에 `compat.bridge.evaluated`, `plugin bootstrap registered no-op hooks` 둘 다 0건. `plugin bootstrap` payload에 `hasLegacyProjectConfig` 키 없음.
      - `verifyAuditWireFormatModernService` — AC5: 모든 `client.app.log` payload의 `body.service === "devai-aidd-plugin"`. record에 `legacyService` 필드 없음.
      - `verifyAliasExportRemoved` — AC6: dist 번들 import 시 named export `DevaiGitWorkflowPlugin` 없음. `DevaiAiddGuardPlugin` named/default export 존재. `SUPPORTED_HOOK_KEYS.length === 6`.
      - `verifyStartInstructionTextSimplified` — AC7: `output.parts`에 `text === "Git workflow guard is active for /<cmd>."`인 part가 정확히 한 번. `synthetic: true`, `metadata.source === "devai-git-workflow"`, `metadata.phase === "start"`. `"Bootstrap compatibility mode"` 문자열 0건.
      - `verifyMutatingToolThrowMessagePreserved` — AC8: throw 메시지 byte-for-byte.
      - `verifyMutatingToolAdvancesPhase` — AC13: mutating tool 입력 후 `workflowState.get(sessionID).phase === "mutating"`. `lifecycle` 필드는 객체에 존재하지 않음(`Object.keys(...).includes("lifecycle") === false`).
      - `verifySessionDeletedClearsState` — AC14: `event` hook이 `{ type: "session.deleted", properties: { sessionID } }`을 받으면 `workflowState.get(sessionID) === undefined` 또는 명시적 cleared state.
  - Notes: Task 6/7/8/9 완료 후 실행 — 그 전에 실행하면 import 변경이 안 끝나서 새 어설션이 잘못된 base에서 검증됨. 본 task 완료 시점에도 frozen baseline 파일과 bridge 서비스 파일은 디스크에 아직 존재(Task 11에서 atomic 삭제).

- [x] **Task 11: Single-commit deletion bundle — pre-flight + rollback 명시 (v2 review item 3)**
  - File: `src/services/compat/legacy-bridge-service.js`, `src/services/compat/`, `src/policies/legacy/devai-git-workflo.js`, `src/policies/legacy/`, `src/policies/`, `templates/legacy-opencode-aidd-plugin.json`, `package.json`, `scripts/make-release.js`
  - **용어 정정**: 이 task는 git의 "atomic commit" 의미에서 단일 commit이지만, DB 트랜잭션 의미의 atomic은 **아니다**. mid-task 실패 시 working tree가 dirty 상태로 남을 수 있으므로 pre-flight check와 명시적 rollback path를 둔다.
  - **Pre-flight 체크 (이 task 시작 직전 모두 통과해야 함)**:
    1. `git status --porcelain`이 빈 출력이거나 본 task 작업 디렉터리에만 변경이 있는지 확인. 다른 변경이 섞여 있으면 stash 또는 별도 commit으로 분리한 후 진행.
    2. `git ls-files src/services/compat/`가 정확히 `src/services/compat/legacy-bridge-service.js` 한 줄만 출력하는지 확인. 다른 tracked 파일 발견 시 그 파일의 처리 결정을 task 진행 전에 끝낸다.
    3. `git ls-files src/policies/`가 정확히 `src/policies/legacy/devai-git-workflo.js` 한 줄만 출력하는지 확인. 다른 tracked 파일 발견 시 동일 결정 처리.
    4. `git ls-files src/services/compat/ src/policies/legacy/ src/policies/`에 untracked file이 있는지 `git status --porcelain --ignored=no` 결과로 확인. 발견 시 본 task 시작 전에 사용자에게 결정 요청.
    5. Task 1~10이 모두 끝나 `src/index.js`/`tests/regression.test.js`/그 외 어디에도 deleted-target 두 파일을 import하거나 reference하지 않음을 grep으로 재확인 (`grep -r "policies/legacy" src/ tests/ scripts/`, `grep -r "services/compat" src/ tests/ scripts/`이 모두 0건).
  - **Action (단일 commit)**:
    - `git rm src/services/compat/legacy-bridge-service.js`. 그 후 `src/services/compat/`이 빈 디렉터리이면 `rmdir` (git은 빈 디렉터리를 추적하지 않으므로 `git rm`이 자동 처리하지 않을 수 있음 — explicit `rmdir`).
    - `git rm src/policies/legacy/devai-git-workflo.js`. 그 후 `src/policies/legacy/`, `src/policies/`도 비면 `rmdir`(F21).
    - `git rm templates/legacy-opencode-aidd-plugin.json`.
    - `package.json` `test` 스크립트에서 `node --check src/policies/legacy/devai-git-workflo.js && ` 제거(F1/F2 — 동일 commit). 최종 test 스크립트 expected shape(AC12):
      ```
      "test": "node --check src/index.js && node --check scripts/build.js && node --check scripts/make-release.js && node tests/regression.test.js && node tests/e2e/scenario-workflow-detection.test.js && node tests/e2e/scenario-readiness-not-initialized.test.js && node tests/e2e/scenario-approval-deny-recovery.test.js && node tests/e2e/scenario-file-edited-tracking.test.js"
      ```
    - `scripts/make-release.js` JSDoc의 "templates/legacy-opencode-aidd-plugin.json is INTENTIONALLY EXCLUDED ..." 단락 삭제.
    - `git status`로 staged 변경을 확인한 뒤 단일 commit. commit message 권장: `Delete legacy compatibility surface (bridge, frozen baseline, template) and prune test invariant.`
  - **Rollback path (commit 후 검증 실패 또는 working tree 망가짐 시)**:
    - commit 전 mid-edit에서 실패한 경우: `git restore --staged .` 후 `git checkout -- .`로 모든 변경 되돌리고 pre-flight부터 다시.
    - commit 직후 push 전 검증(다음 step의 `npm run build && npm test`)이 실패한 경우: `git reset HEAD~` 또는 `git revert HEAD`로 되돌리고 어떤 파일이 누락됐는지 grep으로 추적 — 보통 Task 6/10이 미완료 상태에서 본 task가 시작된 경우다.
    - 이미 push했는데 다른 환경에서 회귀가 발견된 경우: revert PR을 만들어 master에 적용하고, 본 작업의 이슈를 수정한 후 새 PR로 다시 진행.
  - Notes: F1/F2 회피의 핵심 — Task 1~10이 모두 끝난 시점이라 이 commit 직후 `npm test`(Task 13)가 정상 통과. v2 review item 3 — "atomic"이라는 단어를 "single-commit"으로 정확히 표현하고 실패 모드·rollback path를 명시. **mid-implementation에서는 Task 6 이후 본 task 이전에 다른 commit을 나눌 수 있지만 본 task가 다루는 7개 변경은 단일 commit으로 묶는다.**

- [x] **Task 12: README 정리 (section anchor 기반, F17)**
  - File: `README.md`
  - Action: 섹션 anchor로 위치 지정 (라인 번호 사용 금지):
    - **목차 정리**: `## 목차` 아래 항목 중 `[레거시 구성 호환성](#레거시-구성-호환성)` 항목과 그 하위 4개 들여쓰기 항목 모두 제거.
    - **`## 주요 기능` 섹션**: "이전 버전과 충돌 없이 공존한다" bullet 통째 제거. "모든 결정이 감사 이벤트로 남는다" bullet의 `compat.bridge.evaluated` 예시를 `config.validation.failed` 또는 `plugin bootstrap` 예시로 교체.
    - **`### 설정 파일 우선순위` 섹션**: §3(레거시 호환 설정) bullet 제거 → 글로벌·프로젝트 2-tier로 축소. 직후 단락의 "런타임은 기존 코어 로직 호환을 위해 ... bridge 한다" 문장 전체 제거.
    - **`## 빠른 시작` 섹션**: `compat.bridge.evaluated` JSON 샘플을 `config.validation.failed` 또는 `plugin bootstrap` 샘플로 교체. 주변 문장은 "감사 이벤트가 기록되는지" 톤 유지.
    - **`### 기존 동작 유지 흐름` 섹션**: 마지막 문장(`실제 workflow 판단 로직은 ... legacy/devai-aidd-plugin-core.js로 옮겨 최대한 그대로 유지했다`) 제거.
    - **`## 레거시 구성 호환성` 섹션**: 헤더부터 다음 `##` 헤더(현재 `## 빌드와 릴리스`) 직전까지 전체 삭제(경로 매핑 표·머지 순서 7-step·marker 의미·동시 존재 9-row 표 모두).
    - **`## 빌드와 릴리스` 섹션**: 마지막 단락(`templates/legacy-opencode-aidd-plugin.json은 의도적으로 릴리스 산출물에서 제외 ...`) 제거. 회귀 게이트 단락의 "Story 4.5: `verifyStory45LegacyWrapperBuiltHandlerShapesMatch` 외 6종" 표현을 `verifyStory45WrapperBuiltHandlerShapesMatch` 외 N종으로 갱신.
    - **`## 롤백` 섹션 unconditional rewrite (F23 + v2 review item 1)**: section heading은 유지하되 본문을 다음 표준 안내로 교체:
      ```markdown
      ## 롤백

      - 이전 버전으로 되돌리려면 `release/devai-aidd-plugin/versions/<version>/install.ps1` 또는 `install.sh`를 사용한다.
      - 제거는 Windows에서 `installer/uninstall.ps1`로 가능하다.
      - 설정 파일은 uninstall 시 삭제하지 않으므로, 필요하면 수동으로 정리한다.
      ```
      위 문구 외에 어떤 추가 문장도 두지 않는다(audit AND rewrite 통합 — 조건부 정리가 아님).
  - Notes: 정리 후 grep으로 README에 `레거시`/`legacy`/`aidd-guard`/`opencode-aidd-plugin\.json`/`devai-git-workflow\.json`/`compat\.bridge`/`policies/legacy`/`Bootstrap compatibility mode` 매치 0건 확인(AC10). v2 review item 1 — 롤백 섹션 보존과 AC10 "0건" 사이의 모순은 본 task가 unconditional rewrite로 해소.

- [x] **Task 13: 회귀 게이트 실행**
  - File: `(runtime check)`
  - Action: `npm run build && npm test` 실행. 실패 시 직전 task로 돌아가 수정.
  - Notes: 모든 테스트 통과해야 함. Task 11 직후 시점이므로 deleted target 참조는 0건이어야 정상.

- [x] **Task 14: `dist/devai-aidd-plugin.js` grep 검증 (AC11, F15)**
  - File: `dist/devai-aidd-plugin.js`
  - Action: 다음 토큰을 grep해 매치 0건 확인:
    - `aidd-guard`, `opencode-aidd-plugin\.json`, `devai-git-workflow\.json`, `compat\.bridge\.evaluated`, `LEGACY_COMPAT_MARKER`, `legacyService`, `Bootstrap compatibility mode`.
    - `as DevaiGitWorkflowPlugin`(별칭 export 패턴)도 0건.
  - Notes: F15 — 본 task 시점에 `LEGACY_COMPAT_MARKER` literal이 남는다면 `--minify` flag 또는 별도 dead-string-strip이 필요. 발견 시 Task 6/8로 돌아가 source에서 잔여 literal 제거.

- [x] **Task 15: release gate verification script 신설 (v2 review item 2)**
  - File: `scripts/verify-release-gate.js` (NEW), `package.json`
  - Action:
    - 신규 스크립트 `scripts/verify-release-gate.js` 작성. 동작:
      1. 현재 working tree의 `package.json` version을 읽는다.
      2. `git show master:package.json` 또는 `git fetch origin && git show origin/main:package.json`(저장소 main branch convention 따름)으로 master HEAD 버전을 읽는다. master에서 PR이 처음 만들어지는 경우엔 `--from <baseSha>` 인자를 받아 그 commit의 version과 비교.
      3. 두 SemVer를 파싱해 현재 버전이 master 버전 대비 MAJOR이 한 자리 이상 큰지 확인. 작거나 같으면 exit 1과 함께 메시지: `release gate failed: package.json version (X.Y.Z) is not a MAJOR bump over master (A.B.C).`
      4. `CHANGELOG.md`를 읽고 `## [<currentVersion>]` 헤더 라인이 존재하는지 검증. 없으면 exit 1.
      5. 그 섹션 헤더부터 다음 `## ` 헤더 직전까지의 본문에 `### BREAKING CHANGES` 하위 헤더가 존재하는지 검증. 없으면 exit 1.
      6. 모든 검증 통과 시 exit 0과 함께 `release gate ok: <version>` 출력.
    - `package.json`의 `scripts` 객체에 다음 추가:
      ```
      "verify:release-gate": "node scripts/verify-release-gate.js"
      ```
    - PR template 또는 `.github/workflows/*.yml` 같은 CI 설정에서 merge 직전 단계로 `npm run verify:release-gate` 호출이 들어가도록 명시(저장소에 PR template 파일 없으면 README의 maintainer 섹션에 manual checklist로 기록).
  - Notes: AC9b/AC9c 대응. v2 review item 2 — atomic merge gate가 CI에서 실제 enforce 가능해지도록 자동화. version bump·CHANGELOG entry는 Task 16에서 작성하고 본 task는 검증 도구만 만든다.

- [x] **Task 16: `CHANGELOG.md` BREAKING CHANGE entry + `package.json` version MAJOR bump (single commit, F9/AC9)**
  - File: `CHANGELOG.md`, `package.json`
  - Action: 단일 commit으로:
    - `package.json` `version` 필드를 MAJOR 한 자리 올림 (예: `1.0.0` → `2.0.0`).
    - `CHANGELOG.md`에 새 version 섹션 추가. **백틱 nesting 회피** — 본 spec 내 인용 시엔 indented 4-space code block 또는 fenced block의 fence 길이를 늘려 사용. 실제 `CHANGELOG.md`에 들어가는 본문은 backtick inline code가 자연스럽게 들어가는 일반 markdown:

        ## [\<new-version\>] - 2026-05-XX

        ### BREAKING CHANGES

        - 레거시 호환성 layer(devai-aidd-guard.{global,project}.jsonc, opencode-aidd-plugin.json, devai-git-workflow.json) 일괄 제거. 기존 사용자가 보유한 이들 파일은 무시된다(읽지 않음). 마이그레이션은 모던 경로(devai-aidd-plugin.{global,project}.jsonc)로 직접 이전.
        - compat.bridge.evaluated audit 이벤트 폐기.
        - plugin bootstrap registered no-op hooks audit 이벤트 폐기.
        - DevaiGitWorkflowPlugin named export 별칭 제거(DevaiAiddGuardPlugin만 유지).
        - audit wire format body.service 필드 값이 "opencode-aidd-plugin" → "devai-aidd-plugin"로 변경. 다운스트림 audit consumer가 hard-coded "opencode-aidd-plugin" literal에 의존한다면 마이그레이션 필요.
        - start instruction 문자열 "Bootstrap compatibility mode is preserving the legacy BMAD hook contract." 부분 제거 → "Git workflow guard is active for /<commandName>."로 단순화.
        - workflowState shape: lifecycle 필드 폐기 → phase: "mutating" 단일 source로 통합.

      실제 `CHANGELOG.md` 작성 시엔 위 항목 이름들에 backtick을 자유롭게 입혀도 무방(파일 자체는 fence 안에 있지 않으므로 backtick 충돌 없음).
    - Task 1 consumer 인벤토리 결과에서 외부 consumer가 발견된 경우 해당 마이그레이션 가이드를 entry에 추가.
  - Notes: master merge 직전에 처리. Task 15의 verification script가 본 commit의 결과를 검증한다.

### Acceptance Criteria

- [x] **AC1 (3-tier sources shape)**: GIVEN `~/.config/opencode/devai-aidd-plugin.global.jsonc`와 `<project>/.opencode/devai-aidd-plugin.project.jsonc`만 존재할 때, WHEN `loadRuntimeConfig(directory, fsAdapter)`가 호출되면, THEN `Object.keys(result.sources).sort()` 결과가 정확히 `["hasGlobalConfig", "hasProjectConfig"]`이고 두 값 모두 boolean이다(빈 객체나 missing key는 fail).

- [x] **AC2 (legacy file ignored, control-vs-experiment)**: GIVEN control fixture(modern 파일만)와 experiment fixture(modern 파일 + `opencode-aidd-plugin.json` + `devai-git-workflow.json` + `devai-aidd-guard.project.jsonc`)가 동일 modern config를 가질 때, WHEN 두 fixture에서 각각 `loadRuntimeConfig`를 호출하면, THEN 두 결과의 `config` 필드가 deepEqual이다(legacy 파일 무시 검증).

- [x] **AC3 (bridge files never created)**: GIVEN 어떤 파일 조합이든 부트스트랩이 끝났을 때, WHEN `.opencode/`를 검사하면, THEN `.devai-aidd-plugin.compat.generated` marker, `opencode-aidd-plugin.json`, `devai-git-workflow.json`이 부트스트랩 전과 비교해 새로 생성/갱신되지 않는다(존재했다면 mtime 변동 없음).

- [x] **AC4 (deprecated audit events removed)**: GIVEN 부트스트랩 시 audit sink가 모든 이벤트를 수집할 때, WHEN log를 검사하면, THEN `compat.bridge.evaluated` 이벤트와 `plugin bootstrap registered no-op hooks` 이벤트는 0건이고, `plugin bootstrap` 페이로드에 `hasLegacyProjectConfig` 키가 없다.

- [x] **AC5 (audit wire format modern)**: GIVEN `client.app.log({ body })`가 호출될 때, WHEN payload를 확인하면, THEN `body.service === "devai-aidd-plugin"`이고 모든 record에 `legacyService` 필드가 없다(local record와 wire 모두).

- [x] **AC6 (alias removed, contract preserved)**: GIVEN `dist/devai-aidd-plugin.js`를 import할 때, WHEN named/default export를 확인하면, THEN `DevaiAiddGuardPlugin` named/default export는 존재하고 `DevaiGitWorkflowPlugin` named export는 `undefined`다. `SUPPORTED_HOOK_KEYS.length === 6`이고 6개 키 이름이 변경되지 않았다. **Task 1 consumer 인벤토리에서 별칭 직접 호출이 발견된 외부 consumer는 CHANGELOG에 마이그레이션 가이드와 함께 명시돼 있다.**

- [x] **AC7 (start instruction simplified — Option B)**: GIVEN `.opencode/commands/<cmd>.md`가 존재하는 디렉터리에서 wrapper의 `command.execute.before`가 호출될 때, WHEN 결과를 확인하면, THEN `output.parts`에 `text === "Git workflow guard is active for /<cmd>."`인 part가 정확히 한 번 push되며 `synthetic: true`, `metadata.source === "devai-git-workflow"`, `metadata.phase === "start"`다. `"Bootstrap compatibility mode"`나 `"legacy BMAD hook contract"` 부분 문자열은 어떤 part에도 등장하지 않는다.

- [x] **AC8 (mutating-tool guard message preserved)**: GIVEN workflow 세션이 active일 때, WHEN `tool.execute.before`에 mutating tool(`edit`/`write`/`patch`/`multiedit`)이 들어오면, THEN throw 메시지는 ``"Git workflow guard: create or switch to branch `workflow` before editing files for /<commandName>."`` 문자열과 byte-for-byte 일치한다.

- [x] **AC9a (test pass)**: GIVEN `npm test`를 클린 상태에서 실행할 때, WHEN 결과를 확인하면, THEN 모든 테스트가 통과한다.

- [x] **AC9b (release gate script enforces version + CHANGELOG)**: GIVEN PR이 master로 merge되기 직전 시점에, WHEN `node scripts/verify-release-gate.js`를 실행하면, THEN exit code 0이다. 이 스크립트는 (a) `package.json.version`이 SemVer 형식이고 master HEAD 버전 대비 MAJOR 한 자리 이상 올라간 값인지, (b) `CHANGELOG.md`에 정확히 그 version의 `## [<version>]` 섹션 헤더가 존재하고 그 섹션 본문에 `### BREAKING CHANGES` 하위 항목이 있는지 검증한다. 어느 하나라도 실패 시 exit code 1과 함께 사람이 읽을 수 있는 메시지를 stderr로 출력한다.

- [x] **AC9c (CI wiring)**: GIVEN `package.json`의 `scripts`를 읽을 때, WHEN 확인하면, THEN `verify:release-gate` 스크립트가 정의돼 있고 (`"verify:release-gate": "node scripts/verify-release-gate.js"`) PR template 또는 CI 설정에서 merge 직전에 호출되도록 명시돼 있다.

- [x] **AC10 (README zero matches)**: GIVEN `README.md`를 grep할 때, WHEN `레거시`, `devai-aidd-guard`, `opencode-aidd-plugin\.json`, `devai-git-workflow\.json`, `compat\.bridge`, `policies/legacy`, `Bootstrap compatibility mode` 토큰을 찾으면, THEN 매치는 0건이다(코드블록·표 포함). 영어 단어 `legacy`도 0건이다.

- [x] **AC11 (dist zero matches)**: GIVEN `dist/devai-aidd-plugin.js`를 grep할 때, WHEN `aidd-guard`, `opencode-aidd-plugin\.json`, `devai-git-workflow\.json`, `compat\.bridge\.evaluated`, `LEGACY_COMPAT_MARKER`, `legacyService`, `Bootstrap compatibility mode`, `as DevaiGitWorkflowPlugin` 토큰을 찾으면, THEN 매치는 0건이다.

- [x] **AC12 (test script final shape)**: GIVEN `package.json`을 읽을 때, WHEN `scripts.test` 값을 확인하면, THEN 정확히 다음 문자열이다:
  ```
  node --check src/index.js && node --check scripts/build.js && node --check scripts/make-release.js && node tests/regression.test.js && node tests/e2e/scenario-workflow-detection.test.js && node tests/e2e/scenario-readiness-not-initialized.test.js && node tests/e2e/scenario-approval-deny-recovery.test.js && node tests/e2e/scenario-file-edited-tracking.test.js
  ```
  `node --check src/policies/legacy/...` 부분 문자열이 포함되지 않는다.

- [x] **AC13 (lifecycle integrated into phase)**: GIVEN workflow 세션이 active일 때, WHEN mutating tool(`edit`/`write`/`patch`/`multiedit`) 입력을 wrapper의 `tool.execute.after`가 처리하면, THEN `workflowState.get(sessionID).phase === "mutating"`이고 `Object.keys(workflowState.get(sessionID)).includes("lifecycle") === false`다.

- [x] **AC14 (session.deleted cleanup)**: GIVEN wrapper가 `event` hook을 호출 받을 때, WHEN `{ type: "session.deleted", properties: { sessionID } }` 형태의 event가 들어오면, THEN `workflowState.get(sessionID)`가 `undefined` 또는 명시적 cleared state를 반환한다(legacy의 `states.delete(sessionID)`와 동일 시맨틱).

- [x] **AC15 (consumer inventory documented)**: GIVEN PR description 또는 spec 보조 노트(`_bmad-output/implementation-artifacts/tech-spec-remove-legacy-compatibility-layer.notes.md` 등)를 확인할 때, WHEN Task 1의 결과를 찾으면, THEN `installer/`, `templates/`, `dist/`, `tests/e2e/` 각각의 grep 결과가 명시적으로 기록돼 있다(매치가 0건이면 0건이라고 기록). 외부 consumer 매치가 발견된 경우 해당 path와 마이그레이션 결정이 함께 기록돼 있다.

## Additional Context

### Dependencies

- 외부 패키지 변경 없음(`ajv`·`esbuild` 그대로).
- `package.json` `version` 필드: 본 작업이 master에 merge되기 전에 MAJOR bump가 동일 PR에 포함돼야 한다(AC9).
- 다른 in-flight task와 충돌 가능성: Story 4.x retrospective는 read-only artifact이므로 충돌 없음. 현재 `master` 브랜치 head(`b7ce78b Rename package devai-aidd-guard to devai-aidd-plugin`)와 직접 합쳐짐.

### Testing Strategy

- **단위 회귀** (`tests/regression.test.js`):
  - 유지: `verifyConfigMergePrecedence`(2-tier만), `verifyEffectiveConfigNormalizationContract`(Source A/B만), `verifyStory45WrapperBuiltHandlerShapesMatch`(rename 후, wrapper-vs-built만), `verifyStory34*` best-effort audit, `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`.
  - 추가: AC1~AC6, AC13~AC14에 대응하는 9개 신규 `verifyXxx` 함수(Task 10에 명시).
  - 비교 기준이 변경되는 어설션: start instruction text는 단순화된 Option B 문자열로, mutating-tool throw는 byte-for-byte 보존.
- **e2e 회귀** (`tests/e2e/scenario-*.test.js` 4개): sandbox 디렉터리에 legacy 파일을 만들지 않으므로 시나리오 변경 불필요. `DevaiAiddGuardPlugin` 시그니처는 외부 contract 그대로.
- **수동 build smoke**: `npm run build` 후 `dist/devai-aidd-plugin.js`에 대해 AC11의 grep 검증.
- **수동 컨슈머 인벤토리** (Task 1): grep 결과 0건이어도 명시 기록 — AC15 통과 조건.
- **수동 single-commit 검증** (Task 11/16): commit graph에서 (a) Task 11 commit 직후 `npm test`가 통과하는지, (b) Task 16 commit이 version + CHANGELOG를 동시에 갱신했는지 확인. (c) Task 15에서 만든 `node scripts/verify-release-gate.js`를 실행해 exit 0인지 확인 — 자동화 게이트 enforcement.
- **수동 릴리스 dry-run**: 본 스펙의 in-scope 아님. 별도 release 시점에 `npm run pack`으로 검증.

### Notes (decisions resolved)

- 사용자 결정 사항: (1) 코드와 README 모두에서 레거시 호환성 제거. (2) 기존 사용자 자산은 그대로 무시(읽지 않음, 마이그레이션·deprecation grace 없음). (3) 내부 `src/policies/legacy/` 디렉터리는 wrapper에 inline해서 함께 정리.
- 본 변경은 외부 contract break이므로 release 메시지에 BREAKING CHANGE를 명시. README "롤백" 섹션은 그대로 두어 이전 버전 install path는 유지.
- frozen baseline import-ability invariant(`node --check src/policies/legacy/...`)는 폐기. 폐기 시점에 `package.json` test 스크립트도 같이 업데이트(Task 11과 동일 atomic commit).
- `Story 4.2 (Cases B + F)`처럼 bridge 결정표를 직접 가리키는 단위 테스트는 정책상 의미가 사라지므로 archive 폴더로 이동하지 않고 그냥 제거. retrospective(`_bmad-output/implementation-artifacts/epic-*-retro-*.md`)는 그대로 보존(역사적 기록).

**Adversarial review 결정 사항 (resolved, no longer parked):**
- **F3 / start instruction 문자열 정책**: **Option B 채택** — `"Bootstrap compatibility mode is preserving the legacy BMAD hook contract."` 문장 자체를 제거하고 `"Git workflow guard is active for /<commandName>."`로 단순화. AC7과 AC10·AC11의 "legacy 0매치" 목표가 모두 정합.
- **F4 / lifecycle vs phase 통합**: legacy의 `state.lifecycle = "mutating"`을 wrapper의 `advancePhaseIfWorkflowSession(workflowState, sessionID, "mutating")`로 흡수. 별도 `lifecycle` 필드 미신설. AC13으로 검증.
- **F4 / `plugin bootstrap registered no-op hooks` audit emission**: 비대칭이 사라지므로 emission 자체를 제거. AC4로 검증.
- **F8 / MUTATING_TOOLS 공유 모듈**: 신규 파일 `src/services/workflow/mutating-tools.js`에 단일 source — drift 방지.

## Superseded Contract Note - 2026-05-14

`tool.execute.before`의 mutating-tool branch-switch throw 보존 계약은 `tech-spec-remove-layer-3-mutating-tool-guard.md`에 의해 폐기되었다. 현재 계약은 workflow session에서도 `edit`/`write`/`patch`/`multiedit`를 before-hook에서 차단하지 않고, `tool.execute.after`에서 `MUTATING_TOOLS` 기반으로 `workflowState.phase === "mutating"`을 기록하는 것이다. Layer 0 pending approval/startup chain 차단과 Layer 1 bash+git block-until-init 차단은 계속 유지된다.
- **F21 / `src/policies/` 부모 디렉터리**: `legacy/`만 하위에 있으므로 본 작업 후 `src/policies/`도 삭제. 미래 새 policies 필요 시 다시 생성.
- **모든 line 번호 anchor**: token-anchored grep guidance로 대체(F7/F17). Task 본문에서 라인 번호 직접 인용 없음.
