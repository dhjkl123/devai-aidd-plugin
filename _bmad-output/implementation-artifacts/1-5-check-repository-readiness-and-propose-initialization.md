# Story 1.5: Check Repository Readiness and Propose Initialization

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want the plugin to check whether my working directory is Git-ready before automation begins,
so that I can choose initialization or continue safely with full awareness of repository constraints.

## Acceptance Criteria

1. **Given** the workflow starts in a directory that is not an initialized Git repository
   **When** readiness checks run
   **Then** the plugin detects the missing repository state and prepares an initialization proposal
   **And** no `git init` action is executed until the user explicitly approves it.
2. **Given** the workflow starts in a valid repository
   **When** readiness checks inspect the environment
   **Then** the plugin detects branch and remote prerequisites relevant to startup automation
   **And** it reports repository readiness without adding unnecessary delay to the BMAD workflow.

## Tasks / Subtasks

- [ ] `src/services/git/` 디렉터리에 readiness 점검 모듈을 신설한다 (AC: 1, 2)
  - [ ] `src/services/git/check-repository-readiness.js`를 만들고 `checkRepositoryReadiness({ directory, fsAdapter, gitRunner })`를 export한다. 이 함수는 read-only로만 동작하며 정책 결과 표준 형식 `{ outcome, reason, message, details }`을 반환한다. `outcome` 값은 `allow | deny | ask | skip` 중에서만 사용한다 (아키텍처 규약).
  - [ ] `details`에 `isGitRepository: boolean`, `branch: string|null`, `hasRemote: boolean`, `remoteNames: string[]`, `directory: string`, `checkedAt: ISO-8601` 키를 포함한다.
  - [ ] `src/services/git/build-init-proposal.js`를 만들고 `buildInitProposal({ directory, reason })`를 export한다. 반환 형식은 `{ kind: "init", action: "git-init", directory, reason, requiresApproval: true, message, details }`로 고정한다.
  - [ ] `src/services/git/run-git-command.js`(또는 동일 역할의 helper)를 만들어 `node:child_process`의 `execFileSync`를 timeout 옵션과 함께 감싼다. 호출 가능 명령은 read-only 화이트리스트로 제한한다: `git rev-parse --is-inside-work-tree`, `git symbolic-ref --short HEAD`, `git remote -v`. 그 외 인자는 거부한다.

- [ ] readiness 검사 로직을 명세에 맞게 구현한다 (AC: 1, 2)
  - [ ] 1단계: `git rev-parse --is-inside-work-tree`를 호출해 저장소 여부를 판정한다. 실패하거나 stdout이 `true`가 아니면 비-저장소로 간주한다.
  - [ ] 비-저장소인 경우 `outcome: "ask"`, `reason: "git-not-initialized"`로 결과를 만들고 `buildInitProposal`로 init proposal을 동시 생성해 `details.proposal`에 첨부한다. `git init` 자체는 절대 실행하지 않는다 (NFR3, FR9).
  - [ ] 저장소인 경우 `git symbolic-ref --short HEAD`로 현재 브랜치를, `git remote -v`로 원격 목록을 조회해 `branch`, `hasRemote`, `remoteNames`를 채운다. 결과는 `outcome: "allow"`, `reason: "repository-ready"`로 보고한다.
  - [ ] 모든 git 호출에는 timeout(예: 1500ms)을 적용한다. timeout, 비-zero exit, ENOENT(git 미설치) 등 모든 예외는 fallback으로 흡수해 `outcome: "skip"`, `reason: "readiness-check-unavailable"`을 반환하고 워크플로우를 막지 않는다 (NFR1, NFR7).
  - [ ] readiness 함수는 부수효과(파일 생성, mutation)를 일으키지 않으며 어떠한 git mutation 명령도 실행하지 않는다.

