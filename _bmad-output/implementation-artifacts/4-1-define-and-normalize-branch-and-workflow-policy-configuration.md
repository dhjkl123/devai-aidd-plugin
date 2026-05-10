# Story 4.1: 브랜치 및 워크플로우 정책 구성의 정의와 정규화

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

팀 관리자로서,
브랜치 규칙과 워크플로우 정책을 구성 파일로 정의하고 싶다,
그래서 플러그인 소스 코드를 수정하지 않고 자동화 동작을 변경할 수 있다.

## Acceptance Criteria

1. **주어진 조건** 팀이 글로벌 또는 프로젝트 수준 구성 파일을 제공하는 경우
   **동작 시점** 플러그인이 구성을 로드하고 정규화하면
   **기대 결과** 브랜치 명명 패턴, 명령 타입 매핑, 머지 대상, 워크플로우 정책이 일관된 effective 포맷으로 사용 가능해야 한다
   **그리고** 잘못되었거나 누락된 옵션 값은 지원 가능한 범위에서 안전한 기본값으로 폴백해야 한다.
2. **주어진 조건** 워크플로우 정책 구성이 시간이 지남에 따라 변경되는 경우
   **동작 시점** 플러그인이 effective 구성을 해석하면
   **기대 결과** 활성 정책은 가장 최신의 적용 가능한 프로젝트 또는 글로벌 설정을 반영해야 한다
   **그리고** 결과 동작은 실행 간에 결정적으로 유지되어야 한다.

## Tasks / Subtasks

- [x] 효과적 구성(effective configuration)의 단일 정규화 계약을 `src/config/` 안에 통합한다 (AC: 1)
  - [x] `src/config/load-config.js`의 `normalizeConfig`가 현재 처리하는 범위(`branch.longLivedBranches` dedupe/lowercase, `branch.defaultMergeTarget` trim)를 기준선으로 두고, Story 4.1에서 누락된 `branch.pattern`/`branch.defaultType`/`branch.fallbackTicket`/`branch.validationRegex`/`branch.commandTypeMap` 안전 기본값 폴백을 같은 위치에 모아 단일 패스로 실행한다.
  - [x] `src/services/git/branch-service.js`의 `normalizeBranchConfig`(파일 1번 줄 ~ 15번 줄)는 Story 4.1 이후 “이미 정규화된 effective 구성”을 받는 얇은 통과 함수로 축소하거나 제거 대상으로 표시한다. `normalizeBranchConfig`를 새로 다른 호출자에게 노출하지 않는다.
  - [x] `src/services/workflow/resolve-workflow-policy.js`의 `branchDetails` 구성(38번 줄 이후)도 effective config가 이미 정규화돼 있다는 전제로 단순화하되, 외부 동작(`outcome`/`reason`/`message`/`details` envelope, fallback policy shape)은 변경하지 않는다.
  - [x] DEFAULT_PLUGIN_CONFIG와 templates/devai-aidd-guard.global.jsonc, templates/devai-aidd-guard.project.jsonc, templates/legacy-opencode-aidd-plugin.json은 모두 “정규화 후 동일한 effective 결과”를 만들 수 있어야 하며, Story 4.1은 이 정합성을 회귀 테스트로 고정한다.

