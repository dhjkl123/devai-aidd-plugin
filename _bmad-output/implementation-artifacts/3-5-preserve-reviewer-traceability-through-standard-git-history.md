# Story 3.5: 표준 Git 이력을 통한 리뷰어 추적성 보존

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

리뷰어로서,
워크플로우가 생성한 산출물을 일반적인 Git 이력 도구로 검토하고 싶다,
그래서 별도 전용 시스템 없이도 작성자와 변경 책임을 추적할 수 있다.

## Acceptance Criteria

1. **주어진 조건** 워크플로우 산출물이 커밋된 경우  
   **동작 시점** 리뷰어가 표준 Git 이력 도구로 저장소를 검사하면  
   **기대 결과** 결과 코드, 기술 문서, 기획 산출물이 일반 커밋 이력에서 확인 가능해야 한다  
   **그리고** 전용 메타데이터 요구 없이 작성자와 변경 책임을 추적할 수 있어야 한다.
2. **주어진 조건** 워크플로우가 코드와 비코드 산출물을 함께 생성한 경우  
   **동작 시점** 최종화 커밋이 생성되면  
   **기대 결과** 해당 산출물은 함께 기록되거나, 워크플로우 출력에 맞게 명확히 귀속 가능한 방식으로 기록되어야 한다  
   **그리고** 플러그인은 제품 요구사항의 감사 가능성 목표를 유지해야 한다.

## Tasks / Subtasks

- [x] 워크플로우 산출물 추적성 계약을 명문화하고 최종화 입력 범위를 표준 Git 기준으로 확정한다 (AC: 1, 2)
  - [x] Story 3.1의 “finalizable artifacts” 판정 결과를 그대로 받아 재사용하고, Story 3.5에서 별도의 산출물 탐지 규칙을 만들지 않는다.
  - [x] 코드, 기술 문서, 기획 산출물의 최소 범주를 현재 저장소 구조에 맞게 정의한다: `src/`, `tests/`, `README.md`, `_bmad-output/planning-artifacts/`, `_bmad-output/implementation-artifacts/`.
  - [x] 추적성의 근거를 “일반 Git 커밋 이력 + 파일 경로별 이력 + blame 가능성”으로 고정하고, 전용 DB/별도 감사 저장소/비표준 리뷰 메타데이터를 필수 조건으로 만들지 않는다.

- [x] 커밋 제안 단계에서 리뷰어가 일반 Git 도구로 바로 따라갈 수 있는 산출물 범위를 조립한다 (AC: 1, 2)
  - [x] `src/services/git/commit-service.js`의 얇은 실행 경계를 유지하고, 별도 실행기나 훅 내부 Git 호출을 추가하지 않는다.
  - [x] Story 3.2 구현 시 사용할 commit proposal 객체에 `artifactScope`, `changeCountSummary`, 산출물 경로 목록 또는 동등한 요약 필드를 추가해 `build-approval-explanation.js`가 사람 읽기 가능한 범위를 설명할 수 있게 한다.
  - [x] 코드와 문서가 동시에 변경된 경우 하나의 커밋에 함께 담아도 되는지, 또는 정책상 분리해야 하는지를 `workflowPolicy.finalization`과 충돌하지 않는 방식으로 표현한다.
  - [x] 커밋 메시지 또는 메타데이터는 Git 자체가 이미 제공하는 책임 추적을 대체하지 않고, 표준 `git log -- <path>`와 `git blame` 사용성을 보조하는 범위에만 머문다.

- [x] 최종화 제안이 기존 승인/상태 저장 파이프라인에 자연스럽게 연결되도록 확장한다 (AC: 1, 2)
  - [x] `src/services/approval/approval-policy-service.js`의 Story 3.x 확장 포인트를 사용해 `commitProposal`, `pushProposal` 우선순위를 추가한다.
  - [x] `src/services/approval/classify-git-action.js`와 `src/services/approval/build-approval-request.js`의 기존 commit/push 지원 경로를 재사용하고, Story 3.5 때문에 별도 승인 타입을 만들지 않는다.
  - [x] `src/hooks/command-execute-before.js`는 계속 얇게 유지하고, finish phase에서 최종화 proposal만 저장/승격하며 실제 범위 계산과 요약은 service 계층으로 보낸다.
  - [x] `src/services/workflow/workflow-state.js`에는 리뷰어 추적을 위해 필요한 최종화 proposal 상태만 저장하고, 추적성을 위해 별도 글로벌 캐시를 만들지 않는다.