- [ ] 워크플로우 시작 시점에만 readiness 검사를 실행하도록 가드한다 (AC: 1, 2)
  - [ ] `src/hooks/command-execute-before.js`에서 `detectWorkflowContext`(Story 1.2)가 `null`이 아닌 경우에만 readiness 검사를 호출한다. 비-워크플로우 명령에서는 readiness 검사를 절대 수행하지 않는다.
  - [ ] readiness 검사는 Story 1.3의 effective config 결과를 인자로 받아, `policy.requiresRemote === false`인 경우 원격 검사 단계를 생략할 수 있게 분기한다 (NFR1 보호).
  - [ ] readiness 결과가 `outcome: "ask"`(init proposal 보유)인 경우 wrapper는 init proposal 객체를 workflow state(`workflow-state.js`의 컨텍스트)에 보관만 하고 hook return 값에는 포함하지 않는다. 실제 사용자 노출과 승인 요청은 Epic 2 Story 2.1이 담당한다.
  - [ ] 시작(`phase: "start"`) 1회에 한해 readiness 검사를 수행하고 같은 sessionID에서 in-progress 단계 진입 후에는 재실행하지 않는다 (NFR1 지연 최소화).

- [ ] 구조화된 audit 이벤트를 기록한다 (AC: 1, 2)
  - [ ] readiness 결과가 결정될 때 `git.readiness.checked` 이벤트를 `audit.info(...)`로 1회 기록한다. payload는 아키텍처 표준 envelope을 따른다: `{ event, timestamp, workflow, command, outcome, details: { isGitRepository, hasRemote, branch, durationMs } }`.
  - [ ] init proposal이 생성된 경우 `git.action.planned` 이벤트를 best-effort로 기록한다 (`details.kind: "init"`, `details.requiresApproval: true`). 실제 `approval.requested` 발행은 Epic 2가 소유한다.
  - [ ] payload에 절대 원격 URL 전체, 토큰, 절대 파일경로를 포함하지 않는다 (NFR4, NFR5). `remoteNames`는 이름만(`origin` 등) 기록한다.
  - [ ] audit 호출 실패는 best-effort로 흡수해 워크플로우 흐름을 차단하지 않는다.

- [ ] 회귀 테스트와 fixture를 확장한다 (AC: 1, 2)
  - [ ] `tests/regression.test.js`에 다음 fixture 케이스를 추가한다:
    - 케이스 A: 임시 디렉터리에 `.git`이 없는 상태 → readiness 결과가 `outcome: "ask"`, `reason: "git-not-initialized"`이고 `details.proposal.kind === "init"`인지 검증.
    - 케이스 B: 임시 디렉터리에서 `git init`을 직접 호출해 저장소를 만든 뒤(테스트 셋업이지 플러그인 동작 아님) readiness 결과가 `outcome: "allow"`, `details.isGitRepository === true`, `details.hasRemote === false`인지 검증.
    - 케이스 C: 비-워크플로우 명령(`/non-workflow-command`)으로 `command.execute.before`를 호출했을 때 readiness 검사가 호출되지 않고 audit에 `git.readiness.checked`가 없는지 검증.
  - [ ] readiness 호출 1회의 wall-clock 소요가 NFR1 임계(예: 500ms)를 넘지 않는지 wrapper 케이스에서 측정해 어서트한다. 측정은 `process.hrtime.bigint()`로 한다.
  - [ ] git 미설치 환경 시뮬레이션: `gitRunner`를 의존성 주입할 수 있게 하여 항상 ENOENT를 던지는 stub을 통과시켰을 때 결과가 `outcome: "skip"`, `reason: "readiness-check-unavailable"`인지 검증한다.
  - [ ] 기존 legacy parity 어서트(`normalizeOutputParts` deepEqual, mutating-tool error 메시지)는 회귀 없이 그대로 통과해야 한다.