- [x] 브랜치 및 워크플로우 정책 스키마를 정책 어휘 수준으로 강화한다 (AC: 1)
  - [x] `src/config/schema/runtime-config.schema.json`과 `src/config/validate-config.js`의 인라인 `RUNTIME_CONFIG_SCHEMA`를 동기 상태로 유지하며, `workflowPolicy[*].category`, `workflowPolicy[*].identityStrategy`, `workflowPolicy[*].finalization`에 enum 또는 명시적 허용 어휘를 추가한다. 어휘 후보는 `src/config/defaults.js`의 실제 사용값(`implementation`/`planning`/`research`/`docs`/`review`, `story`/`ticket-or-args`/`artifact-singleton`/`artifact-or-args`, `commit-and-push`/`commit-optional-push`/`no-forced-finalization`)과 `_bmad-output/planning-artifacts/architecture.md`의 “Format Patterns” 섹션을 기준으로 확정한다.
  - [x] Story 1.3가 도입한 `additionalProperties: true`(forward-compat) 결정과 충돌하지 않도록, 어휘 강화는 enum이 아니라 “알려진 값이면 권장, 알려지지 않은 값은 audit warning + 안전 기본 적용”으로 표현 가능한지 우선 검토한다. 강한 enum이 더 안전하다고 판단되면, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md` 패턴을 따라 결정 메모를 Story 4.1 Dev Notes에 인라인으로 남긴다.
  - [x] `branch.commandTypeMap` 값에 대해서는 “문자열이지만 사실상 `branch.defaultType`이 받아들이는 type 슬러그여야 한다”는 현재 묵시 계약을 명문화하되, 신규 어휘 추가를 막지 않도록 forward-compat 정책을 유지한다.
  - [x] schema와 인라인 `RUNTIME_CONFIG_SCHEMA` 두 사본이 차이가 생기지 않도록 회귀 테스트에서 동일 객체임을 직접 비교한다 (1.3 Round 2 LOW에서 의도적으로 수용된 sync 의무).

- [x] effective 구성을 downstream 소비자가 단일 진실 공급원으로 받도록 정리한다 (AC: 1, 2)
  - [x] `src/index.js`가 hook factory에 전달하는 `pluginContext`(Story 1.3 second-pass에서 6개 hook factory에 일관 전달됨)에 effective `runtimeConfig.config`만 노출하고, hook 또는 service 계층에서 `branch`/`workflowPolicy`를 다시 조립하지 않도록 보장한다.
  - [x] `src/services/workflow/resolve-workflow-policy.js`는 호출 시점마다 새 nested object를 생성한다는 invariant(Story 1.3 Dev Notes)를 유지하고, 재실행 시 이전 결과가 캐시되거나 mutation으로 누설되지 않는지 확인한다.
  - [x] 변경 시 `src/services/git/branch-service.js`, `src/services/workflow/detect-finalizable-outputs.js`, `src/services/workflow/evaluate-workflow-finalization.js`, `src/services/approval/publish-next-planned-action.js`, `src/services/approval/build-approval-explanation.js`의 정책/브랜치 사용 경로가 모두 동일한 effective 구성에서 비롯된다는 사실을 코드 주석 또는 Dev Notes에 명문화한다.

- [x] FR18 “팀별 정책 조정”을 코드 변경 없이 실현 가능하다는 점을 templates와 README에서 명시한다 (AC: 1)
  - [x] `templates/devai-aidd-guard.global.jsonc`와 `templates/devai-aidd-guard.project.jsonc`에 “팀이 자주 바꾸는 키” 주석 가이드를 추가한다(예: `branch.defaultMergeTarget`, `branch.commandTypeMap`, `workflowPolicy.<command>.branchRequired`/`finalization`).
  - [x] `README.md`의 설정 섹션(현재 65~66번 줄 근방의 글로벌/프로젝트 경로 안내)에 “브랜치 규칙과 워크플로우 정책은 코드 수정 없이 jsonc 파일로 변경할 수 있다”는 흐름 예시를 추가한다.
  - [x] 새 템플릿 파일을 만들지 않는다. 기존 두 jsonc 템플릿과 `templates/legacy-opencode-aidd-plugin.json`을 갱신만 한다.

- [x] effective 구성과 결정성에 대한 회귀 테스트를 `tests/regression.test.js`에 인라인으로 추가한다 (AC: 1, 2)
  - [x] `verifyEffectiveConfigNormalizationContract()` — DEFAULT_PLUGIN_CONFIG, templates/devai-aidd-guard.global.jsonc, templates/devai-aidd-guard.project.jsonc, templates/legacy-opencode-aidd-plugin.json 각각을 `loadRuntimeConfig`(또는 같은 정규화 경로)로 통과시켰을 때, `branch.pattern`/`branch.defaultType`/`branch.fallbackTicket`/`branch.longLivedBranches`/`branch.defaultMergeTarget`/`branch.validationRegex`/`branch.commandTypeMap` 키가 모두 정의돼 있고 타입이 일관됨을 검증한다.
  - [x] `verifyMissingOptionalValuesFallback()` — 옵션 키가 누락된 프로젝트 jsonc 입력에서도 `branch.fallbackTicket`, `branch.defaultType`, `branch.longLivedBranches` 같은 안전 기본값이 effective config에 채워지는지 검증한다. Story 1.3의 `verifyValidationFallback`/`verifyValidationFallbackLowerLayer`는 “invalid 값” 시나리오를 다루므로, 본 테스트는 “missing optional” 시나리오로 의미를 분리한다.
  - [x] `verifyWorkflowPolicyVocabularySchema()` — schema가 강화된 어휘 또는 forward-compat 정책에 따라 정상 어휘는 통과하고, 분명한 오타(예: `finalization: "commit-and-pus"`) 또는 잘못된 카테고리(예: `category: "implemenation"`)에 대해 audit/warning 또는 schema error가 일관되게 surface되는지 검증한다.
  - [x] `verifyEffectivePolicyDeterminism()` — 동일한 입력 layer에서 `loadRuntimeConfig` + `resolveWorkflowPolicy`를 두 번 호출했을 때 결과가 deepEqual 동일하고, mutation을 통해 cross-call leak이 없음을 검증한다(Story 1.3가 보장한 “재호출 시 fresh nested object” invariant 회귀).
  - [x] `verifyLatestPolicyChangesReflectedAcrossRuns()` — 동일 프로세스 내에서 프로젝트 jsonc 내용을 변경한 뒤 `loadRuntimeConfig`를 다시 호출하면, `resolveWorkflowPolicy`가 새 값을 반환함을 확인한다(AC2의 “활성 정책은 최신 적용 가능한 설정을 반영”). 영속 캐시가 도입되지 않았다는 사실 자체도 함께 단언한다.
  - [x] 기존 회귀 테스트(`verifyConfigMergePrecedence`, `verifyValidationFallback`, `verifyValidationFallbackLowerLayer`, `verifyParseFailureSurfacing`, `verifyForwardCompatExtensionKeys`, `verifySchemaVersionEnforcement`, `verifyResolveWorkflowPolicy`, `verifyConfigValidationFailedAuditPayload`)가 변경 없이 그대로 통과해야 한다.

- [x] Story 4.2 경계와의 충돌을 명시한다 (AC: 1, 2)
  - [x] 본 스토리는 “효과적 구성 정규화” 책임이며, 레거시 브리지 파일 생성/삭제(`ensureLegacyProjectConfigCompatibility`)와 `LEGACY_COMPAT_MARKER_FILE_NAME` 관리는 Story 4.2의 영역이다(`_bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md` Proposal C). Story 4.1에서는 이 함수의 시그니처와 호출 시점을 변경하지 않는다.
  - [x] 본 스토리는 호환성 경로(`legacyProjectConfig`, `legacyWorkflowProjectConfig`) 자체는 그대로 두고, 정규화 결과만 통합한다. 레거시 포맷 차이는 Story 4.2에서 다룬다.

## Dev Notes

### Epic 4 전체 맥락과 본 스토리의 위치

- Epic 4는 정책 관리·레거시 호환·배포·회귀 운영이라는 “관리자/운영자 측 백본”이다. Story 4.1은 그 첫 스토리로, 코드 수정 없이 동작을 바꿀 수 있는 단일 진실 공급원(effective configuration)을 명문화한다.
- Story 4.2는 본 스토리가 만든 effective 구성을 전제로 “레거시 브리지 파일 생성·정합성”을 책임진다. Story 4.3은 wrapper가 effective 구성을 무시하지 않는다는 호환성 경계를 검증한다. Story 4.4·4.5는 이 모든 결정이 빌드/릴리스/회귀에서 깨지지 않는다는 운영 보증을 다룬다.
- 따라서 Story 4.1은 신규 자동화 로직을 추가하는 스토리가 아니다. Epic 1·2·3에서 이미 작동 중인 effective 구성 사용 흐름을 “단일 정규화 + 단일 어휘 + 단일 효과”로 봉합하고, 회귀 테스트로 그 계약을 명문화하는 스토리다.

### Story 1.3과의 명시적 경계

- FR16(글로벌/프로젝트 결정적 우선순위)은 Story 1.3에서 이미 “정확히 1회 검증” + “upper layer 보존” 알고리즘으로 구현되었다(`src/config/load-config.js#validateAndRecover`, lines 210~244). Story 4.1은 이 알고리즘을 재설계하지 않는다.
- Story 1.3 Round 2 결정으로 schema 이중 정의(JSON 파일 + JS 인라인)는 “번들 호환성 사유로 의도된 LOW”로 수용됐다. Story 4.1에서 어휘를 강화할 때도 두 사본의 sync 의무는 유지하되, 통합하지 않는다.
- Story 1.3은 `RUNTIME_CONFIG_SCHEMA_VERSION = 1`을 schema에 `const`로 강제했다. Story 4.1에서 어휘 강화 또는 정규화 변경이 필요해지면 schemaVersion 미증가 정책을 유지(forward-compat 추가만)할지, 또는 schemaVersion bump이 필요한지 Dev Notes에 결정 메모를 남긴다.
- Story 1.3의 `validation` 필드(`valid`, `recovered`, `droppedLayers`, `errors`) 시그니처는 그대로 유지한다. 본 스토리는 이 필드를 추가 확장하지 않으며, 어휘 위반 surface가 필요하다면 기존 errors 배열의 `params.layer` + `params.source` 컨벤션을 재사용한다.

