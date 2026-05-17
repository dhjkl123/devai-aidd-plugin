---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\index.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\adapters\console.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\adapters\fs.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\adapters\http.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\audit\logger.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\defaults.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\config\load-config.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\command-execute-before.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\file-edited.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\permission-asked.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\session.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-after.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\hooks\tool-execute-before.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\src\utils\constants.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\build.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\make-release.js
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\upload-azure.ps1
  - C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js
workflowType: 'prd'
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 18
classification:
  projectType: developer_tool
  domain: general
  complexity: medium
  projectContext: brownfield
---

# Product Requirements Document - opencode-aidd-plugin

**Author:** User  
**Date:** 2026-05-07T21:32:32.3698113+09:00

## Executive Summary

DevAI AIDD Guard는 BMAD 기반 워크플로우에서 사람이 직접 수행하던 Git 운영 절차를 자동화해, 코드뿐 아니라 기술 문서와 기획 산출물까지 버전, 변경 이력, 승인 흐름이 Git 기록으로 일관되게 드러나도록 만드는 개발자 도구다. 주 사용자는 AI 에이전트를 활용하는 개발팀과, 문서 산출물까지 포함한 작업 이력을 Git 중심으로 관리해야 하는 조직이다.

이 제품이 해결하는 핵심 문제는 BMAD 사용 자체가 아니라 BMAD 운영의 마찰이다. 기존 방식에서는 사용자가 워크플로우 시작 시 브랜치를 만들고, 종료 시 커밋과 후속 정리를 직접 수행해야 했다. 이 수동 절차는 누락, 편차, 예외 처리 실패를 유발하고, 산출물 이력의 일관성과 감사 가능성을 떨어뜨린다. 본 제품은 이 운영 부담을 플러그인 계층에서 흡수해 BMAD 사용 경험을 더 매끄럽고 통제 가능하게 만든다.

### What Makes This Special

이 제품의 차별점은 단순한 Git 자동화가 아니라, BMAD 실행 흐름에 결합된 AI 하네스라는 점이다. 브랜치 생성, 워크플로우 경계 관리, 종료 시점 정리 같은 반복 절차를 자동화함으로써 사용자는 절차보다 산출물에 집중할 수 있다. 동시에 시스템은 워크플로우 이탈, 잘못된 행동, 예외 상황을 더 일관된 방식으로 통제할 수 있다.

사용자가 이 도구의 가치를 체감하는 순간은 BMAD를 쓰는 동안 Git 관리를 의식적으로 수행하지 않아도 결과물이 자연스럽게 구조화되고, 변경 이력과 승인 근거가 저장소 기록에 남는다는 점을 확인할 때다. 이는 개인 생산성 개선을 넘어 AI 협업 과정의 추적 가능성과 운영 신뢰성을 높이는 메커니즘이 된다.

## Success Criteria

### User Success

- 사용자는 브랜치 생성이나 커밋 수행을 직접 신경 쓰지 않고도 BMAD 워크플로우를 완료할 수 있어야 한다.
- 생성된 코드, 기술 문서, 기획 산출물의 변경 이력이 Git에 자동으로 기록되어 추적 가능해야 한다.
- 어떤 사용자가 어떤 문서를 생성했고, 누가 이를 검토했는지 Git 기록과 워크플로우 결과를 통해 확인할 수 있어야 한다.

### Business Success

- 파일럿 사용자 5팀 중 4팀 이상이 지속 사용 의사를 표시해야 한다.
- 사용자 만족도 설문 평균이 5점 만점 기준 3.0 이상이어야 한다.
- 브랜치 생성 및 커밋 관련 수동 작업이 도입 이전 대비 70% 이상 감소해야 한다.

### Technical Success

- 현재 지원 중인 핵심 workflow command가 100% 동작해야 한다.
- Git 자동화가 BMAD 사용 흐름을 방해하지 않고, 사용자가 수동 개입 없이 정상적인 워크플로우 완료가 가능해야 한다.
- 자동 생성되는 Git 이력은 누락 없이 브랜치, 커밋, 산출물 변경 내역을 반영해야 한다.

### Measurable Outcomes