- [ ] 빌드와 런타임 계약을 검증한다 (AC: 1, 2)
  - [ ] clean checkout에서 `npm run build && npm test`가 모두 통과해야 한다.
  - [ ] 새로 추가된 `src/services/git/*.js` 모듈이 esbuild에 의해 `dist/devai-aidd-guard.js`에 inlining되는지 빌드 결과로 확인한다.
  - [ ] `git init`이 실제로 호출되는 경로가 코드 어디에도 없는지 grep 기반으로 자체 점검한다 (Epic 2 승인 흐름까지는 mutation 금지).

## Dev Notes

### Story Intent

이 스토리는 Epic 1의 마지막 스토리로서 readiness 검사를 정착시키는 것이 목적이다. 동시에 Epic 2의 첫 approval 입력이 될 init proposal 객체를 만들어 두는 다리 역할을 한다. Story 1.5는 검사와 proposal 생성까지만 담당하며, 실제 `git init` 실행, 사용자 승인 프롬프트 노출, 승인 결과 처리(accept/deny/ignore)는 Epic 2(Story 2.1~2.3)와 그 후속 Story 3.x의 책임이다. 이 경계를 흐리지 말고 readiness 검사 + init proposal 표현만 구현하라.

### Verified Baseline Findings

- 현재 저장소에는 `src/services/` 트리가 아직 없으며 Story 1.2가 `src/services/workflow/`만 추가할 예정이다. 따라서 `src/services/git/`는 이 스토리에서 처음 생성되는 디렉터리다 (architecture target structure 참조).
- 현재 어떤 git CLI 호출도 코드베이스 어디에서도 일어나지 않는다. `src/policies/legacy/devai-git-workflo.js`는 `node:fs`/`node:path`만 사용하고, `src/adapters/fs.js`도 git을 호출하지 않는다. 즉 이 스토리는 git CLI를 코드베이스에 처음 도입한다.
- `src/index.js`는 이미 `runtimeConfig`(`loadRuntimeConfig`의 결과)와 `workflowCommands`를 보유한 채 hook을 조립하므로, readiness 검사가 필요로 하는 `directory`와 effective config를 hook factory에 주입하는 것은 자연스럽다.
- `tests/regression.test.js`는 임시 디렉터리(`createTempWorkspace`)와 mock client(`createMockClient`)를 이미 사용하고 있어 readiness 검사 fixture를 확장하기 좋은 토대다. 빌드 산출물 검증(`dist/devai-aidd-guard.js`)도 이미 강제되고 있다.
- Story 1.1의 audit 베이스라인(`audit.info("plugin bootstrap registered no-op hooks", ...)`)이 보여주듯 의미 있는 상태 결정마다 audit을 남기는 패턴이 정착되어 있다. readiness 결정도 동일 패턴을 따른다.

### Technical Requirements

- `node:child_process`는 read-only git 명령에만 사용한다. 허용 명령 화이트리스트는 다음 세 개로 고정한다:
  - `git rev-parse --is-inside-work-tree`
  - `git symbolic-ref --short HEAD`
  - `git remote -v`
  그 외 인자/옵션은 helper 안에서 거부해 우발적 mutation 호출(예: `git init`, `git checkout -b`)이 들어올 길을 차단한다.
- 모든 git 자식 프로세스는 `timeout` 옵션(권장 1500ms)을 강제하고, `cwd`는 항상 `directory` 인자로 명시한다. 환경변수 상속은 최소화하고 `GIT_TERMINAL_PROMPT=0`을 설정해 자격 증명 프롬프트가 워크플로우를 멈추지 않게 한다 (NFR1, NFR2 보호).
- 작업 디렉터리는 반드시 `assertBootstrapEnvironment`에서 검증된 `directory` 인자를 사용한다. `process.cwd()`를 직접 읽지 않는다 (NFR6: 의도하지 않은 저장소 범위 사용 금지).
- readiness 검사는 시작 phase 1회로 제한한다. in-progress 또는 finish phase에서는 호출하지 않는다. 같은 sessionID에 대한 재호출은 캐시된 결과를 반환해 추가 시스템 콜이 발생하지 않게 한다 (NFR1).
- 어떤 경우에도 readiness 검사가 throw하지 않는다. 내부 예외는 모두 fallback 결과(`outcome: "skip"`, `reason: "readiness-check-unavailable"`)로 흡수한다. 상위 hook이 검사 실패 때문에 멈추는 일은 없어야 한다 (NFR7, FR22).
- `git init`은 본 스토리에서 절대 실행하지 않는다. 코드와 테스트 어디에도 mutation 호출 경로가 없어야 하며, init proposal 객체를 생성하는 것이 검사의 종착점이다 (FR9, NFR3, NFR12).

