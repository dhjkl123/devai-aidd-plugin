# Story 1.4: Compute Branch Strategy and Candidate Branch Names

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want the system to compute the appropriate branch behavior for the active workflow,
so that branch creation or switching follows the configured naming and policy rules automatically.

## Acceptance Criteria

1. **Given** a workflow command has been identified and policy has been resolved
   **When** the plugin evaluates branch behavior for that workflow
   **Then** it determines whether a branch is required, optional, or unnecessary for the workflow
   **And** it computes a candidate branch name from configured command type, ticket context, fallback values, and slug rules.
2. **Given** the current branch is long-lived or does not satisfy the workflow policy
   **When** branch evaluation runs
   **Then** the plugin prepares a branch creation or switch proposal instead of silently mutating Git state
   **And** the proposal preserves user approval as a separate later step.

## Tasks / Subtasks

- [ ] `branch-service`를 신규 모듈로 추출한다 (AC: 1, 2)
  - [ ] `src/services/git/branch-service.js`를 생성하고 다음 두 개의 순수 함수를 export 한다.
    - `evaluateBranchStrategy({ workflowContext, workflowPolicy, branchConfig, currentBranch })` → `{ requirement: "required" | "optional" | "unnecessary", reason, policyMatch }` 반환.
    - `computeCandidateBranchName({ workflowContext, workflowPolicy, branchConfig })` → 문자열 후보 브랜치명 또는 `null` 반환.
  - [ ] 두 함수 모두 I/O와 부수효과(콘솔, 감사 로그, git 호출, 파일 시스템)를 수행하지 않는 순수 함수로 작성한다. 시간이 필요할 경우 호출자가 `detectedAt`를 주입한다.
  - [ ] 동일 모듈에서 슬러그 정규화 헬퍼 `slugifyArguments(value, { fallback })`을 export 한다. 규칙: `toLowerCase` → 공백/언더스코어를 `-`로 치환 → `[a-z0-9-]` 외 문자 제거 → 연속된 `-` 압축 → 양 끝의 `-` 제거 → 결과가 빈 문자열이면 `fallback`을 사용.
  - [ ] 티켓 추출 헬퍼 `extractTicketToken(args, { fallbackTicket })`을 export 한다. 규칙: `[A-Z]+-\d+` 정규식으로 인자 문자열에서 첫 매치를 사용, 없으면 `branchConfig.fallbackTicket` 사용.

- [ ] 브랜치 전략 판정 로직을 구현한다 (AC: 1)
  - [ ] `workflowPolicy.branchRequired === true` → `requirement: "required"`.
  - [ ] `workflowPolicy.branchRequired === false`이면서 `workflowPolicy.category`가 `"implementation"`인 경우는 `optional`(현재 `defaults.js`의 정책 표에는 해당 조합이 없으므로 안전한 fallback 정의 목적)로, 그 외는 `unnecessary`로 판정한다.
  - [ ] `workflowPolicy`가 `null`/`undefined`(Story 1.3 resolver가 정책 매핑 미스를 반환한 경우) → `requirement: "unnecessary"`, `reason: "no-policy-match"`.
  - [ ] `policyMatch`에는 사용된 `commandName`, `category`, `identityStrategy`, `branchRequired`, `finalization` 다섯 필드를 그대로 담아 다운스트림 감사/승인 흐름이 동일 객체를 재사용하도록 한다.

