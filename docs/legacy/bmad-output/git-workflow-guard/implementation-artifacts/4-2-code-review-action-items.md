# Story 4.2 코드 리뷰 액션 아이템 (Round 1 + Round 2)

**Story**: `4-2-preserve-legacy-configuration-compatibility-and-bridge-files.md`
**Branch**: `epic4/stories`
**Round 1 일자**: 2026-05-10 (adversarial review)
**Round 2 일자**: 2026-05-10 (auto-fix follow-up)
**리뷰어**: Claude Opus 4.7 (1M) — bmad-code-review
**Round 1 결과**: Conditional Approve (CRITICAL 0, HIGH 0)
**Round 2 결과**: All 3 MEDIUM + 4 LOW auto-fixed; status `review` → `done`
**총 이슈**: CRITICAL 0, HIGH 0, MEDIUM 3, LOW 4 (모두 R2에서 처리)
**테스트**:
  - R1 시점: `npm test` exit 0 (legacy-vs-wrapper / legacy-vs-built parity 모두 passed; Story 4.2 회귀 8건 포함 전체 통과)
  - R2 시점: `npm test` exit 0(Story 4.2 R2 회귀 3건 추가 포함 — 총 11건), `npm run build` exit 0(dist 461.1kb)

---

## 검증 요약

### Acceptance Criteria 검증

| AC | 결과 | 증거 |
| --- | --- | --- |
| AC1 (레거시만 존재 시 그대로 읽고 호환성 규칙이 요구할 때만 mirror 생성) | IMPLEMENTED | `src/services/compat/legacy-bridge-service.js#classifyBridgeDecision`의 Case A/B/C/G가 "no-config-sources / preserve-existing-legacy / refresh-bridge / global-only-no-bridge-needed"로 결정적 분기. `verifyStory42BridgeNoOpOnEmptyWorkspace`(Case A) + `verifyStory42BridgePreservesUserLegacyWithoutMarker[B]` + `verifyStory42BridgeRefreshWhenMarkerPresent[C]`로 회귀 고정. |
| AC2 (모던 + 레거시 공존 시 결정적 우선순위 + silent override 금지) | IMPLEMENTED | Case F(`hasProject && hasLegacyProject && !markerPresent → preserve-user-legacy`) + 우선순위 보존 invariant. `verifyStory42BridgePreservesUserLegacyWithoutMarker[F]`(사용자 레거시 byte-for-byte 보존) + `verifyStory42BridgePrecedenceProjectOverridesLegacy`(modern 값 재로드 후에도 동일)로 회귀 고정. README "레거시 구성 호환성" 섹션이 우선순위 규칙을 단일 진실로 명시. |

### Task 완료 검증

모든 [x] 태스크의 구현 증거 확인됨.

| 태스크 | 증거 |
|---|---|
| service 추출 | 신규 `src/services/compat/legacy-bridge-service.js` 생성, `src/config/load-config.js`는 read-only 포인터 코멘트만 남김 |
| 결정적 우선순위 | `loadRuntimeConfig` JSDoc(line 341-342) 그대로 유지, README "우선순위" 섹션 신설 |
| 7-case 결정 표 | `classifyBridgeDecision`(line 135-188) 구현 + 모듈 doc-block(line 31-46)에 동일 표 동기화 |
| envelope 반환 | `{ written, reason, sources, markerPresent, paths? }` shape, `src/index.js:98-117`에서 audit으로 변환 |
| idempotent 쓰기 | `writeIfChanged`(line 108-115)가 string equality 비교 후 skip, `verifyStory42BridgeWriteIsIdempotent`로 mtime 보존 검증 |
| mirror payload 정제 | `projectLegacyMirrorShape`가 `branch + workflowPolicy`만 picking, `verifyStory42BridgeMirrorOmitsAuditSection`로 audit 키 부재 검증 |
| `compat.bridge.evaluated` audit | `src/index.js:104-117` try/catch 감싼 best-effort emission, `verifyStory42BridgeAuditEventShape`로 페이로드 키 검증 |
| AC2 invariant | `verifyStory42BridgePrecedenceProjectOverridesLegacy`로 재로드 후 modern 값 동일성 검증 |
| 회귀 8건 + main chain 등록 | `tests/regression.test.js:11221-11229`에 8건 모두 등록됨 |
| README 갱신 | "레거시 구성 호환성" 섹션 + 4개 표(경로 매핑/우선순위/marker 의미/coexistence) 추가 |