### Architecture Compliance

- 폴더 배치: 새 코드는 `src/services/git/` 아래에만 둔다. 훅 안에서 직접 git CLI를 호출하지 않고, 훅은 검사 함수를 호출하고 결과를 정책 객체로 받는 패턴을 지킨다 (architecture "File Structure Patterns").
- 정책 결과 표준 형식 `{ outcome, reason, message, details }`을 그대로 사용한다. `outcome` 문자열은 `allow | deny | ask | skip` 네 개 외에 새로운 값을 추가하지 않는다 (architecture "Format Patterns → API Response Formats").
- 이벤트명은 `dot.case`. 본 스토리에서 emit하는 이벤트는 `git.readiness.checked`와 (init proposal 생성 시) `git.action.planned`다. Payload는 `{ event, timestamp, workflow, command, outcome, details }`을 따른다 (architecture "Communication Patterns → Event System Patterns").
- Init proposal은 architecture "Authentication & Security"가 정의한 action category 중 `init`에 해당한다. action category 표(`branch/create, branch/switch, commit, push, init, finalize`) 안에 머무르며 새 카테고리를 만들지 않는다.
- approval-governed Git execution 패턴을 그대로 준수한다: 본 스토리에서 작성하는 `requiresApproval: true` 플래그는 Epic 2 approval policy service의 입력 계약이 된다. wrapper 안에서 직접 사용자 승인을 가져오는 코드를 만들지 않는다.
- 파일명은 `kebab-case.js`, 함수명은 `camelCase`, 이벤트명은 `dot.case`, 결과 상수는 고정 문자열만 사용한다 (architecture "Naming Patterns").

### Library / Framework Requirements

- 외부 npm 의존성 추가 금지. 모든 동작은 Node 22 빌트인 모듈만으로 구현한다.
  - `node:child_process` (`execFileSync` 또는 `spawnSync`)로 git CLI 호출
  - `node:fs`, `node:path`로 디렉터리 조회 (필요 시 빠른 사전 검사: `.git` 디렉터리 존재 여부)
  - `node:url`, `node:os`는 fixture/테스트에서만 사용
- 빌드 타깃은 esbuild ESM Node 22를 그대로 유지한다 (Story 1.1과 동일). `scripts/build.js` 변경은 필요하지 않다. 새 `src/services/git/*.js` import는 esbuild가 자동으로 inline 한다.
- git 자체는 외부 시스템 의존성이다. git이 PATH에 없거나 실행 권한이 없는 환경을 정상 fallback 케이스로 다룬다 (위 ENOENT 처리 참조).

### File Structure Requirements

- 신규 파일:
  - `src/services/git/check-repository-readiness.js` — readiness 검사 진입점, 정책 결과 표준 형식 반환.
  - `src/services/git/build-init-proposal.js` — init proposal 객체 생성.
  - `src/services/git/run-git-command.js` — read-only git 명령 화이트리스트 helper. timeout, cwd, env 안전 기본값을 캡슐화한다.
- 수정 파일:
  - `src/index.js` — readiness 검사용 git runner를 hook factory에 주입한다. `runtimeConfig`도 함께 전달한다.
  - `src/hooks/command-execute-before.js` — Story 1.2의 `detectWorkflowContext` 결과가 truthy일 때만 readiness 검사를 호출하도록 확장한다. 비-워크플로우 명령은 그대로 단락된다.
  - `tests/regression.test.js` — 위 Tasks의 케이스 A/B/C와 NFR1 지연 임계 검증, ENOENT fallback 검증을 추가한다. 기존 legacy parity 어서트는 변경하지 않는다.
