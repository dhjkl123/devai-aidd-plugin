---
title: 'Approval prompt instruction 강화 — git init 외 시점의 강한 instruction 패턴 확산'
slug: 'strengthen-approval-prompt-instructions'
created: '2026-05-11'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
implementation_baseline_commit: '2b793efe011982f9458ad25b05c3ec59a6a7f1ca'
implementation_date: '2026-05-11'
implementation_review_findings_total: 20
implementation_review_findings_fixed: 0
implementation_review_findings_skipped: 20
implementation_review_approach: 'skip'
tech_stack:
  - 'Node.js 22'
  - 'ESM JavaScript'
  - 'esbuild bundle'
  - 'plain node:assert tests'
  - 'opencode native plugin event API'
files_to_modify:
  - 'src/services/approval/build-question-instruction.js (NEW)'
  - 'src/index.js'
  - 'src/services/approval/permission-asked-aliases.js'
  - 'tests/unit/build-question-instruction.test.js (NEW)'
  - 'tests/e2e/scenario-init-chain.test.js'
code_patterns:
  - 'requestApproval 어댑터가 promptAsync 채널의 단일 진입점 — instruction prepend 패턴'
  - 'output.parts.push는 command.execute.before에서만 가능한 동기 강제 주입'
  - 'proposal.kind + proposal.action 디스크리미네이터로 시점 분기 (baseline-commit vs commit 등)'
  - 'pluginContext.debug.log에 header/options/textPreview 로그 (command-execute-before.js 패턴)'
test_patterns:
  - '레거시 instruction 빌더와 동일한 옵션 라벨/순서 검증'
  - 'pure builder 단위 테스트 + dist parity (npm run build) 회귀'
---

# Tech-Spec: Approval prompt instruction 강화 — git init 외 시점의 강한 instruction 패턴 확산

**Created:** 2026-05-11

## Overview

### Problem Statement

devai-aidd-plugin은 opencode native plugin runtime에서 직접 UI 다이얼로그를 띄울 클라이언트 API가 없어, 모델에게 "question 도구로 사용자에게 물어봐"라는 instruction을 주입해 모델이 native `question` tool을 호출하도록 유도한다.

`git init` 시점은 `src/hooks/command-execute-before.js`의 `buildStartInstructionText`가 `output.parts.push`로 강한 instruction(헤더 + 정확한 옵션 라벨 + "Do not continue before...")을 동기 주입하므로 모델이 반드시 first response에서 question 도구를 호출한다. 다이얼로그가 즉시 뜸.

반면 baseline commit / branch / finalize commit / push 시점은 `src/index.js:requestApproval`이 `client.session.promptAsync`로 instruction을 비동기 큐잉하는데, 현재 instruction은 매우 약하다:

```
Ask the user with the question tool. Header: "Finalize Changes".
Options: "Approve (Recommended)", "Deny", "Ignore and continue".
```

이 텍스트는 모델이 question 도구 호출을 지연하거나 생략해도 안전하다는 신호를 준다. 그 결과 사용자에게 다이얼로그가 늦게 뜨거나, 모델이 자체 텍스트 응답으로 대체해버리는 일이 발생한다.

레거시 `docs/legacy/devai-git-workflow.js`의 instruction 빌더들(`buildBaselineCommitQuestionInstruction`, `buildMergeBranchQuestionInstruction`, `buildWorkflowFinishInstruction`, `buildWorkflowStartInstruction`)은 시점별로 헤더/옵션/강제 문구를 명시한다 — 그리고 그 버전에서는 UI 다이얼로그가 정상적으로 떴다.

### Solution

`requestApproval` 어댑터가 사용하는 nativeInstruction을 시점별로 강하게 빌드하는 pure builder `src/services/approval/build-question-instruction.js`를 신설한다. 빌더는 `{ commandName, actionType, proposal }`를 받아 다음 형식의 instruction을 반환:

```
Ask the user the `Create Baseline Commit` question with these exact options:
1. `Create Baseline Commit (Recommended)`
2. `Cancel`
If the user chooses Create Baseline Commit, create the initial commit before continuing.
Do not continue the workflow before the user answers this question.
```

`src/index.js:requestApproval`에서 신규 빌더를 호출해 nativeInstruction을 대체한다. 현재의 single-line "Ask the user with the question tool..." 라인은 사라지고, 빌더가 반환한 multi-line 강제 instruction이 promptText 맨 앞에 위치한다.

다이얼로그 헤더도 시점별로 분리한다:
- `init` → "Initialize Git" (기존, 변경 없음)
- `commit + baseline-commit` → "Create Baseline Commit" (신규 분리)
- `branch + create` → "Create Branch"
- `branch + switch` → "Switch Branch"
- `commit + commit` → "Finalize Changes"
- `push + push` → "Push Changes" (Finalize Changes에서 분리)

debug 로그도 `command-execute-before.js`의 start instruction 로그 패턴을 따라 header/options/textPreview를 항상 기록.

### Scope

**In Scope:**

- 신규 `src/services/approval/build-question-instruction.js` — pure builder, 4개 시점 모두 커버
- `src/index.js:requestApproval` 수정 — 신규 빌더 호출 + 헤더 분리 + 옵션 라벨 분리 + debug 로그 보강
- Create Baseline Commit (commit + baseline-commit) 강한 instruction
- Create Branch (branch + create) 강한 instruction
- Switch Branch (branch + switch) 강한 instruction — 부수 효과(branch action="switch" 케이스 커버)
- Finalize Changes (commit + commit) 강한 instruction
- Push Changes (push + push) 강한 instruction — 헤더 "Finalize Changes"에서 "Push Changes"로 분리
- `tests/unit/build-question-instruction.test.js` 신규 — 시점별 instruction 텍스트 + 옵션 라벨 단위 테스트
- `npm run build` 후 `dist/devai-aidd-plugin.js` 재생성 + 사용자 환경 plugins 디렉토리로 복사

**Out of Scope:**

