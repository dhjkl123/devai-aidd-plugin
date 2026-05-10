# Story 4.4: 빌드와 릴리스 아티팩트를 신뢰성 있게 패키징하기

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

플러그인 메인테이너로서,
빌드 및 릴리스 스크립트가 완전하고 검증 가능한 배포 산출물을 만들어 주기를 원한다,
그래서 팀이 지원되는 환경에 걸쳐 일관된 방식으로 플러그인을 설치할 수 있다.

## Acceptance Criteria

1. **주어진 조건** 메인테이너가 빌드 및 릴리스 워크플로를 실행한 경우  
   **동작 시점** 패키징이 성공적으로 완료되면  
   **기대 결과** 릴리스 출력에는 번들된 플러그인, 설치 스크립트, 설정 템플릿, 매니페스트, 체크섬이 모두 포함되어야 한다  
   **그리고** 버전별 디렉터리(`release/devai-aidd-guard/versions/<version>/`)와 `latest` 디렉터리(`release/devai-aidd-guard/latest/`)가 동일한 산출물 집합으로 일관되게 채워져야 한다.
2. **주어진 조건** 플러그인이 배포용으로 빌드된 경우  
   **동작 시점** 번들 산출물이 생성되면  
   **기대 결과** 산출물은 지원되는 Node.js 런타임을 타깃으로 하고 기존 플러그인 진입점 동작을 그대로 보존해야 한다  
   **그리고** 릴리스 메타데이터(`manifest.json`)는 현재 `package.json` 버전과 각 파일의 SHA-256 해시를 정확히 반영해야 한다.

## Tasks / Subtasks

- [ ] 빌드 산출물의 런타임 타깃과 진입점 동작 계약을 명문화한다 (AC: 2)
  - [ ] `scripts/build.js`의 esbuild 설정(`--bundle --platform=node --format=esm --target=node22`, 단일 출력 `dist/devai-aidd-guard.js`)을 그대로 유지하고, 새 번들러나 새 출력 경로를 도입하지 않는다.
  - [ ] 번들 결과가 ESM 형식과 `node22` 타깃을 유지하는지, 그리고 `tests/regression.test.js`가 이미 사용하는 `dist/devai-aidd-guard.js` 경로(`builtModulePath`) 가정을 깨지 않는지 확인한다.
  - [ ] 빌드 후 산출물이 플러그인 진입점(`src/index.js`에서 노출되는 hook map과 동일한 export shape)을 보존하는지 회귀 테스트가 검증하도록 한다. 신규 회귀가 필요하면 기존 `verifyBuiltArtifactExists` 패턴을 재사용한다.
  - [ ] `package.json` 의 `type: "module"`, `dependencies` (현재 `ajv@8.17.1` 만 존재), `scripts.build/release/pack` 계약을 임의로 변경하지 않는다.

- [ ] 릴리스 패키징 파일 집합의 완결성을 보장한다 (AC: 1)
  - [ ] `scripts/make-release.js`의 `filesToPublish`가 다음 7종을 모두 포함하는지 검증한다: `dist/devai-aidd-guard.js`, `installer/install.ps1`, `installer/install.sh`, `installer/uninstall.ps1`, `templates/devai-aidd-guard.global.jsonc`, `templates/devai-aidd-guard.project.jsonc`, `templates/opencode.jsonc.example`.
  - [ ] 릴리스 실행 전에 누락된 source 파일이 있으면 의미 있는 오류 메시지와 함께 즉시 실패시키도록 사전 검증을 추가한다 (현재는 `fs.copyFileSync`가 ENOENT로 던지지만 메인테이너 관점에서 “어떤 산출물이 누락됐는지”를 명확히 알리는 사전 체크가 더 안전하다).
  - [ ] `templates/legacy-opencode-aidd-plugin.json`은 의도적으로 릴리스 산출물에서 제외된 상태이며(런타임에서 동적으로 bridge), Story 4.4 범위에서 새로 포함시키지 않는다 — 다만 이 결정을 README 또는 코드 주석으로 명시한다.
  - [ ] 릴리스 디렉터리의 사전 정리 정책을 합의한다: `latest`에 이전 버전의 잔재 파일이 남지 않도록 `copyPublishFiles(targetRoot)`가 디렉터리를 재생성하거나, 적어도 게시 대상 외 파일이 함께 남지 않는지 검증한다. `.gitkeep`(현재 release 하위에 두 개 존재)은 의도적 placeholder이므로 보존한다.

