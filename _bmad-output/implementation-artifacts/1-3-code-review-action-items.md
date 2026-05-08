# Story 1.3 코드 리뷰 액션 아이템

**Story**: `1-3-load-merged-configuration-and-resolve-workflow-policy.md`
**Branch**: `epic1/story1-3`
**리뷰 일자**: 2026-05-08
**리뷰 결과**: Request Changes
**총 이슈**: Critical 1, High 3, Medium 5, Low 4

---

## P0 — 머지 전 필수 수정 (Must Fix)

### [x] AI-1. `validateAndRecover` 알고리즘 재설계 (Critical)
- **파일**: `src/config/load-config.js:149-200`
- **문제**: invalid한 lower 레이어가 있을 때, 알고리즘이 항상 최상위부터 모든 상위 레이어를 드롭함. 정상 `projectConfig`까지 손실되어 AC4 위반.
- **재현**: 잘못된 `globalConfig` + 정상 `projectConfig` 입력 시 `droppedLayers`에 `projectConfig`까지 포함됨.
- **수정 방향**: 각 레이어를 개별적으로 검증한 뒤, 통과한 레이어만 누적 병합하도록 변경.
- **AC 매핑**: AC4 — "falling back to the previous valid layer"

### [x] AI-2. `parseJsonc` 실패 surfacing (High)
- **파일**: `src/config/load-config.js:23-29`
- **문제**: `JSON.parse` 실패 시 빈 객체로 fallback하며 audit 신호 없음. 사용자가 잘못된 JSON 작성 시 통지 불가.
- **수정 방향**: `parseJsonc` 실패를 `validation.errors`에 추가하거나 별도 audit 이벤트로 분리.
- **AC 매핑**: AC4 — "structured audit event with machine-readable error details"

### [x] AI-3. 스키마 `additionalProperties` 정책 재검토 (High)
- **파일**: `src/config/schema/runtime-config.schema.json:46-92`
- **문제**: 모든 객체에 `additionalProperties: false` 적용으로 미래 호환성 손상. AI-1과 결합 시 모든 사용자 설정이 silent하게 손실될 위험.
- **수정 방향**: `branch` 등 확장 가능 영역은 `additionalProperties: true` 또는 `schemaVersion`-기반 명시적 마이그레이션 도입 검토.

### [x] AI-4. C-1 시나리오 회귀 테스트 추가
- **파일**: `tests/regression.test.js`
- **문제**: 기존 `verifyValidationFallback`은 `projectConfig`(최상위) invalid만 검증하므로 AI-1 결함을 false-positive로 통과시킴.
- **수정 방향**: invalid lower layer (`globalConfig` 또는 `legacyProjectConfig`) + valid upper layer 시나리오 테스트 추가.

---

## P1 — 다음 스토리 시작 전 권장 (Should Fix)

### [x] AI-5. `schemaVersion` 사용 정책 명시 (High)
- **파일**: `src/config/validate-config.js:4`, `src/config/schema/runtime-config.schema.json:8-12`
- **문제**: `RUNTIME_CONFIG_SCHEMA_VERSION = 1` export되지만 어떤 분기 로직에도 사용되지 않음. 향후 마이그레이션 경로 부재.
- **수정 방향**: `schemaVersion.const = 1` 강제 또는 검증 단계에서 sanity check 추가.

### [x] AI-6. `package-lock.json` 커밋 (Medium)
- **파일**: `package-lock.json`, `.gitignore`
- **문제**: lockfile이 untracked 상태인데 스토리 File List는 "수정"으로 명시. 빌드 재현성 보장 불가.
- **수정 방향**: lockfile을 git에 커밋 (권장) 또는 `.gitignore` 등록 후 File List 수정.

### [x] AI-7. 검증 에러 디듭 (Medium)
- **파일**: `src/config/load-config.js:187`
- **문제**: 동일 invalid 레이어가 retry마다 재검증되어 audit payload의 `details.errors`에 동일 항목이 N회 누적됨.
- **수정 방향**: 에러 디듭 또는 마지막 attempt errors만 보관.

