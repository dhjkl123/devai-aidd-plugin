---
title: 소스 파일 기능 명세
description: src/ 하위 JavaScript 파일별 역할과 핵심 export 정리
---

# 소스 파일 기능 명세

`src/` 디렉터리 하위의 모든 JavaScript 모듈을 디렉터리별로 그룹화하여, 각 파일이 담당하는 기능과 주요 export를 정리한다.

## src/index.js

| 파일 | 역할 | 주요 export |
|---|---|---|
| `index.js` | DevAI AIDD 플러그인의 부트스트랩 진입점. 런타임 설정 로드, 감사 로거 생성, 6개 훅 핸들러를 초기화하여 opencode 런타임에 반환한다. | `DevaiAiddGuardPlugin` |

## src/adapters

운영 환경의 사이드 이펙트를 어댑터 패턴으로 격리하여 테스트와 주입을 용이하게 한다.

| 파일 | 역할 | 주요 export |
|---|---|---|
| `fs.js` | Node.js 파일시스템 API(read/write 등)를 어댑터로 감싸 주입 가능하게 제공. | `createFileSystemAdapter` |
| `console.js` | 콘솔 출력(log/error)을 어댑터로 추상화하여 테스트에서 캡처 가능하게 한다. | `createConsoleAdapter` |
| `http.js` | HTTP 엔드포인트로 감사 로그를 전송하기 위한 어댑터(스텁 포함). | `createHttpAdapter` |

## src/audit

플러그인 동작을 구조화된 로그로 기록하여 추적성과 디버깅을 지원한다.

| 파일 | 역할 | 주요 export |
|---|---|---|
| `logger.js` | 다중 채널(클라이언트/파일/HTTP) 감사 로깅. 구조화된 레코드를 생성하여 각 채널로 분기 전송. | `createAuditLogger` |
| `debug-logger.js` | `config.debug.enabled` 게이트 하에서만 동작하는 동기식 파일 기반 진단 트레이스 로거. | `createDebugLogger` |

## src/config

런타임 설정의 로드·병합·검증과 신규 설치 시 사용할 내장 템플릿을 제공한다.

| 파일 | 역할 | 주요 export |
|---|---|---|
| `defaults.js` | 빈 기본 설정 객체. 실질 기본값은 `BASELINE_TEMPLATE_TEXT`에서 공급한다. | `DEFAULT_PLUGIN_CONFIG` |
| `load-config.js` | 전역/프로젝트 JSONC 파일을 로드해 내장 기본값과 병합하여 유효한 런타임 구성을 만든다. | `loadRuntimeConfig`, `loadWorkflowCommands`, `mergeObjects`, `mergeConfigs` |
| `validate-config.js` | JSON Schema 검증, 워크플로우 정책 용어 확인, 검증 실패 시 복구 로직. | `validateRuntimeConfig`, `KNOWN_WORKFLOW_POLICY_VOCABULARY`, `RUNTIME_CONFIG_SCHEMA` |
| `baseline-template.generated.js` | 빌드 시 자동 생성되는 전역 템플릿 텍스트. 신규 설치에도 합리적 기본값을 보장. | `BASELINE_TEMPLATE_TEXT` |

## src/hooks

opencode 런타임 이벤트를 받아 워크플로우 가드와 승인 흐름을 적용하는 진입 훅들이다.