- 파일럿 운영 대상 5팀 중 최소 4팀이 계속 사용 의사를 명시한다.
- 만족도 설문 평균 3.0/5.0 이상을 달성한다.
- 브랜치 생성 및 커밋 관련 수동 작업 횟수를 70% 이상 줄인다.
- 현재 지원 중인 핵심 workflow command의 회귀 검증에서 100% 성공률을 유지한다.

## Product Scope

### MVP - Minimum Viable Product

- BMAD 워크플로우에 맞는 Git 브랜치 전략 자동화
- 워크플로우 종료 시점의 승인 기반 커밋
- 원격 저장소 존재 시 푸시 제안
- 산출물 이력의 Git 기반 기록
- 생성자 및 검토자 추적을 위한 최소 수준의 기록 구조
- JSON 설정 기반 정책 적용
- 기존 BMAD 명령과의 호환성 유지

### Growth Features (Post-MVP)

- BMAD와 DevAI 환경 간 호환성 강화
- 고급 예외 복구 흐름
- richer audit/approval metadata
- 더 다양한 BMAD 실행 패턴에 대응하는 운영 안정성 강화

### Vision (Future)

- 추후 기능 추가를 수용할 수 있는 확장 가능한 플러그인 구조 확보
- BMAD 외 다른 AI 프레임워크 및 AI 도구로 이식 가능한 구조 마련
- Git 자동화를 넘어 AI 작업 운영 하네스로 확장할 수 있는 기반 확보

## User Journeys

### Journey 1. 주 사용자 성공 경로: BMAD 워크플로우를 마찰 없이 완료하는 개발자

민수는 AI 에이전트를 활용해 BMAD 워크플로우로 문서 작성이나 구현 작업을 진행하는 개발자다. 기존에는 작업을 시작할 때 어떤 브랜치명을 써야 하는지 기억해야 했고, 끝난 뒤에는 커밋을 직접 만들고 필요하면 원격 저장소까지 푸시해야 했다. 이 과정은 반복적이고, 문서 작업일수록 더 쉽게 빠뜨리게 된다.

민수가 BMAD 워크플로우를 시작하면 시스템은 현재 워크플로우 종류와 규칙을 해석해, 정해진 브랜치 전략에 맞는 브랜치명을 제안하거나 생성한다. 모든 Git 작업은 사용자 허가 하에 진행되며, 민수는 진행, 거부, 또는 무시 후 계속 진행 중 하나를 선택할 수 있다. 작업이 진행되는 동안 민수는 Git 절차를 따로 관리하지 않고 실제 산출물 생성에 집중한다.

워크플로우가 종료되면 시스템은 결과물을 기준으로 커밋을 준비하고, 원격 저장소가 연결된 경우 푸시까지 이어서 제안한다. 민수는 최종 승인만 하면 되고, 승인하지 않더라도 워크플로우 자체는 막히지 않는다. 이 여정의 절정은 민수가 Git 절차를 직접 운영하지 않았는데도 브랜치, 커밋, 푸시, 산출물 이력이 일관되게 남아 있는 것을 확인하는 순간이다.

### Journey 2. 주 사용자 예외 경로: Git 자동화가 실패하거나 충돌하는 상황

지연은 같은 BMAD 워크플로우를 사용하지만, 작업을 시작하려는 순간 브랜치 규칙에 맞는 이름이 이미 존재하거나 현재 작업 디렉터리 상태가 예상과 다르다는 문제를 만난다. 기존 도구였다면 애매한 에러 메시지만 보고 직접 Git 상태를 해석해야 했을 것이다.

이 시스템은 예외를 감추지 않고 사용자에게 명확히 알린다. 무엇이 문제인지 설명하고, 가능한 선택지를 함께 제시한다. 예를 들어 새 이름으로 다시 시도, 현재 상태를 유지한 채 워크플로우만 계속 진행, 사용자가 직접 해결한 뒤 재시도 같은 선택지가 제공된다. 핵심은 자동화 실패가 곧 워크플로우 실패가 되지 않도록 하는 것이다.