- 감지/트리거 로직이 없는 시점(Existing Branch — 후보가 실제로 존재하는지 확인하는 detection, Long-Lived Branch Warning — main/master + unmanaged changes detection, Resume Workflow — saved state detection, Merge Branch — finalize 후 merge 단계 추가) 신규 구현. **현 시점에는 detection이 없으므로 instruction만 만들어도 trigger되지 않음.** 후속 spec에서 detection 추가 시 동일 패턴으로 확장.
- `requestRecoveryDecision` 강화 — recovery prompt는 별도 빌더(`buildRecoveryPrompt`)가 이미 있고 본 spec의 강한 instruction 패턴과 무관
- `command.execute.before` 시점의 baseline-commit 동기 주입(post-init chain 결과로 다시 commandExecuteBefore가 트리거되지 않음 — execute-approved-action.js의 publishNextPlannedAction 경로로만 진입) — promptAsync 강화로 충분
- 신규 워크플로 phase 도입, audit 이벤트 신규 추가, recovery 로직 변경
- `dist/devai-aidd-plugin.js` 직접 편집 (npm run build로 자동 생성)
- `docs/legacy/devai-git-workflow.js` 자체 수정 (참고용)

## Context for Development

### Codebase Patterns

- **Bootstrap closure**: `src/index.js:DevaiAiddGuardPlugin`이 `pluginContext`를 생성. `pluginContext.requestApproval`이 promptAsync 채널의 단일 진입점 — 모든 actionType의 approval prompt가 이 어댑터를 통과한다.
- **Instruction prepend 패턴**: 현재 `requestApproval` 내부에서 `nativeInstruction + "\n\n" + bodyText`로 promptText 조립 (src/index.js:202-211). 빌더 결과를 `nativeInstruction` 위치에 넣으면 채널/조립 로직 변경 없이 강도만 끌어올릴 수 있음.
- **Pure builder 컨벤션**: `build-approval-explanation.js`, `build-approval-request.js`, `build-recovery-prompt.js` 등 builder는 모두 순수 함수 + named export. 신규 `build-question-instruction.js`도 동일 패턴.
- **proposal.action 디스크리미네이터**: `build-init-proposal.js:67`의 `action: "baseline-commit"`이 일반 commit과 baseline commit을 구분하는 single source. 빌더는 `proposal.action`을 우선 분기 키로 사용. `proposal.kind + actionType`은 보조.
- **Debug 로그 형식**: `command-execute-before.js:216-229`의 start instruction 로그 — `sessionID`, `commandName`, `textLength`, `textPreview: text.slice(0, 200)` 패턴. requestApproval 로그(src/index.js:239-245)도 같은 패턴 따르되 header/options 추가.
- **native question 라우팅**: 모델이 `question` tool 호출 → opencode runtime이 `question.asked` event 발행 → `native-event.js:handleQuestionAsked`가 sessionID + questionID로 pending approval과 매칭. 헤더 값 자체는 라우팅 키가 아니며 디버그 식별용. 그러나 우리가 instruction에서 "Header: 'Create Baseline Commit'"이라고 명시하면 모델이 question 도구에 그 헤더를 그대로 전달하므로 `event.properties.header`로 캡처 가능.
- **APPROVAL/DENY 토큰 normalization**: `native-event.js:201-227`의 `APPROVAL_ANSWER_TOKENS` / `DENY_ANSWER_TOKENS` / `IGNORE_ANSWER_TOKENS`. instruction의 옵션 라벨이 어떤 토큰으로 normalize되는지 확인 필수. `"create baseline commit"` 등 신규 라벨은 토큰 셋에 없으므로 정확한 분기 위해 라벨 끝의 `(Recommended)`만 떼고 비교하는 `normalizeAnswerKey`가 결과적으로 `"create baseline commit"` 키를 만들어 ACCEPT alias 매핑이 필요할 수 있음 — TD #4에서 처리.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/index.js` | `requestApproval` 어댑터 — 변경 지점 (header/options/instruction 분기) |
| `src/hooks/command-execute-before.js` | git init용 강한 instruction 패턴 레퍼런스 (`buildStartInstructionText`) |
| `src/hooks/native-event.js` | `summarizeEventProps`, `APPROVAL_ANSWER_TOKENS` — 옵션 라벨이 매핑되는 alias 셋 |
| `src/services/approval/permission-asked-aliases.js` | `APPROVAL_OUTCOME_ALIASES` / `RECOVERY_CHOICE_ALIASES` — 신규 라벨 alias 추가 위치 |
| `src/services/approval/publish-next-planned-action.js` | 어디서 `requestApproval`이 호출되는지(line 158-160) + `approvalRequest` 인자 구조 |
| `src/services/approval/build-approval-request.js` | `approvalRequest.actionType` / `proposal` 필드 모양 |
| `src/services/git/branch-service.js:223-255` | branchProposal action 값 `"create"` vs `"switch"` 분기 조건 |
| `src/services/git/build-init-proposal.js:67` | baseline commit proposal action 값 `"baseline-commit"` (single writer) |
| `src/services/workflow/commit-proposal.js:87` | 일반 commit proposal action 값 `"commit"` |
| `src/services/git/push-service.js:59-60` | push proposal action 값 `"push"` |
| `docs/legacy/devai-git-workflow.js:903-1114` | 레거시 instruction 빌더 5종 (Initialize/Baseline/Merge/Start/Finish) — 옵션 라벨 + 강제 문구 출처 |
| `_bmad-output/implementation-artifacts/tech-spec-strengthen-git-init-proposal.md` | 산출물 형식 + 강한 instruction 명세 패턴 |

### Technical Decisions

