# Story 4.5: 래퍼 및 배포 동작에 대한 회귀 커버리지 유지

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

유지보수 담당자로서,
래퍼 호환성과 빌드된 배포 산출물의 동작을 자동 회귀 검사로 검증하고 싶다,
그래서 리팩터링과 릴리스가 가드된 워크플로우 동작을 조용히 깨뜨리지 못하게 만들고 싶다.

## Acceptance Criteria

1. **주어진 조건** 소스, 래퍼, 그리고 빌드된 플러그인 산출물이 저장소에 모두 존재할 때
   **동작 시점** 회귀 테스트가 실행되면
   **기대 결과** 핵심 명령 프롬프트와 mutating-tool 보호 동작이 legacy / wrapper / built 세 변형 사이에서 비교 검증되어야 한다
   **그리고** 호환성 위반은 릴리스 산출물이 신뢰 대상이 되기 전에 보고되어야 한다.
2. **주어진 조건** 향후 변경이 bootstrap, hooks, 또는 finalization 동작에 영향을 줄 때
   **동작 시점** 테스트가 갱신되거나 확장되면
   **기대 결과** 회귀 스위트는 계속해서 동작 동등성에 대한 품질 게이트로 동작해야 한다
   **그리고** 유지보수 담당자는 새 버전을 배포하기 전에 호환성 드리프트를 감지할 수 있어야 한다.

## Tasks / Subtasks

- [x] 회귀 스위트가 “legacy / wrapper / built” 3변형 비교를 영속적으로 보장하도록 게이트 계약을 명문화한다 (AC: 1)
  - [x] `tests/regression.test.js`의 `main()` 진입부가 `verifyLegacyBootstrapDependencyPath()`와 `verifyBuiltArtifactExists()`를 항상 먼저 호출하도록 유지하고, 세 모듈 인스턴스(`legacy`, `wrapper`, `built`)가 모두 인스턴스화되지 않으면 테스트가 실패하는 invariant를 코드 옆 주석으로 박는다.
  - [x] `npm test` 스크립트가 `node --check src/index.js`, `node --check src/policies/legacy/devai-git-workflo.js`, `node --check scripts/build.js`, `node --check scripts/make-release.js`, 그리고 `node tests/regression.test.js`를 모두 포함하는 현재 형태를 유지하고, Story 4.5에서는 이 호출 순서를 단축하거나 우회하지 않는다.
  - [x] `dist/devai-aidd-guard.js`가 없을 때 회귀 테스트가 “run `npm run build` before `npm test`” 메시지로 명확히 실패하는 기존 동작을 유지하고, 우연히 silent skip 되지 않도록 회귀 테스트 안에서 직접 가드한다.

- [x] 명령 프롬프트 동등성과 mutating-tool 보호 동등성을 “legacy 기준선 + built/wrapper parity”로 분리해 안정화한다 (AC: 1)
  - [x] `command.execute.before` 출력에 대한 비교는 (a) `wrapper vs legacy`, (b) `built vs legacy` 두 축을 유지하고, Story 2.1 이후 도입된 approval prompt는 `built vs wrapper` parity로 분리해 검사하는 현재 구조를 보존한다.
  - [x] mutating-tool 가드가 `legacy`, `wrapper`, `built` 세 변형 모두에서 동일한 메시지/예외 형상을 내야 하며, 비-워크플로우 세션에서는 발화되지 않아야 한다는 invariant를 회귀에서 직접 검증한다.
  - [x] `permission.asked`, `file.edited` 핸들러가 `wrapper`/`built`에서만 등록되고 `legacy`에는 부재하다는 점을 회귀에서 확인하고, Story 4.3의 호환성 계약(”placeholder 훅이 명시적 경계를 갖는다”)이 빌드 산출물에서도 그대로 보존되었는지 검증한다.
  - [x] 비-워크플로우 명령은 `wrapper`/`built`에서 출력 parts가 0개여야 하고, `workflow.detected` 감사 이벤트가 발생하지 않아야 한다는 부정 검증을 함께 둔다.

- [x] 빌드 산출물 검증을 회귀 스위트의 1급 품질 게이트로 통합한다 (AC: 1, 2)
  - [x] `dist/devai-aidd-guard.js`를 `import()`로 적재해 `DevaiAiddGuardPlugin` 또는 `DevaiGitWorkflowPlugin` 또는 `default` export 중 하나가 존재해야 한다는 현재의 export 계약을 회귀 안에서 명시적으로 단정한다.
  - [x] 빌드 산출물 모듈의 hook map(`command.execute.before`, `tool.execute.before`, `tool.execute.after`, `event`, 그리고 `permission.asked`/`file.edited`)을 `wrapper` 모듈과 동일한 셰이프로 비교한다.
  - [x] 빌드 산출물에서 발생하는 approval prompt summary(`sessionID`, `partCount`, `firstText`, `phase`)가 `wrapper` 결과와 deepEqual 한지 검증해, esbuild 번들이 prompt 메타데이터를 누락/변형하지 않는지 잠근다.
  - [x] 빌드 산출물의 mutating-tool 예외 메시지가 `legacy` 메시지와 동일한지 단정해, 빌드 시 minify/transform이 사용자 가시 메시지를 깨지 않게 막는다.
  - [x] Story 4.4가 추가하는 release manifest/checksum 단정은 본 스토리의 책임 범위에 포함하지 않는다(릴리스 패키징 자체는 Story 4.4가 보장). 단, 회귀 스위트가 사전 조건으로 “빌드된 dist 산출물이 존재한다”는 사실에 의존한다는 경계는 코드 주석으로 명시한다.

