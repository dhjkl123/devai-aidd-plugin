---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
inputDocuments:
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\package.json
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\defaults.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\load-config.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-before.js
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-05-07T00:00:00+09:00'
project_name: 'opencode-aidd-plugin'
user_name: 'User'
date: '2026-05-07T00:00:00+09:00'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
이 프로젝트의 기능 요구는 AI 워크플로우 실행 문맥을 인식하고, 그 문맥에 맞는 Git 동작을 제안하거나 실행하는 데 집중되어 있다. 핵심 요구는 워크플로우 시작/진행/종료 시점 식별, 브랜치 생성 또는 전환, 결과물 기준 커밋 준비, 원격 저장소 존재 시 push 제안, 그리고 각 Git 액션에 대한 사용자 승인 흐름 제공이다.

또한 정책 관리 요구가 강하다. 브랜치 네이밍 규칙, 명령별 workflow policy, 설정 우선순위, 레거시 설정 호환, 예외 상황 복구 경로가 모두 명시되어 있다. 구조적으로는 단일 기능보다 정책 해석과 런타임 오케스트레이션이 중심이 된다.

**Non-Functional Requirements:**
비기능 요구 중 가장 중요한 것은 안전성과 호환성이다. 모든 Git 액션은 승인 기반이어야 하며, 자동화 실패가 전체 BMAD 워크플로우 실패로 전파되면 안 된다. 기존 BMAD workflow command와의 호환성 유지도 필수다.

설정 계층은 글로벌 설정, 프로젝트 설정, 레거시 설정을 병합해야 하며, 기존 사용자가 마이그레이션 부담 없이 동작해야 한다. 감사 로그는 추적 가능해야 하지만 민감 정보 과수집은 피해야 한다. 성능보다 중요한 것은 사용자 흐름을 끊지 않는 응답성과 복구 가능성이다.

**Scale & Complexity:**
프로젝트는 사용자 수나 데이터 볼륨 면에서는 크지 않지만, 런타임 통합과 정책 분기 때문에 구조 복잡도가 존재한다. 특히 명령 종류별 상이한 finalization 정책, branchRequired 여부, identityStrategy 해석이 아키텍처 핵심이 된다.

- Primary domain: Node.js 기반 AI agent plugin / workflow orchestration
- Complexity level: Medium
- Estimated architectural components: 6-8

### Technical Constraints & Dependencies

현재 구현은 Node.js ESM 환경을 전제로 하며, opencode/DevAI 플러그인 및 훅 시스템에 통합된다. 진입점은 플러그인 bootstrap 이후 레거시 코어 핸들러를 래핑하는 구조다.

설정 시스템은 글로벌 설정, 프로젝트 설정, 레거시 설정 파일을 병합하고, 필요 시 레거시 호환 파일을 생성하는 브리지 로직을 포함해야 한다. 따라서 새 아키텍처는 내부 구조를 개선하더라도 외부 계약은 유지해야 한다.

Git 자동화는 독립 기능이 아니라 `command.execute.before`, `tool.execute.before`, `tool.execute.after`, `permission.asked`, `file.edited`, `session event` 등 여러 훅 시점에 걸쳐 분산 적용된다. 이 점이 아키텍처를 이벤트 중심으로 만들며, 단일 서비스 객체만으로는 충분하지 않을 가능성이 높다.

### Cross-Cutting Concerns Identified

- Approval-driven Git execution
- Workflow-aware policy resolution
- Backward compatibility with legacy configuration and runtime behavior
- Audit logging and traceability
- Failure isolation and recovery guidance
- Command-category-specific branching and finalization behavior
- Separation between orchestration, configuration, adapters, and legacy core bridging

## Starter Template Evaluation

### Primary Technology Domain

Node.js 기반 AI agent plugin / workflow orchestration 프로젝트로 판단된다.  
웹 애플리케이션이나 일반 CLI 앱보다는, 런타임 훅과 정책 엔진을 중심으로 동작하는 플러그인 구조에 가깝다.

### Starter Options Considered