1. **빌더 시그니처 — single-entry switch on actionType + proposal.action** (CANONICAL)

   ```js
   // src/services/approval/build-question-instruction.js
   export function buildQuestionInstruction({ commandName, actionType, proposal }) {
     // returns { header, options, instructionText }
   }
   ```

   - 반환 객체는 3-tuple: `header` (string), `options` (string[]), `instructionText` (string, multi-line, "\n" join).
   - `requestApproval`은 `header`로 `questionHeader` metadata 채우고, `options`로 옵션 라벨 metadata 채우고, `instructionText`를 promptText 맨 앞에 prepend.
   - 분기 키 우선순위 (**adversarial F1 반영** — actionType은 `classify-git-action.js:26-32`의 slash-segmented 값):
     1. `actionType === "init"` → "Initialize Git" (기존 동작 — output.parts와 별개로 promptAsync 채널에서도 일관성 유지)
     2. `actionType === "commit" && proposal?.action === "baseline-commit"` → "Create Baseline Commit"
     3. `actionType === "commit"` (proposal.action !== "baseline-commit", **null/undefined 포함**) → "Finalize Changes" (**adversarial F7 결정**)
     4. `actionType === "branch/create"` → "Create Branch"
     5. `actionType === "branch/switch"` → "Switch Branch"
     6. `actionType === "push"` → "Push Changes"
     7. fallback → 시점별 minimal header preserve(actionType별 default header) + generic 옵션. 완전 unknown actionType만 "Approval Required" (**adversarial F4 반영**)
   - `proposal`이 null이면 priority 1-7의 actionType 매칭이 통과한 항목으로 진입하되 instruction 본문의 `proposal.name`/`proposal.action` 참조는 defensive guard로 처리 (예: `proposal?.name || "workflow"`).
   - `commandName`이 falsy면 leading "Git workflow guard..." 헤더 라인을 생략.
   - **defensive normalization (adversarial F2 mitigation)**: builder 진입 시 `commandName = String(commandName ?? "").trim().replace(/^\/+/, "")` 적용. `detect-workflow-context.js:21-23`의 `normalizeCommandName`이 이미 strip하므로 정상 경로에선 noop이지만, raw command가 우회 경로로 들어와도 `/${commandName}` 인터폴레이션이 `//bmad-...` 더블슬래시를 만들지 않음.
   - **현재 코드의 latent bug 동반 수정 (adversarial F1)**: 기존 `src/index.js:193`의 `request.actionType === "branch"` 분기는 영원히 매칭 안 됨(actionType은 `"branch/create"` 또는 `"branch/switch"`). 빌더로 대체되면서 자연스럽게 fix.

2. **시점별 instruction 텍스트** (load-bearing — byte-for-byte 명세)

   레거시의 옵션 라벨/순서를 그대로 가져오되, 끝에 "Do not continue before the user answers..." 강제 문구를 일관 적용. 모든 텍스트는 multi-line이며 `.join("\n")` 형식. 첫 줄은 항상 컨텍스트("Git workflow guard is active for /${commandName}." 또는 시점 설명), 다음 줄에 옵션 라벨 enumeration, 마지막에 강제 문구.

   **시점 A: Create Baseline Commit (commit + baseline-commit)**
   ```
   Git workflow guard is active for /${commandName}.
   This workflow cannot continue yet because /${commandName} is in a git repository without an initial commit.
   Ask the user the `Create Baseline Commit` question with these exact options:
   1. `Create Baseline Commit (Recommended)`
   2. `Cancel`
   If the user chooses Create Baseline Commit, create the initial commit before asking for a branch name or starting implementation.
   Do not continue the workflow or run other tools before the user answers this question.
   ```

   **시점 B: Create Branch (branch + create)**
   ```
   Git workflow guard is active for /${commandName}.
   This workflow needs a dedicated branch before continuing.
   Ask the user the `Create Branch` question with these exact options:
   1. `Approve (Recommended)`
   2. `Deny`
   3. `Ignore and continue`
   Suggested branch name: `${proposal.name || "workflow"}`.
   If the user chooses Approve, create the branch with the suggested name only after that approval.
   Do not run git or modify files before the user answers this question.
   ```

   **시점 C: Switch Branch (branch + switch)**
   ```
   Git workflow guard is active for /${commandName}.
   This workflow expects a different branch than the current one.
   Ask the user the `Switch Branch` question with these exact options:
   1. `Approve (Recommended)`
   2. `Deny`
   3. `Ignore and continue`
   Target branch: `${proposal.name || "workflow"}`.
   If the user chooses Approve, switch to the target branch only after that approval.
   Do not run git or modify files before the user answers this question.
   ```

   **시점 D: Finalize Changes (commit + commit)**
   ```
   Git workflow guard is active for /${commandName}.
   The workflow has produced changes that need a commit before finishing.
   Ask the user the `Finalize Changes` question with these exact options:
   1. `Approve (Recommended)`
   2. `Deny`
   3. `Ignore and continue`
   If the user chooses Approve, commit the staged changes only after that approval.
   Do not run git or modify files before the user answers this question.
   ```

   **시점 E: Push Changes (push + push)**
   ```
   Git workflow guard is active for /${commandName}.
   The committed changes are ready to push to the remote.
   Ask the user the `Push Changes` question with these exact options:
   1. `Approve (Recommended)`
   2. `Deny`
   3. `Ignore and continue`
   If the user chooses Approve, push the current branch and set the upstream if needed.
   Do not run git or continue the workflow before the user answers this question.
   ```

   **시점 F: Initialize Git (init) — promptAsync 채널 동등 형식**
   ```
   Git workflow guard is active for /${commandName}.
   This workflow cannot continue yet because /${commandName} is running in a directory that is not a git repository.
   Ask the user the `Initialize Git` question with these exact options:
   1. `Initialize Git (Recommended)`
   2. `Cancel`
   If the user chooses Initialize Git, run `git init` only after that approval.
   Do not ask for a branch name or continue implementation before the git-init decision is made.
   ```
   - `command-execute-before.js`의 output.parts.push 경로(기존, 변경 없음)와 별개로 promptAsync 채널에서도 동일 instruction 보장. 우회 race 시 두 채널이 일관된 메시지 전달.

3. **옵션 라벨 → APPROVAL_OUTCOME_ALIASES alias 추가** (load-bearing, Step 2 확정)

   `native-event.js:normalizeAnswerKey` → 끝의 `(Recommended)` 제거 + lowercase + hyphen→space 변환. `parseApprovalAnswerOutcome`는 (1) `APPROVAL_OUTCOME_ALIASES`(`permission-asked-aliases.js`) 우선 → (2) `APPROVAL_ANSWER_TOKENS`/`DENY_ANSWER_TOKENS`/`IGNORE_ANSWER_TOKENS` 셋(`native-event.js`) → (3) hyphen→space 재시도 순.

   **Step 2 검증 결과**:
   - `APPROVAL_OUTCOME_ALIASES`(`permission-asked-aliases.js:28-40`): `accept`/`approve`/`approved`/`allow` → `"accept"`, `cancel` 없음(token 셋에 있음), `deny`/`reject`/`rejected`/`block` → `"deny"`, `ignore`/`ignore-and-continue`/`skip` → `"ignore-and-continue"`
   - `APPROVAL_OUTCOMES.ACCEPT === "accept"`(`approval-resolution-state.js:33`) — alias value가 곧 outcome 상수와 동일 문자열
   - `APPROVAL_ANSWER_TOKENS`(`native-event.js:201-212`): `initialize`, `initialize git`, `yes`, `approve`, `approved`, `allow`, `accept`, `proceed`, `continue`, `ok`
   - `DENY_ANSWER_TOKENS`(`native-event.js:214-221`): `cancel`, `no`, `deny`, `reject`, `block`, `stop` — `"cancel"` 매칭 OK

   **결론**: 추가가 필요한 alias는 **`"create baseline commit": "accept"` 한 개만**. 위치는 `permission-asked-aliases.js`의 `APPROVAL_OUTCOME_ALIASES` (frozen object → Object.freeze 호출 라인에서 spread + 새 키 추가). 그 외 라벨(`Approve (Recommended)`, `Deny`, `Ignore and continue`, `Cancel`)은 기존 매핑이 normalize 후 키와 매칭됨.