- [ ] 매니페스트와 체크섬의 정확성과 일관성을 강제한다 (AC: 1, 2)
  - [ ] `manifest.json`이 `name`, `displayName`, `version`(=package.json), `generatedAt`(ISO-8601), `files[].name/size/sha256` 필드를 정확히 채우는지 확인한다.
  - [ ] `checksums.txt`의 라인 형식이 `<sha256>  <name>` (해시-공백 2칸-파일명)임을 유지하고, `installer/install.ps1`의 `Get-ChecksumMap`(`-split "\s{2,}"`)과 `installer/install.sh`의 `awk '$2 == name { print $1 }'` 양쪽 파서가 그대로 동작하는지 확인한다.
  - [ ] `versionRoot`와 `latestRoot` 두 디렉터리에 동일한 `filesToPublish` 집합이 동일 SHA-256으로 들어가는지 검증한다 (현재 `make-release.js`는 동일 함수 호출로 두 번 채우므로 회귀 테스트로 invariant를 고정한다).
  - [ ] `manifest.json`의 `version` 값과 디렉터리 이름(`versions/<version>`)이 항상 `package.json.version`과 일치하는지 단언한다.

- [ ] 빌드/릴리스 회귀 테스트를 `tests/regression.test.js`에 추가한다 (AC: 1, 2)
  - [ ] 기존 `verifyBuiltArtifactExists` 패턴을 기준선으로 삼아, Story 4.4용 회귀 함수들을 `main()` 체인에 등록한다 (Story 3.5의 `verifyStory35*` 등록 방식 참조).
  - [ ] `verifyStory44ReleaseManifestCompleteness`: `release/devai-aidd-guard/latest/manifest.json` 과 `versions/<version>/manifest.json` 양쪽이 동일한 file 집합/해시를 가지고 있고 `version === package.json.version`임을 단언한다.
  - [ ] `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`: `checksums.txt` 의 각 라인이 PowerShell 설치기와 bash 설치기 양쪽 파서(`-split "\s{2,}"`, `awk '$2 == name'`) 모두에서 같은 결과로 해석되는지 검증한다.
  - [ ] `verifyStory44LatestAndVersionedDirsMirrored`: `latest`와 `versions/<version>` 디렉터리에 게시되어야 할 7종 파일이 모두 존재하고 SHA-256이 일치함을 단언한다.
  - [ ] `verifyStory44ReleaseMissingSourceFails`: 임시 작업 공간에서 source 중 하나가 없을 때 `make-release.js`가 명확한 오류로 실패하는지 검증한다 (실제 `release/`를 오염시키지 않도록 `os.tmpdir()` 작업 공간을 사용한다 — Story 3.5 회귀가 이미 사용하는 `createTempWorkspace` 패턴 재사용).
  - [ ] 회귀 테스트는 best-effort I/O가 아니라 contract-level 단언이므로, 실패 시 메시지가 “어떤 파일/필드가 누락되었거나 불일치하는지”를 명시하도록 작성한다.

- [ ] README와 CHANGELOG가 빌드/릴리스 계약을 정확히 설명하도록 정리한다 (AC: 1, 2)
  - [ ] `README.md`의 “빌드와 릴리스” 섹션이 현재 산출물 7종(번들 1 + 설치 스크립트 3 + 템플릿 3) + 매니페스트/체크섬 2종을 누락 없이 설명하는지 확인하고 필요한 항목만 보강한다.
  - [ ] 메인테이너 관점에서 “버전 올림 → 빌드 → 릴리스 → 설치기 검증”의 순서를 짧게 한 곳에 정리한다 (장황한 가이드 신규 작성보다 기존 README 섹션 보강이 우선이다).
  - [ ] CHANGELOG에 Story 4.4 변경이 있다면 메인테이너 관점에서 의미 있는 한 줄 요약을 추가한다(빌드 출력 변경이 없다면 추가하지 않아도 된다).