- [x] 향후 bootstrap / hooks / finalization 변경이 추가될 때 회귀 스위트가 자연스럽게 확장 가능한 구조를 유지한다 (AC: 2)
  - [x] 신규 회귀 함수는 `verify<Story번호><동작>()` 네이밍을 따르고 `main().then(() => verifyXxx())` 체인 끝에 등록되는 기존 패턴을 보존하며, 새 helper를 만들 때도 동일한 컨벤션을 따른다.
  - [x] 새 hook 등록(예: 향후 finalization phase 확장 또는 새 mutating-tool 게이트)이 추가될 때는, `legacy`에 없을 수 있는 hook은 wrapper/built parity로만 검증하고 legacy 비교에서는 명시적으로 제외하는 규칙을 회귀 코드 옆 주석으로 박는다.
  - [x] 회귀 함수에서 가드 대상이 되는 audit event 이름(`workflow.detected`, `git.action.executed`, `git.action.recovery.*` 등)은 architecture.md의 “구조화 필수 이벤트” 목록과 일치해야 하며, 이름이 새로 추가되는 경우 회귀에서 가드를 추가한다는 정책을 README 또는 회귀 헤더 주석에 기록한다.

- [x] 회귀 실행 환경의 결정성과 격리성을 유지한다 (AC: 1, 2)
  - [x] `createTempWorkspace()`/`createGitWorkspace()`/`createMockClient()`가 만드는 임시 디렉터리는 `finally` 블록에서 항상 정리되어야 하며, 회귀 함수 추가 시에도 같은 정리 패턴을 따른다.
  - [x] 회귀 테스트는 OS 글로벌 git 설정에 의존하지 않아야 하고, 외부 네트워크 호출(원격 push 등)을 발생시키지 않아야 한다. 원격은 `https://example.com/repo.git`처럼 고정된 더미 URL만 사용한다.
  - [x] `import(...)` 호출 시 `?t=${Date.now()}` 또는 동등한 cache-busting 쿼리를 사용해 dist 모듈 재빌드 후 동일 프로세스에서도 최신 산출물이 적재되도록 하는 현재 패턴을 보존한다.
  - [x] 회귀 함수 안에서 시간/난수 의존성은 호출자가 주입(예: `detectedAt`)하도록 강제해, flaky 시간 비교가 새로 들어오지 않게 막는다.

- [x] Story 4.5 전용 회귀/계약 테스트를 추가해 “세 변형 동등성”을 영속적으로 잠근다 (AC: 1, 2)
  - [x] `verifyStory45LegacyWrapperBuiltHandlerShapesMatch()` — 세 변형의 hook map 키 집합과 핸들러 타입을 비교해 표면 영역 누락/추가를 잡아낸다. (Story 4.3 R2 M-1 본체: SOT 상수 ↔ 실제 hook map 키 set-equal 단언 흡수)
  - [x] `verifyStory45LegacyWrapperBuiltCommandPromptParity()` — `command.execute.before` 출력 parts 정규화 결과가 (legacy↔wrapper, legacy↔built) 모두 일치하는지를 단일 함수로 묶어 회귀 한 곳에서 변경을 감지한다.
  - [x] `verifyStory45LegacyWrapperBuiltMutatingToolGuardParity()` — `tool.execute.before` mutating 호출이 세 변형 모두에서 동일한 예외 메시지를 내고, 비-워크플로우 세션에서는 던지지 않는다는 부정 케이스를 함께 잠근다.
  - [x] `verifyStory45BuiltArtifactExportContract()` — `dist/devai-aidd-guard.js`가 기대 export(`DevaiAiddGuardPlugin` 또는 `DevaiGitWorkflowPlugin` 또는 `default`) 중 하나를 노출하고, 함수 시그니처(인자 1개, async-호환)가 wrapper와 동일한지 단정한다.
  - [x] `verifyStory45BuiltArtifactPromptParityWithWrapper()` — built이 발행하는 approval prompt summary가 wrapper와 deepEqual 한지 격리 단위로 잠근다.
  - [x] `verifyStory45RegressionGateAbortsWithoutBuiltArtifact()` — 일시적으로 dist 경로를 가리고 회귀가 명확히 실패하는지(또는 사전 가드가 실패하는지)를 fixture 기반으로 검증한다. 실제 dist를 삭제하지 않고 임시 fixture root에서 검증한다.
  - [x] `verifyStory45SrcIndexAuditEventListMatchesEmissions()` — Story 4.3 R2 L-3 이관 항목: `src/index.js` 헤더 JSDoc audit-이벤트 list와 본문 `audit.info("...")` 호출 set의 set-equal 단언.
  - [x] 신규 함수들은 `main().then(...)` 체인의 Story 4.4 블록 다음에 “Story 4.5 — wrapper/built regression gate” 코멘트와 함께 추가한다.

