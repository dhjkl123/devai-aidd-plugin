---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-qa.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-architecture.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design/opencode-aidd-plugin-handoff.md
---

# opencode-aidd-plugin - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for opencode-aidd-plugin, decomposing the TEA test design artifacts into implementable stories for a P0/P1 TUI E2E regression suite that drives the real `devai` TUI over PTY.

## Requirements Inventory

### Functional Requirements

FR1: 테스트 스위트는 Windows 로컬과 Linux CI에서 실제 `devai` TUI 프로세스를 PTY로 구동하고 제어할 수 있어야 한다.

FR2: 테스트 스위트는 실제 TUI 세션에서 플러그인 로드 성공을 검증하고 `plugin_loaded` 신호 또는 동등한 외부 관측 근거를 남겨야 한다.

FR3: 테스트 스위트는 실제 모델 응답이 발생한 세션에서 프롬프트 처리 완료를 검증해야 하며, exact-match 대신 stable signal 기반 오라클을 사용해야 한다.

FR4: 테스트 스위트는 mutating 시나리오에서 hook 실행과 fixture 소유 파일 또는 artifact 변경을 함께 검증해야 한다.

FR5: 테스트 스위트는 policy block 시나리오에서 차단 메시지와 보호 파일 무변경 상태를 함께 검증해야 한다.

FR6: 모든 핵심 시나리오는 transcript, plugin log, stdout/stderr dump, workspace diff를 artifact로 남겨야 하며, 실패 시에도 동일해야 한다.

FR7: 각 시나리오는 격리된 temp workspace, artifact root, log path를 사용해 이전 실행의 상태 오염 없이 반복 가능해야 한다.

FR8: 스위트는 P0/P1 우선순위 실행 모델을 제공해 PR에서는 P0만, nightly에서는 P0+P1을 선택적으로 실행할 수 있어야 한다.

FR9: transcript와 plugin log는 동일한 session 기준으로 상호 추적 가능해야 하며, multi-turn 및 deny/recovery 흐름에서도 유지되어야 한다.

FR10: provider/network 지연이나 출력 정착 지연이 있어도 테스트가 hang 되지 않고 timeout 복구와 triage artifact를 남겨야 한다.

FR11: 정상적인 쓰기 허용 프로젝트에서는 false-positive policy block 없이 흐름이 완료되어야 한다.

### NonFunctional Requirements

NFR1: 모델 응답 검증은 exact text 비교를 금지하고 keyword allowlist, negative marker, stable signal을 사용해야 한다.

NFR2: P0 PR 스위트는 대략 8분에서 15분 범위 내에서 실행 가능해야 한다.

NFR3: P0+P1 nightly 스위트는 대략 15분에서 30분 범위 내에서 실행 가능해야 한다.

NFR4: 로컬 기본 환경은 Windows + PowerShell, 권위 있는 CI 실행 환경은 Linux runner를 기준으로 설계해야 한다.

NFR5: 모든 테스트는 fixture contamination을 방지하기 위해 독립된 temp workspace와 deterministic teardown을 사용해야 한다.

NFR6: 실패 triage를 위해 timeout, fatal error, deny 상태 모두에서 artifact 자동 수집이 보장되어야 한다.

NFR7: 실제 모델 반응을 위한 provider credential은 테스트 전용 최소 권한 비밀로 주입되어야 한다.

NFR8: protected fixture 관련 검증은 변조 전후 diff와 무변경 assertion을 모두 남겨야 한다.

NFR9: wait 전략은 PTY hang과 snapshot race를 방지하도록 deterministic waiter와 timeout recovery를 포함해야 한다.

NFR10: 새 TUI E2E 스위트는 기존 `npm test` 하위 회귀군과 공존해야 하며, 기존 lower-level 회귀를 대체하지 않고 보강해야 한다.

### Additional Requirements