- [ ] Story 4.5 회귀 커버리지와의 경계를 명확히 한다 (AC: 1, 2)
  - [ ] Story 4.4는 “릴리스 산출물의 완결성과 메타데이터 정확성”에 집중하고, “wrapper와 built artifact의 행위 동등성 회귀”는 Story 4.5의 범위라는 경계를 Dev Notes에 명문화한다.
  - [ ] Story 4.5가 사용할 `dist/devai-aidd-guard.js` 경로 가정을 깨지 않도록 빌드 출력 파일명/위치를 변경하지 않는다.

## Dev Notes

### Story Intent

Story 4.4는 새로운 빌드 시스템이나 새 번들러를 도입하는 작업이 아니다. 현재 `scripts/build.js`(esbuild 단일 호출)와 `scripts/make-release.js`(파일 복사 + 매니페스트/체크섬 생성)는 이미 동작하고 있고, 릴리스 산출물 7종이 `latest`와 `versions/<version>`에 동일하게 채워지는 흐름도 동작한다. Story 4.4의 핵심은 **"메인테이너가 의지할 수 있는 계약"으로 이 흐름을 고정**하는 것이다 — 누락 시 즉시 알리는 사전 검증, 매니페스트/체크섬의 invariant를 회귀 테스트로 박는 일, 설치기 양쪽 파서가 같은 `checksums.txt`를 같은 방식으로 해석한다는 것을 자동으로 확인하는 일.

“이미 동작 중인 흐름을 다시 만들지 마라.” 새 manifest schema, 새 디렉터리 레이아웃, 새 설치기 포맷을 도입할 이유가 없다. Story 4.4는 기존 산출물의 완결성/일관성/추적성 보장에 집중한다.

### Epic 4 Context

- Epic 4는 정책 관리, 레거시 호환, 그리고 운영(packaging/release/runtime compatibility)을 다룬다.
- Story 4.1은 branch/workflow 정책 정규화, Story 4.2는 legacy compatibility bridge, Story 4.3은 wrapper 호환성 유지, Story 4.5는 wrapper와 빌드 산출물의 회귀 커버리지를 다룬다.
- Story 4.4는 그 사이에서 “패키징 자체의 신뢰도”를 책임진다. 다른 Epic 4 스토리가 무엇을 만들든, 결과가 사용자 환경에 안전하고 검증 가능한 형태로 전달되려면 Story 4.4의 패키징 계약이 흔들리지 않아야 한다.
- Story 4.5는 “built artifact의 행위 동등성 회귀”에 집중하고, Story 4.4는 “산출물이 완결되고 매니페스트/체크섬이 정확한지”에 집중한다. 두 Story는 같은 `dist/devai-aidd-guard.js`를 공유하지만 검증 축이 다르다.

### 현재 코드베이스에서 확인된 기반

- `scripts/build.js`는 매우 얇다. 17줄 esbuild 호출 + `dist/.gitkeep` 보존 + `console.log`. 입력은 `src/index.js`, 출력은 `dist/devai-aidd-guard.js`, 타깃은 `node22`, 형식은 ESM. Story 4.4에서 이 셋을 변경할 이유는 없다.
- `scripts/make-release.js`는 이미 다음을 수행한다:
  - `package.json.version`을 읽어 `release/devai-aidd-guard/versions/<version>/`과 `release/devai-aidd-guard/latest/` 두 곳을 타깃으로 한다.
  - `filesToPublish` 7종을 두 디렉터리에 복사한다 (`devai-aidd-guard.js` + 3개 installer + 3개 template).
  - 각 파일에 대해 SHA-256 해시를 계산해 `manifest.json`(JSON, `name/displayName/version/generatedAt/files[]`)과 `checksums.txt`(라인당 `<hash>  <name>`)를 생성한다.