- [x] 리뷰어가 표준 Git 명령으로 책임을 추적할 수 있도록 산출물 구성과 설명을 정제한다 (AC: 1, 2)
  - [x] 승인 프롬프트와 Dev-facing 설명에는 “어떤 파일 범주가 커밋 대상인지”를 드러내되, 전체 절대경로나 민감한 원격 URL은 노출하지 않는다.
  - [x] 코드와 문서를 함께 커밋하는 경우에도 파일별 Git 이력과 blame이 깨지지 않도록 파일 이동/재생성보다 기존 파일 갱신을 우선한다.
  - [x] 문서 산출물은 `_bmad-output` 아래에서 일반 Git 파일로 남아야 하며, 외부 전용 저장소나 숨겨진 메타데이터 파일로만 추적되게 만들지 않는다.
  - [x] Story 3.4의 audit 이벤트는 “승인/실행 결과 추적” 용도이고, Story 3.5의 핵심 성공 기준은 여전히 Git 이력 자체라는 점을 문서와 테스트에서 분리해 표현한다.

- [x] README 및 회귀 테스트에 표준 Git 추적 사용 시나리오를 추가한다 (AC: 1, 2)
  - [x] README에는 리뷰어가 사용할 기본 검증 흐름 예시를 추가한다: `git log -- <path>`, 필요 시 `git log --follow -- <file>`, `git blame <file>`.
  - [x] 회귀 테스트는 commit proposal이 코드/문서/기획 산출물 범위를 올바르게 묶는지, push 실패가 로컬 커밋의 추적성을 무효화하지 않는지 검증한다.
  - [x] 승인 설명 및 감사 이벤트 테스트는 경로 범위 요약은 포함하되 민감 정보가 새지 않는지 확인한다.

- [x] Story 3.5 전용 회귀/계약 테스트를 추가해 표준 Git 추적성을 보장한다 (AC: 1, 2)
  - [x] `tests/regression.test.js`에 commit proposal 범위, finalization 게이팅, push 이후/실패 이후의 traceability 보존을 검증하는 테스트를 추가한다.
  - [x] 파일 단위 이력 관점에서 문서와 코드가 함께 포함된 커밋의 승인 설명이 `artifactScope`와 변경 요약을 안정적으로 노출하는지 검증한다.
  - [x] “코드만”, “문서만”, “코드+문서 혼합” 세 경우 모두 일반 Git 이력으로 설명 가능한 커밋 범위가 만들어지는지 검증한다.
  - [x] Story 2.5 recovery와 연결해 commit 또는 push 실패 후에도 이미 기록된 로컬 커밋 이력의 추적성은 유지되고, recovery gate가 후속 최종화만 차단하는지 검증한다.

## Dev Notes

### Epic 3 전체 맥락

- Story 3.1은 finish phase에서 “커밋할 가치가 있는 산출물”이 있는지 판정하는 관문이다. Story 3.5는 이 판정의 결과를 소비해야 하며, 자체 판정기를 복제하면 규칙이 분기된다.
- Story 3.2는 commit proposal 생성과 실행 타이밍을 담당한다. Story 3.5는 그 proposal이 “표준 Git 이력에서 리뷰 가능”하도록 범위와 설명을 정제하는 역할이다.
- Story 3.3은 원격 저장소가 있을 때만 push를 제안한다. Story 3.5는 push 성공 여부와 무관하게 로컬 커밋 이력이 리뷰어 추적성의 1차 근거로 남아야 한다는 경계를 강제한다.
- Story 3.4는 승인/실행 감사 이벤트를 남긴다. Story 3.5는 감사 로그가 아니라 Git 이력 자체로 책임 추적이 가능해야 한다는 제품 목표를 구현한다.