| 파일 | 역할 | 주요 export |
|---|---|---|
| `command-execute-before.js` | 명령 실행 전 훅. 워크플로우 감지, 저장소 준비 점검, 브랜치 전략 계획, 승인 게시까지 수행. | `createCommandExecuteBeforeHook` |
| `tool-execute-before.js` | 도구 실행 전 가드. git 초기화 전 차단, 변경 도구 차단 메시지 송출. | `createToolExecuteBeforeHook`, `BASH_GIT_BLOCK_MESSAGE` |
| `tool-execute-after.js` | 도구 실행 후 훅. finish 도구 게이팅, 워크플로우 단계 진행, 스타트업 체인/복구 실행. | `createToolExecuteAfterHook` |
| `permission-asked.js` | 권한 요청 이벤트를 승인 해결 경로 또는 복구 오케스트레이터로 라우팅. | `createPermissionAskedHook`, `resolveApprovalOrRecovery`, `deliverRecoveryPrompt` |
| `file-edited.js` | 활성 워크플로우 세션에서 수정된 파일을 추적하여 추후 커밋 제안에 활용. | `createFileEditedHook` |
| `native-event.js` | opencode 네이티브 플러그인 런타임의 단일 `event` 라우터. 세션/명령/질문/복구 신호를 유형별로 분기. | `createNativeEventHook` |

## src/services/approval

승인 요청 생성, 게시, 결과 처리, 복구 흐름을 담당하는 도메인 서비스 모음이다.

| 파일 | 역할 | 주요 export |
|---|---|---|
| `approval-policy-service.js` | 승인 요청 게시 가능 여부 평가와 미결정 제안의 우선순위 선택. | `getPendingApproval`, `selectNextPlannedAction`, `evaluateRequestGate` |
| `approval-resolution-state.js` | 승인 수명주기 상수(PENDING/ACCEPT/DENY/IGNORE_AND_CONTINUE)와 전환 규칙 정의. | `APPROVAL_OUTCOMES`, `TERMINAL_OUTCOMES` 등 |
| `build-approval-explanation.js` | 입력에서 정규 설명 페이로드(의도/영향/정책 근거)를 빌드하고 모든 값을 새니타이즈. | `buildApprovalExplanation`, `buildFallbackExplanation` |
| `build-approval-request.js` | 제안·워크플로우 컨텍스트·정책에서 ApprovalRequest 객체와 안정적 핑거프린트 id 생성. | `buildActionId`, `buildApprovalRequest` |
| `build-approval-resolution.js` | (요청, 결과) 쌍을 해결 봉투 및 감사 페이로드로 변환. | `deriveActionKind`, `buildApprovalResolution`, `buildApprovalResolvedAudit`, `buildGitActionSkippedAudit` |
| `build-question-instruction.js` | 네이티브 질문 도구 호출용 시나리오별 다중 줄 지시문(헤더/옵션) 작성. | `buildQuestionInstruction` |
| `build-recovery-options.js` | 복구 게이트의 작업 종류에 맞춘 선택지 목록 생성. | `buildRecoveryOptions` |
| `build-recovery-prompt.js` | 복구 게이트를 사용자 프롬프트 봉투(제목/요약/선택지/권장 선택)로 변환. | `buildRecoveryPrompt` |
| `build-startup-chain-question-instruction.js` | init → baseline → branch 스타트업 체인 배치 질문의 지시문 생성. | `buildStartupChainQuestionInstruction`, `STARTUP_CHAIN_TOOL_ID` |
| `classify-git-action.js` | 제안 객체를 표준 actionType(branch/create, branch/switch, init, commit, push)으로 정규화. | `classifyGitAction` |
| `classify-recovery.js` | 승인 결과 또는 git 실패가 복구 가능한지 분류하고 권장 선택지를 결정. | `classifyRecovery` |
| `consume-approval-outcome.js` | 활성 승인을 accept/deny/ignore-and-continue로 종결하고 상태·감사를 갱신. | `consumeApprovalOutcome` |
| `permission-asked-aliases.js` | 승인 결과 및 복구 선택지의 표기 변형을 정규 용어로 매핑. | `APPROVAL_OUTCOME_ALIASES`, `RECOVERY_CHOICE_ALIASES` |
| `publish-next-planned-action.js` | 활성 게이트 평가 후 다음 미결정 제안을 ApprovalRequest로 빌드·게시. | `publishNextPlannedAction` |
| `recovery-orchestrator.js` | 복구 게이트 열기/기록/해제와 감사 이벤트 어셈블. 복구 상태 변경의 단일 진입점. | `openRecoveryFromApproval`, `openRecoveryFromExecution`, `selectRecoveryChoice`, `readRecoveryGate`, `confirmManualResolution`, `isActionBlockedByGate`, `buildHookBlockedEvent` |
| `recovery-state.js` | 복구 수명주기 상수(상태/선택지/작업 종류/차단 범위)와 전환 규칙 정의. | `RECOVERY_STATES`, `RECOVERY_CHOICES`, `RECOVERY_ACTION_KINDS`, `isTerminalRecoveryState` 등 |
| `redact-approval-fields.js` | 절대 경로·원격 URL 등을 승인 본문/메타에서 마스킹. | `redactBranchLabel`, `redactDirectoryLabel`, `redactRemoteLabel` |