- 기본 PTY 드라이버는 `node-pty`를 사용하고, transcript 또는 terminal state 정규화가 필요하면 `@xterm/headless`를 보조적으로 사용한다.
- 드라이버 계약은 최소 `spawn`, `type`, `press`, `waitForText`, `waitForStable`, `captureTranscript`, `kill` API를 제공해야 한다.
- 최소 fixture 프로젝트는 `happy-path`, `mutate-file`, `policy-block` 세 종류를 제공해야 한다.
- artifact 식별자는 최소 `transcript.txt`, `workspace-diff.json`, plugin log, stdout/stderr dump를 포함해야 한다.
- 오라클은 terminal-only 검증을 금지하고 terminal, log, file/artifact 중 2개 이상 채널을 함께 사용해야 한다.
- session-correlated observability를 위해 transcript와 plugin log가 동일 session key 또는 등가 식별자를 공유해야 한다.
- P0 시나리오는 `plugin_loaded`, `hook_called`, deny/block 결과, protected file immutability를 직접 검증해야 한다.
- 테스트 명령 또는 태그 체계는 PR용 P0, nightly용 P0+P1, on-demand용 P2 확장을 고려해야 한다.
- provider/network 실패 시에도 hung PTY를 남기지 않도록 강제 kill과 failure artifact flush가 필요하다.
- CI에는 테스트 전용 provider secret과 `devai` 실행 경로 또는 config contract가 명시되어야 한다.

### UX Design Requirements

해당 없음. 본 작업은 TUI E2E 회귀 스위트 설계이며 별도 UX 설계 입력 문서는 없었다.

### FR Coverage Map

FR1: Epic 1 - 실제 `devai` PTY 드라이버와 시나리오 실행 기반 구축

FR2: Epic 1 - 플러그인 로드 smoke 검증과 외부 관측 신호 확보

FR3: Epic 1 - 실제 모델 응답이 있는 prompt-response P0 smoke 검증

FR4: Epic 2 - mutating hook 실행과 side effect 검증

FR5: Epic 2 - policy block과 protected file immutability 검증

FR6: Epic 1, Epic 2, Epic 3 - 모든 시나리오 artifact 수집과 failure triage 일관화

FR7: Epic 1 - temp workspace 및 log/artifact 격리 기반 구축

FR8: Epic 3 - P0/P1 선택 실행과 PR/nightly 운영 분리

FR9: Epic 2, Epic 3 - session-correlated observability와 multi-turn 추적

FR10: Epic 3 - deterministic waiter, timeout recovery, provider/network failure handling

FR11: Epic 2 - 허용된 쓰기 시나리오의 false-positive block 방지 검증

## Epic List

### Epic 1: 실제 devai 세션 스모크와 관측 기반 구축
QA와 유지보수자는 실제 `devai` TUI를 PTY로 구동해 플러그인 로드와 모델 응답이 살아 있는 세션을 재현하고, 신뢰 가능한 artifact를 수집할 수 있다.
**FRs covered:** FR1, FR2, FR3, FR6, FR7

### Epic 2: 안전한 변경 및 차단 워크플로우 회귀 보호
QA와 유지보수자는 hook 실행, 파일 변경, policy block, deny/recovery, false-positive block 여부를 실제 세션 기준으로 검증할 수 있다.
**FRs covered:** FR4, FR5, FR6, FR9, FR11

### Epic 3: 운영 가능한 P0/P1 회귀 스위트 정착
팀은 우선순위별 스위트를 PR과 nightly에 맞게 운영하고, flaky 원인을 빠르게 추적하며, timeout과 provider 이슈에도 회복 가능한 회귀 체계를 유지할 수 있다.
**FRs covered:** FR6, FR8, FR9, FR10

## Epic 1: 실제 devai 세션 스모크와 관측 기반 구축

실제 `devai` TUI 프로세스를 PTY로 구동하고, 격리된 fixture/workspace 위에서 플러그인 로드와 실제 모델 응답을 검증하는 최소 P0 기반을 확보한다.

### Story 1.1: PTY 드라이버와 시나리오 실행 골격 구축

As a QA engineer,
I want a reusable PTY driver and isolated scenario scaffold for `devai`,
So that every TUI regression scenario can launch, interact with, and tear down a real session consistently.

**Implements:** FR1, FR7

**Acceptance Criteria:**

**Given** Windows 로컬 또는 Linux CI 환경에서 `devai` 실행 경로와 fixture 작업 디렉터리가 준비되어 있을 때  
**When** 테스트가 드라이버를 통해 세션을 시작하면  
**Then** 드라이버는 `spawn`, `type`, `press`, `waitForText`, `waitForStable`, `captureTranscript`, `kill` 인터페이스를 제공해야 한다  
**And** 테스트 종료 시 PTY 프로세스와 임시 작업 디렉터리가 정리되어야 한다

