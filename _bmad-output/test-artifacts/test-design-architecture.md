---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-05-18'
workflowType: 'testarch-test-design'
inputDocuments:
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/README.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/package.json
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/src/index.js
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/tests/regression.test.js
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard/planning-artifacts/architecture.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard/implementation-artifacts/tech-spec-opencode-native-event-plugin.md
---

# Test Design for Architecture: devai 플러그인 TUI E2E 회귀

**Purpose:** 실제 `devai` TUI 기반 회귀 테스트를 구현하기 전에 아키텍처 관점의 테스트 가능성, 리스크, 선결 조건을 정리한다. 이 문서는 QA와 Engineering 사이의 계약 문서다.

**Date:** 2026-05-18
**Author:** Codex
**Status:** Architecture Review Pending
**Project:** opencode-aidd-plugin
**PRD Reference:** 없음. 사용자 요구사항과 [README.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/README.md) 기준
**ADR Reference:** [architecture.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard/planning-artifacts/architecture.md), [tech-spec-opencode-native-event-plugin.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/docs/legacy/bmad-output/git-workflow-guard/implementation-artifacts/tech-spec-opencode-native-event-plugin.md)

---

## Executive Summary

**Scope:** JS 함수 단위 테스트가 아닌 실제 `devai` TUI 프로세스를 띄워, 실제 모델 응답과 devai 플러그인의 로드/훅/로그/정책 차단/파일 변경 흐름을 검증하는 회귀 테스트 설계

**Business Context**

- **Revenue/Impact:** 플러그인의 핵심 가치는 “실사용 흐름에서의 Git/workflow guard 동작”이다.
- **Problem:** 현재 회귀 검증은 주로 in-process mock client 기반이라, 실제 TUI 런타임과 모델 응답이 개입되는 경계는 자동 보장이 약하다.
- **GA Launch:** 즉시 적용 가능한 설계 산출물이 목표

**Architecture**

- **Key Decision 1:** TUI E2E는 실제 `devai` 프로세스를 PTY로 구동해야 한다.
- **Key Decision 2:** 모델 응답은 exact match 하지 않고 stable signal 기준으로 판정한다.
- **Key Decision 3:** 기본 드라이버는 `node-pty` 중심, `@xterm/headless`를 보조 상태 추적 계층으로 사용하는 것이 현재 저장소와 가장 잘 맞는다.

**Expected Scale**

- PR 필수 스모크: 4개 P0 시나리오
- Nightly 회귀: P0+P1 8개 내외
- Weekly/on-demand: 환경 변형 및 장애계열 P2 3개 내외

**Risk Summary**

- **Total risks**: 7
- **High-priority (>=6)**: 5
- **Test effort**: ~11개 시나리오, 초기 구현 ~60-88시간

---

## Quick Guide

### BLOCKERS - Team Must Decide

1. **B-001: Cross-platform PTY Driver** - Windows 개발 환경과 Linux CI를 모두 고려할 기본 드라이버를 확정해야 한다. 권장 소유자: Plugin Dev
2. **B-002: Durable External Signals** - 실제 TUI 바깥에서 읽을 수 있는 로그/아티팩트 경로를 표준화해야 한다. 권장 소유자: Plugin Dev
3. **B-003: Fixture Isolation Contract** - 테스트마다 별도 workspace/log/artifact/config 격리를 강제하는 구조가 필요하다. 권장 소유자: QA + Plugin Dev

### HIGH PRIORITY - Team Should Validate

1. **R-002: Model nondeterminism** - exact match 대신 stable signal 세트로 판정하는 정책을 승인해야 한다. 권장 소유자: QA Lead
2. **R-005: Credential safety** - 실제 모델 자격 증명을 쓰되 저권한/테스트 전용으로 분리하는 운영 방식을 승인해야 한다. 권장 소유자: DevOps
3. **R-006: PR runtime budget** - PR에서는 P0만, 확장 회귀는 nightly/weekly로 분리하는 운영 모델을 승인해야 한다. 권장 소유자: Tech Lead

### INFO ONLY - Solutions Provided

1. **Test strategy**: 전부 E2E이나, lower-level 회귀와 중복하지 않도록 “실제 TUI 경계”에만 집중한다.
2. **Tooling**: `node-pty` + `@xterm/headless` 기본, `agent-tui`/`pilotty`는 Linux 전용 옵션으로 보류
3. **Tiered CI/CD**: PR=P0, Nightly=P0+P1, Weekly/on-demand=P2
4. **Coverage**: P0 4개, P1 4개, P2 3개
5. **Quality gates**: P0 100%, P1 >=95%, 모든 P0 실패는 transcript/log/artifact를 남겨야 함

---

## Risk Assessment

**Total risks identified**: 7 (5 high-priority, 2 medium, 0 low)

