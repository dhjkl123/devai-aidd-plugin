# Story 4.3: 래퍼를 통한 기존 BMAD 명령어 호환성 보존

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

워크플로우 운영자로서,
리팩터링된 플러그인 래퍼가 기존 BMAD 명령어 집합과 동작 측면에서 호환을 유지하길 원한다,
그래서 팀이 사용자 재교육이나 명령어 습관 변경 없이도 새 구조를 도입할 수 있다.

## Acceptance Criteria

1. **주어진 조건** 기존 BMAD 워크플로우 명령어가 런타임을 통해 호출되는 경우
   **동작 시점** 리팩터링된 래퍼가 레거시 코어로 위임하면
   **기대 결과** 명령어 이름, 훅 진입점, 핵심 동작이 이전 플러그인 계약과 호환되는 형태로 유지되어야 한다
   **그리고** 핵심 가드 흐름에 대해 회귀 검증이 래퍼 동작과 레거시 동작을 비교할 수 있어야 한다.
2. **주어진 조건** 래퍼 구조에 placeholder 훅이나 확장 지점이 존재하는 경우
   **동작 시점** 호환성을 평가하면
   **기대 결과** 미지원 또는 TODO 경로가 명시적으로 경계화되어 지원 기능을 잘못 표현하지 않아야 한다
   **그리고** 향후 구현 작업이 기존 계약을 깨지 않고 그 경로를 확장할 수 있어야 한다.

## Tasks / Subtasks

- [x] BMAD 명령어 호환성 계약을 코드와 문서 양쪽에서 명문화한다 (AC: 1)
  - [x] `src/index.js`의 bootstrap이 반환하는 6개 훅 키(`command.execute.before`, `tool.execute.before`, `tool.execute.after`, `permission.asked`, `file.edited`, `event`)를 호환성 계약으로 고정하고, 키 이름·순서·시그니처를 변경하지 않는다.
  - [x] `DevaiAiddGuardPlugin`을 1차 진입점으로 유지하고 `DevaiGitWorkflowPlugin` 별칭 export(`src/index.js:283`)도 그대로 보존해 기존 manifest/installer가 가리키는 심볼이 깨지지 않게 한다.
  - [x] 워크플로우 명령어 셋은 `loadWorkflowCommands(directory, fsAdapter)`이 산출하는 `.opencode/commands/*.md` 기반의 동일 슬러그 셋이며, 래퍼가 이 셋을 레거시 코어(`src/policies/legacy/devai-git-workflo.js`)로 그대로 전달해 양쪽이 같은 명령어 인식 결과를 갖도록 강제한다.
  - [x] 명령어 슬러그 정규화 규칙은 `normalizeCommandName`(`src/services/workflow/detect-workflow-context.js`)을 단일 출처로 사용하고, 래퍼·레거시·회귀 테스트에서 동일 함수를 재사용한다.

- [x] 래퍼 → 레거시 위임 경계가 모든 훅에서 동작 등가성을 유지하도록 가드한다 (AC: 1)
  - [x] `src/hooks/command-execute-before.js`, `src/hooks/tool-execute-before.js`, `src/hooks/tool-execute-after.js`, `src/hooks/session.js`는 래퍼 책임(workflow detection, approval publication, phase advance, finalization gating)을 마친 뒤 항상 마지막에 `legacyHandlers[...]`을 호출하는 “thin wrapper” 패턴을 유지한다. 이 호출 순서가 핵심 가드 흐름의 호환성 계약이며 변경하지 않는다.
  - [x] 레거시 코어가 `command.execute.before`에서 작성하는 start instruction 텍스트(`buildStartInstruction`)는 래퍼가 절대 수정·재작성·중복 push하지 않으며, 회귀 테스트의 `normalizeOutputParts` 비교가 깨지지 않게 한다.
  - [x] 레거시 코어가 `tool.execute.before`에서 throw하는 mutating-tool guard 메시지 형식(`Git workflow guard: create or switch to branch \`workflow\` before editing files for /<command>.`)은 래퍼 경로에서도 동일 message로 전파되어야 하며, 래퍼가 자체 메시지로 치환하지 않는다.
  - [x] `event` 훅 위임은 `session.deleted` 이벤트의 sessionID를 양쪽에서 동일하게 정리하도록 유지하고, 래퍼 측 `workflowState.clear(sessionID)` 호출 이후 레거시 핸들러가 동일 sessionID를 재참조해도 누수되지 않도록 한다.

