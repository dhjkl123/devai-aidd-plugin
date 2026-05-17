# Story 4.1 코드 리뷰 액션 아이템 (Round 1 + Round 2)

**Story**: `4-1-define-and-normalize-branch-and-workflow-policy-configuration.md`
**Branch**: `epic4/stories`
**Round 1 일자**: 2026-05-10 (adversarial review)
**Round 2 일자**: 2026-05-10 (auto-fix follow-up)
**리뷰어**: Claude Opus 4.7 (1M) — bmad-code-review
**Round 1 결과**: Conditional Approve (CRITICAL 0, HIGH 0)
**Round 2 결과**: All 4 MEDIUM + all 5 LOW auto-fixed; status `review` → `done`
**총 이슈**: Critical 0, High 0, Medium 4, Low 5 (모두 R2에서 처리)
**테스트**:
  - R1 시점: `npm test` exit 0
  - R2 시점: `npm test` exit 0, `npm run build` exit 0 (dist 455.7kb)

---

## 검증 요약

### Acceptance Criteria 검증

| AC | 결과 | 증거 |
| --- | --- | --- |
| AC1 (정규화된 effective 포맷 + 안전 기본값 폴백) | IMPLEMENTED | `src/config/load-config.js:115-164`의 `normalizeConfig`가 `branch.pattern`/`defaultType`/`fallbackTicket`/`longLivedBranches`/`defaultMergeTarget`/`validationRegex`/`commandTypeMap` 7개 필드를 단일 패스로 채움. `verifyEffectiveConfigNormalizationContract`/`verifyMissingOptionalValuesFallback`로 회귀 고정. |
| AC2 (최신 정책 반영 + 결정성) | IMPLEMENTED | `verifyLatestPolicyChangesReflectedAcrossRuns`(파일 변경 후 재로드 시 최신 값 반영) + `verifyEffectivePolicyDeterminism`(deepEqual + fresh-object + mutation isolation)로 검증. 영속 캐시 도입 없음. |

### Task 완료 검증

모든 [x] 태스크 검증 — 코드/테스트/문서 모두 일치 (구체적 위치는 아래 이슈에서 인용).

### Git vs Story File List

| 항목 | 상태 |
| --- | --- |
| Story File List 11개 항목 (`dist/devai-aidd-guard.js` 제외) | git에서 실제 변경 확인됨 |
| `dist/devai-aidd-guard.js`(rebuild) | gitignore(`dist/*`)되어 git에 미반영 — 정상 (LOW만 됨) |
| 명시되지 않은 추가 파일 | 없음 (`_bmad-output/.../sprint-status.yaml`, 본 스토리 파일 두 개는 워크플로 산출물로 자동 갱신됨) |

---

## P0 — 머지 전 필수 수정 (CRITICAL/HIGH)

**없음.** 모든 AC가 코드와 테스트로 입증됨. 의도된 forward-compat 결정과 단일 정규화 진입점이 일관되게 구현됨.

---

## P1 — 권장 수정 (MEDIUM)

### [x] AI-1. `resolveWorkflowPolicy.js`의 per-field fallback이 “단일 정규화 진입점” 주장과 모순 (MEDIUM) — **R2 자동수정 완료**
- **파일**: `src/services/workflow/resolve-workflow-policy.js:59-91`
- **현상**: Story Completion Notes는 *“`resolve-workflow-policy.js`는 더 이상 per-field `|| <default>` fallback을 chain하지 않는다”* 라고 단언하지만, 실제 코드는 `commandTypeMap || {}`, `defaultType || "chore"`, `fallbackTicket || "no-ticket"`, `pattern || "{type}/{ticket}-{slug}"`, `defaultMergeTarget || ""`, `validationRegex || ""`를 그대로 갖고 있다. 함수 주석은 *“defensively safe”* 라고 합리화하지만, 본질적으로 `branch-service#normalizeBranchConfig`의 수동 fallback과 같은 문제다.
- **위험**: 정규화 책임이 두 위치에 흩어져 있어 향후 누군가가 한쪽만 수정하면 silent drift 발생. Story 4.1의 “consistent effective format” AC1을 약화시킨다.
- **권장**: 두 가지 옵션 中 택1
  1. `branchDetails`를 `runtimeConfig.config.branch`의 단순 spread로 단순화하고 부분 입력 테스트는 별도 unit으로 분리.
  2. 현재 방어 코드를 유지하되 함수 주석/스토리 Completion Notes를 “단일 정규화 + 방어 통과” 톤으로 재정렬해 모순을 제거.