지연은 시스템이 제시한 정보를 보고 스스로 해결할지, 자동 제안을 따를지 결정할 수 있다. 이 여정의 핵심 가치는 통제권 유지다. 시스템은 강제로 밀어붙이지 않고, 예외 상황에서도 사용자가 상황을 이해하고 개입할 수 있게 한다.

### Journey 3. 운영/관리자 여정: 팀 규칙을 설정하고 호환성을 유지하는 관리자

수현은 팀의 BMAD 운영 방식을 관리하는 리드다. 팀마다 브랜치 네이밍 규칙이 다르고, 어떤 워크플로우에서는 반드시 커밋을 남겨야 하지만 어떤 워크플로우에서는 선택적으로 처리해야 한다. 수현은 이런 규칙을 코드 수정 없이 설정 파일로 관리하고 싶어 한다.

이 시스템에서 수현은 JSON 설정을 통해 브랜치명 규칙, 워크플로우별 Git 동작 규칙, 기본 동작 방식을 조정할 수 있다. 설정은 팀 표준을 반영하면서도, 기존 BMAD 명령과의 호환성을 깨지 않는 방식으로 적용되어야 한다. 수현의 목표는 개발자 개개인이 Git 규칙을 외우지 않아도, 시스템이 팀 운영 방식을 일관되게 집행하는 것이다.

### Journey 4. 검토/추적 사용자 여정: 산출물의 생성자와 검토자를 확인하는 리뷰어

도윤은 팀 리드 또는 리뷰어로서, 특정 문서나 산출물이 누가 만들었고 누가 검토했는지 확인해야 한다. 특히 기술 문서와 기획 산출물은 코드처럼 PR 리뷰 흐름이 명확하지 않은 경우가 많아, 책임 추적이 흐려지기 쉽다.

도윤은 산출물이 저장된 Git 기록을 확인하고, 필요할 경우 `git blame` 같은 기본 도구를 통해 작성자와 변경 이력을 추적한다. 이 시스템은 산출물이 Git 이력 안에 자연스럽게 편입되도록 만들어, 리뷰어가 별도의 전용 시스템 없이도 누가 어떤 변경을 만들었는지 따라갈 수 있게 한다.

### Journey Requirements Summary

- 워크플로우 유형에 맞는 브랜치명 규칙 해석과 자동 생성
- 사용자 승인 기반의 브랜치 생성, 커밋, 푸시 자동화
- 사용자가 거부하거나 무시해도 워크플로우를 계속할 수 있는 비차단 흐름
- Git 예외 상황 감지, 설명, 선택지 제공, 복구 경로 지원
- JSON 기반 정책 설정과 팀별 커스터마이징
- 기존 BMAD 핵심 workflow command와의 호환성 유지
- 문서 및 산출물의 Git 기반 추적성과 리뷰 가능성 확보

## Domain-Specific Requirements

### Compliance & Regulatory

- 본 제품은 규제 산업용 소프트웨어는 아니지만, 모든 Git 행위는 사용자 승인 하에 수행되어야 한다.
- 감사 및 운영 로그에는 민감정보를 저장하지 않아야 한다.
- 사용자 승인 기록과 실행 결과는 추적 가능해야 하지만, 저장되는 정보는 최소화해야 한다.

### Technical Constraints

- 기존 BMAD 명령 체계를 깨지 않아야 하며, 현재 지원 중인 핵심 workflow command와의 호환성을 유지해야 한다.
- 설정 체계는 프로젝트별 JSON 설정과 글로벌 설정을 모두 지원해야 하며, 우선순위가 명확해야 한다.
- 레거시 설정 형식과의 호환성이 유지되어야 하며, 기존 사용자가 큰 마이그레이션 부담 없이 전환할 수 있어야 한다.
- 모든 Git 자동화는 강제 실행이 아니라 승인 기반이어야 하며, 사용자가 거부하거나 무시하고도 워크플로우를 계속할 수 있어야 한다.

### Integration Requirements

- 원격 저장소가 구성된 경우에만 push를 수행할 수 있다.
- 제품은 DevAI/opencode 환경 구조를 따라야 하며, 해당 실행 환경의 플러그인 및 워크플로우 모델과 정합성을 유지해야 한다.
- 로컬 Git 저장소가 없는 경우, `git init`은 사용자 허가를 받은 뒤에만 수행할 수 있어야 한다.
- Git 저장소 상태, 원격 연결 여부, 워크플로우 컨텍스트를 점검한 뒤에만 관련 자동화를 제안하거나 실행해야 한다.

