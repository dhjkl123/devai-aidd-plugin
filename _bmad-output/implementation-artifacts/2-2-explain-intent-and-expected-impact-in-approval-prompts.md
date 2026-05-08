# Story 2.2: 승인 프롬프트에서 의도와 예상 영향 설명

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want each Git approval request to explain the planned action and expected repository impact in clear human terms,
so that I can approve, deny, or ignore BMAD automation with confidence without exposing sensitive details.

## Acceptance Criteria

1. **Given** Story 2.1이 branch proposal, init proposal, finalization intent를 approval request로 승격하는 경우
   **When** approval payload가 만들어질 때
   **Then** 본문과 메타데이터는 action intent, expected repository impact, workflow context, policy rationale를 사람이 이해할 수 있는 간결한 문장으로 포함한다
   **And** raw full arguments, secret, full remote URL, 전체 절대 경로 같은 민감정보는 노출하지 않는다.
2. **Given** branch create/switch, init, commit, push처럼 서로 다른 Git action category가 approval 대상이 되는 경우
   **When** 설명 필드가 구성될 때
   **Then** 각 action마다 일관된 필수 설명 필드 집합을 사용한다
   **And** policy-derived explanation 규칙을 통해 왜 지금 이 승인이 필요한지 연결한다.
3. **Given** approval request가 UI prompt 본문과 audit/상태 메타데이터 양쪽에 사용되는 경우
   **When** 설명 스키마를 정의할 때
   **Then** body와 metadata schema는 분리하되 동일한 source-of-truth 설명 payload에서 파생된다
   **And** 2.3의 accept/deny/ignore 처리, gate 해제, 2.4/2.5의 failure explanation/recovery를 침범하지 않는다.

## Tasks / Subtasks

- [x] approval explanation payload의 canonical shape를 정의한다 (AC: 1, 2, 3)
  - [x] `src/services/approval/build-approval-request.js`에서 사용할 공통 설명 payload를 정의한다.
  - [x] action category별 필수 필드와 optional 필드를 문서화한다.
  - [x] prompt body와 metadata를 동일 payload에서 생성하도록 source-of-truth를 한 곳으로 제한한다.

- [x] policy-derived explanation 규칙과 redaction 규칙을 설계한다 (AC: 1, 2)
  - [x] `workflowPolicy`, `branchProposal`, `initProposal`, `readiness`, workflow state를 조합해 설명 문장을 생성하는 규칙을 정의한다.
  - [x] 민감정보 비노출 규칙과 허용 가능한 파생 정보만 노출하는 규칙을 분리한다.
  - [x] concise 원칙을 유지하면서 BMAD 흐름을 과도하게 막지 않는 문장 길이 가이드를 명시한다.

- [x] action category별 설명 필드를 정의한다 (AC: 2)
  - [x] branch create/switch, init, commit, push 각각에 대해 intent, impact, context, rationale 필드를 명시한다.
  - [x] commit/push는 Epic 3에서 실제 proposal source가 추가되더라도 동일한 설명 contract를 재사용할 수 있게 확장 포인트를 남긴다.

- [x] approval prompt body/metadata schema를 구현 지점에 맞춰 정리한다 (AC: 3)
  - [x] prompt body 텍스트 구조와 metadata object 구조를 분리 정의한다.
  - [x] `permission.asked`, audit logger, workflow state에서 재사용 가능한 최소 metadata를 규정한다.
  - [x] accept/deny/ignore outcome 저장은 2.3 범위임을 명시하고 여기서는 schema까지만 정의한다.

- [x] 회귀 테스트와 계약 테스트 포인트를 정리한다 (AC: 1, 2, 3)
  - [x] redaction, policy-derived explanation, action category별 필수 필드, legacy non-blocking 동작을 검증하는 테스트 목록을 남긴다.
  - [x] Epic 1 산출물 계약을 깨지 않는지 확인하는 integration 포인트를 포함한다.

## Dev Notes

### Story Intent

Story 2.2의 책임은 "승인 요청을 보여줄지 말지"가 아니라 "보여준다면 무엇을 어떻게 설명할지"를 정하는 것이다. Story 2.1이 `branchProposal`과 `initProposal` 같은 planned action을 approval request로 발행하면, 2.2는 그 request에 사람이 읽을 수 있는 설명 계층을 붙인다. 핵심은 다음 네 가지다.