- `installer/install.ps1`과 `installer/install.sh`는 위 5종(`devai-aidd-guard.js`, 두 jsonc, `manifest.json`, `checksums.txt`)을 받아 `checksums.txt`로 무결성을 검증한 뒤 `~/.config/opencode/`에 설치한다. **즉, `make-release.js`가 만드는 `checksums.txt` 라인 포맷은 두 설치기 파서의 입력 계약이다.** 이 계약을 깨면 사용자 설치가 silently 실패한다.
- `installer/install.ps1`은 `-split "\s{2,}", 2` 로 라인을 파싱하므로 “해시 + 공백 두 개 이상 + 파일명” 형식을 강제한다. 현재 `make-release.js`는 정확히 “해시 + 공백 2 + 파일명” 라인을 만든다 (`${entry.sha256}  ${entry.name}`). 이 invariant를 깨지 않도록 한다.
- `installer/install.sh`는 `awk '$2 == name { print $1 }'` 로 파싱하므로 공백 분리만 맞으면 동작한다.
- `package.json`의 현재 버전은 `1.0.0`. `pack` 스크립트가 `npm run build && npm run release` 체인이므로, `npm test` 전에 `npm run build`를 먼저 돌려야 `tests/regression.test.js`의 `verifyBuiltArtifactExists`가 통과한다는 사실이 이미 회귀 테스트에 단언되어 있다 (line 99: `"missing dist/devai-aidd-guard.js — run \`npm run build\` before \`npm test\`"`).
- `release/devai-aidd-guard/latest/`와 `release/devai-aidd-guard/versions/`에는 현재 `.gitkeep`만 커밋되어 있다 (실제 릴리스 산출물은 git ignore 대상). Story 4.4는 디렉터리 placeholder를 깨지 않는다.

### Story 4.4가 닫아야 할 갭

“이미 동작 중” ≠ “계약으로 고정됨”. Story 4.4가 추가해야 할 것은 다음이다.

1. **사전 검증 with 명확한 메시지.** 현재는 source 누락 시 `fs.copyFileSync`가 ENOENT로 throw한다. 메인테이너 관점에서 “어떤 파일이, 어디에서 누락되었는지”를 한 줄로 알리는 검증이 부족하다.
2. **`latest` ↔ `versions/<version>` 동등성의 회귀 단언.** 현재 코드는 같은 함수를 두 번 호출하므로 결과가 같지만, 이를 회귀 테스트로 박지 않으면 미래 리팩토링이 silently 깰 수 있다.
3. **매니페스트 ↔ package.json 버전 일치성 단언.** 현재는 build 시 일치하지만, 회귀가 없으면 `make-release.js`만 수정하고 `package.json`을 안 올린 상태에서 잘못된 릴리스가 나갈 수 있다.
4. **체크섬 라인 포맷 ↔ 두 설치기 파서 호환성 단언.** 라인 포맷을 깨면 사용자 환경에서만 발견되는 회귀가 된다. PowerShell 파서와 bash 파서를 회귀 테스트가 모두 사용하도록 만든다 (PowerShell이 없는 환경에서는 정규식으로 동등 검증).
5. **번들 진입점 동작 보존 단언.** Story 4.5가 더 깊게 다루겠지만, Story 4.4 차원에서는 적어도 `dist/devai-aidd-guard.js`가 ESM으로 import 가능한 hook map을 노출한다는 최소 단언은 유지한다 (`tests/regression.test.js`가 이미 import-eval하므로 추가 단언은 가벼워야 한다).

### 피해야 할 것

- 새 번들러 도입(rollup/webpack/swc): 범위 밖.
- 새 매니페스트 스키마, 새 체크섬 알고리즘(SHA-512 등), 새 디렉터리 구조: 범위 밖. 설치기 호환성을 깬다.
- `.gitkeep` 파일 제거 또는 `release/` 트리 git tracking 정책 변경: 범위 밖.
- `templates/legacy-opencode-aidd-plugin.json`을 무조건 릴리스 산출물에 포함시키기: 의도적 제외 상태. 런타임 bridge 책임이며 Story 4.2에서 다룬다.
- `dist/` 또는 `release/` 디렉터리를 회귀 테스트가 임의로 비우거나 덮어쓰기: 메인테이너의 작업 트리를 손상시킨다. 검증은 `os.tmpdir()` 또는 read-only 단언으로 한다.
- 빌드 후 추가 압축(gzip/zip): 범위 밖. 현재 설치기는 평문 파일을 받는다.
- npm publish 전환: deferred decision (architecture.md “Deferred Decisions”).

