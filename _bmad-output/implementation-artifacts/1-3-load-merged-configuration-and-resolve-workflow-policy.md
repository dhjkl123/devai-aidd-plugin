# Story 1.3: Load Merged Configuration and Resolve Workflow Policy

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a team administrator,
I want the plugin to load global, project, and legacy-compatible settings into one effective policy,
so that workflow behavior matches team rules without manual code changes.

## Acceptance Criteria

1. **Given** global and project configuration files both exist
   **When** runtime configuration is loaded
   **Then** the plugin applies a deterministic precedence order and produces a normalized effective configuration
   **And** branch defaults, long-lived branch rules, and workflow policy mappings are available to downstream handlers.
2. **Given** only legacy configuration files are present
   **When** the plugin loads configuration
   **Then** it preserves compatibility by reading the legacy files and applying their values to the effective configuration
   **And** the workflow can continue without forcing a migration before use.
3. **Given** a workflow context has been detected for a configured BMAD command
   **When** policy resolution is requested for that workflow
   **Then** the resolver returns a single effective policy entry containing `category`, `identityStrategy`, `branchRequired`, `finalization`, branch defaults, and the matching `commandType` slug
   **And** unknown or unmapped commands resolve to a deterministic safe-default policy without throwing.
4. **Given** invalid or malformed configuration values are present in any source
   **When** schema validation runs during configuration loading
   **Then** the plugin emits a structured `config.validation.failed` audit event with machine-readable error details
   **And** bootstrap continues by falling back to the previous valid layer (project → global → defaults) so the runtime still produces a normalized effective configuration.

## Tasks / Subtasks

- [ ] Author the runtime configuration JSON Schema and Ajv-backed validator (AC: 1, 4)
  - [ ] Create `src/config/schema/runtime-config.schema.json` describing the full effective configuration shape: `branch.pattern`, `branch.defaultType`, `branch.fallbackTicket`, `branch.longLivedBranches[]`, `branch.defaultMergeTarget`, `branch.validationRegex`, `branch.commandTypeMap`, `workflowPolicy[<commandName>]` with required keys (`category`, `identityStrategy`, `branchRequired`, `finalization`) plus optional `artifactKey`, and the `audit` block. Include a `schemaVersion` integer field; defaults to `1`.
  - [ ] Create `src/config/validate-config.js` that compiles the schema once with Ajv 8.17.1 (`strict: true`, `allErrors: true`) and exports `validateRuntimeConfig(config)` returning `{ valid: boolean, errors: AjvError[] }`. Do not throw; the loader decides recovery.
  - [ ] Add Ajv 8.17.1 to `package.json` dependencies (exact version per architecture decision). Confirm `npm install` completes and the lockfile is updated.
  - [ ] Export the schema document and a `RUNTIME_CONFIG_SCHEMA_VERSION = 1` constant from `src/config/validate-config.js` so downstream stories and tests share one source of truth.

- [ ] Refactor `loadRuntimeConfig` into a deterministic merge pipeline (AC: 1, 2, 4)
  - [ ] In `src/config/load-config.js`, split the current logic into named helpers: `readGlobalConfig`, `readProjectConfig`, `readLegacyConfigs`, `mergeConfigs(layers)` (already exists as `mergeObjects` — keep the implementation and re-export under the new name), and `validateAndRecover(layers)`.
  - [ ] Apply this fixed precedence (lowest to highest, last write wins): `DEFAULT_PLUGIN_CONFIG` → `globalConfig` → `legacyProjectConfig` → `legacyWorkflowProjectConfig` → `projectConfig`. Document the order in a JSDoc block on `loadRuntimeConfig`.
  - [ ] After every merge, run `validateRuntimeConfig` on the candidate. If validation fails, drop the highest layer and retry; record each rejection so the caller can emit `config.validation.failed`. If all layers fail, the merge result equals the cloned `DEFAULT_PLUGIN_CONFIG`.
  - [ ] Extend the returned object with a `validation` field: `{ valid: boolean, droppedLayers: ["projectConfig" | "legacyWorkflowProjectConfig" | "legacyProjectConfig" | "globalConfig"], errors: AjvError[] }`. The existing `config`, `paths`, and `sources` fields stay intact for backward compatibility with `src/index.js` and `src/audit/logger.js`.
  - [ ] Do NOT modify `ensureLegacyProjectConfigCompatibility` or its bridge-file write semantics in this story; that behavior is owned by Story 4.2 per `sprint-change-proposal-2026-05-08.md`. Story 1.3 is a read-only resolver.

