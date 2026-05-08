# Story 2.1: Present Approval Requests for Planned Git Actions

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want each planned Git action to be presented as an approval request,
so that I can decide whether automation should proceed before any repository mutation occurs.

## Acceptance Criteria

1. **Given** the plugin has planned a Git action such as branch creation, branch switch, commit, push, or init
   **When** approval is required for that action
   **Then** the runtime presents an approval request before execution
   **And** the request is associated with the current workflow session and action type.
2. **Given** multiple Git actions may occur across a workflow
   **When** approval prompts are generated
   **Then** each prompt is scoped to a single planned action
   **And** the system avoids executing later actions until the current approval outcome is resolved.

## Tasks / Subtasks

- [x] `src/services/approval/` 계층을 신설해 planned Git action을 approval request로 변환한다. (AC: 1, 2)
  - [x] `src/services/approval/classify-git-action.js`를 생성하고 proposal을 표준 action category로 정규화한다.
    - 입력 후보: `branchProposal`, `initProposal`, 향후 Story 3.x에서 주입될 `commitProposal`, `pushProposal`.
    - 출력 형식: `{ kind, actionType, actionLabel, requiresApproval: true }`.
    - `actionType`은 `branch/create`, `branch/switch`, `init`, `commit`, `push`만 허용한다.
  - [x] `src/services/approval/build-approval-request.js`를 생성하고 단일 proposal에서 approval request 객체를 만든다.
    - 출력 형식:
      ```js
      {
        id,
        sessionID,
        workflow,
        command,
        phase,
        actionType,
        status: “awaitingApproval”,
        proposal,
        prompt,
        metadata,
        createdAt
      }
      ```
    - `id`는 `sessionID + actionType + stable proposal fingerprint` 기반의 결정적 문자열로 생성한다.
    - `prompt`는 Story 2.2에서 확장 가능하도록 최소 구조만 포함한다. 현재 스토리에서는 action type, workflow command, short summary만 담는다.
  - [x] `src/services/approval/approval-policy-service.js`를 생성하고 현재 workflow state에서 “다음 approval request를 발행할 수 있는지”를 판정한다.
    - `getPendingApproval(state)`는 기존 대기 요청을 반환한다.
    - `selectNextPlannedAction(state)`는 branch/init/commit/push proposal 중 첫 번째 미해결 항목 하나만 선택한다.
    - `evaluateRequestGate(state)`는 `{ outcome: “allow” | “skip”, reason }`를 반환한다.
    - 대기 중 요청이 있으면 `outcome: “skip”`, `reason: “approval-already-pending”`.
    - proposal이 없으면 `outcome: “skip”`, `reason: “no-planned-git-action”`.
  - [x] approval 서비스는 pure function 우선 원칙을 지키고, 실제 prompt 호출은 hook 계층으로 한정한다.

- [x] workflow state에 approval request 저장 구조를 추가한다. (AC: 1, 2)
  - [x] `src/services/workflow/workflow-state.js`를 수정해 기존 얕은 복사 정책을 유지하면서 다음 필드를 저장 가능하게 한다.
    - `approvalCurrent`: 현재 대기 중 approval request 객체 또는 `null`
    - `approvalHistory`: 생성 이력 배열. Story 2.1에서는 append만 하고 결과 갱신은 하지 않는다.
    - `plannedActions`: 선택적 캐시. 별도 필드 대신 `branchProposal`, `initProposal` 등 기존 stash 필드를 그대로 읽어도 된다. 중복 상태를 피하려면 캐시 필드는 만들지 않는 쪽이 낫다.
  - [x] 상태 단계 규칙을 문서화하고 구현한다.
    - workflow phase는 기존 `start | in-progress | finish`
    - approval state는 별도 명시 값 `awaitingApproval`
    - 장시간 작업 모델의 `planned -> awaitingApproval -> resolved` 중 이 스토리는 `awaitingApproval` 진입까지만 담당한다.
  - [x] `set()`과 `get()`이 approval request 중첩 객체에서도 외부 참조 누수를 일으키지 않도록 테스트를 추가한다.