### Previous Story Intelligence

Story 3.5에서 가져올 학습:

- 회귀 테스트 함수명에 Story 식별자를 prefix(`verifyStory35*`)로 박아 `main()` 체인에 등록하면 추적성이 좋다. Story 4.4도 `verifyStory44*` 패턴을 따른다.
- 임시 디렉터리 기반 격리(`createTempWorkspace`, `os.tmpdir()`) 패턴이 이미 있다. 릴리스 누락 시나리오 회귀에서 그대로 쓴다.
- 회귀 테스트는 contract-level 단언이고, 실패 메시지가 명확해야 한다 (Story 3.5 round-1에서 dead code가 발견된 이유도 회귀 메시지가 기준이었기 때문이다).
- “기존 흐름을 재사용하고 새 카테고리를 만들지 않는다”는 Story 3.5의 reuse 계약 원칙을 Story 4.4도 그대로 적용한다 — 새 manifest 필드, 새 설치기 형식, 새 디렉터리를 도입하지 않는다.

Story 3.4에서 가져올 학습:

- 메타데이터 필드의 invariant(`workflow/command/timestamp/details.actionKind/details.correlationId`)를 회귀로 고정해 “필드 누락이 silently 깨는” 시나리오를 막았다. Story 4.4의 `manifest.json` 필드(`name/displayName/version/generatedAt/files[]/files[].name/size/sha256`)에도 같은 단언 패턴을 적용한다.
- best-effort 원칙은 audit 한정이고, build/release 검증은 strict해야 한다. Story 4.4의 회귀는 “best-effort + 통과”가 아니라 “fail-fast + 명시적 오류 메시지”다.

Epic 1 retro에서 가져올 학습:

- “proposal-first / planning-only-no-mutation” 패턴이 코드 측 원칙이라면, Story 4.4의 패키징 측 등가는 “verify-first / mutate-release-tree-only-after-validation”이다. 사전 검증이 release tree를 더럽히기 전에 실패하도록 한다.

Epic 2 retro에서 가져올 학습:

- 라운드-N+1 리뷰가 라운드-N이 놓친 결함을 잡는다는 사실. Story 4.4도 “회귀 테스트만으로 충분한지” + “사전 검증이 충분한지”를 분리해서 본다. 회귀가 통과해도 사전 검증이 빈약하면 메인테이너 경험이 나쁘다.

### Git Intelligence Summary

최근 커밋들은 모두 Epic 3 스토리 마무리(`Implement Story 3.x ...`, `Address Story 3.x review round 1 follow-ups`, `Merge ... into master`)다. Epic 4는 첫 스토리(4.1 → 4.5 순서대로 또는 backlog 순서대로)가 곧 시작될 단계이며, 4.4는 그 중에서도 **빌드/배포 행위가 변경된 모든 이전 스토리의 안전망**으로 동작해야 한다. 따라서:

- Story 4.4 구현 직전에 `npm run build && npm test`가 green인지 baseline 확인. 이미 master는 green 상태(`d6f1e4a`).
- Story 4.4 구현 중 추가하는 회귀가 기존 회귀(특히 `verifyBuiltArtifactExists`와 Story 3.5의 7개 회귀)와 충돌하지 않는지 main() 체인 순서로 확인.
- 커밋 단위는 Epic 3에서 확립한 “스토리 단위 귀속 가능한 커밋”을 따른다. `Implement Story 4.4 build and release packaging contract` 또는 동등한 형식.

### 구현 가드레일