- [ ] Implement `resolveWorkflowPolicy` as the policy resolver service (AC: 1, 3)
  - [ ] Create `src/services/workflow/resolve-workflow-policy.js` exporting `resolveWorkflowPolicy(workflowContext, runtimeConfig)`. The function is pure (no I/O, no logger calls) and returns the standard policy result envelope `{ outcome, reason, message, details }` with `outcome: "allow" | "deny" | "ask" | "skip"` per the architecture's "API Response Formats" rule.
  - [ ] When `workflowContext` is `null` or has no recognized `commandName`, return `{ outcome: "skip", reason: "no-workflow-context", message: "No BMAD workflow command detected.", details: { commandName: null } }`.
  - [ ] When `commandName` is recognized but missing from `workflowPolicy`, return a default `{ outcome: "ask", reason: "policy-default-fallback", message: "No explicit policy for <commandName>; using safe defaults.", details: { commandName, fallback: { category: "uncategorized", identityStrategy: "ticket-or-args", branchRequired: false, finalization: "no-forced-finalization" } } }`. Do not throw.
  - [ ] When `commandName` matches, return `{ outcome: "allow", reason: "policy-resolved", message: "Resolved workflow policy for <commandName>.", details: { policy: <effectivePolicy>, branch: { defaultType, commandType, longLivedBranches, fallbackTicket, defaultMergeTarget, pattern, validationRegex } } }` where `commandType` is `branch.commandTypeMap[commandName]` (falls back to `branch.defaultType`).
  - [ ] Export an internal `buildSafeDefaultPolicy()` helper alongside the resolver so tests and future stories can assert on the same canonical fallback object.
  - [ ] Do NOT mutate `runtimeConfig`. The resolver returns fresh nested objects so callers cannot accidentally alter the loaded config.

- [ ] Wire validation diagnostics and policy resolver into bootstrap (AC: 1, 3, 4)
  - [ ] In `src/index.js`, after `loadRuntimeConfig` returns, inspect `runtimeConfig.validation`. If `validation.valid === false` or `droppedLayers.length > 0`, emit one structured `config.validation.failed` audit event with payload `{ event: "config.validation.failed", timestamp: <ISO-8601>, workflow: null, command: null, details: { droppedLayers, errors: <ajv errors normalized to { instancePath, message, params }> } }`. Bootstrap MUST continue (best-effort audit) regardless of audit success.
  - [ ] Pass the validated `runtimeConfig` and a bound `resolveWorkflowPolicy` reference into the hook factory chain so Story 1.4 (branch strategy) and Story 2.x (approval) can consume the resolver without re-loading config. Concrete shape: extend the existing wrapper bootstrap to expose `runtimeConfig` and `resolvePolicy(workflowContext)` on a `pluginContext` object passed to each hook factory; do not introduce a new export from `src/index.js`.
  - [ ] Do not call `resolveWorkflowPolicy` from `command.execute.before` itself in this story — Story 1.4 owns that. Story 1.3 only ensures the resolver is constructible and reachable from the hook layer for the next story.