- [x] `command.execute.before` 훅에서 planned action을 approval request로 발행한다. (AC: 1, 2)
  - [x] `src/hooks/command-execute-before.js`에서 Story 1.4/1.5가 stash한 `branchProposal`, `initProposal`을 읽어 approval gate를 평가한다.
  - [x] proposal 우선순위를 고정한다.
    - 1순위: `initProposal`
    - 2순위: `branchProposal`
    - 이후 Story 3.x에서 `commitProposal`, `pushProposal`을 같은 선택 함수에 연결한다.
  - [x] `initProposal`이 있으면 branch proposal이 있더라도 동일 세션에서는 init approval request만 발행한다.
  - [x] approval request를 생성한 뒤 workflow state에 `approvalCurrent`로 stash하고 `approvalHistory`에 append한다.
  - [x] request 생성 후 구조화 audit 이벤트 `approval.requested`를 best-effort로 기록한다.
    - payload 예시:
      ```js
      {
        event: “approval.requested”,
        timestamp,
        workflow: context.commandName,
        command: context.commandName,
        outcome: “ask”,
        details: {
          requestId,
          actionType,
          proposalKind,
          phase: context.phase,
          sessionID: context.sessionID
        }
      }
      ```
  - [x] hook는 승인 대기만 설정하고 실제 Git mutation을 호출하지 않는다.
  - [x] hook는 approval request를 사용자에게 제시하기 위해 runtime client prompt adapter를 호출할 수 있도록 `pluginContext` 또는 별도 adapter를 주입받는다.
    - 직접 `client.session.promptAsync(...)`를 hook 내부에서 호출해도 되지만, 테스트성과 향후 Story 2.3 분리를 위해 `pluginContext.requestApproval` 형태의 주입이 더 안전하다.

- [x] bootstrap에서 approval request 발행 의존성을 조립한다. (AC: 1)
  - [x] `src/index.js`에서 `pluginContext`에 approval 관련 진입점을 주입한다.
    - `buildApprovalRequest`
    - `approvalPolicyService`
    - `requestApproval(request)` 또는 `approvalPromptAdapter.ask(request)`
  - [x] runtime client 의존성은 bootstrap에서만 생성하고 services는 client 객체를 직접 알지 않게 한다.
  - [x] approval request 발행 실패는 best-effort가 아니라 “request 생성 실패”로 분리해 throw 가능하되, 이 스토리에서는 Git action 실행이 아직 없으므로 repository mutation risk는 없다.
    - 단, FR22를 지키기 위해 prompt 표시 실패가 workflow 전체를 즉시 망가뜨리지 않도록 `approval.requested` 이전 단계에서 안전한 오류 메시지와 상태 기록 전략을 함께 설계한다.

- [x] approval request 중복 발행과 후속 action 차단 규칙을 구현한다. (AC: 2)
  - [x] 동일 `sessionID`에서 `approvalCurrent.status === “awaitingApproval”`이면 추가 approval request를 만들지 않는다.
  - [x] `tool.execute.before`, `tool.execute.after`, `session` 훅은 이 스토리에서 승인 결과를 해소하지 않는다. 대신 현재 세션에 pending request가 있더라도 phase 갱신만 수행하고 추가 Git proposal 발행은 하지 않는다.
  - [x] 같은 `command.execute.before`가 재호출되더라도 기존 `approvalCurrent.id`와 동일한 fingerprint이면 새 prompt를 반복 발행하지 않도록 idempotency를 보장한다.
  - [x] 후속 action 대기 의미는 “다음 Git action proposal을 approval request로 승격하지 않는다”이다. 비 Git BMAD 작업 자체를 막는 것은 아니다.

