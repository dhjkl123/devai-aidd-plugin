# Story 4.2: 레거시 구성 호환성 및 브리지 파일 유지

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

기존 플러그인 사용자로서,
구버전 구성 파일 위치와 포맷이 그대로 사용 가능하기를 원한다,
그래서 마이그레이션 작업 없이도 리팩터된 플러그인 구조를 도입할 수 있다.

## Acceptance Criteria

1. **주어진 조건** 레거시 프로젝트 구성 파일만 존재하는 경우
   **동작 시점** 플러그인이 시작되면
   **기대 결과** 레거시 구성을 성공적으로 읽고 동등한 런타임 동작을 유지한다
   **그리고** 호환성 규칙이 요구하는 경우에만 호환성 브리지 파일을 생성한다.
2. **주어진 조건** 모던 구성 파일과 레거시 구성 파일이 모두 존재하는 경우
   **동작 시점** 유효 구성이 결정될 때
   **기대 결과** 우선순위 순서가 명시적이고 예측 가능하게 유지된다
   **그리고** 호환성 지원이 최신 프로젝트 의도 설정을 조용히 재정의하지 않는다.

## Tasks / Subtasks

- [ ] 호환성 브리지 책임을 service 계층으로 추출하고 결정 규칙을 명문화한다 (AC: 1, 2)
  - [ ] `src/services/compat/legacy-bridge-service.js`를 신규 생성하고 `ensureLegacyProjectConfigCompatibility` 본체를 이 모듈로 이전한다. `src/config/load-config.js`에는 `loadRuntimeConfig`(read 전용)만 남기고, `src/config/`에서 호환 브리지 쓰기 책임을 제거한다(architecture "Component Boundaries: config/ 설정 병합·검증·마이그레이션만 담당", "services/compat/ 호환 브리지 전담").
  - [ ] 이전 호출처(`src/index.js:81` `ensureLegacyProjectConfigCompatibility(directory, fsAdapter, runtimeConfig)`)는 새 모듈에서 동일 시그니처로 import 하도록만 갱신한다. Story 4.2는 호출 시점·시그니처를 깨지 않는다(Story 1.3 `Project Structure Notes` 경계).
  - [ ] 결정 규칙(아래 "브리지 생성 결정 표")을 함수 doc-block에 그대로 옮겨 적고, 코드와 doc-block이 동일 표를 참조하도록 한다.

- [ ] 결정적 우선순위 순서를 코드와 문서에 명시 고정한다 (AC: 2)
  - [ ] `loadRuntimeConfig`의 JSDoc에 이미 박혀 있는 `DEFAULT_PLUGIN_CONFIG → globalConfig → legacyProjectConfig → legacyWorkflowProjectConfig → projectConfig` 순서를 Story 4.2 문서에서도 단일 진실로 고정한다(추가 변경 없이 인용·재진술만).
  - [ ] 새로운 layer를 도입하지 않는다. Story 1.3이 정의한 4-layer 구조와 `validateAndRecover` 알고리즘을 변경하지 않는다(Story 1.3 review history AI-1: lower-layer invalid 시 upper-layer 보존 invariant 유지).
  - [ ] `legacyProjectConfig`/`legacyWorkflowProjectConfig`는 정확히 `globalConfig`보다 위, `projectConfig`보다 아래 우선순위를 가진다. 회귀 테스트로 이 순서를 가시화한다(아래 테스트 항목 참조).