- [ ] Expand regression coverage for merge precedence, validation fallback, and resolver contract (AC: 1, 2, 3, 4)
  - [ ] Extend `tests/regression.test.js` to add a `verifyConfigMergePrecedence()` step that creates a temp workspace with both global and project JSONC files (write the global file under a sandboxed home dir using a stub `homedir` adapter, or read directly via the FS adapter for the project layer) and asserts that project values override global values, and that legacy files are read when no modern project file exists.
  - [ ] Add a `verifyValidationFallback()` step that supplies an intentionally invalid project config (e.g., `branch.longLivedBranches: 42`), runs `loadRuntimeConfig`, and asserts: (a) returned `config` equals the validated lower layer, (b) `validation.droppedLayers` includes `"projectConfig"`, (c) `validation.errors` is non-empty.
  - [ ] Add a `verifyResolveWorkflowPolicy()` step that imports `resolveWorkflowPolicy` and asserts three cases: matched command (`bmad-bmm-dev-story` → `outcome: "allow"`, policy keys present), unmatched command (`bmad-bmm-something-new` → `outcome: "ask"`, fallback policy shape), and null context (`outcome: "skip"`).
  - [ ] Audit-payload assertion: confirm the wrapper's audit log includes a `config.validation.failed` entry with `event`, `timestamp`, and `details` keys when an invalid layer is provided; do not assert exact timestamp values.
  - [ ] Preserve all existing legacy-parity assertions; the new tests must not regress the deepEqual `normalizeOutputParts` checks established in Stories 1.1 and 1.2.

- [ ] Verify build and runtime contract (AC: 1, 2, 3, 4)
  - [ ] Run `npm install` once (Ajv 8.17.1 added) and confirm the lockfile updates cleanly.
  - [ ] Run `npm run build && npm test` from a clean checkout; both must pass and the bundled `dist/devai-aidd-guard.js` must include the new validator and resolver modules (esbuild picks them up automatically once imported from `src/index.js`).
  - [ ] Manually inspect the generated bundle once to confirm Ajv is bundled (no runtime require of an external dep at plugin load); record the verification in `Completion Notes List`.

## Dev Notes

### Story Intent

Story 1.3은 Epic 1의 정책 백본이다. Story 1.1은 부트스트랩과 훅 등록을, Story 1.2는 워크플로우 컨텍스트 식별을 책임지며, Story 1.3은 그 컨텍스트를 어떤 정책으로 해석할지 결정하는 단일 진실 공급원을 만든다. Story 1.4(브랜치 전략 계산)와 Story 1.5(저장소 준비도) 그리고 Epic 2의 승인 흐름은 모두 Story 1.3이 만든 `runtimeConfig` + `resolveWorkflowPolicy` 결과를 입력으로 소비한다.

이 스토리는 의도적으로 read-only다. 호환 브리지 파일 생성(`ensureLegacyProjectConfigCompatibility`)은 `sprint-change-proposal-2026-05-08.md`에 따라 Story 4.2로 이전됐다. Story 1.3은 그 함수의 동작을 변경하지 않는다 — 단지 그 함수가 의존하는 `runtimeConfig` 산출물을 더 결정적이고 검증된 형태로 만든다.

브랜치 네이밍 패턴 평가, 후보 브랜치 이름 생성, 저장소 상태 점검, 사용자 승인 프롬프트는 모두 이 스토리의 범위 외다. 정책 결과는 항상 `{outcome, reason, message, details}` 표준 봉투에 담겨야 하며, 호출자는 이 봉투만 보고 다음 단계를 결정할 수 있어야 한다.

### Verified Baseline Findings