**Given** 두 개 이상의 시나리오가 같은 테스트 런에서 순차 실행될 때  
**When** 각 시나리오가 시작되면  
**Then** 각각 고유 temp workspace, artifact root, log path를 사용해야 한다  
**And** 이전 시나리오의 파일 변경이나 log가 다음 시나리오에 섞이지 않아야 한다

### Story 1.2: artifact 수집과 stable signal 오라클 유틸리티 구축

As a QA engineer,
I want shared wait/assert helpers and artifact capture utilities,
So that real model response variability does not make the P0 suite brittle.

**Implements:** FR3, FR6

**Acceptance Criteria:**

**Given** 실제 모델 출력이 토큰 단위로 지연되거나 변동적으로 도착할 때  
**When** 테스트가 완료 조건을 판정하면  
**Then** exact text equality가 아니라 keyword allowlist, negative marker, output settle 기준을 사용해야 한다  
**And** fatal, uncaught, traceback 같은 실패 마커를 공통으로 탐지해야 한다

**Given** 시나리오가 성공하거나 실패할 때  
**When** artifact flush가 실행되면  
**Then** 최소 `transcript.txt`, stdout/stderr dump, plugin log copy, `workspace-diff.json`가 남아야 한다  
**And** timeout 또는 assertion 실패여도 artifact 수집은 건너뛰지 않아야 한다

### Story 1.3: 플러그인 로드 P0 smoke 시나리오 작성

As a maintainer,
I want a real-session smoke test for plugin bootstrap,
So that a broken plugin load is caught before deeper workflow tests run.

**Implements:** FR2, FR6

**Acceptance Criteria:**

**Given** `happy-path` fixture와 실제 `devai` 세션이 시작될 때  
**When** TUI가 초기화되고 플러그인이 로드되면  
**Then** transcript 또는 plugin log에서 `plugin_loaded`에 해당하는 외부 관측 근거가 확인되어야 한다  
**And** 세션 초기 구간에서 fatal startup error가 없어야 한다

**Given** 플러그인이 로드되지 않았거나 bootstrap 중 예외가 발생할 때  
**When** smoke 시나리오가 실패하면  
**Then** 실패 원인을 추적할 수 있는 transcript와 plugin log artifact가 남아야 한다  
**And** 후속 시나리오가 오염되지 않도록 세션이 정리되어야 한다

### Story 1.4: 실제 모델 응답 P0 smoke 시나리오 작성

As a maintainer,
I want a prompt-response smoke test against the real model,
So that the suite proves the plugin works in a live TUI interaction rather than only in mocked flows.

**Implements:** FR3, FR6

**Acceptance Criteria:**

**Given** 실제 provider credential이 주입된 `happy-path` fixture가 있을 때  
**When** 테스트가 짧고 bounded된 프롬프트를 입력하고 응답 완료를 기다리면  
**Then** transcript에는 allowlist keyword 중 하나 이상이 나타나야 한다  
**And** exact-match 비교 없이 stable-signal 오라클로 성공을 판정해야 한다

**Given** 응답 생성 중 provider 지연이 있더라도 최종적으로 출력이 정착할 수 있을 때  
**When** `waitForStable`가 완료되면  
**Then** 테스트는 응답 완료 후 artifact를 저장하고 정상 종료해야 한다  
**And** hang 상태 없이 지정된 timeout 정책을 따라야 한다

## Epic 2: 안전한 변경 및 차단 워크플로우 회귀 보호

실제 세션에서 mutating flow와 policy enforcement를 검증해 hook 실행, 변경 side effect, deny/recovery, false-positive block 문제를 회귀로 막는다.

### Story 2.1: mutating 및 policy fixture 계약 정립

As a QA engineer,
I want fixture projects with explicit writable and protected targets,
So that mutation and policy assertions are deterministic and auditable.

**Implements:** FR4, FR5, FR7

**Acceptance Criteria:**

**Given** `mutate-file`, `policy-block`, `happy-path` fixture가 준비될 때  
**When** 각 fixture 구조를 정의하면  
**Then** 어떤 파일이 쓰기 허용 대상인지와 어떤 파일이 보호 대상인지 문서화된 계약이 있어야 한다  
**And** workspace diff가 그 계약을 기준으로 pass/fail 판정을 내릴 수 있어야 한다

