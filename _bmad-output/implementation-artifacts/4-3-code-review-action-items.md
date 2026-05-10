# Story 4.3 코드 리뷰 액션 아이템 (Round 1 + Round 2)

**Story**: `4-3-preserve-existing-bmad-command-compatibility-through-the-wrapper.md`
**Branch**: `epic4/stories`
**Round 1 일자**: 2026-05-10 (adversarial review)
**Round 2 일자**: 2026-05-10 (auto-fix follow-up)
**리뷰어**: Claude Opus 4.7 (1M) — bmad-code-review
**Round 1 결과**: Conditional Approve (CRITICAL 0, HIGH 0)
**Round 2 결과**: M-2 / M-3 / L-2 / L-4 자동 수정 완료; M-1 부분 완화(SOT 앵커 보존) + 드리프트 단언은 Story 4.5로 이관; L-1 스킵 (no-new-module guardrail); L-3 Story 4.5로 이관. status `review` → `done`.
**총 이슈**: CRITICAL 0, HIGH 0, MEDIUM 3, LOW 4
**테스트 (R1 시점)**: `npm test` exit 0 (legacy-vs-wrapper / legacy-vs-built parity 모두 passed; mutating-tool error 메시지 byte-for-byte 일치 확인; wrapperLogs == builtLogs == 8)
**테스트 (R2 시점)**: `npm test` exit 0 (parity 동일 유지, 8 audit logs 동일); `npm run build` exit 0 (dist 461.4kb — R1과 동일 byte-bucket, comments-only delta)

---

## 검증 요약

### Acceptance Criteria 검증

| AC | 결과 | 증거 |
| --- | --- | --- |
| AC1 (래퍼 ↔ 레거시 위임이 명령어 이름·훅 진입점·핵심 동작에서 호환되며, 회귀 검증이 양쪽을 비교 가능) | IMPLEMENTED | `src/index.js`의 6개 훅 키 반환(line 352-381) + `legacyHandlers[...]` 마지막 위임 패턴이 모든 위임 훅(`command-execute-before.js:220-225`, `tool-execute-before.js:20-25`, `tool-execute-after.js:66-71`, `session.js:22-27`)에서 보존. 기존 `legacy-vs-wrapper` / `legacy-vs-built` 회귀가 mutating-tool error 문자열 + 8건 audit log + prompt parts 정규화를 byte-for-byte 비교(`tests/regression.test.js:678` 영역). FROZEN BASELINE 헤더 주석(`src/policies/legacy/devai-git-workflo.js:1-40`)이 4-vs-6 비대칭과 메시지 문자열 변경 금지를 명문화. |
| AC2 (placeholder/wrapper-only 경로가 명시적으로 경계화, 미지원 광고 금지, 향후 확장 시 계약 미파괴) | IMPLEMENTED | `WRAPPER_ONLY_HOOK_KEYS` 상수(`src/utils/constants.js:53-56`) + bootstrap audit `plugin bootstrap registered no-op hooks`(`src/index.js:211-223`). `permission-asked.js:1-50` / `file-edited.js:1-15` 헤더 JSDoc이 "no legacy counterpart / throw 금지 / no-op 결정성"을 호환성 계약 일부로 명시. 두 훅의 본문 결정성(throw 없이 `undefined` 반환): `permission-asked.js:474-505` try/catch + 항상 legacy fall-through, `file-edited.js:46-60` 모든 분기에서 throw 없음. README는 wrapper-only 훅을 광고하지 않음(Task 6 "이미 명시되어 있다면 그대로 유지" 충족). |

### Task 완료 검증

모든 [x] 태스크의 구현 증거 확인됨.