- 빌드 산출물 경로/타깃/형식 invariant: `dist/devai-aidd-guard.js`, `node22`, ESM. 변경 금지.
- 릴리스 디렉터리 invariant: `release/devai-aidd-guard/latest/`, `release/devai-aidd-guard/versions/<version>/`. 두 디렉터리는 동일 파일 집합과 동일 SHA-256으로 채워져야 한다.
- 산출물 7종 invariant: 번들 1 + installer 3 + template 3. 무엇 하나라도 누락되면 fail.
- 매니페스트 invariant: `version === package.json.version`, `files[i].sha256 === sha256(files[i].name)`, `files[i].size === fs.statSync(...).size`.
- 체크섬 라인 invariant: `<sha256>  <name>` (해시-공백 2칸-파일명, 마지막 라인에 trailing newline). PowerShell `-split "\s{2,}"`와 bash `awk '$2 == name'` 둘 다 통과해야 한다.
- 레거시 산출물(`templates/legacy-opencode-aidd-plugin.json`)은 의도적으로 릴리스에서 제외한다. 변경 금지.

### 테스트 포인트

- `dist/devai-aidd-guard.js`가 존재하고 ESM import 가능 (이미 `verifyBuiltArtifactExists`로 단언됨 — 보강 시 깨지 않게).
- `npm run release` 후:
  - `release/devai-aidd-guard/latest/` 와 `release/devai-aidd-guard/versions/<version>/` 양쪽에 7종 + `manifest.json` + `checksums.txt` 가 존재.
  - 두 디렉터리의 동일 파일 SHA-256이 일치.
  - `manifest.json.version === package.json.version`.
  - `manifest.json.files[].sha256 === checksums.txt`의 동일 라인.
  - `checksums.txt`의 모든 라인이 PowerShell 파서/bash 파서 양쪽에서 같은 결과 (동등성 단언).
- 누락 시나리오: `filesToPublish` 중 하나의 source가 없을 때 명확한 오류로 실패. 작업 트리에 부분 산출물 잔재 없음.
- 버전 불일치 시나리오: `package.json.version`과 매니페스트의 version 또는 `versions/<version>` 디렉터리명이 어긋나면 회귀 단언 실패.
- 회귀 테스트는 메인테이너 작업 트리(`release/`)를 영구 변경하지 않는다 — read-only 단언 또는 임시 디렉터리.

### 구현 파일 후보

- 기존 파일 확장 우선
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\make-release.js` — 사전 검증 추가, 명확한 오류 메시지, 두 디렉터리 동등성 보장 강화
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\build.js` — 변경 최소화 (현 상태 유지가 기본)
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` — Story 4.4 회귀 함수 4~5개 추가 + main() 체인 등록
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\package.json` — 변경 최소화 (scripts/dependencies 변경 금지가 기본)
  - `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md` — “빌드와 릴리스” 섹션 보강 (가벼운 한 단락 수준)
- 새 파일이 필요하다면 `scripts/` 아래 또는 별도 모듈
  - 예: `scripts/lib/release-validation.js` — 사전 검증 헬퍼 (만일 `make-release.js`가 너무 두꺼워질 때만)
  - 단, “과도한 모듈화 금지”. 현재 17~70줄 스크립트를 라이브러리로 쪼개는 것은 비용이 크다.
- 피해야 할 위치
  - `src/` 아래 — 빌드/릴리스는 런타임 코드가 아니므로 침범 금지
  - `_bmad/` 또는 `_bmad-output/` 아래 — 워크플로 산출물 영역, 빌드 스크립트가 들어가면 안 된다

### Project Structure Notes

- 본 프로젝트는 brownfield이며, architecture.md의 “Build Process Structure”(line 598~600) 결정사항이 이미 현 구조를 인정한다 — `scripts/build.js`가 번들링, `scripts/make-release.js`가 배포 자산 조합. Story 4.4는 이 구조를 깨지 않는다.
- architecture.md의 Deployment 결정(line 223~228)은 “Build pipeline remains script-driven, Release verification becomes CI-enforced, Installer assets remain first-class deployment outputs, Artifact integrity checks should include manifest and checksums verification”이다. Story 4.4는 마지막 두 항목(installer 일급 + manifest/checksum 검증)에 정확히 해당한다.
- architecture.md의 Recommended Project Tree(line 482~486)는 `scripts/upload-azure.ps1`을 포함하지만 현재 저장소에는 없다. Story 4.4 범위에서 이 누락을 새로 채울 이유는 없다 (CI 단계가 들어올 때 함께 다룰 사안).
- `project-context.md`는 현재 저장소에서 발견되지 않았다. 따라서 본 스토리는 PRD, Epics, Architecture, README, CHANGELOG, 실제 source/scripts/installer/templates를 기준으로 컨텍스트를 정리했다.