### Risk Mitigations

- AI가 Git 작업을 제안하거나 실행하기 전, 자신의 의도와 예상 결과를 충분히 설명해야 한다.
- 시스템은 항상 사용자가 선택할 수 있는 대안을 제공해야 하며, 자동 진행만 강요해서는 안 된다.
- 잘못된 브랜치 생성, 의도치 않은 커밋/푸시, 잘못된 규칙 적용 같은 리스크를 줄이기 위해 사전 설명, 승인, 예외 처리 경로를 제공해야 한다.
- 예외 상황에서는 단순 실패가 아니라 이해 가능한 메시지와 복구 가능한 선택지를 제공해야 한다.

## Innovation & Novel Patterns

### Detected Innovation Areas

이 프로젝트의 핵심 혁신은 Git 자동화를 개별 기능으로 제공하는 것이 아니라, BMAD/AI 워크플로우 자체에 결합된 운영 계층으로 재구성하는 데 있다. 기존 대안들은 브랜치 생성, 커밋, 푸시를 보조하는 수준에 머무는 경우가 많지만, 본 제품은 워크플로우 맥락을 이해하고 그에 맞는 Git 동작을 제안하거나 실행하는 구조를 지향한다.

가장 중요한 혁신 조합은 `Git automation + workflow-aware branching + approval-driven AI harness`다. 시스템은 현재 수행 중인 BMAD 워크플로우를 기준으로 브랜치 전략을 해석하고, 모든 Git 행위를 사용자 승인 기반으로 통제하며, 예외 상황에서도 워크플로우를 운영 가능한 상태로 유지한다.

### Market Context & Competitive Landscape

이 제품은 일반적인 Git 자동화 도구와 직접적으로 동일 선상에 있지 않다. 기존 도구가 사용자의 Git 작업을 줄이는 데 초점을 둔다면, 이 제품은 AI 에이전트 기반 워크플로우 환경에서 사람이 느끼는 운영 부담과 통제 리스크를 동시에 해결하려 한다. 경쟁 포인트는 더 많은 Git 기능이 아니라, AI 협업 맥락을 이해하는 운영형 자동화라는 점이다.

### Validation Approach

이 혁신의 유효성은 BMAD 사용 시 Git 협업 부담이 실제로 줄어드는지로 검증할 수 있다. 핵심 검증 포인트는 다음과 같다.

- 사용자가 BMAD 실행 중 Git 절차를 별도로 신경 쓰는 빈도가 줄어드는지
- 승인 기반 자동화가 과도한 방해가 아니라 신뢰 가능한 통제로 받아들여지는지
- 예외 상황에서도 자동화가 혼란을 키우지 않고 오히려 복구를 돕는지

### Risk Mitigation

가장 큰 리스크는 혁신이 자동화 과잉으로 느껴지는 경우다. 사용자가 통제권을 잃었다고 느끼거나, 승인 흐름이 지나치게 잦아 오히려 마찰이 증가하면 차별점이 약점이 된다. 이를 줄이기 위해 모든 Git 행위는 설명 가능해야 하고, 사용자는 항상 수락, 거부, 무시, 수동 해결 같은 선택지를 가져야 한다.

또 다른 리스크는 워크플로우 인식 기반 자동화가 실제 현장 규칙과 어긋나는 경우다. 이를 줄이기 위해 브랜치 규칙과 Git 정책은 JSON 설정으로 조정 가능해야 하며, 기존 BMAD 명령과의 호환성 검증이 지속적으로 유지되어야 한다.

## Developer Tool Specific Requirements

### Project-Type Overview

DevAI AIDD Guard는 Node.js 기반 opencode/DevAI 환경에서 동작하는 개발자 도구 플러그인이다. 현재는 해당 런타임만 공식 지원 대상으로 삼고, 향후 다른 런타임 환경으로의 확장 가능성은 장기 과제로 유지한다. 이 제품은 독립형 애플리케이션이나 IDE 확장보다, AI 워크플로우 런타임 내부에 결합되는 운영형 플러그인에 가깝다.