**Given** policy-block fixture가 실행될 때  
**When** 테스트가 종료되면  
**Then** protected file의 before/after 상태를 비교할 수 있는 baseline이 있어야 한다  
**And** 무변경 assertion이 실패 artifact와 함께 재현 가능해야 한다

### Story 2.2: mutating hook 실행 P0 시나리오 작성

As a maintainer,
I want a real-session mutating scenario,
So that regressions in hook execution or artifact production are caught with file-level evidence.

**Implements:** FR4, FR6

**Acceptance Criteria:**

**Given** `mutate-file` fixture와 실제 `devai` 세션이 있을 때  
**When** 테스트가 mutating intent를 가진 프롬프트를 보내고 작업 완료를 기다리면  
**Then** plugin log 또는 동등 artifact에서 `hook_called` 신호가 확인되어야 한다  
**And** fixture 소유 파일 또는 artifact에 예상된 변경이 존재해야 한다

**Given** mutating 흐름이 허용되지 않거나 hook이 실행되지 않는 회귀가 생길 때  
**When** 시나리오가 실패하면  
**Then** transcript, plugin log, workspace diff가 함께 저장되어야 한다  
**And** 변경이 발생한 파일 경로가 fixture 허용 범위를 벗어나지 않았는지 검증해야 한다

### Story 2.3: policy block P0 시나리오 작성

As a maintainer,
I want a real-session policy block scenario,
So that protected resources remain unchanged and the user-facing deny signal stays visible.

**Implements:** FR5, FR6

**Acceptance Criteria:**

**Given** `policy-block` fixture에서 보호 파일이 baseline과 함께 준비되어 있을 때  
**When** 테스트가 차단되어야 하는 mutating 요청을 실행하면  
**Then** transcript에는 deny 또는 block을 나타내는 사용자 가시 메시지가 나타나야 한다  
**And** protected file은 baseline 대비 변경되지 않아야 한다

**Given** 차단은 되었지만 observability가 부족한 회귀가 생길 때  
**When** 시나리오가 종료되면  
**Then** plugin log, transcript, workspace diff를 통해 차단 결과와 무변경 상태를 동시에 설명할 수 있어야 한다  
**And** fatal error 없이 세션이 종료되어야 한다

### Story 2.4: deny/recovery P1 시나리오 작성

As a maintainer,
I want a deny-then-recover scenario with correlated artifacts,
So that I can verify observability is preserved across policy transitions in one live session.

**Implements:** FR6, FR9

**Acceptance Criteria:**

**Given** 하나의 실제 `devai` 세션에서 deny 후 재시도 또는 회복 흐름을 실행할 수 있을 때  
**When** 테스트가 첫 요청의 deny 상태와 이후 회복 상태를 모두 수행하면  
**Then** transcript와 plugin log는 동일 session 식별자로 상호 추적 가능해야 한다  
**And** 각 단계의 결과가 artifact에 분리되어 남아야 한다

**Given** deny 이후 세션 상태가 깨지는 회귀가 있을 때  
**When** 회복 단계가 수행되면  
**Then** 테스트는 실패를 명확히 보고하고 관련 artifact를 남겨야 한다  
**And** 세션이 다음 테스트에 영향을 주지 않도록 정리되어야 한다

### Story 2.5: 허용된 쓰기 흐름의 false-positive block 방지 P1 시나리오 작성

As a maintainer,
I want a legitimate write scenario that should pass,
So that the policy layer does not regress into over-blocking safe workflows.

**Implements:** FR11, FR6

**Acceptance Criteria:**

**Given** 허용된 변경 대상만 포함한 writable fixture가 있을 때  
**When** 테스트가 정상적인 쓰기 요청을 실행하면  
**Then** deny/block 메시지 없이 흐름이 완료되어야 한다  
**And** 예상된 파일 또는 artifact 변경이 확인되어야 한다

**Given** false-positive block 회귀가 생길 때  
**When** 시나리오가 실행되면  
**Then** 테스트는 deny 흔적을 실패로 간주해야 한다  
**And** transcript와 workspace diff를 통해 잘못된 차단을 바로 진단할 수 있어야 한다