### High-Priority Risks (Score >=6) - IMMEDIATE ATTENTION

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **R-001** | **TECH** | `agent-tui`와 `pilotty`는 Windows를 지원하지 않아 기본 드라이버로 채택 시 로컬 실행이 깨질 수 있다. | 3 | 3 | **9** | `node-pty` 기본화, 서드파티 드라이버는 선택 어댑터로 제한 | Plugin Dev | Pre-implementation |
| **R-002** | **OPS** | 실제 모델 응답 변동성으로 테스트가 쉽게 flaky 해질 수 있다. | 3 | 3 | **9** | stable signal oracle, bounded prompt, deterministic wait, transcript 저장 | QA + Plugin Dev | Pre-implementation |
| **R-003** | **DATA** | 파일 변경/아티팩트가 테스트 간 누수되면 결과 신뢰성이 무너진다. | 2 | 3 | **6** | test별 temp repo, 고유 artifact root, teardown 강제 | QA | Pre-implementation |
| **R-004** | **BUS** | 화면 텍스트만 보면 핵심 플러그인 regressions를 놓칠 수 있다. | 2 | 3 | **6** | `plugin_loaded`, `hook_called`, file diff, artifact oracle을 P0에 포함 | QA + Plugin Dev | Pre-implementation |
| **R-005** | **SEC** | 실제 provider credential 사용 중 과도한 권한이나 예기치 않은 mutating flow가 실행될 수 있다. | 2 | 3 | **6** | 테스트 전용 저권한 키, deny fixture, 격리 workspace | DevOps + Plugin Dev | Before CI enablement |

### Medium-Priority Risks (Score 3-5)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-006 | PERF | PTY + model latency로 PR runtime/cost가 과도해질 수 있다. | 2 | 2 | 4 | PR에는 P0만 유지, 나머지는 nightly/weekly | QA |
| R-007 | OPS | 터미널 출력 안정화 전에 스냅샷하면 false negative가 날 수 있다. | 2 | 2 | 4 | hash settle, keyword wait, log wait 기반 동기화 | QA |

### Low-Priority Risks (Score 1-2)

현재 해당 없음.

#### Risk Category Legend

- **TECH**: 드라이버, 아키텍처, 플랫폼 적합성
- **SEC**: 권한, 정책 차단, 자격 증명 안전성
- **PERF**: 실행 시간, 비용, 처리량
- **DATA**: 파일/아티팩트/상태 오염
- **BUS**: 핵심 사용자 가치 훼손
- **OPS**: CI, 동기화, 장애 처리

---

## Testability Concerns and Architectural Gaps

### ACTIONABLE CONCERNS

#### 1. Blockers to Fast Feedback

| Concern | Impact | What Architecture Must Provide | Owner | Timeline |
| --- | --- | --- | --- | --- |
| **Cross-platform PTY mismatch** | Windows 로컬 실행 불가 가능성 | `node-pty` 기반 공통 driver contract 또는 Linux-only CI 선언 | Plugin Dev | Pre-implementation |
| **External observability gap** | 실제 TUI E2E에서 hook/log 확인 불가 | fixture가 읽을 수 있는 log file / artifact directory 표준화 | Plugin Dev | Pre-implementation |
| **Fixture contamination** | flaky, false diff, cleanup 실패 | scenario별 temp workspace, env, artifact path 격리 규약 | QA + Plugin Dev | Pre-implementation |

#### 2. Architectural Improvements Needed

1. **Stable signal schema**
   - **Current problem**: in-process test는 audit payload를 바로 읽지만, 외부 TUI에서는 같은 강도의 oracle이 없다.
   - **Required change**: `plugin_loaded`, `hook_called`, policy outcome, artifact path를 파일 로그에 남기는 일관된 schema 정의
   - **Impact if not fixed**: 화면 문자열 기반 취약한 assertions로 회귀 신뢰도 저하
   - **Owner**: Plugin Dev
   - **Timeline**: Pre-implementation

2. **Driver abstraction layer**
   - **Current problem**: 드라이버 후보별 capability가 다르고 일부는 Windows 미지원이다.
   - **Required change**: `spawn`, `type`, `press`, `waitForText`, `waitForStable`, `captureTranscript`, `kill` 최소 인터페이스 정의
   - **Impact if not fixed**: 도구 교체 시 테스트 전체 재작성
   - **Owner**: Plugin Dev
   - **Timeline**: Implementation phase

3. **Artifact-first failure handling**
   - **Current problem**: PTY hang이나 모델 오류 시 재현 근거가 부족할 수 있다.
   - **Required change**: timeout/failure 시 transcript, log, workspace diff, stderr를 자동 저장
   - **Impact if not fixed**: CI 실패 triage 비용 증가
   - **Owner**: QA
   - **Timeline**: Implementation phase

---