- [ ] 후보 브랜치명 계산 로직을 구현한다 (AC: 1)
  - [ ] `branchConfig.commandTypeMap[normalizedCommand]`가 존재하면 그 값을, 없으면 `branchConfig.defaultType`(기본 `"chore"`)을 `{type}`로 사용한다.
  - [ ] 티켓 토큰은 `extractTicketToken(workflowContext.arguments, { fallbackTicket: branchConfig.fallbackTicket })`로 결정한다. 이 결과가 fallback인 경우 슬러그가 비어있으면 안 되도록 슬러그 fallback을 강제한다(`workflowContext.normalizedCommand` 또는 `"workflow"`).
  - [ ] 슬러그는 `workflowContext.arguments`에서 ticket 토큰을 제외한 나머지를 `slugifyArguments`로 정규화한다. 인자 자체가 비어있으면 `workflowContext.normalizedCommand`를 슬러그 소스로 사용한다.
  - [ ] 최종 후보명은 `branchConfig.pattern`(기본 `"{type}/{ticket}-{slug}"`)의 `{type}`, `{ticket}`, `{slug}` 토큰을 치환해 생성한다. 패턴에 정의되지 않은 토큰은 무시한다.
  - [ ] 생성된 후보명을 `branchConfig.validationRegex`로 검증한다. 통과하지 못하면 `null`을 반환하고 호출자가 사유를 기록할 수 있도록 `reason: "candidate-failed-validation"`을 동반 객체로 전달할 수 있는 형식 — 즉 후보명 컴퓨터는 `{ name, valid, reason }` 형태도 함께 export 한다(메인 함수는 valid한 경우 `name` 문자열을 반환, 실패 시 `null`을 반환하되 호출자가 부가 정보를 받을 수 있도록 `computeCandidateBranchNameDetailed(...)` 보조 export를 둔다).

- [ ] long-lived 브랜치 분기 및 proposal 생성 로직을 구현한다 (AC: 2)
  - [ ] `evaluateBranchStrategy`는 `requirement: "required"`일 때 호출자가 proposal을 생성하기 위해 필요한 추가 정보(`isLongLived: boolean`, `currentBranch`, `policyMatch`)를 함께 반환한다.
  - [ ] long-lived 판단은 `branchConfig.longLivedBranches`(기본 `["main", "master"]`) 배열의 정확한 문자열 매치로 수행한다. 대소문자/접두사 부분일치는 사용하지 않는다.
  - [ ] 별도 export 함수 `buildBranchProposal({ strategy, candidateName, currentBranch })`를 추가해 다음 객체를 반환한다.
    - 후보명이 존재하고 현재 브랜치가 long-lived거나 `validationRegex`를 통과하지 못하는 경우 → `{ kind: "branch", action: "create", name, reason, current, policyMatch }`.
    - 후보명이 존재하고 현재 브랜치가 정책에는 부합하지만 후보명과 다른 경우 → `{ kind: "branch", action: "switch", name, reason, current, policyMatch }`.
    - 후보명이 존재하고 현재 브랜치가 정확히 후보명과 일치하면 → `null`(추가 작업 불필요).
    - 후보명을 계산할 수 없는 경우(`null`) 또는 `requirement === "unnecessary"`이면 → `null`.
  - [ ] proposal 객체는 절대 git을 호출하지 않는다. 즉 이 스토리는 어떤 시점에도 `git checkout`, `git switch`, `git branch -m`을 실행하지 않는다(Epic 2 승인 흐름과 Story 1.5/Epic 2 실행 흐름이 별도 책임).

- [ ] `command.execute.before` 흐름에 통합한다 (AC: 1, 2)
  - [ ] `src/index.js`에서 `branchConfig = runtimeConfig.config.branch`를 추출해 `createCommandExecuteBeforeHook`에 주입할 수 있도록 의존성을 확장한다.
  - [ ] `src/hooks/command-execute-before.js`에서 Story 1.2의 `detectWorkflowContext`로 컨텍스트를 받고, Story 1.3의 `resolveWorkflowPolicy`로 정책을 받은 뒤, `evaluateBranchStrategy` + `computeCandidateBranchName` + `buildBranchProposal`을 차례로 호출한다.
  - [ ] proposal이 생성되면 워크플로우 상태 저장소에 `state.branchProposal = proposal`로 기록만 한다(Epic 2가 소비). proposal을 그 자리에서 사용자에게 제시하거나 git을 변경하지 않는다.
  - [ ] proposal 생성 시 `git.action.planned` 구조화 감사 이벤트를 best-effort로 기록한다. payload는 `{ event: "git.action.planned", timestamp, workflow, command, details: { kind: "branch", action, name, reason, isLongLived } }` 형태(architecture event contract 준수). raw arguments는 절대 details에 포함하지 않는다.
  - [ ] `detectWorkflowContext`가 `null`을 반환하거나 `requirement === "unnecessary"`이면 어떤 호출도 추가로 일어나지 않아야 하며, 기존 legacy parity 동작을 그대로 유지한다.