### Technical Architecture Considerations

제품은 opencode/DevAI 런타임의 plugin/hook 시스템에 통합되어야 하며, 세션 이벤트와 툴 실행 전후 흐름을 활용해 Git 자동화를 제어해야 한다. Git 동작은 워크플로우 문맥을 이해하는 계층에서 수행되어야 하고, 사용자 승인 기반 실행과 예외 처리 흐름을 함께 제공해야 한다.

### Language Matrix

- 공식 지원 환경: Node.js 기반 opencode/DevAI 런타임
- 현재 비지원 범위: 기타 독립 런타임, 일반 IDE 플러그인 환경
- 장기 확장 방향: 다른 AI 런타임 또는 실행 환경으로의 확장 가능성 검토

### Installation Methods

- 설치 방식은 curl 및 PowerShell/bash 스크립트 기반이어야 한다.
- 사용자는 운영체제와 실행 환경에 맞는 설치 스크립트를 통해 플러그인을 설치할 수 있어야 한다.
- 설치 절차는 opencode/DevAI 환경의 플러그인 배치 구조와 설정 파일 위치를 반영해야 한다.

### Runtime Integration

- IDE 직접 통합이 아니라 opencode/DevAI 런타임의 plugin/hook 시스템에 통합되어야 한다.
- 세션 이벤트, 툴 실행 전후 훅, 명령 실행 흐름을 활용해 Git 정책을 적용해야 한다.
- Git 자동화는 런타임 훅 계층과 설정 계층, 정책 계층이 분리된 구조를 가져야 한다.

### Documentation Requirements

- 설치 가이드
- 설정 가이드
- 브랜치 규칙 예시
- 승인 흐름 설명

문서는 단순 사용법을 넘어서, 사용자가 왜 특정 승인 요청을 받는지와 어떤 설정이 어떤 Git 동작을 바꾸는지 이해할 수 있도록 작성되어야 한다.

### Implementation Considerations

- 예제 코드는 필수 요구사항이 아니다.
- 설치 및 설정 문서의 명확성이 더 중요하다.
- 레거시 설정과의 호환성을 유지하는 경우, 문서에는 마이그레이션 또는 호환 동작 설명이 포함되어야 한다.
- 현재 버전에서는 Node.js 기반 opencode/DevAI 환경에서의 안정성과 호환성을 우선해야 한다.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** 문제 해결형 MVP  
MVP는 BMAD 사용 중 발생하는 수동 Git 작업 부담을 제거하는 데 초점을 둔다. 핵심은 더 많은 Git 기능이 아니라, 브랜치 생성과 커밋 절차를 사용자가 직접 관리하지 않아도 워크플로우를 안정적으로 완료할 수 있게 만드는 것이다.

**Resource Requirements:**  
최소 3명 이상의 구성이 적절하다. 구현, 호환성 검증, 사용자 파일럿 운영을 분리할 수 있어야 하며, 기존 BMAD 명령 호환성과 실제 사용자 경험 검증을 병행해야 한다.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- BMAD 워크플로우 시작 시 문맥에 맞는 브랜치 생성
- 워크플로우 종료 시 승인 기반 커밋 수행
- 원격 저장소가 있을 경우 푸시 제안
- 사용자가 Git 자동화를 거부하거나 무시해도 워크플로우는 계속 진행 가능
- 설정 기반으로 팀 정책을 반영하면서 기존 BMAD 명령과 호환 유지

**Must-Have Capabilities:**
- 워크플로우 인식 브랜치 생성
- 승인 기반 커밋
- 원격 저장소 존재 시 푸시 제안
- JSON 설정 지원
- 기존 BMAD 명령 호환성 유지

### Post-MVP Features

**Phase 2 (Post-MVP):**
- DevAI/BMAD 외 추가 런타임 지원
- 고급 예외 복구 흐름
- richer audit/approval metadata

**Phase 3 (Expansion):**
- BMAD 외 다른 AI 프레임워크와의 이식성
- 운영 하네스 성격을 강화하는 추가 자동화 기능
- 더 넓은 팀/조직 정책 모델 지원