- [ ] 브리지 파일 생성 트리거를 결정적이고 idempotent 하게 만든다 (AC: 1)
  - [ ] 현재 동작(2026-05-10 기준 `src/config/load-config.js:361-402`)을 분석한 결과 다음 코너 케이스가 있다.
    - 레거시 파일이 이미 존재하지만 marker 파일이 없으면 즉시 false 리턴(레거시 보존). 이 동작은 유지한다.
    - 어떤 sources도 없는 빈 디렉터리에서는 false 리턴. 유지한다.
    - 그 외 모든 경우 mirror 두 개(`opencode-aidd-plugin.json`, `devai-git-workflow.json`)와 marker(`.devai-aidd-guard.compat.generated`)를 항상 덮어쓰기 한다. **이 부분이 NFR4/NFR6 위반 위험**: 사용자가 손으로 편집한 레거시 파일을 "rebridge"가 덮어쓸 수 있다.
  - [ ] 다음 결정 표를 구현한다. 표 외 케이스는 변경 없이 무동작.

    | 입력 상태 | hasGlobal | hasProject | hasLegacyProject | hasLegacyWorkflowProject | marker 존재 | 결과 |
    |---|---|---|---|---|---|---|
    | A. 빈 디렉터리 | false | false | false | false | - | 무동작, return `{ written: false, reason: "no-config-sources" }` |
    | B. 레거시만, marker 없음 | false | false | true | * | false | 무동작, return `{ written: false, reason: "preserve-existing-legacy" }` (사용자가 손으로 작성한 레거시 보호) |
    | C. 레거시만, marker 있음 | false | false | true | * | true | mirror 갱신, return `{ written: true, reason: "refresh-bridge" }` |
    | D. 모던만 | * | true | false | false | * | mirror 신규 생성, marker 생성, return `{ written: true, reason: "create-bridge" }` |
    | E. 모던 + 레거시 mirror, marker 있음 | * | true | * | * | true | mirror 갱신(우리 소유), return `{ written: true, reason: "refresh-bridge" }` |
    | F. 모던 + 레거시(사용자 작성), marker 없음 | * | true | true | * | false | **무동작**, return `{ written: false, reason: "preserve-user-legacy" }` (AC2: silent override 금지) |
    | G. 글로벌만 | true | false | false | false | * | 무동작, return `{ written: false, reason: "global-only-no-bridge-needed" }` |
  - [ ] 함수 반환값을 boolean에서 `{ written, reason, paths? }` envelope으로 확장한다. 호출처 `src/index.js`는 이 envelope을 audit으로 전송할 수 있다(아래 audit 항목). 기존 호출처는 반환값을 무시하므로 backward-compatible 하다.
  - [ ] 쓰기 직전 파일 내용이 동일하면 `writeFileSync`를 생략한다(idempotent: 동일 컨텐츠 비교 후 skip). NFR1 latency 요구에 맞추되, mtime만 갱신되는 불필요한 파일 변경을 방지한다.
  - [ ] mirror 파일 내용은 정규화된 effective config 전체가 아니라 **레거시 reader가 실제로 사용하는 키 집합**으로 한정한다. `legacy-opencode-aidd-plugin.json` 템플릿(`templates/legacy-opencode-aidd-plugin.json`)의 키 형태(branch + workflowPolicy)와 동일 shape를 사용한다. `audit` 같은 모던 전용 섹션은 mirror에 포함하지 않는다.

- [ ] 브리지 라이프사이클 audit 이벤트를 추가한다 (AC: 1, 2)
  - [ ] 새 audit event `compat.bridge.evaluated`를 추가한다. payload shape:
    ```js
    {
      event: "compat.bridge.evaluated",
      timestamp: "<ISO-8601>",
      workflow: null,
      command: null,
      details: {
        written: boolean,
        reason: string, // 위 결정 표의 reason
        sources: { hasGlobalConfig, hasProjectConfig, hasLegacyProjectConfig, hasLegacyWorkflowProjectConfig },
        markerPresent: boolean,
        bridgePaths?: { legacyProjectConfigPath, legacyWorkflowProjectConfigPath, legacyCompatMarkerPath },
      },
    }
    ```
  - [ ] `src/index.js`는 `ensureLegacyProjectConfigCompatibility` 호출 후 반환된 envelope을 위 페이로드로 변환해 `audit.info("compat.bridge.evaluated", payload)`를 발산한다. 발산은 best-effort이며 try/catch로 감싼다(Story 1.3 `config.validation.failed`와 동일 패턴, NFR7/NFR8).
  - [ ] event 이름은 architecture "Communication Patterns → Event System Patterns"의 `dot.case` 규약을 따른다.
  - [ ] 새 audit event를 도입하므로 architecture/PRD에 등재할 필요 없는 운영 이벤트로 분류한다(Story 1.3의 `config.validation.failed`와 동급).