### 현재 코드베이스에서 확인된 기반

- `src/services/git/commit-service.js`와 `src/services/git/push-service.js`는 이미 “의도 조립 + 공통 executor 위임” 경계로 정리되어 있다. Story 3.5는 이 경계를 유지해야 한다.
- `src/services/git/git-executor.js`는 `git.action.executed` 이벤트와 `workflowState.lastGitAction / lastGitResult / lastGitFailure` 저장을 담당한다. 최종화 결과를 다른 저장 경로로 복제하지 말고 이 구조를 재사용한다.
- `src/services/approval/approval-policy-service.js`는 `initProposal -> branchProposal -> (future) commitProposal -> pushProposal` 확장 지점을 명시하고 있다. Story 3.5는 이 지점을 소비해 최종화 proposal을 같은 승인 파이프라인으로 연결해야 한다.
- `src/services/approval/classify-git-action.js`, `build-approval-explanation.js`, `build-approval-request.js`는 이미 commit/push action type을 알고 있다. Story 3.5는 “새 승인 타입”이 아니라 proposal payload 품질을 높이는 방향으로 가야 한다.
- `src/hooks/command-execute-before.js`는 현재 workflow detection, readiness, branch proposal, approval publication까지 얇게 조정한다. 최종화도 같은 패턴을 따라야 하며 훅 안에서 직접 `git commit`/`git push`를 호출하면 안 된다.

### Story 2.5에서 가져와야 할 학습

- recovery, approval, audit, state 저장은 모두 service 중심으로 정리되어 있다. Story 3.5도 최종화 추적성 로직을 훅에 흩뿌리지 말고 service에 집중시켜야 한다.
- `workflow-state.js`는 nested state를 외부 mutation으로부터 보호하기 위해 `get()`에서 deep clone을 사용한다. 최종화 proposal이나 traceability summary를 저장하더라도 같은 보호 규칙을 따라야 한다.
- audit은 항상 best-effort다. 추적성의 주 근거가 Git 이력이어야 하는 이유도 여기에 있다. 감사 로그 실패가 커밋 성공 자체를 부정해서는 안 된다.
- Story 2.5는 “pendingRecoveryContext”와 finalization blocking scope를 이미 도입했다. commit 실패 후 push가 자동으로 이어지지 않도록, Story 3.5는 commit traceability와 push publication을 분리된 단계로 유지해야 한다.

### 구현 가드레일

- 표준 Git 도구로 검토 가능해야 하므로, 리뷰어가 사용할 기본 경로는 `git log -- <path>`, 필요 시 `git log --follow -- <file>`, `git blame <file>`이다.
- 추적성 강화를 위해 별도 전용 메타데이터를 강제하지 않는다. 감사 로그는 보조 수단이며, 커밋 이력과 파일 경로 이력이 1차 근거다.
- 코드와 비코드 산출물을 함께 기록할 때는 “한 워크플로우 산출물”이라는 귀속성이 분명해야 한다. 단, 너무 넓은 스테이징으로 무관한 파일까지 포함하면 FR23/24/25 대신 NFR6 위반이 된다.
- `_bmad-output/planning-artifacts/`와 `_bmad-output/implementation-artifacts/`는 제품 요구사항상 추적 대상이다. Story 3.5 구현에서 이 경로들을 commit scope 후보에서 배제하면 안 된다.
- README나 문서 보강이 필요하더라도 최종화 로직과 문서 편집을 분리 가능한 구조로 유지한다. 핵심은 commit scope와 승인 설명의 정확성이다.

### 구현 파일 후보

- 기존 파일 확장 우선
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\approval-policy-service.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\classify-git-action.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-explanation.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-request.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\commit-service.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\push-service.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\git-executor.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\workflow-state.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js`
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md`
- 새 파일이 필요하다면 service 계층에만 추가
  - 예: `src/services/git/finalization-service.js` 또는 `src/services/git/build-finalization-proposal.js`