### Risk Mitigation Strategy

**Technical Risks:**
- 규칙 충돌
- 호환성 깨짐
- 팀별 Git 정책 차이

**Mitigation Approach:**  
브랜치 규칙과 Git 정책을 JSON 설정으로 외부화하고, 기존 BMAD 핵심 workflow command에 대한 회귀 검증을 필수화해야 한다. 또한 승인 기반 실행 모델을 유지해 자동화가 잘못된 규칙을 강제하지 않도록 해야 한다.

**Market Risks:**  
가장 큰 시장 리스크는 사용자가 이 자동화를 가치보다 간섭으로 느끼는 경우다. MVP는 수동 Git 부담 감소라는 명확한 문제 해결에 집중해, 복잡한 운영 기능보다 즉각적인 편의성과 신뢰를 먼저 증명해야 한다.

**Resource Risks:**  
리소스가 제한될 경우 가장 먼저 지켜야 할 범위는 브랜치 생성, 커밋 승인, 호환성 유지다. 추가 런타임 지원이나 고급 메타데이터 기능은 후속 단계로 미뤄야 한다.

## Functional Requirements

### Workflow Context Awareness

- FR1: 사용자는 시스템이 시작된 BMAD 워크플로우의 종류를 식별할 수 있어야 한다.
- FR2: 사용자는 시스템이 식별된 워크플로우에 맞는 Git 정책을 적용받을 수 있어야 한다.
- FR3: 사용자는 시스템이 현재 워크플로우 문맥에 따라 적절한 브랜치 전략을 선택하거나 제안할 수 있어야 한다.
- FR4: 사용자는 시스템이 워크플로우 시작, 진행, 종료 시점을 구분해 서로 다른 Git 동작을 수행하도록 할 수 있어야 한다.

### Branch & Commit Automation

- FR5: 사용자는 워크플로우 시작 시 규칙에 맞는 브랜치를 생성하거나 전환할 수 있어야 한다.
- FR6: 사용자는 시스템이 브랜치명 규칙에 따라 후보 브랜치명을 생성하거나 제안할 수 있어야 한다.
- FR7: 사용자는 워크플로우 종료 시 결과 산출물을 기준으로 커밋을 준비하거나 생성할 수 있어야 한다.
- FR8: 사용자는 원격 저장소가 구성된 경우 커밋 이후 푸시를 제안받을 수 있어야 한다.
- FR9: 사용자는 로컬 Git 저장소가 없는 경우 저장소 초기화를 제안받을 수 있어야 한다.

### Approval-Driven Execution

- FR10: 사용자는 모든 Git 행위에 대해 실행 전 승인 여부를 선택할 수 있어야 한다.
- FR11: 사용자는 Git 작업 제안 시 예상 동작과 의도를 설명받을 수 있어야 한다.
- FR12: 사용자는 각 Git 작업에 대해 수락, 거부, 무시 후 계속 진행 중 하나를 선택할 수 있어야 한다.
- FR13: 사용자는 특정 Git 작업을 거부하거나 무시하더라도 워크플로우 자체를 계속 진행할 수 있어야 한다.

### Policy & Configuration Management

- FR14: 관리자는 JSON 기반 설정을 통해 브랜치명 규칙을 정의하거나 수정할 수 있어야 한다.
- FR15: 관리자는 JSON 기반 설정을 통해 워크플로우별 Git 정책을 정의하거나 수정할 수 있어야 한다.
- FR16: 사용자는 시스템이 프로젝트별 설정과 글로벌 설정을 함께 읽고 우선순위에 따라 적용하도록 할 수 있어야 한다.
- FR17: 사용자는 시스템이 레거시 설정 형식도 읽고 호환 동작을 제공받을 수 있어야 한다.
- FR18: 관리자는 팀 정책 차이에 맞게 자동화 동작을 조정할 수 있어야 한다.

### Exception Handling & Recovery

