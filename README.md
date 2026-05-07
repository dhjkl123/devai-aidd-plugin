# DevAI AIDD Guard

DevAI AIDD Guard는 opencode 기반 DevAI 환경에서 AIDD 가드레일, 정책 적용, 감사 로그, 권한 통제를 담당하는 플러그인이다. 이번 리팩토링의 목표는 기능 변경이 아니라 단일 파일 구조를 표준 배포 구조로 정리하는 것이다.

표시명은 `DevAI AIDD Plugin`으로 유지하고, 배포 산출물과 설정 파일명은 `devai-aidd-guard` 표준을 따른다.

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
iwr "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-guard/latest/install.ps1" -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Linux/WSL:

```bash
curl -fsSL "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-guard/latest/install.sh" -o install.sh
bash install.sh
```

직접 버전 고정 설치가 필요하면 `latest` 대신 `versions/<version>` 경로를 사용하면 된다.

## 설치 위치

- Windows: `%USERPROFILE%\.config\opencode\`
- Linux/WSL: `~/.config/opencode/`
- 플러그인 파일: `plugins/devai-aidd-guard.js`

## 설정 파일

우선순위는 아래와 같다.

1. 글로벌 설정: `~/.config/opencode/devai-aidd-guard.global.jsonc`
2. 프로젝트 설정: `{project-root}/.opencode/devai-aidd-guard.project.jsonc`
3. 레거시 호환 설정: `{project-root}/.opencode/opencode-aidd-plugin.json`

프로젝트 설정은 글로벌 설정을 override한다. 런타임은 기존 코어 로직 호환을 위해 필요 시 레거시 설정 파일을 생성해 bridge 한다.

## 빌드와 릴리스

```bash
npm run build
npm run release
```

- `scripts/build.js`: `src/index.js` 기준 단일 배포 파일 `dist/devai-aidd-guard.js` 생성
- `scripts/make-release.js`: `dist`, `installer`, `templates` 산출물을 `release/devai-aidd-guard/latest/` 및 `release/devai-aidd-guard/versions/<version>/`에 복사
- `manifest.json`, `checksums.txt` 자동 생성

## 기존 동작 유지 흐름

- workflow command 감지
- workflow identity 계산
- git repo / branch / baseline 상태 확인
- question tool을 통한 승인 유도
- tool before/after에서 편집 및 git 명령 제어
- finalization prompt 및 상태 저장
- session 이벤트에서 질문/응답/idle/deleted 처리

실제 workflow 판단 로직은 기존 단일 파일을 `src/policies/legacy/devai-aidd-guard-core.js`로 옮겨 최대한 그대로 유지했다.

## 롤백

- 최신 버전에서 이전 버전으로 되돌리려면 `release/devai-aidd-guard/versions/<version>/install.ps1` 또는 `install.sh`를 사용한다.
- 제거는 Windows에서 `installer/uninstall.ps1`로 가능하다.
- 설정 파일은 uninstall 시 삭제하지 않으므로, 필요하면 수동으로 정리한다.