- [x] 래퍼 전용(placeholder) 훅의 경계와 미지원 경로를 명시적으로 표현한다 (AC: 2)
  - [x] `src/hooks/permission-asked.js`와 `src/hooks/file-edited.js`는 레거시 코어에 대응 핸들러가 없는 “wrapper-only” 훅이라는 사실을 기존 코드 주석/감사 이벤트 그대로 유지한다(`src/index.js:104-116`의 `plugin bootstrap registered no-op hooks` 감사 emit 포함).
  - [x] 두 훅은 레거시 핸들러가 부재할 때도 throw 없이 `undefined`를 반환하는 결정적 동작을 유지하고, 래퍼 측 책임(approval ingress, recovery routing, touched-file 추적)이 실패해도 런타임에 surface되지 않도록 best-effort 가드를 보존한다.
  - [x] 워크플로우 명령어가 아닌 세션에서는 placeholder 훅이 어떤 mutation도 발생시키지 않아야 하며, 비-워크플로우 명령어 경로(`session-nwf`류)에서 placeholder 훅이 우연히 가드 흐름을 활성화하지 않도록 한다.
  - [x] TODO 또는 미래 확장 슬롯이 코드 주석으로 남아 있을 경우, “현재 미지원이며 레거시 동등 동작이 없다”는 사실을 코드 주석 또는 inline 문서로 명시해 호환성 계약을 잘못 광고하지 않는다.

- [x] 호환성 보장의 근거가 되는 정적 계약을 한 곳에 모아 향후 확장이 깨뜨릴 수 없게 한다 (AC: 1, 2)
  - [x] `src/index.js` 또는 인접한 단일 모듈에 “지원되는 훅 키 집합”과 “wrapper-only 훅 집합”을 식별 가능한 상수/주석으로 표현해 Story 4.5의 회귀 테스트가 동일 출처를 참조할 수 있게 한다(데이터 형태만 정리; 새 모듈을 도입할 필요는 없음).
  - [x] `src/policies/legacy/devai-git-workflo.js`는 Story 1.1에서 복원된 형태 그대로 유지하고, 새 동작이나 새 훅 키를 레거시 코어에 추가하지 않는다. 레거시 코어는 “이전 플러그인 계약의 동결된 기준선”이라는 위치를 명시 주석으로 박는다.
  - [x] `package.json`의 `test` 스크립트가 검사하는 두 모듈 경로(`src/index.js`, `src/policies/legacy/devai-git-workflo.js`)가 호환성 계약의 “이 두 진입점이 항상 import 가능해야 한다”는 invariant를 표현하고 있음을 Dev Notes에 남기고, 그 invariant를 깨는 변경은 본 스토리 범위에서 금지한다.

- [x] Story 4.5와 명확히 분리되도록 검증 작업을 한정한다 (AC: 1, 2)
  - [x] 본 스토리는 “호환성 계약 자체”를 코드와 주석으로 고정하는 데에만 집중하고, 새 회귀 테스트 함수 추가/리팩터링은 Story 4.5에서 처리한다. 단, 래퍼 코드 변경으로 기존 회귀 테스트가 깨질 경우에는 본 스토리 안에서 코드 측을 원복/조정해 통과 상태를 회복한다.
  - [x] 본 스토리 안에서 `tests/regression.test.js`에 신규 테스트 함수를 추가하지 않는다. 다만, 래퍼 책임 경계가 바뀐 부분(예: 새 위임 순서)이 기존 테스트의 가정과 충돌하지 않는지 검증하기 위해 `npm run build && npm test`를 통과시키는 것은 본 스토리의 종료 조건에 포함된다.
  - [x] Story 4.5에서 사용할 수 있도록, 본 스토리에서 정리한 “지원 훅 키 집합”과 “wrapper-only 훅 집합”의 위치를 Dev Notes에 명시한다.

- [x] README/문서가 호환성 계약을 잘못 광고하지 않는지 점검한다 (AC: 2)
  - [x] README가 “지원되는 BMAD 명령어 동작” 또는 “훅 동작”을 설명하는 부분이 있다면, wrapper-only 훅(`permission.asked`, `file.edited`)이 레거시 코어와 동등한 동작을 보장하는 것이 아니라는 점을 명확히 한다(이미 명시되어 있다면 그대로 유지).
  - [x] 새 문서를 만들지 않고 기존 README를 최소 편집한다. 본 스토리 범위에서는 인스톨러/패키징 문서(Story 4.4 영역)와 회귀 커버리지 가이드(Story 4.5 영역)는 건드리지 않는다.

## Dev Notes

### 본 스토리의 목적과 범위