- 현재 `src/config/load-config.js:120-147` `loadRuntimeConfig`는 글로벌·프로젝트·레거시 두 종을 단순 병합하지만, 우선순위가 코드 흐름 안에 암묵적으로 묻혀 있다(`projectConfig || legacyWorkflowProjectConfig || legacyProjectConfig` short-circuit). Ajv 검증이나 결정적 layer drop 매커니즘은 없다.
- `src/config/load-config.js:34-60` `mergeObjects`는 deep-merge를 수행하며 배열은 override가 통째로 대체한다. 이 의미를 새 파이프라인에서 보존해야 한다 — 특히 `branch.longLivedBranches`와 `branch.commandTypeMap`이 그렇다.
- `src/config/defaults.js:1-139`에 이미 `branch`(pattern/defaultType/fallbackTicket/longLivedBranches/defaultMergeTarget/validationRegex/commandTypeMap)와 `workflowPolicy`(13개 BMAD 명령에 대한 category/identityStrategy/branchRequired/finalization 매핑)가 정의돼 있다. 이 객체는 schema의 fixture가 되며, schema는 이 객체를 거부하지 않아야 한다(positive test).
- `src/utils/constants.js:5-15`는 글로벌(`.config/opencode/devai-aidd-guard.global.jsonc`), 프로젝트(`.opencode/devai-aidd-guard.project.jsonc`), 레거시(`opencode-aidd-plugin.json`, `devai-git-workflow.json`) 경로 상수를 정의한다. 이 상수들은 schema나 resolver가 직접 알 필요는 없지만, `loadRuntimeConfig`의 layer 식별자(`globalConfig`/`projectConfig`/`legacyProjectConfig`/`legacyWorkflowProjectConfig`)는 이 상수와 1:1 대응돼야 한다.
- `src/index.js:39-50`에서 `loadRuntimeConfig`의 결과를 `audit`에 그대로 전달하고 `ensureLegacyProjectConfigCompatibility`에 넘긴다. Story 1.3은 이 두 호출의 시그니처를 깨지 않아야 한다 — `validation` 필드는 추가만, 기존 `config`/`paths`/`sources`는 유지.
- `src/policies/legacy/devai-git-workflo.js`의 `states.set(input.sessionID, { commandName, lifecycle: "active" })`는 정책 정보를 알지 못한다. 즉 현재 베이스라인에는 "이 명령에 대해 어떤 finalization을 적용해야 하는가"를 묻는 코드 경로가 아예 없다. Story 1.3이 그 경로를 처음 만든다.
- `src/services/workflow/`는 Story 1.2가 처음 생성하므로, Story 1.3 시작 시점에는 `detect-workflow-context.js`와 `workflow-state.js`가 이미 존재한다고 가정한다. `resolve-workflow-policy.js`는 그 옆에 추가된다.
- `package.json`의 `dependencies`에는 현재 Ajv가 없다. 새 의존성을 추가하는 첫 스토리이므로 `npm install ajv@8.17.1 --save` 한 번만 실행하면 된다(런타임 의존, devDependency 아님 — 번들에 포함돼야 함).

### Technical Requirements

- ESM Node 22 런타임 계약을 유지한다. CommonJS·top-level dynamic require·새 빌드 단계 도입은 금지다.
- 영속 저장소를 도입하지 않는다. 설정은 파일에서 한 번 읽고 메모리 객체로만 유지한다(architecture "Data Architecture" 결정).
- 정책 결과는 항상 표준 봉투 `{outcome, reason, message, details}` 형식이며 `outcome`은 `"allow" | "deny" | "ask" | "skip"` 네 값 중 하나다(architecture "Format Patterns → API Response Formats").
- 이벤트 이름은 `dot.case`이며 구조화 필수 이벤트 목록에 포함된 `config.validation.failed`를 정확히 그대로 사용한다(architecture "Communication Patterns → Event System Patterns" 의 "구조화 필수 이벤트" 항목).
- `loadRuntimeConfig`는 throw하지 않는다. 검증 실패는 `validation` 필드로 표현하고, 호출자가 audit 경로로 이를 발산한다. 이는 부트스트랩이 잘못된 한 줄의 설정 때문에 전체 워크플로우를 중단시키지 않게 하기 위한 NFR7/NFR8 요구다.
- `resolveWorkflowPolicy`는 순수 함수다. 인자만 보고 결정하며 외부 상태를 읽지 않는다. 시간이 필요하면 호출자가 timestamp를 details에 직접 주입한다.
- 새 의존성은 Ajv 단 하나(8.17.1). 추가 라이브러리(`ajv-formats`, `ajv-errors`, `lodash` 등)는 명시적으로 범위 외다.

### Architecture Compliance

- 폴더 배치:
  - `src/config/schema/runtime-config.schema.json` — 설정 계약 단일 진실 공급원.
  - `src/config/validate-config.js` — Ajv 컴파일과 검증 함수.
  - `src/services/workflow/resolve-workflow-policy.js` — Story 1.2가 만든 `src/services/workflow/` 디렉터리 안에 위치. 정책 해석 로직은 `src/policies/legacy/`에도 `src/hooks/`에도 두지 않는다(architecture "Project Structure & Boundaries → File Structure Patterns").