- [ ] 호환성 정책이 모던 설정을 조용히 재정의하지 않음을 보장한다 (AC: 2)
  - [ ] mirror 파일 생성/갱신은 `loadRuntimeConfig`의 결과(이미 우선순위가 적용된 effective config)에서 파생되므로, 다음 invariant가 성립한다: **모던 `projectConfig`의 값은 mirror 파일을 거쳐도 절대 다른 값으로 바뀌지 않는다.**
  - [ ] 이 invariant를 코드 doc-block과 회귀 테스트로 못 박는다. mirror 갱신 후 `loadRuntimeConfig`를 다시 호출했을 때 effective config의 모던 우선 키들이 동일해야 한다.
  - [ ] **사용자가 손으로 편집한 레거시 파일**(marker 부재)은 위 결정 표의 케이스 B와 F에 따라 보호한다. mirror가 사용자 의도를 덮어쓰면 AC2 "compatibility support does not silently override newer project-intended settings"의 정신을 위반한다.

- [ ] 회귀 테스트를 추가해 결정 표 전체와 invariant를 가드한다 (AC: 1, 2)
  - [ ] `tests/regression.test.js` main chain 마지막에 다음 검증 함수들을 추가하고 등록한다:
    - `verifyStory42BridgeNoOpOnEmptyWorkspace` (케이스 A)
    - `verifyStory42BridgePreservesUserLegacyWithoutMarker` (케이스 B, F: marker 없음 + 사용자 레거시 보호)
    - `verifyStory42BridgeRefreshWhenMarkerPresent` (케이스 C, E)
    - `verifyStory42BridgeCreatesMirrorForModernOnly` (케이스 D)
    - `verifyStory42BridgeWriteIsIdempotent` (동일 컨텐츠는 skip)
    - `verifyStory42BridgePrecedenceProjectOverridesLegacy` (AC2: legacy mirror가 modern projectConfig를 덮지 않음 — `loadRuntimeConfig` 두 번 호출 후 effective config 비교)
    - `verifyStory42BridgeAuditEventShape` (`compat.bridge.evaluated` payload `event`/`timestamp`/`details.written`/`details.reason` 키 존재)
    - `verifyStory42BridgeMirrorOmitsAuditSection` (mirror 파일에 `audit` 키가 없음)
  - [ ] 각 테스트는 `os.tmpdir()`로 sandbox 작업공간을 만들고 `homedir()` 어댑터를 가짜로 주입하는 Story 1.3의 `verifyConfigMergePrecedence` 패턴을 그대로 따른다.
  - [ ] 기존 회귀(`verifyConfigMergePrecedence`, `verifyValidationFallback`, `verifyValidationFallbackLowerLayer` 등)는 손대지 않는다.

- [ ] 문서와 운영 안내를 갱신한다 (AC: 1, 2)
  - [ ] `README.md`에 "레거시 구성 호환성" 섹션을 추가한다. 다음을 포함한다.
    - 모던 경로(`.opencode/devai-aidd-guard.project.jsonc`)와 레거시 경로(`.opencode/opencode-aidd-plugin.json`, `.opencode/devai-git-workflow.json`) 매핑.
    - 우선순위(global → legacyProject → legacyWorkflow → project, 같은 키는 위쪽이 덮어씀).
    - marker 파일(`.opencode/.devai-aidd-guard.compat.generated`)의 의미: "플러그인이 자동 생성한 mirror"라는 표지. marker가 없는 레거시 파일은 사용자 자산으로 간주하고 보존됨.
    - 사용자가 모던 파일과 레거시 파일을 동시에 두는 경우의 결과(modern 우선, legacy mirror는 marker가 있을 때만 갱신).
  - [ ] sprint-change-proposal Proposal C에 명시된 "install/setup 또는 명시적 migration step에서 bridge 생성"이라는 문구는 본 스토리가 plugin runtime startup에서 책임을 가져가는 형태로 통합한다. 단, 결정 표의 케이스 F가 사용자 자산 보호를 보장하므로 silent migration 우려는 해소된다.

