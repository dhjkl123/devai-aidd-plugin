# Changelog

## [2.0.0] - 2026-05-11

### BREAKING CHANGES

- 레거시 호환 layer (`devai-aidd-guard.{global,project}.jsonc`, `opencode-aidd-plugin.json`, `devai-git-workflow.json`) 일괄 제거. 기존 사용자가 보유한 이들 파일은 더 이상 읽지 않으며, 마이그레이션은 모던 경로(`devai-aidd-plugin.{global,project}.jsonc`)로 직접 이전해야 한다.
- `compat.bridge.evaluated` 감사 이벤트 폐기. `.opencode/.devai-aidd-plugin.compat.generated` marker 파일과 호환 mirror 작성 로직(`src/services/compat/legacy-bridge-service.js`)이 제거됐다.
- `plugin bootstrap registered no-op hooks` 감사 이벤트 폐기. wrapper-only 비대칭이 사라져 더 이상 emit하지 않는다.
- `DevaiGitWorkflowPlugin` named export 별칭 제거. `DevaiAiddGuardPlugin`(named) 및 default export만 유지한다. 외부 manifest가 별칭에 직접 의존했다면 호출명을 갱신해야 한다.
- audit wire format `body.service` 필드 값이 `"opencode-aidd-plugin"` → `"devai-aidd-plugin"`로 변경. 다운스트림 audit consumer가 hard-coded `"opencode-aidd-plugin"` literal에 의존한다면 마이그레이션이 필요하다. 레코드의 `legacyService` 필드도 함께 제거됐다.
- start instruction 문자열 단순화: `"Bootstrap compatibility mode is preserving the legacy BMAD hook contract."` 부분이 제거되고 `"Git workflow guard is active for /<commandName>."` 한 문장으로 변경.
- workflowState shape: 별도 `lifecycle` 필드 제거. mutating tool 감지 시 `phase` 필드를 `"mutating"`으로 advance한다(`WORKFLOW_PHASES`에 `"mutating"` 추가).
- 내부 frozen baseline 모듈 `src/policies/legacy/devai-git-workflo.js` 삭제. 6개 hook factory 시그니처가 `createXxxHook(deps)`로 단순화되며 `legacyHandlers` 첫 인자를 더 이상 받지 않는다.
- `templates/legacy-opencode-aidd-plugin.json` 템플릿 삭제. 릴리스 산출물에서도 영구 제외.
- `loadRuntimeConfig().sources` shape는 정확히 `{ hasGlobalConfig, hasProjectConfig }` 두 boolean 키만 노출한다(이전의 4개 추가 키 모두 제거).
- `package.json` `test` 스크립트에서 frozen baseline `node --check` invariant 제거.
- 릴리스 게이트 자동화: `npm run verify:release-gate` 스크립트(`scripts/verify-release-gate.js`)로 MAJOR bump 및 CHANGELOG의 `### BREAKING CHANGES` 섹션 존재를 검증한다.

### Migration guide

- `~/.config/opencode/devai-aidd-guard.global.jsonc` 또는 `<project>/.opencode/devai-aidd-guard.project.jsonc`에 설정이 있다면 동일한 키를 `devai-aidd-plugin.global.jsonc` / `devai-aidd-plugin.project.jsonc`로 옮긴다.
- `<project>/.opencode/opencode-aidd-plugin.json` 및 `devai-git-workflow.json`의 설정도 위와 동일하게 모던 jsonc 파일 한 곳으로 합친다.
- 외부 manifest나 자동화 스크립트가 `DevaiGitWorkflowPlugin` 심볼을 직접 참조한다면 `DevaiAiddGuardPlugin`로 갱신한다.
- 자체 audit consumer가 `body.service === "opencode-aidd-plugin"` 또는 record의 `legacyService` 필드를 사용하고 있다면, `body.service === "devai-aidd-plugin"`로 마이그레이션한다.

## 1.0.0

- 기존 단일 파일 opencode 플러그인을 DevAI AIDD Plugin 표준 구조로 재배치
- `src`, `installer`, `templates`, `scripts`, `release` 디렉터리 추가
- 빌드/릴리스/설치 스크립트 및 설정 템플릿 추가
- 기존 workflow guard 로직을 레거시 코어 모듈로 이동해 동작 유지 기반 확보
- 릴리스 패키징(Story 4.4): `make-release.js`가 누락 source를 사전 검증해 실패 메시지에 파일명을 명시하고, `latest/`·`versions/<version>/` 양쪽 산출물의 매니페스트/체크섬/파일 집합 일치를 회귀 테스트로 고정 (`tests/regression.test.js` `verifyStory44*`)