1. oclif
- 공식 CLI 프레임워크이며 2026년 5월 기준 유지보수 상태가 양호하다.
- `oclif generate mynewcli` 방식으로 새 CLI 프로젝트를 시작할 수 있다.
- 장점은 명령 구조, 플러그인 확장성, CLI 관례 제공이다.
- 단점은 현재 프로젝트가 일반 CLI보다 런타임 훅 플러그인에 가깝다는 점이다.

2. tsup 기반 라이브러리 스타터
- 최신 릴리스가 확인되는 활발한 번들링 도구다.
- 라이브러리/패키지 빌드 표준화에는 적합하다.
- 하지만 프로젝트의 핵심인 워크플로우 정책, 승인 흐름, 레거시 호환을 제공하지는 않는다.

3. TSDX 2.0 / Bunup
- 현대적인 TypeScript 라이브러리 시작점으로는 적절하다.
- 다만 TypeScript 또는 Bun 중심 전환을 전제하는 성격이 강하다.
- 현재 JavaScript ESM 기반 brownfield 구조를 유지해야 하는 상황에서는 우선순위가 낮다.

### Selected Starter: Existing Repository Baseline (No External Starter)

**Rationale for Selection:**
이 프로젝트는 greenfield가 아니라 기존 동작을 유지해야 하는 brownfield 플러그인이다.  
현재 저장소는 이미 다음 기준선을 제공한다:

- Node.js ESM 런타임
- 플러그인 bootstrap 진입점
- config 병합 및 legacy compatibility bridge
- hook별 진입점 분리
- build/release/install 스크립트 구조

따라서 외부 스타터를 도입해 구조를 바꾸는 것보다, 현재 저장소를 공식 아키텍처 기준선으로 채택하는 편이 리스크가 낮고 요구사항과 더 잘 맞는다.

**Initialization Command:**

```bash
npm install
npm test
npm run build
```

**Architectural Decisions Provided by Baseline:**

**Language & Runtime:**
- JavaScript
- Node.js ESM (`"type": "module"`)

**Styling Solution:**
- 해당 없음
- UI 중심 프로젝트가 아니라 런타임 플러그인 중심 구조

**Build Tooling:**
- 사용자 정의 build/release 스크립트
- 번들 산출물과 설치 산출물을 분리 관리

**Testing Framework:**
- 현재는 회귀 테스트와 `node --check` 중심의 경량 검증 구조

**Code Organization:**
- `src/index.js` 진입점
- `config`, `hooks`, `audit`, `adapters` 분리
- 레거시 코어를 외곽 래퍼 구조로 유지

**Development Experience:**
- 기존 런타임 호환성 유지
- 설정 우선순위 및 레거시 브리지 내장
- BMAD/opencode 워크플로우와 직접 연결되는 구조

**Note:** 이 프로젝트는 새 스타터로 초기화하는 대신, 현재 저장소 구조를 아키텍처 기준선으로 삼고 점진적으로 리팩터링하는 것이 첫 구현 전략이다.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- 영속 저장소는 별도 DB 없이 파일 중심 구조로 유지한다.
- Git 변경 행위는 중앙 approval/policy service를 통해서만 판정되고 승인된다.
- 핵심 상태 변경 흐름은 command/event 패턴으로 구조화한다.
- 배포 품질 보장은 CI를 기준으로 표준화한다.

**Important Decisions (Shape Architecture):**
- 설정 검증은 JSON Schema + Ajv 8.17.1을 사용한다.
- 일반 로그와 감사 로그를 분리하고, 감사 이벤트만 구조화한다.
- 기존 build/release/installer 구조는 유지하되 검증 자동화를 강화한다.

**Deferred Decisions (Post-MVP):**
- 승인 이력 장기 저장용 로컬 메타데이터 저장소 도입
- 외부 텔레메트리/관측성 플랫폼 연동
- TypeScript 전환 여부 검토
- npm registry 중심 배포 전환

### Data Architecture

이 프로젝트는 일반 애플리케이션 데이터베이스를 필요로 하지 않는다.  
영속 상태는 JSON/JSONC 설정 파일로 관리하고, 런타임 상태는 Git working tree 상태와 세션 메모리로 처리한다.

- Persistence model: file-based only
- Primary state sources: config files, git state, in-memory session state
- Validation: JSON Schema + Ajv 8.17.1
- Caching: process-local ephemeral cache only
- Migration: versioned configuration migration for config files only