## Dev Notes

### Story Intent

Story 4.2는 Story 1.3에서 **read-only로 의도적으로 남겨둔 호환 브리지 책임**을 정식 owner로 가져오는 스토리다. Story 1.3은 `loadRuntimeConfig`를 deterministic merge pipeline으로 만들었지만, `ensureLegacyProjectConfigCompatibility`(`src/config/load-config.js:361-402`)의 동작은 그대로 두었다(`sprint-change-proposal-2026-05-08.md` Proposal C). Story 4.2는 그 함수를 (1) service 계층으로 옮기고, (2) 결정 규칙을 결정적·idempotent 하게 만들고, (3) 사용자 자산을 silent override 하지 않도록 가드하고, (4) 라이프사이클을 audit으로 가시화한다.

브랜치 정책 정규화·workflow policy 매핑은 Story 4.1의 영역이다. Story 4.2는 정책 normalization을 변경하지 않고 호환 브리지 라이프사이클만 다룬다.

### Story 1.3에서 이미 끝난 부분 vs Story 4.2에서 추가하는 부분

**Story 1.3에서 이미 끝났음 (변경 금지):**
- 레거시 파일을 layer로 읽어서 `mergeConfigs`에 넣는 read pipeline(`readLegacyConfigs`).
- 레거시 layer의 우선순위(`globalConfig → legacyProjectConfig → legacyWorkflowProjectConfig → projectConfig`).
- 레거시 layer가 invalid일 때의 dropped-layer 처리(`validateAndRecover`).
- `loadRuntimeConfig` 반환 객체의 `sources.hasLegacyProjectConfig` / `hasLegacyWorkflowProjectConfig` 플래그.
- `runtimeConfig.validation` 필드와 `config.validation.failed` audit 이벤트.
- 4-layer 구조 자체와 `validateAndRecover` 알고리즘.

**Story 4.2가 추가하는 부분:**
- **호환 브리지 쓰기 라이프사이클 owner 이동**: `src/config/load-config.js`에 있던 `ensureLegacyProjectConfigCompatibility` 본체를 `src/services/compat/legacy-bridge-service.js`로 이전. `src/config/`는 read-only로 정화.
- **결정 표(decision matrix)**: 7개 입력 상태에 대해 mirror 생성/갱신/no-op을 결정적으로 분류. 현재는 "marker 없으면 leave alone, 그 외에는 항상 덮어쓰기"라는 두 갈래 동작이 전부.
- **사용자 레거시 자산 보호 invariant** (AC2): marker 없는 레거시 파일이 mirror에 의해 덮어쓰이지 않도록 케이스 B/F를 명시 처리.
- **idempotent 쓰기**: 동일 컨텐츠 비교 후 `writeFileSync` 생략. 현재는 매 부트스트랩마다 항상 mtime이 갱신됨.
- **mirror 컨텐츠 정제**: 현재는 effective config 전체를 mirror에 기록(audit 섹션 포함). 본 스토리에서 레거시 reader가 사용하는 키만 남기도록 한정.
- **라이프사이클 audit**: `compat.bridge.evaluated` 이벤트를 추가해서 written/reason/sources를 구조화 페이로드로 노출.
- **회귀 테스트 가드**: 현재 `ensureLegacyProjectConfigCompatibility`는 회귀 테스트가 0건이다(`tests/regression.test.js`에서 grep 결과 없음). 결정 표 7개 케이스, idempotency, precedence invariant, audit shape, mirror 콘텐츠 형태를 가드한다.
- **README 운영 안내**: marker 의미, 우선순위, "modern + legacy" 동시 존재 시의 결과를 사용자가 이해 가능하도록 설명.

