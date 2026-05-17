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
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/tests/e2e/helpers.js
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/tests/e2e/scenario-workflow-detection.test.js
  - C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/tests/e2e/scenario-approval-deny-recovery.test.js
---

# Test Design for QA: devai 플러그인 TUI E2E 회귀

**Purpose:** 실제 `devai` TUI를 PTY로 구동해 플러그인 회귀를 검증하는 실행 지침서다. 무엇을 어떻게 검증할지, 그리고 QA가 다른 팀에 무엇을 요구해야 하는지를 정리한다.

**Date:** 2026-05-18
**Author:** Codex
**Status:** Draft
**Project:** opencode-aidd-plugin

**Related:** [test-design-architecture.md](/C:/Users/User/Desktop/AIDD/opencode-aidd-plugin/_bmad-output/test-artifacts/test-design-architecture.md)

---

## Executive Summary

**Scope:** 실제 `devai` TUI 프로세스를 실행해 다음을 회귀 검증한다.

- devai 플러그인 로드
- 사용자 프롬프트 입력
- 실제 모델 응답 출력
- 플러그인 hook 실행
- 플러그인 로그 기록
- 필요 시 파일 변경 또는 정책 차단 메시지 확인

**Risk Summary:**

- Total Risks: 7 (high-priority 5, medium 2)
- Critical Categories: TECH, OPS, DATA, SEC

**Coverage Summary:**

- P0 tests: ~4
- P1 tests: ~4
- P2 tests: ~3
- P3 tests: 현재 없음
- **Total**: ~11 tests

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| **모델 응답 전문 품질 평가** | 이 스위트의 목적은 플러그인 회귀 검출이지 자연어 품질 등급화가 아니다. | keyword allowlist + log/hook/file oracle 사용 |
| **모든 lower-level branch permutation 재검증** | 기존 `tests/regression.test.js` 및 `tests/e2e/*`가 이미 in-process 레이어를 폭넓게 커버한다. | TUI E2E는 실제 runtime boundary만 담당 |
| **대규모 성능 벤치마크** | 실제 모델 호출은 느리고 비용이 크다. | P2 on-demand 또는 별도 benchmark 설계 |

---

## Dependencies & Test Blockers

### Backend/Architecture Dependencies

1. **기본 PTY 드라이버 계약** - Plugin Dev - 구현 시작 전
   - QA는 `spawn`, `type`, `press`, `waitForText`, `waitForStable`, `captureTranscript`, `kill` API가 필요하다.
   - 드라이버 계약이 없으면 테스트 본문을 안정적으로 쓸 수 없다.

2. **외부 관측 가능한 로그/아티팩트 경로** - Plugin Dev - 구현 시작 전
   - QA는 `plugin_loaded`, `hook_called`, policy 결과를 파일 기반으로 확인할 수 있어야 한다.
   - 없으면 real TUI 시나리오에서 user-visible text만 남아 oracle이 약해진다.

3. **테스트용 provider credentials** - DevOps - CI enablement 전
   - QA는 실제 모델 응답을 얻기 위한 저권한 키가 필요하다.
   - 없으면 요구된 “실제 모델 응답 관찰” 자체를 수행할 수 없다.

### QA Infrastructure Setup

1. **Fixture Projects** - QA
   - `happy-path`
   - `mutate-file`
   - `policy-block`

2. **Artifact Conventions** - QA
   - transcript
   - plugin log
   - stderr/stdout dump
   - workspace diff summary

3. **Environments** - QA
   - Local: Windows + PowerShell 기준
   - CI/CD: Linux authoritative runner 권장
   - Optional matrix: terminal size / locale variation

**Minimal Node-style harness example:**

```js
import assert from "node:assert/strict";
import { createDriver } from "./driver/devai-driver.js";

const run = async () => {
  const driver = await createDriver({
    cwd: fixtureDir,
    artifactDir,
    logFile,
  });

  try {
    await driver.waitForText("devai", { timeoutMs: 15000 });
    await driver.type("README를 한 줄 요약해줘");
    await driver.press("Enter");
    await driver.waitForStable({ timeoutMs: 45000 });

    const screen = await driver.captureTranscript();
    assert.match(screen, /README|요약|plugin/i);
    assert.doesNotMatch(screen, /fatal|uncaught|traceback/i);
  } finally {
    await driver.kill();
  }
};

await run();
```