### Git vs Story File List

| 항목 | 상태 |
| --- | --- |
| Story File List 7개 (코드/테스트/문서) | git에서 실제 변경 확인됨 (`README.md`, `4-2-*.md`, `sprint-status.yaml`, `src/config/load-config.js`, `src/index.js`, `tests/regression.test.js`, `src/services/compat/legacy-bridge-service.js` 신규) |
| `dist/devai-aidd-guard.js`(rebuild 주장) | `.gitignore:6 dist/*`로 추적 제외 — 빌드 결과물에 신규 문자열 13건 grep 매치 확인 (rebuild 사실 검증 통과) |
| 추가 변경 / 누락 | 없음 |

---

## P0 — 머지 전 필수 수정 (CRITICAL/HIGH)

**해당 없음.** CRITICAL 0건, HIGH 0건.

핵심 동작(7-case 결정 표, idempotent 쓰기, AC2 사용자 자산 보호, audit 이벤트 페이로드, mirror shape 좁히기)은 모두 코드와 회귀 테스트가 일치하며 `npm test`가 통과한다. 아래 MEDIUM/LOW는 견고성·일관성·문서 품질 항목이다.

---

## P1 — Should Fix (MEDIUM)

### M-1. 결정 표 비대칭: "modern + 사용자 작성 workflow-only legacy" / "workflow-only legacy" 케이스 누락 (MEDIUM) — **R2 RESOLVED**

**위치**: `src/services/compat/legacy-bridge-service.js:135-188` (`classifyBridgeDecision`).

**증상**: 다음 입력 조합에서 명시적인 분기가 없어 함수 끝의 defensive default(`{ kind: "noop", reason: "no-config-sources" }`)로 떨어진다.
1. `hasProject=true, hasLegacyProject=false, hasLegacyWorkflow=true, markerPresent=false`
   - 사용자가 손으로 `devai-git-workflow.json`만 편집해 둔 상태에서 모던 설정도 함께 존재하는 경우.
   - Case F는 `hasLegacyProject=true`만 보호하므로 워크플로 전용 사용자 레거시는 명시적으로 보호되지 않는다(데이터는 defensive default 덕분에 우연히 보존되지만, audit `reason="no-config-sources"`는 실제 상태와 모순).
2. `hasProject=false, hasLegacyProject=false, hasLegacyWorkflow=true, markerPresent=false`
   - 동일하게 Case B는 `hasLegacyProject=true`만 보호. workflow-only legacy도 원칙적으로 같은 사용자 자산이지만 reason 라벨이 잘못된다.

**위험**:
- AC2의 "silent override 금지" 의도는 워크플로 미러까지 포함해 사용자가 손댄 모든 레거시 파일을 가리킨다고 봐야 한다(스토리의 mirror "두 개"라는 표현 참조). 데이터 보호는 되지만, 운영에서 audit 로그가 "이 디렉터리는 설정 소스가 없음"이라고 보고하면 디버깅 시 잘못된 결론으로 이어진다.
- 결정 표 내부 invariant(7개 케이스가 입력 공간을 분할)도 사실 분할이 완전하지 않다 — 위 두 조합이 누락이다.

**제안 수정**:
- Case F의 조건을 `hasProject && (hasLegacyProject || hasLegacyWorkflow) && !markerPresent`로 확장하거나 별도의 Case F'를 추가.
- Case B를 마찬가지로 `(!hasProject) && (hasLegacyProject || hasLegacyWorkflow) && !markerPresent`로 확장.
- 모듈 doc-block의 표(line 33-41)와 스토리 결정 표도 동일하게 갱신.
- 새 회귀 케이스 2건을 `verifyStory42BridgePreservesUserLegacyWithoutMarker`에 추가(작성: workflow-only legacy 보존 / modern + workflow-only legacy 보존).

**R2 처리 (2026-05-10)**: 채택. `classifyBridgeDecision`이 `hasAnyUserLegacy = hasLegacyProject || hasLegacyWorkflow` 단일 신호를 사용하도록 리팩터링(`src/services/compat/legacy-bridge-service.js:139-185`). Case B/F 모두 두 레거시 파일을 대칭 보호. 신규 회귀 `verifyStory42BridgePreservesUserWorkflowLegacyWithoutMarker`이 두 변종(workflow-only / modern+workflow-only)을 검증. 모듈 doc-block의 결정 표와 README coexistence 표도 동시 갱신.