## src/services/git

git 작업 계획·실행·실패 분류를 담당한다. 모든 git 실행은 `git-executor.js`로 정규화된다.

| 파일 | 역할 | 주요 export |
|---|---|---|
| `baseline-commit-service.js` | 초기 커밋 후 `.gitignore` 규칙 추가 및 기준선 답변(사용자 입력) 정규화. | `normalizeBaselineAnswer`, `appendGitignoreRules`, `resolveBaselineCommitFiles` |
| `branch-action-service.js` | 브랜치 제안에서 정규화된 브랜치 작업 계획을 빌드·실행. | `buildBranchAction`, `executeBranch` |
| `branch-service.js` | 브랜치 전략 평가, 후보 이름 계산, 제안 구성과 정규화·방어 기본값. | `computeCandidateBranchName`, `evaluateBranchStrategy`, `buildBranchProposal`, `normalizeBranchConfig` |
| `build-init-proposal.js` | git 초기화 및 기준선 커밋 제안 생성. 상관관계 ID 부여. | `buildInitProposal`, `buildBaselineCommitProposal` |
| `check-repository-readiness.js` | 저장소 상태(존재/브랜치/커밋/원격) 확인 결과 또는 요청 제안 반환. | `checkRepositoryReadiness` |
| `classify-git-execution-failure.js` | git 실패를 정규 코드(branch-conflict, push-rejection 등)로 분류하고 감사 설명 생성. | `classifyGitExecutionFailure` |
| `commit-service.js` | 커밋 작업 계획 생성, 파일 경로 유효성 검사, executor에 위임. | `buildCommitAction`, `executeCommit` |
| `execute-approved-action.js` | 승인된 제안의 체인 실행(init → baseline → branch → commit → push)과 다음 계획 게시. | `executeApprovedAction` |
| `git-executor.js` | 단일 git 작업 실행의 정규화 지점. 사전/사후 조건 검증·실패 분류·감사·워크플로우 상태 지속. | `executeGitAction` |
| `init-service.js` | git 초기화 작업 빌드·실행과 성공 후 기본 `.gitignore` 작성. | `buildInitAction`, `executeInit`, `DEFAULT_GITIGNORE_LINES` |
| `plan-branch-proposal.js` | 브랜치 전략 평가, 제안 계산, 워크플로우 상태 지속, 감사. | `planBranchProposal` |
| `push-service.js` | push 작업 계획 생성 및 executor 위임. | `buildPushAction`, `executePush` |
| `run-git-command.js` | git 부명령(rev-parse, status, remote 등) 실행 래퍼. Windows CreateProcess 제약을 고려한 pathspec 인라인 한도. | `runGitCommand`, `runGitAction`, `PATHSPEC_INLINE_LIMIT` |
| `startup-chain-executor.js` | init → baseline → branch 체인을 사용자 답변 해석과 함께 순차 실행. | `executeStartupChain` |
| `startup-chain-planner.js` | 저장소 상태와 워크플로우 컨텍스트에서 스타트업 체인 단계 계획. | `buildStartupChainPlan` |