이 결정은 `load-config` 계층을 사실상 데이터 접근 계층으로 만든다. 따라서 설정 스키마 정의, 검증 실패 처리, 레거시 포맷 브리징이 데이터 아키텍처의 핵심 책임이 된다.

### Authentication & Security

이 프로젝트의 보안 모델은 사용자 계정 인증이 아니라 Git 변경 행위에 대한 승인 강제다.  
모든 Git 변경 액션은 중앙 approval/policy service를 통해 판정된다.

- Security model: approval-governed Git action control
- Core service: centralized approval/policy service
- Standard outcomes: allow, deny, ask, skip
- Action categories: branch/create, branch/switch, commit, push, init, finalize

각 훅은 직접 승인 로직을 구현하지 않고, 공통 정책 계층에 질의만 수행한다. 이를 통해 정책 일관성, 테스트성, 레거시 감싸기 구조를 확보한다.

### API & Communication Patterns

내부 모듈 통신은 혼합형 구조를 채택한다.

- Direct function calls for simple read-only operations
- Command/event flow for stateful or approval-sensitive operations

예상 command 예시는 다음과 같다.
- PrepareBranchCommand
- RequestApprovalCommand
- FinalizeWorkflowCommand
- ProposePushCommand

예상 event 예시는 다음과 같다.
- workflow.detected
- policy.evaluated
- approval.requested
- git.action.planned
- git.action.executed

이 접근은 단순한 유틸 호출의 비용은 낮게 유지하면서, 정책과 변경 흐름은 명시적으로 추적 가능하게 만든다.

### Frontend Architecture

해당 없음.  
본 프로젝트는 UI 애플리케이션이 아니라 Node.js 기반 런타임 플러그인이다. 사용자 상호작용은 훅과 승인 프롬프트를 통해 이루어진다.

### Infrastructure & Deployment

기존 build/release/installer 구조를 유지하되, 품질 보장 기준은 CI 중심으로 표준화한다.

- Build pipeline remains script-driven
- Release verification becomes CI-enforced
- Installer assets remain first-class deployment outputs
- Artifact integrity checks should include manifest and checksums verification

권장 배포 흐름:
1. test
2. build
3. release artifact validation
4. installer packaging / publish preparation

이 결정은 현재 배포 모델을 유지하면서도 재현성과 신뢰도를 높인다.

### Decision Impact Analysis

**Implementation Sequence:**
1. approval/policy service 추출
2. config schema 정의 및 Ajv 검증 계층 도입
3. 핵심 Git 변경 흐름 command/event 구조화
4. audit event schema 정리
5. CI 검증 파이프라인 강화

**Cross-Component Dependencies:**
- approval/policy service는 config 계층과 git orchestration 계층 모두에 의존한다.
- config validation은 legacy compatibility bridge와 직접 연결된다.
- structured audit events는 approval, policy, git execution 경로 전체에 걸쳐 공통 계약이 된다.
- CI standardization은 build/release scripts와 installer outputs를 모두 검증 대상으로 묶는다.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
AI 에이전트들이 서로 다르게 구현할 가능성이 큰 지점은 네이밍, 훅과 서비스 경계, 정책 결과 포맷, 구조화 이벤트 스키마, 오류 처리 계약, 테스트 위치와 계약 테스트 범위다.

### Naming Patterns

**Database Naming Conventions:**
- 별도 데이터베이스는 사용하지 않는다.
- 설정 스키마 키는 `camelCase`를 기본으로 한다.
- 설정 버전 필드는 `schemaVersion`으로 통일한다.

**API Naming Conventions:**
- 외부 HTTP API는 기본 아키텍처 범위에 포함하지 않는다.
- 내부 이벤트명은 `dot.case`를 사용한다.
- 정책 결과 상태값은 `allow`, `deny`, `ask`, `skip` 네 개의 고정 문자열만 사용한다.

**Code Naming Conventions:**
- 파일명: `kebab-case.js`
- 함수/변수명: `camelCase`
- 생성자/클래스/명령 객체명: `PascalCase`
- command 객체명: `PascalCase + Command`
- 설정/이벤트 상수명: `SCREAMING_SNAKE_CASE`