1. **action intent**: 플러그인이 정확히 무엇을 하려는가.
2. **expected repository impact**: 승인 시 작업 디렉터리와 Git 상태에 어떤 변화가 생기는가.
3. **workflow context**: 어떤 BMAD workflow와 policy가 이 요청을 만들었는가.
4. **policy rationale**: 왜 지금 approval이 필요한가.

이 스토리는 설명 payload 설계와 렌더링까지만 다룬다. 사용자의 accept/deny/ignore 처리, gate 해제, workflow continuation은 Story 2.3 범위다. 실행 실패 사유 설명과 recovery guidance는 Story 2.4/2.5 범위다. 따라서 2.2 구현은 어떤 Git action도 직접 실행하지 않으며, 어떤 승인 결과도 확정하지 않는다.

### Verified Baseline Findings

- Epic 1은 이미 설명에 필요한 핵심 source object를 workflow state에 적재한다.
  - Story 1.4: `branchProposal`을 `command.execute.before`에서 계산해 stash한다. [Source: `src/hooks/command-execute-before.js`]
  - Story 1.5: `readiness` 결과와 `initProposal`을 stash한다. [Source: `src/hooks/command-execute-before.js`]
- `branchProposal` shape는 이미 안정적이다.
  - `{ kind: "branch", action, name, reason, current, policyMatch }`
  - `policyMatch`에는 `commandName`, `category`, `identityStrategy`, `branchRequired`, `finalization`이 들어간다. [Source: `src/services/git/branch-service.js`]
- `initProposal` shape도 이미 안정적이다.
  - `{ kind: "init", action: "git-init", directory, reason, requiresApproval, message, details }`
  - 여기서 `directory`와 `message`는 raw path 노출 위험이 있으므로 2.2에서 바로 body에 복사하면 안 된다. [Source: `src/services/git/build-init-proposal.js`]
- `readiness` 결과는 `outcome`, `reason`, `message`, `details` 표준 envelope를 따른다. `details`에는 `branch`, `hasRemote`, `remoteNames`, `directory`, `checkedAt`가 포함된다. [Source: `src/services/git/check-repository-readiness.js`]
- workflow policy는 `resolveWorkflowPolicy()`에서 `{ outcome, reason, message, details.policy, details.branch }` 형태로 나온다. [Source: `src/services/workflow/resolve-workflow-policy.js`]
- architecture는 approval-governed Git action control, outcome enum(`allow|deny|ask|skip`), action category(`branch/create`, `branch/switch`, `commit`, `push`, `init`, `finalize`)를 이미 정의한다. [Source: `_bmad-output/planning-artifacts/architecture.md#Authentication & Security`]
- architecture는 structured event payload 규칙과 `approval.requested`, `git.action.planned` 같은 event 이름을 이미 정의한다. [Source: `_bmad-output/planning-artifacts/architecture.md#Communication Patterns`]
- audit logger는 best-effort이며 flow를 막지 않는다. 2.2의 설명 생성도 이 원칙을 따라야 한다. [Source: `src/audit/logger.js`]

### Technical Requirements

#### 1. 설명 source-of-truth

2.2는 approval request 하나당 내부적으로 다음 3단계 구조를 사용한다.

1. **source inputs**
   - `workflowContext`
   - `workflowPolicy`
   - `branchProposal`
   - `initProposal`
   - `readiness`
   - 향후 Epic 3에서 추가될 `commitProposal`, `pushProposal`
2. **normalized explanation payload**
   - action별 설명 필드를 채운 canonical object
3. **rendered outputs**
   - 사용자 prompt body
   - approval metadata

canonical payload를 먼저 만들고, body/metadata는 그 payload에서 파생해야 한다. body 생성 중 임시 문자열을 만들고 metadata는 별도 규칙으로 다시 계산하는 이중 로직은 금지한다.

#### 2. action category별 설명 필드

모든 approval request는 공통적으로 아래 필드를 가져야 한다.