- 네이밍: 파일은 `kebab-case.js`, 함수는 `camelCase`, 상수는 `SCREAMING_SNAKE_CASE`. 정책 결과 outcome 문자열은 정확히 `allow`/`deny`/`ask`/`skip`만 사용하며 `allowed`·`approved`·`permit` 같은 변형은 anti-pattern이다(architecture "Anti-Patterns").
- Ajv 라이브러리 선택은 architecture "Important Decisions → 설정 검증은 JSON Schema + Ajv 8.17.1을 사용한다" 결정의 직접 인용이다.
- `config.validation.failed` 이벤트 페이로드는 표준 envelope `{event, timestamp, workflow, command, outcome, details}`를 따른다(architecture "Communication Patterns"). 이 이벤트는 workflow나 command가 아직 결정되지 않은 시점에 발생하므로 `workflow: null`, `command: null`이 정상이다.
- 정책 결과 객체 형식은 architecture "Format Patterns → API Response Formats"에 명시된 그대로다:

  ```js
  {
    outcome: "allow" | "deny" | "ask" | "skip",
    reason: "short-machine-code",
    message: "human readable message",
    details: {}
  }
  ```

- 패턴 시행 규칙(architecture "Enforcement Guidelines → All AI Agents MUST"): 새 설정 키, 정책 결과, 이벤트 타입을 추가할 때 schema와 테스트를 함께 갱신한다 — 본 스토리는 schema·resolver·테스트를 한 번에 추가하므로 이 규칙을 만족한다.

### Library / Framework Requirements

- Ajv 8.17.1을 런타임 의존성으로 추가한다(`package.json` `dependencies`, `devDependencies` 아님). 버전은 architecture "Important Decisions" 섹션의 명시 결정과 일치해야 한다(`_bmad-output/planning-artifacts/architecture.md` "Important Decisions → 설정 검증은 JSON Schema + Ajv 8.17.1을 사용한다").
- Ajv는 esbuild가 자동으로 번들에 인라인한다. `scripts/build.js`를 수정할 필요는 없으며, 외부 require가 남지 않는지 빌드 후 한 번 검증한다.
- 추가 Ajv 플러그인(`ajv-formats`, `ajv-errors`)은 도입하지 않는다. 표준 JSON Schema Draft 2020-12로 충분히 표현 가능한 제약만 사용한다(필요시 `pattern` regex와 `enum`만으로 표현).
- 새 빌드/테스트 도구를 추가하지 않는다. 기존 `npm test`(Node 내장 `assert/strict`)와 `npm run build`(esbuild) 계약을 그대로 유지한다.
- 공식 Ajv 문서 참조: <https://ajv.js.org/json-schema.html>, <https://ajv.js.org/api.html>. 8.x는 Draft 2020-12를 명시적으로 지원하므로 `$schema: "https://json-schema.org/draft/2020-12/schema"`를 schema 파일 최상단에 명시한다.

### File Structure Requirements

- 신규 파일:
  - `src/config/schema/runtime-config.schema.json`
  - `src/config/validate-config.js`
  - `src/services/workflow/resolve-workflow-policy.js`
- 수정 파일:
  - `src/config/load-config.js` — `loadRuntimeConfig`의 내부를 결정적 layer 파이프라인으로 리팩터, 반환 객체에 `validation` 필드 추가. `ensureLegacyProjectConfigCompatibility`와 `loadWorkflowCommands`는 건드리지 않는다.
  - `src/index.js` — `runtimeConfig.validation`을 검사해 `config.validation.failed` audit 이벤트를 발산하고, `resolveWorkflowPolicy` 참조를 hook factory로 전달하는 `pluginContext`(또는 동등한 주입 메커니즘)를 추가한다.
  - `package.json` — `dependencies`에 `"ajv": "8.17.1"` 추가.
  - `package-lock.json` — `npm install` 결과로 자동 갱신.
  - `tests/regression.test.js` — 병합 우선순위, 검증 폴백, 정책 resolver 세 가지 신규 검증 단계를 추가.