4. **header 분리에 따른 metadata 일관성**

   `src/index.js:230-231`의 `metadata.questionHeader` / `metadata.questionOptions`는 빌더가 반환한 `header` / `options`로 채움. native-event.js의 `pendingApprovalQuestion.questionHeader`도 자동으로 새 값을 받음. 다운스트림 알림/감사는 이 metadata를 직접 읽지 않으므로 호환성 영향 없음.

5. **debug 로그 강화** (요청 사항)

   `requestApproval` 내부 로그를 다음 형식으로:

   ```js
   debugLogger.log("requestApproval", "prompt delivered to client.session.promptAsync", {
     actionType: request?.actionType,
     proposalAction: request?.proposal?.action ?? null,
     proposalKind: request?.proposal?.kind ?? null,
     requestId: request?.id,
     header: nativeHeader,           // 빌더가 반환한 header
     options: nativeOptions,          // 빌더가 반환한 options
     instructionLength: instructionText.length,
     instructionPreview: instructionText.slice(0, 200),
     promptTextLength: promptText?.length ?? 0,
   });
   ```

   `command-execute-before.js`의 start instruction 로그와 동일한 키 컨벤션(`textLength`, `textPreview`). native-event.js의 question.asked 로그가 `header`를 캡처하므로 entry/exit 양쪽에서 우리 의도한 header가 찍히는지 검증 가능 (AC).

6. **`approvalRequest.proposal` 접근성** (Step 2 확정)

   `build-approval-request.js:239`이 반환 객체에 `proposal` 필드를 top-level로 노출. `commitProposal`/`branchProposal`/`pushProposal`은 별도 슬롯으로 존재하지 않음 — proposal.kind로만 구분. 빌더는 단순히 `request.proposal`만 읽음.

7. **Fallback 정책 — actionType별 최소한의 header preserve** (adversarial F4 반영)

   빌더의 throw는 일어나면 안 되지만 `requestApproval`의 try/catch는 안전망. throw 시 fallback도 actionType별 default header를 유지해야 init/commit/push 헤더가 generic "Approval Required"로 회귀하지 않음.

   ```js
   const FALLBACK_HEADERS = {
     "init": "Initialize Git",
     "commit": "Finalize Changes",
     "branch/create": "Create Branch",
     "branch/switch": "Switch Branch",
     "push": "Push Changes",
   };
   const fallbackHeader = FALLBACK_HEADERS[request.actionType] || "Approval Required";
   ```

   fallback instructionText는 minimal `Ask the user with the question tool. Header: "${fallbackHeader}". Options: "Approve (Recommended)", "Deny", "Ignore and continue".` 한 줄. 강도는 약하지만 헤더는 보존.

8. **Object.freeze re-assignment 패턴** (adversarial F6 반영)

   `APPROVAL_OUTCOME_ALIASES`는 `Object.freeze({...})`로 frozen. in-place `obj["new"] = "..."`는 strict mode에서 throw, non-strict에서 silent fail. 정확한 형식은 export 라인 자체에 키 추가:

   ```js
   export const APPROVAL_OUTCOME_ALIASES = Object.freeze({
     accept: "accept",
     approve: "accept",
     // ... 기존 키 ...
     "create baseline commit": "accept",  // 신규 추가
   });
   ```

   별도 spread 재할당 패턴은 금지(이름 충돌 + import 순환 위험).

7. **fallback / defensive**

   - `actionType`이 알려진 값이 아니면 기존 generic instruction("Ask the user with the question tool. Header: 'Approval Required'.") 반환. 회귀 방지.
   - `proposal === null`이고 actionType이 commit/branch/push인 경우도 fallback (실전에서 거의 발생 안 하지만 안전).
   - 빌더 throw 시 `requestApproval`이 try/catch로 swallow하고 기존 약한 instruction으로 동작 → 사용자가 다이얼로그를 못 보는 사태 회피.

## Implementation Plan

### Tasks

#### Phase 1 — Pure builder

- [x] **Task 1**: 신규 빌더 파일 생성 (adversarial F1/F2/F7 반영)
  - File: `src/services/approval/build-question-instruction.js` (NEW)
  - Action:
    - export named `buildQuestionInstruction({ commandName, actionType, proposal })` → `{ header, options, instructionText }`
    - **분기는 TD #1의 slash-segmented actionType 사용** — `"branch/create"`, `"branch/switch"`, `"init"`, `"commit"`, `"push"` (`classify-git-action.js:26-32`와 일치)
    - **commandName defensive normalize**: 함수 진입 시 `commandName = String(commandName ?? "").trim().replace(/^\/+/, "")`. 이후 `formatHeader(commandName)`이 빈 문자열을 받으면 헤더 라인 생략.
    - 헬퍼: `formatHeader(commandName)` → `commandName ? \`Git workflow guard is active for /${commandName}.\` : null` — 결과를 lines 배열에서 falsy filter로 제거.
    - branch name resolution: `proposal?.name`이 truthy면 사용, 아니면 `"workflow"`.
    - commit action 분기: `proposal?.action === "baseline-commit"`만 baseline 시점으로 진입. 그 외(예: `"commit"`, null, undefined) 모두 "Finalize Changes" 시점으로 떨어짐.
    - throw 없음 — 알 수 없는 actionType은 TD #7 fallback 형식의 객체 반환.
  - Notes: pure function, no side effects, no debug.log 호출 (adversarial F20 — debug 로그는 호출자 `requestApproval`에서). 상단에 짧은 JSDoc 추가(시그니처 + return shape + actionType 도메인).