- [ ] 회귀 및 단위 검증 커버리지를 확장한다 (AC: 1, 2)
  - [ ] `tests/regression.test.js`에 다음 케이스를 추가한다.
    - 워크플로우 명령(`bmad-bmm-quick-dev`)이 `arguments: "ABC-123 regression coverage"`로 들어왔을 때 wrapper의 워크플로우 상태에 `branchProposal.kind === "branch"`, `action === "create"`, `name === "feat/ABC-123-regression-coverage"`가 기록되는지.
    - 같은 명령에 `arguments: ""` 입력 시 fallback 경로(`feat/no-ticket-bmad-bmm-quick-dev` 형태 또는 정책상 정의된 fallback 슬러그)가 `validationRegex`를 통과하는지.
    - 비-워크플로우 명령(`/non-workflow-command`)이 들어왔을 때 `branchProposal`이 생성되지 않고 audit `git.action.planned`도 발생하지 않는지(idempotency + isolation).
    - long-lived 분기: 현재 브랜치가 `"main"`인 시뮬레이션 입력에 대해 `action === "create"`가 선택되는지(현재 브랜치는 호출자가 mock으로 주입한다).
    - `branchRequired: false`인 정책(`bmad-bmm-create-prd`)의 경우 proposal이 `null`이고 audit 이벤트가 emit되지 않는지.
  - [ ] legacy parity: 기존 `normalizeOutputParts` deepEqual과 mutating-tool error parity는 그대로 유지된다(legacy core 동작 변경 금지).
  - [ ] 슬러그/티켓 헬퍼는 가능하면 동일 파일 안의 export로 분리해 회귀 스크립트에서 직접 단위 호출이 가능하도록 한다(`tests/regression.test.js` 안에 인라인 단위 호출 추가 허용 — Story 1.2와 동일한 패턴).

- [ ] 빌드/런타임 계약을 검증한다 (AC: 1, 2)
  - [ ] `npm run build && npm test`가 클린 체크아웃에서 통과한다(Story 1.1, 1.2, 1.3에서 확립한 계약 유지).
  - [ ] 빌드된 `dist/devai-aidd-guard.js`가 새로 추가된 `src/services/git/branch-service.js`를 인라이닝하는지 확인한다(esbuild가 자동 처리하므로 별도 설정 변경 없이 빌드 성공만 확인).

## Dev Notes

### Story Intent

이 스토리는 Epic 1의 브랜치 의사결정 단계다. Story 1.2가 식별한 **워크플로우 컨텍스트**와 Story 1.3이 해소한 **effective config + workflow policy**를 입력으로 받아, 다음 두 가지를 산출하는 것이 유일한 책임이다. (1) 이 워크플로우에 브랜치가 `required`/`optional`/`unnecessary` 중 무엇인지의 판정. (2) 정책에 맞는 후보 브랜치명 문자열 계산 및 그것을 담은 **proposal 객체**. 이 스토리는 어떤 git 명령도 실행하지 않으며, 사용자에게 승인 프롬프트를 띄우지도 않는다(Epic 2). 이 스토리의 출력 객체는 Epic 2의 승인 워크플로우와 Story 3.x의 finalization 흐름의 명시적 입력 계약이다.

### Verified Baseline Findings

- `src/config/defaults.js`는 다음을 이미 제공한다.
  - `branch.pattern = "{type}/{ticket}-{slug}"`
  - `branch.defaultType = "chore"`
  - `branch.fallbackTicket = "no-ticket"`
  - `branch.longLivedBranches = ["main", "master"]`
  - `branch.validationRegex`(컴파일 시 두 형식 — 표준 `TICKET-NUM` 또는 `no-ticket-`)
  - `branch.commandTypeMap` — `bmad-bmm-*` 명령들이 `feat/fix/docs/chore/refactor/design`로 매핑됨.
  - `workflowPolicy[command]`는 이미 `category`, `identityStrategy`, `branchRequired`, `finalization`을 담고 있다.