- 본 스토리는 Epic 4(Policy Administration and Compatibility Operations)의 핵심 “호환성 계약 본체”다. FR29(“사용자는 기존 BMAD 핵심 workflow command를 변경 없이 계속 사용할 수 있어야 한다”)를 코드 구조와 문서 측면에서 명문화하는 데 집중한다.
- Story 4.1(설정 정규화)·Story 4.2(레거시 설정/브리지 파일)는 “설정 호환성”을 다루고, Story 4.4(빌드/패키징)·Story 4.5(회귀 커버리지)는 “산출물·검증 인프라”를 다룬다. 본 스토리는 그 사이에서 “워크플로우 명령어 자체의 동작 호환성”을 고정하는 위치에 있다.
- 새 기능 추가가 아니라, 이미 Story 1.1에서 복원·정리한 래퍼 ↔ 레거시 코어 경계를 “이후 변경에 의해 우연히 깨지지 않도록 동결”하는 것이 본 스토리의 본질이다.

### Story 4.3 vs Story 4.5 경계 (혼동 방지)

- **Story 4.3 = 호환성 계약 본체.** 어떤 훅 키가 지원되는지, 래퍼가 무엇을 보존해야 하는지, placeholder/TODO 경로의 한계가 어디까지인지를 코드·주석·README로 “표현”한다. 래퍼·레거시 코어·bootstrap 파일을 직접 다룬다.
- **Story 4.5 = 그 계약을 검증하는 회귀 인프라.** “legacy vs wrapper vs built” 비교 테스트, mutating-tool guard 메시지 비교, prompt parity 비교, hook 키 존재 검증, 새 시나리오 추가 등은 Story 4.5의 책임이다.
- 따라서 본 스토리는 `tests/regression.test.js`에 새 테스트 함수를 추가하지 않는다. 다만 래퍼 코드 측 변경 때문에 기존 회귀 테스트가 깨지면 그 깨짐을 코드 측에서 즉시 회복시키는 것까지가 본 스토리의 책임이다.
- Story 4.5는 본 스토리가 코드/주석으로 명시한 “지원 훅 키 집합”과 “wrapper-only 훅 집합”을 단일 출처로 참조해 회귀 테스트를 보강할 예정이다. 본 스토리는 그 출처가 안정적으로 존재하도록 만들어 두는 것까지만 보장한다.

### 현재 코드베이스에서 확인된 호환성 계약의 형태

- `src/index.js`는 6개 훅 키를 반환한다: `command.execute.before`, `tool.execute.before`, `tool.execute.after`, `permission.asked`, `file.edited`, `event`. 이 6개 키 자체가 외부 플러그인 계약이다.
- 진입 심볼 두 개가 export된다: `DevaiAiddGuardPlugin`(현재 정식 이름)과 `DevaiGitWorkflowPlugin`(레거시 호환 별칭, `src/index.js:283`). 두 심볼 중 어느 쪽이 사라져도 기존 manifest/installer가 깨질 수 있다.
- `src/policies/legacy/devai-git-workflo.js`는 Story 1.1에서 복원된 “이전 플러그인 동작의 동결 기준선”이다. 4개 훅(`command.execute.before`, `tool.execute.before`, `tool.execute.after`, `event`)을 직접 구현하고, `permission.asked`/`file.edited`는 의도적으로 미지원이다. 본 스토리는 이 4 vs 6 비대칭을 “호환성 정의의 일부”로 고정한다.
- `loadWorkflowCommands` 결과 셋은 `src/index.js:45`에서 한 번 로드되어 `src/index.js:97`을 통해 레거시 코어로 그대로 전달된다(Story 1.1 review follow-up에서 중복 디스크 읽기를 제거한 형태). 본 스토리에서 이 단일 출처를 깨지 않는다.
- 워크플로우 인식의 정규화 함수 `normalizeCommandName`(`src/services/workflow/detect-workflow-context.js`)는 래퍼·레거시·테스트가 모두 같은 슬러그 키를 사용하는 호환성 근거다.

### 래퍼 ↔ 레거시 동작 등가성에 대한 invariant

