---
title: 'Git workflow guard 강화 — block-until-init 및 인터랙티브 init 체인'
slug: 'strengthen-git-init-proposal'
created: '2026-05-11'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
implementation_commit: '(pending — to be assigned after final review)'
implementation_date: '2026-05-11'
review_findings_total: 21
review_findings_fixed: 5
review_findings_skipped: 16
review_approach: 'auto-fix-high-only'
tech_stack: ['Node.js 22', 'ESM JavaScript', 'esbuild bundle', 'plain node:assert tests', 'opencode native plugin event API']
files_to_modify:
  - 'src/hooks/tool-execute-before.js'
  - 'src/hooks/permission-asked.js'
  - 'src/hooks/command-execute-before.js'
  - 'src/index.js'
  - 'src/services/git/run-git-command.js'
  - 'src/services/git/execute-approved-action.js'
  - 'src/services/git/init-service.js'
  - 'src/services/git/build-init-proposal.js'
  - 'src/services/git/plan-branch-proposal.js'
  - 'src/services/workflow/looks-like-git-command.js'
  - 'src/services/approval/consume-approval-outcome.js'
  - 'tests/e2e/scenario-readiness-not-initialized.test.js'
  - 'tests/e2e/scenario-init-chain.test.js'
  - 'tests/unit/looks-like-git-command.test.js'
  - 'tests/regression.test.js'
code_patterns:
  - 'bootstrap constructs adapters/config/audit/state once and closes over them'
  - 'hook factories are thin adapters over services; services own state + audit shape'
  - 'pure builders for proposals; executors live in services/git/*-service.js'
  - 'approval lifecycle: planning -> request -> resolve -> executor -> next planning pass'
  - 'priority chain in selectNextPlannedAction: pendingActions[0] > init > branch > commit > push'
  - 'post-execution chaining via publishXxxIfNeeded inside execute-approved-action.js'
  - 'audit emission is best-effort; user-facing prompt delivery is load-bearing'
  - 'native event router delegates command.executed to legacy hook factory'
test_patterns:
  - 'plain async test scripts with node:assert/strict'
  - 'createTempWorkspace + bootstrapPlugin for real-git e2e workspaces'
  - 'findAuditEvents / findFirstAuditEvent / findApprovalPrompt helpers'
  - 'mock client.app.log and client.session.promptAsync; verify mock.prompts and mock.logs'
  - 'native event chain: command.executed -> question.asked -> question.replied'
  - 'src/dist parity guard in regression.test.js (npm run build must follow code changes)'
---

# Tech-Spec: Git workflow guard 강화 — block-until-init 및 인터랙티브 init 체인

**Created:** 2026-05-11

## Overview

### Problem Statement

devai 환경에서 `/bmad-*` 워크플로우 실행 시, 모델(devai 내부 AI 어시스턴트)이 플러그인의 init proposal보다 먼저 자체적으로 `git rev-parse --is-inside-work-tree` 같은 Bash 명령을 호출해 `fatal: not a git repository` stderr 출력을 사용자에게 그대로 노출한다. 그 결과 플러그인이 발행한 init 승인 프롬프트(`"Initialize Git"` question)는 모델의 자체 git 출력과 그 뒤이은 설명에 묻혀 사용자가 init 의사결정을 할 기회를 잃는다.

또한 사용자가 어떻게든 승인 프롬프트를 보고 "Initialize Git (Recommended)"을 선택한다 하더라도, `runGitAction`에는 `kind: "init"` 분기가 없고 `permission-asked.js`의 `resolveApprovalOrRecovery`는 commit/push에만 executor를 호출하므로 실제 `git init` 명령이 실행되지 않는다. 현재 흐름은 `approval.resolved` 감사 이벤트만 남기고 끝나며, 사용자는 결국 손으로 `git init`을 실행해야 한다.

### Solution

3개의 강화 레이어를 추가한다:

1. **Hard block (block-until-init)**: workflowState에 init proposal이 pending 상태인 동안, `tool.execute.before` 훅이 모델의 모든 `bash` tool에서 `git` 명령 실행을 차단한다. 차단 시 init 프롬프트로 가이드하는 reason 메시지를 throw. 모델이 자체 git 체크로 우회하는 경로를 봉쇄.

2. **승인 기반 init 체인**: 각 단계가 별도 approval을 요구하는 chain.
   - Step A: init proposal 승인 → 실제 `git init` 실행 + 기본 `.gitignore` 작성(없을 시)
   - Step B: baseline commit proposal 발행 (사용자 승인 필요) → `git add` + `git commit -m "Initial commit"` 실행
   - Step C: branch planning 흐름 재개 (기존 branch proposal 발행 경로 활용)

3. **executor 확장**: 새 `init-service.js` (commit-service.js 미러), `runGitAction`에 `kind: "init"` 분기 추가, `execute-approved-action.js`에 init action handler 추가, `resolveApprovalOrRecovery`에 init kind를 executor 트리거 목록에 포함.

### Scope

**In Scope:**

- `src/hooks/tool-execute-before.js` — init pending 상태에서 bash + git 호출 차단
- `src/services/git/init-service.js` — 신규 (buildInitAction + executeInit)
- `src/services/git/run-git-command.js` — `runGitAction`의 `kind: "init"` 분기 추가 (참고: `ALLOWED_COMMANDS`는 read-only `runGitCommand` 전용. `runGitAction`은 자체 분기 구조이며 allowlist 무관)
- `src/services/git/execute-approved-action.js` — `actionType === "init"` 분기, 성공 시 baseline commit proposal 발행
- `src/services/git/build-init-proposal.js` — gitignore 메타데이터, files 목록 등 chain용 추가 필드
- `src/hooks/permission-asked.js` (`resolveApprovalOrRecovery`) — accept 시 executor 호출 분기에 `"init"` 추가
- `.gitignore` 기본 템플릿 (init-service.js 내부 상수)
- 기존 e2e `scenario-readiness-not-initialized.test.js` 확장 (block 검증 + init 실제 실행 검증)
- 신규 e2e 시나리오 `scenario-init-chain.test.js` (full chain: init → baseline commit → branch publish)
- `tests/regression.test.js` 갱신 (bash 차단 contract 메시지 등)

**Out of Scope:**

- 모델 지시문(promptAsync 텍스트) phrasing 강화 — 사용자가 명시적으로 제외
- non-git bash tool 차단 — git만
- 새 워크플로우/UX 패턴 도입 (예: 자동 init 모드 등)
- 기존 audit/config/state 서비스 재설계
- `dist/devai-aidd-plugin.js`는 `npm run build`로 자동 생성되므로 직접 편집하지 않음
- 사용자에게 .gitignore 내용 선택권 제공 — 단순화를 위해 default 템플릿만 작성하고, 파일이 이미 있으면 건드리지 않음

## Context for Development

### Codebase Patterns

- **Bootstrap pattern**: `src/index.js`의 `DevaiAiddGuardPlugin({ client, directory })`이 adapters/config/audit/workflowState/pluginContext를 closure로 생성 후 hook map 반환. native event router는 hook map의 `event` 키에 mounting됨.
- **Hook 계층은 얇은 어댑터**: `tool-execute-before.js` 등은 services 함수를 호출하고 상태만 advance. 실제 로직은 `services/`에 거주.
- **Pure builders + executors**: proposal builder (`build-init-proposal.js`)는 순수 함수. executor (`commit-service.js`, `push-service.js`)는 git subprocess 호출. 그 위에 `git-executor.js`가 envelope contract를 표준화.
- **Approval lifecycle**:
  ```
  publishNextPlannedAction (request 생성/발행 + promptAsync)
    → 사용자 응답 (permission.asked OR question.replied)
    → resolveApprovalOrRecovery → consumeApprovalOutcome (상태 업데이트 + 감사)
    → accept일 때만 executeApprovedAction → executor 호출 → envelope 반환
    → 성공 시 다음 proposal 발행 (publishPushApprovalIfNeeded 패턴)
  ```