- [x] README와 sprint-status에 회귀 게이트의 책임 범위를 한 줄로 기록한다 (AC: 2)
  - [x] README에 “리팩터링/릴리스 전 `npm run build && npm test`가 회귀 게이트”라는 문장을 보강한다(이미 존재하면 위치만 보존). 새 문서를 만들지 않는다.
  - [x] Story 4.5 dev-story 완료 직전, 본 스토리 status 변경은 dev-agent가 sprint-status.yaml에 반영한다(별도 외부 추적 시스템을 만들지 않는다).

## Dev Notes

### Epic 4 전체 맥락

- Epic 4의 책임은 “정책 관리/legacy 호환성/패키징/회귀 게이트”다. Story 4.1~4.2는 설정/legacy 호환성, Story 4.3은 래퍼-레거시 동작 호환성 계약, Story 4.4는 빌드/릴리스 패키징 자체의 신뢰성을 책임진다.
- Story 4.5는 그 위에서 “Story 4.3의 래퍼 호환성 계약”과 “Story 4.4의 빌드 산출물 동작”이 실제로 깨지지 않았음을 자동 회귀로 증명하는 영속적 품질 게이트다. 즉 Story 4.5는 새 계약을 정의하지 않고 기존 계약 위반을 잡는 역할이다.
- Story 4.3 ↔ Story 4.5 경계: 호환성 “계약”(어떤 hook이 존재해야 하는가, 어떤 placeholder 경계가 명시되어야 하는가)은 4.3에서 정의된다. 4.5는 그 계약이 legacy/wrapper/built 세 변형에서 동일하게 관찰되는지를 자동 비교로 검증한다.
- Story 4.4 ↔ Story 4.5 경계: 릴리스 manifest/checksum/installer 패키징 자체의 정합성은 4.4가 보장한다. 4.5는 “빌드 산출물이 동작 면에서 wrapper와 동등한가”에만 책임이 있고, manifest 형식이나 versioned/`latest` 디렉터리 동기화는 4.5의 단정 대상이 아니다. 단, 4.5는 “빌드 산출물이 존재한다”는 사전 조건에는 의존한다.
- Epic 1/2/3 회귀 함수들이 이미 다수 등록되어 있고(`verifyConfigMergePrecedence`, `verifyApprovalPromptDeliveryFailureAudit`, `verifyStory34GitActionExecutedCarriesCorrelationAxes`, `verifyStory35CommitProposalMixedScope` 등), Story 4.5는 이 자산을 재배치/재명명하지 않는다. 4.5는 이 자산을 영속화하고 “새 회귀가 들어올 때도 같은 패턴을 따라야 한다”는 컨벤션을 박는 역할이다.

### 현재 회귀 인프라가 이미 커버하는 것

`tests/regression.test.js`(약 9,945 라인)와 `package.json`의 `test` 스크립트 조합이 이미 다음을 보장한다. Story 4.5에서 다시 만들 필요가 없다.

- **3변형 인스턴스화:** `main()`은 `legacy`(`src/policies/legacy/devai-git-workflo.js`), `wrapper`(`src/index.js`), `built`(`dist/devai-aidd-guard.js`)를 각자 임시 워크스페이스에서 부트스트랩하고, 셋 모두 핵심 hook(`command.execute.before`, `tool.execute.before`, `tool.execute.after`, `event`)을 등록함을 단정한다. 추가로 `wrapper`와 `built`는 `permission.asked`, `file.edited`도 등록해야 한다.
- **사전 가드:** `verifyLegacyBootstrapDependencyPath()`는 `src/policies/legacy/devai-git-workflo.js`가 존재함을 보장하고, `verifyBuiltArtifactExists()`는 `dist/devai-aidd-guard.js`가 존재함을 보장한다. 후자는 누락 시 “run `npm run build` before `npm test`” 메시지로 실패한다.
- **명령 프롬프트 parity:** `command.execute.before` 출력 parts를 `normalizeOutputParts()`로 정규화한 뒤 wrapper↔legacy, built↔legacy를 deepEqual 비교한다.
- **Approval prompt parity:** Story 2.1 이후 wrapper/built만 prompt를 발행한다는 점을 반영해, prompt summary는 built↔wrapper로만 비교한다(legacy 비교는 의도적으로 하지 않음).
- **Mutating-tool 가드 parity:** write 같은 mutating tool 호출 시 세 변형이 모두 동일한 예외 메시지를 내야 함을 단정한다.
- **비-워크플로우 격리:** 비-워크플로우 명령에서 wrapper/built가 0개 part를 내고, mutating-tool 가드가 발화하지 않으며, `workflow.detected` 감사 이벤트가 발생하지 않음을 단정한다.
- **Audit payload 계약:** `workflow.detected` 이벤트가 `event`/`timestamp`/`workflow`/`command`/`details` 형상을 갖고, `details`가 `sessionID`(string), `hasArguments`(boolean), `source`(`"command.execute.before"`)를 포함함을 단정한다.
- **Phase 진행 idempotency, 세션 격리, session.deleted 처리, 재진입 시 상태 리셋, advancePhase 가드** 등 부수 invariant도 이미 회귀에 포함되어 있다.
- **누락된 legacy 의존성 실패 셰이프:** `verifyMissingLegacyBootstrapDependencyFails()`가 fixture root에서 `src/policies/legacy/devai-git-workflo.js`를 제거했을 때 ESM `ERR_MODULE_NOT_FOUND`가 발생하는지 단정한다. Story 4.5는 이 패턴을 “회귀 게이트가 dist 부재에도 같은 형태로 실패하는지”에 응용한다.
- **Story-단위 회귀 누적:** Story 1.x ~ Story 3.5까지 약 80여 개 회귀 함수가 `main().then(() => verifyXxx())` 체인으로 등록되어 있다. 4.5는 이 체인을 깨지 않고 끝부분에 “Story 4.5 — wrapper/built regression gate” 블록만 추가한다.