- 피해야 할 위치
  - 훅 파일 내부의 직접 Git subprocess 호출
  - 감사 전용 저장소/숨은 메타데이터 파일을 강제하는 새 경로

### 테스트 포인트

- finish phase에서 finalizable artifact가 없으면 commit proposal이 생기지 않아야 한다.
- `_bmad-output/planning-artifacts/`와 `_bmad-output/implementation-artifacts/` 변경이 있으면 commit scope에 포함되어야 한다.
- code only / docs only / mixed changes 각각에서 approval explanation의 `artifactScope`와 `changeCountSummary`가 일관되게 채워져야 한다.
- push proposal은 commit 성공 이후에만 나타나야 하며, push 실패가 이미 생성된 로컬 커밋의 traceability를 무효화하지 않아야 한다.
- recovery gate가 `workflow-finalization` 범위로 열렸을 때 후속 commit/push proposal만 차단하고, 비최종화 작업은 막지 않아야 한다.
- 민감 정보 검증: approval/audit payload에 전체 원격 URL, 전체 절대경로, raw stderr가 노출되지 않아야 한다.

### 최근 커밋 패턴 인텔리전스

- 최근 5개 커밋 제목은 `Finish story ...`, `Finish Epic 2: ...`, epic/story 브랜치 merge 중심이다.
- 구현은 스토리 단위 브랜치에서 마무리한 뒤 epic 브랜치로 병합되는 흐름을 전제로 한다. Story 3.5도 “한 워크플로우 산출물의 귀속 가능한 커밋”을 우선해야 하며, 거대한 무차별 커밋보다 스토리 단위 귀속성이 중요하다.
- `Finish Epic 2: approval-driven Git execution and recovery` 커밋은 approval/recovery/audit/state 경계를 서비스 중심으로 정리했다. Story 3.5도 같은 방향으로 finalization traceability를 서비스화해야 한다.

### Latest Tech Information

- 현재 저장소는 Node.js ESM 구조와 `ajv@8.17.1`를 사용한다. Story 3.5에서 새 런타임이나 빌드 체계를 도입할 이유는 없다.
- 공식 Git 문서 기준으로 `git log`는 경로 제한(`git log -- <path>`)과 단일 파일 rename 추적(`--follow`)을 지원하고, `git blame`은 라인 단위 최종 수정자 추적과 `-L`, `-M`, `-C`, `--reverse` 같은 분석 옵션을 제공한다. 따라서 Story 3.5의 성공 조건은 별도 전용 추적 시스템이 아니라 “표준 Git 이력만으로 충분한 커밋 범위와 파일 보존성”이다.

### Project Structure Notes

- 현재 저장소는 brownfield다. `src/index.js` bootstrap, `src/hooks/*`, `src/services/*`, `src/audit/logger.js`, `tests/regression.test.js`를 중심으로 기존 패턴을 보존해야 한다.
- 아키텍처 문서는 `services/git`, `services/approval`, `services/workflow`, `audit`, `events` 분리를 요구한다. Story 3.5 구현도 이 경계를 넘지 않는 것이 우선이다.
- `project-context.md`는 현재 저장소에서 발견되지 않았다. 따라서 본 스토리는 PRD, Epics, Architecture, README, 실제 소스/테스트를 기준으로 컨텍스트를 정리했다.