---

## P2 — Story 1.4+에서 정리 가능 (Nice to Have)

### [ ] AI-8. 글로벌 설정 중복 read 제거 (Medium)
- **파일**: `src/config/load-config.js:252, 267`
- **문제**: 동일 파일을 두 번 stat + read. `readGlobalConfig`가 누락 vs 빈 객체를 구분 못 해서 발생.
- **수정 방향**: `readConfigFile`을 직접 호출하여 `null` vs `{}` 구분 후 `hasGlobalConfig` 계산.

### [ ] AI-9. `audit.info` API 일관성 개선 (Medium)
- **파일**: `src/index.js:60-69`
- **문제**: `audit.info(eventName, { event: eventName, ... })`로 메시지와 payload `event`가 중복. 호출자가 둘을 일치시켜야만 함.
- **수정 방향**: `audit.info`에서 `payload.event = eventName`을 자동 보장하거나 `audit.event(...)` 별도 API 도입.

### [ ] AI-10. `pluginContext.runtimeConfig.validation.errors` 정규화 (Medium)
- **파일**: `src/index.js:105-108`
- **문제**: hook factory에 전달되는 `validation.errors`가 raw Ajv 객체. Ajv 버전 변경 시 hook 결합도 위험.
- **수정 방향**: pluginContext 전달 시점에 `{instancePath, message, params}` 정규화 적용.

### [ ] AI-11. `resolveWorkflowPolicy` commandName 타입 검증 (Low)
- **파일**: `src/services/workflow/resolve-workflow-policy.js:40-46`
- **문제**: 비-string commandName(`42`, `{}`)이 fallback `ask`로 빠짐. pure function이므로 외부 호출 시 type-safety 부족.
- **수정 방향**: `typeof commandName !== "string"` 체크 추가하여 `skip` 반환.

### [ ] AI-12. bootstrap audit에 `hasLegacyWorkflowProjectConfig` 추가 (Low)
- **파일**: `src/index.js:74-80`
- **문제**: layer별 가시성에서 `legacyWorkflowProjectConfig`만 누락.
- **수정 방향**: audit payload에 동일 키 추가.

### [ ] AI-13. `npm test`의 `--check`에 신규 파일 추가 (Low)
- **파일**: `package.json:11`
- **문제**: 신규 source 파일이 syntax check 대상 아님. 빠른 피드백 손실.
- **수정 방향**: `validate-config.js`, `resolve-workflow-policy.js`, `load-config.js`를 `--check` 목록에 추가.

### [ ] AI-14. `validation.valid` 의미 명확화 (Low)
- **파일**: `src/config/load-config.js:273`, `src/index.js:54`
- **문제**: `valid` 플래그가 "검증 통과"와 "회복 성공"을 구분 못 함.
- **수정 방향**: `valid`는 최종 mergedConfig 검증 통과 여부로 단순화하고, 별도 `recovered` 플래그 추가.

---

## 긍정적 평가 (참고)

1. Ajv 정적 import로 esbuild 인라인 번들링 정상 동작 (`createRequire` 0건)
2. `resolveWorkflowPolicy` pure function 계약 준수, 외부 상태 leak 없음
3. `Object.prototype.hasOwnProperty.call`로 prototype pollution 방어
4. Schema validation을 `normalizeConfig` 전에 호출하여 silent correction 방지
5. Story 1.1·1.2 회귀 테스트 모두 보존
6. `buildSafeDefaultPolicy`가 매 호출마다 fresh 객체 반환

---

## 진행 상태

- 총 액션 아이템: 14개 (P0: 4, P1: 3, P2: 7)
- 완료: 7 / 14 (P0 4개 + P1 3개)
- P2 항목: Story 1.4+에서 정리 예정 (Nice-to-Have)
- 다음 단계: 재리뷰 권장 (`code-review` 워크플로우, 다른 LLM 권장)