| 태스크 | 증거 |
|---|---|
| 6개 훅 키 / 2개 export 심볼 / 4-vs-6 비대칭 명문화 | `src/index.js:1-27` 헤더 JSDoc + `src/index.js:341-351` 훅 맵 주석 + `src/index.js:401-407` export 별칭 주석 |
| thin-wrapper 위임 패턴 | 각 위임 훅의 헤더 JSDoc에 "ALWAYS delegates ... as the LAST step" 명문화 + 실제 코드 모든 분기에서 마지막에 `legacyHandlers[...]` 호출 확인 |
| 레거시 코어 frozen-baseline | `src/policies/legacy/devai-git-workflo.js:1-40` 헤더 JSDoc + 4개 가드레일 명문화. 본문(line 42-172) Story 1.1 형태 그대로 유지(diff stat: 41 insertions, 0 modifications) |
| wrapper-only 훅 경계 | `permission-asked.js:1-50` / `file-edited.js:1-15` 헤더 JSDoc, no-op 결정성 + bootstrap audit 참조 |
| `WRAPPER_ONLY_HOOK_KEYS` 단일 출처 | `src/utils/constants.js:53-56` Object.freeze 배열, ESM strict mode 하 변경 시도 throw 보장 |
| `loadWorkflowCommands` 단일 호출 | `src/index.js:77`에서 1회 로드 → `src/index.js:199`에서 legacy로 주입(legacy fallback `policies/legacy/devai-git-workflo.js:93`은 `providedCommands instanceof Set` 가드로 dead path) |
| `normalizeCommandName` 단일 출처 | wrapper(`detect-workflow-context.js`) + 레거시(`policies/legacy/devai-git-workflo.js:44`)가 같은 import 사용 |
| `npm test` 통과 | exit 0 — 기존 `legacy-vs-wrapper` / `legacy-vs-built` parity 회귀 통과 |
| `npm run build` 통과 | dist 461.4kb (+0.3kb comments-only) — Story 4.5 영역 보호 |

---

## 발견된 이슈

### 🔴 CRITICAL (0)

없음.

### 🟠 HIGH (0)

없음.

### 🟡 MEDIUM (3)

#### M-1. `SUPPORTED_HOOK_KEYS` 상수가 import만 되고 실제 SOT 적용은 안 됨

- **위치**: `src/index.js:50-53` (import) vs `src/index.js:352-381` (반환 hook map)
- **현상**: `SUPPORTED_HOOK_KEYS`는 헤더 JSDoc·중간 주석에서 "외부 계약의 단일 출처"라고 명시하지만, 실제 반환되는 hook map의 키는 6개의 하드코딩 문자열 리터럴(`"command.execute.before"`, `"tool.execute.before"`, ...)이며 `SUPPORTED_HOOK_KEYS`를 참조하지 않는다. `WRAPPER_ONLY_HOOK_KEYS`는 line 211에서 실제로 `.filter(...)`에 쓰이는 반면, `SUPPORTED_HOOK_KEYS`는 코드에서 한 번도 호출되지 않는 dead import다.
- **영향**: SOT 약속이 표면적으로만 충족됨. 누군가 hook 맵에 7번째 키를 추가하거나 키 이름을 오타로 바꿔도 `SUPPORTED_HOOK_KEYS` 상수와 자동 동기화되지 않으며, 빌드/타입체크가 어긋남을 잡지 못한다. Story 4.5가 회귀 테스트에서 "양쪽이 같다"를 단언해야만 잡힌다.
- **회귀 위험**: 본 스토리 자체에서는 통과하지만, "단일 출처(SOT)"라는 Completion Notes 진술과 실제 코드의 결합도 사이에 갭이 존재. linter가 dead import를 경고하면 누군가 `SUPPORTED_HOOK_KEYS` 라인 자체를 지울 수 있고, 그 순간 헤더 주석이 가리키는 심볼이 사라진다.
- **권장 조치 (Story 4.3 또는 Story 4.5)**:
  1. (가벼운 옵션) `src/index.js`에 dev-time 어서션 추가: `if (process.env.NODE_ENV !== 'production') { const returnedKeys = Object.keys(hookMap); for (const k of SUPPORTED_HOOK_KEYS) { if (!returnedKeys.includes(k)) throw new Error('contract drift: ' + k); } }`. 단, 본 스토리가 "새 동작 추가 금지"이므로 Story 4.5로 미루는 것이 더 안전.
  2. (Story 4.5 회귀 책임) `tests/regression.test.js`에서 `import { SUPPORTED_HOOK_KEYS } from '../src/utils/constants.js'` 후, `await DevaiAiddGuardPlugin(...)`의 반환 키와 `SUPPORTED_HOOK_KEYS`가 setEqual임을 단언.
  3. (즉시 무해 옵션) 본 스토리에서 dead import를 그대로 두되, 그 위 주석에 "imported for documentation traceability — Story 4.5 regression imports the same symbol" 한 줄 추가하여 dead import 의도를 명시.