### [x] AI-2. `verifyWorkflowPolicyVocabularySchema`의 schema 동기 단언이 Task 2.4 요구보다 약함 (MEDIUM) — **R2 자동수정 완료**
- **파일**: `tests/regression.test.js:1466-1497`
- **현상**: Task 2.4는 *“schema와 인라인 RUNTIME_CONFIG_SCHEMA 두 사본이 차이가 생기지 않도록 회귀 테스트에서 동일 객체임을 직접 비교한다”* 라고 명시한다. 그러나 테스트는 (a) top-level property keys, (b) `branch.properties` keys, (c) `workflowPolicy[*].required`, (d) `workflowPolicy[*].properties` keys 4가지 키 집합만 비교한다. `additionalProperties` flag, type 정의, `audit.properties` 등은 비교 범위 밖이며, description 변경도 감지되지 않는다.
- **위험**: 한 사본의 `additionalProperties`를 false→true(또는 그 반대)로만 바꿔도 테스트는 통과한다. 실제로 “동일 객체임”은 보장되지 않는다.
- **권장**: `assert.deepEqual(RUNTIME_CONFIG_SCHEMA, schemaJson)`로 전체 비교를 추가하거나, 최소한 `additionalProperties` 플래그/`required`/property `type`을 모든 노드에서 비교하는 보조 헬퍼를 추가한다.

### [x] AI-3. `KNOWN_WORKFLOW_POLICY_VOCABULARY` JSDoc이 잘못된 함수에 책임을 귀속함 (MEDIUM) — **R2 자동수정 완료**
- **파일**: `src/config/validate-config.js:7-26`
- **현상**: 주석이 *“`validateRuntimeConfig` surfaces unknown vocabulary values…”*, *“Story 1.3's `validateAndRecover` treats any non-empty `errors[]` as an audit-worthy event”* 라고 적혀있지만, 실제로 vocabulary 경고를 만드는 함수는 `collectWorkflowPolicyVocabularyWarnings`이며, audit 트리거는 `src/index.js`의 bootstrap 로직(64-90줄)이다. `validateAndRecover`는 errors 길이로 audit를 결정하지 않는다.
- **위험**: 미래 유지보수자가 잘못된 위치(validateRuntimeConfig 또는 validateAndRecover)에서 vocabulary 처리를 찾게 된다. 1.3 회고가 강조한 “정책은 명시적 위치에 있어야 한다” 원칙을 약화.
- **권장**: 주석을 *“`collectWorkflowPolicyVocabularyWarnings` produces these as `params.source === "vocabulary"` entries; `loadRuntimeConfig` appends them to `validation.errors`; `src/index.js` bootstrap surfaces them via `config.validation.failed` audit on `errors.length > 0`”* 로 수정.