### 현재 코드베이스에서 확인된 기반

- `src/config/defaults.js`(140줄)는 13개 BMAD 명령에 대한 `workflowPolicy` 매핑과 `branch.commandTypeMap`을 이미 보유하고 있다. Story 4.1의 어휘 강화는 이 객체가 그대로 통과한다는 “positive test” 의무를 만든다.
- `src/config/load-config.js#normalizeConfig`(88~104줄)는 현재 `branch.longLivedBranches` dedupe/lowercase와 `branch.defaultMergeTarget` trim만 수행한다. Story 4.1은 이 함수를 “effective 구성 단일 정규화 진입점”으로 확장한다.
- `src/services/git/branch-service.js#normalizeBranchConfig`(1~15줄)는 effective 구성을 받았어야 할 다운스트림에서 다시 한 번 “fallback 채우기”를 수행한다. 이 중복은 Story 4.1의 “consistent effective format” AC를 직접 위협한다.
- `src/services/workflow/resolve-workflow-policy.js`의 `branchDetails`(54~69줄)는 또다시 `branch.defaultType || "chore"`, `branch.pattern || "{type}/{ticket}-{slug}"` 같은 필드별 fallback을 수행한다. 같은 이유로 본 스토리에서 정규화 진입점으로 흡수해야 한다.
- `src/index.js`는 `runtimeConfig.config`를 audit logger와 hook factory에 전달한다(44~53줄, Story 1.3 second-pass에서 6개 hook factory 일관 전달 보장됨). Story 4.1은 이 전달 경로를 변경하지 않으며, 단지 “전달되는 객체가 이미 fully-normalized effective 구성”이라는 사실을 회귀로 고정한다.
- `templates/devai-aidd-guard.global.jsonc`와 `templates/devai-aidd-guard.project.jsonc`는 현재 BMAD 명령 어휘와 정확히 같은 슬러그를 사용하지만, 사용자가 어떤 키를 자주 바꿔야 하는지에 대한 가이드가 부족하다. FR18 충족을 위해 이 파일들의 주석을 보강한다.