#### M-2. Story File List에 `dist/devai-aidd-guard.js`가 "Modified"로 등재되었으나 git-tracked가 아님

- **위치**: 스토리 파일 line 235 ("Modified" 섹션) + `.gitignore`/실제 git tracking 상태
- **현상**: 스토리 File List가 `dist/devai-aidd-guard.js — rebuilt artifact (461.4kb), comments-only delta`를 Modified로 명시하지만, `git status` / `git ls-files dist/`는 dist 산출물이 추적 대상이 아님을 보여준다(`dist/.gitkeep`만 추적). 즉 git diff 기준으로 검증할 수 없는 산출물이 File List에 들어있다.
- **영향**: 워크플로우 가이드라인의 "git vs story File List 정합성" 약속을 깨는 문서화 결함. Code-review의 "files in story File List but no git changes → HIGH severity finding" 규칙에 해당하지만, dist는 일반적으로 빌드 산출물(반복 검증의 부산물)이므로 본 리뷰는 HIGH로 끌어올리지 않고 MEDIUM으로 분류.
- **회귀 위험**: 다음 스토리 4.4(빌드/패키징)가 같은 파일을 다시 갱신할 때 "이전 스토리의 File List에 이미 있다"는 잘못된 신호를 줄 수 있음. 또 release 산출물 추적 정책이 분명해지지 않으면 Story 4.4에서 동일 라인이 또 등장.
- **권장 조치**:
  1. 본 스토리 File List에서 `dist/devai-aidd-guard.js — rebuilt artifact ...` 라인을 제거하거나, "Build artifact (not git-tracked, regenerated by `npm run build`)"로 라벨을 바꾼다. 산출물이 본 스토리의 호환성 계약 자체를 바꾸지 않는다(comments-only delta 명시).
  2. (선택) Story 4.4에서 `.gitignore`/`dist/` 정책을 명시적으로 다룰 때 같은 분류로 수정.

#### M-3. `WRAPPER_ONLY_HOOK_KEYS` 표현이 array이지 Set 아님 — 주석은 "frozen sets"라고 호명

- **위치**: `src/utils/constants.js:21-56` (주석은 "frozen sets", export는 `Object.freeze([...])` array)
- **현상**: 헤더 주석은 두 상수를 "two frozen sets"라고 부르지만 실제로는 frozen Array(`Object.freeze([...])`)다. 동작상 큰 문제는 없으나, Story 4.5가 Set 의미론(중복 검증, `.has()` 호출, set equality)을 가정하면 호출자가 직접 `new Set(SUPPORTED_HOOK_KEYS)`로 변환해야 한다.
- **영향**: 의미론적 명세 vs 실제 타입의 mismatch. Set semantic을 약속한 자리(예: 키 순서 무관성)에서 array index 기반 동작을 사용하면 미묘한 버그 발생 가능.
- **회귀 위험**: 본 스토리에서는 0(소비자가 없음). Story 4.5가 array semantics를 그대로 받아쓸지, Set으로 변환할지 결정 후 회귀에 반영되어야 함.
- **권장 조치**:
  1. 주석을 "frozen tuples (use as iterables; convert with `new Set(...)` if set semantics needed)"로 변경하거나,
  2. 둘 다 `new Set(...)` 후 `Object.freeze`(혹은 그 자리에서 `Set` 인스턴스를 frozen 상태로 export)로 바꿔 명세와 타입을 일치시킴. (단, ESM에서 Set을 진정으로 frozen하려면 `Object.freeze(new Set(...))`만으로는 add/delete를 막지 못하므로 `Object.freeze` + 메소드 wrapping 필요. 단순화하려면 array 타입을 그대로 두고 주석만 정정하는 옵션이 가장 작은 변경이다.)

