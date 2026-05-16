# devai-aidd-plugin

> JSONC 설정만으로 opencode AI 도구의 git 워크플로·승인·감사를 통제한다.

`devai-aidd-plugin`은 opencode가 AI 도구를 호출할 때 git workflow를 강제하고, 정책을 검증하며, 감사 로그를 남기고, 위험 도구의 실행을 가로채 사용자 승인을 유도한다. 정책은 코드 수정 없이 JSONC 설정 파일만으로 변경할 수 있고, 모든 결정은 클라이언트 감사 이벤트로 추적된다.

[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/en/download/releases)

## 목차

- [주요 기능](#주요-기능)
- [설치](#설치)
  - [원격 설치](#원격-설치)
  - [프로젝트별 설치 (--project-path)](#프로젝트별-설치---project-path)
  - [제거](#제거)
- [빠른 시작](#빠른-시작)
- [설정](#설정)
  - [설정 파일 우선순위](#설정-파일-우선순위)
  - [코드 수정 없이 정책 바꾸기](#코드-수정-없이-정책-바꾸기)
  - [자주 바꾸는 키](#자주-바꾸는-키)
- [사용법](#사용법)
  - [표준 Git 도구로 워크플로 산출물 추적하기](#표준-git-도구로-워크플로-산출물-추적하기)
- [Changelog](#changelog)

## 주요 기능

- **브랜치·커밋·머지를 잊지 않게 한다** — workflow command가 시작될 때 브랜치 생성·baseline·finalize 흐름을 자동으로 강제한다.
- **JSONC만 고치면 정책이 즉시 반영된다** — 브랜치 규칙과 워크플로 정책을 다음 워크플로 명령부터 자동 적용한다. 재시작이 필요하지 않다.
- **설정 머지 순서가 결정적이다** — 글로벌 → 프로젝트 layer가 정해진 순서로 머지되어 같은 입력에는 항상 같은 결과가 나온다.
- **모든 결정이 감사 이벤트로 남는다** — `config.validation.failed`, `plugin bootstrap` 등 명시적 이벤트로 부트스트랩·검증 결과를 추적한다. 파일·HTTP 전송은 별도 모듈에서 확장한다.
- **별도 리뷰 시스템 없이 책임을 추적한다** — `git log`, `git blame`만으로 워크플로 산출물의 변경 이력과 최종 수정자를 그대로 따라갈 수 있다.

## 설치

설치 모드는 두 가지이다.

| 모드 | 사용 시점 | 설치 위치 |
|---|---|---|
| 원격 설치 | 사내 storage가 준비된 상태에서 사용자 머신에 글로벌 설치 | `~/.config/opencode/` |
| 프로젝트별 설치 (`--project-path`) | 특정 프로젝트에만 설치하고 머지된 단일 config로 운영 | `<ProjectPath>/.opencode/` |

### 원격 설치

> 아래 `<storage-account>` 자리는 사내 메인테이너로부터 실제 storage account 이름을 받아 치환한다.

Windows PowerShell:

```powershell
iwr "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-plugin/latest/install.ps1" -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Linux / WSL:

```bash
curl -fsSL "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-plugin/latest/install.sh" -o install.sh
bash install.sh
```

특정 버전을 고정 설치하려면 `latest` 대신 `versions/<version>` 경로를 사용한다.

설치 위치는 다음과 같다.

- Windows: `%USERPROFILE%\.config\opencode\`
- Linux / WSL: `~/.config/opencode/`
- 공통 플러그인 파일: `plugins/devai-aidd-plugin.js`

### 프로젝트별 설치 (--project-path)

특정 프로젝트에만 플러그인을 설치하고, **global 템플릿과 project 템플릿을 정적으로 deep-merge한 단일 `.opencode/devai-aidd-plugin.project.jsonc`** 를 생성한다. 글로벌 설치와 무관하게 동작하며, opencode가 해당 프로젝트에서만 플러그인을 로드하게 할 때 쓴다.

설치 결과:

- `<ProjectPath>/.opencode/plugins/devai-aidd-plugin.js` — 플러그인 번들
- `<ProjectPath>/.opencode/devai-aidd-plugin.project.jsonc` — global + project 머지본 (헤더 주석으로 origin 명시, 배열은 project 레이어가 전체 교체)

선결 조건:

- repo 작업트리에서 실행할 것 (스크립트 위치 기준 상대경로로 `dist/`, `templates/`, `installer/merge-configs.mjs`를 읽는다)
- `npm run build`로 `dist/devai-aidd-plugin.js`를 만들어둘 것
- Node가 PATH에 있을 것 (머지 헬퍼가 Node로 실행됨)

```powershell
# Windows: 프로젝트 루트에서 실행하면 현재 경로에 설치
npm run build
powershell -ExecutionPolicy Bypass -File .\installer\install.ps1
```

```powershell
# 또는 명시적으로 대상 프로젝트 지정
powershell -ExecutionPolicy Bypass -File .\installer\install.ps1 -ProjectPath C:\path\to\project
```

```bash
# Linux / WSL / macOS: 프로젝트 루트에서 실행하면 현재 경로에 설치
npm run build
bash installer/install.sh
```

```bash
# 또는 명시적으로 대상 프로젝트 지정
bash installer/install.sh --project-path /path/to/project
```

기존 `<ProjectPath>/.opencode/devai-aidd-plugin.project.jsonc`가 있으면 덮어쓰지 않고 보존한다. 새로 머지하고 싶으면 해당 파일을 직접 지운 뒤 재실행한다.

설치 후 프로젝트의 `opencode.jsonc`가 플러그인을 인식하도록 다음을 추가한다.

```jsonc
// <ProjectPath>/opencode.jsonc
{
  "plugins": [
    {
      "name": "DevAI AIDD Plugin",
      "path": ".opencode/plugins/devai-aidd-plugin.js"
    }
  ]
}
```

### 제거

플러그인을 설치한 프로젝트 루트에서 실행하면 해당 프로젝트의 `.opencode/` 안의 플러그인 파일과 설정이 삭제된다.

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File <repo>\installer\uninstall.ps1
```

```bash
# Linux / WSL / macOS
bash <repo>/installer/uninstall.sh
```

## 빠른 시작

설치 직후 별도 설정 없이 opencode가 워크플로 명령을 호출하면 플러그인이 자동으로 git 가드를 적용한다. 팀 규칙을 적용하려면 프로젝트 루트에 `.opencode/devai-aidd-plugin.project.jsonc`를 만든다.

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

저장하면 다음 워크플로 명령부터 자동으로 반영된다. 플러그인을 재시작할 필요는 없다.

적용이 정상적으로 됐는지 확인하려면 첫 워크플로 명령 실행 시 다음과 유사한 감사 이벤트가 기록되는지 본다.

```json
{
  "event": "plugin bootstrap",
  "extra": { "workflowCommandCount": 2, "hasGlobalConfig": false, "hasProjectConfig": true }
}
```

## 설정

### 설정 파일 우선순위

설정 layer는 아래 순서로 머지된다(같은 키는 위쪽이 덮어쓴다).

1. 글로벌 설정 — `~/.config/opencode/devai-aidd-plugin.global.jsonc`
2. 프로젝트 설정 — `{project-root}/.opencode/devai-aidd-plugin.project.jsonc`

프로젝트 설정은 글로벌 설정을 override한다.

> **프로젝트별 설치 모드 사용자**
> `--project-path`로 설치한 경우 글로벌 설정 파일은 만들어지지 않고, 머지된 단일 `.opencode/devai-aidd-plugin.project.jsonc`에 global 기본값과 project override가 모두 들어가 있다. 같은 우선순위 규칙이 그대로 적용되며, 런타임은 번들된 베이스라인 → 디스크상의 project 파일만 머지한다.

### 코드 수정 없이 정책 바꾸기

브랜치 규칙과 워크플로 정책은 플러그인 소스 코드를 수정하지 않고 JSONC 파일만 갱신해서 변경할 수 있다. 변경은 다음 워크플로 명령 시점부터 자동으로 반영된다.

`workflowPolicy[*].category`, `identityStrategy`, `finalization`은 알려진 어휘를 권장하지만(예: `implementation`, `commit-and-push`), 미래 어휘를 도입할 수 있도록 미지의 값도 통과시킨다.

다만 미지의 값은 `config.validation.failed` 감사 이벤트에 노출된다. 이 이벤트는 `params.source` 값이 `"vocabulary"`인 경고로 표시되므로 오타를 즉시 식별할 수 있다.

예를 들어 `finalization: "commit-and-puh"` 같은 오타를 입력하면 다음 감사 이벤트가 노출된다.

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

### 자주 바꾸는 키

| 키 | 역할 |
|---|---|
| `branch.defaultMergeTarget` | 통합 브랜치 이름 |
| `branch.commandTypeMap` | BMAD 명령별 브랜치 타입 슬러그 |
| `branch.longLivedBranches` | 재사용을 막을 장수명 브랜치 목록 |
| `branch.validationRegex` | 팀 명명 규칙 |
| `workflowPolicy.<command>.branchRequired` | 워크플로별 브랜치 강제 여부 |
| `workflowPolicy.<command>.finalization` | 워크플로별 커밋·푸시 강제 여부 |

## 사용법

플러그인은 hook 단계마다 다음 흐름을 동일하게 유지한다.

- workflow command 감지
- workflow identity 계산
- git repo / branch / baseline 상태 확인
- question tool을 통한 승인 유도
- tool before/after에서 편집 및 git 명령 제어
- finalization prompt 및 상태 저장
- session 이벤트에서 질문/응답/idle/deleted 처리

### 표준 Git 도구로 워크플로 산출물 추적하기

워크플로 최종화 시 코드와 문서를 단일 커밋으로 묶어 일반 Git 이력에 기록한다. 별도 전용 리뷰 시스템 없이도 표준 Git 도구만으로 책임 추적이 가능하다.

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

승인 프롬프트는 커밋 대상 경로를 `pathScopeSummary` 형태(예: `src/ (2)`, `_bmad-output/implementation-artifacts/ (1)`)로 요약해서 보여주므로, 리뷰어는 동일 prefix를 그대로 `git log -- <prefix>`에 붙여 넣어 변경 이력을 따라갈 수 있다. 절대경로나 원격 URL은 승인·감사 페이로드에 노출되지 않는다.

## Changelog

버전별 변경 이력은 [CHANGELOG.md](./CHANGELOG.md)를 참고한다.