- [x] 테스트와 계약 검증을 확장한다. (AC: 1, 2)
  - [x] `tests/regression.test.js`에 다음 케이스를 추가한다.
    - `branchProposal`만 있는 implementation workflow에서 `approvalCurrent.actionType === “branch/create”` 또는 `”branch/switch”`가 생성되는지.
    - non-git readiness `ask` 경로에서 `initProposal`만 approval request로 승격되고 branch request는 생성되지 않는지.
    - 동일 세션에서 pending approval이 있으면 두 번째 `command.execute.before` 호출이 새 `approval.requested` 이벤트를 emit하지 않는지.
    - planning/non-workflow command에서는 approval request가 생성되지 않는지.
    - approval request payload가 `sessionID`, `workflow`, `actionType`, `proposal.kind`를 유지하는지.
  - [x] built artifact parity 검증을 유지한다. 새 audit 이벤트와 state stash가 wrapper/built 경로 모두에서 동일하게 동작해야 한다.
  - [x] 가능하면 `tests/contracts/approval-policy.contract.test.js`를 새로 추가해 표준 결과 문자열과 request shape를 고정한다. 아직 contracts 폴더가 없으면 이번 스토리에서는 `tests/regression.test.js`에 우선 포함해도 된다.

- [x] 범위 밖 책임을 명시적으로 분리한다. (AC: 1, 2)
  - [x] Story 2.3 책임:
    - `accept | deny | ignore-and-continue` 선택지 처리
    - `approval.resolved` 기록
    - `approvalCurrent` 해제 및 후속 proposal로 진행
  - [x] Story 2.4/2.5 책임:
    - approval prompt 실패, Git 실행 실패, conflict/recovery 분류
    - retry/skip/manual recovery 경로
  - [x] Story 3.x 책임:
    - commit/push proposal 생성
    - 승인 후 실제 Git execution/finalization

### Review Follow-ups (AI)

- [x] [AI-Review][Low] 테스트 리소스 누수 — `verifyApprovalRequestFromBranchProposal`에서 `gitWorkspace`를 try/finally로 감싸고 마지막에 `fs.rmSync` 정리 추가. [tests/regression.test.js:2156, 2253]
- [x] [AI-Review][Low] 새 이벤트 `approval.prompt.delivery.failed`와 `git.readiness.checked`를 architecture의 "구조화 필수 이벤트" 목록에 등록. [_bmad-output/planning-artifacts/architecture.md:341-345]
- [x] [AI-Review][Low] `approval.prompt.delivery.failed`의 `outcome: "ask"` → `"skip"`, `details.reason: "prompt-delivery-failed"` 추가로 architecture 표준 outcome 의미와 정합. 회귀 테스트 assertion도 갱신. [src/hooks/command-execute-before.js:234-249, tests/regression.test.js:2724-2733]
- [x] [AI-Review][Low] 재진입 시 stale Git-evaluation 필드(`branchProposal`/`initProposal`/`readiness`)를 carry-over에서 `undefined`로 명시적 invalidate. 매 호출마다 새로 계산되므로 phantom request 위험 차단. 회귀 테스트 `verifyStaleGitFieldsInvalidatedOnReentry` 추가. [src/hooks/command-execute-before.js:54-66, tests/regression.test.js:2882-2954]
- [x] [AI-Review][Low] `buildProposalFingerprint`에 `current` 필드를 `from:<branch>` 형태로 추가해 동일 candidate name + 다른 출발점이 서로 다른 id를 갖도록 보강. 회귀 테스트 assertion 추가. [src/services/approval/build-approval-request.js:36-49, tests/regression.test.js:2026-2049]

## Dev Notes

### Story Intent

이 스토리는 Epic 1이 준비한 `branchProposal`, `initProposal`, `readiness`를 실제 사용자 승인 흐름의 첫 입력으로 연결하는 단계다. 핵심은 “planned Git action 하나를 approval request 하나로 승격하고, 해당 요청이 해결되기 전까지 다음 Git action request는 만들지 않는다”는 orchestration 규칙을 만드는 것이다. 이 시점에서는 실제 Git mutation도, accept/deny 처리도 하지 않는다. 승인 요청을 식별 가능하고 재진입 안전한 상태 객체로 만들고, 현재 workflow session/action type과 결합해 stash 및 audit하는 것까지가 완료 조건이다.