### Structure Patterns

**Project Organization:**
- 훅 파일은 얇게 유지하고 오케스트레이션만 담당한다.
- 정책 판정은 중앙 `approval/policy service` 계층에서 수행한다.
- Git 실행은 별도 orchestration/executor 계층에 둔다.
- 설정 로드, 병합, 검증은 `config` 계층에만 둔다.
- 감사 로깅은 도메인 로직에서 직접 콘솔 호출하지 않고 logger/audit adapter를 통해서만 수행한다.

**File Structure Patterns:**
- `src/hooks/`: 런타임 훅 진입점
- `src/config/`: 설정 기본값, 로더, 스키마, 마이그레이션
- `src/audit/`: 구조화 감사 이벤트 로깅
- `src/adapters/`: 파일시스템, 콘솔, HTTP 등 외부 의존성 어댑터
- `src/services/`: approval/policy, workflow, git orchestration
- `src/commands/`: 상태 변경용 command 정의
- `src/events/`: 구조화 이벤트 정의와 payload 계약
- `tests/`: 회귀 테스트 및 계약 테스트

### Format Patterns

**API Response Formats:**
- 외부 API 응답 래퍼는 현재 범위에서 정의하지 않는다.
- 내부 정책 판정 결과는 항상 동일한 객체 형식을 따른다:

```js
{
  outcome: "allow" | "deny" | "ask" | "skip",
  reason: "short-machine-code",
  message: "human readable message",
  details: {}
}
```

**Data Exchange Formats:**
- JSON 필드명은 `camelCase`
- 날짜/시간은 ISO-8601 문자열
- boolean은 `true`/`false`
- nullable 필드는 명시적으로 `null` 허용 여부를 스키마에 기록
- 구조화 이벤트 payload는 평면적인 최상위 메타데이터 + 중첩 `details` 객체 형태를 기본으로 한다.

### Communication Patterns

**Event System Patterns:**
- 이벤트명은 `dot.case`
- 이벤트 payload 기본 형식:

```js
{
  event: "policy.evaluated",
  timestamp: "ISO-8601",
  workflow: "...",
  command: "...",
  outcome: "...",
  details: {}
}
```

- 구조화 필수 이벤트:
  - `workflow.detected`
  - `policy.evaluated`
  - `approval.requested`
  - `approval.resolved`
  - `approval.resolution.failed`
  - `approval.prompt.delivery.failed`
  - `git.action.planned`
  - `git.action.executed`
  - `git.action.skipped`
  - `git.action.recovery.offered`
  - `git.action.recovery.selected`
  - `git.action.recovery.completed`
  - `git.action.recovery.blocked`
  - `git.readiness.checked`
  - `compat.bridge.generated`
  - `config.validation.failed`

**State Management Patterns:**
- 설정 상태는 불변 값처럼 취급하고 병합 결과를 새 객체로 생성한다.
- 훅 처리 중 생성되는 런타임 상태는 명시적 컨텍스트 객체로 전달한다.
- 암묵적 전역 mutable state는 금지한다.

### Process Patterns

**Error Handling Patterns:**
- 오류 객체 기본 형식:

```js
{
  code: "MACHINE_READABLE_CODE",
  message: "human readable message",
  recoverable: true,
  details: {}
}
```

- 설정 검증 실패, 정책 거부, Git 실행 실패는 구분된 오류 코드 집합을 사용한다.
- 실패는 단순 throw로 끝내지 않고 복구 가능 여부를 함께 표준화한다.
- 레거시 브리지는 검증 통과 후에만 생성한다.

**Loading State Patterns:**
- UI loading state는 없고, 워크플로우 처리 단계 상태만 존재한다.
- 장시간 작업은 `planned -> executing -> completed|failed|skipped` 단계 모델을 따른다.
- 승인 대기 상태는 별도 `awaitingApproval` 상태로 명시한다.

### Enforcement Guidelines

**All AI Agents MUST:**
- 훅에서 직접 Git 변경 실행 정책을 결정하지 않는다.
- 구조화 감사 이벤트에서는 정의된 이벤트명과 payload 형식을 준수한다.
- 새 설정 키, 정책 결과, 이벤트 타입을 추가할 때 스키마와 테스트를 함께 갱신한다.