### Story 4.1과의 경계

- Story 4.1은 branch rule / workflow policy normalization을 owner로 한다. Story 4.2는 normalization을 호출만 하고 변경하지 않는다.
- Story 4.1이 schema에 새 필드를 도입할 수 있다. Story 4.2는 schema를 건드리지 않는다.
- Story 4.1과 Story 4.2 사이에 임포트 의존성을 만들지 않는다. 두 스토리는 모두 `loadRuntimeConfig`의 결과를 소비할 뿐이다.

### 현재 코드베이스에서 확인된 기반

- `src/config/load-config.js:361-402` `ensureLegacyProjectConfigCompatibility(directory, fsAdapter, runtimeConfig)`:
  - 입력으로 이미 결정된 `runtimeConfig`(config + paths + sources)를 받는다.
  - 두 가지 early return 조건이 있다: (1) 레거시 파일이 있는데 marker가 없으면 false, (2) 어떤 sources도 없으면 false.
  - 그 외에는 mirror 두 개와 marker를 항상 덮어쓰며, 컨텐츠는 `JSON.stringify(config, null, 2)` (effective config 전체).
- `src/utils/constants.js:7-15`: `LEGACY_PROJECT_CONFIG_FILE_NAME = "opencode-aidd-plugin.json"`, `LEGACY_WORKFLOW_PROJECT_CONFIG_FILE_NAME = "devai-git-workflow.json"`, `LEGACY_COMPAT_MARKER_FILE_NAME = ".devai-aidd-guard.compat.generated"`.
- `src/index.js:81`: `ensureLegacyProjectConfigCompatibility(directory, fsAdapter, runtimeConfig)`. 반환값은 무시되고 audit emit도 없음.
- `templates/legacy-opencode-aidd-plugin.json`: 레거시 reader가 받아들이는 mirror 컨텐츠의 reference shape(branch + workflowPolicy 두 섹션, audit 없음).
- `tests/regression.test.js`: 레거시 브리지 관련 회귀 테스트 0건. Story 1.3이 추가한 `verifyConfigMergePrecedence`/`verifyValidationFallback`/`verifyValidationFallbackLowerLayer`는 read pipeline만 검증.

### 구현 가드레일

- Story 4.2는 `loadRuntimeConfig`의 시그니처/반환 객체 형태를 변경하지 않는다. 호환 브리지의 결정 입력은 이미 `runtimeConfig.sources`/`runtimeConfig.config`/`runtimeConfig.paths`에 들어있다.
- 신규 service 모듈 외 다른 위치(`src/hooks/*`, `src/policies/legacy/*`, `src/audit/*`)에 호환 브리지 로직을 흩뿌리지 않는다(architecture "Component Boundaries").
- `services/compat/`는 architecture가 명시한 디렉터리 경로다(architecture "File Structure Patterns"). 이 스토리에서 처음 생성한다.
- 새 외부 dependency를 도입하지 않는다. JSON 직렬화·비교는 표준 `JSON.stringify`로 수행하고, 콘텐츠 비교는 string equality로 충분하다.
- ESM Node 22 런타임 계약을 유지한다. 순수 함수 + adapter 주입 패턴(`fsAdapter`)을 그대로 사용한다.
- mirror 파일 컨텐츠는 deterministic 직렬화 결과여야 한다(`JSON.stringify(obj, null, 2)` + 마지막 newline). idempotency 비교가 이 결정성에 의존한다.
- audit emit은 best-effort(NFR7/NFR8). audit sink 실패가 부트스트랩을 막지 않는다.
- 새 layer를 도입하지 않는다. Story 1.3의 4-layer 구조를 변경하면 회귀 테스트(`verifyConfigMergePrecedence`, `verifyValidationFallbackLowerLayer`)가 깨진다.
- mirror 파일이 갖는 의미: "플러그인이 마지막으로 본 effective config의 레거시 reader 호환 스냅샷". 사용자 편집 자산이 아니다. marker 부재는 "사용자 자산이거나 외부에서 주입된 레거시"라는 신호로 해석한다.