### Verified Baseline Findings

- 현재 `src/hooks/command-execute-before.js`는 workflow detection, readiness check, branch planning을 수행하고 `initProposal`, `branchProposal`을 workflow state에 stash한다.
- 현재 코드베이스에는 `src/services/approval/` 디렉터리가 아직 없고, approval request 발행 전용 로직도 없다.
- 현재 bootstrap `src/index.js`는 `pluginContext`에 `runtimeConfig`, `directory`, `gitRunner`, `resolvePolicy`만 주입한다. approval prompt adapter는 아직 없다.
- 현재 state store `src/services/workflow/workflow-state.js`는 shallow copy 기반의 단순 세션 store이며 `approvalCurrent` 같은 명시 필드는 없다.
- 현재 구조화 이벤트는 `workflow.detected`, `git.readiness.checked`, `git.action.planned`, `config.validation.failed`까지 구현돼 있다. `approval.requested`는 아직 없다.
- Epic 1 기준선에서 branch/init proposal은 이미 “later approval step”을 위해 저장되지만, 실제 request 발행은 아직 없다. 이 갭을 메우는 것이 Story 2.1의 직접 책임이다.

### Technical Requirements

- approval request는 반드시 **단일 action 단위**다. 하나의 request 안에 branch+commit 또는 init+branch를 묶지 않는다.
- approval request는 workflow session에 귀속돼야 한다. 최소 필수 식별자는 `sessionID`, `workflow`, `command`, `actionType`, `requestId`.
- approval request 생성은 proposal 존재 여부에만 의존하고, 실제 Git 가능 여부 재검증을 수행하지 않는다. readiness/branch planning은 기존 Story 1.4/1.5 결과를 신뢰한다.
- 후속 action 대기 규칙은 **workflow 중단**이 아니라 **다음 approval request 승격 중단**이다. FR13/FR22 때문에 BMAD 작업 자체를 막는 설계는 피한다.
- audit는 best-effort로 유지하되 approval request 객체 자체는 state에 정확히 반영돼야 한다. audit 실패 때문에 state stash가 누락되면 안 된다.
- approval request 생성이 동일 입력에서 결정적이어야 한다. 같은 proposal이 다시 평가될 때 request id가 안정적이어야 중복 prompt 방지 테스트가 가능하다.
- no implicit git mutation 원칙 유지:
  - `git checkout`, `git switch`, `git init`, `git commit`, `git push` 실행 금지
  - permission/file/session 훅에서 side-channel mutation 금지
- prompt metadata에는 민감한 raw arguments 전체를 넣지 않는다. Story 2.2 전까지는 summary를 최소화하고, proposal-derived 값만 사용한다.

## Architecture Compliance

- 훅은 thin 하게 유지한다. `src/hooks/command-execute-before.js`는 다음 순서의 orchestration만 담당한다.
  1. 기존 workflow detection/readiness/branch planning 수행
  2. workflow state 조회
  3. approval gate 평가
  4. approval request 생성
  5. state stash
  6. `approval.requested` audit
  7. runtime prompt adapter 위임
- 실질 로직은 `src/services/approval/`에 둔다.
  - `approval-policy-service.js`: gate, pending, next action selection
  - `classify-git-action.js`: proposal -> action category
  - `build-approval-request.js`: request shape 구성