---

### M-2. `ensureLegacyProjectConfigCompatibility`가 disk write 예외를 그대로 throw — 부트스트랩 신뢰성 (MEDIUM) — **R2 RESOLVED**

**위치**: `src/services/compat/legacy-bridge-service.js:212-265`, `src/index.js:98-102`.

**증상**: `writeFileSync`/`mkdirSync`가 EACCES, ENOSPC, EROFS 등으로 throw하면 예외가 부트스트랩 콜 사이트(`src/index.js:98`)로 전파된다. 이 위치는 try/catch로 감싸지지 않았으므로 결국 outer `try { ... } catch (error) { ... }`(line 303-319)에서 잡혀 "DevAI AIDD Guard bootstrap failed: ..."로 전체 부트스트랩이 실패한다.

**위험**:
- 호환성 브리지는 보조 라이프사이클이지 코어 부트스트랩 게이트가 아니다. 미러 갱신 실패가 플러그인을 못 쓰게 만들면 NFR8(가용성)에 어긋난다.
- 스토리는 audit emit만 best-effort로 명시했지만, mirror write도 동일한 정신("호환성 지원이 운영을 차단하지 않는다")이 적용되는 게 자연스럽다.
- 기존 `src/config/load-config.js` 구현도 동일하게 throw했으므로 회귀는 아님 — 그러나 스토리가 이 함수를 service로 옮기며 라이프사이클을 정식 owner로 가져왔으므로, 이 시점에 best-effort 정책을 명문화하는 것이 적절하다.

**제안 수정** (택일):
- A. 콜 사이트(`src/index.js:98-102`)에서 try/catch로 감싸고 실패 시 envelope에 준하는 placeholder를 만들어 `compat.bridge.evaluated`에 `details.failure` 필드를 추가해 audit으로 노출.
- B. 서비스 함수 내부의 write 블록을 try/catch로 감싸 envelope에 `written: false, reason: "write-failed", error: <message>`를 반환하도록 변경.

**R2 처리 (2026-05-10)**: B + A 둘 다 채택(belt-and-suspenders).
- 서비스 함수의 write 블록을 try/catch로 감싸 `{ written: false, reason: "write-failed", error: <message> }` envelope 반환(`src/services/compat/legacy-bridge-service.js:241-300`).
- `src/index.js`의 호출 사이트도 외부 try/catch로 감싸 `bridge-threw` fallback envelope을 만들어 audit으로 전달. 어떤 경우에도 부트스트랩이 실패하지 않음.
- 신규 회귀 `verifyStory42BridgeWriteFailureIsBestEffort`이 `writeFileSync`가 EACCES throw하는 경우를 시뮬레이션해 envelope 형태와 non-throw 보장을 검증.

---

### M-3. `markerPresent && hasProject && !(hasLegacyProject || hasLegacyWorkflow)` 케이스에서 reason="refresh-bridge" 라벨이 의미와 어긋남 (MEDIUM) — **R2 RESOLVED**

**위치**: `src/services/compat/legacy-bridge-service.js:160-164` (Case E 블록).

**증상**: marker는 남았는데 사용자가 `opencode-aidd-plugin.json`/`devai-git-workflow.json`을 직접 삭제한 시나리오. `hasLegacyProject=false, hasLegacyWorkflow=false, markerPresent=true, hasProject=true`. 분류기는 Case E를 fire 한다(`if (hasProject && markerPresent)`). 결과적으로 두 미러 파일이 새로 생성된다(create) — 그러나 reason 라벨은 "refresh-bridge"로 보고된다.

**위험**:
- audit 로그를 분석할 때 "refresh"는 기존 미러를 갱신했다는 의미인데, 실제로는 처음 만들어진다. 운영 디버깅에서 마커 잔존/사용자 삭제 시나리오를 식별하기 어렵다.
- 중요도는 의미론 정확성 + 디버깅 비용. 데이터 손상이나 보안 영향은 없음.

**제안 수정**:
- 분기 진입 직전에 `const anyLegacy = hasLegacyProject || hasLegacyWorkflow;`로 판별해 `reason = anyLegacy ? "refresh-bridge" : "rebuild-bridge"`(또는 `"create-bridge"`로 통합)로 라벨링.
- 결정 표 doc-block에 새 reason 라벨을 등재.