### Testability Assessment Summary

#### What Works Well

- 기존 E2E/regression 테스트가 이미 real git + temp workspace 패턴을 사용한다.
- 플러그인 설계가 audit event와 workflow state 전이를 중심으로 되어 있어 stable signal 기반 oracle 설계에 유리하다.
- 테스트 러너가 plain Node 스크립트 기반이라 PTY 하네스를 자연스럽게 추가할 수 있다.

#### Accepted Trade-offs

- **모델 응답 전문 비교는 포기** - 이 테스트의 목적은 자연어 품질 검증이 아니라 플러그인 회귀 검출이므로 acceptable
- **서드파티 TUI driver 우선 도입은 보류 가능** - 현재 저장소의 플랫폼 요구를 고려하면 자체 driver가 더 현실적

---

## Risk Mitigation Plans

### R-001: Cross-platform PTY mismatch (Score: 9) - CRITICAL

**Mitigation Strategy:**

1. `node-pty` 기반 `devai-driver` 최소 인터페이스를 정의한다.
2. `@xterm/headless`를 transcript/state 추적에만 사용한다.
3. `agent-tui`/`pilotty`는 별도 adapter experiment로만 관리한다.

**Owner:** Plugin Dev  
**Timeline:** 구현 시작 전  
**Status:** Planned  
**Verification:** Windows 로컬과 Linux CI에서 동일 scenario 1개 이상 통과

### R-002: Model nondeterminism (Score: 9) - CRITICAL

**Mitigation Strategy:**

1. exact text 금지 원칙을 테스트 규약에 명시한다.
2. scenario별 keyword allowlist와 negative marker set을 정의한다.
3. timeout 시 transcript와 logs를 자동 저장한다.

**Owner:** QA + Plugin Dev  
**Timeline:** 구현 시작 전  
**Status:** Planned  
**Verification:** 동일 시나리오 3회 반복 시 stable-signal oracle 유지

### R-003: Fixture contamination (Score: 6) - HIGH

**Mitigation Strategy:**

1. temp workspace per test를 강제한다.
2. artifact root와 log path를 UUID 기반으로 분리한다.
3. teardown에서 PTY 종료와 temp cleanup을 항상 수행한다.

**Owner:** QA  
**Timeline:** 구현 단계  
**Status:** Planned  
**Verification:** 연속 실행 시 이전 테스트의 파일/로그가 다음 테스트에 나타나지 않음

### R-004: Weak user-visible-only oracle (Score: 6) - HIGH

**Mitigation Strategy:**

1. P0 oracle에 terminal + log + file/artifact의 2중 채널을 사용한다.
2. 모든 P0 시나리오에 hook/log side effect assertion을 포함한다.

**Owner:** QA + Plugin Dev  
**Timeline:** 구현 단계  
**Status:** Planned  
**Verification:** 의도적으로 hook log를 제거한 defect 주입 시 P0 실패

### R-005: Credential and mutating-flow safety (Score: 6) - HIGH

**Mitigation Strategy:**

1. provider test key를 별도 발급한다.
2. mutating fixture는 temp repo 밖 경로를 참조하지 못하게 제한한다.
3. 정책 차단 fixture를 PR 필수 시나리오로 유지한다.

**Owner:** DevOps + Plugin Dev  
**Timeline:** CI enablement 전  
**Status:** Planned  
**Verification:** 보호 파일 대상 시나리오에서 mutation 부재와 block message 동시 확인

---

## Assumptions and Dependencies

### Assumptions

1. `devai` CLI/TUI는 비대화형 subprocess로 실행 가능하다.
2. 플러그인 로그를 파일 또는 확인 가능한 sink로 라우팅할 수 있다.
3. 실제 모델 호출을 위한 테스트용 provider credential을 분리할 수 있다.

### Dependencies

1. `devai` 실행 경로 및 테스트용 config contract 확정 - 구현 시작 전 필요
2. 로그/아티팩트 저장 위치 표준화 - 구현 시작 전 필요
3. CI 환경에서 provider secret 주입 방식 정의 - CI enablement 전 필요

### Risks to Plan

- **Risk**: `devai` 런타임이 외부 PTY 제어에 예상보다 민감할 수 있음
  - **Impact**: 초기 하네스 개발 기간 증가
  - **Contingency**: 첫 단계에서 최소 happy-path smoke만 자동화하고 나머지 확장

---

**Next Steps for Architecture Team:**

1. 기본 PTY 드라이버 전략 승인
2. 외부 관측 가능한 로그/아티팩트 contract 승인
3. provider credential 및 CI runtime 정책 승인

**Next Steps for QA Team:**

1. QA 문서의 fixture 구조와 P0 시나리오 기준으로 구현 backlog 작성
2. 첫 P0 smoke 구현 후 transcript/log artifact 품질 확인