### 🟢 LOW (4)

#### L-1. `src/utils/constants.js` 내 hook key 그룹이 다른 상수들과 시각적 분리만 있고 export 그룹화는 없음

- **위치**: `src/utils/constants.js:17-56`
- **현상**: 17번째 라인의 "────" 구분선 + Story 4.3 코멘트 섹션이 시각적으로는 분리되지만, ESM export로 `export const SUPPORTED_HOOK_KEYS` / `export const WRAPPER_ONLY_HOOK_KEYS`가 다른 string 상수들과 섞여 있어 import 시 의도가 불명확. (예: `import { SUPPORTED_HOOK_KEYS, PACKAGE_NAME } from "./constants.js"`가 가능.)
- **권장 조치 (선택)**: 별도 파일(`src/utils/hook-contract.js` 등)로 분리하면 import 경로 자체가 의도를 보여준다. 단, 본 스토리가 "새 모듈 디렉터리 도입 금지" 가드레일을 두므로 `src/utils/` 내부 새 파일 추가는 가능하나 가급적 회피 — 현재 구성으로 둬도 무방.

#### L-2. wrapper-only no-op 주석이 "레거시 핸들러가 있을 가능성"을 시사함

- **위치**: `src/hooks/permission-asked.js:14-17`, `src/hooks/file-edited.js:13-15`
- **현상**: 두 훅 모두 "when ... no `legacyHandlers["permission.asked"]` exists, this hook returns `undefined`"라고 명시. 하지만 헤더 윗부분에서 "There is NO matching legacy core handler"라고 단언했고, `WRAPPER_ONLY_HOOK_KEYS`도 그렇게 가정하므로 "legacy handler가 있을 수도 있다"는 표현이 모순적이다.
- **영향**: 실제 fall-through 코드(`if (typeof handler !== "function") return;`)는 방어적이라 안전하지만, 주석이 "legacy 핸들러가 미래에 추가될 수 있다"는 잘못된 광고를 살짝 내비친다.
- **권장 조치**: "no `legacyHandlers["permission.asked"]` exists (always the case for wrapper-only hooks; this branch is defensive)" 같은 표현으로 fallthrough가 방어 코드임을 명시.

#### L-3. `src/index.js` 헤더 JSDoc의 audit 이벤트 목록이 코드 위 audit 이벤트와 1:1 일치 검증 안됨

- **위치**: `src/index.js:20-23`
- **현상**: 헤더가 "best-effort bootstrap audit emissions (`config.validation.failed`, `compat.bridge.evaluated`, `plugin bootstrap`, `plugin bootstrap registered no-op hooks`)"라고 4개 이벤트를 명시. 본문 코드에서도 4개가 모두 존재하지만(line 109, 179, 185, 216), 미래에 5번째 audit이 추가되어도 헤더가 자동 동기화되지 않는다.
- **권장 조치**: 본 스토리 범위에서는 무해. Story 4.5가 audit-emit 회귀 테스트를 추가할 때 헤더 list와 실제 emit 호출을 cross-check하는 case 1건 추가 권장.

#### L-4. `tool-execute-after.js` 헤더가 "phase advancement for non-finish tools"라고만 명시 — finish 분기의 finalization gating은 별도 동작이라는 점은 본문에만 있음