- `src/commands/`는 필요시 `request-approval-command.js`를 추가할 수 있으나, 현재 코드베이스가 command 객체 없이 함수 중심으로 움직이므로 이번 스토리에서 파일 생성은 선택 사항이다. 생성하더라도 thin DTO 수준에 그쳐야 한다.
- `src/events/`는 아직 실제로 존재하지 않는다. 새 파일을 만든다면 event payload builder를 분리할 수 있지만, scope를 키우지 않으려면 우선 hook/service 내부에서 architecture 계약을 따르는 payload 객체를 직접 만들고, Story 2.4+에서 정식 분리해도 된다.
- 이벤트명은 `dot.case`만 사용한다. 이 스토리의 신규 이벤트는 `approval.requested`.
- approval 관련 상태 문자열은 architecture 고정값을 따른다.
  - 판정 결과: `allow | deny | ask | skip`
  - request 상태: `awaitingApproval`
- 레거시 코어 `src/policies/legacy/devai-git-workflo.js`는 수정하지 않는다. approval request 경로는 wrapper 바깥에서 감싸야 한다.

## Library / Framework Requirements

- 새 npm 의존성 추가 금지. Node 22 내장 기능과 기존 프로젝트 유틸만 사용한다.
- request id/fingerprint는 `node:crypto`의 `createHash`를 사용해도 되지만, 더 단순한 결정적 문자열 조합으로 충분하면 해시 없이 구현해도 된다.
- prompt 호출은 현재 runtime client contract를 따른다. bootstrap에서 이미 `client`를 보유하므로 별도 UI 라이브러리나 이벤트 버스 도입 금지.
- audit는 기존 `src/audit/logger.js` adapter를 그대로 사용한다. hook/service에서 직접 console 출력 금지.

## File Structure Requirements

- 신규 파일:
  - `src/services/approval/approval-policy-service.js`
  - `src/services/approval/build-approval-request.js`
  - `src/services/approval/classify-git-action.js`
- 수정 파일:
  - `src/hooks/command-execute-before.js`
  - `src/index.js`
  - `src/services/workflow/workflow-state.js`
  - `tests/regression.test.js`
- 선택적 신규 파일:
  - `src/commands/request-approval-command.js`
  - `src/events/event-payloads.js` 또는 approval payload helper
  - 단, scope를 불필요하게 넓히지 않는 경우에만 추가한다.
- 수정 금지 또는 defer 대상:
  - `src/policies/legacy/devai-git-workflo.js`
  - 실제 Git executor 계층 전반 (`git-executor.js`, `commit-service.js`, `push-service.js`)은 아직 존재하지 않거나 이번 스토리 범위 밖

## Testing Requirements

- 필수 검증 명령: `npm run build && npm test`
- 회귀 테스트 포인트:
  - implementation workflow + branch proposal -> `approvalCurrent` 생성
  - non-git repo + init proposal -> `approvalCurrent.actionType === "init"`
  - pending approval 존재 시 두 번째 request 미발행
  - non-workflow command -> approval state 미생성
  - planning workflow with no branch/init proposal -> approval state 미생성
  - `approval.requested` audit payload shape 검증
    - `event`
    - `timestamp`
    - `workflow`
    - `command`
    - `outcome: "ask"`
    - `details.requestId`
    - `details.actionType`
    - `details.sessionID`
- 상태 저장 테스트 포인트:
  - `workflowState.get()`이 approvalCurrent nested object를 외부 변경으로부터 보호하는지
  - `approvalHistory` append 후 이전 snapshot이 내부 상태를 오염시키지 않는지
- built parity:
  - wrapper/built artifact 모두 동일한 `approval.requested` 이벤트와 `approvalCurrent` stash 계약을 만족해야 한다.

## Previous Story Intelligence