---

## Risk Assessment

### High-Priority Risks (Score >=6)

| Risk ID | Category | Description | Score | QA Test Coverage |
| --- | --- | --- | --- | --- |
| **R-001** | TECH | Windows에서 일부 후보 드라이버 미지원 | **9** | cross-platform 기본 driver smoke |
| **R-002** | OPS | 실제 모델 비결정성으로 flaky 발생 | **9** | exact-match 금지, stable signal oracle |
| **R-003** | DATA | fixture/artifact contamination | **6** | per-test temp workspace + diff assertions |
| **R-004** | BUS | 화면 텍스트만 보는 약한 oracle | **6** | terminal + log + file/artifact 이중 oracle |
| **R-005** | SEC | 실제 provider credential과 mutating flow 안전성 | **6** | deny scenario, protected file immutability |

### Medium/Low-Priority Risks

| Risk ID | Category | Description | Score | QA Test Coverage |
| --- | --- | --- | --- | --- |
| R-006 | PERF | PR runtime/cost 증가 | 4 | PR는 P0 한정, nightly 확장 |
| R-007 | OPS | 출력 안정화 이전 snapshot race | 4 | `waitForStable`/keyword/log wait 검증 |

---

## Entry Criteria

- [ ] `devai` 실행 경로와 테스트용 config가 확정됨
- [ ] PTY driver contract 구현됨
- [ ] fixture project 3종 생성됨
- [ ] plugin log/artifact 경로를 fixture가 읽을 수 있음
- [ ] 실제 provider credential이 테스트 환경에 연결됨

## Exit Criteria

- [ ] 모든 P0 통과
- [ ] P1 실패는 triage 또는 승인됨
- [ ] fatal error/hang 재현이 남아 있지 않음
- [ ] P0 시나리오 전부 transcript + log + workspace diff artifact를 생성함

---

## Test Coverage Plan

**중요:** P0/P1/P2는 실행 시점이 아니라 우선순위다.

### P0

**Criteria:** 핵심 기능 차단 + high risk + 우회 불가

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| **P0-001** | devai 플러그인이 실제 TUI 세션에서 로드된다 | E2E | R-001, R-004 | `plugin_loaded` 로그와 fatal error 부재 확인 |
| **P0-002** | 사용자가 프롬프트를 입력하고 실제 모델 응답이 터미널에 나타난다 | E2E | R-002 | exact match 금지, keyword allowlist 사용 |
| **P0-003** | 허용된 mutating 흐름에서 hook이 실행되고 fixture 파일 또는 artifact가 바뀐다 | E2E | R-003, R-004 | fixture-owned path만 허용 |
| **P0-004** | 금지된 흐름에서 정책 차단 메시지가 보이고 보호 파일은 바뀌지 않는다 | E2E | R-004, R-005 | deny keyword + unchanged file |

**Total P0:** ~4 tests

### P1

**Criteria:** 중요 기능 + medium/high risk + 흔한 워크플로우

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| **P1-001** | plugin log와 transcript가 동일 세션 기준으로 상호 추적 가능하다 | E2E | R-003, R-004 | session-correlated artifacts |
| **P1-002** | 2턴 이상 상호작용에서도 signal 추출이 유지된다 | E2E | R-002, R-007 | multi-turn but bounded |
| **P1-003** | deny/recovery 계열 흐름에서도 observability가 유지된다 | E2E | R-003, R-004 | denied state clean |
| **P1-004** | 읽기 전용 프롬프트는 false-positive block 없이 완료된다 | E2E | R-004 | block absence oracle |

**Total P1:** ~4 tests

### P2

**Criteria:** 보조 기능 + edge case + 운영 안정성

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| **P2-001** | provider/network 장애가 제어된 실패로 표면화된다 | E2E | R-002, R-007 | hung PTY 금지 |
| **P2-002** | terminal size variation에서도 signal 추출이 유지된다 | E2E | R-007 | resize or alternate cols/rows |
| **P2-003** | 한국어 prompt/keyword variant에서도 oracle이 유지된다 | E2E | R-002 | locale-aware signals |