- `actionCategory`: `"branch/create" | "branch/switch" | "init" | "commit" | "push"`
- `intentSummary`: 한 줄 설명. 무엇을 하려는지.
- `impactSummary`: 한 줄 설명. 승인 시 저장소에 생기는 효과.
- `workflowSummary`: 어떤 workflow 문맥에서 나왔는지.
- `policyRationale`: 왜 approval이 필요한지.
- `sensitivity`: `"sanitized"`
- `detailLevel`: `"concise"`

action별 필수 세부 필드는 다음과 같다.

- `branch/create`
  - `targetBranchLabel`: redacted-safe branch label. 예: `feat/ABC-123-approval-copy`
  - `currentBranchLabel`: 현재 브랜치의 safe label 또는 `null`
  - `branchReasonCode`: `current-branch-is-long-lived | current-branch-failed-validation | no-current-branch`
  - 설명 포인트: 새 작업 브랜치를 만들려는 이유와 예상 효과

- `branch/switch`
  - `targetBranchLabel`
  - `currentBranchLabel`
  - `branchReasonCode`: `candidate-differs-from-current`
  - 설명 포인트: 다른 워크플로용 브랜치로 전환하려는 이유와 예상 효과

- `init`
  - `directoryLabel`: raw absolute path 대신 safe label. 예: `current working directory`
  - `repoStateCode`: `git-not-initialized`
  - 설명 포인트: Git 메타데이터 초기화가 필요하다는 점과 아직 원격/커밋 변경은 아니라는 점

- `commit`
  - `artifactScope`: 변경 범주 요약. 예: `workflow-generated artifacts`
  - `changeCountSummary`: 숫자 또는 범주형 요약만 허용
  - `finalizationMode`: policy finalization에서 파생
  - 설명 포인트: 승인 시 staged/eligible changes를 commit record로 남긴다는 점

- `push`
  - `targetRemoteLabel`: remote name만 허용. 예: `origin`
  - `targetBranchLabel`
  - `finalizationMode`
  - 설명 포인트: 로컬 commit을 configured remote branch에 publish한다는 점

commit/push proposal source object는 Epic 3에서 추가되더라도, 2.2는 지금부터 동일 설명 contract를 정의해 두는 편이 맞다. 그래야 2.1/2.3과 설명 계층이 action 종류와 무관하게 재사용된다.

#### 3. policy-derived explanation 규칙

정책 파생 설명은 자유 문장 생성이 아니라 규칙 기반 조합으로 만든다.

- workflow name은 `workflowContext.commandName` 또는 normalized command를 사용한다.
- workflow category는 `workflowPolicy.category`에서 가져온다.
- identity rationale은 `workflowPolicy.identityStrategy`를 바탕으로 짧게 번역한다.
  - `story` -> "현재 스토리 작업 문맥에 맞춘 변경을 분리하기 위해"
  - `ticket-or-args` -> "현재 작업 식별자와 입력 문맥에 맞춘 변경을 구분하기 위해"
  - `artifact-singleton` -> "단일 산출물 문맥을 유지하기 위해"
  - `artifact-or-args` -> "산출물 또는 입력 문맥에 맞게 변경 범위를 한정하기 위해"
- branch rationale은 `workflowPolicy.branchRequired === true`이면 "이 workflow는 전용 브랜치 정책을 따른다"를 포함한다.
- finalization rationale은 `workflowPolicy.finalization`에서 파생한다.
  - `commit-and-push` -> 이후 commit/push approval이 연쇄적으로 올 수 있음을 짧게 고지
  - `commit-optional-push` -> commit은 필요할 수 있으나 push는 선택적일 수 있음을 고지
  - `no-forced-finalization` -> 후속 Git finalization이 강제되지 않음을 고지
- readiness-derived rationale은 `init`일 때만 붙인다.
  - `git-not-initialized` -> "현재 디렉터리가 아직 Git 저장소가 아니므로 후속 branch/commit/push 자동화 전에 초기화가 필요함"

문장 수는 body 기준 최대 4줄, metadata 기준 key-value 요약만 허용한다. BMAD 흐름을 과도하게 막지 않기 위해 장문 배경 설명, 정책 원문 인용, 다단계 튜토리얼 텍스트는 금지한다.