### Epic 1·2·3 회고에서 가져와야 할 학습

- Epic 1 회고(`_bmad-output/implementation-artifacts/epic-1-retro-2026-05-09.md`)
  - “스키마 우선 설정”과 “best-effort audit baked in early”는 본 스토리의 어휘 강화 + audit warning 결정의 직접 근거다.
  - Story 1.3 review depth가 “contract을 소유하는 스토리는 review 비중을 코드 크기가 아니라 blast radius에 비례시킨다”는 교훈을 남겼다. Story 4.1도 contract 스토리이므로 round-2/round-3 리뷰가 필요할 수 있다는 점을 미리 인지한다.
  - “sprint-change-proposal-YYYY-MM-DD.md는 일회성 메모가 아니라 정식 산출물이다”는 결론은, 본 스토리가 schema 어휘 강화와 forward-compat 사이에서 결정을 내릴 때 동일 패턴을 따라야 함을 의미한다.
- Epic 2 회고(`_bmad-output/implementation-artifacts/epic-2-retro-2026-05-09.md`)
  - “이벤트가 state lookup을 통해 emit될 때 attribution은 state 객체에서 가져온다”는 Round 2 HIGH 교훈은, 본 스토리에서 `resolveWorkflowPolicy`가 호출자 컨텍스트가 아니라 `runtimeConfig`(state)에서 모든 fallback을 가져와야 한다는 의미와 같은 결의 결정이다.
  - “Hook은 얇게, 정책 결정은 service에서”라는 invariant가 Epic 2에서 부하를 견뎠다는 사실은, Story 4.1이 새로운 정규화 책임을 hook으로 흘려 보내지 말아야 한다는 결론으로 이어진다. 정규화는 `src/config/`에 머물러야 한다.
- Epic 3 진행 중 학습(현재 시점 Story 3.5 review 단계)
  - Story 3.5는 “표준 Git 도구만으로 추적 가능해야 한다”는 결정을 통해 “전용 메타데이터를 강제하지 않는다”를 명문화했다. Story 4.1에서도 정책 어휘 강화가 “팀이 jsonc 한 줄로 바꿀 수 있는 표면”을 좁혀서는 안 된다는 결의를 같이 가져간다.

### 구현 가드레일