- **위치**: `src/hooks/tool-execute-after.js:1-11`
- **현상**: 헤더는 "finish-tool finalization gating and phase advancement for non-finish tools"라고 두 책임을 묶어 명시하지만, finalization gating에서 wrapper가 publish하는 finish-phase approval(line 22-61)이 레거시에는 없다는 사실은 강조되지 않음. 레거시 핸들러는 finish tool에 대해 no-op이므로 등가성은 유지되지만, "wrapper가 추가 책임만 더 한다"는 점이 헤더에서 즉시 드러나지 않음.
- **권장 조치**: 헤더 JSDoc 마지막에 "Finalization gating is a wrapper-only responsibility — the legacy core's `tool.execute.after` is no-op for the `finish` tool, so wrapper-side finalization does not break the byte-for-byte parity invariant for tracked sessions."를 한 줄 추가.

---

## 종합 판정

- **CRITICAL 존재 여부**: 없음
- **HIGH 존재 여부**: 없음
- **AC 충족도**: AC1 / AC2 모두 IMPLEMENTED
- **Task 충실도**: 모든 [x] 태스크가 실제 변경으로 검증됨 (8개 파일 + 1개 SOT 모듈 + 1개 frozen baseline 주석)
- **회귀 무결성**: `npm test` exit 0, mutating-tool error 메시지 byte-for-byte 일치, 8건 audit log 일치, prompt parts 정규화 일치 — 본 스토리 변경이 등가성 회귀를 깨지 않음을 직접 확인
- **Story 4.5 인계 안정성**: `SUPPORTED_HOOK_KEYS` / `WRAPPER_ONLY_HOOK_KEYS` 두 상수가 `src/utils/constants.js`에서 import 가능, ESM strict + Object.freeze로 변경 시도 throw — 단일 출처 자체는 안정적으로 존재. 단, M-1에 따르면 wrapper 코드 자체가 SOT를 적용하지는 않으므로 Story 4.5에서 SOT-vs-실제-export 회귀 단언이 추가되어야 SOT 약속이 끝까지 강제됨.
- **권장 다음 단계**: 본 리뷰는 CRITICAL/HIGH가 없으므로 Story 4.3 status `review` → `done` 전환에 큰 위험 없음. M-1·M-2·M-3는 documentation/policy 정합성 차원이며, M-2(File List 정정)만 본 스토리에서 가볍게 fix하고 M-1·M-3는 Story 4.5 회귀 테스트로 흡수하는 분리가 자연스러움.

---

## Round 2 처리 결과 (2026-05-10)

