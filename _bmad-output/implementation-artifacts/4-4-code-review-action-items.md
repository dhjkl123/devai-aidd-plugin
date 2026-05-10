# Story 4.4 Adversarial Code Review — Action Items

- 작성일: 2026-05-10
- 리뷰어: BMAD Senior Code Reviewer (claude-opus-4-7[1m])
- 대상 스토리: `_bmad-output/implementation-artifacts/4-4-build-and-package-release-artifacts-reliably.md`
- 변경 파일 (uncommitted, working tree 기준):
  - `scripts/make-release.js`
  - `tests/regression.test.js`
  - `README.md`
  - `CHANGELOG.md`
  - `_bmad-output/implementation-artifacts/4-4-build-and-package-release-artifacts-reliably.md`
  - `_bmad-output/implementation-artifacts/sprint-status.yaml`
  - (touched but irrelevant): `.claude/settings.local.json`

## 요약

| 등급 | 개수 |
|---|---|
| CRITICAL | 1 |
| HIGH | 1 |
| MEDIUM | 3 |
| LOW | 4 |

## 검증 결과

- `npm test` 실행 결과 exit code 0 (회귀 테스트 모두 통과). 단, 아래 CRITICAL/HIGH는 회귀 테스트가 잡지 못한 시나리오다.
- `release/devai-aidd-guard/latest/`와 `release/devai-aidd-guard/versions/1.0.0/`에 7종 published 파일 + `manifest.json` + `checksums.txt`가 존재함을 확인.
- AC1 ("릴리스 출력에는 번들된 플러그인, 설치 스크립트, 설정 템플릿, 매니페스트, 체크섬이 모두 포함되어야 한다") — 산출물은 존재하지만, 매니페스트/체크섬과 두 설치기 파서 간의 계약이 깨져 있음 (CRITICAL-1 참조).
- AC2 ("릴리스 메타데이터(`manifest.json`)는 현재 `package.json` 버전과 각 파일의 SHA-256 해시를 정확히 반영해야 한다") — 매니페스트 자체는 정확. 단, 매니페스트 파일에 대한 무결성 검증을 두 설치기가 시도하는데 그 검증이 통과 불가능한 상태 (CRITICAL-1 참조).

---

## CRITICAL

### CRITICAL-1: `make-release.js`가 생성하는 `checksums.txt`에 `manifest.json` 라인이 없어 두 설치기 모두 무결성 검증 단계에서 실패한다 (설치 자체가 깨짐)

- **위치**: `scripts/make-release.js:127-152` (`writeMetadata`), `installer/install.ps1:46-52`, `installer/install.sh:36-43`
- **사실 관계**:
  - `make-release.js`는 `filesToPublish` 7종 (`devai-aidd-guard.js`, 3개 installer, 3개 template) 에 대해서만 `checksums.txt` 라인을 생성한다.
  - 실제 생성된 `release/devai-aidd-guard/latest/checksums.txt`도 7라인뿐이며 `manifest.json` 라인이 없다.
  - `installer/install.ps1` line 47–52는 `manifest.json`을 포함한 4개 파일에 대해 `$checksums[$file] -ne $actual` 체크를 한다. `$checksums["manifest.json"]`은 `$null`이고 `$actual`은 실제 SHA-256 해시이므로 `throw "Checksum mismatch for manifest.json"`이 100% 발생한다 → 설치 실패.
  - `installer/install.sh` line 36–43도 동일한 4개 파일 루프에서 `expected=""`, `actual=<hash>` → `[ "" != "<hash>" ]` true → `exit 1` → 설치 실패.
- **영향**: BASE_URL이 실제 storage account로 교체된 시점에 모든 PowerShell/bash 설치 시도가 실패한다. 사용자 환경에서 silently 실패하는 것이 아니라 명시적 오류로 실패하므로 데이터 손상은 없으나, **AC1의 "팀이 지원되는 환경에 걸쳐 일관된 방식으로 플러그인을 설치할 수 있다" 요구가 깨진다.**
- **회귀 테스트 갭**: `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`가 `manifest.files`를 순회하며 검증하므로 `manifest.json` 자체에 대한 라인 부재를 잡지 못한다. Story Dev Notes line 96 ("체크섬 라인 포맷 ↔ 두 설치기 파서 호환성 단언")의 의도와 불일치.
- **권장 조치 (둘 중 하나)**:
  1. `make-release.js`의 `writeMetadata()`가 `checksums.txt`를 다 쓴 직후 `manifest.json`의 SHA-256을 별도 라인으로 append한다. 단, `manifest.json` 자체의 `files[]`에 manifest 항목을 넣으면 self-reference가 되어 부적합하므로 manifest는 그대로 두고 `checksums.txt`에만 추가한다.
  2. `installer/install.ps1`/`install.sh`의 무결성 검증 루프에서 `manifest.json`을 제외한다.