- Story 1.4는 branch planning을 pure service로 분리하고 결과를 `branchProposal`로 stash하는 패턴을 확립했다. Story 2.1도 같은 방식으로 “계산은 service, orchestration은 hook” 경계를 유지해야 한다.
- Story 1.5는 `initProposal`이 있는 경우 branch proposal 발행을 억제하는 baseline을 이미 `command.execute.before`에 반영했다. Story 2.1은 이 우선순위를 그대로 가져가야 한다. 즉 `initProposal`이 있으면 branch approval request를 동시에 만들면 안 된다.
- Story 1.5는 readiness `ask/git-not-initialized`가 branch `git.action.planned`를 emit하지 않는 회귀 테스트를 갖고 있다. Story 2.1에서도 동일 원칙으로 init approval request만 승격시켜야 한다.
- Story 1.1/1.2는 wrapper가 legacy parity를 깨지 않도록 설계됐다. approval request 발행이 legacy output parts나 mutating-tool error message를 바꾸면 안 된다.
- 현재 `tool.execute.before` / `tool.execute.after`는 phase만 `in-progress`로 전환한다. approval resolution 로직을 여기에 섞지 않는 것이 Story 2.3 분리에 유리하다.

## Git Intelligence Summary

- 최근 커밋 흐름은 Story 1.4, 1.5 리뷰 완료 및 병합 중심이다.
  - `a3a1e40 Finish story 1-5 repository readiness review`
  - `30e317b Finish story 1-4 branch strategy review`
  - 그 외 merge commit들은 Epic 1 산출물을 통합한 기록이다.
- 이는 현재 코드베이스가 “planning -> review -> merge” 패턴으로 움직이고 있음을 보여준다. Story 2.1 구현도 새 approval 계층을 얇게 추가하고 기존 Story 1.x 계약을 보존하는 방향이 안전하다.
- 현재 작업선에는 approval 서비스 파일이 아직 없으므로 중복 구현 위험보다 파일 위치/경계 위반 위험이 더 크다. `src/services/approval/` 아래로 집중시키는 것이 중요하다.

## Project Structure Notes

- architecture 목표 구조에는 이미 `src/services/approval/`, `src/commands/request-approval-command.js`, `src/events/`가 정의돼 있다. 이번 스토리는 그중 최소 승인 요청 경로만 구체화한다.
- 현재 실제 구현은 `src/services/workflow/`와 `src/services/git/`만 존재한다. 따라서 approval 계층은 이번 스토리에서 첫 도입이며, 향후 Story 2.2/2.3이 이 위에 설명/결과 처리 로직을 쌓게 된다.
- 상태 저장은 메모리 컨텍스트만 사용한다. 별도 파일/DB 영속화는 architecture 범위 밖이다.
- 승인 대기 상태는 세션별 단일 활성 request만 허용한다. 여러 pending request queue를 지금 도입하면 Story 2.3/2.5 복잡도가 불필요하게 증가한다.

## References