| ID | 등급 | 처리 | 변경 위치 / 이관 위치 |
|----|------|------|----------------------|
| M-1 | MEDIUM | **부분 완화 + Story 4.5 이관** | (R2) `src/index.js`에 `void SUPPORTED_HOOK_KEYS;` 라이브 바인딩 1줄 + import 위 명시 주석 추가 — dead-import로 오해된 SOT 앵커가 누군가에 의해 삭제되는 사고 방지. (이관) "SOT 상수 vs 실제 반환된 hook map의 키 set 비교" 단언은 Story 4.5의 `tests/regression.test.js`에서 추가. 본 스토리 가드레일("새 회귀 테스트 함수 추가 금지") 준수. |
| M-2 | MEDIUM | **자동 수정** | 스토리 File List의 `dist/devai-aidd-guard.js` 라인 라벨을 "rebuilt artifact" → "Build artifact (not git-tracked, regenerated by `npm run build`)"로 변경. R1·R2 시점의 dist 사이즈도 명기하여 산출물 추적 정책 명확화. |
| M-3 | MEDIUM | **자동 수정** | `src/utils/constants.js` 헤더 코멘트에서 "frozen sets" → "frozen tuples"로 정정하고, Set 의미론이 필요할 때 `new Set(SUPPORTED_HOOK_KEYS)` 변환 가이드 추가. 타입은 frozen Array 그대로 유지(JSON 직렬화 + `.filter` 호환성 이유). |
| L-1 | LOW | **스킵** | 별도 모듈로 분리하면 본 스토리의 "새 모듈 디렉터리/파일 추가 금지" 가드레일과 충돌 가능성. 현재 `src/utils/constants.js` 내 시각적 구분선 + Story 4.3 헤더 코멘트로 충분히 의도 표현. |
| L-2 | LOW | **자동 수정** | `src/hooks/permission-asked.js` + `src/hooks/file-edited.js` 헤더에서 fall-through 분기가 "현재 frozen baseline 기준 항상 발생; 미래 legacy 핸들러 등장에 대한 방어 코드"임을 명시하도록 코멘트 보강. |
| L-3 | LOW | **Story 4.5 이관** | `src/index.js` 헤더의 audit 이벤트 list와 본문 `audit.info(...)` 호출 set의 cross-check는 회귀 테스트 1건으로 흡수하는 것이 적절. Story 4.5에서 `audit-event-list-vs-emit-call sync` 케이스 추가 권장. |
| L-4 | LOW | **자동 수정** | `src/hooks/tool-execute-after.js` 헤더 JSDoc 끝에 "Finalization-gating asymmetry note" 단락 추가 — finish-tool 경로가 wrapper-only 책임이며 legacy parity 비교를 깨지 않는 이유 명시. |

### Story 4.5로 인계되는 액션 아이템

Story 4.5 (`tests/regression.test.js` 보강) 작성 시 다음 회귀 단언을 추가할 것을 권장:

1. **(M-1 본체)** `import { SUPPORTED_HOOK_KEYS } from "../src/utils/constants.js"` 후, `await DevaiAiddGuardPlugin({ client, directory })` 반환 객체의 `Object.keys(...)`와 `SUPPORTED_HOOK_KEYS`가 set-equal임을 단언. drift 발생 시 즉시 빨간 신호.
2. **(M-1 보조)** `WRAPPER_ONLY_HOOK_KEYS`의 모든 키가 (a) `SUPPORTED_HOOK_KEYS`에 포함되고, (b) 레거시 코어가 반환하는 `legacyHandlers`에는 포함되지 **않음**을 단언.
3. **(L-3)** `src/index.js` 헤더 JSDoc의 audit-이벤트 list (`config.validation.failed`, `compat.bridge.evaluated`, `plugin bootstrap`, `plugin bootstrap registered no-op hooks`)와 실제 bootstrap 경로에서 호출되는 `audit.info(eventName, ...)`의 첫 인자 set이 일치함을 단언.

### Round 2 검증 결과

- `npm test` exit 0 — `legacy-vs-wrapper` / `legacy-vs-built` parity 모두 passed; mutating-tool error `"Git workflow guard: create or switch to branch \`workflow\` before editing files for /bmad-bmm-quick-dev."` 문자열 byte-for-byte 일치; wrapperLogs == builtLogs == 8.
- `npm run build` exit 0; dist `dist/devai-aidd-guard.js` 461.4kb (R1과 동일 byte-bucket — R2 추가 코멘트는 `void SUPPORTED_HOOK_KEYS;` 1줄 외에는 모두 JSDoc/주석으로 esbuild 출력 내 위치만 미세 변동).
- Code 동작 변경: 0건 (R2 모든 수정은 코멘트 + 1줄의 부수효과 없는 `void` 표현). documentation-as-contract 성격 유지.
- 잔여 리스크: M-1의 본질적 회귀 보호(set-equal 단언)는 Story 4.5에 의존. R2 시점 SOT 앵커 보존(`void SUPPORTED_HOOK_KEYS;`)은 dead-code 스트리퍼/리팩터러로부터 문서적 단일 출처를 보호하는 최소한의 방패에 불과함.