### 구현 파일 후보

- 신규 파일
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\compat\legacy-bridge-service.js` — 결정 표·envelope 반환·idempotent 쓰기 본체.
- 수정 파일
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\load-config.js` — `ensureLegacyProjectConfigCompatibility` export를 신규 service에서 재-export 하거나 본 함수를 그대로 옮기고 `src/config/`는 read 전용으로 남긴다. 호출처 import 경로만 갱신할 수도 있다.
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js` — service 호출로 변경, 반환 envelope을 `compat.bridge.evaluated` audit으로 emit.
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` — Story 4.2 회귀 8건 + main chain 등록.
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md` — "레거시 구성 호환성" 섹션 추가.
- 피해야 할 위치
  - 새 schema 필드(Story 4.1 owner)
  - 새 layer / 새 우선순위(Story 1.3 invariant)
  - hook 안쪽에서 직접 fs write 호출

### 테스트 포인트

- 결정 표 7개 입력 상태별 written/reason 결과가 결정적이어야 한다.
- 동일 컨텐츠로 두 번 호출 시 두 번째 호출에서 `written: false, reason: "no-content-change"` 또는 그에 준하는 idempotent 신호가 나와야 한다(현 동작은 매번 덮어쓰기).
- modern projectConfig의 값이 mirror 갱신을 통해 변하지 않아야 한다(`loadRuntimeConfig` 재호출 후 effective config 동일).
- 케이스 F(modern + 사용자 레거시, marker 없음)에서 사용자의 레거시 파일이 변경되지 않아야 한다.
- mirror 파일 컨텐츠에 `audit` 섹션이 없어야 한다(레거시 reader가 모르는 키).
- `compat.bridge.evaluated` audit payload에 `event`/`timestamp`/`details.written`/`details.reason`/`details.sources` 키가 모두 존재해야 한다.
- audit sink가 throw 해도 bridge service의 반환값과 부트스트랩 흐름은 영향받지 않는다(Story 1.3 `config.validation.failed` 패턴과 동일).
- 빈 디렉터리에서 호출 시 mirror/marker 파일이 생기지 않는다(케이스 A).

### Previous Story Intelligence

- **Story 1.3**(`_bmad-output/implementation-artifacts/1-3-load-merged-configuration-and-resolve-workflow-policy.md`):
  - read pipeline과 정책 resolver를 확정. Story 4.2는 그 결과(`runtimeConfig`)를 소비만 한다.
  - `ensureLegacyProjectConfigCompatibility`의 시그니처와 호출 시점을 변경하지 않는다는 명시 경계. Story 4.2는 시그니처를 유지하되 본체를 service 모듈로 옮긴다.
  - `validateAndRecover`의 lower-layer-first 원칙(AI-1)은 그대로다.
  - audit best-effort 패턴(NFR7/NFR8): `compat.bridge.evaluated`도 동일 방식으로 try/catch로 감싼다.
- **Story 1.1**(`_bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md`):
  - "bootstrap이 silent install/setup migration을 수행하지 않는다" 원칙. Story 4.2의 결정 표 케이스 F가 이 원칙을 코드로 강제한다.
- **Story 3.5**(`_bmad-output/implementation-artifacts/3-5-preserve-reviewer-traceability-through-standard-git-history.md`):
  - service 중심 추출 + 결정적 컨텐츠 + 회귀 테스트로 invariant 고정 → 본 스토리의 작업 패턴 모범.
  - audit payload 형태 가이드(`event`, `timestamp`, `details.*`).
- **Sprint Change Proposal 2026-05-08**: Story 4.2가 호환 브리지 owner라는 결정의 출처. Proposal C 본문이 본 스토리의 핵심 정당화다.

### Git Intelligence Summary

- 최근 5개 커밋: `Merge epic3/stories → master`, Story 3.5/3.4 review follow-ups, Story 3.5 implementation. Epic 3가 마무리 단계이고 Epic 4가 다음 작업 단계다.
- Epic 1 retrospective(`epic-1-retro-2026-05-09.md`)에서 "auto-fix LOWs in same session" / "documentation drift checklist" 패턴이 정착됨. Story 4.2도 이 패턴을 따른다.
- Story 3.x 구현 패턴(service 추출 + 회귀 테스트로 invariant 고정 + audit emit + README 업데이트)은 본 스토리에 그대로 적용된다.

### Latest Tech Information

- 현재 저장소는 Node.js ESM(Node 22 target), `ajv@8.17.1`, esbuild 빌드. Story 4.2에서 새 런타임/빌드/dependency를 도입할 이유는 없다.
- `JSON.stringify(value, null, 2)`는 결정적 직렬화를 위해 키 순서가 입력 객체의 enumeration 순서를 따른다(ES2015+ ordered own-properties). 즉 동일 입력은 동일 출력 → idempotent 비교가 안전하다.
- Node 22 `fs.readFileSync(path, "utf8")` + `String(a) === String(b)` 비교로 같은 컨텐츠 여부를 확인할 수 있다(BOM/trailing whitespace 일관성만 유지).

### Project Structure Notes

- 본 스토리는 architecture가 명시한 `src/services/compat/legacy-bridge-service.js` 위치를 처음 만든다. 이 디렉터리에 다른 컴포넌트를 함께 두지 않는다(현재는 단일 모듈).
- `src/config/`에서 호환 브리지 쓰기 책임이 빠지면, `src/config/`는 architecture "Component Boundaries: config/ 설정 병합·검증·마이그레이션만 담당" 원칙에 더 잘 부합한다.
- Story 4.2 구현이 `src/index.js`에 미치는 영향은 import 경로 변경 + 반환 envelope을 audit으로 전달하는 한 줄 추가로 한정한다. `src/index.js`는 thin wiring을 유지한다(Epic 1 retro Action Item).
- `project-context.md`는 현재 저장소에서 발견되지 않는다. 본 스토리는 PRD/Epics/Architecture/README/실제 소스/Story 1.3·3.5를 기준으로 컨텍스트를 정리했다.

### References

- 에픽·스토리 정의: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md` — Epic 4, Story 4.2 (FR17)
- PRD 기능·비기능 요구: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md` — FR16/FR17/FR18, NFR4/NFR6/NFR7/NFR8
- 아키텍처 결정: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md` — "Data Architecture", "config validation은 legacy compatibility bridge와 직접 연결된다", "File Structure Patterns: services/compat/legacy-bridge-service.js"
- Story 1.3 read pipeline 기반: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\1-3-load-merged-configuration-and-resolve-workflow-policy.md`
- Story 1.1 bootstrap 경계: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\1-1-register-runtime-hooks-through-the-plugin-bootstrap.md`
- Story 3.5 service 추출 + audit + 회귀 패턴 참고: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\3-5-preserve-reviewer-traceability-through-standard-git-history.md`
- 스코프 이전 결정: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\sprint-change-proposal-2026-05-08.md` — Proposal C
- Epic 1 retrospective(작업 패턴): `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\epic-1-retro-2026-05-09.md`
- 베이스라인 코드: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\load-config.js` (361-402 `ensureLegacyProjectConfigCompatibility`), `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js` (81 호출처), `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\utils\constants.js` (15 marker 상수)
- 레거시 mirror reference shape: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\templates\legacy-opencode-aidd-plugin.json`
- 회귀 테스트 베이스라인: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` (Story 1.3 패턴: `verifyConfigMergePrecedence`, `verifyValidationFallback`, `verifyValidationFallbackLowerLayer`)
- 사용자 안내 갱신 대상: `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