### Latest Tech Information

- esbuild는 현재 버전(`npx esbuild` 호출, package.json devDependencies 명시 없음 — npx가 최신 stable 사용)이 `--target=node22`와 `--format=esm`을 안정적으로 지원한다. Story 4.4에서 esbuild 버전을 핀하거나 변경할 이유는 없다.
- Node.js 22 LTS는 ESM과 `fs`, `crypto.createHash("sha256")`, `fs.statSync`, `path` 등 본 스크립트가 사용하는 표준 API를 모두 지원한다. 새 의존성 추가 불필요.
- SHA-256은 NIST FIPS 180-4 표준이며 PowerShell `Get-FileHash -Algorithm SHA256`, bash `sha256sum`/`shasum -a 256`이 모두 동일 알고리즘을 사용한다. 즉 release-side 해시와 client-side 검증 해시는 비트 레벨로 일치해야 정상이며, 이 invariant는 회귀 테스트로 단언 가능하다.

### References

- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\epics.md` — `Epic 4: Policy Administration and Compatibility Operations`, `Story 4.4`, “Additional Requirements” 의 ESM 패키징/esbuild/release manifest/SHA-256/installer/`latest`-vs-versioned dirs 항목
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\architecture.md` — “Infrastructure & Deployment” (line 223~228), “Build Process Structure” (line 598~600), Project Structure & Boundaries (line 408~508)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\planning-artifacts\prd.md` — Functional/NonFunctional Requirements, Additional Requirements 의 “Preserve ESM Node.js packaging and the script-driven build/release flow based on `esbuild`, release manifests, and SHA-256 checksum generation” / “Ensure release packaging includes the built plugin, installers, templates, manifest, and checksums for both `latest` and versioned release directories” / “Keep installer artifacts and template configuration files as first-class deliverables alongside source code”
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\build.js` — 현 esbuild 호출 (`--bundle --platform=node --format=esm --target=node22`), 출력 `dist/devai-aidd-guard.js`
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\scripts\make-release.js` — 현 `filesToPublish` (7종), `copyPublishFiles`, `sha256`, `writeMetadata`(manifest/checksums), `versionRoot`/`latestRoot` 동시 채움
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\package.json` — version, scripts (`build`/`release`/`pack`/`test`), dependencies (`ajv@8.17.1`)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\installer\install.ps1` — 다운로드 파일 목록, `Get-ChecksumMap` (`-split "\s{2,}", 2`) 파서 계약
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\installer\install.sh` — 다운로드 파일 목록, `awk '$2 == name { print $1 }'` 파서 계약
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\installer\uninstall.ps1` — 제거 대상 파일 목록 (참고)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\templates\devai-aidd-guard.global.jsonc` / `devai-aidd-guard.project.jsonc` / `opencode.jsonc.example` — 릴리스 포함 대상 템플릿
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\templates\legacy-opencode-aidd-plugin.json` — 릴리스 의도적 제외 (Story 4.2 영역)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\tests\regression.test.js` — `verifyBuiltArtifactExists` (line 95~101), Story 3.5 회귀 등록 패턴 (`verifyStory35*` + main 체인)
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\README.md` — “빌드와 릴리스”, “설치”, “롤백” 섹션
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\CHANGELOG.md` — 1.0.0 변경 요약
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\3-5-preserve-reviewer-traceability-through-standard-git-history.md` — 회귀 함수 명명/등록/임시 디렉터리 격리 패턴 참조
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\3-4-record-approval-outcomes-and-execution-results-for-audit.md` — invariant 단언으로 “필드 누락 silent 회귀” 방지하는 패턴 참조
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\epic-1-retro-2026-05-09.md` — “proposal-first / planning-only-no-mutation” 원칙
- `C:\Users\User\Desktop\AIDD\opencode-aidd-plugin\_bmad-output\implementation-artifacts\epic-2-retro-2026-05-09.md` — 라운드-N+1 리뷰 가치, 사전 검증과 회귀의 분리

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
