# DevAI AIDD Plugin

DevAI AIDD Plugin은 opencode 기반 DevAI 환경에서 AIDD 가드레일, 정책 적용, 감사 로그, 권한 통제를 담당하는 플러그인이다. 이번 리팩토링의 목표는 기능 변경이 아니라 단일 파일 구조를 표준 배포 구조로 정리하는 것이다.

표시명·패키지명·배포 산출물·설정 파일명 모두 `devai-aidd-plugin` 표준을 따른다. 이전 버전(`devai-aidd-guard`)으로 설치된 사용자의 `~/.config/opencode/devai-aidd-guard.global.jsonc`와 `{project}/.opencode/devai-aidd-guard.project.jsonc` 파일은 호환 브리지를 통해 자동으로 함께 읽힌다(자세한 내용은 [레거시 구성 호환성](#레거시-구성-호환성) 참고).

## 주요 역할

- workflow command 시작 시 git workflow guard를 적용한다.
- 브랜치 생성/전환, baseline commit, finalize/merge 흐름을 기존 로직과 동일하게 유지한다.
- hook 처리 흐름을 `src/hooks`로 분리하고, 기존 단일 파일 코어 로직은 별도 코어 모듈로 이동했다.
- 글로벌 설정과 프로젝트 설정을 읽고, 필요 시 레거시 opencode 프로젝트 설정 경로와 호환되도록 브리지한다.
- 감사 로그는 클라이언트 로그를 기본으로 유지하고, 파일/HTTP 전송 확장 지점을 별도 모듈로 분리했다.

## 디렉터리 개요

```text
devai-aidd-plugin/
├── src/
│   ├── index.js
│   ├── hooks/
│   ├── policies/
│   ├── config/
│   ├── audit/
│   ├── adapters/
│   └── utils/
├── installer/
├── templates/
├── scripts/
├── dist/
├── release/
├── package.json
├── README.md
└── CHANGELOG.md
```

## 설치

Windows PowerShell:

```powershell
iwr "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-plugin/latest/install.ps1" -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Linux/WSL:

```bash
curl -fsSL "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-plugin/latest/install.sh" -o install.sh
bash install.sh
```

직접 버전 고정 설치가 필요하면 `latest` 대신 `versions/<version>` 경로를 사용하면 된다.

## 설치 위치

- Windows: `%USERPROFILE%\.config\opencode\`
- Linux/WSL: `~/.config/opencode/`
- 플러그인 파일: `plugins/devai-aidd-plugin.js`

## 설정 파일

우선순위는 아래와 같다.

1. 글로벌 설정: `~/.config/opencode/devai-aidd-plugin.global.jsonc`
2. 프로젝트 설정: `{project-root}/.opencode/devai-aidd-plugin.project.jsonc`
3. 레거시 호환 설정: `{project-root}/.opencode/opencode-aidd-plugin.json`

프로젝트 설정은 글로벌 설정을 override한다. 런타임은 기존 코어 로직 호환을 위해 필요 시 레거시 설정 파일을 생성해 bridge 한다.

### 코드 수정 없이 정책 바꾸기 (FR18)

브랜치 규칙과 워크플로우 정책은 플러그인 소스 코드를 수정하지 않고 위 jsonc 파일만 갱신해서 변경할 수 있다. 변경은 다음 워크플로 명령 시점부터 자동으로 반영된다.

흐름 예시 — 팀 통합 브랜치를 `main`에서 `develop`으로 옮기고, `bmad-bmm-quick-dev`를 강제 브랜치/커밋으로 묶고 싶다면:

```jsonc
// {project-root}/.opencode/devai-aidd-plugin.project.jsonc
{
  "branch": {
    "defaultMergeTarget": "develop",
    "longLivedBranches": ["main", "master", "develop"],
    "commandTypeMap": {
      "bmad-bmm-dev-story": "feat",
      "bmad-bmm-quick-dev": "feat"
    }
  },
  "workflowPolicy": {
    "bmad-bmm-quick-dev": {
      "category": "implementation",
      "identityStrategy": "ticket-or-args",
      "branchRequired": true,
      "finalization": "commit-and-push"
    }
  }
}
```

자주 바꾸는 키는 다음과 같다.

- `branch.defaultMergeTarget` — 통합 브랜치 이름
- `branch.commandTypeMap` — BMAD 명령별 브랜치 타입 슬러그
- `branch.longLivedBranches` — 재사용을 막을 장수명 브랜치 목록
- `branch.validationRegex` — 팀 명명 규칙
- `workflowPolicy.<command>.branchRequired` / `finalization` — 워크플로별 브랜치/커밋 강제 여부

`workflowPolicy[*].category`, `identityStrategy`, `finalization`은 알려진 어휘를 권장하지만(예: `implementation`, `commit-and-push`), 미래 어휘를 도입할 수 있도록 미지의 값도 통과시킨다. 단, 미지의 값은 `config.validation.failed` 감사 이벤트에 `params.source === "vocabulary"` 경고로 노출되므로 오타를 빠르게 알 수 있다.

예를 들어 `finalization: "commit-and-puh"` 같은 오타를 입력하면 다음과 같은 감사 이벤트가 노출된다.

```json
{
  "event": "config.validation.failed",
  "details": {
    "errors": [
      {
        "instancePath": "/workflowPolicy/bmad-bmm-quick-dev/finalization",
        "message": "Unknown finalization value \"commit-and-puh\" for bmad-bmm-quick-dev; known values: commit-and-push, commit-optional-push, no-forced-finalization",
        "params": { "source": "vocabulary", "kind": "warning", "field": "finalization" }
      }
    ]
  }
}
```

`params.source === "vocabulary"` 항목만 필터링하면 hard error 없이 오타만 추적할 수 있다.

## 레거시 구성 호환성

이전 버전의 플러그인은 `.opencode/opencode-aidd-plugin.json`과 `.opencode/devai-git-workflow.json` 파일을 직접 읽었다. 본 플러그인은 모던 경로(`.opencode/devai-aidd-plugin.project.jsonc`)를 단일 진실로 사용하면서, 구버전 reader가 같은 디렉터리에 함께 살아 있어도 동작이 깨지지 않도록 호환 브리지(mirror) 파일을 자동으로 관리한다.

### 경로 매핑

| 역할 | 모던 경로 | 호환 경로(자동 읽기) |
|---|---|---|
| 글로벌 설정 | `~/.config/opencode/devai-aidd-plugin.global.jsonc` | `~/.config/opencode/devai-aidd-guard.global.jsonc` (이전 이름, 자동 읽기) |
| 프로젝트 설정 | `{project}/.opencode/devai-aidd-plugin.project.jsonc` | `{project}/.opencode/devai-aidd-guard.project.jsonc` (이전 이름, 자동 읽기) · `{project}/.opencode/opencode-aidd-plugin.json` (오래된 레거시, 브리지 미러) |
| 워크플로 정책(레거시 reader 호환) | (모던에서 동일 파일에 통합) | `{project}/.opencode/devai-git-workflow.json` (오래된 레거시, 브리지 미러) |
| 호환 브리지 marker | (없음) | `{project}/.opencode/.devai-aidd-plugin.compat.generated` |

### 우선순위

설정 layer는 아래 순서로 머지된다(같은 키는 위쪽이 덮어쓴다).

1. `DEFAULT_PLUGIN_CONFIG` (플러그인 내장)
2. `guardLegacyGlobalConfig` — `devai-aidd-guard.global.jsonc` (이전 이름, 자동 읽기)
3. `globalConfig` — `devai-aidd-plugin.global.jsonc`
4. `legacyProjectConfig` — `opencode-aidd-plugin.json`
5. `legacyWorkflowProjectConfig` — `devai-git-workflow.json`
6. `guardLegacyProjectConfig` — `devai-aidd-guard.project.jsonc` (이전 이름, 자동 읽기)
7. `projectConfig` — `devai-aidd-plugin.project.jsonc` (가장 강함)

이 순서는 모든 호출에서 결정적이며, 호환 브리지가 modern projectConfig를 “조용히 덮어쓰는” 일은 발생하지 않는다. `devai-aidd-guard.*` 파일은 read-only 호환 layer로 참여하므로, 신규 이름으로 같은 키를 덮어쓰면 그 키만 신규 값이 적용되고 미설정 키는 이전 파일에서 계속 읽힌다.

### marker 파일의 의미

`.opencode/.devai-aidd-plugin.compat.generated`는 “플러그인이 자동 생성한 mirror”라는 표지다. marker가 **존재하지 않는** 레거시 파일은 사용자 자산으로 간주되며, 플러그인은 이를 절대 덮어쓰지 않는다. 사용자가 손으로 작성한 `opencode-aidd-plugin.json`을 그대로 유지하고 싶다면 marker 파일을 만들지 않으면 된다.

이 보호 정책은 **두 레거시 파일(`opencode-aidd-plugin.json`, `devai-git-workflow.json`) 모두에 동일하게 적용된다**. 둘 중 하나라도 marker 없이 존재하면 사용자 자산으로 간주되어 mirror 갱신 사이클이 멈춘다.

### 모던 + 레거시가 동시에 존재할 때

| 상황 | 결과 |
|---|---|
| 모던만 존재 | 첫 부트스트랩에 레거시 mirror 2개 + marker를 생성한다(`create-bridge`). |
| 모던 + 레거시(marker 있음) | 매 부트스트랩에 레거시 mirror를 모던에서 derive 해 갱신한다(`refresh-bridge`). 단 컨텐츠가 동일하면 실제 쓰기를 건너뛴다(`no-content-change`). |
| 모던 + 레거시(marker 없음) | 두 레거시 파일 중 어느 쪽이든 marker 없이 존재하면 사용자 자산으로 간주해 **갱신하지 않는다**(`preserve-user-legacy`). 모던 projectConfig가 효과적인 우선순위를 가지므로 런타임 동작은 모던 값으로 결정된다. |
| 모던 + marker만(레거시 파일 없음, R2 M-3) | 사용자가 mirror 파일은 지우고 marker만 남긴 상태. 미러를 다시 생성한다(`rebuild-bridge`). |
| 레거시만(marker 있음) | 위와 동일하게 mirror 갱신(`refresh-bridge`). |
| 레거시만(marker 없음) | 사용자 자산으로 간주해 **갱신하지 않는다**(`preserve-existing-legacy`). |
| 글로벌만 | 프로젝트 디렉터리에는 mirror를 만들지 않는다(`global-only-no-bridge-needed`). |
| 빈 워크스페이스 | 어떤 파일도 만들지 않는다(`no-config-sources`). |
| 미러 쓰기 실패 | 디스크 쓰기 예외(EACCES/ENOSPC 등)는 부트스트랩을 막지 않는다. 호출자는 `compat.bridge.evaluated` audit 이벤트의 `details.error`로 사유를 확인할 수 있다(`reason="write-failed"`). |

각 부트스트랩 사이클은 위 결정 결과를 `compat.bridge.evaluated` 감사 이벤트로 기록한다(`details.written`, `details.reason`, `details.sources`, `details.markerPresent`, 쓰기 발생 시 `details.bridgePaths`, 실패 시 `details.error`).

## 빌드와 릴리스

```bash
npm run build       # esbuild → dist/devai-aidd-plugin.js (ESM, --target=node22)
npm run release     # release/devai-aidd-plugin/{latest,versions/<version>}/ 채움
npm run pack        # build + release 체인 (메인테이너 배포 흐름 한 번에)
```

리팩터링/릴리스 전에는 항상 `npm run build && npm test` 조합이 회귀 게이트로 동작한다. `npm test`는 legacy / wrapper / built 세 변형의 hook 셰이프, 명령 프롬프트, mutating-tool 가드 메시지를 비교하므로 (Story 4.5: `verifyStory45LegacyWrapperBuiltHandlerShapesMatch` 외 6종), 빌드 산출물 부재나 호환성 드리프트가 조용히 통과되지 않는다.

메인테이너 흐름은 다음 4단계다.

1. `package.json.version` 올림 (semver)
2. `npm run pack` — 번들 + 릴리스 산출물 + 매니페스트 + 체크섬 일괄 생성
3. `release/devai-aidd-plugin/latest/` 및 `release/devai-aidd-plugin/versions/<version>/` 양쪽 산출물 점검
4. (선택) 설치기 dry-run 무결성 검증. `npm test`가 동일한 검증을 자동으로 돌리지만 (회귀: `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`), 수동으로 확인하려면 다음과 같이 한다.

   ```bash
   # bash (install.sh 파서와 동일)
   cd release/devai-aidd-plugin/latest
   for f in devai-aidd-plugin.js devai-aidd-plugin.global.jsonc devai-aidd-plugin.project.jsonc manifest.json; do
     exp=$(awk -v n="$f" '$2==n{print $1}' checksums.txt)
     act=$(sha256sum "$f" | awk '{print $1}')
     [ "$exp" = "$act" ] && echo "OK   $f" || echo "FAIL $f exp=$exp act=$act"
   done
   ```

   설치기는 `devai-aidd-plugin.js`, `devai-aidd-plugin.global.jsonc`, `devai-aidd-plugin.project.jsonc`, `manifest.json` 4개 파일을 `checksums.txt`로 검증하므로, 이 4개 파일 모두에 대해 `OK`가 출력되어야 정상이다.

`scripts/build.js`는 `src/index.js`를 esbuild(`--bundle --platform=node --format=esm --target=node22`)로 묶어 `dist/devai-aidd-plugin.js` 단일 파일로 출력한다. 출력 경로/타깃/포맷은 회귀 테스트와 설치기 양쪽이 의존하는 계약이므로 변경하지 않는다.

`scripts/make-release.js`는 다음 7종의 게시 파일을 두 디렉터리(`release/devai-aidd-plugin/latest/`와 `release/devai-aidd-plugin/versions/<version>/`)에 동일한 SHA-256으로 채운다.

| # | 파일 | 출처 |
|---|---|---|
| 1 | `devai-aidd-plugin.js` | `dist/devai-aidd-plugin.js` (번들) |
| 2 | `install.ps1` | `installer/install.ps1` |
| 3 | `install.sh` | `installer/install.sh` |
| 4 | `uninstall.ps1` | `installer/uninstall.ps1` |
| 5 | `devai-aidd-plugin.global.jsonc` | `templates/devai-aidd-plugin.global.jsonc` |
| 6 | `devai-aidd-plugin.project.jsonc` | `templates/devai-aidd-plugin.project.jsonc` |
| 7 | `opencode.jsonc.example` | `templates/opencode.jsonc.example` |

추가로 두 디렉터리에는 다음 메타데이터가 자동 생성된다.

- `manifest.json` — `name`, `displayName`, `version`(=`package.json.version`), `generatedAt`(ISO-8601), `files[].name/size/sha256`
- `checksums.txt` — 라인당 `<sha256>  <name>` (해시-공백 2칸-파일명, 마지막 라인에 trailing newline). PowerShell 설치기(`-split "\s{2,}", 2`)와 bash 설치기(`awk '$2 == name { print $1 }'`) 양쪽 파서가 동일한 해시를 복원한다.

게시 source 중 어느 하나라도 누락되면 `make-release.js`는 release 트리를 건드리기 전에 즉시 실패하며, 누락된 파일 이름과 기대 절대 경로를 메시지에 포함시킨다(verify-first 원칙).

`templates/legacy-opencode-aidd-plugin.json`은 의도적으로 릴리스 산출물에서 제외한다. 이 파일은 [레거시 구성 호환성 섹션](#레거시-구성-호환성)에서 설명한 호환 브리지가 모던 프로젝트 설정으로부터 런타임에 derive 하므로, 정적 산출물로 함께 배포하면 stale baseline이 된다.

## 기존 동작 유지 흐름

- workflow command 감지
- workflow identity 계산
- git repo / branch / baseline 상태 확인
- question tool을 통한 승인 유도
- tool before/after에서 편집 및 git 명령 제어
- finalization prompt 및 상태 저장
- session 이벤트에서 질문/응답/idle/deleted 처리

실제 workflow 판단 로직은 기존 단일 파일을 `src/policies/legacy/devai-aidd-plugin-core.js`로 옮겨 최대한 그대로 유지했다.

## 표준 Git 도구로 워크플로 산출물 추적하기

DevAI AIDD Plugin은 워크플로 최종화 시 코드와 문서를 단일 커밋으로 묶어 일반 Git 이력에 기록한다. 별도 전용 리뷰 시스템 없이도 표준 Git 도구만으로 책임 추적이 가능하도록 설계되었다.

리뷰어가 사용할 기본 검증 흐름은 아래와 같다.

```bash
# 1) 특정 경로에 영향을 준 워크플로 커밋 이력 확인
git log -- src/
git log -- _bmad-output/planning-artifacts/
git log -- _bmad-output/implementation-artifacts/

# 2) 파일 이름 변경까지 추적해야 할 때
git log --follow -- src/services/git/commit-service.js

# 3) 라인 단위 최종 수정자 확인
git blame README.md

# 4) 워크플로 단위 변경 묶음 검토 (커밋 메시지에 워크플로 식별자 포함)
git log --grep "워크플로우 완료"
```

승인 프롬프트는 커밋 대상 경로를 `pathScopeSummary` 형태(예: `src/ (2)`, `_bmad-output/implementation-artifacts/ (1)`)로 요약해서 보여주므로, 리뷰어는 동일 prefix를 그대로 `git log -- <prefix>`에 붙여 넣어 변경 이력을 따라갈 수 있다. 절대경로나 원격 URL은 승인/감사 페이로드에 노출되지 않는다.

## 롤백

- 최신 버전에서 이전 버전으로 되돌리려면 `release/devai-aidd-plugin/versions/<version>/install.ps1` 또는 `install.sh`를 사용한다.
- 제거는 Windows에서 `installer/uninstall.ps1`로 가능하다.
- 설정 파일은 uninstall 시 삭제하지 않으므로, 필요하면 수동으로 정리한다.