- 신규 폴더 생성 금지 항목: `src/events/`, `src/commands/`, `src/services/approval/`은 본 스토리에서 만들지 않는다(각각 Story 2.1과 후속 Epic이 소유). `src/services/git/`만 만든다.
- legacy core(`src/policies/legacy/devai-git-workflo.js`)는 본 스토리에서 손대지 않는다. legacy parity 회귀를 깨면 안 된다.

### Testing Requirements

- 필수 검증 명령: `npm run build && npm test` (Story 1.1/1.2 계약 유지).
- 회귀 fixture는 임시 디렉터리에서 외부 git CLI를 실제 호출해도 무방하다. 단, fixture 셋업으로 호출하는 `git init`은 플러그인 동작이 아니라 테스트 환경 준비임을 주석으로 명시한다.
- CI 환경에 git이 설치되어 있다는 보장이 없을 가능성에 대비해, ENOENT를 던지는 `gitRunner` stub을 주입하는 케이스를 명시적으로 두어 fallback 경로가 항상 회귀로 검증되도록 한다.
- NFR1 지연 임계는 단일 호출 1회 기준이며 wrapper 인스턴스에서만 측정한다. legacy 인스턴스에는 readiness 검사가 없으므로 대상이 아니다.
- audit payload는 정확한 timestamp 값 대신 SHAPE(필드 존재 여부와 타입)만 어서트한다. 비결정적 값(timestamp, durationMs)은 정규식이나 타입 체크로만 확인한다.
- 새 contract test 폴더(`tests/contracts/`, `tests/integration/`)는 도입하지 않는다. Story 1.1/1.2의 패턴을 따라 `tests/regression.test.js`만 확장한다.

### Previous Story Intelligence

- Story 1.1(`_bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md`): wrapper 계층(`src/index.js` + `src/hooks/*.js`)이 새 오케스트레이션의 정착지이며 legacy core는 parity baseline으로 보존한다는 원칙을 정립했다. readiness 검사 호출도 이 원칙을 따른다 — 검사 호출은 wrapper hook에서, 검사 로직은 `src/services/git/`에서.
- Story 1.1: hook factory는 `legacyHandlers["…"]` 직접 접근 스타일을 사용한다. 새 wrapper 코드도 동일 스타일을 유지한다.
- Story 1.1: 의미 있는 상태 결정에는 audit 흔적을 남기는 정책이 굳어졌다 (`plugin bootstrap registered no-op hooks` 사례). readiness 결정에도 동일하게 `git.readiness.checked` audit 한 줄을 남긴다.
- Story 1.2(`_bmad-output/implementation-artifacts/1-2-detect-bmad-workflow-commands-and-runtime-context.md`): `detectWorkflowContext`와 `workflow-state.js`가 본 스토리의 입력 계약이다. readiness 검사는 detect 결과가 non-null일 때만 트리거되며, 결과(`outcome` + 옵션 `details.proposal`)는 `workflow-state`의 컨텍스트에 첨부한다.
- Story 1.2가 정의한 `phase: "start" → "in-progress"` 전이를 그대로 활용해 readiness 검사를 시작 phase 1회로 제한한다.
- Story 1.3(`_bmad-output/planning-artifacts/epics.md` Story 1.3): effective config(branch defaults + workflow policy mapping)가 readiness 검사의 두 번째 입력이다. 원격 검사 필요 여부, init proposal의 `reason` 메시지 톤은 effective config의 `workflowPolicy[command]` 값에 의존한다. 본 스토리는 Story 1.3이 만든 effective config를 소비하기만 하며, config 머지 책임은 Story 1.3이 보유한다.
- Sprint change proposal(`_bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md`): 런타임 부트스트랩이 mutation을 일으키지 말라는 원칙은 readiness 검사에도 그대로 적용된다. readiness 검사는 read-only이며, init mutation은 install/setup 또는 사용자 승인된 Epic 2 흐름의 책임이다.