- 그러나 다음은 아직 어디에도 존재하지 않는다.
  - 후보 브랜치명을 빌드하는 함수.
  - 슬러그 정규화 헬퍼.
  - long-lived 브랜치 검사 헬퍼.
  - branch proposal 객체 형식 정의.
  - `branchRequired`를 `required`/`optional`/`unnecessary` 3-값 모델로 환산하는 로직.
- `src/policies/legacy/devai-git-workflo.js`의 `tool.execute.before`는 mutating tool 가드에서 `Git workflow guard: create or switch to branch \`workflow\` before editing files for /${state.commandName}.`라는 정적 문구를 반환한다. 이 메시지는 회귀 테스트가 deepEqual로 검사하므로 **legacy core는 절대 수정하지 않는다**. Story 1.4의 새 proposal 흐름은 wrapper 사이드에 부가될 뿐 legacy의 가드 메시지는 변경하지 않는다.
- Story 1.2가 `src/services/workflow/`를 신설하고 `workflow.detected` 이벤트를 emit 하는 패턴을 확립했다. Story 1.4는 동일 패턴을 `src/services/git/`로 확장한다.

### Technical Requirements

- **순수 함수 원칙**: `evaluateBranchStrategy`, `computeCandidateBranchName`, `buildBranchProposal`은 모두 입력만으로 결정되며 I/O를 수행하지 않는다. 부수효과(audit emit, 상태 저장소 기록)는 hook wrapper에서만 일어난다.
- **slug 정규화 규칙**:
  1. `String(value || "")` → `toLowerCase()`.
  2. 공백류(`\s+`)와 `_`를 `-`로 치환.
  3. `[a-z0-9-]` 이외의 모든 문자 제거.
  4. 연속된 `-`를 단일 `-`로 압축.
  5. 양 끝의 `-` 제거.
  6. 결과가 빈 문자열이면 호출자가 제공한 fallback(`workflowContext.normalizedCommand` 또는 `"workflow"`)을 사용.
- **ticket 추출 규칙**:
  1. 인자 문자열에서 `/[A-Z]+-\d+/` 첫 매치를 우선 사용.
  2. 없으면 `branchConfig.fallbackTicket`(`"no-ticket"`)을 사용.
  3. fallback 사용 시 `validationRegex`의 `no-ticket` 분기를 만족시키도록 슬러그 형식을 강제한다(즉 fallback ticket일 때 type 토큰은 그대로 두고 슬러그만으로 검증을 통과해야 한다).
- **pattern 토큰 치환 규칙**: `branchConfig.pattern.replace("{type}", type).replace("{ticket}", ticket).replace("{slug}", slug)`. 정의되지 않은 토큰은 그대로 둔다(향후 `{user}`, `{date}` 같은 토큰 도입을 고려해 strict 매치 대신 known-token-only 치환).
- **검증 규칙**: 후보명은 반드시 `branchConfig.validationRegex`를 만족해야 하며, 만족하지 못하면 후보명은 `null`로 반환되고 proposal은 생성되지 않는다.
- **no-mutate 원칙**: 이 스토리의 어떤 코드도 `child_process`, `node:fs`의 쓰기 API, `git` CLI, 또는 working tree를 변경하는 어떤 호출도 수행하지 않는다. 후속 스토리(Epic 2 승인 흐름, Story 1.5 readiness, 향후 git executor)가 실제 git 호출 책임을 가진다.
- **현재 브랜치 입력**: 현재 브랜치 식별은 Story 1.5 readiness service의 책임 영역이지만, Story 1.4는 그 결과를 입력으로 받는 인터페이스를 미리 정의해야 한다. 따라서 `evaluateBranchStrategy`/`buildBranchProposal`은 호출자가 `currentBranch` 문자열을 명시적으로 주입하도록 설계한다. 통합 시점에는 임시로 `null`을 주입해도 동작하도록 fallback을 둔다(`null`이면 `isLongLived: false`로 간주, action은 `create`).
- **non-blocking 원칙**: `audit.info` 호출과 워크플로우 상태 기록은 best-effort. 실패해도 hook 자체는 throw 하지 않으며 legacy parity 흐름을 절대 차단하지 않는다.

### Architecture Compliance