### Story 4.5가 새로 닫는 갭

기존 회귀가 이미 wrapper/legacy/built parity를 폭넓게 커버하지만, Story 4.5의 책임은 그 커버리지를 “영속적이고 의도적인 품질 게이트”로 못 박는 것이다. 다음 갭을 닫는다.

- **3변형 hook map 키 집합 단정의 단일화:** 현재 회귀는 hook 별로 `typeof === "function"` 단정을 흩어놓는다. Story 4.5는 “세 변형이 같은 hook 셰이프를 갖는가”라는 단일 의문을 한 함수에서 정리해, 신규 hook 추가 시 회귀가 한 지점에서 잡도록 만든다.
- **빌드 산출물 export 계약 명시:** 현재는 `builtModule.DevaiAiddGuardPlugin || builtModule.DevaiGitWorkflowPlugin || builtModule.default`라는 fallback 체인이 코드 안에 암묵적으로만 존재한다. Story 4.5는 이를 명시적 단정으로 분리해 export 계약 변경이 우연히 통과되지 않도록 잠근다.
- **회귀 게이트 자체의 부재 검증:** “dist 산출물이 없는 상태에서 회귀가 명확히 실패하는가”라는 메타-가드를 fixture 기반으로 둔다. 이는 회귀 스위트 자체가 silent skip 되는 사고를 막는다.
- **확장 컨벤션 명문화:** 향후 finalization/recovery/legacy-bridge 변경이 들어올 때, 회귀 함수 네이밍(`verify<Story번호><동작>`), 체인 등록 위치, legacy 비교 제외 규칙을 코드 옆 주석으로 박아 “회귀가 어떻게 자라야 하는지”에 대한 합의를 영속화한다.

### Story 4.3 ↔ Story 4.4 ↔ Story 4.5 경계 (반드시 준수)

- Story 4.3가 정의: 래퍼가 legacy 핸들러를 위임하는 방식, placeholder hook의 명시적 경계, BMAD 명령 호환성 계약.
- Story 4.4가 정의: `dist/devai-aidd-guard.js` 생성 절차, `release/devai-aidd-guard/{versions/<v>,latest}/`의 manifest/checksum/installer 구성, esbuild target/format 결정.
- Story 4.5가 검증: 위 두 계약이 회귀에서 동시에 깨지지 않음을 자동으로 확인. 새 release manifest 필드/installer 동작은 4.5의 단정 범위 밖.
- 새 회귀가 4.3 또는 4.4 중 어느 계약 위반인지 모호할 때는 Story 4.5의 기본 원칙을 따른다: “관찰 가능한 동작(prompt 텍스트, 예외 메시지, hook 셰이프, audit payload 셰이프)”만 단정하고, 내부 빌드 메타데이터/디스크 구조는 단정하지 않는다.

### Epic 1/2/3 회고에서 가져와야 할 학습