#### Phase 2 — requestApproval 어댑터 수정

- [x] **Task 2**: `src/index.js:requestApproval`에서 빌더 호출
  - File: `src/index.js`
  - Action:
    - line 30 근처에 `import { buildQuestionInstruction } from "./services/approval/build-question-instruction.js";` 추가
    - 기존 `requestApproval` (line 177-252) 내부:
      - 기존 line 190-205의 `nativeHeader` / `nativeOptions` / `nativeInstruction` 계산 블록 제거
      - 대체 (adversarial F4 반영 — fallback도 actionType별 header preserve):
        ```js
        const FALLBACK_HEADERS = {
          "init": "Initialize Git",
          "commit": "Finalize Changes",
          "branch/create": "Create Branch",
          "branch/switch": "Switch Branch",
          "push": "Push Changes",
        };
        let instruction;
        try {
          instruction = buildQuestionInstruction({
            commandName: request.workflow || request.command || null,
            actionType: request.actionType,
            proposal: request.proposal ?? null,
          });
        } catch (error) {
          debugLogger.log("requestApproval", "buildQuestionInstruction threw — falling back to per-actionType header", {
            actionType: request?.actionType,
            error: error?.message ?? String(error),
          });
          const fallbackHeader = FALLBACK_HEADERS[request.actionType] || "Approval Required";
          const fallbackOptions =
            request.actionType === "init"
              ? ["Initialize Git (Recommended)", "Cancel"]
              : ["Approve (Recommended)", "Deny", "Ignore and continue"];
          instruction = {
            header: fallbackHeader,
            options: fallbackOptions,
            instructionText: `Ask the user with the question tool. Header: "${fallbackHeader}". Options: ${fallbackOptions.map((o) => `"${o}"`).join(", ")}.`,
          };
        }
        const nativeHeader = instruction.header;
        const nativeOptions = instruction.options;
        const nativeInstruction = instruction.instructionText;
        ```
    - 기존 promptText 조립(line 207-211) 변경 없음 — `${nativeInstruction}\n\n${bodyText}` 그대로
    - metadata `questionHeader: nativeHeader`, `questionOptions: nativeOptions` 그대로 사용(line 230-231)
    - line 239-245 debug 로그 TD #5의 키로 확장
  - Notes: 변경 surface 좁음. 기존 호출 컨트랙트(`request` 입력, promptAsync 출력) 동일.

#### Phase 3 — alias 셋 보강 (필요 시)

- [x] **Task 3**: `"Create Baseline Commit"` 라벨 ACCEPT alias 추가 (adversarial F6 반영)
  - File: `src/services/approval/permission-asked-aliases.js`
  - Action: `APPROVAL_OUTCOME_ALIASES`의 `Object.freeze({...})` 객체 리터럴 **내부에** `"create baseline commit": "accept"` 키를 추가. in-place mutation 금지 (Object.freeze frozen). 기존 export 라인 한 곳만 수정:
    ```js
    export const APPROVAL_OUTCOME_ALIASES = Object.freeze({
      accept: "accept",
      approve: "accept",
      approved: "accept",
      allow: "accept",
      deny: "deny",
      reject: "deny",
      rejected: "deny",
      block: "deny",
      "ignore-and-continue": "ignore-and-continue",
      ignore: "ignore-and-continue",
      skip: "ignore-and-continue",
      "create baseline commit": "accept",  // <-- 신규
    });
    ```
  - Notes: Step 2 검증으로 기타 라벨(`approve`, `cancel`, `deny`, `ignore and continue`)은 기존 alias/token 셋으로 모두 처리 확인. 본 task는 한 줄 추가만.

#### Phase 4 — 테스트