#### 4. redaction 규칙

2.2는 approval copy 계층에서 다음 값을 직접 노출하면 안 된다.

- raw full arguments
- secret, token, credential, header 값
- full remote URL
- 절대 경로 전체
- 사용자가 입력한 긴 free-form 문장 전체

허용되는 값은 다음처럼 "derived, minimized, redacted-safe"여야 한다.

- branch name 자체는 정책상 이미 생성된 safe identifier이므로 표시 가능
- remote는 URL이 아니라 remote name만 표시 가능 (`origin`)
- directory는 `"current working directory"` 또는 basename 수준 label만 허용
- arguments는 전체 문자열을 복사하지 않고 `identityStrategy`에 따라 추출된 최소 label만 허용
- changed files는 파일 목록 전체 대신 count 또는 artifact scope 요약만 허용
- audit metadata와 prompt metadata 모두 동일 redaction 규칙을 따라야 한다

redaction helper는 body 렌더링 직전에만 쓰지 말고 canonical payload 생성 단계에서 먼저 적용해야 한다. 그래야 audit, state, prompt 어느 경로에서도 raw 값이 새지 않는다.

#### 5. approval prompt body/metadata schema

권장 schema는 아래와 같다.

```js
{
  body: {
    title: "Approval Required",
    summary: "Create a workflow branch for bmad-bmm-quick-dev.",
    lines: [
      "Intent: start a dedicated branch for the current implementation workflow.",
      "Impact: this will create a new local branch and keep current work isolated.",
      "Context: requested by bmad-bmm-quick-dev under implementation policy.",
      "Why approval is needed: this workflow requires a guarded Git state change."
    ]
  },
  metadata: {
    event: "approval.requested",
    actionCategory: "branch/create",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    policyCategory: "implementation",
    identityStrategy: "ticket-or-args",
    finalization: "commit-and-push",
    proposalKind: "branch",
    proposalAction: "create",
    detailLevel: "concise",
    sensitivity: "sanitized",
    explanation: {
      intentSummary: "...",
      impactSummary: "...",
      workflowSummary: "...",
      policyRationale: "..."
    }
  }
}
```

설계 원칙은 다음과 같다.

- `body.lines`는 사용자용 자연어다.
- `metadata.explanation.*`는 contract test 대상이다.
- `metadata`에는 2.3이 채울 `resolution`이나 `gateReleased`를 미리 넣지 않는다.
- `body.summary`와 `metadata.explanation.intentSummary`는 의미상 같되 완전 동일 문자열일 필요는 없다.
- `event: "approval.requested"`는 architecture contract와 정렬한다.

### Architecture Compliance

- approval 설명 생성은 `src/services/approval/`에 둔다. hook 안에서 직접 문자열을 조립하지 않는다. [Source: `_bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries`]
- outcome enum은 2.2에서 새로 만들지 않는다. approval request 자체는 2.1/2.3의 승인 흐름에 붙는 데이터일 뿐이며, 설명 계층은 outcome을 결정하지 않는다.
- event naming은 `dot.case`를 유지한다. approval 설명 metadata가 audit event에 재사용될 때 `approval.requested` contract를 깨지 않게 한다.
- audit logger는 best-effort이므로 설명 생성 실패가 전체 workflow를 hard-fail시키지 않도록 degrade 경로를 정의해야 한다.
  - 권장 fallback: 최소한의 safe generic copy
  - 금지 fallback: raw proposal object stringify

### Library / Framework Requirements

- 외부 copy/rendering 라이브러리 도입은 불필요하다.
- plain object builder + 소규모 string formatter로 충분하다.
- redaction과 explanation 조립은 pure function이어야 한다.
- `client.session.promptAsync` 직접 호출은 2.1 또는 2.3 계층에서 하며, 2.2는 request data만 만든다.

### File Structure Requirements

구현 파일 후보는 다음이 적절하다.

- `src/services/approval/build-approval-request.js`
  - 2.1이 proposal을 approval request로 감쌀 때 사용하는 entry point
  - 2.2의 canonical explanation payload와 body/metadata 조립의 주 구현 지점