- Epic 정의 및 Story 2.1 AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1: Present Approval Requests for Planned Git Actions]
- FR10, FR11, FR12, FR13, FR19, FR20, FR21, FR22: [Source: _bmad-output/planning-artifacts/prd.md#Approval-Driven Execution]
- approval-governed security model과 action categories: [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- command/event 패턴과 `approval.requested`, `git.action.planned`: [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns]
- `dot.case`, fixed outcome strings, `awaitingApproval` 상태 지침: [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- file structure target (`src/services/approval/`, `src/commands/`, `src/events/`): [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- 현재 hook baseline: [Source: src/hooks/command-execute-before.js]
- 현재 workflow state baseline: [Source: src/services/workflow/workflow-state.js]
- 현재 bootstrap injection baseline: [Source: src/index.js]
- branch policy / workflow policy baseline: [Source: src/config/defaults.js]
- previous implementation context: [Source: _bmad-output/implementation-artifacts/1-4-compute-branch-strategy-and-candidate-branch-names.md]
- previous implementation context: [Source: _bmad-output/implementation-artifacts/1-5-check-repository-readiness-and-propose-initialization.md]
- regression baseline: [Source: tests/regression.test.js]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Read `src/hooks/command-execute-before.js` — baseline hook structure
- Read `src/services/workflow/workflow-state.js` — shallow copy policy
- Read `src/index.js` — bootstrap injection pattern
- Read `tests/regression.test.js` — existing test suite (28k tokens, read in chunks)
- Read `src/audit/logger.js` — audit adapter pattern
- Read `src/services/git/check-repository-readiness.js` — proposal shape reference
- Read `src/services/workflow/detect-workflow-context.js` — WORKFLOW_PHASES
- Read `package.json` — build/test scripts

### Completion Notes List

- `src/services/approval/classify-git-action.js` 생성: proposal → `{ kind, actionType, actionLabel, requiresApproval: true }` 변환 pure function. `branch/create`, `branch/switch`, `init`, `commit`, `push` 5가지 actionType만 허용.
- `src/services/approval/build-approval-request.js` 생성: 결정적 ID (`approval:{sessionID}:{actionType}:{fingerprint}`) 기반 ApprovalRequest 빌더. `createdAt` 주입 지원으로 테스트 친화적.
- `src/services/approval/approval-policy-service.js` 생성: `getPendingApproval`, `selectNextPlannedAction` (initProposal 우선), `evaluateRequestGate` pure function 3개. `allow|skip` + reason 반환.
- `src/services/workflow/workflow-state.js` 수정: `get()`에서 `approvalCurrent`와 `approvalHistory` shallow copy 추가로 외부 참조 누수 차단. JSDoc으로 approval 필드 문서화.
- `src/hooks/command-execute-before.js` 수정: approval gate 평가 → request 생성 → state stash → best-effort audit → requestApproval adapter 위임 순서로 orchestration 추가. 재진입 시 approval 상태 이월(carry-over) 로직으로 idempotency 보장.
- `src/index.js` 수정: `buildApprovalRequest`, `approvalPolicyService`, `requestApproval(request)` 3개를 `pluginContext`에 주입. `requestApproval`은 `client.session.promptAsync` 를 위임하며 실패 시 best-effort.
- `tests/regression.test.js` 수정: 기존 `wrapper prompts differ from legacy` assertion을 `wrapper vs built` 비교로 변경 (Story 2.1에서 wrapper가 approval prompt를 새로 발행하기 때문). Story 2.1 테스트 10개 추가: classify 계약, buildApprovalRequest 계약, policyService 계약, state 격리, branch proposal 통합, init proposal 통합, idempotency, non-workflow/planning 배제, payload shape, built artifact parity.
- 실제 Git mutation 없음. 승인 대기(awaitingApproval) 진입까지만 구현.
- `npm run build && npm test` 통과 확인.

**구현 상 주요 결정사항:**
- idempotency 구현: `command.execute.before` 재진입 시 `priorState.approvalCurrent`와 `priorState.approvalHistory`를 새 context에 병합. 이로써 두 번째 호출에서 gate가 `skip` 반환 → 중복 발행 차단.
- `approvalCurrent` 초기값: context 최초 설정 시 `null`로 초기화 (기존 state 없을 때). 테스트 assertion은 `== null`로 작성.
- 범위 확인: Story 2.3(accept/deny/ignore), 2.4/2.5(failure recovery), 3.x(commit/push proposal)는 구현하지 않음.

**Code review fixes applied (이번 스토리 내):**
- Code review fixes applied: H1 (prompt delivery failure audit), H2 (full priorState carry-over), M1 (structuredClone nested isolation), M2 (audit try/catch symmetry)
- **H1 — `approval.prompt.delivery.failed` audit:** `pluginContext.requestApproval` throw 시 catch 블록에서 audit 이벤트 emit. payload: `requestId`, `actionType`, `sessionID`, `error`(메시지). hook 레벨 추가 try/catch 없음 — `createAuditLogger.write()` 내부 sink별 try/catch에 의존(M2와 일관). 회귀 테스트 `verifyApprovalPromptDeliveryFailureAudit` 추가 (FR22 — workflow는 계속 진행, legacy handler도 호출).
- **H2 — full priorState carry-over:** re-entry 시 `{ ...priorState, ...context, approvalCurrent, approvalHistory }`로 변경. priorState 전체를 먼저 spread해 Story 2.3/2.5에서 추가될 미래 stash 필드(approvalDecision, approvalResolved 등)도 자동 보존. 회귀 테스트 `verifyPriorStateCarryOver` 추가 (`approvalDecision`, `futureCustomField` 모두 살아남음 검증).
- **M1 — structuredClone nested isolation:** `workflow-state.js#get()`에서 `approvalCurrent`/`approvalHistory`를 `structuredClone`(Node 22 native)으로 deep copy. `state.approvalCurrent.proposal.action = 'switch'`, `state.approvalCurrent.metadata.nested.tag = 'tampered'`처럼 nested mutation으로도 store 오염 불가. 회귀 테스트 `verifyWorkflowStateNestedDeepIsolation` 추가. `set()`은 carry-over 패턴(`...priorState` 병합)과 충돌하므로 단방향(get) 보호로 충분.
- **M2 — audit try/catch symmetry:** `approval.requested` 호출 주변의 hook 레벨 try/catch 제거. `createAuditLogger.write()`가 sink(client.app.log, file, http)별로 이미 try/catch를 갖고 있어 hook 레벨 catch는 중복. `workflow.detected`, `git.action.planned`, `git.readiness.checked`와 일관성 회복.

**Deferred to follow-up stories:**
- Deferred to follow-up stories: M3→2.2, M4→2.3, L1/L2/L3 (no action)
- M3 (prompt metadata trust boundary) → Story 2.2
- M4 (fingerprint vs pending-lock JSDoc) → Story 2.3
- L1, L2, L3 → no action (defer)

### File List

- `src/services/approval/classify-git-action.js` (신규)
- `src/services/approval/build-approval-request.js` (신규)
- `src/services/approval/approval-policy-service.js` (신규)
- `src/services/workflow/workflow-state.js` (수정 — Story 2.1 + M1)
- `src/hooks/command-execute-before.js` (수정 — Story 2.1 + H1, H2, M2)
- `src/index.js` (수정)
- `tests/regression.test.js` (수정 — Story 2.1 테스트 10개 + 리뷰 fix 테스트 3개)
- `_bmad-output/implementation-artifacts/2-1-present-approval-requests-for-planned-git-actions.md` (스토리 업데이트)

### Change Log

- 2026-05-08: Story 2.1 구현 완료 — approval 서비스 계층 신설, workflow state approval 필드 추가, hook approval gate 통합, bootstrap 의존성 주입, 회귀 테스트 10개 추가. `npm run build && npm test` 전체 통과.
- 2026-05-08: Code review fixes applied: H1 (prompt delivery failure audit), H2 (full priorState carry-over), M1 (structuredClone nested isolation), M2 (audit try/catch symmetry). 회귀 테스트 3개(`verifyApprovalPromptDeliveryFailureAudit`, `verifyPriorStateCarryOver`, `verifyWorkflowStateNestedDeepIsolation`) 추가. Deferred to follow-up stories: M3→2.2, M4→2.3, L1/L2/L3 (no action). `npm run build && npm test` 전체 통과.
- 2026-05-08: 2차 code review 완료. HIGH/MEDIUM 0건, LOW 5건을 Review Follow-ups (AI)로 등록. 모든 AC 충족 및 [x] 태스크 검증 완료. Status → done.
- 2026-05-08: 사용자 요청으로 LOW 5건 모두 자동 수정 적용 — L1(테스트 리소스 정리), L2(architecture 이벤트 등록), L3(prompt-delivery-failed outcome 의미 정합), L4(stale Git 필드 invalidate), L5(fingerprint에 current 포함). 회귀 테스트 2건 추가/갱신(`verifyStaleGitFieldsInvalidatedOnReentry`, fingerprint id 격리 assertion) 및 1건 갱신(`verifyApprovalPromptDeliveryFailureAudit`). `npm run build && npm test` 전체 통과.