### References

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md` - `Epic 3: Finalization and Traceable Delivery`, `Story 3.1` ~ `Story 3.5`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md` - 추적성/리뷰어 사용자 여정, FR23 ~ FR26, NFR4 ~ NFR6
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md` - 감사/추적성, `services/git`, `services/approval`, `workflow-state`, project structure
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\2-5-offer-recovery-paths-without-failing-the-workflow.md` - 서비스 중심 orchestration, recovery/finalization blocking, 테스트/기록 방식
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js` - planning/approval publication 경계
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js` - approval/recovery ingress 경계
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\approval-policy-service.js` - Story 3.x `commitProposal` / `pushProposal` 확장 포인트
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\classify-git-action.js` - commit/push action 분류 계약
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-explanation.js` - commit/push explanation 필드
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\approval\build-approval-request.js` - approval request envelope
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\commit-service.js` - commit action plan 경계
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\push-service.js` - push action plan 경계
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\git\git-executor.js` - 실행 결과/audit/workflow-state 저장 계약
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\services\workflow\workflow-state.js` - session-scoped state 및 lastGit* / pendingRecoveryContext / recoveryGate
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` - approval/audit/commit/push/recovery 회귀 테스트 기준
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md` - 최종화/기본 Git 흐름 설명 보강 대상

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 최근 커밋 확인: `git log -5 --oneline`
- Story 3.x 확장 포인트 확인: `rg -n "finalization|commitProposal|pushProposal|git.action.executed|workflowState" src`

### Completion Notes List

- Epic 3 전체 맥락, Story 3.5 요구사항, Story 2.5 학습, 최근 커밋 패턴, 구현 후보 경로, 테스트 포인트를 수집해 한국어 스토리 컨텍스트를 생성했다.
- 대상 스토리 파일이 존재하지 않아 지정 경로에 새로 생성했다.
- `project-context.md` 부재를 확인했고, 대신 PRD/Epics/Architecture/README/실제 소스 및 테스트 기준으로 컨텍스트를 보강했다.
- 2026-05-10 dev-story 실행: Story 3.5 구현 완료. Story 3.1~3.4가 이미 commit/push 파이프라인과 audit 이벤트 체인을 마련했으므로, Story 3.5는 “표준 Git 도구로 리뷰 가능한 commit scope/설명을 정제 + 회귀 테스트로 계약 고정” 방향으로 최소 변경에 집중했다.
  - `src/services/workflow/finalization-artifacts.js`에 `summarizePathScope()`와 PATH_SCOPE_BUCKETS/SINGLE_FILE_DOC_BUCKETS 테이블을 추가해, 리뷰어가 그대로 `git log -- <prefix>`에 붙일 수 있는 prefix-기반 path 요약을 결정적 순서로 생성한다. 파일 basename은 절대 노출되지 않는다.
  - `src/services/workflow/commit-proposal.js`의 `buildCommitProposal()`이 새 `pathScopeSummary` 필드를 commit proposal에 포함시키도록 확장. 기존 `artifactScope`/`artifactKinds`/`changeCountSummary`는 그대로 유지.
  - `src/services/approval/build-approval-explanation.js`의 `buildCommitExplanation()`이 `artifactKinds`와 `pathScopeSummary`를 fields/impactSummary에 surface. 새 한국어 clause로 “리뷰어는 표준 Git 도구로 ... 경로 이력을 확인할 수 있다”를 추가했다. 절대경로/원격 URL/raw stderr는 노출되지 않는다.
  - `src/services/approval/approval-policy-service.js`, `src/services/approval/classify-git-action.js`, `src/services/workflow/workflow-state.js`에 Story 3.5 reuse 계약 주석을 추가 — 새 approval type, 새 audit event, 새 state 필드를 도입하지 않는다는 invariant를 코드 옆 문서로 박았다. (실제 동작 변경 없음)
  - `README.md`에 “표준 Git 도구로 워크플로 산출물 추적하기” 섹션 추가 — `git log -- <path>`, `git log --follow -- <file>`, `git blame <file>`, `git log --grep "워크플로우 완료"` 워크플로 예시 포함.
  - `tests/regression.test.js`에 Story 3.5 전용 회귀 7건 추가:
    - `verifyStory35CommitProposalCodeOnlyScope` (code-only)
    - `verifyStory35CommitProposalDocsOnlyScope` (docs-only: technical-doc + planning-artifact + README)
    - `verifyStory35CommitProposalMixedScope` (code+docs 혼합 + bucket 순서)
    - `verifyStory35CommitExplanationSurfacesScopeWithoutSensitiveData` (artifactKinds/pathScopeSummary surface, basename/abs-path/URL leak 가드)
    - `verifyStory35PushFailureDoesNotInvalidateLocalCommitTraceability` (commit success 후 push fail 시 commit audit 보존)
    - `verifyStory35RecoveryGateBlocksOnlyFinalizationFollowups` (`workflow-finalization` blockingScope만 finalization 차단)
    - `verifyStory35PlanningArtifactPathRemainsInScope` (planning-artifact-only commit + path bucket)