- `command.execute.before`에서 레거시 코어는 `output.parts`에 start instruction을 push한다(`buildStartInstruction`). 래퍼는 이 push를 보존해야 한다. 회귀 테스트(`normalizeOutputParts(wrapper) === normalizeOutputParts(legacy)`)가 이 invariant를 직접 검증한다.
- `tool.execute.before`에서 레거시 코어는 mutating-tool에 대해 한국어 가드 메시지로 throw한다. 래퍼는 phase advance 같은 부가 작업을 수행하더라도 이 throw 메시지를 그대로 전파해야 한다. 회귀 테스트는 `wrapperError.message === legacyError.message`를 단언한다.
- `event` 훅에서 `session.deleted` 처리는 래퍼와 레거시가 모두 sessionID 기반으로 자기 상태를 정리한다. 래퍼는 자기 `workflowState.clear`를 수행한 뒤 레거시 핸들러를 호출해 양쪽의 정리가 모두 일어나도록 한다.
- 비-워크플로우 명령어(`/non-workflow-command`) 경로에서는 어떤 훅도 가드 동작을 활성화해서는 안 된다. 회귀 테스트는 비-워크플로우 세션에서 `command.execute.before` 출력 parts가 0이고 mutating-tool guard가 throw하지 않으며 `workflow.detected` audit이 발생하지 않음을 단언한다.

### Wrapper-only 훅(`permission.asked`, `file.edited`) 경계

- 두 훅은 레거시 코어에 대응 핸들러가 없다. Story 1.1에서 두 가지 결정이 명문화되었다.
  1. 두 훅의 핸들러는 throw 없이 `undefined`를 반환하는 결정적 no-op 또는 wrapper-책임 동작을 수행한다.
  2. bootstrap 시점에 “이 두 훅이 no-op로 등록되었다”는 사실을 단일 audit 이벤트(`plugin bootstrap registered no-op hooks`)로 남긴다(`src/index.js:104-116`).
- 본 스토리는 이 두 결정을 “호환성 계약의 일부”로 고정한다. 미지원 경로를 마치 지원 경로처럼 광고하지 않으면서, 향후 Story 4.4/4.5 또는 후속 Epic이 이 슬롯을 확장할 때 기존 계약(throw 금지, no-op 결정성, audit 1회 emit)을 깨지 않도록 한다.
- `permission.asked`는 Story 2.3/2.5에서 이미 “approval ingress + recovery routing”이라는 wrapper-책임 동작을 들고 있다. 이 동작은 “레거시 동등 동작”이 아니라 “래퍼가 추가로 책임지는 미래 지향 동작”임을 주석/문서로 분명히 해 둔다.
- `file.edited`도 같은 맥락으로 “래퍼가 touched-file 추적 책임만 가지며 레거시 동등 동작은 부재”라는 경계를 명시한다.

### Story 1.1 학습에서 가져와야 할 점

- Story 1.1은 `src/policies/legacy/devai-git-workflo.js` 복원이 “bootstrap 무결성”의 1차 조건임을 보였다. 본 스토리에서 이 파일을 삭제·이동·이름 변경해서는 안 된다.
- Story 1.1 review에서 wrapper-only 훅의 hook factory 시그니처를 `(input)`으로 통일했고, optional chaining을 제거해 “`legacyHandlers`는 항상 non-null map”이라는 보증을 코드에 박았다. 본 스토리에서도 같은 패턴을 유지한다.
- Story 1.1은 “bootstrap에서 install/setup 마이그레이션 작업을 묵시적으로 수행하지 않는다”는 read-only-ish 원칙을 sprint-change-proposal-2026-05-08을 통해 확정하고, 호환성 브리지 파일 생성을 Story 4.2로 위임했다. 본 스토리(4.3)는 그 분리를 그대로 존중한다 — 명령어 호환성과 설정 호환성은 다른 책임이다.

### Epic 2/Epic 3에서 누적된 wrapper 책임 (호환성 계약을 깨지 않고 보존해야 할 동작)

- `command.execute.before` 래퍼는 workflow detection → policy resolution → branch/init 제안 → approval publication까지 처리한 뒤 레거시 핸들러를 호출한다. 래퍼는 “레거시가 모르는 새 동작”을 추가했지만 “레거시가 알던 동작(start instruction push)”은 변경하지 않는다.
- `tool.execute.before/after` 래퍼는 phase 전이와 finalization gating을 처리한다. 그러나 레거시 코어의 mutating-tool guard 메시지는 그대로 통과시켜야 한다.
- `permission.asked` 래퍼는 approval/recovery 라우팅을 책임지며, 레거시에 대응 핸들러가 없으므로 정의된 “wrapper-only no-op or wrapper-책임 동작” 패턴을 따른다.
- `file.edited` 래퍼는 touched-file 추적을 책임지며, 동일하게 wrapper-only 패턴을 따른다.
- `event` 래퍼는 sessionState 정리를 책임지고, 레거시 핸들러도 동일 책임을 자체적으로 수행한다.
- 본 스토리에서 위 동작 중 어느 것도 “더 영리하게 만드는” 변경을 도입하지 않는다. 호환성 계약 본체이기 때문이다.

