# Story 3.4: 승인 결과와 실행 결과를 감사 기록으로 남기기

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

리뷰어 또는 운영자로서,
승인 결과와 Git 실행 결과가 감사 기록에 남기를 원한다,
그래서 워크플로우 산출물이 어떤 승인과 실행 경로를 통해 최종화되었는지 추적할 수 있다.

## Acceptance Criteria

1. **Given** Git 액션이 제안되거나, 승인되거나, 거부되거나, 건너뛰어지거나, 실행된다  
   **When** 플러그인이 감사 정보를 기록할 때  
   **Then** 액션 종류, 결과, 워크플로우 문맥, 타임스탬프를 포함한 추적 가능한 이벤트를 남긴다  
   **And** 최소 데이터 로깅 제약을 준수한다.
2. **Given** 감사 출력 대상이 클라이언트 로그, 파일, 선택적 HTTP 전달로 설정되어 있다  
   **When** 감사 레코드가 방출될 때  
   **Then** 플러그인은 설정된 싱크를 best-effort 방식으로 사용한다  
   **And** 싱크 실패가 워크플로우 최종화를 막지 않는다.

## Tasks / Subtasks

- [x] 승인 이벤트와 실행 이벤트의 감사 계약을 Story 3 최종화 경로에 맞게 정리한다 (AC: 1)
  - [x] `approval.requested`, `approval.resolved`, `git.action.skipped`, `git.action.executed`의 필수 필드 집합을 Story 3.4 관점에서 재검증하고 누락 필드를 보완한다.
  - [x] 커밋/푸시 최종화에서 동일한 `workflow`, `command`, `timestamp`, `details.actionKind`, `details.correlationId` 축으로 이벤트를 비교 가능하게 만든다.
  - [x] 승인 단계와 실행 단계가 서로 다른 이벤트명을 쓰더라도 감사 소비자가 하나의 최종화 흐름으로 재구성할 수 있게 상관관계 키를 유지한다.

- [x] 승인 결과 감사 기록을 최종화 액션 중심으로 보강한다 (AC: 1)
  - [x] `src/services/approval/build-approval-request.js`와 `src/services/approval/build-approval-resolution.js`가 `commit`, `push`, `finalize` 계열 액션에도 일관된 메타데이터를 제공하는지 확인한다.
  - [x] `src/hooks/command-execute-before.js`에서 발행하는 `approval.requested`가 최종화 제안의 액션 식별자와 제안 종류를 빠뜨리지 않도록 정리한다.
  - [x] `deny` 및 `ignore-and-continue` 경로가 남기는 `git.action.skipped`가 로컬 커밋 보존, push 미실행 등 Story 3 맥락을 설명할 수 있게 reason/details를 점검한다.

- [x] Git 실행 결과 감사 기록을 commit/push 최종화 경로에 맞게 확장 또는 정리한다 (AC: 1)
  - [x] `src/services/git/git-executor.js`의 `git.action.executed` payload가 commit/push 모두에 대해 충분한 실행 문맥을 남기는지 검토한다.
  - [x] `src/services/git/commit-service.js`, `src/services/git/push-service.js`에서 executor에 전달하는 계획 객체에 필요한 correlation 정보와 branch/remote 정보가 빠지지 않도록 맞춘다.
  - [x] 실패 시에도 raw stderr, 전체 remote URL, 불필요한 절대 경로를 그대로 기록하지 않도록 기존 redaction/minimal logging 규칙을 유지한다.

- [x] 감사 싱크 best-effort 보장을 Story 3 최종화 흐름에서 회귀 없이 유지한다 (AC: 2)
  - [x] `src/audit/logger.js`의 client/file/http 싱크별 개별 try/catch 동작을 활용해 한 싱크 실패가 다른 싱크나 최종화 흐름을 막지 않게 한다.
  - [x] `src/hooks/permission-asked.js`, `src/hooks/command-execute-before.js`, `src/services/git/git-executor.js`에서 감사 실패를 주 원인보다 우선시하지 않도록 한다.
  - [x] 감사 실패가 발생해도 commit/push 실행 envelope 또는 승인 해석 결과는 정상 반환되도록 계약을 고정한다.

- [x] Story 2.x에서 구축한 승인/복구 상태와 충돌하지 않게 최종화 감사 흐름을 연결한다 (AC: 1, 2)
  - [x] `workflowState.lastGitAction`, `lastGitResult`, `lastGitFailure`, `pendingRecoveryContext`를 재사용해 실행 결과와 복구 필요성을 중복 저장하지 않는다.
  - [x] Recovery 이벤트(`git.action.recovery.*`)와 Story 3.4 이벤트가 서로 역할을 침범하지 않도록 경계를 문서화한다.
  - [x] push 거부 또는 실패가 이미 생성된 로컬 commit의 감사 가능성을 훼손하지 않도록 local-finalized / remote-not-finalized 상태 해석을 명확히 한다.