- **Priority chain in `selectNextPlannedAction`** (approval-policy-service.js:64-98):
  1. `pendingActions[0]` (큐 head)
  2. `initProposal`
  3. `branchProposal`
  4. `commitProposal`
  5. `pushProposal`
- **Post-execution chaining 모델**: `execute-approved-action.js:213-221` — commit 성공 후 `publishPushApprovalIfNeeded` 호출하여 다음 proposal을 자동으로 publish. 우리의 init chain은 이 패턴을 미러.
- **Audit는 best-effort, prompt 전달은 load-bearing**: `try { await audit.info(...) } catch { /* best-effort */ }` 패턴. 단 user-facing prompt는 실패 시 graceful — `approval.prompt.delivery.failed` 감사 이벤트로 남김.
- **Native event router pass-through**: `native-event.js`의 `handleCommandExecuted`는 legacy `commandExecuteBeforeHandler`로 위임. question.replied → `resolveApprovalOrRecovery`로 합류. 새 로직은 양쪽 경로에서 동작해야 하므로 services 레이어에 두는 게 자연스러움.
- **State 카피 정책**: `workflowState.get(sessionID)`는 nested approval/recovery 필드를 `structuredClone`으로 deep-copy. 변경은 반드시 `workflowState.set`을 통해야 함.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/hooks/tool-execute-before.js` | bash + git 차단 추가 지점. 현재는 MUTATING_TOOLS 가드만 |
| `src/hooks/native-event.js` | command.executed → command-execute-before 위임, question 라우팅 |
| `src/hooks/permission-asked.js` | `resolveApprovalOrRecovery` shared resolver — accept 후 executor 호출 분기 (line 295-300) |
| `src/hooks/command-execute-before.js` | workflow 감지 + readiness + init/branch planning + publishNextPlannedAction |
| `src/services/workflow/mutating-tools.js` | MUTATING_TOOLS/SAFE_READ_TOOLS lowercase 토큰 set |
| `src/services/git/check-repository-readiness.js` | readiness "ask" + git-not-initialized 분기는 그대로 유지 |
| `src/services/git/build-init-proposal.js` | init proposal builder — chain 메타데이터 추가 |
| `src/services/git/run-git-command.js` | `runGitCommand`, `runGitAction` — init kind 추가 |
| `src/services/git/execute-approved-action.js` | actionType별 executor 분기 — init 추가 + post-init chain |
| `src/services/git/commit-service.js` | baseline commit에서 재사용 |
| `src/services/git/git-executor.js` | envelope contract (ACTION_KINDS에 "init" 이미 있음, line 60) |
| `src/services/git/branch-service.js` | post-baseline branch evaluation 재사용 |
| `src/services/approval/publish-next-planned-action.js` | proposal queue/publish — 변경 없이 재사용 |
| `src/services/approval/build-approval-request.js` | actionType 기반 request 생성 (init 이미 지원) |
| `src/services/approval/build-approval-explanation.js` | init proposal에 대한 explanation lines — chain 컨텍스트 추가 가능 |
| `src/services/approval/classify-git-action.js` | `kind: "init"` → actionType "init" 이미 처리 |
| `src/services/approval/approval-policy-service.js` | priority chain — initProposal이 branch보다 먼저 |
| `src/index.js` | `requestApproval` adapter, "Initialize Git" native header 이미 매핑 |
| `tests/e2e/scenario-readiness-not-initialized.test.js` | non-init 경로 e2e — 확장 대상 |
| `tests/e2e/helpers.js` | createTempWorkspace, bootstrapPlugin, find* helpers |
| `tests/regression.test.js` | src/dist parity, hook contract, tool guard contract |

### Technical Decisions

1. **bash + git 차단 위치 및 트리거 조건** (F2/F3 반영 — 게이트 제거 + race-safe):

   `tool-execute-before.js`의 hook factory는 `pluginContext`를 주입받아 `pluginContext.directory`를 closure로 보존한다. 검사 순서:

   1. `input.tool === "question"` → pass (이미 존재)
   2. **block-until-init 분기** (기존 `state.commandName` 게이트와 독립적으로 실행):
      - `input.tool === "bash"`이고
      - `looksLikeGitCommand(input.args?.command)` true이고
      - 다음 중 하나가 true이면 throw:
        - (a) `state?.initProposal != null`
        - (b) `state?.approvalCurrent?.actionType === "init"` (proposal이 active로 promote된 후)
        - (c) `fs.existsSync(path.join(pluginContext.directory, ".git")) === false` (race-safe fallback — workflow hook이 아직 안 돌았어도 non-git 디렉토리면 차단)
   3. 기존 MUTATING_TOOLS 검사 (`state.commandName` 게이트 유지)

   **설계 근거**:
   - 게이트 제거(F2): 모델이 `/bmad-*` 인식 전 git 명령을 던지면 commandName이 아직 없음. 디렉토리 레벨 `.git` 체크가 그 race를 흡수.
   - approvalCurrent 체크(F16 일부): init proposal이 active로 승격되어 `initProposal` slot이 비워진 순간에도 가드 유지.
   - false positive 최소화: 차단은 **bash + git** 한정. `ls`, `pwd` 등 non-git bash는 통과. git repo 안에서는 차단 안 됨.

2. **`looksLikeGitCommand` 감지 로직** (F8 반영 — bypass surface 확장):

   순수 토큰 기반 검사. command 문자열을 다음 패턴으로 검사하여 git 실행 의도를 잡아낸다:

   - 1차: command 트림 후 다음 정규식 중 하나라도 매치 → true
     - `^\s*(?:&\s+)?git\b` — `git ...`, `& git ...` (PowerShell call operator)
     - `^\s*(?:["']?[A-Z]:\\[^"']*?\\)?git(?:\.exe)?(?:["'])?\s` — Windows 절대 경로 `C:\Program Files\Git\bin\git.exe ...`
     - `\b(?:cmd|cmd\.exe)\s+\/c\s+(?:&?\s*)?git\b` — `cmd /c git ...`
     - `\b(?:bash|sh|zsh|pwsh|powershell)\s+(?:-c|-Command)\s+["']?\s*git\b` — `bash -c "git ..."` 등
   - 2차 (chained shell 등 보조): 위 매칭에 실패해도 command에 `(?:^|[;&|`])\s*git\b` 패턴이 있으면 true — `pwd && git status`, `cd repo; git status` 등 chained 케이스
   - 3차 (env-prefix): `^\s*(?:[A-Z_][A-Z0-9_]*=\S+\s+)+git\b` — `GIT_TERMINAL_PROMPT=0 git ...` 등 env 변수 prefix

   pure helper 단일 export로 두고 (e.g. `src/services/workflow/looks-like-git-command.js`), 단위 테스트로 위 케이스 전부 커버.

   **알려진 잔여 bypass**: 사용자 alias나 wrapper script(`gh` → `git` 위임 등)는 못 잡음. R6 (Notes 섹션)에 기록.

3. **차단 contract 메시지 — CANONICAL** (F7 반영 — 단일 출처):

   이 코드 블록이 contract 메시지의 **유일한 정의**이다. 다른 모든 섹션은 이를 참조만 한다. byte-for-byte 검증 대상 — 줄바꿈, 공백, 마침표 포함 정확히 일치해야 한다.

   ```
   Git workflow guard: a git repository must be initialized before running git commands. Approve the pending "Initialize Git" prompt instead of running git directly.
   ```

   - **하나의 라인** (literal `\n` 미포함). regression.test.js는 위 정확한 single-line 문자열과 비교.
   - 의도적으로 `"Initialize Git"` 라벨을 명시해 모델이 native question tool을 호출하도록 유도.
   - Task 10, AC4는 이 정의를 참조만 한다. 별도 재명세 금지.

4. **`Cancel` 응답 → APPROVAL_OUTCOMES.DENY 매핑** (F10 반영):

   `src/index.js:174-176`에서 init proposal의 native 옵션은 `["Initialize Git (Recommended)", "Cancel"]`. `src/hooks/native-event.js:158-165`의 `DENY_ANSWER_TOKENS`에 이미 `"cancel"`이 포함되어 있어 `parseApprovalAnswerOutcome("Cancel")` → `APPROVAL_OUTCOMES.DENY`로 정규화됨.

   따라서:
   - "Cancel" 응답 → DENY → `consumeApprovalOutcome`이 `isTerminalSkip = true`로 처리 → Task 6의 init slot cleanup이 트리거됨.
   - 신규 매핑 추가 작업 없음 — 기존 alias 테이블 재사용. AC14는 이 매핑을 전제로 작성됨.

5. **init-service.js 구조**: commit-service.js 미러.
   ```js
   buildInitAction({ directory, correlationId, gitignoreContent }) → { kind: "init", operation: "init", directory, correlationId, gitignoreContent, ... }
   executeInit({ plan, approval, expectedState, workflowContext, gitRunner, audit, workflowState }) → envelope
   ```
   - `gitRunner`는 `pluginContext.gitActionRunner` 재사용
   - `executeGitAction({ plan, ... })` 호출 — 표준 envelope을 반환

6. **`executeInit` 내부 ordering** (F6 반영 — gitignore가 listChangedFiles 이전에 land 보장):

   `executeInit`은 다음 순서로 동기 진행한다 (await 사이에 외부 호출 없음):

   ```
   1. executeGitAction({ plan, ... }) 호출 → git init 실행
   2. envelope.ok === true이면:
      a. fs.existsSync(path.join(directory, ".gitignore")) 검사
      b. 없으면 fs.writeFileSync(path, DEFAULT_GITIGNORE_LINES.join("\n") + "\n", "utf8")
      c. writeFileSync 실패는 try/catch로 swallow하고 audit.info("init.gitignore.write.failed", ...)에 best-effort 기록
   3. envelope 반환
   ```

   `executeApprovedAction`은 `executeInit` 호출이 await로 완료된 후에야 `listChangedFiles()`를 호출. 따라서 gitignore가 status enumeration 이전에 디스크에 존재함이 보장됨. R6 (Notes)에 추가 기록.

7. **runGitAction의 init 분기** (F1 반영 — ALLOWED_COMMANDS 무관):

   ```js
   if (action.kind === "init") {
     const stdout = await execGit(action.directory, ["init"], timeoutMs);
     return { stdout, observedState: null };
   }
   ```
   - `runGitAction`은 자체 분기 구조. `ALLOWED_COMMANDS`(line 6-11)는 read-only `runGitCommand` 전용이며 변경하지 않음.
   - `.gitignore` 작성은 executor 외부 (TD #6의 `executeInit`)에서 수행. `runGitAction`은 순수 git 호출만.
   - timeoutMs default 5000 유지. `directory`는 action.directory에서 가져옴. observedState는 null.

8. **.gitignore default 내용** (init-service.js 상수, F18 일부 반영):
   ```gitignore
   node_modules/
   dist/
   .env
   .env.local
   .DS_Store
   *.log
   .vscode/
   .idea/
   _bmad-output/
   .claude/
   ```
   - F18 반영: BMAD 산출물 디렉토리(`_bmad-output/`, `.claude/`)를 baseline commit에 휩쓸리지 않도록 포함.
   - 이미 존재하면 작성 스킵 (touch 안 함).
   - 작성 실패는 init success에 영향 없음 (best-effort).

9. **baseline commit proposal 빌드 (post-init)** (F5 반영 — 빈 디렉토리 대응):

   - 새 helper `buildBaselineCommitProposal({ directory, files, sessionID })`
   - `files`는 `pluginContext.listChangedFiles()` 호출 결과 (git status --porcelain). gitignore 적용된 후의 결과이므로 BMAD 산출물 등은 제외됨.
   - **`files.length === 0` 대응**: `allowEmpty: true` 필드를 proposal payload에 추가. `buildCommitArgs`(`run-git-command.js:74-91`)는 files 빈 배열에서 throw하므로, baseline commit 전용으로 다음 중 하나 채택:
     - (option A) `buildCommitArgs`를 확장해 `allowEmpty` 시 `["commit", "--allow-empty", "-m", message]`만 사용 (`add`/`pathspec` 건너뜀).
     - (option B) `runGitAction`에 `kind: "commit"` 분기 외에 `kind: "baseline-commit"` 분기 신설.
     - **결정**: option A 채택 — 기존 commit 경로 재사용, kind 확산 최소화. `buildCommitArgs(action)`이 `action.allowEmpty === true`이면 `addArgs = null` (skip), `commitArgs = ["commit", "--allow-empty", "-m", message]` 반환.
   - message: `"Initial commit"`
   - correlationId: `baseline-commit:${sessionID}:${Date.now().toString(36)}`
   - workflowState `commitProposal` 슬롯에 세팅 후 `publishNextPlannedAction` 호출.

10. **baseline commit 식별자** (F12 반영 — fragile `reason` 회피):

    baseline commit이 일반 commit과 구분되는 핵심 필드는 `proposal.action === "baseline-commit"` (proposal builder가 명시적으로 세팅). `buildProposalFingerprint`(`build-approval-request.js:50-80`)는 `action` 필드를 포함하므로 actionId 충돌 자동 회피.

    `reason: "baseline-commit"`은 informational 보조 필드로 남기되, chain branch 식별은 `proposal.action`으로만 한다. `executeApprovedAction`의 post-commit 분기는 `approvalRequest.proposal?.action === "baseline-commit"`로 검사.

11. **post-baseline branch planning** (F15 반영 — push/branch 둘 다 시도):

    `execute-approved-action.js`의 commit 분기는 기존에 `publishPushApprovalIfNeeded`로 push proposal을 publish 시도한다. baseline commit의 경우:

    - `publishPushApprovalIfNeeded` 호출 유지 — 방금 init한 repo는 remote 없으므로 `buildPushProposal`이 null을 반환해 noop 처리. 기존 코드 신뢰.
    - 별도로 `planBranchProposal` 호출하여 branch proposal을 publish. push와 branch는 우선순위 chain에서 별도 슬롯(`pushProposal` vs `branchProposal`)이라 충돌 없음. priority 2(branch) > 4(push)이므로 사용자가 보는 다음 prompt는 branch가 됨.
    - `planBranchProposal({ workflowContext, workflowPolicy, branchConfig: pluginContext.runtimeConfig.config.branch, currentBranch, workflowState, audit })` — Task 7에서 추출.

12. **chain의 readiness 재평가** (F4 반영 — throw 안전, audit 패턴 F4-partial 수정):

    init이 성공하면 readiness가 "allow"여야 함. 그러나 readiness는 `command.execute.before` 진입 시점에 계산되어 state에 저장됨. baseline commit 시점에는 옛 readiness가 남아있을 수 있음.

    ```js
    // executeApprovedAction의 init 성공 후 (envelope.ok === true)
    let refreshedReadiness = null;
    try {
      refreshedReadiness = checkRepositoryReadiness({
        directory: pluginContext.directory,
        gitRunner: pluginContext.gitRunner,
        policy: workflowPolicy,
      });
    } catch (error) {
      // best-effort: readiness 재호출 실패해도 chain 계속 진행.
      // git init은 이미 성공했으므로 isGitRepository를 true로 가정한 fallback readiness 사용.
      refreshedReadiness = {
        outcome: "allow",
        reason: "post-init-fallback",
        message: "Assumed ready after successful git init.",
        details: { directory: pluginContext.directory, isGitRepository: true, branch: null, hasRemote: false, remoteNames: [], checkedAt: new Date().toISOString() },
      };
      // F4-partial 수정: codebase 컨벤션(try { await audit.info(...) } catch {})으로 정렬
      if (audit) {
        try {
          await audit.info("git.readiness.refresh.failed", {
            event: "git.readiness.refresh.failed",
            timestamp: new Date().toISOString(),
            workflow: workflowContext.commandName,
            command: workflowContext.commandName,
            sessionID,
            outcome: "skip",
            details: { reason: "readiness-refresh-threw", error: error?.message ?? String(error) },
          });
        } catch {
          // best-effort
        }
      }
    }
    // initProposal slot은 ACCEPT 성공 직후에만 clear (G1 반영 — failure는 recovery가 처리)
    workflowState.set(sessionID, { ...workflowState.get(sessionID), readiness: refreshedReadiness, initProposal: null });
    ```

    → chain은 readiness 재호출 throw에도 끊기지 않음. audit 호출은 try/await/catch로 컨벤션 일치.

13. **init proposal slot 정리** (G1 반영 — recovery 경로 보존):

    `consume-approval-outcome.js`는 init proposal slot을 clear하지 않음 (line 141-151). 우리가 처리해야 함.

    **검증된 사실**: `build-recovery-options.js:75-96`에 `buildInitOptions()`가 존재하고 `RECOVERY_ACTION_KINDS.INIT`(`recovery-state.js:102`)도 정의됨. 따라서 init executor failure 시 `permission-asked.js:311-333`의 `openRecoveryFromExecution`이 recovery gate를 연다.

    Slot 정리 정책:

    - init **ACCEPT + envelope.ok === true** (성공): `executeApprovedAction`의 init 분기에서 readiness 재호출 직후 `initProposal: null` 세팅 (TD #12 코드).
    - init **ACCEPT + envelope.ok === false** (실패): **slot 보존**. recovery gate 사용자가 "Retry"를 선택하면 slot이 그대로 있어 publishNextPlannedAction이 재발행 가능. "Continue without automation" 또는 "Manual resolution"을 선택하면 recovery resolver가 자체적으로 slot을 정리하거나 그대로 두고 워크플로우만 종료.
    - init **DENY/IGNORE**: `consume-approval-outcome.js`의 `isTerminalSkip` 처리에 init 추가 (Task 6).
    - init **ACCEPT 후 executor가 throw** (rare — programmer error): try/catch로 감싸지 않음. 상위 `resolveApprovalOrRecovery`의 outer try/catch(`permission-asked.js:371-391`)가 잡아 `approval.resolution.failed` 감사 후 graceful return. slot은 보존됨.

    Task 8은 따라서 `try/finally`를 사용하지 **않는다**. 다음 패턴 적용:
    ```js
    const envelope = await executeInit({ ... });
    if (envelope?.ok) {
      // 성공 path만 slot clear + chain 진행 (TD #12)
    }
    // 실패 path: slot 보존, executor 호출자(permission-asked.js)가 recovery gate 처리
    return { outcome: "executed", envelope };
    ```

14. **테스트 전략 결정**:
    - 기존 `scenario-readiness-not-initialized.test.js`는 다음 케이스 추가:
      - bash+git 차단 검증 (workflow session O / X 양쪽, .git 부재 race-safe 경로 포함)
      - init accept 후 실제 `.git` 디렉토리 생성 검증
      - init accept 후 baseline commit prompt 발행 검증
    - 신규 `scenario-init-chain.test.js`: full chain — init accept → baseline commit prompt → accept → branch proposal → 검증.
    - `looks-like-git-command.js` 신규 단위 테스트 파일 — TD #2의 모든 패턴 케이스 커버.
    - 단위/통합 테스트는 모두 real git binary 사용 (F14 mitigation: helpers.js에 `requireGitBinary()` 가드 추가 — git 없으면 scenario를 `assert.ok(true, "skipped: git not installed")`로 단축. CI는 별도 step에서 git 설치 보장).

## Implementation Plan

### Tasks

#### Phase 1 — Pure Builders & Constants (의존성 없음)

- [ ] **Task 1**: `.gitignore` 기본 템플릿과 init action 빌더 정의
  - File: `src/services/git/init-service.js` (NEW)
  - Action:
    - 상수 `DEFAULT_GITIGNORE_LINES` (배열) — TD #8의 항목 그대로: `node_modules/`, `dist/`, `.env`, `.env.local`, `.DS_Store`, `*.log`, `.vscode/`, `.idea/`, `_bmad-output/`, `.claude/`
    - `buildInitAction({ directory, correlationId, gitignoreContent }) → { kind: "init", operation: "init", directory, correlationId, gitignoreContent }`
  - Notes: `commit-service.js`의 `buildCommitAction` 패턴 미러. `correlationId`는 `init:${sessionID}:${timestamp36}` 형식.

- [ ] **Task 1b**: `looksLikeGitCommand` pure helper 신설
  - File: `src/services/workflow/looks-like-git-command.js` (NEW)
  - Action: TD #2에 명시된 4단계 검사(1차 정규식 4종 + chained shell + env-prefix)를 한 함수로 구현. `default export` 단일 함수 시그니처 `(command: string | null | undefined) => boolean`.
  - Notes: 입력 정규화 — 문자열 아니면 false 반환. trim 후 검사. 모든 패턴은 정규식 컴파일을 모듈 로드 시점에 한 번만 수행.

- [ ] **Task 2**: init proposal builder에 chain 메타데이터 추가
  - File: `src/services/git/build-init-proposal.js`
  - Action: 반환 객체에 `correlationId` (옵션), `requiresApproval: true` 유지, 기존 필드 보존
  - Notes: `build-approval-request.js`의 `buildProposalFingerprint`가 directory를 이미 사용하므로 actionId 안정성 유지됨.

- [ ] **Task 3**: baseline commit proposal builder 정의 (F5/F12 반영)
  - File: `src/services/git/build-init-proposal.js` (같은 파일에 추가 export)
  - Action: `buildBaselineCommitProposal({ directory, files, sessionID })` →
    ```js
    {
      kind: "commit",
      action: "baseline-commit",        // chain 식별의 1차 디스크리미네이터 (F12)
      message: "Initial commit",
      files: Array.isArray(files) ? [...files] : [],
      allowEmpty: !Array.isArray(files) || files.length === 0,  // F5: 빈 디렉토리 대응
      directory,
      correlationId: `baseline-commit:${sessionID}:${Date.now().toString(36)}`,
      reason: "baseline-commit",        // informational 보조
    }
    ```
  - Notes: 기존 commit proposal과 같은 `kind: "commit"`이라 classify-git-action에서 actionType "commit"으로 처리됨. **chain 분기 시 `proposal.action === "baseline-commit"`로만 검사** (proposal.reason은 보조 정보일 뿐). `allowEmpty: true`일 때 `buildCommitArgs`가 add/pathspec 스킵하고 `--allow-empty`를 사용 — Task 5에서 buildCommitArgs 확장.

#### Phase 2 — Services Layer

- [ ] **Task 4**: `executeInit` 실행 함수 추가 (F6 반영 — 동기 ordering 보장)
  - File: `src/services/git/init-service.js` (NEW)
  - Action:
    - import `executeGitAction` from `./git-executor.js`, `import { existsSync, writeFileSync } from "node:fs"`, `import { join } from "node:path"`
    - `async function executeInit({ plan, approval, expectedState, repositorySnapshot, workflowContext, gitRunner, audit, workflowState }) → envelope`:
      1. `const envelope = await executeGitAction({ plan, ... })` — git init 실행
      2. `if (envelope.ok) { writeGitignoreIfMissing(plan.directory, audit) }` — **동기적 `writeFileSync`이므로 함수 반환 시점에 디스크에 land 완료 보장**
      3. `return envelope`
    - helper `writeGitignoreIfMissing(directory, audit)`:
      ```js
      const target = join(directory, ".gitignore");
      if (existsSync(target)) return;
      try {
        writeFileSync(target, DEFAULT_GITIGNORE_LINES.join("\n") + "\n", "utf8");
      } catch (error) {
        try { await audit?.info?.("init.gitignore.write.failed", { error: error.message }); } catch {}
      }
      ```
  - Notes: ACTION_KINDS에 "init"이 이미 포함되어 있음 (`git-executor.js:60`). `.gitignore` 작성 실패는 envelope.ok에 영향 없음. **`executeInit`이 await로 반환 후 caller가 `listChangedFiles()`를 호출**하므로 ordering 보장 (F6).

- [ ] **Task 5**: `runGitAction`에 `kind: "init"` 분기 + `buildCommitArgs`의 `allowEmpty` 확장 (F1/F5 반영)
  - File: `src/services/git/run-git-command.js`
  - Action 1 (init 분기):
    - line 130 근처 `if (action.kind === "init") { const stdout = await execGit(action.directory, ["init"], timeoutMs); return { stdout, observedState: null }; }`
    - 기존 commit/push 분기는 보존
    - **ALLOWED_COMMANDS는 건드리지 않음** — readonly `runGitCommand` 전용이며 `runGitAction`은 자체 분기 구조 (F1).
  - Action 2 (buildCommitArgs 확장 for baseline empty repo):
    - `buildCommitArgs(action)` (line 74-91)이 `action.allowEmpty === true`인 경우:
      - `addArgs: null` 반환 (skip add 단계)
      - `commitArgs: ["commit", "--allow-empty", "-m", message]` 반환 (pathspec 없음)
    - `runGitAction`의 commit 분기는 `addArgs !== null`일 때만 add 실행.
    - 기존 contract (`buildCommitArgs`가 files 빈 배열에서 throw)는 `allowEmpty: true`가 아닐 때만 발동되도록.
  - Notes: timeoutMs default 5000 유지. observedState는 init/empty-commit 모두 null. F19에 따라 향후 env-aware timeout 정책 고려 (out of scope this spec).

- [ ] **Task 6**: `consumeApprovalOutcome` — terminal outcome 시 initProposal slot 정리
  - File: `src/services/approval/consume-approval-outcome.js`
  - Action: line 144-151의 `proposalCleanup` 객체에 init 핸들링 추가
    - `isTerminalSkip` (DENY/IGNORE)이면서 `resolution.actionKind === "init"`이면 `proposalCleanup.initProposal = null`
    - ACCEPT 시는 executor에서 clear (Task 8에서)
  - Notes: 기존 commit/push와 동일한 패턴. 미정리 시 다음 planning 패스에서 무한 재발행.

- [ ] **Task 7**: branch planning 재사용을 위한 helper 추출 (F11 반영 — 위치 확정)
  - File: `src/services/git/plan-branch-proposal.js` (NEW) — 단일 정의 위치
  - Action: `export async function planBranchProposal({ workflowContext, workflowPolicy, branchConfig, currentBranch, workflowState, audit })` — `command-execute-before.js`의 line 153-202 (evaluateBranchStrategy → buildBranchProposal → state set + audit 로직)을 함수로 묶음. `branchProposal` slot 세팅까지 수행하고 caller는 별도로 `publishNextPlannedAction` 호출.
  - Notes: `command-execute-before.js`도 이 helper를 import해서 사용 (인라인 로직 제거 후 호출로 대체). `execute-approved-action.js`도 동일 import. **새 파일 한 곳에 두므로 Task 8 import 경로 모호성 해소**.

- [ ] **Task 8**: `executeApprovedAction` — init action 분기 + post-init chain (F4/F12/F13/F15 반영)
  - File: `src/services/git/execute-approved-action.js`
  - Action:
    - import `buildInitAction, executeInit` from `./init-service.js`, `buildBaselineCommitProposal` from `./build-init-proposal.js`, `planBranchProposal` from `./plan-branch-proposal.js`, `checkRepositoryReadiness` from `./check-repository-readiness.js`
    - line 191의 commit 분기 위에 `if (approvalRequest.actionType === "init" && approvalRequest.proposal?.kind === "init") { ... }` 추가
    - init 분기 흐름 (G1 반영 — try/finally 제거, slot은 성공 시에만 clear):
      ```js
      const plan = buildInitAction({
        directory: pluginContext.directory,
        correlationId: approvalRequest.proposal.correlationId,
        gitignoreContent: null,  // executeInit 내부의 default 사용
      });
      const envelope = await executeInit({ plan, approval: { resolvedAt: approvedAt }, workflowContext, gitRunner: pluginContext?.gitActionRunner, audit, workflowState });
      // 실패 시는 slot 유지 — recovery gate가 retry 선택 시 publish 재시도 가능 (TD #13)
      if (envelope?.ok) {
        // F4: readiness 재호출은 try/catch로 감싸 fallback readiness 사용
        let refreshedReadiness;
        try {
          refreshedReadiness = checkRepositoryReadiness({ directory: pluginContext.directory, gitRunner: pluginContext.gitRunner, policy: workflowPolicy });
        } catch {
          refreshedReadiness = { outcome: "allow", reason: "post-init-fallback", message: "Assumed ready after successful git init.", details: { directory: pluginContext.directory, isGitRepository: true, branch: null, hasRemote: false, remoteNames: [], checkedAt: new Date().toISOString() } };
          try { await audit?.info?.("git.readiness.refresh.failed", { /* best-effort */ }); } catch {}
        }
        const files = (() => { try { return pluginContext?.listChangedFiles?.() ?? []; } catch { return []; } })();
        const baseline = buildBaselineCommitProposal({ directory: pluginContext.directory, files, sessionID });
        workflowState.set(sessionID, { ...(workflowState.get(sessionID) ?? {}), readiness: refreshedReadiness, commitProposal: baseline });
        try { await audit?.info?.("git.action.planned", { event: "git.action.planned", timestamp: new Date().toISOString(), workflow: workflowContext.commandName, command: workflowContext.commandName, sessionID, outcome: "allow", details: { kind: "commit", action: "baseline-commit", requiresApproval: true, correlationId: baseline.correlationId, phase: workflowContext.phase } }); } catch {}
        await publishNextPlannedAction({ workflowState, workflowContext, workflowPolicy, audit, pluginContext });
      }
      return { outcome: "executed", envelope };
      ```
    - commit 분기에서 envelope.ok 후 처리 보강 (line 210-221) — F15 반영:
      - `publishPushApprovalIfNeeded` 호출 유지 (remote 없는 fresh repo면 자연스럽게 null 반환 → noop)
      - 추가: **baseline commit 식별은 `proposal.action === "baseline-commit"`** (F12 — reason 대신). baseline이면 `planBranchProposal` 호출 + `publishNextPlannedAction`.
  - Notes: push와 branch는 우선순위에서 별도 슬롯이라 동시에 set해도 안전. branch 우선순위(2) > push(4)이므로 사용자가 보는 다음 prompt는 branch. baseline commit 후 push 시도는 remote가 없으니 자연스럽게 noop 처리됨 (F15 명시).

#### Phase 3 — Hooks Layer

- [ ] **Task 9**: `resolveApprovalOrRecovery` — init action에도 executor 호출
  - File: `src/hooks/permission-asked.js`
  - Action: line 295-300의 조건
    ```js
    (result.resolution?.actionKind === "commit" || result.resolution?.actionKind === "push")
    ```
    을
    ```js
    (result.resolution?.actionKind === "commit" || result.resolution?.actionKind === "push" || result.resolution?.actionKind === "init")
    ```
    로 변경.
  - Notes: `executeApprovedAction`이 이미 init을 분기 처리 (Task 8) — 이 한 줄 추가로 트리거됨.

- [ ] **Task 10**: `tool.execute.before` — bash+git 차단 (F2/F3/F7/F8 반영)
  - File: `src/hooks/tool-execute-before.js`
  - Action:
    - hook factory 시그니처 확장: `createToolExecuteBeforeHook({ workflowState, pluginContext })` — `pluginContext.directory`를 closure로 보존
    - import `looksLikeGitCommand` from `../services/workflow/looks-like-git-command.js` (Task 1b)
    - import `existsSync` from `node:fs`, `join` from `node:path`
    - 검사 순서는 **TD #1에 명시된 그대로** (state.commandName 게이트와 독립):
      ```js
      if (input.tool === "question") return;  // 기존 통과
      if (input.tool === "bash" && looksLikeGitCommand(input.args?.command)) {
        const state = workflowState?.get?.(input?.sessionID);
        const initPending = state?.initProposal != null;
        const initActive = state?.approvalCurrent?.actionType === "init";
        const dirIsGit = (() => { try { return existsSync(join(pluginContext?.directory ?? "", ".git")); } catch { return true; } })();  // fs 에러 시 false-positive 방지 위해 차단 안 함
        if (initPending || initActive || !dirIsGit) {
          throw new Error(BASH_GIT_BLOCK_MESSAGE);  // BASH_GIT_BLOCK_MESSAGE는 모듈 상수, TD #3과 byte-for-byte 동일
        }
      }
      // 이후 기존 MUTATING_TOOLS 가드 (state.commandName 게이트 유지)
      ```
    - `BASH_GIT_BLOCK_MESSAGE` 상수는 **TD #3의 canonical 메시지를 그대로 복사**. inline 재명세 금지 — TD #3 변경 시 이 상수도 동기화 (regression test가 양쪽을 byte-for-byte 비교).
  - Notes:
    - **`src/index.js` 부트스트랩 호출 지점 변경은 별도 Task 10b에서 처리** (G2 반영).
    - bash 외 tool (예: shell) 확장은 향후 작업. 일단 bash 한정.

- [ ] **Task 10b**: `src/index.js` — `createToolExecuteBeforeHook`에 `pluginContext` 주입 (G2 반영, **load-bearing**)
  - File: `src/index.js`
  - Action: line 288 근처
    ```js
    "tool.execute.before": createToolExecuteBeforeHook({ workflowState }),
    ```
    을
    ```js
    "tool.execute.before": createToolExecuteBeforeHook({ workflowState, pluginContext }),
    ```
    로 변경. `pluginContext`는 이미 같은 함수 스코프에서 정의되어 있으므로 추가 import 불필요.
  - Notes: 이 task가 누락되면 `pluginContext.directory`가 undefined 상태로 `.git` 존재 fallback이 침묵히 무력화됨 (G2의 silent disable 시나리오). regression test에 hook factory 시그니처/주입 검증 케이스 추가 권장 (Task 11에서 함께).

#### Phase 4 — Tests

- [ ] **Task 11**: regression.test.js 갱신 (F7 일관성)
  - File: `tests/regression.test.js`
  - Action:
    - **bash 차단 메시지는 TD #3의 canonical 문자열과 비교** — 테스트 파일에는 expected 값을 inline 리터럴로 작성하되 spec과 byte-for-byte 일치 검증
    - 추가 케이스: init pending state inject + bash tool input 통과 → throw 검증
    - 추가 케이스: `.git` 없는 디렉토리 + workflow 미감지 세션 + bash+git → throw 검증 (F2/F3 race-safe 경로)
    - 추가 케이스: workflow 활성 + branch 정상 + non-git bash 명령 → 통과 검증 (false positive 회귀 방지)
    - 기존 contract 메시지 (`"Git workflow guard: create or switch to branch..."`)와 새 메시지가 별도로 fire되는지 검증
    - dist/src parity 검증은 이미 있음 — Task 14에서 npm run build 실행
  - Notes: spec과 코드의 메시지 drift를 막기 위해, 가능하면 src/hooks/tool-execute-before.js의 export된 상수 `BASH_GIT_BLOCK_MESSAGE`를 import해서 비교 (single source of truth).

- [ ] **Task 12**: scenario-readiness-not-initialized.test.js 확장
  - File: `tests/e2e/scenario-readiness-not-initialized.test.js`
  - Action: 다음 3개 케이스 추가
    - **Case "bashGitBlockedWhileInitPending"**: bootstrap → command.executed → init proposal 발행 확인 → handlers["tool.execute.before"]({ tool: "bash", args: { command: "git status" }, sessionID }) → throw assertion
    - **Case "initAcceptCreatesGitDir"**: temp 워크스페이스 → command.executed → init prompt 발행 → question.replied with "Initialize Git (Recommended)" → assert that `${directory}/.git` 디렉토리가 존재
    - **Case "initAcceptPublishesBaselineCommit"**: 위 흐름에 이어 baseline commit prompt가 mock.prompts에 추가됨 검증 (header "Finalize Changes" 또는 commit용 header)
  - Notes: real git binary 사용 (`initializeGit: false` 옵션은 createTempWorkspace에 이미 있음).

- [ ] **Task 13**: 신규 scenario-init-chain.test.js
  - File: `tests/e2e/scenario-init-chain.test.js` (NEW)
  - Action: 풀 체인 e2e 시나리오
    1. createTempWorkspace({ initializeGit: false }) 
    2. bootstrapPlugin → handlers
    3. command.executed → /bmad-bmm-create-prd → init prompt 검증
    4. question.asked → question.replied("Initialize Git (Recommended)")
    5. `.git` 디렉토리 존재 + `.gitignore` 파일 존재 + 내용 검증 (DEFAULT_GITIGNORE_LINES 포함)
    6. mock.prompts에 baseline commit prompt 추가됨 검증
    7. question.asked → question.replied(commit accept token)
    8. `git log` 실제 실행으로 "Initial commit" 메시지 검증 (또는 commit-service의 envelope로 검증)
    9. mock.prompts에 branch proposal prompt 추가됨 검증 (header "Create Branch")
  - Notes: helpers.js의 runScenario 패턴 사용. 실제 git binary 사용.

#### Phase 5 — Build & Verify

- [ ] **Task 14**: dist 재생성
  - File: `dist/devai-aidd-plugin.js`
  - Action: `npm run build` 실행
  - Notes: src/dist parity 회귀 테스트가 통과해야 함.

- [ ] **Task 15**: 전체 테스트 sweep
  - Action: `npm test` 실행 → 모든 케이스 통과 확인
  - Notes: 실패 시 root cause 분석 후 수정. 특히 기존 e2e의 deny/recovery 경로가 init proposal 정리 변경(Task 6)에 영향받는지 확인.

### Acceptance Criteria

#### A. Bash+git 차단 (Phase 3)

- [ ] **AC1**: Given init proposal이 pending이고 readiness가 "ask/git-not-initialized"인 세션, when 모델이 `bash` 도구로 `git status`를 호출, then `tool.execute.before` 훅이 TD #3의 canonical contract 메시지로 throw한다.
- [ ] **AC1b**: Given workflow 미감지 세션 + `.git` 없는 디렉토리 (race-safe 경로, F2/F3), when `bash` 도구로 `git status` 호출, then 동일하게 throw한다 (commandName 게이트 미요구).
- [ ] **AC1c**: Given init proposal이 promote되어 `approvalCurrent.actionType === "init"`이고 `initProposal` slot이 비워진 직후 상태, when bash+git 호출, then throw한다 (F16 mitigation).
- [ ] **AC1d**: Given `looksLikeGitCommand`의 모든 패턴 케이스 (단순 `git`, `& git`, 절대 경로 `C:\...\git.exe`, `cmd /c git`, `bash -c "git"`, `pwd && git`, `GIT_TERMINAL_PROMPT=0 git`), when 단위 테스트 실행, then 모두 true 반환. 비-git 케이스 (`digit`, `gitea`, `magit`, `gitlab`)는 false 반환.
- [ ] **AC2**: Given init proposal이 pending이 아니고 디렉토리가 git repo (`.git` 존재)인 세션, when 동일 bash+git 호출, then 차단 없이 통과한다 (false positive 없음).
- [ ] **AC3**: Given init proposal이 pending인 세션, when `bash` 도구로 `ls`, `pwd` 등 non-git 명령 호출, then 차단되지 않는다.
- [ ] **AC4**: Given regression suite, when 차단 contract 메시지 검증 실행, then `tool-execute-before.js`의 export된 `BASH_GIT_BLOCK_MESSAGE` 상수가 TD #3의 canonical 문자열과 byte-for-byte 동일하며 throw된 Error의 message 필드와 정확히 일치한다.
- [ ] **AC4b** (G2 반영): Given bootstrap된 plugin instance, when `tool.execute.before` hook factory 호출 시그니처 검증, then `pluginContext`가 인자로 전달되어 hook closure에서 `pluginContext.directory` 접근 가능해야 한다. (regression test: `src/index.js`의 hook 등록 라인을 정적으로 grep해 `pluginContext` 인자 포함 검증, 또는 hook을 빈 `pluginContext`로 호출 시 `.git` fallback이 침묵히 noop되지 않는지 동작 검증.)

#### B. 자동 init 실행 (Phase 2)

- [ ] **AC5**: Given non-git 디렉토리 + init proposal pending, when 사용자가 "Initialize Git (Recommended)" 응답 → `permission.asked` 또는 `question.replied` 라우팅, then `executeApprovedAction`이 `executeInit`을 호출하여 실제 `git init` 명령이 디렉토리에서 실행된다.
- [ ] **AC6**: Given AC5 실행 직후, when 디렉토리 검사, then `${directory}/.git/` 디렉토리가 존재한다.
- [ ] **AC7**: Given AC5 실행 직후 + 기존 `.gitignore` 없음, when 디렉토리 검사, then `${directory}/.gitignore`가 작성되고 `DEFAULT_GITIGNORE_LINES`의 모든 항목을 포함한다.
- [ ] **AC8**: Given AC5 시점에 이미 `.gitignore` 존재 (사용자 작성), when init 실행 완료, then 기존 `.gitignore`는 수정/덮어쓰기 되지 않는다 (idempotent).
- [ ] **AC9**: Given `executeInit` 호출 중 git binary 부재 또는 IO 에러, when envelope 평가, then `envelope.ok === false`로 표준 실패 envelope이 반환된다. audit `git.action.executed` 발행은 best-effort 정책 — emit이 attempted된다는 사실까지 검증 (mock audit sink로 호출 횟수 ≥ 1 확인). emit 자체의 성공/실패는 단언하지 않음 (logger throw 시 swallow되는 contract).
- [ ] **AC9b** (G1 반영): Given `executeInit`이 `envelope.ok === false`를 반환, when chain 평가, then `initProposal` slot은 **clear되지 않고 그대로 남는다**. `permission-asked.js`의 `openRecoveryFromExecution`이 recovery gate를 열고, 사용자가 "Retry" 선택 시 publishNextPlannedAction이 동일 `initProposal`을 재발행할 수 있다.

#### C. Baseline commit chain (Phase 2)

- [ ] **AC10**: Given AC5 성공 (git init 완료), when post-init chain 실행, then `commitProposal` slot이 `{ kind: "commit", action: "baseline-commit", message: "Initial commit", files: [...] }`로 세팅된다.
- [ ] **AC11**: Given AC10 직후, when `publishNextPlannedAction` 호출, then commit approval request가 발행되고 `mock.prompts`에 추가되며 `git.action.planned` 감사 이벤트가 발행된다. **load-bearing 단언은 `details.kind === "commit"`과 `details.action === "baseline-commit"`만 검증**. `workflow`/`command` 등 컨텍스트 필드는 별도 단언하지 않는다 (G3 — init 시점 approvalRequest에 해당 필드가 보장되지 않으므로 over-spec 회피).
- [ ] **AC12**: Given baseline commit prompt에 대해 사용자가 accept 응답, when chain 진행, then `executeCommit`이 실행되어 `git add` + `git commit -m "Initial commit"`이 실제 수행된다 (실제 git binary 검증).
- [ ] **AC13**: Given AC12 성공, when post-commit chain 실행, then `branchProposal` slot이 evaluateBranchStrategy 결과에 따라 세팅되고 다음 publish가 발생한다.

#### D. Deny/ignore 정리 (Phase 2)

- [ ] **AC14**: Given init proposal pending, when 사용자가 "Cancel" 응답 (`parseApprovalAnswerOutcome` → `APPROVAL_OUTCOMES.DENY`로 정규화, TD #4 참조), then `consumeApprovalOutcome`의 `isTerminalSkip` 분기가 `proposalCleanup.initProposal = null` 적용해 slot이 clear되며 같은 세션의 다음 planning 패스에서 재발행되지 않는다.
- [ ] **AC15**: Given init proposal pending, when ignore-and-continue 응답 (있을 시), then 동일하게 `initProposal` slot이 clear된다.

#### E. Native event path parity (Phase 3+4)

- [ ] **AC16**: Given native `command.executed` event → init prompt → `question.asked` → `question.replied`, when chain 진행, then legacy `permission.asked` 경로와 동일하게 `git init` 실행 + baseline commit publish + branch publish가 발생한다 (양쪽 경로 동작 동등성).

#### F. 회귀 보호

- [ ] **AC17**: Given 기존 `tests/regression.test.js`의 모든 케이스, when 전체 sweep 실행, then 0개 회귀 (workflow guard contract 메시지 byte-for-byte 유지).
- [ ] **AC18**: Given 기존 `tests/e2e/*.test.js` 모든 시나리오 (deny-recovery, file-edited-tracking, workflow-detection), when sweep 실행, then 0개 회귀.
- [ ] **AC19**: Given `npm run build` 실행 후, when `dist/devai-aidd-plugin.js`와 src 비교, then parity 검증 통과.

## Additional Context

### Dependencies

- 외부 npm 의존성 추가 없음
- Node.js `node:fs/promises`로 .gitignore 작성
- 기존 `node:child_process` execFile/execFileSync로 git 호출

### Testing Strategy

- **확장**: `tests/e2e/scenario-readiness-not-initialized.test.js`
  - Case 1: init pending 상태에서 bash로 `git status` 호출 → throw 검증 (메시지 byte-for-byte)
  - Case 2: init accept → `.git` 디렉토리 실제 생성 검증 (실제 git binary 사용)
  - Case 3: init accept 후 baseline commit proposal이 promptAsync로 발행됨 검증
- **신규**: `tests/e2e/scenario-init-chain.test.js`
  - Case 1: non-git 워크스페이스 → `/bmad-*` 발행 → init prompt → "Initialize Git (Recommended)" 선택 → `git init` 실행 + .gitignore 생성 → baseline commit prompt 발행 → accept → 실제 commit 생성 → branch proposal 발행 검증
  - Case 2: init deny → recovery gate 발생 (기존 deny 흐름) — 새 동작 추가 없이 회귀만 보장
- **regression.test.js**: bash 차단 contract 메시지 byte-for-byte 비교

### Notes

#### 작업 환경

- 현재 작업 브랜치: `fix/change-event-name`
- 미커밋 파일 다수 존재 (native event refactor 잔재) — 구현 시 변경 영역 충돌 주의
- 사용자 환경: Windows / PowerShell. `git init` 실행 시 cwd 처리 주의 (execFileSync의 `cwd` 옵션 사용)

#### 위험 항목 (Pre-mortem)

- **R1: bash 차단 false positive** — `looksLikeGitCommand` regex가 `digit` 같은 단어를 git으로 오인할 가능성. mitigation: word boundary `\b`로 단어 경계 매칭하되, 시작 토큰 한정 (`^\s*(?:&\s*)?git\b`)으로 좁힘.
- **R2: chain 도중 readiness 갱신 누락** — init 후 readiness 재호출이 누락되면 branch planning 시 여전히 "ask" 상태로 인식되어 무한 루프. mitigation: Task 8 step 2에서 명시적으로 readiness 재호출.
- **R3: 미커밋 native event 작업과 머지 충돌** — `permission-asked.js`와 `tool-execute-before.js`가 둘 다 작업 중. mitigation: Task 9, 10 적용 시 충돌 라인 신중하게 확인.
- **R4: dist parity 회귀** — src/dist 비교 회귀 테스트가 있어 `npm run build`를 빼먹으면 fail. mitigation: Task 14를 명시적인 단계로 분리.
- **R5: .gitignore 작성 시 권한 문제** — 일부 환경에서 writeFile이 실패할 수 있음. mitigation: try/catch로 best-effort 처리, envelope.ok에 영향 없음.
- **R6: 사용자 alias / wrapper script 우회** — `gh` → `git` 위임이나 사용자 alias로 git을 호출하면 `looksLikeGitCommand`가 못 잡음. mitigation: 본 spec 범위 밖. 향후 alias 사전 등록 또는 PATH inspection으로 확장 가능. F8 잔여 위험.
- **R7: pluginContext.directory 부재** — `tool-execute-before.js`가 `pluginContext`를 주입받지 못한 경우 `.git` 체크가 noop. mitigation: bootstrap에서 항상 pluginContext 주입 보장 (src/index.js 수정). hook factory에서 defensive `pluginContext?.directory` 사용.
- **R8: `proposal.action === "baseline-commit"` discriminator drift** — Task 3에서 명시했지만 향후 generic commit proposal에서 동일 값이 set되면 chain이 잘못 트리거. mitigation: build-baseline-commit-proposal builder만 이 값을 set하도록 single-writer 규약 유지 + regression test에서 외부에서 동일 값을 set하지 않는지 grep 검증.

#### 알려진 한계

- baseline commit message는 하드코딩 "Initial commit". 사용자 커스터마이즈는 미지원 (out of scope).
- .gitignore 템플릿은 Node.js 프로젝트 친화적. 다른 스택은 사용자가 수정해야 함.
- branch planning chain은 baseline commit 후에만 동작. baseline commit이 deny되면 branch evaluation도 진행되지 않음 (기존 동작과 동일).

#### Future Considerations (out of scope)

- 자동 init 모드 (사용자 승인 없이 자동으로 init 수행) — 별도 정책 옵션으로 추후 검토 가능
- .gitignore 템플릿 선택 UI (Python/Java/Go 등) — 별도 elicitation flow 필요
- 모델 지시문(promptAsync) phrasing 추가 강화 — 이번 spec과 호환 가능한 후속 작업

#### Review Notes (Step 6)

Adversarial code review completed against the implementation diff. 21 findings total. Auto-fix applied to High severity items only (user choice).

**Fixed (5)**:

- **F1** `looks-like-git-command.js:26` — `CHAINED_SHELL_PATTERN` 확장: `\n`과 `(`를 boundary 문자 집합에 추가. heredoc/`$()`/`<()` bypass 차단.
- **F2** `execute-approved-action.js:413+` — post-baseline `planBranchProposal`에 `currentBranch`를 `state.readiness.details.branch`에서 가져옴. evaluateBranchStrategy가 실제 브랜치 인지.
- **F4** `execute-approved-action.js:304+` — post-init `publishNextPlannedAction`에 `phase: "in-progress"`로 갱신된 workflowContext 전달. 다운스트림 phase 게이팅 정합성.
- **F5** `tool-execute-before.js:18+` — `directoryIsGitRepo`가 directory 없거나 fs throw 시 `false`(차단) 반환. wiring regression 시 silent fail-open 방지.
- **F6** `execute-approved-action.js:207+` — `executeInit` 호출을 try/catch로 감쌈. throw 시 synthetic failure envelope 반환 → recovery gate가 정상적으로 열림.

**Skipped (16)**:

- **F3** (High, noise) — 재검토 결과 audit ordering은 이미 올바름 (`workflowState.set` → `audit.info("git.action.planned")` → `publishNextPlannedAction`). 리뷰어 미독해.
- F7~F15 (Medium 9): 정답이 trade-off이거나 별도 결정 필요. 후속 cycle로.
- F16~F20 (Low 5): non-load-bearing 또는 cosmetic.
- F21 (Note): 정적 grep을 런타임 검증으로 강화 — 추후 enhancement.

**Verification after fixes**:

- `npm run build` ✅ — dist 478.1kb
- `npm test` ✅ — 15 e2e 시나리오 + regression 모두 통과

#### 아키텍처 메모

- 모든 새 로직은 native event 경로와 legacy path 양쪽에서 동작해야 함 — services 레이어에 두면 자연스럽게 양쪽에서 사용됨.
- `git-executor.js`의 ACTION_KINDS에 이미 "init"이 있음 → executor 계약 변경 없이 확장 가능.
- audit 이벤트 names는 기존 패턴 유지: `git.action.planned` (kind: init), `git.action.executed` (kind: init), `approval.requested/resolved` 등.
- chain post-execution은 `execute-approved-action.js`에 집중 — 기존 `publishPushApprovalIfNeeded` 패턴 미러로 일관성 유지.