- `npm test` 통과 (exit 0). `npm run build` 재실행 (`dist/devai-aidd-guard.js`).
- Story 3.5는 새 audit event를 도입하지 않았다 (Story 3.4의 이벤트 패밀리 재사용). 새 approval type, 새 dependency, package.json 변경 없음.

### File List

- `src/services/workflow/finalization-artifacts.js` — `summarizePathScope()`, `PATH_SCOPE_BUCKETS`, `SINGLE_FILE_DOC_BUCKETS` 추가 (Story 3.5)
- `src/services/workflow/commit-proposal.js` — commit proposal에 `pathScopeSummary` 필드 추가
- `src/services/approval/build-approval-explanation.js` — commit explanation에 `artifactKinds`/`pathScopeSummary` surface, 한국어 reviewer clause 추가
- `src/services/approval/approval-policy-service.js` — Story 3.5 reuse 계약 주석 (동작 변경 없음)
- `src/services/approval/classify-git-action.js` — Story 3.5 reuse 계약 주석 (동작 변경 없음)
- `src/services/workflow/workflow-state.js` — Story 3.5 “새 state 필드 추가하지 않는다” invariant 주석 (동작 변경 없음)
- `README.md` — “표준 Git 도구로 워크플로 산출물 추적하기” 섹션 추가
- `tests/regression.test.js` — Story 3.5 회귀 7건 + main() chain 등록
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 3.5 status: ready-for-dev → in-progress → review → done
- `_bmad-output/implementation-artifacts/3-5-preserve-reviewer-traceability-through-standard-git-history.md` — Status: done, 모든 task/subtask 체크, Completion Notes 업데이트, File List 추가, Review Follow-ups (AI) 추가

### Review Follow-ups (AI)

#### Round 1 (resolved during Story 3.5 code review)

- [x] [AI-Review][Low] `summarizePathScope()`에 사용되지 않는 `order` 배열이 선언/append만 되고 다시 읽히지 않는 dead code였음 — 최종 ordering이 `orderedPrefixes` (PATH_SCOPE_BUCKETS + SINGLE_FILE_DOC_BUCKETS + "other") 기반으로 결정되므로 `order` 변수와 push 호출을 제거. 동작 동일, 회귀 테스트 7건 모두 통과. [src/services/workflow/finalization-artifacts.js]

#### Code review summary (2026-05-10)

- 0 Critical, 0 High, 0 Medium, 1 Low 발견. Critical/High가 없어 자동 수정 정책에 따라 Low 1건은 즉시 수정하고 status를 `review` → `done`으로 승격.
- AC1 (표준 Git 도구로 추적, 최소 정보) 검증: PASS — `pathScopeSummary`는 prefix-기반 bucket count만 노출하며 basename/절대경로/원격 URL을 일절 포함하지 않음. 회귀 테스트 `verifyStory35CommitExplanationSurfacesScopeWithoutSensitiveData`가 직접 가드.
- AC2 (코드+비코드 산출물 함께 추적) 검증: PASS — 단일 commit proposal이 `artifactKinds`와 `pathScopeSummary`를 통해 코드/문서를 같은 commit에 묶고, 회귀 테스트 `verifyStory35CommitProposalMixedScope`가 bucket 순서까지 고정.
- 신규 audit event/approval type/state 필드/dependency 도입 없음 (Story 3.4의 `git.action.executed` 패밀리, Story 3.2/3.3의 commitProposal/pushProposal, Story 2.5의 recovery gate 그대로 재사용).
- Story 3.1~3.4 invariant (selectNextPlannedAction priority, audit field shapes, push-after-commit gating)는 그대로 유지됨을 코드 리뷰에서 확인.