- **폴더 위치**: 신규 코드는 `src/services/git/branch-service.js`로 들어간다. 아키텍처의 Project Structure → File Structure Patterns의 `src/services/git/` 명세를 정확히 따른다. `src/hooks/`나 `src/policies/legacy/`에 브랜치 계산 로직을 두지 않는다.
- **네이밍**: 파일명 `kebab-case.js`, 함수 `camelCase`, 이벤트 식별자 `dot.case`(`git.action.planned`).
- **Command/Event 패턴**: 아키텍처는 `PrepareBranchCommand`를 예시 command 중 하나로 명시한다. Story 1.4는 그 명세에 부합하는 **proposal 객체**를 산출하지만, 본격적인 Command 실행 흐름(`src/commands/prepare-branch-command.js`)은 Epic 2/Story 3.x에서 실현된다. 따라서 본 스토리는 **데이터 객체로서의 PrepareBranchCommand**를 도입한다.
  - 표준 proposal 스키마: `{ kind: "branch", action: "create" | "switch", name: string, reason: string, current: string | null, policyMatch: { commandName, category, identityStrategy, branchRequired, finalization } }`.
- **이벤트 envelope**: `git.action.planned` payload는 architecture의 표준 envelope을 따른다.
  ```js
  {
    event: "git.action.planned",
    timestamp: "<ISO-8601>",
    workflow: "<commandName>",
    command: "<commandName>",
    details: { kind: "branch", action, name, reason, isLongLived }
  }
  ```
- **민감정보 회피**: raw `arguments` 문자열은 audit details에 포함하지 않는다. 슬러그·티켓 토큰을 통한 derived 값만 노출한다(NFR5, 아키텍처 보안 원칙).
- **Approval 경계**: 이 스토리는 정책 결과 표준값(`allow`/`deny`/`ask`/`skip`)을 산출하지 않는다. 그것은 Epic 2의 `approval-policy-service` 책임. Story 1.4의 proposal은 입력 데이터일 뿐이다.

### Library / Framework Requirements

- **신규 외부 라이브러리 없음**. 본 스토리는 `String` 메서드, `RegExp`, `Map`, `Set`만으로 완전히 구현된다. 슬러그용 라이브러리(`slugify` 등) 도입 금지 — 정책 정규식과 100% 정합성 맞춰진 내부 구현이 필요하다.
- **`node:child_process` 미사용**. git 호출은 본 스토리의 범위를 벗어난다(Story 1.5/Epic 2 책임).
- **`node:fs` 쓰기 API 미사용**. 설정 파일은 Story 1.3의 loader가 이미 읽은 결과만 소비한다.
- **빌드**: 기존 `esbuild` ESM Node 22 타겟. 신규 파일은 `src/index.js`에서 import 되면 자동으로 번들에 포함된다.

### File Structure Requirements

- 신규 파일:
  - `src/services/git/branch-service.js` — pure 함수 모음(`slugifyArguments`, `extractTicketToken`, `evaluateBranchStrategy`, `computeCandidateBranchName`, `computeCandidateBranchNameDetailed`, `buildBranchProposal`).
- 수정 파일:
  - `src/index.js` — `branchConfig`를 `command.execute.before` hook factory에 주입.
  - `src/hooks/command-execute-before.js` — detection → policy resolution → branch evaluation → proposal stash → audit emit → legacy delegate 순서로 오케스트레이션.
  - `src/services/workflow/workflow-state.js`(Story 1.2가 이미 신설) — proposal을 보관하는 필드(`branchProposal`)를 추가로 허용. 새 메서드 추가 없이 기존 `set/advancePhase`로 충분하다면 변경 불필요.
- 수정하지 말아야 하는 파일:
  - `src/policies/legacy/devai-git-workflo.js` — legacy core 그대로. mutating-tool 메시지/`states.set` 동작 변경 금지.
  - `src/config/defaults.js` — 본 스토리에서는 기존 키만 소비. 키 추가/이름 변경 금지.
- 새 폴더 신설 금지: 본 스토리는 `src/services/git/`만 추가한다. `src/commands/`, `src/events/`는 Epic 2/3에서 도입.

### Testing Requirements

