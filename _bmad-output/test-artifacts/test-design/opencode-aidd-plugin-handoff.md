---
title: 'TEA Test Design -> BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-architecture.md
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-qa.md
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-05-18T00:00:00+09:00'
projectName: 'opencode-aidd-plugin'
---

# TEA -> BMAD Integration Handoff

## Purpose

이 문서는 devai 플러그인 TUI E2E 테스트 설계 결과를 BMAD의 epic/story 분해 단계로 넘기기 위한 연결 문서다. 품질 요구사항, 위험도, 핵심 시나리오를 implementation planning에 직접 주입하는 것이 목적이다.

## TEA Artifacts Inventory

| Artifact | Path | BMAD Integration Point |
| --- | --- | --- |
| Test Design Document | `C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-qa.md` | story acceptance criteria, QA backlog |
| Architecture Testability Document | `C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-architecture.md` | epic quality gates, pre-implementation blockers |
| Risk Assessment | embedded in both docs | epic priority, mitigation tracking |

## Epic-Level Integration Guidance

### Risk References

- **R-001 / TECH / 9**: cross-platform PTY driver 전략 미확정 시 구현 착수 금지
- **R-002 / OPS / 9**: stable signal oracle 없이 exact-match 설계 금지
- **R-003 / DATA / 6**: fixture isolation contract 없이는 file mutation 시나리오 구현 금지
- **R-004 / BUS / 6**: terminal-only oracle 금지, hook/log/file 2중 검증 의무화
- **R-005 / SEC / 6**: test credential과 protected fixture safety 확보 전 CI 필수화 금지

### Quality Gates

- Epic gate 1: `node-pty` 기반 기본 driver contract 정의 완료
- Epic gate 2: plugin log/artifact 외부 관측 경로 확정
- Epic gate 3: P0 4개 시나리오 설계 및 fixture 구조 확정
- Epic gate 4: exact-match 금지와 stable-signal oracle 원칙 문서화

## Story-Level Integration Guidance

### P0/P1 Test Scenarios -> Story Acceptance Criteria

- **P0-001**: 실제 `devai` TUI 세션에서 플러그인이 로드되고 `plugin_loaded` 신호가 남아야 한다.
- **P0-002**: 실제 사용자 프롬프트 입력 후 모델 응답이 terminal에 렌더링되고 fatal error가 없어야 한다.
- **P0-003**: 허용된 mutating 시나리오에서 `hook_called` 신호와 fixture-owned file/artifact 변경이 관측되어야 한다.
- **P0-004**: 정책 차단 시나리오에서 deny/block 메시지가 보이고 보호 파일은 변경되지 않아야 한다.
- **P1-001**: transcript와 plugin log가 동일 session 기준으로 상호 추적 가능해야 한다.
- **P1-003**: deny/recovery 흐름에서도 observability가 보존되어야 한다.

### Data-TestId Requirements

- 웹 UI가 아니므로 `data-testid` 요구는 없다.
- 대신 story acceptance criteria에 다음 artifact identifiers를 포함할 것을 권장한다:
  - log marker: `plugin_loaded`
  - log marker: `hook_called`
  - artifact: `transcript.txt`
  - artifact: `workspace-diff.json`

## Risk-to-Story Mapping

| Risk ID | Category | P×I | Recommended Story/Epic | Test Level |
| --- | --- | --- | --- | --- |
| R-001 | TECH | 9 | Story 1: cross-platform PTY driver scaffold | E2E |
| R-002 | OPS | 9 | Story 2: stable signal assertion/wait strategy | E2E |
| R-003 | DATA | 6 | Story 3: fixture isolation and artifact pipeline | E2E |
| R-004 | BUS | 6 | Story 4: mutating/policy-block P0 scenarios | E2E |
| R-005 | SEC | 6 | Story 5: CI credentials and protected fixture safety | E2E |
| R-006 | PERF | 4 | Story 6: PR/nightly split and runtime budget | E2E |
| R-007 | OPS | 4 | Story 7: deterministic waiters and timeout recovery | E2E |

## Recommended BMAD -> TEA Workflow Sequence

1. **TEA Test Design** 완료
2. **BMAD Create Epics & Stories** 에서 driver, oracle, fixtures, P0 시나리오를 독립 story로 분해
3. **TEA ATDD** 로 P0 시나리오의 failing acceptance tests 초안 작성
4. **BMAD Implementation** 으로 driver와 fixtures 구현
5. **TEA Automate** 로 P1/P2 확대
6. **TEA Trace** 로 coverage completeness 확인

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria |
| --- | --- | --- |
| Test Design | Epic/Story Creation | R-001, R-002 대응 전략 승인 |
| Epic/Story Creation | ATDD | P0 4개 acceptance criteria 명문화 |
| ATDD | Implementation | temp workspace, transcript, log artifact 규약 고정 |
| Implementation | Test Automation | P0 smoke가 실제 모델로 통과 |
| Test Automation | Release | PR P0 100%, P1 >=95%, failure artifacts complete |