### [x] AI-4. `verifyEffectiveConfigNormalizationContract`가 “정규화 후 동일 effective 결과” Task 1.4 요구를 검증하지 않음 (MEDIUM) — **R2 자동수정 완료**
- **파일**: `tests/regression.test.js:1268-1346`
- **현상**: Task 1.4는 *“DEFAULT_PLUGIN_CONFIG, global.jsonc, project.jsonc, legacy json 모두 정규화 후 동일한 effective 결과를 만들 수 있어야 한다”* 라고 요구한다. 그러나 테스트는 **타입 일치만** 확인하며 값 일치는 확인하지 않는다. 예: legacy template은 `longLivedBranches`가 누락돼 defaults `["main", "master"]`로 채워지지만, 만약 향후 누군가 legacy template에 `longLivedBranches: ["main"]`만 넣어도 테스트는 통과한다.
- **위험**: Task가 의도한 “템플릿 사이 effective 등가성” 회귀 보호가 실제로는 작동하지 않는다.
- **권장**: 적어도 `branch.pattern`, `branch.defaultType`, `branch.fallbackTicket`의 *값*이 세 소스에서 같음을 deepEqual로 단언. legacy ↔ global 사이의 의도된 차이(있다면)는 명시적 화이트리스트로 분리.

---

## P2 — 후속 권장 (LOW)

### [x] AI-5. `branch-service.js#normalizeBranchConfig`의 `defaultMergeTarget` 필드 누락 (LOW) — **R2 자동수정 완료**
- **파일**: `src/services/git/branch-service.js:23-48`
- **현상**: 방어용 통과 함수가 7개 normalized 키 중 `defaultMergeTarget`만 포함하지 않는다. 외부에서 직접 호출하는 경우 effective 구성과 형상 불일치.
- **위험**: 직접 호출자가 미래에 `defaultMergeTarget`을 읽으려 하면 undefined. 현재 호출자는 사용 안 함이라 즉시 영향 없음.
- **권장**: 일관성 위해 `defaultMergeTarget`도 추가하거나, JSDoc에 “이 함수는 branch-service 내부 일부 키만 노출함을 명시”.

### [x] AI-6. `validate-config.js`의 vocabulary 주석이 “params.kind”의 의미를 애매하게 표현 (LOW) — **R2 자동수정 완료**
- **파일**: `src/config/validate-config.js:230-237`
- **현상**: *“`params.kind` indicates whether the entry is a 'warning' (unknown but allowed)”* — “whether”는 다른 값(error/info 등)도 있는 뉘앙스를 풍기지만 실제로 발행되는 값은 `"warning"` 단일 값.
- **권장**: *“`params.kind === "warning"` marks the entry as advisory (forward-compat allow-through)”* 로 단정문화.

### [x] AI-7. README FR18 예시가 `commandTypeMap`에 알려진 슬러그만 보여줌 — vocabulary 경고 사례 누락 (LOW) — **R2 자동수정 완료**
- **파일**: `README.md:71-108`
- **현상**: FR18 jsonc 예시가 모두 known vocabulary로만 구성. vocabulary 경고가 어떻게 audit 스트림에 나타나는지 보여주는 예시가 없어 사용자가 자기 typo를 어떻게 발견할지 직관이 부족.
- **권장**: “예: `finalization: \"commit-and-puh\"` (오타) → audit 이벤트 `config.validation.failed`의 `details.errors[*].params.source === \"vocabulary\"` 항목으로 노출됨” 같은 한 줄 가이드 추가.

### [x] AI-8. `loadRuntimeConfig` 주석이 vocabulary 경고를 “errors”로 분류 (LOW) — **R2 자동수정 완료**
- **파일**: `src/config/load-config.js:385-417`
- **현상**: `validation.errors = [...parseErrors, ...schemaErrors, ...vocabularyWarnings]` — 배열 이름이 `errors`인데 “warning”도 함께 섞여 있다. 외부 소비자가 `errors` 길이로 hard error 판정을 하면 false-positive.
- **위험**: 현재 src/index.js는 `errors.length > 0`로 audit만 트리거하므로 안전. 하지만 향후 다른 호출자가 “errors가 있으면 실패”로 해석할 위험.
- **권장**: 필드 이름을 `validation.entries`로 분리하거나, JSDoc에 “errors는 hard error + vocabulary warning 혼합 — hard error만 보려면 `params.source !== \"vocabulary\"` 필터링 필요”를 명시.