## src/services/workflow

워크플로우 컨텍스트 감지·정책 해결·상태 추적과 마무리(commit/push) 평가를 담당한다.

| 파일 | 역할 | 주요 export |
|---|---|---|
| `commit-proposal.js` | 워크플로우 컨텍스트와 추적 파일에서 커밋 제안·메시지와 변경 요약을 빌드. | `buildCommitProposal`, `summarizeChangeCount` |
| `detect-finalizable-outputs.js` | 워크플로우 정책과 추적 파일에서 마무리 가능한 출력 감지·필터링·범위 검증. | `detectFinalizableOutputs` |
| `detect-workflow-context.js` | 명령이 알려진 워크플로우 명령과 일치하면 WorkflowContext 생성 및 단계 관리. | `detectWorkflowContext`, `normalizeCommandName`, `advancePhaseIfWorkflowSession`, `WORKFLOW_PHASES` |
| `evaluate-workflow-finalization.js` | 마무리 가능한 출력 감지, 커밋 제안 빌드, 푸시 제안 평가. | `evaluateWorkflowFinalization` |
| `finalization-artifacts.js` | 파일 경로 정규화·분류(코드/기술 문서/계획 산출물)와 싱글톤 아티팩트 경로 추적. | `normalizeTrackedFileEntry`, `splitFinalizableFiles`, `mergeTrackedFiles`, `summarizeArtifactKinds`, `artifactScopeMatches` |
| `looks-like-git-command.js` | bash 명령 문자열이 git 호출인지 감지(6가지 패턴). 도구 실행 전 가드용. | `looksLikeGitCommand` |
| `mutating-tools.js` | 변경 도구(edit/write/patch/multiedit) 집합 정의. `tool.execute.after`가 변경 도구 실행 후 workflow phase를 `"mutating"`으로 기록할 때 사용한다. | `MUTATING_TOOLS` |
| `parse-status-porcelain.js` | `git status --short` 출력 파싱. C-이스케이프 디코딩, 이름 변경 확장, 경로 정규화. | `parseStatusPorcelainPaths` |
| `resolve-workflow-policy.js` | 워크플로우 컨텍스트·런타임 설정에서 유효 정책(category, identityStrategy, branchRequired, finalization)을 결정하고 폴백 제공. | `resolveWorkflowPolicy`, `buildSafeDefaultPolicy` |
| `workflow-state.js` | 세션 범위 인메모리 워크플로우 상태 저장소. 승인·실행 결과·복구·추적 파일·스타트업 체인 추적. | `createWorkflowStateStore` |

## src/utils

| 파일 | 역할 | 주요 export |
|---|---|---|
| `constants.js` | 플러그인 메타데이터(DISPLAY_NAME, PACKAGE_NAME, 설정 파일명), 훅 키 계약, 네이티브 이벤트 타입 정의. | `SUPPORTED_HOOK_KEYS`, `NATIVE_EVENT_TYPES`, `WRAPPER_ONLY_HOOK_KEYS` 등 |

## 아키텍처 요약

- **계층화**: 부트스트랩(`index.js`) → 훅(`hooks/`) → 도메인 서비스(`services/approval`, `services/git`, `services/workflow`) → 어댑터(`adapters/`)/감사(`audit/`).
- **순수 함수 우선**: 대부분의 서비스는 순수 빌더·분류기이며, 부작용은 어댑터와 executor 계층으로 집중.
- **상태 격리**: 세션 단위 인메모리 저장소(`workflow-state.js`)에 활성 승인·복구·추적 파일을 보관.
- **감사 일관성**: 부트스트랩·승인·실행·복구의 모든 중요 이벤트를 구조화 로그로 기록.
- **복구 단일 진입점**: 모든 복구 상태 변경은 `recovery-orchestrator.js`를 거치게 하여 상태 불일치를 방지.