- `src/services/approval/classify-git-action.js`
  - proposal kind/action을 `branch/create`, `branch/switch`, `init`, `commit`, `push` category로 정규화
- `src/services/approval/build-approval-explanation.js`
  - 설명 규칙이 커지면 분리할 후보. pure helper만 둔다.
- `src/services/approval/redact-approval-fields.js`
  - redaction rules 전담 helper 후보
- `src/hooks/permission-asked.js`
  - 실제 prompt 표시 직전 metadata/body를 소비하는 연결 지점 후보
- `src/hooks/command-execute-before.js`
  - source proposal이 stash되는 기존 지점. 2.2에서는 읽기 전용 참조만 해야 한다.
- `src/services/workflow/workflow-state.js`
  - approval request 또는 explanation metadata를 세션 상태에 저장할 필요가 있으면 여기 shape 확장을 검토
- `src/audit/logger.js`
  - 2.2 자체 구현 지점은 아니지만 sanitized metadata가 audit으로 흘러갈 때 contract 검증에 중요

### Testing Requirements

#### Regression test 포인트

`tests/regression.test.js`에 최소 다음 시나리오를 추가하는 편이 맞다.

1. branch create approval request가 `intentSummary`, `impactSummary`, `workflowSummary`, `policyRationale`를 모두 채우는지
2. branch switch approval request가 현재 브랜치와 대상 브랜치를 혼동하지 않는지
3. init approval request가 절대 경로 전체를 body에 노출하지 않는지
4. remote가 있는 push proposal 입력이 들어와도 full remote URL 대신 remote name만 남는지
5. raw arguments에 secret-like 문자열이 있어도 body/metadata에 그대로 복사되지 않는지
6. explanation builder failure 시 generic safe copy로 degrade하고 workflow를 hard-fail하지 않는지
7. non-workflow command 또는 proposal 없음 경로에서 approval explanation 생성이 호출되지 않는지

#### Contract test 포인트

architecture가 제안한 `tests/contracts/` 구조를 따를 수 있다면 다음 계약을 분리하는 것이 좋다.

- `approval-request.contract.test.js`
  - body/metadata top-level shape
  - `event === "approval.requested"`
  - `actionCategory` enum 제한
- `approval-redaction.contract.test.js`
  - path, URL, secret, raw args 비노출 계약
- `approval-explanation.contract.test.js`
  - 모든 action category가 공통 설명 필드 네 개를 채우는지
  - `detailLevel === "concise"`와 `sensitivity === "sanitized"` 고정 여부

#### Integration test 포인트

- `command.execute.before`에서 이미 생성된 `branchProposal`/`initProposal`이 approval build 단계까지 loss 없이 전달되는지
- `permission.asked`에서 request body가 사용자 프롬프트 형식으로 안정적으로 소비되는지
- audit logger로 흘러가는 metadata가 sanitized 상태를 유지하는지
- Epic 1 legacy parity를 깨지 않도록, approval 설명 계층 추가가 mutating-tool guard 에러 메시지나 workflow detection baseline을 바꾸지 않는지

### Previous Story Intelligence

- Story 1.4는 branch proposal을 이미 "설명 가능한 데이터 구조"로 잘라 두었다. 2.2는 여기에 자연어 설명을 붙이면 된다. branch name 재계산이나 policy 재해석을 다시 하면 drift가 생긴다. [Source: `_bmad-output/implementation-artifacts/1-4-compute-branch-strategy-and-candidate-branch-names.md`]
- Story 1.5는 init proposal과 readiness reason을 이미 분리했다. 2.2는 `git-not-initialized` 같은 reason code를 사람이 읽을 수 있는 copy로 번역하면 된다. init 여부를 다시 탐지하면 안 된다. [Source: `_bmad-output/implementation-artifacts/1-5-check-repository-readiness-and-propose-initialization.md`]
- `command.execute.before`는 이미 `branchProposal`, `initProposal`, `readiness`를 stash하고 `git.action.planned` audit도 찍는다. 2.2는 이 흐름을 활용해야 하며 훅 안에서 추가 Git 검사나 정책 resolver 재호출을 남발하면 안 된다. [Source: `src/hooks/command-execute-before.js`]
- `workflowState`는 shallow copy store다. approval request/explanation object를 넣을 때 mutable nested object를 외부에서 재사용하지 않도록 주의해야 한다. [Source: `src/services/workflow/workflow-state.js`]