### 구현 가드레일 (반드시 지킬 것)

- 6개 훅 키 이름·개수·반환 타입(async function)을 변경하지 않는다.
- `DevaiAiddGuardPlugin` / `DevaiGitWorkflowPlugin` 두 export 심볼을 모두 유지한다.
- `src/policies/legacy/devai-git-workflo.js`의 4개 훅 동작과 그 메시지 문자열을 변경하지 않는다.
- `loadWorkflowCommands` → 래퍼 보유 → 레거시 코어로 주입되는 단일 출처 흐름을 유지한다(중복 디스크 읽기 도입 금지).
- `normalizeCommandName`을 단일 슬러그 정규화 함수로 유지한다.
- bootstrap 시 emit되는 `plugin bootstrap registered no-op hooks` audit 이벤트를 그대로 유지한다.
- placeholder/TODO 경로에 “지원된다”는 인상을 주는 주석/문서를 추가하지 않는다.
- 새 회귀 테스트 함수를 본 스토리에서 도입하지 않는다(Story 4.5 영역).
- 새 모듈 디렉터리(`src/services/compat/` 등)를 본 스토리에서 도입하지 않는다 — 호환성 계약 표현은 기존 `src/index.js` 주석/상수 또는 인접 모듈 안에서 해결한다.
- bootstrap에서 install/setup 측면의 호환성 브리지 파일 생성을 추가하지 않는다(Story 4.2 영역, sprint-change-proposal-2026-05-08).

### 구현 파일 후보

