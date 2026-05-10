# Tech-Spec 보조 노트 — Remove Legacy Compatibility Layer

**Created:** 2026-05-11
**Companion to:** `tech-spec-remove-legacy-compatibility-layer.md`

이 노트는 Task 1 consumer 인벤토리(AC15)와 Task 2 시맨틱 동등성 비교(F18)의
근거 자료를 기록한다.

---

## Task 1 — Consumer Inventory (AC15)

baseline commit: `b7ce78bd5276fc2b7be867101fca93fb36c020cc`
실행 일시: 2026-05-11

### `installer/`

대상 파일: `installer/install.ps1`, `installer/install.sh`, `installer/uninstall.ps1`

검사 토큰별 매치 수:
- `DevaiGitWorkflowPlugin`: **0건**
- 하드코딩 literal `"opencode-aidd-plugin"`: **0건**
- `opencode-aidd-plugin` (substring): **0건**
- `legacy` / `Legacy` / `LEGACY_`: **0건**
- `aidd-guard`: **0건**

→ installer는 모던 path 어휘만 사용. 별칭·legacy service 이름에 대한 직접
의존이 없으므로 마이그레이션 가이드 불필요.

### `templates/`

대상 파일: `templates/opencode.jsonc.example`,
`templates/devai-aidd-plugin.global.jsonc`,
`templates/devai-aidd-plugin.project.jsonc`,
`templates/legacy-opencode-aidd-plugin.json` (삭제 대상)

검사 토큰별 매치 수 (`templates/legacy-opencode-aidd-plugin.json` 제외):
- `DevaiGitWorkflowPlugin`: **0건**
- 하드코딩 literal `"opencode-aidd-plugin"`: **0건**
- `opencode-aidd-plugin` (substring, .json 확장자 포함): **0건**
- `legacy` / `Legacy` / `LEGACY_`: **0건**
- `aidd-guard`: **0건**
- `compat.bridge`: **0건**

→ `templates/legacy-opencode-aidd-plugin.json` 자체는 Task 11에서 삭제.
→ 다른 template 파일은 별칭이나 legacy service 이름을 직접 참조하지 않음.

### `dist/devai-aidd-plugin.js`

baseline commit 시점 빌드 산출물 grep:
- `DevaiGitWorkflowPlugin`: **3건** (현재 별칭 export 포함)
- 하드코딩 literal `"opencode-aidd-plugin"`: **2건**
- legacy/compat 토큰 다수

→ 본 작업으로 source가 정리된 후 Task 13 `npm run build` 재실행.
Task 14에서 0건 재검증(AC11 게이트).

### `tests/e2e/`

대상 파일: `tests/e2e/helpers.js`, `scenario-*.test.js` 4종

검사 토큰별 매치 수:
- `DevaiGitWorkflowPlugin`: **0건**
- `opencode-aidd-plugin.json` (substring): **0건**
- `devai-git-workflow.json` (substring): **0건**
- `compat.bridge`: **0건**
- `aidd-guard`: **0건**
- `legacy` / `Legacy` / `LEGACY_`: **0건**

→ e2e helper는 `DevaiAiddGuardPlugin`을 통째로 instantiate하므로 hook factory
시그니처 변경의 영향 없음. 시나리오 파일도 deleted-target 토큰을 0건 참조.

### 종합 결론

외부 consumer가 별칭 export 또는 legacy service 이름에 직접 의존하는
케이스 **없음**. CHANGELOG의 마이그레이션 가이드는 일반 사용자(자체 audit
consumer를 실행하는 경우)를 위한 안내만 작성하면 충분하다. installer/template/
test 측에서 추가 변경 작업은 발생하지 않는다.

---

## Task 2 — `loadWorkflowCommands` 시맨틱 동등성 (F18)

본 비교는 Task 2 진행 시 갱신.

비교 대상:
- `src/policies/legacy/devai-git-workflo.js`의 local `loadWorkflowCommands`
- `src/config/load-config.js`의 export `loadWorkflowCommands`

### 비교 결과 (2026-05-11 실행)

**Legacy version** (`src/policies/legacy/devai-git-workflo.js:60-73`):
```js
function loadWorkflowCommands(projectDirectory) {
  const commandsDirectory = path.join(projectDirectory, ".opencode", "commands");
  if (!fs.existsSync(commandsDirectory)) return new Set();
  return new Set(
    fs.readdirSync(commandsDirectory)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => entry.replace(/\.md$/i, "")),
  );
}
```

**Export version** (`src/config/load-config.js:480-493`):
```js
export function loadWorkflowCommands(directory, fsAdapter) {
  const commandsDirectory = path.join(directory, PROJECT_CONFIG_DIR, "commands");
  if (!fsAdapter.existsSync(commandsDirectory)) return new Set();
  return new Set(
    fsAdapter.readdirSync(commandsDirectory)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => entry.replace(/\.md$/i, "")),
  );
}
```

**확인 사실:**
- `PROJECT_CONFIG_DIR === ".opencode"` (`src/utils/constants.js:15`).
- 파싱 로직(파일 필터링, 확장자 strip) 동일.
- 차이: legacy는 raw `fs` import, export는 DI된 `fsAdapter`. 프로덕션
  `fsAdapter`는 동일한 `fs` 모듈이므로 동일 동작. 테스트에서는 export
  버전이 더 강력(in-memory FS 주입 가능).

**결론:** 두 함수는 시맨틱 byte-for-byte 등가. legacy version은 안전하게 폐기
가능. Task 11에서 `src/policies/legacy/devai-git-workflo.js` 파일을 삭제할 때
함께 사라짐.