- 생성 금지 파일/폴더:
  - `src/config/migrations/` — 설정 마이그레이션은 본 스토리의 책임이 아니다. architecture에 미래 위치로 명시돼 있을 뿐이다.
  - `src/services/compat/` — 호환 브리지는 Story 4.2의 영역이다.
  - `src/events/`, `src/commands/` — 이후 스토리에서 도입한다. 빈 placeholder 폴더를 만들지 않는다.
  - 새 templates/ 파일 — 샘플 설정 작성은 Story 4.1 또는 별도 문서 작업이다.

### Testing Requirements

- 필수 검증 명령: `npm install` 1회(Ajv 추가), 그 다음 `npm run build && npm test`. 둘 다 clean checkout에서 통과해야 한다(Story 1.1·1.2가 확립한 build/test 계약).
- 회귀 추가 항목(모두 `tests/regression.test.js`에 인라인):
  - `verifyConfigMergePrecedence()`: 글로벌·프로젝트 두 layer가 동시에 있을 때 프로젝트 값이 글로벌 값을 덮어쓰는지, 그리고 프로젝트 파일이 없을 때 레거시 파일이 읽히는지 검증.
  - `verifyValidationFallback()`: 의도적으로 잘못된 `branch.longLivedBranches: 42` 같은 값을 프로젝트 파일에 넣고, `validation.droppedLayers`에 `"projectConfig"`가 포함되며 효과적인 `config`는 다음 layer 값을 사용하는지 확인.
  - `verifyResolveWorkflowPolicy()`: matched/unmatched/null 세 가지 입력에 대해 정책 결과 봉투 형식과 `outcome` 값을 검증.
  - audit-payload shape 확인: `config.validation.failed` 엔트리에 `event`, `timestamp`, `details.droppedLayers`, `details.errors` 키가 모두 존재함을 단언. 정확한 timestamp나 Ajv 메시지 문자열 비교는 비결정성 회피를 위해 피한다.
- 기존 단언 보존: `normalizeOutputParts` deepEqual, mutating-tool error 메시지 일치, `verifyMissingLegacyBootstrapDependencyFails`, `verifyBootstrapFailureShape` 모두 그대로 통과해야 한다.
- `tests/contracts/` 또는 `tests/integration/` 폴더는 Story 1.3에서 만들지 않는다(Story 1.2와 동일 결정). 계약 테스트의 정식 위치 도입은 Epic 4 또는 별도 인프라 작업이다.

### Previous Story Intelligence

- Story 1.1(`_bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md`)은 부트스트랩 무결성과 wrapper-우선·legacy-보존 원칙을 확립했다. Story 1.3은 wrapper 측 `src/index.js`만 수정하고 `src/policies/legacy/devai-git-workflo.js`는 건드리지 않는다. 레거시 코어가 자체 `states` Map을 유지하는 것은 회귀 parity를 위해서다.
- Story 1.2(`_bmad-output/implementation-artifacts/1-2-detect-bmad-workflow-commands-and-runtime-context.md`)는 `src/services/workflow/` 디렉터리를 처음 만들고 `detect-workflow-context.js`·`workflow-state.js`를 도입했다. Story 1.3의 `resolve-workflow-policy.js`는 같은 디렉터리에 추가되며, Story 1.2가 정의한 workflow context 객체 형태(`commandName`, `normalizedCommand`, `arguments`, `sessionID`, `detectedAt`, `phase`)를 입력으로 받는다.
- Story 1.2가 `audit.info`로 `workflow.detected`를 emit하는 패턴을 확립했다. Story 1.3은 동일한 audit 채널로 `config.validation.failed`를 emit한다 — 새 logger를 도입하지 않는다.
- Story 1.1·1.2 모두 `tests/regression.test.js`를 단일 회귀 진입점으로 유지했다. Story 1.3도 동일 패턴을 따른다.
- Story 1.1의 sprint-change-proposal(`sprint-change-proposal-2026-05-08.md`)은 호환 브리지 파일 생성 책임을 Story 4.2로 이전했다. Story 1.3의 `loadRuntimeConfig` 리팩터는 이 결정을 존중한다 — 기존 `ensureLegacyProjectConfigCompatibility`의 시그니처와 호출 시점을 변경하지 않는다.