- **회귀 함수 누적 패턴은 효과적이다.** Epic 1 회고에 따르면 Story 1.5 시점에 50+ 회귀 함수가 누적되었고, Epic 2/3은 그 baseline 위에서 안전하게 확장했다. 4.5도 동일 패턴으로 “신규 invariant마다 함수 1개 + main 체인 등록 1줄” 컨벤션을 유지한다.
- **wrapper-level integration 회귀가 unit test보다 더 많은 결함을 잡는다.** Epic 2 회고에서 Dana(QA)가 명시했듯, `verifyDeniedApprovalDoesNotHardFailWorkflow` 같은 wrapper 통합 회귀가 orchestrator 단위 테스트가 놓친 결함을 잡았다. 4.5도 wrapper 인스턴스를 직접 부트스트랩해 hook을 호출하는 통합 스타일을 유지한다.
- **이름이 진실해야 한다.** Epic 2 회고 round-3에서 “Task #5 false claim”이 발견됐다. 4.5는 task 본문이 실제 추가 함수와 1:1로 매칭되어야 하며, 추가하지 않은 함수를 task에 적지 않는다.
- **상태 변경과 emission 분리.** Epic 2 회고의 핵심 학습. 4.5도 회귀 함수가 “상태를 set 한 뒤 후속 동작이 그 상태를 읽는” 흐름을 인위적으로 만들지 말고, 실제 wrapper 호출 시퀀스 그대로를 재현한다.
- **`{ outcome, reason, message, details }` envelope이 회귀 비교의 lingua franca.** Story 1.5 이후 모든 정책/실행 결과가 이 형상을 따르므로, 4.5의 신규 단정도 이 envelope을 깨지 않는다.

### 구현 가드레일

- 새 테스트 파일을 만들지 않는다. `tests/regression.test.js` 단일 파일이 회귀 entry point이며, Story 4.5도 이 파일에만 함수를 추가한다.
- `package.json`의 `test` 스크립트는 변경 형태를 유지한다(짧게 줄이거나 build/release `node --check`를 우회하지 않는다). 새 사전 검사가 필요하면 `node --check` 체인 끝에 추가하는 방식만 사용한다.
- 새 의존성을 추가하지 않는다. `assert`, `node:child_process`, `node:fs`, `node:os`, `node:path`, `node:url`만 사용한다(현재 회귀 패턴 그대로). `ajv@8.17.1` 외 새 라이브러리는 도입하지 않는다.
- `dist/devai-aidd-guard.js`의 내부 구현(esbuild output)을 파싱하지 않는다. import 후 동작 비교만 사용한다. minify/transform 결과에 의존하는 정규식 단정은 금지한다.
- legacy 모듈은 `src/policies/legacy/devai-git-workflo.js`에 그대로 존재해야 한다는 invariant가 이미 존재한다(`verifyLegacyBootstrapDependencyPath`). Story 4.5에서 legacy 모듈을 새로 수정하지 않는다.
- `src/index.js`(래퍼)와 `scripts/build.js`/`scripts/make-release.js`는 4.5에서 직접 수정하지 않는다(각각 4.3/4.4 책임). 4.5가 이들 파일에 손을 대야 한다고 느껴지면 그것은 경계 위반이다.
- 회귀 함수 안에서 외부 네트워크 호출(`fetch`, 실 git push 등)을 발생시키지 않는다. 원격은 `https://example.com/repo.git` 더미를 유지한다.
- `import()`로 dist를 적재할 때는 cache-busting 쿼리(`?t=${Date.now()}`)를 유지해 같은 프로세스 내 재빌드 시 최신 산출물이 적재되도록 한다.

### 구현 파일 후보

- 기존 파일 확장 우선
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` — Story 4.5 회귀 함수 추가 + `main()` 체인 등록
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md` — “회귀 게이트로서의 `npm run build && npm test`” 한 줄 보강(이미 존재 시 위치만 유지)
- 손대면 안 되는 파일
  - `src/index.js` (Story 4.3 책임)
  - `src/policies/legacy/devai-git-workflo.js` (legacy invariant)
  - `scripts/build.js`, `scripts/make-release.js` (Story 4.4 책임)
  - `package.json` (`test` 스크립트 형태 변경 금지; 새 dependency 금지)
- 새 파일이 필요하다면
  - 원칙적으로 추가하지 않는다. 회귀는 단일 파일 entry point를 유지한다. 만약 fixture 모듈이 꼭 필요하다면 `tests/` 하위에만 추가하고, 새 디렉터리 도입 대신 단일 파일 fixture를 우선한다.

### 테스트 포인트

- `legacy` / `wrapper` / `built` 세 인스턴스 모두 `command.execute.before`, `tool.execute.before`, `tool.execute.after`, `event`를 등록해야 한다.
- `wrapper` / `built` 두 인스턴스는 추가로 `permission.asked`, `file.edited`를 등록해야 한다(legacy에는 없음).
- workflow 명령에 대한 `command.execute.before` 정규화 출력은 wrapper↔legacy, built↔legacy 모두에서 deepEqual.
- approval prompt summary(`sessionID`, `partCount`, `firstText`, `phase`)는 built↔wrapper에서 deepEqual(legacy 비교 의도적 제외).
- mutating-tool 호출 시 세 변형이 동일한 예외 메시지(`legacyError?.message === wrapperError?.message === builtError?.message`).
- 비-워크플로우 명령에서: wrapper의 출력 parts 길이 === 0, mutating-tool 가드 미발화, `workflow.detected` 감사 이벤트 0건.
- `dist/devai-aidd-guard.js` 부재 시 회귀가 명확한 메시지로 실패해야 한다(silent skip 금지).
- `dist/devai-aidd-guard.js`의 export는 `DevaiAiddGuardPlugin` 또는 `DevaiGitWorkflowPlugin` 또는 `default` 중 최소 하나가 함수여야 한다.
- 새 `verify*` 함수는 `main().then(() => verifyStory45...())` 체인에 “Story 4.5 — wrapper/built regression gate” 코멘트와 함께 등록되어야 한다.
- 회귀 함수가 만든 임시 워크스페이스는 `finally`에서 모두 정리되어야 하며, 외부 네트워크 호출이 없어야 한다.