- FR19: 사용자는 브랜치 충돌, 커밋 실패, 푸시 불가, 저장소 상태 불일치 같은 예외 상황을 명확히 통지받을 수 있어야 한다.
- FR20: 사용자는 예외 상황의 원인과 가능한 대응 선택지를 안내받을 수 있어야 한다.
- FR21: 사용자는 시스템이 재시도, 건너뛰기, 수동 해결 후 계속 진행 같은 복구 경로를 제공할 수 있어야 한다.
- FR22: 사용자는 자동화 실패가 전체 BMAD 워크플로우 실패로 즉시 이어지지 않도록 보호받을 수 있어야 한다.

### Traceability & Review Support

- FR23: 사용자는 코드, 기술 문서, 기획 산출물의 변경 이력이 Git에 기록되도록 할 수 있어야 한다.
- FR24: 리뷰어는 산출물의 생성자와 변경 이력을 Git 기록을 통해 추적할 수 있어야 한다.
- FR25: 리뷰어는 기존 Git 도구를 사용해 특정 산출물의 변경 책임을 확인할 수 있어야 한다.
- FR26: 사용자는 사용자 승인 결과와 실행된 Git 작업의 결과를 추적 가능한 형태로 확인할 수 있어야 한다.

### Runtime Integration & Compatibility

- FR27: 사용자는 시스템이 opencode/DevAI 런타임의 plugin/hook 시스템에 통합된 형태로 동작하게 할 수 있어야 한다.
- FR28: 사용자는 시스템이 세션 이벤트와 툴 실행 전후 흐름을 활용해 Git 정책을 적용받을 수 있어야 한다.
- FR29: 사용자는 기존 BMAD 핵심 workflow command를 변경 없이 계속 사용할 수 있어야 한다.
- FR30: 사용자는 시스템이 Node.js 기반 opencode/DevAI 런타임에서 공식 지원 동작을 제공받을 수 있어야 한다.

## Non-Functional Requirements

### Performance

- 시스템은 AI 응답 지연과 별개로, 워크플로우 문맥 식별과 Git 작업 제안에 필요한 로컬 판단을 불필요하게 지연시키지 않아야 한다.
- 시스템은 사용자 승인 이후 Git 실행 결과를 가능한 한 즉시 피드백해야 하며, 추가 대기 시간이 발생하는 경우 그 원인이 AI 응답인지 로컬 Git 처리인지 구분 가능해야 한다.
- 성능 평가는 절대 응답시간보다 사용자가 BMAD 워크플로우를 끊김 없이 이어갈 수 있는지를 기준으로 검증해야 한다.

### Security

- 모든 Git 행위는 사용자 승인 없이 실행되어서는 안 된다.
- 로그와 감사 기록은 BMAD가 생성했거나 참조한 파일 범위 안에서만 다뤄져야 한다.
- 시스템은 민감정보를 로그에 저장하지 않아야 하며, 승인 및 실행 기록은 최소 필요 정보만 남겨야 한다.
- 시스템은 사용자가 의도하지 않은 파일이나 저장소 범위를 기준으로 Git 자동화를 수행해서는 안 된다.

### Reliability

- Git 자동화가 실패하더라도 시스템은 사용자에게 워크플로우 계속 진행 또는 중지에 대한 선택지를 제공해야 한다.
- 예외 상황에서는 실패 원인과 복구 가능한 대응 옵션을 이해 가능한 형태로 제시해야 한다.
- 자동화 실패는 BMAD 워크플로우 전체를 즉시 중단시키는 강제 실패로 처리되어서는 안 되며, 사용자의 선택에 따라 후속 흐름이 결정되어야 한다.
- 브랜치 충돌, 커밋 실패, 푸시 실패, 저장소 상태 불일치 등 주요 예외는 일관된 방식으로 감지되고 보고되어야 한다.

### Integration

- 시스템은 현재 Node.js 기반 opencode/DevAI 런타임 환경에서 100% 지원 동작을 보장해야 한다.
- 시스템은 원격 저장소 미구성 상태를 반드시 감지해야 한다.
- 시스템은 로컬 Git 저장소 미초기화 상태를 반드시 감지해야 한다.
- 시스템은 Git 상태와 런타임 문맥을 점검한 뒤에만 관련 자동화를 제안하거나 실행해야 한다.
- 공식 지원 범위 밖의 런타임이나 환경에서는 동일 수준의 동작 보장을 전제하지 않아야 한다.