## Epic 3: 운영 가능한 P0/P1 회귀 스위트 정착

우선순위별 실행, multi-turn 관측, timeout 복구, CI 연결을 정리해 실제 팀 운영에서 지속 가능한 TUI 회귀 스위트를 완성한다.

### Story 3.1: 우선순위 태깅과 실행 엔트리포인트 정리

As a release maintainer,
I want explicit commands and tags for P0 and P1 TUI scenarios,
So that PR과 nightly에서 비용과 신뢰성을 분리 운영할 수 있다.

**Implements:** FR8

**Acceptance Criteria:**

**Given** TUI 시나리오 파일들이 준비되어 있을 때  
**When** 테스트 실행 구성을 정의하면  
**Then** 시나리오별 priority metadata 또는 동등 태깅 방식이 있어야 한다  
**And** PR용 P0만 실행하는 명령과 nightly용 P0+P1을 실행하는 명령이 분리되어야 한다

**Given** 기존 `npm test` 회귀군이 존재할 때  
**When** TUI 스위트를 통합하면  
**Then** lower-level 회귀와 TUI 회귀의 역할이 분리되어야 한다  
**And** 기존 회귀를 대체하지 않고 additive하게 연결되어야 한다

### Story 3.2: multi-turn session correlation P1 시나리오 작성

As a QA engineer,
I want a bounded multi-turn live scenario,
So that transcript와 plugin log의 session correlation이 실제 대화 흐름에서도 유지되는지 검증할 수 있다.

**Implements:** FR9

**Acceptance Criteria:**

**Given** 실제 `devai` 세션에서 2회 이상 상호작용하는 bounded prompt 세트가 있을 때  
**When** 테스트가 순차적으로 여러 입력을 수행하면  
**Then** transcript와 plugin log가 동일 session 기준으로 연결되어야 한다  
**And** 각 턴의 핵심 신호를 추적 가능한 형태로 artifact에 남겨야 한다

**Given** 출력 정착 시점이 턴마다 달라질 수 있을 때  
**When** multi-turn wait 로직이 작동하면  
**Then** 턴별 안정화 기준이 deterministic하게 적용되어야 한다  
**And** snapshot race로 인한 flaky pass/fail이 줄어들어야 한다

### Story 3.3: timeout 복구와 provider/network failure triage 강화

As a QA engineer,
I want deterministic timeout handling with forced cleanup,
So that provider or network instability does not leave hung sessions or useless failures.

**Implements:** FR10, FR6

**Acceptance Criteria:**

**Given** provider 응답 지연 또는 네트워크 실패를 시뮬레이션하거나 자연스럽게 만날 수 있을 때  
**When** 테스트가 지정 timeout에 도달하면  
**Then** 드라이버는 PTY를 강제 종료하고 실패 상태를 명확히 보고해야 한다  
**And** transcript, stdout/stderr, plugin log, workspace diff를 즉시 flush 해야 한다

**Given** timeout 또는 provider failure가 반복될 수 있을 때  
**When** nightly 또는 on-demand 스위트를 운영하면  
**Then** flaky 원인 분석에 필요한 최소 artifact set이 항상 동일하게 남아야 한다  
**And** 이후 테스트 런이 이전 hung 프로세스에 영향을 받지 않아야 한다

### Story 3.4: CI secret 및 runtime 계약 정착

As a DevOps-aware maintainer,
I want CI에서 필요한 secret과 runtime contract가 문서화되고 검증되길 원한다,
So that live-model TUI tests can run safely and predictably outside a developer machine.

**Implements:** FR8, FR10

**Acceptance Criteria:**

**Given** CI runner에서 live-model TUI 회귀를 실행해야 할 때  
**When** 실행 전제조건을 정의하면  
**Then** 테스트 전용 provider secret 주입 방식과 `devai` binary/config path contract가 문서화되어야 한다  
**And** 누락 시 fast-fail 또는 skip 정책이 명확해야 한다

**Given** PR과 nightly 파이프라인이 분리 운영될 때  
**When** 스위트가 CI에 연결되면  
**Then** PR은 P0만 실행하고 nightly는 P0+P1을 실행해야 한다  
**And** 실패한 시나리오의 artifact를 CI에서 다운로드 가능한 형태로 보존해야 한다