- [x] 회귀 테스트와 계약 테스트를 추가하거나 보강한다 (AC: 1, 2)
  - [x] `tests/regression.test.js`에 승인 요청, 승인 해소, 실행 성공/실패, 감사 싱크 실패를 하나의 최종화 흐름으로 검증하는 테스트를 추가한다.
  - [x] commit 성공 후 push 실패 시 `git.action.executed`와 기존 commit 결과가 함께 추적 가능함을 검증한다.
  - [x] 감사 payload가 `workflow`, `command`, `timestamp`, `outcome`, `details` 최소 형태를 유지하는지 계약 단언을 추가한다.

## Dev Notes

### Story Intent

Story 3.4는 새로운 감사 시스템을 만드는 작업이 아니라, Epic 2에서 이미 정리된 승인/실행/복구 이벤트 계약을 Epic 3의 commit/push 최종화 경로에 정확히 연결하는 작업이다. 핵심은 리뷰어가 "무엇이 제안되었고, 어떻게 승인되었으며, 실제 Git 실행 결과가 무엇이었는지"를 하나의 감사 흐름으로 재구성할 수 있게 만드는 것이다.

Story 3.2가 commit 최종화, Story 3.3이 push 제안을 다룬다면, Story 3.4는 그 두 단계 전반의 이벤트 추적성 보강이 범위다. 새로운 UI나 별도 저장소를 도입하는 대신 기존 `audit logger + approval services + git executor` 계약을 재사용해야 한다.

### Epic 3 Context

- Epic 3의 목표는 워크플로우 종료 시점 산출물을 commit 및 선택적 push로 최종화하면서, 코드/문서/계획 산출물 전부에 대해 추적 가능성을 유지하는 것이다.
- Story 3.1은 최종화 가능한 산출물 감지, Story 3.2는 commit 준비/실행, Story 3.3은 remote 존재 시에만 push 제안, Story 3.5는 표준 Git 히스토리 기반 리뷰어 추적성 유지에 초점을 둔다.
- 따라서 Story 3.4는 단일 이벤트 추가보다 "Epic 3 흐름 전체를 잇는 감사 연결층"으로 해석해야 한다. Story 3.5가 요구하는 reviewer traceability는 Story 3.4의 감사 정확도가 전제다.

### Previous Story Intelligence

- Story 2.5는 복구 오케스트레이션을 추가하면서 `git.action.recovery.offered`, `git.action.recovery.selected`, `git.action.recovery.completed`, `git.action.recovery.blocked`를 구조화 이벤트로 정리했고, 감사 방출은 반드시 best-effort여야 한다는 규칙을 재확인했다.
- Story 2.5 완료 문서상 구현된 핵심 학습:
  - `permission-asked.js`는 승인 결과와 복구 선택 모두의 ingress이며, 훅은 얇게 유지하고 상태 전이/계약 조립은 서비스 계층으로 내려야 한다.
  - `git-executor.js`는 실행 결과의 단일 정규화 지점이며, `workflowState.lastGitAction`, `lastGitResult`, `lastGitFailure`, `pendingRecoveryContext`를 갱신한다.
  - 감사 소비자는 동일 이벤트명이라도 필드 모양이 다르면 깨지므로 공통 envelope 규약을 유지해야 한다.
- Story 3.4는 위 학습을 그대로 이어받아야 한다. 특히 승인 이벤트와 실행 이벤트의 details shape가 엇갈리면 리뷰어가 한 흐름으로 재조립하기 어렵다.

### Git Intelligence Summary

- 최근 커밋 패턴은 `Finish Epic 2: approval-driven Git execution and recovery` 단일 묶음 아래에서 스토리 문서, `src/services/approval/`, `src/services/git/`, `src/hooks/`, `tests/regression.test.js`, `architecture.md`를 함께 갱신하는 방식이었다.
- 즉 Story 3.4도 단순 소스 수정만이 아니라 문서 계약, 서비스 계층, 훅 경계, 회귀 테스트를 함께 맞추는 패턴이 자연스럽다.
- 최근 변경은 중앙 서비스에 계약을 모으고 훅은 얇게 유지하는 방향으로 수렴했다. Story 3.4에서도 훅 내부에 임시 payload 조립 로직을 늘리기보다 공통 builder/helper를 우선 검토해야 한다.

### Technical Requirements