### Project Structure Notes

- 본 저장소는 brownfield ESM 패키지(Node 22 target, esbuild bundle, ajv 8.17.1)다. 회귀는 `tests/regression.test.js` 단일 파일 entry point를 유지한다(architecture.md “Test Organization” 섹션 참조).
- 빌드 산출물은 `dist/devai-aidd-guard.js`, 릴리스 산출물은 `release/devai-aidd-guard/{versions/<version>,latest}/` 아래에 있다. Story 4.5는 dist 모듈만 import하고, release 디렉터리는 단정 대상으로 삼지 않는다(Story 4.4 책임).
- legacy 모듈은 의도적으로 `src/policies/legacy/devai-git-workflo.js`에 고립되어 있다. 회귀 비교의 1축 baseline 역할이다.
- `architecture.md`의 “구조화 필수 이벤트” 목록(Section 라인 ~337–353)은 회귀가 가드해야 할 audit event 이름의 단일 source of truth다.
- `project-context.md`는 본 저장소에 존재하지 않는다. Story 4.5도 그 대신 PRD/Epics/Architecture/Story 3.5 컨텍스트/실제 회귀 코드 라인을 기준으로 사용한다.

### 최근 커밋 패턴 인텔리전스

- 최근 커밋(`d6f1e4a Merge branch 'epic3/stories'`, `1e5da76 Address Story 3.5 review round 1 follow-ups`, `20941ce Implement Story 3.5 reviewer traceability via standard Git history`, `22b843b Address Story 3.4 review round 1 follow-ups`, `51c2d7b Implement Story 3.4 audit traceability for finalization`)는 “Story 단위 구현 → review round 1 follow-ups → epic merge” 흐름을 따른다.
- Story 3.5는 commit proposal에 `pathScopeSummary`를 추가하면서 회귀 함수 7개를 함께 도입했다. Story 4.5도 같은 패턴(“1 invariant = 1 verify 함수 = 1 main chain 등록”)을 유지한다.
- Epic 3는 review round 1 follow-up이 별도 커밋으로 분리되는 패턴을 정착시켰다. 4.5도 코드 리뷰에서 LOW가 발견되면 같은 세션에서 auto-fix하되, follow-up 커밋이 발생하면 “Story 4.5 round-1 follow-ups”로 분리한다.

### Latest Tech Information

- Node.js 22 ESM, esbuild 번들(`--bundle --platform=node --format=esm --target=node22`)이 현재 빌드 표준이다. Story 4.5는 esbuild 또는 Node 버전 자체를 가드하지 않는다(Story 4.4 책임). 4.5는 빌드 산출물이 **존재하고 동작 면에서 wrapper와 동등하다**는 사실만 단정한다.
- `ajv@8.17.1` 외 dependency는 도입되지 않았다. 4.5는 새 dependency를 도입하지 않으며, 회귀 함수 안에서도 표준 `node:` 모듈만 사용한다.
- esbuild는 ESM export 이름을 보존한다. 따라서 `DevaiAiddGuardPlugin` 등의 export가 dist에서도 동일한 이름으로 노출되어야 한다는 단정은 안전하다(이름 mangling 가능성 없음).
- `git`은 OS 글로벌 설치본을 사용하지만, 회귀는 임시 워크스페이스 안에서 `git init`/`git remote add`만 수행하고 외부 push는 하지 않는다(NFR4/NFR6 준수).