- 필수 검증 명령: `npm run build && npm test`.
- 회귀 테스트 확장 영역(`tests/regression.test.js`):
  1. **티켓 슬러그 매핑**: `bmad-bmm-quick-dev` + `arguments: "ABC-123 regression coverage"` → 후보명 `feat/ABC-123-regression-coverage`(`commandTypeMap`이 `bmad-bmm-quick-dev`를 `feat`로 매핑) 및 `validationRegex` 통과 검증.
  2. **티켓 fallback**: 동일 명령 + 빈 arguments → 후보명이 `validationRegex`의 `no-ticket-` 분기를 만족하는지 검증(예: `feat/no-ticket-bmad-bmm-quick-dev`).
  3. **defaultType fallback**: `commandTypeMap`에 없는 가상 명령(예: `bmad-bmm-unknown`)을 정책 매핑에 임시 추가했을 때 type이 `chore`로 떨어지는지(또는 정책 매핑이 없으면 proposal 자체가 `null`이 되는지) 확인.
  4. **long-lived 분기**: `currentBranch === "main"`을 mock 입력으로 주입했을 때 `action === "create"`가 선택되는지.
  5. **policy unnecessary**: `bmad-bmm-create-prd`(branchRequired: false) 명령에서 `branchProposal`이 `null`이고 audit 이벤트도 emit되지 않는지.
  6. **non-workflow isolation**: `/non-workflow-command` 호출 시 어떤 branch 관련 작업도 발생하지 않는지(state·audit 모두 깨끗).
  7. **legacy parity**: 기존 `normalizeOutputParts` deepEqual과 mutating-tool error 메시지는 그대로 유지되는지.
- 단위 케이스(인라인 허용):
  - `slugifyArguments("ABC-123 Regression Coverage")` → `"abc-123-regression-coverage"` 형태인지(슬러그는 ticket을 제외한 부분을 받으므로, 호출자가 ticket 추출 후 나머지를 넘긴다는 가정으로 별도 케이스 검증).
  - `extractTicketToken("ABC-123 cleanup", { fallbackTicket: "no-ticket" })` → `"ABC-123"`.
  - `extractTicketToken("just a slug", { fallbackTicket: "no-ticket" })` → `"no-ticket"`.

### Previous Story Intelligence

- **Story 1.2 의존성**: `detectWorkflowContext`가 반환하는 컨텍스트 객체 형식 — `{ commandName, normalizedCommand, arguments, sessionID, detectedAt, phase }` — 가 Story 1.4의 입력 계약이다. Story 1.4의 함수 시그니처는 `workflowContext`를 그 형식 그대로 받는다. 새 필드를 추가하지 않는다.
- **Story 1.3 의존성**: `resolveWorkflowPolicy(workflowContext, runtimeConfig)` 가 반환하는 정책 객체 — `{ commandName, category, identityStrategy, branchRequired, finalization, ... }` — 가 Story 1.4의 입력이다. Story 1.4는 정책 객체를 변형하지 않으며 `policyMatch`로 그대로 보존한다.
- **Story 1.1 부트스트랩 패턴**: 새 서비스 모듈은 `src/index.js`의 부트스트랩 closure에서 한 번 인스턴스화되고 hook factory에 주입된다. 전역 mutable singleton 금지.
- **Story 1.2 audit emit 패턴**: `audit.info(...)` best-effort 호출, 실패 시 throw 하지 않음, payload는 architecture envelope 준수, raw arguments 비포함. Story 1.4의 `git.action.planned` emit도 동일 규칙을 따른다.
- **Story 1.1 sprint-change-proposal 영향**: 부트스트랩이 install/setup migration을 묵시적으로 수행하지 않는다는 원칙이 Story 1.4에도 적용된다. 즉 branch-service는 어떠한 setup/migration 행위도 하지 않는다.
- **Story 1.1 회귀 계약**: `npm run build && npm test` 시퀀스, prebuilt `dist/devai-aidd-guard.js` 의존성, legacy parity deepEqual 그대로 유지.

### Git Intelligence Summary