- 감사 이벤트명은 `dot.case`를 유지한다.
- 이벤트 payload 기본 형식은 아래 축을 따라야 한다.
  - 최상위: `event`, `timestamp`, `workflow`, `command`, `outcome`, `details`
  - 세부: 최소 `actionKind`, 관련 식별자(`actionId` 또는 `correlationId`), session 식별 정보, 최소한의 상태 설명
- 승인 결과의 표준 outcome은 `allow`, `deny`, `ask`, `skip`이며, 실행 결과는 `succeeded`, `failed`, `skipped` 축을 사용 중이다. Story 3.4는 이 둘을 혼합하지 말고 상호 매핑 가능한 문맥만 보강해야 한다.
- 최소 데이터 로깅 제약:
  - raw stderr 전체 금지
  - 전체 remote URL 기록 금지
  - 절대 경로/비밀값 무단 기록 금지
  - 사람이 읽을 수 있는 요약과 기계 판독용 code/reason 분리 유지
- 감사 싱크 실패는 절대 최종화 실패의 주 원인으로 승격되면 안 된다. envelope의 primary failure code를 보존해야 한다.

### Architecture Compliance

- 승인 판정은 중앙 `src/services/approval/` 계층에서 수행하고, Git 실행은 `src/services/git/` 계층에서 수행한다.
- 감사 로깅은 도메인 로직이 직접 `console` 호출하지 않고 `src/audit/logger.js`를 통해 이뤄져야 한다.
- `src/hooks/command-execute-before.js`와 `src/hooks/permission-asked.js`는 진입점 조율만 담당하고, 이벤트 payload 계약 생성은 가능하면 서비스 helper에 집중시켜야 한다.
- `workflowState`는 세션 범위 저장소이며, Story 3.4가 새 상태 저장 필드를 추가하더라도 deep-clone 방어와 `session.deleted` 정리 규칙을 따라야 한다.

### Library / Framework Requirements

- 런타임은 Node.js 기반 ESM 구조다. 현재 저장소는 순수 함수형 서비스 + 주입형 adapter 패턴을 선호한다.
- 새 의존성을 추가하는 방향보다 기존 `createAuditLogger`, approval builder, git executor 조합을 재사용하는 방향이 우선이다.
- 외부 최신 버전 조사가 필수인 범위는 현재 스토리에서 크지 않다. 핵심 성공 조건은 외부 라이브러리 업그레이드가 아니라 저장소 내부 계약 일관성 유지다.

### File Structure Requirements