- [x] **Task 4**: 빌더 단위 테스트 (adversarial F1/F2/F7 검증 포함)
  - File: `tests/unit/build-question-instruction.test.js` (NEW)
  - Action: 다음 case 커버 (**actionType은 모두 slash-segmented**)
    - case "init": `actionType="init"` → header "Initialize Git", options contains "Initialize Git (Recommended)" + "Cancel", instructionText includes "Do not ask for a branch name"
    - case "baseline-commit": `actionType="commit"`, `proposal.action="baseline-commit"` → header "Create Baseline Commit", options contains "Create Baseline Commit (Recommended)" + "Cancel"
    - case "branch-create": `actionType="branch/create"`, `proposal.action="create"`, `proposal.name="feat/foo"` → header "Create Branch", instructionText includes "Suggested branch name: `feat/foo`"
    - case "branch-switch": `actionType="branch/switch"`, `proposal.action="switch"`, `proposal.name="feat/bar"` → header "Switch Branch", instructionText includes "Target branch: `feat/bar`"
    - case "commit-finalize": `actionType="commit"`, `proposal.action="commit"` → header "Finalize Changes"
    - case "commit-finalize-null-action" (F7 검증): `actionType="commit"`, `proposal.action=null` → header "Finalize Changes" (TD #1 priority 3에 따라)
    - case "commit-finalize-null-proposal" (F7 검증): `actionType="commit"`, `proposal=null` → header "Finalize Changes" (defensive guard)
    - case "push": `actionType="push"` → header "Push Changes", instructionText includes "push the current branch"
    - case "fallback-unknown-actionType": `actionType="weird"` → header "Approval Required"
    - case "commandName-omitted": `commandName=null` → instructionText에 "Git workflow guard is active" 라인 없음, 옵션 enumeration은 정상
    - case "commandName-with-leading-slash" (F2 검증): `commandName="/bmad-bmm-create-prd"` → instructionText에 `/bmad-bmm-create-prd` 단일 슬래시, `//` 더블슬래시 없음
    - case "old-spec-actionType-rejected": `actionType="branch"` (slash 없음) → header "Approval Required" (fallback) — TD #1이 slash-segmented만 인식한다는 회귀 보호
  - Notes: 모든 강제 문구 ("Do not continue before..." 등)가 instructionText에 포함되는지 정규식으로 검증. 옵션 라벨 byte-for-byte.

- [x] **Task 5**: 기존 e2e 헤더 어셔션 업데이트 + regression 회귀 보호 (adversarial F3 반영)
  - File 1: `tests/e2e/scenario-init-chain.test.js`
    - line 99의 synthetic event payload `header: "Finalize Changes"`를 `header: "Create Baseline Commit"`로 변경 — debug 로그 의도 일관성
    - **추가 어셔션 (AC11 실제 검증, F3 반영)**: baseline commit prompt가 발행된 직후 `mock.prompts[i].parts[0].metadata.questionHeader === "Create Baseline Commit"` 확인. (synthetic event payload는 매칭에 쓰이지 않으니, metadata 어셔션이 실제 검증 surface)
    - 비슷한 case로 `mock.prompts`의 첫 metadata에서 `questionOptions`이 `["Create Baseline Commit (Recommended)", "Cancel"]`임을 확인
  - File 2: `tests/regression.test.js`
    - `src/index.js`에 `import { buildQuestionInstruction }` 정적 검증 (drift 회귀 방지)
    - `src/services/approval/build-question-instruction.js` 파일 존재 + named export 검증
    - `APPROVAL_OUTCOME_ALIASES["create baseline commit"] === "accept"` 검증
    - (F3 보강) `src/services/approval/permission-asked-aliases.js`의 alias disjointness invariant 회귀 테스트가 신규 키에 대해 통과하는지 sanity check
  - Notes: 다른 e2e(`scenario-approval-deny-recovery`, `scenario-file-edited-tracking`, `scenario-readiness-not-initialized`)는 헤더를 dynamic하게 읽거나 "Initialize Git"으로 검증 — 영향 없음.

#### Phase 5 — 빌드 및 배포

- [x] **Task 6**: dist 재생성
  - Action: `npm run build` 실행
  - Notes: 회귀 통과 확인. esbuild output `dist/devai-aidd-plugin.js`.

- [x] **Task 7**: 사용자 환경 plugins 디렉토리로 복사
  - Action: `Copy-Item -Path "dist\devai-aidd-plugin.js" -Destination "C:\Users\user\Desktop\새 폴더\.opencode\plugins\devai-aidd-plugin.js" -Force` (또는 동등한 명령)
  - Notes: 대상 디렉토리 사전 존재 확인. 한글 경로("새 폴더") 주의 — PowerShell quoting 필요.

- [x] **Task 8**: 전체 테스트 sweep
  - Action: `npm test`
  - Notes: 0 회귀 확인.

### Acceptance Criteria

#### A. 빌더 정합성 (Phase 1)

- [ ] **AC1**: Given `buildQuestionInstruction({ commandName: "bmad-bmm-create-prd", actionType: "commit", proposal: { kind: "commit", action: "baseline-commit", ... } })`, when 호출, then `{ header: "Create Baseline Commit", options: ["Create Baseline Commit (Recommended)", "Cancel"], instructionText: "..." }` 반환. `instructionText`에 다음 단어가 모두 포함: `"git repository without an initial commit"`, `` `Create Baseline Commit (Recommended)` ``, `"Do not continue the workflow"`.
- [ ] **AC2**: Given `actionType: "branch/create"`, `proposal.action: "create"`, `proposal.name: "feat/test"`, when 빌더 호출, then `header === "Create Branch"`, `instructionText`에 `` `feat/test` `` 포함. (**adversarial F1: slash-segmented actionType**)
- [ ] **AC3**: Given `actionType: "branch/switch"`, `proposal.action: "switch"`, `proposal.name: "feat/foo"`, when 빌더 호출, then `header === "Switch Branch"`, `instructionText`에 "Target branch:" 포함. (**adversarial F1**)
- [ ] **AC4**: Given `actionType: "commit"`, `proposal.action: "commit"`, when 빌더 호출, then `header === "Finalize Changes"`, instructionText에 "ready to push" 같은 push 단어 없음 (commit 단계 한정).
- [ ] **AC5**: Given `actionType: "push"`, `proposal.action: "push"`, when 빌더 호출, then `header === "Push Changes"`, instructionText에 "push the current branch" 포함.
- [ ] **AC6**: Given `actionType: "init"`, when 빌더 호출, then `header === "Initialize Git"`, `options[0] === "Initialize Git (Recommended)"`, `options[1] === "Cancel"`. (promptAsync 채널 일관성 — output.parts 채널과 동일 라벨)
- [ ] **AC7**: Given `actionType: "weird"`, when 빌더 호출, then fallback `header === "Approval Required"`, options 3개(approve/deny/ignore).

#### B. requestApproval 통합 (Phase 2)

- [ ] **AC8**: Given baseline commit proposal에 대한 `requestApproval` 호출, when promptAsync 호출 시점의 `parts[0].text` 추출, then 첫 줄이 TD #2 시점 A의 첫 줄과 일치하며 옵션 라벨이 동일.
- [ ] **AC9**: Given `requestApproval` 호출, when `metadata.questionHeader` / `metadata.questionOptions` 확인, then 빌더가 반환한 `header` / `options` 값이 그대로 들어가 있음.
- [ ] **AC10**: Given 빌더가 throw 하도록 mock 주입, when `requestApproval` 호출, then promptAsync는 fallback instruction으로 호출되며 throw가 외부로 전파되지 않음.
- [ ] **AC10b** (adversarial F4): Given `actionType: "init"`이고 빌더가 throw 하도록 mock 주입, when `requestApproval` 호출, then `metadata.questionHeader === "Initialize Git"` (generic "Approval Required"로 회귀하지 않음). 동일 검증을 `actionType: "commit"` → "Finalize Changes", `actionType: "push"` → "Push Changes", `actionType: "branch/create"` → "Create Branch"에 대해 반복.

#### C. Debug 로그 (Phase 2)

- [ ] **AC11** (adversarial F3 재명세): Given baseline commit prompt 발행 직후 `mock.prompts`의 마지막 entry, when `parts[0].metadata` 확인, then `questionHeader === "Create Baseline Commit"` AND `questionOptions === ["Create Baseline Commit (Recommended)", "Cancel"]` AND `parts[0].text`의 첫 줄 그룹이 빌더 instructionText로 시작. **e2e의 synthetic event payload 헤더 값이 아니라 plugin이 발행한 metadata로 검증** — 모델 emit 헤더(`event.properties.header`)와 plugin emit 헤더(`metadata.questionHeader`)를 conflate하지 않음 (adversarial F11).
- [ ] **AC12** (수동 검증, adversarial F9 인지): Given native-event.js의 question.asked 라우팅, when 모델이 `question` 도구를 우리 instruction대로 호출(사용자 환경에서 수동 트리거), then `[native-event] received event.type=question.asked` 로그의 `props.header` 필드 값이 시점별로 다음 중 하나: `"Create Baseline Commit"` / `"Create Branch"` / `"Switch Branch"` / `"Finalize Changes"` / `"Push Changes"` / `"Initialize Git"`. **모델 동작 의존이라 자동화 불가** — 자동 어셔션은 AC11(plugin emit metadata)로 한정.

#### D. Alias 매핑 (Phase 3)

- [ ] **AC13**: Given 사용자가 "Create Baseline Commit (Recommended)"으로 응답, when `parseApprovalAnswerOutcome` 호출, then `APPROVAL_OUTCOMES.ACCEPT` 반환.
- [ ] **AC14**: Given "Cancel" 응답, when `parseApprovalAnswerOutcome` 호출, then `APPROVAL_OUTCOMES.DENY` 반환 (기존 동작 회귀).

#### E. 회귀 보호

- [ ] **AC15**: Given 기존 `tests/regression.test.js` 케이스, when 전체 sweep 실행, then 0 회귀.
- [ ] **AC16**: Given 기존 e2e 시나리오 (`scenario-init-chain.test.js`, `scenario-readiness-not-initialized.test.js`, deny-recovery 등), when sweep 실행, then 0 회귀. 특히 `scenario-init-chain.test.js`의 baseline commit prompt 발행 검증이 새 헤더("Create Baseline Commit")로도 통과해야 함 — 기존 어셔션이 "Finalize Changes" 헤더에 의존하면 헤더 업데이트 필요.
- [ ] **AC17**: Given `npm run build` 실행 후, when `dist/devai-aidd-plugin.js`와 src 비교, then parity 검증 통과.
- [ ] **AC18**: Given `dist/devai-aidd-plugin.js`가 사용자 환경 plugins 디렉토리로 복사된 직후, when opencode 재기동 후 non-git 디렉토리에서 `/bmad-bmm-create-prd` 실행, then init prompt → init 승인 → baseline commit prompt가 헤더 "Create Baseline Commit"으로 즉시 다이얼로그에 표시.

## Additional Context

### Dependencies

- 외부 npm 의존성 추가 없음.
- 신규 파일 1개(`build-question-instruction.js`), 신규 테스트 1개(`build-question-instruction.test.js`), 기존 파일 1개 수정(`src/index.js`), alias 셋 1줄 추가 가능(`permission-asked-aliases.js` 또는 `native-event.js`).

### Testing Strategy

- **단위 테스트(Task 4)**: 빌더 7+ 케이스를 byte-level 어셔션으로 커버. 헤더 / 옵션 라벨 / 강제 문구 / branch name 인터폴레이션.
- **Integration via 기존 e2e**: `scenario-init-chain.test.js`가 init → baseline commit prompt 발행 흐름을 검증 중 — 새 헤더로 어셔션 업데이트가 필요한지 점검(quick-dev 단계에서 확인).
- **수동 검증(Task 7 후)**: 사용자 환경(`C:\Users\user\Desktop\새 폴더`)에서 opencode 재기동 후 4시점 트리거. `devai-aidd-debug.log`에서 다음 라인이 시점별로 찍히는지 육안 확인:
  - `[requestApproval] ... header: "Create Baseline Commit"` (baseline-commit 시점)
  - `[requestApproval] ... header: "Create Branch"` (branch create 시점)
  - `[requestApproval] ... header: "Finalize Changes"` (commit finalize 시점)
  - `[requestApproval] ... header: "Push Changes"` (push 시점)
  - 각 라인의 `instructionPreview`에 우리 의도된 강제 문구 포함
  - 후속 `[native-event] received event.type=question.asked`의 `props.header`가 동일 값

### Notes

#### 위험 항목 (Pre-mortem)

- **R1: 모델이 강한 instruction에도 question 도구 호출을 지연** — promptAsync는 비동기 큐잉이라 동기 차단력이 output.parts.push만 못함. mitigation: instruction 텍스트의 강제 문구를 양보 없이 명시 ("Do not run git or modify files before..."). 우회 발생 시 동일 시점의 `tool.execute.before` 가드 강화는 별도 spec.
- **R2: 모델이 옵션 라벨을 살짝 변형해서 question 도구 호출** — 예: `"Create Baseline Commit"`을 `"Initialize Baseline Commit"` 등으로 paraphrase. mitigation: instruction의 `"with these exact options"` 문구로 변형 억제 + alias 셋에 typical paraphrase 추가는 후속 spec.
- **R3: baseline commit prompt가 두 번 발행** — 기존 e2e 어셔션이 헤더 "Finalize Changes"에 의존하면 새 헤더 분리 후 케이스 실패 가능. mitigation: quick-dev 단계에서 e2e 어셔션 grep 후 업데이트.
- **R4: dist 복사 시 한글 경로 quoting 실수** — Windows PowerShell에서 `"새 폴더"` 더블쿼팅 필수. mitigation: Task 7에서 `-Path "..." -Destination "..."` 명시적 쿼팅.
- **R5: alias 추가가 기존 ACCEPT/DENY 매핑과 충돌** — `"create baseline commit"` 라벨은 unique하지만 첫 단어 "create"가 prefix 매칭으로 다른 의미 잡힐 수 있음. mitigation: native-event.js의 parse는 이미 exact-match 전용(F3/F10 review note) — 안전.
- **R7 (adversarial F14): `proposal.name`에 backtick injection** — 빌더 텍스트가 `` `${proposal.name || "workflow"}` ``로 wrap. branch validation regex가 backtick을 거부한다고 가정 가능하나 보장 없음. mitigation: 빌더 진입 시 `proposal.name`이 string이고 백틱·줄바꿈·제어문자를 포함하지 않는지 defensive 검사 → 위반 시 `"workflow"` fallback.
- **R8 (adversarial F18): 옵션 라벨의 번호 prefix** — `"1. \`Create Baseline Commit (Recommended)\`"` 같은 prefix를 모델이 그대로 echo할 가능성. `normalizeAnswerKey`(`native-event.js:229-237`)가 leading non-alnum 제거(`replace(/^[^a-z0-9]+/, "")`)하므로 prefix는 stripped. 추가 보호 불필요 — Task 4에 회귀 테스트(`"1. Create Baseline Commit (Recommended)"` 입력 → ACCEPT 매핑) 한 case 포함.
- **R6 (adversarial F5 정정): Switch Branch는 fully live** — `branch-service.js:233-245`가 current branch != candidate AND current가 valid AND non-long-lived일 때 항상 `action: "switch"` 반환. 실전 트리거 발생. 빌더의 Switch Branch case는 부수 효과가 아니라 in-scope 필수 case. 단, **현재 `src/index.js:193`의 `"branch"` 분기 버그(F1)로 인해 오늘은 Switch Branch도 generic "Approval Required" 헤더로 떨어지고 있음** — 본 spec 적용 시 자동 fix.
- **R6b: detection이 없는 시점(Long-Lived Branch 경고, Resume Workflow, Merge Branch)은 진짜 out-of-scope** — adversarial F13처럼 isLongLived 케이스는 현재 `action: "create"`로 떨어지므로 "Create Branch" 헤더가 적용됨. 별도 "Long-Lived Branch Warning" 헤더가 필요하면 후속 spec에서 detection + 별도 case 추가.

#### Implementation Review Notes (Step 5 Adversarial Review on Diff)

구현 단계 adversarial review 결과 20 findings. 사용자가 `[S] Skip`을 선택해 수정 없이 진행 (acknowledge only).

- **F1 (claimed Critical) — noise**: `"Cancel"` 매핑 부재 주장 — 실제 `DENY_ANSWER_TOKENS`(`native-event.js:215`)에 `"cancel"`이 있어 정상 DENY 매핑. 리뷰어 오독.
- **High (real, skipped)**:
  - F2: regression test의 doesNotMatch(//)는 guard line 누락도 통과 — positive 어셔션 부족
  - F3: unit test가 fallback throw 경로 미커버 (실전 throw 케이스 부재로 dead code 우려)
  - F4: `request.proposal == null ? null : request.proposal` 노옵
  - F5: `verifyStartInstructionTextSimplified` git init 추가는 stale test 부활용 hack, post-strengthen multi-line 케이스 회귀 보호 부재
- **Medium (real, skipped)**:
  - F7/F15/F19: builder가 throw 시 fallback이 baseline-commit에 대해 잘못된 헤더/옵션 set 반환 (실전 throw 없음 → dead path)
  - F8/F12: commandName이 debug 로그 / instruction 텍스트에 raw 노출 — 워크플로 allowlist 거치므로 injection surface 낮음
  - F9: sanitizeBranchName이 U+2028/2029/zero-width/bidi override 미차단 (git이 그 이름을 거부하므로 실전 영향 낮음)
  - F10/F17: proposal.name이 number/boolean/undefined일 때 silent fallback
- **Low (real, skipped)**: F13/F14/F16/F18/F20 — cosmetic 또는 테스트 보강

후속 후보(Out of Scope for this spec):
- F2/F3 strengthening — unit test의 fallback case 추가, regression의 positive 어셔션 강화
- F7 — builder의 fallback이 proposal.action 인지하도록 확장
- F9 — Unicode 위험 문자 추가 차단

#### Adversarial Review 반영 요약 (Step 4 Spec Review)

본 spec은 quick-spec Step 4의 Adversarial Review에서 20개 findings를 받음. Critical/High 7개를 spec 본문에 반영:

- **F1 (Critical)**: actionType은 `"branch/create"`/`"branch/switch"` slash-segmented → TD #1, Task 1/4, AC2/AC3 정정. 현재 `src/index.js:193`의 동일 버그도 spec 적용으로 자동 fix.
- **F2 (Critical)**: `commandName` defensive normalization (`replace(/^\/+/, "")`) 추가. 정상 경로는 noop, 우회 경로 안전.
- **F3 (High)**: AC11 재명세 — `mock.prompts[].metadata.questionHeader`로 검증, synthetic event header value는 검증 surface 아님.
- **F4 (High)**: Task 2 fallback이 actionType별 default header 보존. TD #7 추가.
- **F5 (High)**: Switch Branch fully live 정정. R6 갱신.
- **F6 (High)**: Task 3 `Object.freeze` 객체 리터럴 내부 키 추가 (in-place mutation 금지) 명시.
- **F7 (High)**: TD #1 priority 3에서 commit + null/undefined proposal.action → "Finalize Changes" 결정 명문화.

나머지 Medium/Low findings(F8~F20):
- F9 (모델 준수 측정 부재): 인지하되 본 spec 범위 밖, AC12 수동 검증으로 한정 명시.
- F10 (branch/push generic 옵션): 의도적 결정 — 본 spec은 instruction 텍스트 강도가 1차 lever, 옵션 라벨 specificity는 commit 시점(baseline/regular 구분 필요)에만 적용. 후속 spec에서 confirm/measure 후 확산 검토.
- F11 (metadata vs event.properties.header conflation): AC11/AC12 분리 명세로 해결.
- F12 (수동 reboot + 한글 path): 인지된 한계 — CI 자동화는 본 spec 범위 밖. AC18은 수동 smoke test로 명시.
- F13 (Long-Lived 부분 trigger): R6b로 별도 기록, 후속 spec에서 detection + 별도 case.
- F14 (backtick injection): R7 추가, defensive guard.
- F15/F16/F17/F19/F20: cosmetic 또는 인지/문서 보강 — 본 spec 적용에 영향 없음.
- F18 (옵션 번호 prefix): Task 4에 회귀 case 1개 추가(R8).

#### 아키텍처 메모

- `requestApproval`은 promptAsync 채널의 **single chokepoint** — 빌더 추출은 자연스러운 책임 분리. 향후 init도 promptAsync로만 보낼 가능성 생기면(현재는 output.parts.push 병행) 빌더가 그대로 재사용됨.
- `output.parts.push` 채널(command.execute.before)은 동기 + 강제 주입력 최대. promptAsync 채널은 비동기 + 큐잉이라 instruction 강도로 보강. 두 채널이 동일 시점에 모두 작동하지 않으므로 race 없음 (init만 양쪽 — 단 output.parts가 항상 먼저 도달).
- 빌더는 audit / state 의존 없음 — pure function. unit test 비용 최소.
- 한국어 instruction 가능성: 현재는 영어 only(opencode runtime + model이 영어 instruction을 더 안정적으로 따름). 한글 instruction은 별도 i18n spec에서.