- **추가 회귀 단언**: `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`가 두 설치기가 검증하려 시도하는 모든 파일 (4종) 에 대해 `checksums.txt` 라인이 있는지 단언하도록 확장한다.

---

## HIGH

### HIGH-1: 3개의 회귀가 `release/` 비어 있을 때 silently skip — `npm test` 단독으로는 매니페스트/체크섬/미러 invariant가 검증되지 않는다 (계약 잠김 약화)

- **위치**: `tests/regression.test.js:11403-11408, 11503-11506, 11559-11562`
- **사실 관계**:
  - `verifyStory44ReleaseManifestCompleteness`, `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`, `verifyStory44LatestAndVersionedDirsMirrored` 세 회귀는 `story44ReleaseArtifactsExist()`가 false면 `return`한다.
  - 즉, 메인테이너가 `npm run release`를 한 번도 실행하지 않았거나, `release/`를 청소한 후 `npm test`만 돌리면 세 contract 단언이 **조용히 통과**한다.
  - Debug Log line 220은 이 동작을 의도된 것으로 명시하지만, Story 4.4의 핵심 의도("계약으로 고정")는 회귀 테스트가 항상 실행될 때 성립한다. CI에서 `npm test`만 돌고 `npm run pack`을 별도 단계로 두지 않으면 계약은 사실상 잠기지 않는다.
- **영향**:
  - 미래 리팩터가 `make-release.js`의 출력 형식을 silently 바꿔도 `npm test`가 green이 될 수 있다 (release artifact 부재 시).
  - Story Intent (line 65) "메인테이너가 의지할 수 있는 계약"의 강도가 약화된다.
- **권장 조치**:
  - `npm run pack` (build + release 체인) 후 `npm test`를 돌리는 메인테이너 흐름을 README에 더 강하게 명시하거나, `package.json`의 `test` 스크립트가 build/release를 prerequisite으로 잡도록 수정한다 (단, 후자는 회귀가 너무 무거워질 수 있어 trade-off 필요).
  - 또는 회귀 자체가 release tree 부재 시 임시 디렉터리에서 `make-release.js`를 강제 실행해 contract을 검증하는 방향도 고려 가능 (단, "메인테이너 작업 트리 mutate 금지" 원칙과 trade-off).

---

## MEDIUM

### MEDIUM-1: `validatePublishSources()`의 hint 분기 로직이 fragile — `missing[].includes(file.name)` 부분 일치는 미래 파일 추가 시 false positive 위험

- **위치**: `scripts/make-release.js:81-85`
- **사실 관계**:
  - 코드:
    ```js
    const hint = filesToPublish.some(
      (file) => file.name === "devai-aidd-guard.js" && missing.some((m) => m.includes(file.name)),
    )
      ? "\nHint: run `npm run build` before `npm run release` to produce dist/devai-aidd-guard.js."
      : "";
    ```
  - 외부 `some`은 사실상 `filesToPublish`에서 `name === "devai-aidd-guard.js"`인 항목 1개 (배열에 0번째 항목)만 매치하는 단일-아이템 조건이지만, 의도가 코드에서 즉시 읽히지 않는다.
  - `missing.some((m) => m.includes(file.name))`은 substring 매치다. 현재 `filesToPublish`의 다른 6개 파일명 어느 것도 `devai-aidd-guard.js`를 부분 문자열로 포함하지 않으므로 false positive는 발생하지 않는다. 그러나 미래 `devai-aidd-guard.js.map` 같은 파일이 추가되면 매치 충돌이 생긴다.
- **영향**: 현재는 동작하지만, 코드 의도가 모호하며 미래 변경에 취약하다.
- **권장 조치**: 단순한 형태로 재작성. 예:
  ```js
  const missingBundle = missing.some((m) =>
    m.startsWith("  - devai-aidd-guard.js "),
  );
  const hint = missingBundle
    ? "\nHint: run `npm run build` before `npm run release` to produce dist/devai-aidd-guard.js."
    : "";
  ```

### MEDIUM-2: `cleanReleaseTarget`의 partial-failure 시나리오가 회귀로 덮이지 않음 — `versionRoot` 청소 후 `latestRoot` 청소가 실패하면 working tree에 inconsistent state가 남는다

- **위치**: `scripts/make-release.js:101-111, 157-161`
- **사실 관계**:
  - 메인 루프는 `[versionRoot, latestRoot]` 순서로 `cleanReleaseTarget` → `copyPublishFiles` → `writeMetadata`를 직렬 실행한다.
  - `versionRoot`에서 모든 단계가 성공했지만 `latestRoot`의 `cleanReleaseTarget`이 실패 (예: Windows에서 다른 프로세스가 파일을 잠그고 있음, 권한 에러) 하면, `versionRoot`은 새 산출물로 채워졌지만 `latestRoot`은 청소 부분 진행 후 멈춰서 inconsistent state가 된다.
  - 사용자 관점에서는 "release 명령이 실패했다"는 사실은 stderr로 알 수 있으나, "어느 디렉터리가 어떤 상태인지"는 알 수 없다.