### Git Intelligence Summary

- 최근 5개 커밋(`dfaf0d9` 스프린트 플래닝 머지, `576fa74` 스프린트 상태 생성, `110a0ac` 에픽/스토리 머지, `e2bf242` 에픽·readiness 작성, `3e4a1d9` 아키텍처 머지)은 모두 plan 산출물 변경이다. Story 1.1·1.2 구현 변경 외에 src/ 트리 변경은 없다.
- 따라서 권위 있는 시작점은 현재 `src/` 트리(특히 Story 1.2 완료 상태의 `src/services/workflow/`)와 `tests/regression.test.js`다. 외부 참조 코드를 베껴오기보다 현재 베이스라인을 정확히 읽고 확장한다.
- 현재 작업 브랜치는 `codex/bmad/epic1/story1-1`이다. 새 브랜치 분기 여부는 운영자와 협의한다 — 브랜치 자동화 자체는 Epic 1/2의 후속 스토리 영역이며 본 스토리에서 직접 결정하지 않는다.

### Project Structure Notes

- Story 4.2와의 경계: Story 1.3은 read-only resolver다. `ensureLegacyProjectConfigCompatibility`가 작성하는 호환 브리지 파일(`opencode-aidd-plugin.json`, `devai-git-workflow.json`, `.devai-aidd-guard.compat.generated`)의 생성·삭제·갱신 정책 변경은 모두 Story 4.2가 소유한다(`sprint-change-proposal-2026-05-08.md` Proposal C). Story 1.3에서는 해당 함수를 호출만 하며 동작은 변경하지 않는다.
- Story 1.4·1.5와의 경계: 브랜치 후보명 생성, 브랜치 필요/선택 판정, 저장소 readiness 점검은 모두 Story 1.4·1.5의 범위다. `resolveWorkflowPolicy` 결과의 `details.branch.pattern`·`details.branch.commandType`는 그 다음 스토리들이 입력으로 사용할 raw material만 노출하며, 실제 브랜치명을 만들거나 long-lived branch 검사를 수행하지 않는다.
- Epic 2와의 경계: 정책 결과의 `outcome`이 `"ask"`인 경우에도 본 스토리는 사용자 프롬프트를 띄우지 않는다. Approval prompt 발행은 Epic 2(특히 Story 2.1·2.2)의 책임이다.
- Architecture가 그리는 풍부한 구조(`src/events/`, `src/commands/`, `tests/contracts/`, `tests/integration/`)는 점진적으로 도입한다. Story 1.3에서는 `src/config/schema/`, `src/config/validate-config.js`, `src/services/workflow/resolve-workflow-policy.js` 세 곳만 추가한다.

### References

- 에픽·스토리 정의: [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3: Load Merged Configuration and Resolve Workflow Policy]
- 기능·비기능 요구: [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements] (FR2, FR14, FR15, FR16, FR17, FR18; NFR4, NFR5, NFR7, NFR8, NFR13)
- 아키텍처 데이터 결정·라이브러리 결정: [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture], [Source: _bmad-output/planning-artifacts/architecture.md#Decision Priority Analysis] (Important Decisions → Ajv 8.17.1)
- 폴더 구조와 경계: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- 패턴·네이밍·이벤트 계약: [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules], [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- 스프린트 변경 경계(브리지 파일 → Story 4.2): [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md]
- 직전 스토리 패턴: [Source: _bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md], [Source: _bmad-output/implementation-artifacts/1-2-detect-bmad-workflow-commands-and-runtime-context.md]
- 베이스라인 코드: [Source: src/index.js], [Source: src/config/load-config.js], [Source: src/config/defaults.js], [Source: src/utils/constants.js], [Source: src/policies/legacy/devai-git-workflo.js]
- 회귀 베이스라인: [Source: tests/regression.test.js]
- 외부 라이브러리 문서: [Ajv JSON Schema docs](https://ajv.js.org/json-schema.html), [Ajv API docs](https://ajv.js.org/api.html), [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