**Pattern Enforcement:**
- 회귀 테스트와 계약 테스트에서 정책 결과 형식, 이벤트 payload, 설정 스키마를 검증한다.
- 패턴 위반은 architecture 문서 또는 후속 ADR에 기록한다.
- 규칙 변경이 필요하면 먼저 아키텍처 문서를 갱신한 뒤 구현을 변경한다.

### Pattern Examples

**Good Examples:**
- `src/hooks/tool-execute-before.js`는 입력을 받고 `approvalPolicyService.evaluate(...)`를 호출한 뒤 결과를 위임한다.
- `src/config/schema/runtime-config.schema.json`이 설정 계약의 기준이 된다.
- `audit.log({ event: "policy.evaluated", ... })` 형태로 구조화된 이벤트를 기록한다.

**Anti-Patterns:**
- 훅 파일 안에서 직접 `git commit` 실행 여부를 분기하는 것
- `allowed`, `approved`, `permit`처럼 결과 상태 문자열을 제각각 쓰는 것
- 검증되지 않은 설정을 브리지 파일로 즉시 복사하는 것
- 감사 로그에 자유 형식 문자열만 남기고 machine-readable metadata를 누락하는 것

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
opencode-aidd-plugin/
├─ README.md
├─ CHANGELOG.md
├─ package.json
├─ .gitignore
├─ .github/
│  └─ workflows/
│     ├─ ci.yml
│     └─ release.yml
├─ src/
│  ├─ index.js
│  ├─ adapters/
│  │  ├─ console.js
│  │  ├─ fs.js
│  │  └─ http.js
│  ├─ audit/
│  │  ├─ logger.js
│  │  ├─ event-types.js
│  │  └─ format-audit-event.js
│  ├─ commands/
│  │  ├─ prepare-branch-command.js
│  │  ├─ request-approval-command.js
│  │  ├─ finalize-workflow-command.js
│  │  └─ propose-push-command.js
│  ├─ config/
│  │  ├─ defaults.js
│  │  ├─ load-config.js
│  │  ├─ merge-config.js
│  │  ├─ validate-config.js
│  │  ├─ migrations/
│  │  │  └─ migrate-config.js
│  │  └─ schema/
│  │     └─ runtime-config.schema.json
│  ├─ events/
│  │  ├─ emit-event.js
│  │  ├─ event-contracts.js
│  │  └─ event-payloads.js
│  ├─ hooks/
│  │  ├─ command-execute-before.js
│  │  ├─ tool-execute-before.js
│  │  ├─ tool-execute-after.js
│  │  ├─ permission-asked.js
│  │  ├─ file-edited.js
│  │  └─ session.js
│  ├─ services/
│  │  ├─ approval/
│  │  │  ├─ approval-policy-service.js
│  │  │  ├─ classify-git-action.js
│  │  │  └─ build-approval-request.js
│  │  ├─ git/
│  │  │  ├─ git-workflow-service.js
│  │  │  ├─ git-executor.js
│  │  │  ├─ branch-service.js
│  │  │  ├─ commit-service.js
│  │  │  └─ push-service.js
│  │  ├─ workflow/
│  │  │  ├─ detect-workflow-context.js
│  │  │  ├─ resolve-workflow-policy.js
│  │  │  └─ workflow-state.js
│  │  └─ compat/
│  │     └─ legacy-bridge-service.js
│  ├─ policies/
│  │  └─ legacy/
│  │     └─ devai-git-workflo.js
│  └─ utils/
│     ├─ constants.js
│     ├─ result.js
│     ├─ errors.js
│     └─ time.js
├─ scripts/
│  ├─ build.js
│  ├─ make-release.js
│  └─ upload-azure.ps1
├─ installer/
│  ├─ install.ps1
│  ├─ install.sh
│  └─ uninstall.ps1
├─ templates/
│  ├─ global-config.jsonc
│  └─ project-config.jsonc
├─ dist/
├─ release/
└─ tests/
   ├─ regression.test.js
   ├─ contracts/
   │  ├─ approval-policy.contract.test.js
   │  ├─ audit-events.contract.test.js
   │  └─ runtime-config.contract.test.js
   ├─ integration/
   │  ├─ hooks.integration.test.js
   │  └─ workflow.integration.test.js
   └─ fixtures/
      ├─ config/
      ├─ git/
      └─ events/