### [x] AI-9. Story File List에 `dist/devai-aidd-guard.js (rebuilt by npm run build)` 항목이 모호함 (LOW) — **R2 자동수정 완료**
- **파일**: 본 스토리 파일 224줄
- **현상**: dist는 gitignore되므로 git diff에 안 보이지만 File List에 포함. 정상 관행이긴 하나 “(generated, gitignored)” 같은 명시가 더 분명.
- **권장**: 다음 스토리부터는 `dist/devai-aidd-guard.js (generated artifact, gitignored)`로 표기 통일.

---

## 의도된 결정 사항 (이슈 아님 — 확인용)

- **Vocabulary를 enum이 아닌 audit-warning으로 surface**: Dev Notes의 “Vocabulary Decision Memo”에 forward-compat 근거를 명문화. Story 1.3의 `additionalProperties: true` 결정과 정합.
- **`config.validation.failed` event를 vocabulary warning에도 재사용**: Dev Notes 가드레일 *“새 audit event type을 만들지 않는다”* 와 정합. `params.source === "vocabulary"` + `kind === "warning"` 태그로 hard error와 구분.
- **`branch-service.js#normalizeBranchConfig`를 제거하지 않고 방어 통과로 유지**: Task 1.2의 *“축소하거나 제거 대상으로 표시한다”* 와 정합 — 현재는 “축소”를 선택.
- **`schemaVersion` bump 없음**: 추가만(어휘 후보, 새 export, 새 audit 태그) 했고 기존 계약은 깨지 않음. Dev Notes 결정 메모 기록됨.

---

## Round 2 자동수정 요약 (2026-05-10)

| 항목 | 분류 | 상태 | 핵심 수정 위치 |
| --- | --- | --- | --- |
| AI-1 | MEDIUM | 자동수정 | `src/services/workflow/resolve-workflow-policy.js` (`branchDetails`가 normalized branch를 직접 소비) |
| AI-2 | MEDIUM | 자동수정 | `tests/regression.test.js` (`verifyWorkflowPolicyVocabularySchema`에 full schema deep-equal 추가) |
| AI-3 | MEDIUM | 자동수정 | `src/config/validate-config.js` (`KNOWN_WORKFLOW_POLICY_VOCABULARY` JSDoc 책임 귀속 정정) |
| AI-4 | MEDIUM | 자동수정 | `tests/regression.test.js` (`verifyEffectiveConfigNormalizationContract`에 cross-source value deepEqual 추가) |
| AI-5 | LOW | 자동수정 | `src/services/git/branch-service.js` (defensive normalize에 `defaultMergeTarget` 추가) |
| AI-6 | LOW | 자동수정 | `src/config/validate-config.js` (`params.kind === "warning"` 단정문화) |
| AI-7 | LOW | 자동수정 | `README.md` (vocabulary typo audit JSON 예시 추가) |
| AI-8 | LOW | 자동수정 | `src/config/load-config.js` (`validation.errors` 혼합 의미 + 필터 표현식 JSDoc) |
| AI-9 | LOW | 자동수정 | 본 스토리 파일 File List 항목 (`generated artifact, gitignored`) |

스킵/연기 항목: **없음.**

R2 검증:
- `npm test` exit 0 — 신규 강화된 R2 테스트(deep-equal schema, cross-source value equivalence) 포함 모두 통과.
- `npm run build` exit 0 — `dist/devai-aidd-guard.js` 455.7kb (의도하지 않은 신규 require 없음).

---

## 최종 판정

- **CRITICAL 없음 / HIGH 없음**
- R1에서 식별된 4 MEDIUM + 5 LOW 모두 R2에서 자동수정 완료.
- AC1, AC2 모두 IMPLEMENTED 상태이며 신규/강화된 회귀 테스트가 계약을 더 강하게 고정한다.
- 잔여 리스크: **없음** (모든 수정은 문서/주석/테스트 강화 또는 already-normalized 입력에 대한 내부 단순화이며 외부 동작은 변경되지 않음).
- 스토리 상태: `review` → `done`.