- **영향**: 현실적으로 드물지만, 메인테이너 측 상태 진단이 어려워진다. 매니페스트가 한 쪽에만 있고 다른 쪽에 없는 상태는 `verifyStory44ReleaseManifestCompleteness`의 `story44ReleaseArtifactsExist` 가드가 false를 반환해 단언이 skip되므로, 회귀가 이 잘못된 상태를 알리지 못한다.
- **권장 조치**: 옵션 (1) `cleanReleaseTarget` 실패 시 한 줄 stderr로 어느 target이 실패했는지 명시 (`make-release: cleanup failed for ${targetRoot}: ...`). 옵션 (2) cleanup을 양 target 모두 한 번에 마친 뒤 copy/writeMetadata 단계로 넘어가는 2-phase 로 재구성. 옵션 (1)이 비용 대비 효과가 좋다.

### MEDIUM-3: PowerShell mirror가 `, 2` 한도를 적용하지 않음 — 미래에 파일명에 다중 공백이 들어가면 두 파서 mirror 결과가 발산한다

- **위치**: `tests/regression.test.js:11370-11384`
- **사실 관계**:
  - 실제 `installer/install.ps1`은 `$line -split "\s{2,}", 2`로 최대 2개 토큰까지만 분리한다.
  - 테스트 mirror `story44ParseChecksumsPwsh`는 `rawLine.split(/\s{2,}/)`로 한도가 없다.
  - 현재 `filesToPublish` 7개 파일명에는 공백이 없으므로 두 동작이 동일하다.
  - 만약 미래에 파일명에 두 칸 이상 공백이 들어간 항목이 추가되면, JS는 추가 분리를 하고 PS는 첫 boundary에서 멈춘다 → mirror가 진짜 mirror가 아니게 된다.
  - `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`의 신뢰도 자체가 mirror의 정확성에 의존한다.
- **영향**: 현재는 무해하나, "두 파서 동등성"을 회귀로 박는다는 Story 4.4의 명시적 의도(line 47, line 96-97)에서 벗어난다.
- **권장 조치**: 한 줄 변경: `rawLine.split(/\s{2,}/, 2)` 또는 동등한 limit 처리를 추가. 동시에 release-side의 line invariant는 이미 `^[0-9a-f]{64} {2}\S/`로 강제되므로 실질 위험은 낮다.

---

## LOW

### LOW-1: missing-source 회귀가 `uninstall.ps1` 한 가지만 검증 — 다른 위치의 source 누락 메시지 포맷이 검증되지 않음

- **위치**: `tests/regression.test.js:11598-11683`
- **사실 관계**: `verifyStory44ReleaseMissingSourceFails`는 `uninstall.ps1` 한 파일만 빠뜨리는 시나리오를 본다. 메시지 포맷은 7개 모두 동일한 코드 경로(`missing.push(...)`)에서 생성되지만, "여러 파일이 동시에 빠진 시나리오"나 "번들이 빠진 시나리오 (그러면 hint 라인이 추가됨)"가 검증되지 않는다.
- **영향**: `validatePublishSources`의 "ALL missing files in single message" claim (Story task line 34)이 회귀로 잠기지 않는다.
- **권장 조치**: 여유가 되면 두 번째 케이스를 추가 (예: dist/devai-aidd-guard.js 누락 → hint 라인 포함 단언). 의무는 아님.

### LOW-2: `STORY_44_EXPECTED_PUBLISHED_FILES`와 `make-release.js`의 `filesToPublish`가 별도 정의 — 향후 동기화 누락 위험

- **위치**: `tests/regression.test.js:11386-11394` vs `scripts/make-release.js:43-51`
- **사실 관계**: 테스트는 의도적으로 hardcoded list를 사용해 drift를 잡는 형태다 (Story 의도 일치). 단, 어느 한 쪽이 변경되면 다른 쪽을 함께 갱신해야 한다는 사실이 코드 주석에 없다.
- **영향**: 실수로 한 쪽만 변경하면 회귀가 다른 의미로 실패한다 (현재는 의도된 동작이므로 큰 문제 아님).
- **권장 조치**: `STORY_44_EXPECTED_PUBLISHED_FILES` 위에 한 줄 주석 추가 — "If filesToPublish in scripts/make-release.js changes, update this constant intentionally to confirm the change." 정도면 충분.

### LOW-3: `cleanReleaseTarget`이 비-`.gitkeep` 디렉터리도 모두 제거 — 의도는 맞지만 README/JSDoc 어디에도 "디렉터리도 같이 제거된다"는 사실이 명시되지 않음