### References

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md` — Epic 4, Story 4.1 ~ 4.5 정의 및 Additional Requirements “regression suite that compares wrapper behavior and built artifact behavior against the legacy plugin”
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md` — FR29(BMAD command compatibility), NFR10(supported runtime parity)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md` — Test Organization, 구조화 필수 이벤트 목록, build/release/installer 구조
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\epic-1-retro-2026-05-09.md` — “regression coverage every story landed real assertions” 학습
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\epic-2-retro-2026-05-09.md` — wrapper-level integration 회귀의 가치, 라운드별 회귀 누적 패턴
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\3-5-preserve-reviewer-traceability-through-standard-git-history.md` — 한국어 스토리 컨벤션 + Story 단위 회귀 누적 패턴
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` — `verifyBuiltArtifactExists`, `verifyLegacyBootstrapDependencyPath`, `main()`, `runCommandExecuteBefore`, `runToolMutatingBefore`, `summarizePrompt`, `normalizeOutputParts`, Story 1.x ~ Story 3.5 회귀 함수 체인
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\package.json` — `test` 스크립트 정의(node --check + regression.test.js)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\build.js` — esbuild 번들 entry → `dist/devai-aidd-guard.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\make-release.js` — release manifest/checksum (Story 4.4 책임 범위; 4.5는 단정 대상 아님)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js` — 래퍼 bootstrap 및 hook map 정의(Story 4.3 책임 범위)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\policies\legacy\devai-git-workflo.js` — legacy baseline (회귀 비교 1축)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\dist\devai-aidd-guard.js` — built 산출물 (회귀 비교 1축)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md` — 회귀 게이트 안내 위치 보존 대상

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — bmad-dev-story workflow

### Debug Log References

- `npm test` exit 0 (legacy-vs-wrapper / legacy-vs-built parity passed; mutatingToolError 문자열 byte-for-byte 일치; wrapperLogs == builtLogs == 8; 신규 Story 4.5 회귀 7건 모두 통과)
- `npm run build` exit 0
- `npm run release` exit 0

### Completion Notes List

- Story 4.5 회귀 블록 7개 함수를 `tests/regression.test.js` 하단에 추가하고 `main().then(...)` 체인에 “Story 4.5 — wrapper/built regression gate” 코멘트와 함께 등록.
- Story 4.3 R2에서 이관된 두 액션 아이템을 본 스토리에서 회귀로 잠금:
  - **M-1 본체**: `verifyStory45LegacyWrapperBuiltHandlerShapesMatch()`가 `SUPPORTED_HOOK_KEYS` 상수와 wrapper/built의 실제 hook map 키 set-equal을 단언하고, `WRAPPER_ONLY_HOOK_KEYS` ⊆ `SUPPORTED_HOOK_KEYS` ∧ legacy disjointness까지 함께 잠금.
  - **L-3**: `verifyStory45SrcIndexAuditEventListMatchesEmissions()`가 `src/index.js` JSDoc 헤더 audit-event 목록과 본문 `audit.info("<name>", ...)` 호출 set의 양방향 set-equal을 단언.
- 회귀 함수 안에서 새 의존성 도입 없음 — `assert`, `node:fs`, `node:os`, `node:path`, `node:url`, `node:child_process`만 사용.
- `src/index.js`, `src/policies/legacy/devai-git-workflo.js`, `scripts/build.js`, `scripts/make-release.js`, `package.json`은 Story 4.5에서 직접 수정하지 않음(각각 4.3/4.4 책임 + 가드레일 준수).
- `verifyStory45RegressionGateAbortsWithoutBuiltArtifact`는 실제 `dist/`를 건드리지 않고 임시 fixture 경로의 부재 검증으로 silent-skip 사고를 차단.
- README에 “리팩터링/릴리스 전 `npm run build && npm test` 회귀 게이트” 한 단락을 빌드/릴리스 섹션 위에 보강(기존 위치 보존).
- 임시 워크스페이스는 `story45InstantiateAllThree().cleanup()` 또는 `finally fs.rmSync` 패턴으로 모두 정리. 외부 네트워크/원격 git push 호출 0건. cache-busting 쿼리(`?t=${Date.now()}`) 사용 패턴 준수.

### File List

- Modified: `tests/regression.test.js` — Story 4.5 회귀 헤더 + 7개 신규 verify 함수 + main 체인 7줄 등록 + R2 follow-ups (H-1/M-1/M-2/M-3/L-2/L-4/L-5 mitigations + `verifyBuiltArtifactExists` DI refactor + `runCommandExecuteBefore`/`runToolMutatingBefore` sessionID 파라미터화). 누적 +710 라인 (-8 라인).
- Modified: `README.md` — “회귀 게이트로서의 `npm run build && npm test`” 한 단락을 “빌드와 릴리스” 섹션에 보강

### Review Round 2 (Adversarial Code Review) — 2026-05-10

라운드 1 어드버서리얼 리뷰 결과: 0 CRITICAL / 1 HIGH / 3 MEDIUM / 5 LOW. 보고서: `_bmad-output/implementation-artifacts/4-5-code-review-action-items.md`.

R2 자동 수정 결과 (모두 동일 세션 내 처리):

- **H-1 (HIGH) 해결**: `verifyStory45RegressionGateAbortsWithoutBuiltArtifact`를 tautological `assert.equal(false, true, "<MESSAGE>")` 패턴에서 실제 `verifyBuiltArtifactExists()` 호출로 재작성. (1) 음성 경로에서 `existsSyncFn: () => false` 주입 + 메시지 정규식 단언, (2) 양성 컨트롤로 `existsSyncFn: () => true` 주입 후 throw 안함을 확인, (3) `verifyBuiltArtifactExists.toString()`이 `assert.equal` / `existsSync` / 경로 hint / `npm run build` hint 모두 포함하는지 source-contract 단언, (4) fixture 경로 미생성 부작용 0 단언. `verifyBuiltArtifactExists`는 `{ existsSyncFn, builtPath }` 주입을 허용하도록 리팩터(기존 `main()` 호출은 무인자라 호환).
- **M-1 (MEDIUM) 해결**: `verifyStory45BuiltArtifactPromptParityWithWrapper`에 `wrapperPrompts.length >= 1` 및 `builtPrompts.length >= 1` precondition 추가 — 미래에 prompt emission이 silently 끊기더라도 `[]` vs `[]` deepEqual 통과 사고 차단.
- **M-2 (MEDIUM) 해결**: `verifyStory45LegacyWrapperBuiltMutatingToolGuardParity`에 "비-워크플로우 command 발화 후 가드 미발화" 부정 분기를 legacy/wrapper/built 3변형 모두에 추가. `command.execute.before`로 비-워크플로우 명령(`/non-workflow-command-not-registered`) 실행 후 `parts.length === 0` precondition + `runToolMutatingBefore` no-throw 단언.
- **M-3 (MEDIUM) 해결**: `runCommandExecuteBefore`/`runToolMutatingBefore`를 `{ sessionID, command, argumentsText }` 파라미터화. 모든 Story 4.5 verifier가 unique sessionID 사용 (`verifyStory45-prompt-parity-cmd`, `verifyStory45-mutating-positive`, `verifyStory45-mutating-neg-no-command`, `verifyStory45-mutating-neg-nonwf-command`, `verifyStory45-prompt-parity`). 기본값 `"session-1"`은 보존되어 기존 호출자 영향 0.
- **L-2 (LOW) 해결**: 부정 trio의 임시 워크스페이스 생성을 `try{}` 내부 `createdWorkspaces.push(ws)` 패턴으로 이관. partial-failure 누수 footgun 제거.
- **L-4 (LOW) 해결**: `verifyStory45LegacyWrapperBuiltHandlerShapesMatch`에 `STORY_45_LEGACY_HOOK_KEYS === SUPPORTED_HOOK_KEYS \ WRAPPER_ONLY_HOOK_KEYS` 양방향 set-equal 단언 추가. 로컬 상수가 SOT에서 derive 되지 않더라도 SOT 추가 시 유지보수 누락이 잡힘.
- **L-5 (LOW) 해결**: `verifyStory45SrcIndexAuditEventListMatchesEmissions` JSDoc에 info-only 스코프 명시 + `audit.error("plugin bootstrap failed", ...)` 의도적 제외 사유 + 향후 `audit.warn` 등 도입 시 verifier 동시 갱신 의무 명시.
- **L-1 (LOW) 스킵 사유**: `verifyStory45BuiltArtifactPromptParityWithWrapper`는 `main()` lines 343–347과 deepEqual 형태가 같지만 M-1 mitigation으로 `length >= 1` precondition이 추가되어 단순 중복이 아니게 됨. 스토리 sub-task("격리 단위로 잠근다")가 명시한 격리 책임 자체가 통과 → 별도 리팩터링 불필요.
- **L-3 (LOW) 스킵 사유**: 본 스토리의 File List/스토리 본문이 "약 +400 라인"이라 명시했으나 R2 누적 후 +710 라인. 추정치였음을 그대로 두기보다 본 라운드 노트에서 "누적 +710 라인 (-8 라인)" 명시로 traceability 보강.

**변이(mutation) 검증 결과** — H-1/M-1/M-2 가드가 의도된 회귀에 실제로 실패함을 동일 세션에서 직접 시연:

| 변이 | 결과 |
|---|---|
| `verifyBuiltArtifactExists` 본문 비우기 (silent skip) | H-1 verifier가 `negative path threw=null` 으로 실패 (exit 1) ✅ |
| `verifyBuiltArtifactExists` 메시지에서 "npm run build" 제거 | H-1 verifier가 `assert.match` 정규식 미스매치로 실패 ✅ |
| 프롬프트 parity verifier에서 `wrapper.mock.prompts.length = 0` 강제 | M-1 verifier가 `length >= 1` precondition으로 실패 ✅ |
| 비-워크플로우 명령을 `/bmad-bmm-quick-dev`로 바꿈 (워크플로우 활성화) | M-2 verifier가 `parts.length === 0` precondition으로 실패 ✅ |

`npm test` exit 0; `npm run build` exit 0 (R2 후 dist 재빌드).

### Change Log

- 2026-05-10: Story 4.5 dev-story 구현 완료. wrapper/built 회귀 게이트 7개 verify 함수 추가, Story 4.3 R2 이관 액션 아이템(M-1 본체, L-3) 회귀로 흡수, README 회귀 게이트 한 단락 보강. Status `in-progress` → `review`.
- 2026-05-10: Story 4.5 R2 review follow-ups 적용 — H-1 (hollow meta-guard) 실제 함수 호출 + DI 기반 검증으로 재작성, M-1 (vacuous deepEqual) length precondition, M-2 (non-workflow command negative path) legacy/wrapper/built 3변형 추가 부정 분기, M-3 (sessionID footgun) 헬퍼 파라미터화 + 모든 verifier unique sessionID, L-2 워크스페이스 누수 가드, L-4 STORY_45_LEGACY_HOOK_KEYS SOT-derived 교차 단언, L-5 audit-event 스코프 JSDoc 명시. 변이 테스트 4건 모두 mutation kill 확인. Status `review` → `done`.