### Project Structure Notes

- 2.2는 `services/approval` 도입의 첫 실질 단계가 될 가능성이 높다. 문자열 조립이 훅으로 퍼지면 이후 2.3, 2.4, 2.5에서 유지보수가 어려워진다.
- Epic 1 산출물을 source-of-truth로 삼아야 한다.
  - workflow detection: Story 1.2
  - policy resolution: Story 1.3
  - branch planning: Story 1.4
  - readiness/init planning: Story 1.5
- 2.2는 "approval copy layer"이므로 `git-executor`, `commit-service`, `push-service` 같은 실행 계층을 앞당겨 만들 필요는 없다.
- 2.3이 resolution state를 추가하더라도, 2.2의 metadata schema는 request 시점 정보만 담아야 한다.

### References

- Epic 2 story definition: [Source: `_bmad-output/planning-artifacts/epics.md#스토리 2.2`]
- Epic 2 scope and adjacent stories: [Source: `_bmad-output/planning-artifacts/epics.md#에픽 2`]
- Architecture approval and action categories: [Source: `_bmad-output/planning-artifacts/architecture.md#Authentication & Security`]
- Architecture event contracts: [Source: `_bmad-output/planning-artifacts/architecture.md#Communication Patterns`]
- Architecture file boundaries: [Source: `_bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries`]
- Architecture format patterns: [Source: `_bmad-output/planning-artifacts/architecture.md#Format Patterns`]
- Branch proposal source contract: [Source: `src/services/git/branch-service.js`]
- Init proposal source contract: [Source: `src/services/git/build-init-proposal.js`]
- Readiness result envelope: [Source: `src/services/git/check-repository-readiness.js`]
- Workflow policy source contract: [Source: `src/services/workflow/resolve-workflow-policy.js`]
- Workflow state storage behavior: [Source: `src/services/workflow/workflow-state.js`]
- Proposal stashing and audit baseline: [Source: `src/hooks/command-execute-before.js`]
- Audit best-effort behavior: [Source: `src/audit/logger.js`]
- Epic 1 implementation context: [Source: `_bmad-output/implementation-artifacts/1-4-compute-branch-strategy-and-candidate-branch-names.md`]
- Epic 1 implementation context: [Source: `_bmad-output/implementation-artifacts/1-5-check-repository-readiness-and-propose-initialization.md`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw _bmad/bmm/workflows/4-implementation/create-story/workflow.md`
- `Get-Content -Raw _bmad-output/implementation-artifacts/1-4-compute-branch-strategy-and-candidate-branch-names.md`
- `Get-Content -Raw _bmad-output/implementation-artifacts/1-5-check-repository-readiness-and-propose-initialization.md`
- `Get-Content -Raw src/hooks/command-execute-before.js`
- `Get-Content -Raw src/services/git/branch-service.js`
- `Get-Content -Raw src/services/git/build-init-proposal.js`
- `Get-Content -Raw src/services/git/check-repository-readiness.js`
- `Get-Content -Raw src/services/workflow/resolve-workflow-policy.js`

### Completion Notes List

- 2026-05-09 code-review 결과 0 HIGH / 0 MEDIUM / 8 LOW. AC 1·2·3 및 모든 [x] task가 실제 구현으로 검증됨. 8개 LOW 모두 자동 수정 적용:
  - L1: `looksLikeSecret`, `redactRawArguments` 헬퍼 삭제(미사용 dead surface). 회귀 테스트도 정리.
  - L2: `src/index.js` `pluginContext.buildApprovalRequest` / `approvalPolicyService` 노출 제거. hook이 직접 import 하므로 facade 불필요.
  - L3: explanation payload에 `fallback: boolean` 플래그 추가. `metadata.explanation.fallback` 및 `approval.requested` audit `details.explanationFallback`으로 노출되어 canonical builder 회귀가 audit에서 가시화됨.
  - L4: `safeBuildExplanation` catch 경로 회귀 테스트 추가(`reason` getter throw → fallback payload 검증).
  - L5: `prompt` 객체에서 중복 `actionType`/`workflow` 필드 제거.
  - L6: `prompt.title`을 상수 `"Approval Required"`로 고정해 스펙 예시 schema와 정렬. 미사용 `actionLabel` 파라미터 제거.
  - L7: `READINESS_RATIONALE` 확장 시 함께 갱신해야 한다는 인라인 주석 추가.
  - L8: `repoStateCode` default를 `"git-not-initialized"` 리터럴 대신 `"unknown"`으로 변경하여 추측 단언 방지.
- Story 2.2 구현을 위한 설명 payload, redaction, policy-derived rationale, prompt body/metadata schema, 테스트 포인트를 정리했다.
- 범위 경계를 명시했다: 설명 payload/렌더링은 2.2, resolution/gate 해제는 2.3, failure explanation/recovery는 2.4/2.5.
- Epic 1 산출물과 현재 코드의 source-of-truth 객체를 기준으로 구현 후보 파일과 integration 포인트를 연결했다.
- 신규 모듈 `src/services/approval/build-approval-explanation.js`에 canonical explanation payload와 fallback payload를 단일 진입점으로 두었다. 모든 설명 문장은 규칙 기반 조합이며 자유 prose는 금지된다.
- `src/services/approval/redact-approval-fields.js`에 branch label / directory label / remote label / raw arguments / secret 휴리스틱 redaction 헬퍼를 모았다. URL이나 SSH 형식의 remote는 모두 null로 떨어진다.
- `src/services/approval/build-approval-request.js`는 explanation을 한 번 만들고 prompt body(`title`, `summary`, `lines`)와 metadata(`event=approval.requested`, `actionCategory`, `policyCategory`, `identityStrategy`, `finalization`, `proposalKind`, `proposalAction`, `detailLevel`, `sensitivity`, `explanation.{intent,impact,workflow,policy,fields}`)를 동일 source에서 파생한다. Story 2.1 contract(`prompt.summary`, `metadata.proposalKind`, `status="awaitingApproval"`, deterministic id)는 그대로 보존된다.
- `src/hooks/command-execute-before.js`에서 `workflowContext`, `workflowPolicy`, `readiness`를 builder에 전달해 hook 안에서 별도 문자열 조립이 일어나지 않도록 했다.
- `src/index.js`의 `requestApproval` adapter는 새 `prompt.lines`가 있으면 title + lines를 합쳐서 보여주고, metadata에는 sanitized explanation 블록만 전달한다. summary-only 폴백 경로는 그대로 유지된다.
- 회귀 테스트 6종을 추가했다: redaction 헬퍼, explanation builder 계약, request body/metadata Story 2.2 필드, request 레벨 redaction(절대 경로/원격 URL/raw 시크릿 비노출), hook 통합, fallback 경로. 기존 Story 2.1 회귀 테스트도 동일하게 통과한다.
- 빌드 산출물 `dist/devai-aidd-guard.js`도 새 모듈을 포함해 다시 빌드했고 wrapper-vs-built parity 회귀 테스트도 통과한다.

### File List

- `_bmad-output/implementation-artifacts/2-2-explain-intent-and-expected-impact-in-approval-prompts.md`
- `src/services/approval/build-approval-explanation.js` (new)
- `src/services/approval/redact-approval-fields.js` (new)
- `src/services/approval/build-approval-request.js` (modified)
- `src/hooks/command-execute-before.js` (modified)
- `src/index.js` (modified)
- `tests/regression.test.js` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
- `dist/devai-aidd-guard.js` (regenerated build artifact)

## Change Log

- 2026-05-08: Story 2.2 구현 완료. approval explanation payload / redaction / prompt body / metadata schema 분리 및 hook 연결, 회귀 테스트 6종 추가.
- 2026-05-09: Code review 후속 8 LOW 자동 수정 (L1 dead helpers / L2 dead pluginContext surface / L3 fallback observability / L4 fallback catch test / L5 prompt 중복 필드 / L6 title 상수화 / L7 readiness 주석 / L8 repoState default). dist 재빌드, 회귀 테스트 전부 통과. status: review → done.