- 구현 후보 파일:
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\audit\logger.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-request.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-resolution.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\git-executor.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\commit-service.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\push-service.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\workflow-state.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js`
- 구현 시 피해야 할 것:
  - 훅 파일 안에서 commit/push 결과를 직접 포맷팅하는 중복 로직
  - approval 계층과 executor 계층 각각이 다른 감사 스키마를 따르는 상태
  - File List에 구현 전 후보를 완료 결과처럼 기록하는 것

### Testing Requirements

- 최소 테스트 포인트:
  - `approval.requested`가 commit/push/finalize 액션 식별자를 포함하는지
  - `approval.resolved`와 `git.action.skipped`가 거부/무시 경로를 충분히 설명하는지
  - `git.action.executed`가 commit/push 성공/실패에 대해 동일한 최소 계약을 유지하는지
  - audit sink throw 시에도 envelope 또는 workflow finalization 흐름이 깨지지 않는지
  - push 실패가 발생해도 이미 생성된 commit의 추적 가능성이 유지되는지
  - `workflowState` 미러 필드가 외부 변조로 오염되지 않는지
- 기존 회귀 패턴상 `tests/regression.test.js`에 계약 테스트를 누적하는 방식이므로, Story 3.4도 새 테스트 파일을 흩뿌리기보다 해당 파일에 시나리오를 추가하는 편이 일관적이다.

### Project Structure Notes

- 현재 프로젝트는 `hooks -> services -> audit/events` 경계를 분명히 유지한다. Story 3.4는 이 구조를 깨지 않아야 한다.
- `project-context.md`는 저장소에서 발견되지 않았다. 따라서 별도 프로젝트 컨텍스트 규칙보다 `architecture.md`, `epics.md`, 기존 Epic 2 산출물이 우선 기준이다.
- Epic 2에서 이미 승인/실행/복구의 상태 경계를 세웠으므로, Story 3.4는 새로운 상태 머신을 만들기보다 최종화 흐름의 감사 해석을 명확히 해야 한다.

### References

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad\bmm\workflows\4-implementation\create-story\workflow.md` - create-story 워크플로우 원칙 및 산출 요구
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad\bmm\workflows\4-implementation\create-story\template.md` - 스토리 문서 기본 템플릿
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad\bmm\workflows\4-implementation\create-story\checklist.md` - 컨텍스트 품질 검토 체크리스트
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad\bmm\workflows\4-implementation\create-story\discover-inputs.md` - 입력 문서 탐색 규칙
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md` - Epic 3 및 Story 3.4 정의
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md` - FR23~FR26, Epic 3 감사/추적성 요구
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md` - approval/policy, audit logger, structured event 규약, 필수 이벤트 목록
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\2-5-offer-recovery-paths-without-failing-the-workflow.md` - 이전 스토리 학습 및 감사/복구 계약
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\audit\logger.js` - client/file/http 싱크 best-effort 구현
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\git-executor.js` - `git.action.executed` event 및 workflowState mirror
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\commit-service.js` - commit 계획/실행 위임 경계
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\push-service.js` - push 계획/실행 위임 경계
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js` - 승인 결과 및 복구 선택 ingress
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js` - approval.requested 발행 경계
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js` - audit logger / prompt adapter bootstrap
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` - approval, git execution, audit payload, best-effort 회귀 패턴

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 최근 커밋 확인: `git log -5 --oneline`
- 최근 변경 파일 패턴 확인: `git log -5 --name-only --pretty=format:"%h %s"`
- Epic 3/Story 3.4 원문 확인: `rg -n "Epic 3|Story 3\\.4|approval outcomes|audit" "_bmad-output\\planning-artifacts\\epics.md"`
- 관련 소스/테스트 탐색: `rg -n "approval|audit|commit|push|execution|outcome" src tests`

### Completion Notes List

- Epic 3 및 Story 3.4 요구사항, PRD/아키텍처 제약, Epic 2 Story 2.5 학습, 최근 커밋 패턴을 반영해 구현용 컨텍스트를 생성했다.
- 지정된 산출물 파일만 생성했으며 다른 implementation artifact나 `sprint-status.yaml`은 수정하지 않았다.
- Dev Notes에 구현 후보 파일, 테스트 포인트, 감사 계약 경계, 최소 데이터 로깅 제약을 구체적으로 명시했다.
- (2026-05-10 dev) Story 3.4 구현 완료:
  - `approval.requested`, `approval.resolved`, `git.action.skipped`, `git.action.executed` 페이로드를 일관된 축으로 정리했다. 모든 이벤트가 top-level `workflow`/`command`/`sessionID`/`outcome`/`timestamp`와 `details.actionKind`/`details.correlationId`/`details.phase`를 갖도록 보강했고, commit/push 액션에는 `details.finalizationMode`(workflowPolicy.finalization)와 `details.actionId`도 추가해 한 finalization flow를 단일 correlation 패밀리로 재구성할 수 있게 했다.
  - `build-approval-resolution.js`에서 `request.proposal.correlationId` 와 `request.metadata.finalization` 을 읽어 resolved/skipped 페이로드에 동일하게 노출했다.
  - `git-executor.js`는 `workflowContext.actionId` / `workflowContext.finalizationMode`를 옵셔널 필드로 받아 audit details 에 노출하도록 했고, `execute-approved-action.js`가 approval request metadata 에서 finalization mode 를 읽어 executor 로 전달한다 (없으면 pluginContext.resolvePolicy 로 한 번 더 조회).
  - audit best-effort 보장을 finalization 경로에 일관되게 적용했다: `command-execute-before.js` 의 `workflow.detected`/`git.action.planned`/`git.readiness.checked` emission, `publish-next-planned-action.js` 의 `approval.requested`/`approval.prompt.delivery.failed`/`git.action.recovery.blocked` emission, 그리고 `permission-asked.js` 의 resolution audit emission loop 를 모두 try/catch 로 격리해 한 싱크 실패가 envelope 반환을 막지 않게 했다.
  - 회귀 테스트 5개 추가: approval.requested 최소 필드 검증, approval.resolved + git.action.skipped 의 correlationId/finalizationMode 보존, git.action.executed actionId/finalizationMode 보존, audit throw 시 envelope 보존, 그리고 commit-success → push-deny 시 양쪽 이벤트가 동일한 workflow + sessionID 로 audit log 에 함께 남는지 검증.
  - Story 2.5 의 recovery 이벤트(`git.action.recovery.*`)는 손대지 않았으며 새 이벤트명도 도입하지 않았다. workflowState 의 `lastGitAction`/`lastGitResult`/`lastGitFailure`/`pendingRecoveryContext` 는 그대로 재사용했다.
  - `npm run build` 후 `npm test` 통과 (exit code 0) 확인.
- (2026-05-10 dev verify) Story 3.4 최종 검증: File List 명시 9개 구현 파일에서 audit 계약 일관성(top-level workflow/command/sessionID/outcome/timestamp + details.actionKind/correlationId/phase/finalizationMode/actionId) 재확인, regression.test.js main() 체인에 5개 Story 3.4 verifier 등록 확인, npm run build / npm test 모두 exit 0; sprint-status.yaml 의 3-4 항목만 review → done 으로 갱신.

### File List

- src/services/approval/build-approval-resolution.js
- src/services/approval/publish-next-planned-action.js
- src/services/git/git-executor.js
- src/services/git/execute-approved-action.js
- src/hooks/permission-asked.js
- src/hooks/command-execute-before.js
- src/index.js
- src/services/workflow/evaluate-workflow-finalization.js
- tests/regression.test.js
- _bmad-output/implementation-artifacts/3-4-record-approval-outcomes-and-execution-results-for-audit.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- dist/devai-aidd-guard.js (rebuilt from src; no manual edits)

### Review Follow-ups (AI)

#### Round 1 (resolved in commit "Address Story 3.4 review round 1 follow-ups")

- [x] [AI-Review][Medium] commit `git.action.planned` (evaluate-workflow-finalization.js)이 push 변형과 비교해 `sessionID`/`actionId`/`correlationId`/`phase`/`finalizationMode` 누락 — Story 3.4 일관성 목표 위반. 동일한 correlation 축으로 보강했다. [src/services/workflow/evaluate-workflow-finalization.js]
- [x] [AI-Review][Medium] `executeApprovedAction`의 unsupported-actionType skip event(`git.action.skipped`)이 `actionKind`/`actionId`/`correlationId`/`phase`/`finalizationMode` 누락 — 다른 skip 이벤트와 모양 불일치. 동일 축으로 통일했다. [src/services/git/execute-approved-action.js]
- [x] [AI-Review][Low] `recovery.prompt.delivery.failed`가 top-level `sessionID`를 안 가짐 — 다른 finalization 이벤트와 컨벤션 불일치. top-level `sessionID` 추가. [src/hooks/permission-asked.js]
- [x] [AI-Review][Low] bootstrap 경로 `audit.info` 호출 3곳(`config.validation.failed`, `plugin bootstrap`, `plugin bootstrap registered no-op hooks`)이 try/catch 미적용 — AC2 best-effort 원칙 위반. 모두 try/catch로 감쌌다. [src/index.js]
- [드롭] [AI-Review][Low] 브랜치 `approval.requested`가 `correlationId: null` — Story 3.4 범위(commit/push) 외이며 의도적 동작이라 이번 라운드 작업 범위에서 제외.

#### Round 2 (resolved in this session)

- [x] [AI-Review][Medium] R1에서 `src/index.js` 의 4개 부트스트랩 감사 emission(`config.validation.failed`, `compat.bridge.evaluated`, `plugin bootstrap`, `plugin bootstrap registered no-op hooks`)에 try/catch 를 둘렀지만, 어느 하나라도 try/catch 가 누락되어도 기존 happy-path 회귀 테스트(Story 1.3 emission shape, Story 4.2 bridge outcome)는 통과해 버린다 — AC2 best-effort 가 부트스트랩 경로에서 깨져도 회귀 테스트가 못 잡는 mutation 사각지대. → tests/regression.test.js 에 `verifyStory34BootstrapAuditFailureDoesNotAbortRegistration` 추가: `client.app.log` 가 모든 호출에서 throw 하도록 stub 한 뒤 `DevaiAiddGuardPlugin` 이 throw 없이 hook map 을 반환하고 `command.execute.before` / `permission.asked` 핸들러가 등록되는지 검증. main() 체인에 등록. [tests/regression.test.js]
- [드롭] [AI-Review][Low] `executeApprovedAction` 의 unsupported-actionType skip 이벤트가 `actionKind: approvalRequest?.proposal?.kind` 를 쓰는 반면 `build-approval-resolution.js` 의 정규 skip 이벤트는 `deriveActionKind(actionType)` 을 쓴다 — 결과 동치(commit/push)지만 출처가 다름. 다만 unsupported-actionType 경로는 의도적으로 가장 구체적인 fallback 정보(proposal.kind)를 노출하기 위한 설계이므로 유지.
- [드롭] [AI-Review][Low] `recovery.prompt.delivery.failed` 가 `details.phase` 미보유 — Story 2.5 namespace 이벤트이며 Story 3.4 가 가져야 하는 finalization 축이 아니므로 범위 외. R1 의 `sessionID` top-level 추가만으로 충분.