```

### Architectural Boundaries

**API Boundaries:**
- 외부 HTTP API는 기본 구조에 없다.
- 외부와의 경계는 `installer`, `release assets`, 선택적 `http adapter`다.

**Component Boundaries:**
- `hooks/`는 런타임 진입점만 담당한다.
- `services/approval`은 정책 판정과 승인 요청 생성만 담당한다.
- `services/git`은 실제 Git 실행 계획과 실행만 담당한다.
- `config/`는 설정 병합, 검증, 마이그레이션만 담당한다.
- `audit/`와 `events/`는 추적성과 구조화 이벤트 계약을 담당한다.

**Service Boundaries:**
- 훅 -> workflow context 탐지 -> approval/policy 판정 -> git orchestration -> audit/event 기록
- 레거시 코어는 `policies/legacy/`에 고립시키고, 새 구조는 바깥에서 감싼다.

**Data Boundaries:**
- 영속 데이터는 설정 파일뿐이다.
- Git 저장소 상태는 외부 시스템 상태로 취급한다.
- 세션 상태는 메모리 컨텍스트로만 유지한다.

### Requirements to Structure Mapping

**Feature/FR Mapping:**
- 워크플로우 인식: `src/services/workflow/`
- 승인 기반 Git 통제: `src/services/approval/`
- 브랜치/커밋/push 실행: `src/services/git/`
- 설정 우선순위/호환성: `src/config/`, `src/services/compat/`
- 감사 로그/추적성: `src/audit/`, `src/events/`
- 런타임 통합: `src/hooks/`, `src/index.js`

**Cross-Cutting Concerns:**
- 레거시 호환: `src/policies/legacy/`, `src/services/compat/`
- 구조화 이벤트 계약: `src/events/`, `tests/contracts/`
- 설정 계약 검증: `src/config/schema/`, `src/config/validate-config.js`

### Integration Points

**Internal Communication:**
- 단순 조회는 direct call
- 승인/실행/최종화는 command/event 중심
- 표준 결과 객체와 구조화 이벤트를 공통 계약으로 사용

**External Integrations:**
- 로컬 파일시스템
- Git CLI/저장소 상태
- 선택적 HTTP 로깅 endpoint
- 릴리스 배포 스크립트/스토리지

**Data Flow:**
1. 훅이 입력 수신
2. workflow context 탐지
3. config 로드 및 검증
4. approval/policy 판정
5. Git action 계획
6. 사용자 승인 필요 시 요청
7. 실행 또는 skip/deny
8. audit/event 기록

### File Organization Patterns

**Configuration Files:**
- 루트 설정은 최소화
- 런타임 설정 계약은 `src/config/schema/`
- 샘플 설정은 `templates/`
- 실제 설치/사용자 설정은 프로젝트 외부 위치

**Source Organization:**
- 진입점, 훅, 서비스, 설정, 감사, 이벤트, 유틸을 명확히 분리
- 새 기능은 훅이 아니라 `services/` 아래에 먼저 추가

**Test Organization:**
- 기존 회귀 테스트 유지
- 계약 테스트는 `tests/contracts/`
- 통합 흐름 테스트는 `tests/integration/`
- fixture는 `tests/fixtures/`

**Asset Organization:**
- 설치 관련 산출물은 `installer/`
- 빌드 산출물은 `dist/`
- 배포 패키지는 `release/`

### Development Workflow Integration

**Development Server Structure:**
- 서버 앱은 아니므로 dev server 개념보다 훅 기반 실행 경로 검증이 중요하다.

**Build Process Structure:**
- `scripts/build.js`는 `src/`를 번들링
- `scripts/make-release.js`는 `dist`, `installer`, `templates`를 조합해 배포 자산 생성

**Deployment Structure:**
- CI가 테스트, 빌드, 릴리스 자산 검증 수행
- 설치 스크립트가 최종 사용자 배포 진입점 역할 수행