- 새로운 영속 저장소를 도입하지 않는다(architecture “Data Architecture” 결정). 정책 변경 반영은 “파일에서 다시 읽는다”는 모델로 충분해야 한다.
- 새 audit event type을 만들지 않는다. 어휘 위반 surface가 필요하면 기존 `config.validation.failed`의 `details.errors[].params`에 `source: "vocabulary"` 또는 동등한 태그를 추가한다.
- 새 approval type, 새 hook 진입점, 새 dependency를 도입하지 않는다. Story 4.1은 “이미 있는 것을 정합”하는 스토리다.
- `outcome` 어휘는 정확히 `allow`/`deny`/`ask`/`skip` 네 값만 사용한다(architecture “Anti-Patterns”).
- 호환 브리지 파일 생성/삭제 정책은 Story 4.2의 영역이며, 본 스토리에서 `ensureLegacyProjectConfigCompatibility`의 동작을 변경하지 않는다.
- `npm install`은 새 dependency가 필요 없다(Ajv 8.17.1은 Story 1.3에서 이미 추가됨). 본 스토리에서 package.json/dependencies 변경이 발생하면 root cause를 재검토한다.
- `_bmad-output/`는 제품 요구사항상 추적 대상이며, 본 스토리에서 산출물 추적 범위를 변경하지 않는다(Story 3.5 invariant 보존).

### 구현 파일 후보

- 기존 파일 확장 우선
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\load-config.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\defaults.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\validate-config.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\schema\runtime-config.schema.json`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\resolve-workflow-policy.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\branch-service.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\templates\devai-aidd-guard.global.jsonc`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\templates\devai-aidd-guard.project.jsonc`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\templates\legacy-opencode-aidd-plugin.json`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md`
- 새 파일이 필요하다면 `src/config/` 안에만 추가
  - 예: `src/config/normalize-runtime-config.js`(현재 `load-config.js#normalizeConfig`가 거대해질 경우의 분리 후보)
- 피해야 할 위치
  - `src/hooks/` 내부의 정책 어휘 정규화 코드
  - `src/services/git/`의 자체 fallback 로직(Story 4.1 이후에는 effective 구성을 받기만 한다)
  - 새 `src/config/migrations/` 폴더(아키텍처 미래 위치이지만 본 스토리 범위 외)

### 테스트 포인트

- 동일 입력에 대한 effective 구성이 정규화 후 deepEqual 일관성을 유지해야 한다.
- 누락된 옵션 키는 안전 기본값으로 채워지고, 잘못된 값(타입 위반)은 Story 1.3 회복 경로(드롭 + audit)를 그대로 통과해야 한다.
- 정책 어휘(category/identityStrategy/finalization)는 알려진 값에 대해 schema/검증을 통과하고, 명백한 오타에 대해 audit warning 또는 schema error로 surface되어야 한다.
- `resolveWorkflowPolicy` 두 번 호출 시 fresh nested object를 반환해야 하며, 이전 결과 mutation이 다음 호출을 오염시키지 않는다.
- 동일 프로세스 내에서 프로젝트 jsonc를 변경하고 `loadRuntimeConfig`를 재호출하면 새 값이 반영되어야 한다.
- `npm run build && npm test` 모두 clean checkout에서 통과해야 하며, `dist/devai-aidd-guard.js`에 의도치 않은 새 dependency require가 남지 않아야 한다.

### 최근 커밋 패턴 인텔리전스

- 최근 5개 커밋(`d6f1e4a` epic3/stories merge, `1e5da76` Story 3.5 review round 1 follow-ups, `20941ce` Story 3.5 reviewer traceability via standard Git history, `22b843b` Story 3.4 review round 1 follow-ups, `51c2d7b` Story 3.4 audit traceability for finalization)는 모두 Epic 3 finalization·traceability 흐름이다. Story 4.1에 직접 영향을 주는 코드 변경은 없으나, “invariant은 코드 옆 주석으로 박는다”는 Story 3.5 패턴을 그대로 채용한다.
- 작업은 스토리 단위 브랜치에서 마무리한 뒤 epic 브랜치로 병합되는 흐름을 전제로 한다. Story 4.1도 “한 워크플로우 산출물의 귀속 가능한 커밋”을 우선해야 한다(Story 3.5 invariant).

### Latest Tech Information