- 기존 파일 편집 우선
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js` — 호환성 계약(훅 키 셋, wrapper-only 훅 셋, export 심볼) 표현 강화 및 코드 주석 정리
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\policies\legacy\devai-git-workflo.js` — “이전 플러그인 계약의 동결 기준선”이라는 위치를 헤더 주석으로 명시
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-before.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-after.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\session.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js` — wrapper-only 경계 주석 보강
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js` — wrapper-only 경계 주석 보강
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md` — wrapper-only 훅의 미지원 경로를 잘못 광고하지 않는지 확인 (필요 시 최소 편집)
- 새 파일이 필요한 경우(가급적 회피)
  - 호환성 계약 상수만을 위한 모듈은 새로 만들지 않는다. 굳이 필요하다면 `src/utils/constants.js`에 “supported hook key set / wrapper-only hook set” 상수만 추가한다.
- 피해야 할 위치
  - `tests/regression.test.js`에 새 테스트 함수를 추가(Story 4.5)
  - `src/services/compat/` 같은 새 디렉터리 도입(Epic 4 후속 또는 Story 4.4 영역)
  - bootstrap 시점의 새 디스크 mutation/마이그레이션(Story 4.2 영역)
  - 레거시 코어에 신규 동작 추가

### 검증 포인트 (본 스토리 종료 조건)

- `node --check src/index.js` / `node --check src/policies/legacy/devai-git-workflo.js`가 통과한다(이미 `npm test`가 검사).
- `npm run build && npm test`가 본 스토리의 코드 변경 후에도 그대로 통과한다(Story 4.5의 새 테스트 추가 없이도 기존 회귀 통과를 유지).
- 6개 훅 키, 2개 export 심볼, 레거시 코어 4개 훅, wrapper-only 2개 훅의 비대칭이 코드/주석으로 식별 가능하다.
- placeholder/TODO 경로가 “지원된다”고 잘못 광고되지 않는다.

### Latest Tech Information

- 런타임 패키징은 Node.js ESM (`package.json`의 `"type": "module"`)과 esbuild 기반 번들(`scripts/build.js`)을 그대로 유지한다. 본 스토리는 새 의존성/빌드 옵션을 도입하지 않는다.
- `package.json`의 `test` 스크립트가 `node --check src/index.js && node --check src/policies/legacy/devai-git-workflo.js && ... && node tests/regression.test.js` 순으로 검사하므로, 두 진입점이 항상 import 가능해야 한다는 invariant가 이미 존재한다. 본 스토리는 이 invariant를 “호환성 계약의 일부”로 명시화한다.

### Project Structure Notes

- 현재 저장소는 brownfield다. `src/index.js`(bootstrap), `src/hooks/*`, `src/policies/legacy/*`, `src/services/*`, `src/audit/*`, `tests/regression.test.js`가 본 스토리의 1차 컨텍스트다.
- 아키텍처 문서(`_bmad-output/planning-artifacts/architecture.md`)는 “레거시 코어는 `policies/legacy/`에 고립시키고, 새 구조는 바깥에서 감싼다”는 원칙을 명시한다(`architecture.md` line 525). 본 스토리는 이 분리 원칙을 코드 측에서 동결한다.
- `project-context.md`는 현재 저장소에서 발견되지 않았다. 따라서 본 스토리는 PRD, Epics, Architecture, Story 1.1·3.5 산출물, 실제 소스/테스트를 기준으로 컨텍스트를 정리했다.

### References

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md` — `Epic 4: Policy Administration and Compatibility Operations`, `Story 4.1` ~ `Story 4.5`, `FR Coverage Map` (FR29 → Epic 4)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md` — `Runtime Integration & Compatibility` (FR27 ~ FR30)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md` — `Architectural Boundaries`, `Service Boundaries`, `Cross-Cutting Concerns: 레거시 호환`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\sprint-change-proposal-2026-05-08.md` — Story 1.1과 Story 4.2 사이의 호환성 책임 분리 결정(본 스토리 4.3은 명령어 호환성, Story 4.2는 설정/브리지 파일 호환성)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\1-1-register-runtime-hooks-through-the-plugin-bootstrap.md` — bootstrap 진입점 계약, wrapper-only 훅의 결정적 no-op 패턴, `legacyHandlers` 비-null 보증, no-op hook 등록 audit
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\epic-1-retro-2026-05-09.md` — 부트스트랩 디스시플린, 호환성 책임 분리(sprint-change-proposal) 학습
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js` — 6개 훅 키 반환, 2개 export 심볼, no-op hook audit emit (`src/index.js:104-116`, `src/index.js:283`)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\policies\legacy\devai-git-workflo.js` — 레거시 4개 훅, `buildStartInstruction`, mutating-tool guard 메시지
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js` — 래퍼 → 레거시 위임 순서
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-before.js`, `tool-execute-after.js`, `session.js` — phase advance / finalization / session cleanup + 레거시 위임
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js`, `file-edited.js` — wrapper-only 훅 경계
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\detect-workflow-context.js` — `normalizeCommandName` 단일 출처
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\load-config.js` — `loadWorkflowCommands` 단일 호출 지점
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\package.json` — `test` 스크립트의 `node --check` invariant
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` — legacy/wrapper/built 비교 회귀 (변경 금지: 본 스토리 4.3 범위 외)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `npm test` (post-change): exit 0; regression suite reports `legacy-vs-wrapper` and `legacy-vs-built` both `passed`; mutating-tool error string preserved byte-for-byte (`Git workflow guard: create or switch to branch \`workflow\` before editing files for /bmad-bmm-quick-dev.`); wrapper logs == built logs (8 each).
- `npm run build` (post-change): dist `dist/devai-aidd-guard.js` 461.4kb (was 461.1kb pre-change; the +0.3kb is comment-only — comments survive bundling because esbuild keeps JSDoc).

### Completion Notes List

본 스토리는 “BMAD 명령어 호환성 계약 본체”를 코드/주석으로 동결하는 비-기능적(documentation-as-contract) 변경이다. 새 동작이나 새 모듈 디렉터리는 도입하지 않았다.

핵심 변경:

1. **`src/utils/constants.js`** — 호환성 계약의 단일 출처(SOT)로 두 frozen 상수 추가:
   - `SUPPORTED_HOOK_KEYS` — bootstrap이 반환하는 6개 훅 키.
   - `WRAPPER_ONLY_HOOK_KEYS` — 레거시 코어에 대응 핸들러가 없는 2개 키 (`permission.asked`, `file.edited`).
   Story 4.5의 회귀 테스트가 이 두 상수를 import해 “계약-vs-실제 export” 불일치를 단일 출처로 단언할 수 있다.

2. **`src/index.js`** — 모듈 헤더 JSDoc에 호환성 계약 본체를 명시 (6개 훅 키, 2개 export 심볼, wrapper-only 비대칭, best-effort audit 정책). 하드코딩된 `["permission.asked", "file.edited"]` 리터럴을 `WRAPPER_ONLY_HOOK_KEYS` 참조로 교체해 SOT 일관성 강화. 반환 hook map과 export 별칭에 “계약 위반은 FR29 깨짐” 경고 주석 추가.

3. **`src/policies/legacy/devai-git-workflo.js`** — 헤더 주석에 “FROZEN BASELINE” 위치 박음. 4개 훅 동작 (start instruction, mutating-tool throw 메시지, lifecycle 전환, session.deleted 정리)을 변경 금지 항목으로 명시. 가드레일 4개(5번째 훅 추가 금지 / 메시지 문자열 변경 금지 / 새 동작 추가 금지 / 파일 삭제·이동 금지) 명문화.

4. **`src/hooks/command-execute-before.js` / `tool-execute-before.js` / `tool-execute-after.js` / `session.js`** — 모듈 헤더 JSDoc에 “THIN WRAPPER” 패턴(래퍼 책임 → 항상 마지막에 `legacyHandlers[...]` 위임) 명시. 각 훅이 보존해야 할 레거시 invariant(start instruction push, mutating-tool error message, session 정리)를 명시.

5. **`src/hooks/permission-asked.js` / `file-edited.js`** — 모듈 헤더 JSDoc에 “WRAPPER-ONLY” 위치 명시. 레거시 코어에 대응 핸들러 없음, throw 금지, no-op 결정성 보장을 호환성 계약의 일부로 못박음.

6. **README** — wrapper-only 훅에 대한 잘못된 광고 없음 확인 (현재 README는 `permission.asked` / `file.edited` 자체를 언급하지 않음). Task 6 “이미 명시되어 있다면 그대로 유지” 규정에 따라 편집 없음.

검증:

- `npm test` exit 0 — 기존 회귀 테스트(legacy-vs-wrapper, legacy-vs-built)가 변경 후에도 100% 통과. mutating-tool error 메시지 문자열 일치, prompt parts 정규화 일치, 8개 audit log 일치 확인.
- `npm run build` 성공 (dist 461.4kb).
- 신규 회귀 테스트 함수는 추가하지 않음 (Story 4.5 범위 보호).
- 새 모듈 디렉터리 (`src/services/compat/` 등) 도입 없음.
- `package.json`의 `test` 스크립트가 검사하는 `node --check src/index.js` / `node --check src/policies/legacy/devai-git-workflo.js` invariant는 변경 없음 — 두 진입점은 본 스토리에서도 import 가능 상태 유지.

Story 4.5 인계 사항: 회귀 테스트가 호환성 계약을 단일 출처로 참조해야 할 때 import 위치는 `src/utils/constants.js` (`SUPPORTED_HOOK_KEYS`, `WRAPPER_ONLY_HOOK_KEYS`). 두 상수는 `Object.freeze`로 변경 불가하다.

### Code Review R2 (2026-05-10)

코드 리뷰 결과: CRITICAL 0 / HIGH 0 / MEDIUM 3 / LOW 4. CRITICAL/HIGH 부재로 봉쇄적 결함은 없으며, 다음과 같이 R2에서 처리:

- **M-1 (SOT contract drift 단언) — Story 4.5로 이관 + R2에서 부분 완화.** 본 스토리는 "새 회귀 테스트 함수 추가 금지" 가드레일이 있으므로 SOT-vs-실제-export 불일치를 회귀로 단언하는 책임은 Story 4.5 영역으로 이관. 단, dead-import로 오해되어 누군가 `SUPPORTED_HOOK_KEYS` import를 지우는 사태를 막기 위해 `src/index.js`에 (a) import 위 명시 주석 + (b) `void SUPPORTED_HOOK_KEYS;` 라이브 바인딩 1줄을 추가해 SOT 앵커 보존.
- **M-2 (File List dist 라벨) — R2 자동 수정.** File List의 `dist/devai-aidd-guard.js` 라인을 "Build artifact (not git-tracked, regenerated by `npm run build`)"로 라벨 변경.
- **M-3 (frozen sets vs frozen Array 타입 mismatch) — R2 자동 수정.** `src/utils/constants.js` 헤더 코멘트에서 "frozen sets" 표현을 "frozen tuples"로 정정하고, Set 의미론이 필요한 소비자가 `new Set(SUPPORTED_HOOK_KEYS)`로 변환해야 함을 명시. 타입은 frozen Array를 그대로 유지(JSON 직렬화 + `.filter` 호환성).
- **L-1 (export 그룹화) — 스킵.** "새 모듈 디렉터리/파일 추가 금지" 가드레일과 충돌 가능성. 현재 `src/utils/constants.js` 내 시각적 구분선으로 충분.
- **L-2 (wrapper-only 주석 모순) — R2 자동 수정.** `permission-asked.js` / `file-edited.js` 헤더에서 fall-through 분기가 "현재 frozen baseline 기준 항상 발생; 미래 legacy 핸들러 등장에 대한 방어 코드"임을 명시.
- **L-3 (audit 이벤트 목록 동기화) — Story 4.5로 이관.** 헤더 audit list와 실제 emit 호출의 cross-check는 회귀 테스트 영역.
- **L-4 (tool-execute-after.js 헤더 finalization-gating 명시) — R2 자동 수정.** 헤더 JSDoc 끝에 "Finalization-gating asymmetry note"를 추가해 finish-tool 경로가 wrapper-only이며 legacy parity 비교를 깨지 않음을 명시.

검증 (R2 후):
- `npm test` exit 0 — 기존 `legacy-vs-wrapper` / `legacy-vs-built` parity 회귀 통과 유지. mutating-tool error 메시지 byte-for-byte 일치, 8건 audit log 일치, prompt parts 정규화 일치.
- `npm run build` 성공 (dist 461.4kb, R1과 동일 — comments-only delta).
- 수정은 모두 코드 동작 변경이 없는 documentation-as-contract 보강. 새 회귀 테스트/모듈 추가 없음.

Story 4.5 인계 (R2 추가): (1) `import { SUPPORTED_HOOK_KEYS } from "../src/utils/constants.js"` 후 `await DevaiAiddGuardPlugin(...)` 반환 키와 set-equal 단언 1건; (2) `src/index.js` 헤더 audit 이벤트 list와 본문 `audit.info(...)` 호출 set-equal 단언 1건; (3) `WRAPPER_ONLY_HOOK_KEYS`도 동일 패턴으로 단언.

### File List

- Modified:
  - `src/utils/constants.js` — Story 4.3 SUPPORTED_HOOK_KEYS / WRAPPER_ONLY_HOOK_KEYS frozen contract sets added.
  - `src/index.js` — module header JSDoc for compatibility contract; wrapperOnlyHooks now references WRAPPER_ONLY_HOOK_KEYS; hook map and export alias commented as contract surface.
  - `src/policies/legacy/devai-git-workflo.js` — frozen-baseline header JSDoc with 4 guardrails.
  - `src/hooks/command-execute-before.js` — thin-wrapper header JSDoc (start-instruction invariant).
  - `src/hooks/tool-execute-before.js` — thin-wrapper header JSDoc (mutating-tool error invariant).
  - `src/hooks/tool-execute-after.js` — thin-wrapper header JSDoc (lifecycle delegation order).
  - `src/hooks/session.js` — thin-wrapper header JSDoc (session.deleted teardown order).
  - `src/hooks/permission-asked.js` — wrapper-only boundary header JSDoc (asymmetry vs legacy core).
  - `src/hooks/file-edited.js` — wrapper-only boundary header JSDoc (asymmetry vs legacy core).
  - `dist/devai-aidd-guard.js` — Build artifact (not git-tracked, regenerated by `npm run build`); R1 build dist 461.4kb (comments-only delta from pre-story baseline 461.1kb), R2 build dist 461.4kb (R2 added/edited comments only — bundler keeps comment delta within rounding bucket).
  - `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 4-3 status ready-for-dev → in-progress → review.
  - `_bmad-output/implementation-artifacts/4-3-preserve-existing-bmad-command-compatibility-through-the-wrapper.md` — Status, Tasks, Dev Agent Record, File List, Change Log updates.

## Change Log

| Date       | Version | Description                                                                                                                                                                                                                       | Author |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-05-10 | 0.1     | dev-story workflow: BMAD command compatibility contract codified — SUPPORTED_HOOK_KEYS / WRAPPER_ONLY_HOOK_KEYS constants in src/utils/constants.js, contract-body JSDoc on src/index.js, frozen-baseline JSDoc on src/policies/legacy/devai-git-workflo.js, thin-wrapper / wrapper-only JSDoc on all 6 hook factories. No new behavior or regression tests added (Story 4.5 scope protected); npm test exit 0; npm run build dist 461.4kb; status in-progress → review. | Dev (claude-opus-4-7[1m]) |
| 2026-05-10 | 0.2     | code-review R1 + R2: 0 CRITICAL / 0 HIGH / 3 MEDIUM (M-1 SOT contract drift, M-2 dist File List label, M-3 frozen sets vs frozen Array) / 4 LOW. R2 auto-fixes: M-2 dist label corrected to "Build artifact (not git-tracked)"; M-3 constants comment "frozen sets" → "frozen tuples" with `new Set(...)` conversion guidance; M-1 partial mitigation via `void SUPPORTED_HOOK_KEYS;` SOT-anchor live binding + import-block comment; L-2 wrapper-only headers clarified as defensive fall-through; L-4 tool-execute-after header gained finalization-gating asymmetry note. M-1 SOT-vs-export drift assertion + L-3 audit-event list cross-check ceded to Story 4.5; L-1 export grouping skipped (collides with no-new-module guardrail). npm test exit 0; npm run build dist 461.4kb; status review → done. | Reviewer (claude-opus-4-7[1m]) |