**R2 처리 (2026-05-10)**: 채택. Case E를 두 분기로 분리:
- `hasAnyUserLegacy === true` → `refresh-bridge` (기존 의미 보존)
- `hasAnyUserLegacy === false` → `rebuild-bridge` (R2 신규 라벨)

신규 회귀 `verifyStory42BridgeRebuildLabelOnMarkerLeftover`가 marker만 남고 두 mirror 파일이 삭제된 시나리오에서 `reason="rebuild-bridge"` 보고를 검증. 모듈 doc-block의 결정 표(Case E')와 README coexistence 표에 새 라벨 등재.

---

## P2 — Nice to Fix (LOW)

### L-1. `directory` 인자 무시 (LOW) — **R2 RESOLVED (doc only)**

**위치**: `src/services/compat/legacy-bridge-service.js:212`(`void directory;`).

**증상**: 함수 시그니처가 `(directory, fsAdapter, runtimeConfig)`인데 첫 인자를 의도적으로 버린다. `runtimeConfig.paths`에 이미 절대 경로가 들어 있어 동작은 정상.

**위험**: 후속 리팩터에서 `directory`와 `runtimeConfig.paths`가 서로 다른 디렉터리를 가리키면 silent mismatch. 현재 호출처(`src/index.js:98-102`)는 같은 directory를 사용하므로 사실상 위험 없음.

**제안 수정**: 함수에서 `directory` 인자를 제거하거나, 최소한 doc-block에 "boundary 호환을 위한 reserve. paths가 단일 진실"이라고 한 줄 명시.

**R2 처리 (2026-05-10)**: Doc-only 옵션 채택(시그니처는 유지). `void directory;` 직전에 "single source of truth는 `runtimeConfig.paths`이며, 새로운 resolution pathway를 추가하지 말 것"이라는 정책 코멘트 추가(`src/services/compat/legacy-bridge-service.js:213-220`). 시그니처 변경은 호출 사이트 호환을 깨므로 보류.

---

### L-2. Case A에서 marker existence 체크가 항상 실행됨(불필요한 fs syscall) (LOW) — **R2 RESOLVED**

**위치**: `src/services/compat/legacy-bridge-service.js:220`.

**증상**: 모든 호출에서 `fsAdapter.existsSync(paths.legacyCompatMarkerPath)`를 먼저 실행. Case A(빈 워크스페이스)에서는 sources 4개가 모두 false이므로 marker 체크 없이 noop으로 끊을 수 있다. NFR1(latency)에는 영향 없음(syscall 1회).

**제안 수정**: Case A 단축 평가를 `markerPresent` 계산 전에 두면 불필요한 `existsSync` 1회 절감. 가독성 trade-off가 있으니 우선순위는 낮음.

**R2 처리 (2026-05-10)**: 채택. `ensureLegacyProjectConfigCompatibility` 진입 직후에 `noUserSignal` 평가(4 source flag 모두 false)를 두어 빈 워크스페이스 hot path에서 `existsSync(marker)` syscall 1회 절감. 결과 envelope shape는 기존과 동일.

---

### L-3. `writeIfChanged` 비교가 BOM/EOL 차이에 민감 (LOW) — **R2 RESOLVED (doc only)**

**위치**: `src/services/compat/legacy-bridge-service.js:108-115`.

**증상**: 비교는 `String(existing) === String(content)`. UTF-8 BOM이 붙어 있거나 CRLF/LF가 다르면 매번 rewrite. 우리가 작성한 내용은 항상 LF + no BOM이지만, 사용자가 일단 marker/mirror 파일을 다른 에디터로 만져서 EOL/encoding이 변하면 매 부트스트랩마다 rewrite가 일어난다.

**위험**: 영구적인 churn. 데이터 손상 없음.

**제안 수정**: doc-block에 "결정성 비교는 byte-for-byte이며 BOM/EOL 차이도 차이로 본다"라고 명시. 또는 비교 전에 BOM 제거/EOL 정규화. 후자는 결정성 invariant를 약하게 만드므로 doc-block 명시만으로도 충분.

**R2 처리 (2026-05-10)**: Doc-only 채택. `writeIfChanged` doc-block에 "비교는 byte-for-byte이며 BOM/EOL 차이도 차이로 본다 — 우리가 쓰는 컨텐츠는 LF-only/no-BOM이므로 외부 도구가 만진 파일은 의도적으로 canonicalize 한다"라고 명시(`src/services/compat/legacy-bridge-service.js:103-117`). 결정성 invariant 보존을 위해 정규화는 도입하지 않음.

---

### L-4. README "marker가 없는 레거시 파일은 사용자 자산" 설명이 workflow-only 케이스를 명시하지 않음 (LOW) — **R2 RESOLVED**

**위치**: `README.md` 신규 섹션 "marker 파일의 의미" 본문.

**증상**: 본문은 `opencode-aidd-plugin.json`을 예로 들지만 `devai-git-workflow.json` 또한 동일 정책이라는 점은 (M-1과 같은 이유로) 명시되지 않음. 사용자가 workflow-only 레거시를 보호받는지 모르고 marker를 임의로 만들어 놓을 수 있다.

**제안 수정**: 한 줄 추가 — "위 정책은 두 레거시 파일 모두에 동일하게 적용된다." (M-1을 받아들이면 함께 갱신).

**R2 처리 (2026-05-10)**: 채택. README "marker 파일의 의미" 절에 "이 보호 정책은 두 레거시 파일(`opencode-aidd-plugin.json`, `devai-git-workflow.json`) 모두에 동일하게 적용된다" 한 문장 추가. coexistence 표에는 R2 M-3의 `rebuild-bridge` 행과 R2 M-2의 `write-failed` 행도 함께 등재.

---

## R2 종합 결과 (2026-05-10)

| 항목 | 등급 | R2 처리 | 코드 변경 위치 | 회귀 |
|---|---|---|---|---|
| M-1 결정표 비대칭 | MEDIUM | RESOLVED | `legacy-bridge-service.js:139-185` (`hasAnyUserLegacy` 단일 신호), doc-block 결정 표 8 케이스로 확장 | `verifyStory42BridgePreservesUserWorkflowLegacyWithoutMarker` |
| M-2 bridge throw → 부트스트랩 실패 | MEDIUM | RESOLVED | `legacy-bridge-service.js:241-300` (write 블록 try/catch), `src/index.js:104-141` (외부 try/catch + `bridge-threw` fallback) | `verifyStory42BridgeWriteFailureIsBestEffort` |
| M-3 rebuild label 불일치 | MEDIUM | RESOLVED | `legacy-bridge-service.js:165-175` (Case E/E' 분기) | `verifyStory42BridgeRebuildLabelOnMarkerLeftover` |
| L-1 directory 인자 무시 | LOW | RESOLVED (doc) | `legacy-bridge-service.js:213-220` 정책 코멘트 | — |
| L-2 Case A에서 불필요한 syscall | LOW | RESOLVED | `legacy-bridge-service.js:226-243` (`noUserSignal` 단축 평가) | 기존 `verifyStory42BridgeNoOpOnEmptyWorkspace`로 회귀 보장 |
| L-3 BOM/EOL 비교 민감성 | LOW | RESOLVED (doc) | `legacy-bridge-service.js:108-122` doc-block | — |
| L-4 README workflow-only 정책 미명시 | LOW | RESOLVED | `README.md` "marker 파일의 의미" 절 + coexistence 표 | — |

**총 7개 항목 모두 처리.** 신규 회귀 3건 추가(11건 총).

`npm test` exit 0 (전체 통과, 신규 R2 회귀 3건 포함).
`npm run build` exit 0 (`dist/devai-aidd-guard.js` 461.1kb 재빌드 — `legacy-vs-built` parity 비교 정확성 확보).

---

## 잔여 리스크

- **`bridge-threw` fallback 분기 미커버**: `src/index.js`의 외부 try/catch는 belt-and-suspenders 보호이며, 현재 서비스 구조상 도달이 사실상 불가능(write 블록 자체가 try/catch로 감싸짐). 회귀 테스트는 작성하지 않았다 — defensive only. 향후 서비스 시그니처에 throw 가능 분기가 추가되면 회귀를 함께 추가해야 함.
- **Windows mtime 정밀도**: idempotency 검증은 ms 단위. Windows 일부 파일시스템에서 mtime resolution이 2ms 정도로 거칠 수 있으나 동일 파일에 write가 발생하지 않은 경우만 검증하므로 영향 없음.
- 이외 잔여 위험 없음.

---

## 권장 다음 단계

R1+R2 모두 완료. Story 4.2 status: `review` → `done`. 후속 스토리(4-3, 4-4, 4-5) 진행 가능.

---

**최종 판정**: CRITICAL 없음. HIGH 없음. MEDIUM 3 / LOW 4 모두 R2에서 자동 수정. Story 4.2 완료.
