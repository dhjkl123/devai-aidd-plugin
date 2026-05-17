# Test Automation Summary

생성일: 2026-05-10
워크플로우: bmad-bmm-qa-generate-e2e-tests
대상 프로젝트: opencode-aidd-plugin (devai-aidd-guard)
프레임워크: `node:assert/strict` + `node` 직접 실행 (Jest/Vitest/Playwright/Cypress 미사용 — 기존 `tests/regression.test.js` 관습 유지)

## 컨텍스트

이 플러그인은 opencode 런타임 훅·정책 모듈로, HTTP API와 UI가 없습니다. 따라서 표준적인 의미의 "API 테스트" 또는 "브라우저 E2E"는 적용 대상이 아니며, 본 작업에서는 **훅 진입점 → 서비스 파이프라인 통합** 시나리오를 자동화 대상으로 정의했습니다. 각 시나리오는 다음을 사용합니다:

- 실제 `git` 바이너리로 임시 디렉터리에 저장소 초기화 (`os.tmpdir()`)
- 실제 `DevaiAiddGuardPlugin` 팩토리 부트스트랩 (`src/index.js`)
- 실제 `loadRuntimeConfig`, `createWorkflowStateStore`, `createAuditLogger`
- 모킹은 `client.app.log`, `client.session.promptAsync`만 (audit·prompt 결과 관찰을 위해)

## 생성된 테스트

### Hook → Service E2E 시나리오

- [x] `tests/e2e/helpers.js` — 공유 스캐폴딩 (임시 워크스페이스 생성·정리, mock client, audit/prompt 헬퍼, `runScenario` 러너)
- [x] `tests/e2e/scenario-workflow-detection.test.js`
  - 정상 경로: `/bmad-bmm-quick-dev` → workflow.detected 1회, git.readiness.checked outcome=allow, branch 액션 planned, approval.requested + 프롬프트 전달
  - 부정 경로: 워크플로우가 아닌 슬래시 커맨드는 어떤 detection도 일으키지 않음
- [x] `tests/e2e/scenario-readiness-not-initialized.test.js`
  - 비-git 디렉터리에서 readiness.outcome=ask, kind=init action planned, branch 계획은 스킵, init approval 프롬프트 전달
- [x] `tests/e2e/scenario-approval-deny-recovery.test.js`
  - 정상 경로: 브랜치 approval → permission.asked(deny) → approval.resolved(deny) → git.action.recovery.offered → 복구 프롬프트 전달
  - 부정 경로: `permission.asked`는 알 수 없는 outcome 페이로드에 대해 절대 throw하지 않음 (런타임이 권한 실패로 오인하지 않도록)
- [x] `tests/e2e/scenario-file-edited-tracking.test.js`
  - 정상 경로: `file.edited` × 3 (상대경로/절대경로/중복) → `tool.execute.after(finish)` → `workflow.finalization.evaluated.details.matchedFiles + ignoredFiles` 안에서 `src/foo.js` 1회, `src/bar.js` 1회 (절대→상대 정규화 + 중복 dedupe 검증)
  - 엣지 입력 (빈 sessionID, undefined filePath, undefined input): 절대 throw하지 않음

## 커버리지

| 영역 | 커버 | 비고 |
| --- | --- | --- |
| 훅 진입점 | 4/6 | `command.execute.before`, `tool.execute.after`, `permission.asked`, `file.edited`. `tool.execute.before`/`event(session)`는 기존 regression.test.js가 충분히 커버. |
| Git 서비스 흐름 | readiness, branch planning, init proposal | commit/push 실제 실행은 regression.test.js + 단위 테스트가 다룸 |
| Approval/Recovery | approval.requested → resolved(deny) → 복구 게이트 오픈 → 복구 프롬프트 전달 | accept→executeApprovedAction은 regression.test.js가 커버 |
| Workflow 상태 | workflow.detected, touchedFiles dedupe, finalization 평가 | — |
| Audit 채널 | workflow.detected, git.readiness.checked, git.action.planned, approval.requested, approval.resolved, git.action.recovery.offered, workflow.finalization.evaluated | — |

## 실행 방법

```
npm test
```

`package.json` `test` 스크립트가 기존 `node --check` 문법 검사 + `regression.test.js` 뒤에 4개 e2e 시나리오를 차례로 실행하도록 갱신되었습니다.

마지막 검증 실행 결과 (2026-05-10):

```
{ status: passed, compared: [legacy-vs-wrapper, legacy-vs-built] }   ← regression.test.js
✓ workflow detection: happy path publishes branch approval (501ms)
✓ workflow detection: non-workflow command is a no-op (334ms)
✓ readiness: uninitialized workspace proposes init and skips branch planning (55ms)
✓ approval deny: opens recovery gate and delivers recovery prompt (490ms)
✓ permission.asked never throws on unknown payload (455ms)
✓ file.edited: dedupes paths and finalization sees the unique set (560ms)
✓ file.edited: edge inputs never throw (329ms)
```

## 설계 원칙

- **공개 관찰 가능 표면만 단언**: `workflowState`를 직접 들여다보지 않고 audit 이벤트(`client.app.log`)와 approval 프롬프트(`client.session.promptAsync`)로만 검증. 내부 구현 변경에 깨지지 않음.
- **실제 git 바이너리 사용**: `git init`, `git config`, `git add`, `git commit`을 임시 dir에서 실행. `gitRunner` mock이 아닌 실제 분기가 검증되어 통합 회귀가 잡힘.
- **시나리오별 격리**: 각 시나리오는 자기 전용 `os.tmpdir()` 워크스페이스를 만들고 try/finally에서 정리. 순서 의존성 없음.
- **never throw 보장**: 훅 계약상 `permission.asked` / `file.edited`가 throw하면 런타임이 권한 실패로 오인하므로, 엣지 입력에 대한 명시적 부정 단언을 포함.

## 다음 단계

- 추가 가능: `tool.execute.after(finish)` 종단 finalization 시나리오에서 commit→push 체인까지 (실제 remote가 없어도 push 게이팅 + push 거부 시나리오까지 검증). 현재는 regression.test.js가 단위 단위로 커버 중.
- CI 통합: `npm test`가 git 바이너리 + Node 22를 요구하므로 CI 워커 이미지 검증 필요.
- 추가 엣지 시나리오: ignore-and-continue outcome → 복구 게이트 모드 변화, branch/switch (vs branch/create) 분기.

## 검증 체크리스트 (`_bmad/bmm/workflows/qa-generate-e2e-tests/checklist.md`)

- [x] API 테스트 — 해당 없음 (HTTP API 부재)
- [x] E2E 테스트 생성 (UI E2E의 의미는 아니지만, 훅→서비스 종단 통합 시나리오로 동등 대체)
- [x] 테스트가 표준 프레임워크 API(`node:assert/strict`)를 사용
- [x] Happy path 커버
- [x] 1~2개 critical error case 커버 (deny 분기, 알 수 없는 페이로드, edge input)
- [x] 모든 생성 테스트가 성공 (`npm test` exit 0)
- [x] 시멘틱 로케이터 — N/A (UI 없음); 대신 audit `event` 이름 + 명시적 metadata key로 매칭
- [x] 분명한 description (`runScenario(name, fn)`)
- [x] hardcoded sleep 없음 (모두 `await` 기반)
- [x] 독립 실행 (각 시나리오가 전용 임시 디렉터리)
- [x] 요약 작성, 적절 디렉터리 저장 (`tests/e2e/` 아래), 커버리지 표 포함