- 최근 커밋(`dfaf0d9`, `576fa74`, `110a0ac`, `e2bf242`, `3e4a1d9`)은 모두 planning/sprint 산출물이며 신규 production 코드 변경은 없다. Story 1.1/1.2/1.3이 적용된 `src/` 트리(특히 `src/policies/legacy/devai-git-workflo.js` 복원, audit no-op-hook 로그, `dist/devai-aidd-guard.js` prebuilt 계약)를 신뢰 가능한 출발점으로 사용한다.
- 현재 브랜치는 `codex/bmad/epic1/story1-1`이다. 본 스토리의 어떤 task도 git 브랜치 자동 변경을 트리거해서는 안 된다(이는 곧 Story 1.4가 자기 자신을 호출하는 부트스트랩 사이클을 만들지 말라는 뜻).

### Project Structure Notes

- 아키텍처 문서가 명시한 `src/services/git/` 산하의 다른 파일들(`git-workflow-service.js`, `git-executor.js`, `commit-service.js`, `push-service.js`)은 본 스토리에서 만들지 않는다. Story 1.4는 `branch-service.js`만 도입하고, 나머지는 Epic 2/Story 3.x가 점진적으로 도입한다.
- **Epic 2 승인 흐름과의 경계**: 본 스토리의 산출물은 proposal 객체 + 워크플로우 상태에 stashed 된 `branchProposal` 필드 + `git.action.planned` audit 이벤트, 이 셋이 전부다. 사용자에게 보여주는 approval 프롬프트, accept/deny/ignore 결과 처리, retry/skip 복구 경로 — 이 모든 것은 Epic 2 책임이다. Story 1.4가 proposal을 만든 직후에는 어떤 사용자 상호작용도 발생하지 않으며, 사용자가 mutating tool을 시도하면 legacy core의 기존 mutating-tool 가드가 그대로 동작한다(behavior 변경 없음).
- **Story 1.5 readiness와의 경계**: 현재 브랜치 식별, 원격 존재 여부 확인, `git init` 제안은 Story 1.5의 책임. Story 1.4는 `currentBranch`를 입력으로만 받고 직접 식별하지 않는다. 통합 단계에서 Story 1.5의 readiness 결과가 아직 없으면 `currentBranch: null`로 호출하고 fallback 동작(`isLongLived: false`, `action: "create"`)으로 안전하게 동작한다.
- **자동 mutate 금지의 명시적 가드**: 본 스토리의 어떤 코드도 git working tree, `.git/HEAD`, refs, 원격 설정을 변경하지 않는다. 검토자는 PR에서 `child_process` 또는 git CLI 호출이 있으면 즉시 거절해야 한다.

### References

- Epic and story definition: [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: Compute Branch Strategy and Candidate Branch Names]
- Functional requirements: [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements] (FR3, FR5, FR6; NFR1, NFR3, NFR5, NFR13)
- Architecture target folder layout: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] (특히 `src/services/git/branch-service.js` 명세)
- Architecture command/event 패턴: [Source: _bmad-output/planning-artifacts/architecture.md#Core Architectural Decisions → API & Communication Patterns] (PrepareBranchCommand, `git.action.planned`)
- Architecture naming/event envelope: [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- Branch 정책 키와 commandTypeMap: [Source: src/config/defaults.js] (line 2~45 — `branch.pattern`, `defaultType`, `fallbackTicket`, `longLivedBranches`, `validationRegex`, `commandTypeMap`)
- Workflow policy 매핑: [Source: src/config/defaults.js] (line 46~131 — `workflowPolicy[commandName]`)
- Legacy core(behavioral baseline 유지 대상): [Source: src/policies/legacy/devai-git-workflo.js] (line 96~111 — mutating-tool 가드 메시지)
- Bootstrap injection 지점: [Source: src/index.js] (line 30~86 — runtimeConfig 추출, hook factory 조립)
- Story 1.1 부트스트랩 선례: [Source: _bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md]
- Story 1.2 워크플로우 컨텍스트 입력 계약: [Source: _bmad-output/implementation-artifacts/1-2-detect-bmad-workflow-commands-and-runtime-context.md]
- Sprint-change scope 경계(install/setup vs runtime): [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md]
- Regression baseline: [Source: tests/regression.test.js]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