### Git Intelligence Summary

- 직전 5개 커밋(`dfaf0d9`, `576fa74`, `110a0ac`, `e2bf242`, `3e4a1d9`)은 모두 planning/sprint 산출물 변경이다. 본 스토리는 Story 1.1, 1.2, 1.3, 1.4가 적용된 후의 wrapper 코드를 출발점으로 삼는다.
- 현재 작업 브랜치는 `codex/bmad/epic1/story1-1`이다. 새 브랜치 생성/전환은 Epic 1/Epic 2 자동화의 책임이며 본 스토리가 직접 처리하지 않는다.
- legacy core에는 git 호출이 전혀 없다. 본 스토리가 코드베이스에 처음으로 git CLI 호출을 도입하는 만큼 화이트리스트 helper를 단일 진입점으로 강제해 후속 스토리가 자유롭게 git 호출을 늘리지 못하도록 안전 가드를 만든다.

### Project Structure Notes

- architecture 문서가 묘사하는 더 큰 폴더 구조(`src/services/approval/`, `src/services/workflow/`, `src/services/git/`, `src/events/`, `src/commands/`)는 점진적으로만 생성한다. 본 스토리는 `src/services/git/`만 새로 만든다.
- Epic 2와의 경계: 본 스토리가 만드는 init proposal은 Epic 2 Story 2.1(승인 요청 발행), Story 2.2(의도/영향 설명), Story 2.3(accept/deny/ignore 선택)의 입력이 된다. 본 스토리에서는 사용자에게 직접 승인 프롬프트를 띄우지 않고, proposal 객체만 workflow context에 보관한다.
- Epic 2/3과의 경계: 실제 `git init` 실행과 그에 따른 후속 액션(첫 커밋, 브랜치 생성)은 Epic 2 승인 결과 처리와 Epic 3(Story 3.x finalization)이 책임진다. 본 스토리에서는 mutation을 시도조차 하지 않는다.
- legacy compatibility bridge 생성(`ensureLegacyProjectConfigCompatibility`)은 Story 4.2의 책임이다. readiness 검사는 그 동작과 독립적으로 수행된다.

### References

- Epic 1 정의 및 Story 1.5 AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5: Check Repository Readiness and Propose Initialization]
- 기능/비기능 요구사항: [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements] (FR9, FR10, FR11, FR13; NFR1, NFR3, NFR4, NFR5, NFR6, NFR7, NFR11, NFR12, NFR13)
- 아키텍처 폴더 구조: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- 정책 결과 객체 표준 형식: [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns]
- 이벤트 envelope 및 dot.case 규약: [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns]
- approval action category(`init` 포함): [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- bootstrap mutation 금지 원칙: [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md]
- Story 1.1 wrapper/legacy 분리 패턴: [Source: _bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md]
- Story 1.2 workflow context와 phase 전이: [Source: _bmad-output/implementation-artifacts/1-2-detect-bmad-workflow-commands-and-runtime-context.md]
- bootstrap 베이스라인: [Source: src/index.js]
- 파일시스템 어댑터 베이스라인: [Source: src/adapters/fs.js]
- legacy core 베이스라인(unchanged 대상): [Source: src/policies/legacy/devai-git-workflo.js]
- hook 진입점 베이스라인: [Source: src/hooks/command-execute-before.js], [Source: src/hooks/session.js]
- 기본 정책/설정 매핑: [Source: src/config/defaults.js]
- 회귀 테스트 베이스라인: [Source: tests/regression.test.js]
- Node.js child_process 공식 문서: [Source: https://nodejs.org/api/child_process.html]
- Git rev-parse 문서(`--is-inside-work-tree`): [Source: https://git-scm.com/docs/git-rev-parse]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