**Total P2:** ~3 tests

### P3

현재 별도 분류 없음. exploratory 또는 benchmark는 on-demand로만 수행.

---

## Execution Strategy

**Philosophy:** PR에서는 짧고 결정적인 P0만 돌리고, 비용이 커지는 시나리오는 nightly/weekly로 미룬다.

### Every PR: Node PTY TUI smoke (~8-15 min)

- `npm run test:tui`
- P0 only
- 실제 모델 응답, 로그, 파일/정책 oracle까지 포함

### Nightly: extended Node PTY regression (~15-30 min)

- P0 + P1
- multi-turn, deny/recovery, transcript/log correlation 포함

### Weekly or On-Demand: instability and matrix (~30+ min)

- P2 only
- provider 장애, terminal size, locale variation

---

## QA Effort Estimate

| Priority | Count | Effort Range | Notes |
| --- | --- | --- | --- |
| P0 | ~4 | ~24-32 hours | 기본 driver, waiters, artifacts 포함 |
| P1 | ~4 | ~20-28 hours | denial/recovery, multi-turn, correlation |
| P2 | ~3 | ~12-20 hours | 장애계열과 matrix variants |
| **Total** | ~11 | **~60-88 hours** | **~1.5-2.5 weeks for 1 engineer** |

**Assumptions:**

- driver abstraction을 한 번만 구현한다
- transcript/log/artifact 저장 유틸을 재사용한다
- lower-level regression suite는 그대로 유지한다

---

## Tooling & Access

| Tool or Service | Purpose | Access Required | Status |
| --- | --- | --- | --- |
| `node-pty` | real PTY process control | npm dependency | Pending |
| `@xterm/headless` | terminal state/transcript normalization | npm dependency | Pending |
| `devai` runtime | real TUI under test | local/CI executable path | Pending |
| model provider key | actual response generation | secret injection | Pending |

**Access requests needed:**

- [ ] CI secret for test-only model credential
- [ ] documented `devai` binary/config path for local and CI

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope | Validation Steps |
| --- | --- | --- | --- |
| **devai plugin bootstrap** | plugin load 실패 시 전체 가치 상실 | P0-001 | plugin load log + no fatal error |
| **workflow hooks** | mutating/deny 흐름 핵심 | P0-003, P0-004, P1-003 | hook signal + file/policy oracle |
| **artifact/log pipeline** | triage 가능성 좌우 | P1-001, P2-001 | artifact 존재, session correlation |
| **existing Node regression tests** | lower-level contract 안전망 | 기존 `npm test` | TUI suite 추가 후에도 기존 스위트 통과 |

---

## Appendix A: Code Examples & Tagging

**Scenario naming convention**

- `scenario-plugin-load.test.js`
- `scenario-prompt-response.test.js`
- `scenario-mutate-file.test.js`
- `scenario-policy-block.test.js`

**Environment-based tagging example**

```js
const meta = {
  priority: "P0",
  kind: "tui",
  scenario: "policy-block",
};

if (process.env.TUI_PRIORITY && process.env.TUI_PRIORITY !== meta.priority) {
  process.exit(0);
}
```

**Assertion helper example**

```js
import assert from "node:assert/strict";
import fs from "node:fs";

export function assertStableSignals({ screen, logPath, artifactDir, requiredKeywords }) {
  const logText = fs.readFileSync(logPath, "utf8");
  assert.ok(requiredKeywords.some((keyword) => screen.includes(keyword)));
  assert.match(logText, /plugin_loaded|hook_called/);
  assert.doesNotMatch(screen, /fatal|uncaught|traceback/i);
  assert.ok(fs.existsSync(artifactDir));
}
```

---

## Appendix B: Knowledge Base References

- `risk-governance.md`
- `test-levels-framework.md`
- `test-quality.md`
- `adr-quality-readiness-checklist.md`

---

**Generated by:** BMad TEA Agent  
**Workflow:** `bmad-testarch-test-design`