- **위치**: `scripts/make-release.js:101-111`
- **사실 관계**: `fs.rmSync(..., { recursive: true, force: true })`는 디렉터리도 함께 제거한다. 현재 `release/devai-aidd-guard/{latest,versions/<version>}/` 아래에 디렉터리가 들어갈 일은 없지만, 미래에 누군가가 nested 디렉터리를 추가하면 silently 제거된다.
- **영향**: 거의 없음.
- **권장 조치**: JSDoc에 한 줄 보강. 예: "Removes everything except `.gitkeep`, including nested directories — release artifacts are flat-only by design."

### LOW-4: README "빌드와 릴리스" 섹션의 4단계 흐름 중 step 4 ("설치기로 회귀 검증")가 모호 — 메인테이너가 어떻게 검증하는지 구체적 명령이 없음

- **위치**: `README.md:175-211` (변경된 영역)
- **사실 관계**: "설치기로 회귀 검증 (선택)" 단계는 install.ps1/install.sh가 무결성을 확인한다고만 적혀 있고, 메인테이너가 실제로 어떻게 dry-run 검증하는지 (예: `BaseUrl`을 로컬 `release/` 트리 file:// 경로로 잡고 install.ps1을 실행) 가이드가 없다.
- **영향**: 메인테이너가 "이 단계를 어떻게 수행하지?"를 묻게 된다.
- **권장 조치**: "선택 단계"임을 더 분명히 하거나, 한 줄짜리 dry-run 예시를 추가.

---

## CRITICAL/HIGH 1줄 요약

- CRITICAL-1: `checksums.txt`에 `manifest.json` 라인이 없어 두 설치기 무결성 검증 단계에서 100% 실패 — 회귀가 이를 잡지 못함.
- HIGH-1: 3개 회귀가 `release/` 비어 있을 때 silently skip — `npm test`만으로는 매니페스트/체크섬/미러 계약이 잠기지 않음.

## 최종 판정

**CRITICAL 존재** — Story 4.4가 명시적으로 잠그려 한 "두 설치기 파서와의 계약"이 사실상 broken 상태이고, 회귀가 이를 검증하지 못한다. CRITICAL-1 + HIGH-1 + MEDIUM-3 해결 후 다시 리뷰 권장.

---

## Round 2 Dev Follow-up (2026-05-10)

리뷰어: Dev Agent (claude-opus-4-7[1m])
브랜치 상태: `epic4/stories` (uncommitted, working tree)
검증: `npm run build` exit 0, `npm test` exit 0, `npm run release` exit 0, `npm run pack` exit 0, 빌드 산출물 472,450 bytes (461.4kb, 변경 없음).

### CRITICAL-1 — 해결 ✅

- **수정 파일**: `scripts/make-release.js` `writeMetadata()`
- **수정 내용**: 매니페스트를 먼저 디스크에 쓴 뒤 그 sha256을 계산해 `checksums.txt`의 8번째 라인으로 `<sha256>  manifest.json`을 append. 매니페스트 자체의 `files[]`는 그대로 7종(self-reference 회피).
- **두 설치기 contract 일치 검증**:
  - `installer/install.sh` line 36–43 (`awk '$2 == name { print $1 }'`)으로 `manifest.json` 검증 → 실제 sha256과 일치 (bash dry-run으로 4개 파일 모두 OK 확인).
  - `installer/install.ps1` line 47–52 (`-split "\s{2,}", 2`)로 `manifest.json` 검증 → 실제 sha256과 일치 (PowerShell dry-run으로 4개 파일 모두 OK 확인).
- **회귀 추가**: `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`가 (1) `checksums.txt`가 정확히 8라인인지, (2) `STORY_44_INSTALLER_VERIFIED_FILES` (4종) 모두에 대해 PowerShell 미러 + bash 미러 양쪽이 on-disk sha256을 복원하는지 단언. mutation test로 manifest.json 라인 제거 시 회귀가 즉시 실패함을 확인 (`expected 8, got 7`).
- **`latest/` ↔ `versions/<version>/` 양쪽 모두 적용 확인**: 두 디렉터리 모두 `manifest.json` 라인을 갖고 있으며 각자의 매니페스트 sha256을 정확히 가리킴 (각 디렉터리는 자기 자신의 매니페스트를 검증하므로 self-consistent하면 충분).

### HIGH-1 — 해결 ✅

- **선택 접근**: `make-release.js`에 `RELEASE_TARGET_ROOT` 환경 변수 override 추가 → 회귀가 `os.tmpdir()` 작업 공간에 fixture release를 생성한 뒤 단언.
- **수정 파일**:
  - `scripts/make-release.js` — `RELEASE_TARGET_ROOT` 분기 추가 (header JSDoc에 명시).
  - `tests/regression.test.js` — `story44GenerateFixtureRelease(label)` 헬퍼 추가, 3개 contract 회귀(`verifyStory44ReleaseManifestCompleteness`, `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`, `verifyStory44LatestAndVersionedDirsMirrored`)에서 `story44ReleaseArtifactsExist()` skip 가드 제거하고 `story44GenerateFixtureRelease`로 대체.
- **검증**: 작업 트리의 `release/devai-aidd-guard/latest/`와 `versions/1.0.0/` 디렉터리를 임시로 다른 이름으로 rename(`*.bak`)한 상태에서 `npm test` 실행 → exit 0, 모든 contract 회귀가 fixture 생성 + 단언으로 통과. 작업 트리의 실제 `release/`는 절대 mutate 되지 않음 (각 회귀의 `finally`에서 tmp dir 제거).
- **Trade-off**: 회귀 1회당 `make-release.js`를 spawn하므로 `npm test` 시간이 약간 증가 (약 +1~2초). 그러나 이 비용은 "계약이 항상 잠긴다"는 가치 대비 수용 가능.

### MEDIUM-1 — 해결 ✅

- **수정 파일**: `scripts/make-release.js` `validatePublishSources()`
- **수정 내용**: `missing.some((m) => m.includes(file.name))` 부분 일치를 제거하고, 누락 set을 `Set<string>` (`missingNames`)으로 별도 수집해 `missingNames.has(BUNDLE_ARTIFACT_NAME)`로 정확 일치 검사. 의도가 코드에서 즉시 읽히고 미래 `devai-aidd-guard.js.map` 같은 추가에 false-positive 없음.

### MEDIUM-2 — 해결 ✅

- **수정 파일**: `scripts/make-release.js` `cleanReleaseTarget()`
- **수정 내용**: `readdirSync`와 `rmSync` 양쪽을 try/catch로 감싸고, 실패 시 `make-release: cleanup failed for <targetRoot> [while removing <name>]: <message>` 형식으로 어느 target/어느 파일에서 실패했는지 명시. 옵션 (1) 채택 (비용 대비 효과).

### MEDIUM-3 — 해결 ✅

- **수정 파일**: `tests/regression.test.js` `story44ParseChecksumsPwsh()`
- **수정 내용**: `rawLine.split(/\s{2,}/)` → `rawLine.split(/\s{2,}/, 2)`로 limit 2 적용. PowerShell `-split "\s{2,}", 2`와 동일한 토큰화. 미래 파일명에 multi-space가 들어가도 두 파서가 발산하지 않음.

### LOW-1 — 해결 ✅

- 신규 회귀 `verifyStory44ReleaseMissingBundleEmitsBuildHint` 추가. 번들 + `install.sh` 두 source가 동시에 누락된 시나리오에서 (a) stderr가 두 파일명을 모두 포함하고 (b) `npm run build` 힌트 라인이 출력됨을 단언. main() chain에 등록.

### LOW-2 — 해결 ✅

- `STORY_44_EXPECTED_PUBLISHED_FILES` 위에 한 줄 주석 추가 — "If filesToPublish in scripts/make-release.js changes, update this constant intentionally to confirm the change."

### LOW-3 — 해결 ✅

- `cleanReleaseTarget` JSDoc에 한 줄 추가 — "release artifacts are flat-only by design (no subdirectories inside `latest/` or `versions/<version>/`), so any nested directory under a release target is treated as stale and removed."

### LOW-4 — 해결 ✅

- `README.md` "빌드와 릴리스" 섹션 step 4를 "선택" 명시 + bash dry-run 예시(awk + sha256sum 루프) + 4개 파일 list + `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`가 동일 검증을 자동 실행한다는 점을 명시하도록 보강.

### 최종 검증 결과

- `npm run build` exit 0 (461.4kb, 변경 없음)
- `npm run release` exit 0, `latest/checksums.txt` 8라인 (manifest.json 포함), `versions/1.0.0/checksums.txt` 8라인
- `npm run pack` exit 0
- `npm test` exit 0 — `release/`를 임시로 rename한 상태에서도 통과 (HIGH-1 fix 검증).
- 두 설치기 dry-run 시뮬레이션 (bash awk + PowerShell `-split`): 4개 파일(devai-aidd-guard.js, 두 jsonc, manifest.json) 모두 OK.
- mutation test: `manifest.json` 라인을 제거하면 `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`가 즉시 실패 (`expected 8, got 7`).

### 잔여 리스크 / 메모

- `manifest.json`은 `latest/`와 `versions/<version>/`에서 byte-identical하지 않다 (`generatedAt` 타임스탬프가 다름). 따라서 `verifyStory44LatestAndVersionedDirsMirrored`는 7종 published 파일만 비교한다. 매니페스트의 `version`/`name`/`displayName`/`files[]`/sha256은 `verifyStory44ReleaseManifestCompleteness`가 별도로 cross-mirror 단언한다. 이 분리는 의도적 (각 디렉터리의 checksums.txt가 자기 자신의 매니페스트를 검증하므로 self-consistent하면 설치 성공).
- 회귀가 `make-release.js`를 spawn하는 비용: `npm test` 시간 약간 증가. 추후 회귀 reuse를 위해 fixture를 한 번만 생성하고 3개 회귀가 공유하는 최적화는 가능하지만, 현재는 회귀 단위 격리가 더 명확해서 채택하지 않음.

### Status

CRITICAL-1 + HIGH-1 + MEDIUM 3건 + LOW 4건 모두 해결. Story 4.4 status는 `review`로 유지 (code-review가 다음 round에서 다시 검토).

---

## Round 2 Adversarial Code Review (2026-05-10)

- 리뷰어: BMAD Senior Code Reviewer (claude-opus-4-7[1m])
- 대상: round-2 dev follow-up 결과
- 검증 환경: Windows 10, branch `epic4/stories`, working tree (uncommitted)
- 검증 방법:
  1. `npm run release` 실행 후 `release/devai-aidd-guard/{latest,versions/1.0.0}/checksums.txt` 직접 검사 (각 8라인, manifest.json 포함, sha256 일치).
  2. `sha256sum`로 4종 installer-verified 파일 (devai-aidd-guard.js, 두 jsonc, manifest.json) 해시 계산해 checksums.txt와 라인별 매치 확인 (latest/ 기준 4/4 OK).
  3. `npm test` exit 0 확인.
  4. `release/devai-aidd-guard/{latest,versions/1.0.0}` 두 디렉터리를 `*.bak`으로 임시 rename한 상태에서 `npm test` 재실행 → exit 0 (HIGH-1 fix가 fixture 생성 경로로 contract을 항상 잠그는지 확인).
  5. `scripts/make-release.js` 전체 코드 + `tests/regression.test.js` 11320~11890 라인 정독.

### 요약

| 등급 | 개수 (round-2 기준) |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 2 |

### Round-1 이슈 항목별 verdict

| ID | Round-1 등급 | Round-2 verdict | 근거 |
|---|---|---|---|
| CRITICAL-1 | CRITICAL | ✅ **해결** | `release/devai-aidd-guard/latest/checksums.txt`가 8라인이고 마지막 라인이 `8b142f...  manifest.json` (실측 sha256과 일치). `versions/1.0.0/checksums.txt`도 8라인 + 자기 매니페스트 sha256 (`ac00afd2...`)을 가리킴. `writeMetadata()`가 manifest 먼저 쓰고 sha256 계산 후 append하는 순서는 self-consistent. `manifest.json.files[]`는 7종 유지 (self-reference 회피). `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`가 (a) 8라인 단언 (b) STORY_44_INSTALLER_VERIFIED_FILES 4종 모두에 대해 PowerShell+awk 양쪽 파서로 on-disk sha256을 round-trip 검증. mutation test로 manifest.json 라인 제거 시 즉시 fail. |
| HIGH-1 | HIGH | ✅ **해결** | `story44GenerateFixtureRelease(label)`가 `os.tmpdir()`에 `RELEASE_TARGET_ROOT` env override로 fixture release를 생성. 3개 contract 회귀가 모두 fixture 기반으로 단언. `release/`를 `*.bak`으로 rename해도 `npm test` exit 0 — contract이 항상 실행됨을 실증. skip 가드(`story44ReleaseArtifactsExist`) 잔존 없음 (3개 contract 회귀에서 모두 제거됨; missing-source 두 회귀는 원래 tmpdir 기반이므로 해당 없음). `make-release.js`의 env override는 header JSDoc에 명시. |
| MEDIUM-1 | MEDIUM | ✅ **해결** | `validatePublishSources()`가 `Set<string> missingNames` 사용, `missingNames.has(BUNDLE_ARTIFACT_NAME)` 정확 일치 검사. substring 매치 제거됨. 미래 `devai-aidd-guard.js.map` 추가 시 false-positive 없음. |
| MEDIUM-2 | MEDIUM | ✅ **해결** | `cleanReleaseTarget()`이 `readdirSync`와 `rmSync` 둘 다 try/catch로 감싸고, 에러 메시지에 `targetRoot`와 `entry.name`을 포함. 메인테이너가 어느 target/어느 파일에서 실패했는지 즉시 진단 가능. |
| MEDIUM-3 | MEDIUM | ✅ **해결** | `story44ParseChecksumsPwsh()`가 `rawLine.split(/\s{2,}/, 2)` 사용. `installer/install.ps1` line 13의 `-split "\s{2,}", 2`와 동일한 토큰화. |
| LOW-1 | LOW | ✅ **해결** | `verifyStory44ReleaseMissingBundleEmitsBuildHint` (line 11818~11890) 추가, main() 체인 등록 (line 12055). bundle + install.sh 동시 누락 시 (a) 두 파일명 모두 stderr 포함 (b) `npm run build` 힌트 라인 단언. |
| LOW-2 | LOW | ✅ **해결** | `STORY_44_EXPECTED_PUBLISHED_FILES` 위에 drift 주석 추가 (line 11423~11426). |
| LOW-3 | LOW | ✅ **해결** | `cleanReleaseTarget` JSDoc에 "release artifacts are flat-only by design ... any nested directory ... is treated as stale and removed" 명시 (line 130~132). |
| LOW-4 | LOW | ✅ **해결** | README "빌드와 릴리스" step 4에 bash dry-run 예시(awk + sha256sum 루프 over 4 installer-verified files) + `verifyStory44ReleaseChecksumLinesMatchInstallerParsers` 자동화 포인터 추가 (line 188~200). |

### Round-2가 새로 만든 이슈 (LOW)

#### LOW-5: `verifyStory44ReleaseMissingBundleEmitsBuildHint`가 verify-first 부재 invariant를 단언하지 않음

- **위치**: `tests/regression.test.js:11818-11890`
- **사실 관계**: 자매 회귀인 `verifyStory44ReleaseMissingSourceFails` (line 11798~11804)는 "validation 실패 시 release/ 디렉터리가 생성되지 않는다"는 verify-first invariant를 명시적으로 단언한다. 새로 추가된 `verifyStory44ReleaseMissingBundleEmitsBuildHint`는 stderr 메시지 포맷만 검사하고 verify-first invariant를 별도로 단언하지 않는다. multi-missing 시나리오에서 release/ 부분 생성이 silently 발생해도 회귀가 잡지 못한다.
- **영향**: 현재는 `validatePublishSources()`가 모든 단계에 앞서 throw하므로 실제 회귀는 발생하지 않는다. 미래에 `validatePublishSources()` 호출 위치가 잘못 옮겨지면 single-missing 시나리오는 잡히지만 multi-missing 시나리오는 새 회귀가 잡지 못한다.
- **권장 조치**: `verifyStory44ReleaseMissingBundleEmitsBuildHint`의 finally 직전에 한 줄 추가:
  ```js
  assert.equal(
    fs.existsSync(path.join(tempRoot, "release")),
    false,
    "verifyStory44ReleaseMissingBundleEmitsBuildHint: make-release.js must not create release/ when validation fails (verify-first invariant)",
  );
  ```
- **우선순위**: LOW (대칭성/일관성 차원).

#### LOW-6: `RELEASE_TARGET_ROOT` env override는 stdout/stderr에 어디로 출력되는지 표시하지 않음 — 메인테이너 실수 시 silent redirect

- **위치**: `scripts/make-release.js:50-61, 225`
- **사실 관계**: `releaseRootOverride`가 설정된 상태에서 `npm run release`를 실행하면 release tree가 override 위치에 생성되지만, 종료 메시지는 여전히 `Release created for version ${version}`만 출력한다. 메인테이너가 `.bashrc`에 잘못 export한 `RELEASE_TARGET_ROOT=/tmp/xxx`를 가진 상태로 정상 release를 실행하면 `release/devai-aidd-guard/`는 비어 있고 `/tmp/xxx`로 산출물이 생성된다. 발견하기 어려움.
- **영향**: 거의 없음 (의도된 testability hook이며 일반 메인테이너 흐름에는 등장하지 않음). header JSDoc이 동작을 설명하지만 런타임 표시는 없음.
- **권장 조치**: `console.log` 메시지에 release 출력 위치를 절대 경로로 포함시키거나, override가 활성화되었을 때 한 줄로 명시. 예:
  ```js
  console.log(`Release created for version ${version} at ${releaseRoot}`);
  ```
- **우선순위**: LOW (관찰 가능성). 보안 위험은 없음 — env var는 trusted process가 설정하며 path traversal은 OS 권한이 차단함.

### Round-2 변경 부분에 대한 직접 검증

- **`checksums.txt`에 manifest 라인 실제 들어감**: `release/devai-aidd-guard/latest/checksums.txt`와 `versions/1.0.0/checksums.txt` 양쪽 8라인 마지막 라인에 `manifest.json` 존재. sha256은 각 디렉터리의 자기 매니페스트와 정확히 일치 (latest=`8b142f67...`, versioned=`ac00afd2...`).
- **두 설치기 dry-run 호환**: bash 파서(`awk '$2==n{print $1}'`)와 PowerShell 파서(`-split "\s{2,}", 2`) 모두 4종 installer-verified 파일에 대해 정확히 같은 sha256 복원. 회귀가 (a) 두 파서 결과 동일성 (b) 두 파서 결과 = on-disk sha256 양쪽을 단언.
- **회귀 항상 실행**: 작업 트리 `release/`를 비운 상태에서 `npm test` exit 0 — fixture 생성 경로가 정상 작동. skip 가드 잔존 없음.
- **`RELEASE_TARGET_ROOT` 안전성**: 환경 변수는 trusted test process가 설정. `path.join(releaseRootOverride, "devai-aidd-guard")`는 traversal 위험 없음 (releaseRootOverride 값을 OS path로 해석할 뿐, 사용자 입력이 아님). source 파일은 여전히 `projectRoot`에서 해석되므로 sandbox 격리 (test가 sources를 별도 복사할 필요 없음). 보안상 우려 없음.
- **manifest.files[] 7종 유지**: `verifyStory44ReleaseManifestCompleteness`가 `STORY_44_EXPECTED_PUBLISHED_FILES`(7종)와 deepEqual 단언. self-reference 회피 명시.
- **두 디렉터리 모두 적용**: `for (const targetRoot of [versionRoot, latestRoot]) { ... writeMetadata(targetRoot) }` (`scripts/make-release.js:219-223`). 회귀도 양쪽 디렉터리에 대해 단언.
- **`generatedAt` 타임스탬프 차이 모델링**: `verifyStory44LatestAndVersionedDirsMirrored`가 의도적으로 `manifest.json`을 mirror 비교에서 제외 (코멘트 line 11676~11681 참조), `verifyStory44ReleaseManifestCompleteness`가 `version`/`name`/`displayName`/`files[]` 등 timestamp가 아닌 필드만 cross-mirror로 단언. 분리 이유가 코드 코멘트로 명시됨.

### Round-1 이슈 잔존 여부

없음. 9건 모두 round-2에서 fix 처리됨.

### CRITICAL/HIGH 1줄 요약

해당 없음 (round-2에 CRITICAL/HIGH 없음).

### 최종 판정

**CRITICAL 없음.** Story 4.4 round-2 follow-up은 round-1에서 식별한 9건 (CRITICAL 1 + HIGH 1 + MEDIUM 3 + LOW 4)을 모두 정확히 해결했으며, 새로 추가한 fixture 생성 패턴이 contract 단언을 항상 강제한다. round-2가 새로 만든 LOW 2건(LOW-5 verify-first 단언 대칭성, LOW-6 override observability)은 모두 nice-to-fix 수준이며 차기 라운드에서 통합 처리하거나 보류 가능. Story status를 `done`으로 전환할 수 있는 상태로 판단.

---

## R2-Review Auto-Fix Pass (2026-05-10)

리뷰어: Senior Code Reviewer (claude-opus-4-7[1m])
대상: round-2 review가 식별한 신규 LOW 2건
검증: `npm test` exit 0, `npm run release` exit 0 (stdout 새 형식 확인). `npm run build` 미실행 (test/script 파일만 수정, 빌드 산출물 영향 없음).

### LOW-5 — 해결 ✅

- **수정 파일**: `tests/regression.test.js` `verifyStory44ReleaseMissingBundleEmitsBuildHint`
- **수정 내용**: stderr 단언 직후, `finally` 직전에 verify-first invariant 단언 추가:
  ```js
  const tempReleaseDir = path.join(tempRoot, "release");
  assert.equal(
    fs.existsSync(tempReleaseDir),
    false,
    "verifyStory44ReleaseMissingBundleEmitsBuildHint: make-release.js must not create release/ when validation fails (verify-first invariant)",
  );
  ```
- **결과**: `verifyStory44ReleaseMissingSourceFails`와 대칭. multi-missing 시나리오에서 release tree 부분 생성이 silently 발생하면 회귀가 즉시 fail. `npm test` exit 0으로 정상 동작 확인.

### LOW-6 — 해결 ✅

- **수정 파일**: `scripts/make-release.js` (script 본문 마지막 라인)
- **수정 내용**: `console.log(\`Release created for version ${version}\`)` → `console.log(\`Release created for version ${version} at ${releaseRoot}\`)`. 사유는 코드 위에 코멘트로 명시.
- **결과**: `npm run release` 출력이 다음과 같이 변경됨 (실측):
  ```
  Release created for version 1.0.0 at C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\release\devai-aidd-guard
  ```
  `RELEASE_TARGET_ROOT`이 활성화된 경우 override 위치가 그대로 출력되므로 메인테이너가 즉시 인지 가능. fixture-기반 회귀가 spawn하는 호출은 `stdio: "pipe"`이므로 메인테이너 셸에는 영향 없음.

### 검증 결과

- `npm test` exit 0 (LOW-5 신규 단언 포함, 모든 회귀 통과).
- `npm run release` exit 0 (`Release created for version 1.0.0 at C:\...\release\devai-aidd-guard` 출력 확인).
- 두 디렉터리(`latest`, `versions/1.0.0`)의 `checksums.txt` 8라인, 마지막 라인 `manifest.json` 유지 (CRITICAL-1 fix 무영향).

### 잔여 리스크

없음. round-1 9건 + round-2 2건 모두 closed. Story 4.4는 `review` → `done`으로 전환됨.