- Ajv 8.17.1은 JSON Schema Draft 2020-12를 지원하고, `enum` + `additionalProperties: true` 조합으로 “알려진 값 권장 + 미래 어휘 허용”을 표현 가능하다(<https://ajv.js.org/json-schema.html>). 본 스토리에서 어휘 강화 시 ajv 자체 업데이트는 필요 없다.
- 새 라이브러리 도입 없음. `ajv-formats`, `ajv-errors`, `lodash` 등은 Story 1.3에서 명시적으로 범위 외로 결정됐고 Story 4.1도 이를 유지한다.
- Node.js ESM Node 22 런타임 계약 유지. esbuild 번들이 Ajv를 인라인 처리한다는 사실(번들 크기 약 294kb)은 변경되지 않는다.

### Project Structure Notes

- 현재 저장소는 brownfield다. `src/index.js` bootstrap, `src/config/*`, `src/services/workflow/*`, `src/services/git/*`, `tests/regression.test.js`를 중심으로 기존 패턴을 보존해야 한다.
- 아키텍처 문서는 `src/config/`(defaults, load, schema, validate, migrations)와 `src/services/workflow/`(detect, resolve, state) 분리를 요구한다(architecture “Project Structure & Boundaries”). Story 4.1 구현도 이 경계를 넘지 않는 것이 우선이다.
- `project-context.md`는 현재 저장소에서 발견되지 않았다. 따라서 본 스토리는 PRD, Epics, Architecture, README, 실제 소스/테스트, Epic 1·2 회고와 sprint-change-proposal-2026-05-08.md를 기준으로 컨텍스트를 정리했다.
- Story 1.3 회귀 자산(`verifyConfigMergePrecedence`, `verifyValidationFallback`, `verifyValidationFallbackLowerLayer`, `verifyParseFailureSurfacing`, `verifyForwardCompatExtensionKeys`, `verifySchemaVersionEnforcement`, `verifyResolveWorkflowPolicy`, `verifyConfigValidationFailedAuditPayload`)는 본 스토리가 추가하는 검증의 의미적 부모 집합이다. 새 검증은 “기존 검증의 빈틈”에 정확히 해당하는 위치에만 추가한다.

### References

- 에픽·스토리 정의: [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1: Define and Normalize Branch and Workflow Policy Configuration]
- 기능·비기능 요구: [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements] (FR14, FR15, FR16, FR18; NFR4, NFR5, NFR7, NFR8, NFR13)
- 아키텍처 데이터 결정·라이브러리 결정: [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture], [Source: _bmad-output/planning-artifacts/architecture.md#Decision Priority Analysis] (Important Decisions → Ajv 8.17.1, schemaVersion 통일)
- 폴더 구조와 경계: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- 패턴·네이밍·이벤트 계약: [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules], [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns], [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns]
- 스프린트 변경 경계(브리지 파일 → Story 4.2): [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md]
- 직전 contract 스토리: [Source: _bmad-output/implementation-artifacts/1-3-load-merged-configuration-and-resolve-workflow-policy.md]
- Epic 회고: [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-05-09.md], [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-05-09.md]
- 베이스라인 코드: [Source: src/index.js], [Source: src/config/load-config.js], [Source: src/config/defaults.js], [Source: src/config/validate-config.js], [Source: src/config/schema/runtime-config.schema.json], [Source: src/services/workflow/resolve-workflow-policy.js], [Source: src/services/git/branch-service.js]
- 템플릿 자산: [Source: templates/devai-aidd-guard.global.jsonc], [Source: templates/devai-aidd-guard.project.jsonc], [Source: templates/legacy-opencode-aidd-plugin.json]
- 회귀 베이스라인: [Source: tests/regression.test.js]
- 외부 라이브러리 문서: [Ajv JSON Schema docs](https://ajv.js.org/json-schema.html), [Ajv API docs](https://ajv.js.org/api.html), [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `npm run build` → exit 0; `dist/devai-aidd-guard.js` rebuilt at 456.4kb (no new dependency require introduced).
- `npm test` (full regression) → exit 0; all pre-existing Story 1.3 / 2.x / 3.x checks pass; 5 new Story 4.1 verifications pass on first run.

### Vocabulary Decision Memo (forward-compat over enum)

- The story Task 2 lists "schema enum 강화" and "audit warning + 안전 기본 적용" as two viable options for `workflowPolicy[*].category` / `identityStrategy` / `finalization` typo surfacing.
- We chose the **audit-warning** path. Story 1.3 deliberately accepted `additionalProperties: true` on `workflowPolicy[*]` so that an older host can still load a config produced for a newer plugin version. A strict `enum` would directly contradict that invariant: the moment a newer plugin shipped (e.g.) `category: "release"`, every older host would drop the layer and fall back to defaults. That regression is far more dangerous than a missed typo.
- Implementation:
  - `KNOWN_WORKFLOW_POLICY_VOCABULARY` (in `src/config/validate-config.js`) lists the recommended values.
  - `collectWorkflowPolicyVocabularyWarnings(config)` produces audit-warning entries shaped like the rest of the validation pipeline but tagged `params: { source: "vocabulary", kind: "warning" }`.
  - `loadRuntimeConfig` runs that collector AFTER `validateAndRecover`, so vocabulary warnings never cause a layer to be dropped.
  - `validation.valid` only flips to false on hard errors (parse + schema + regex semantics). Vocabulary warnings reach the audit channel through `src/index.js` (which now also triggers when `errors.length > 0`) without forcing a fake "validation failed" status.
  - JSON schema and inline `RUNTIME_CONFIG_SCHEMA` descriptions both call out "known vocabulary" + "forward-compat audit warning" so the contract is discoverable from the schema alone.

### Single-Source-of-Truth Notes

- Effective config normalization now happens in exactly one place: `normalizeConfig` inside `src/config/load-config.js`. All seven `branch.*` fields downstream consumers depend on (`pattern`, `defaultType`, `fallbackTicket`, `longLivedBranches`, `defaultMergeTarget`, `validationRegex`, `commandTypeMap`) are filled with safe defaults before the value reaches `runtimeConfig.config`.
- `src/services/git/branch-service.js#normalizeBranchConfig` is reduced to a defensive shallow shape (kept for direct test callers passing raw inputs). New callers MUST consume the already-normalized `runtimeConfig.config.branch` from `pluginContext`.
- `src/services/workflow/resolve-workflow-policy.js` no longer chains per-field `|| <default>` fallbacks. It still returns a fresh nested object on each call (Story 1.3 invariant), and `verifyEffectivePolicyDeterminism` regresses against any future cache/mutation leak.
- Downstream consumers (`detect-finalizable-outputs.js`, `evaluate-workflow-finalization.js`, `publish-next-planned-action.js`, `build-approval-explanation.js`) read `workflowPolicy` straight from the resolved policy object; they never re-derive defaults from `branch.*`. No code changes were needed there for Story 4.1, only the cross-reference annotation captured here so future contributors do not reintroduce per-call fallbacks.

### Story 4.2 Boundary

- `ensureLegacyProjectConfigCompatibility` and `LEGACY_COMPAT_MARKER_FILE_NAME` are **untouched**. Story 4.1 only changed how `loadRuntimeConfig` populates `validation.errors` and how `normalizeConfig` fills branch defaults. Bridge file lifecycle (Proposal C in `sprint-change-proposal-2026-05-08.md`) remains Story 4.2's domain.

### Completion Notes List

- Single normalization entry point: expanded `normalizeConfig` in `src/config/load-config.js` so `branch.pattern`, `defaultType`, `fallbackTicket`, `validationRegex`, and `commandTypeMap` all receive safe defaults in the same pass that already handled `longLivedBranches` and `defaultMergeTarget`.
- Downstream simplification: `src/services/git/branch-service.js#normalizeBranchConfig` and `src/services/workflow/resolve-workflow-policy.js#branchDetails` are now thin defensive pass-throughs over the already-normalized effective config; external behavior (envelope shape, fallback policy shape) is unchanged.
- Vocabulary surfacing: `collectWorkflowPolicyVocabularyWarnings` (new in `validate-config.js`) emits audit-warning entries for unknown `workflowPolicy[*]` vocabulary; warnings flow through the existing `config.validation.failed` channel without dropping the layer (forward-compat preserved). `src/index.js` audit trigger now also fires when `errors.length > 0`.
- Schema sync: both `src/config/schema/runtime-config.schema.json` and the inline `RUNTIME_CONFIG_SCHEMA` in `validate-config.js` got matching description updates calling out the known vocabulary and the forward-compat audit warning. Sync is locked by `verifyWorkflowPolicyVocabularySchema`.
- Templates + README: `templates/devai-aidd-guard.global.jsonc` and `templates/devai-aidd-guard.project.jsonc` got FR18-focused comment guidance covering the most-frequently-changed keys; README "설정 파일" section gained a "코드 수정 없이 정책 바꾸기 (FR18)" subsection with a concrete jsonc edit example. `templates/legacy-opencode-aidd-plugin.json` is plain JSON (no comments allowed) and was not changed; its content already aligns with `DEFAULT_PLUGIN_CONFIG`.
- Regression tests: 5 new `verify*` functions (normalization contract, missing-optional fallback, vocabulary surfacing + schema sync, determinism + fresh-object invariant, latest-policy across runs) added to `tests/regression.test.js`. All previous Story 1.3 / 2.x / 3.x verifications still pass unchanged.
- `npm run build` exit 0; `npm test` exit 0.

### File List

- src/config/load-config.js (modified)
- src/config/validate-config.js (modified)
- src/config/schema/runtime-config.schema.json (modified)
- src/services/git/branch-service.js (modified)
- src/services/workflow/resolve-workflow-policy.js (modified)
- src/index.js (modified)
- templates/devai-aidd-guard.global.jsonc (modified)
- templates/devai-aidd-guard.project.jsonc (modified)
- README.md (modified)
- tests/regression.test.js (modified)
- dist/devai-aidd-guard.js (generated artifact, gitignored — rebuilt by `npm run build`)

### Round 2 Review Follow-ups (2026-05-10)

Round 1 found 0 CRITICAL / 0 HIGH / 4 MEDIUM / 5 LOW. Round 2 auto-fixed all 4 MEDIUM items and 4 of the 5 LOW items; the remaining LOW (AI-9, File List dist annotation) is resolved by the updated File List entry above.

- AI-1 (MEDIUM, fixed): `src/services/workflow/resolve-workflow-policy.js#branchDetails` no longer redoes per-field `|| <default>` fallbacks. It now consumes the already-normalized `branch` object directly. The "single normalization entry point" claim and the code now agree. Existing `verifyResolveWorkflowPolicy` + `verifyEffectivePolicyDeterminism` continue to pass on `DEFAULT_PLUGIN_CONFIG` and on `loadRuntimeConfig` output (both fully normalized).
- AI-2 (MEDIUM, fixed): `verifyWorkflowPolicyVocabularySchema` now does a full `assert.deepEqual(JSON.parse(JSON.stringify(RUNTIME_CONFIG_SCHEMA)), schemaJson)` to satisfy Task 2.4's "동일 객체임을 직접 비교" requirement. Drift in `additionalProperties`, `type`, descriptions, or any other node is now caught.
- AI-3 (MEDIUM, fixed): `KNOWN_WORKFLOW_POLICY_VOCABULARY` JSDoc in `src/config/validate-config.js` now correctly attributes the vocabulary surfacing pipeline to `collectWorkflowPolicyVocabularyWarnings` + `loadRuntimeConfig` + `src/index.js` bootstrap (instead of incorrectly naming `validateRuntimeConfig` / `validateAndRecover`).
- AI-4 (MEDIUM, fixed): `verifyEffectiveConfigNormalizationContract` now also `deepEqual`s the seven `branch.*` values and the full `workflowPolicy` against `DEFAULT_PLUGIN_CONFIG.branch[*]` / `DEFAULT_PLUGIN_CONFIG.workflowPolicy` for the global-only and legacy-only template paths (project template carve-out is documented inline). Type-only checks would have silently allowed a future template drift.
- AI-5 (LOW, fixed): `src/services/git/branch-service.js#normalizeBranchConfig` now also exposes `defaultMergeTarget` (defensive default `""`), bringing it to the same 7-key contract `normalizeConfig` guarantees.
- AI-6 (LOW, fixed): `collectWorkflowPolicyVocabularyWarnings` JSDoc now states `params.kind === "warning"` explicitly (instead of the ambiguous "whether the entry is a warning").
- AI-7 (LOW, fixed): README FR18 subsection now shows a concrete vocabulary typo example (`finalization: "commit-and-puh"`) and the resulting `config.validation.failed` audit JSON, plus the filter expression operators can use to isolate vocabulary warnings.
- AI-8 (LOW, fixed): `loadRuntimeConfig` JSDoc now documents `validation.errors` as a MIXED list (parse + schema + vocabulary) and shows the filter expression for "hard errors only" callers.
- AI-9 (LOW, fixed): File List entry for `dist/devai-aidd-guard.js` now reads "(generated artifact, gitignored — rebuilt by `npm run build`)" so future readers immediately understand why git diff shows no change.

Verification after Round 2 fixes:
- `npm test` exit 0 — all Story 1.3 / 2.x / 3.x verifications still pass; the 5 Story 4.1 verifications (now strengthened by AI-2 + AI-4) still pass.
- `npm run build` exit 0 — `dist/devai-aidd-guard.js` rebuilt at 455.7kb (no new dependency).
- No new files created. No `schemaVersion` change. No new audit event types.

### Change Log

- 2026-05-10: Story 4.1 implementation — single-pass effective configuration normalization, vocabulary audit warnings (forward-compat preserved), template/README FR18 guidance, 5 new regression verifications. No new dependency, no schemaVersion bump (additive only).
- 2026-05-10: Story 4.1 Round 2 review follow-ups — `resolve-workflow-policy.js#branchDetails` simplified to consume normalized branch directly (AI-1); `verifyWorkflowPolicyVocabularySchema` strengthened to full schema deep-equal (AI-2); JSDoc attribution corrected on `KNOWN_WORKFLOW_POLICY_VOCABULARY` (AI-3); `verifyEffectiveConfigNormalizationContract` extended with cross-source value equivalence (AI-4); `branch-service.js#normalizeBranchConfig` includes `defaultMergeTarget` (AI-5); `params.kind` doc clarified (AI-6); README vocabulary typo example added (AI-7); `loadRuntimeConfig` JSDoc documents mixed-errors filter (AI-8); File List dist annotation clarified (AI-9). `npm test` exit 0; `npm run build` exit 0; status `review` → `done`.
