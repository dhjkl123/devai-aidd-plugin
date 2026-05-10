# devai-aidd-plugin

> JSONC 설정만으로 opencode AI 도구의 git 워크플로·승인·감사를 통제한다.

`devai-aidd-plugin`은 opencode가 AI 도구를 호출할 때 git workflow를 강제하고, 정책을 검증하며, 감사 로그를 남기고, 위험 도구의 실행을 가로채 사용자 승인을 유도한다. 정책은 코드 수정 없이 JSONC 설정 파일만으로 변경할 수 있고, 모든 결정은 클라이언트 감사 이벤트로 추적된다.

[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/en/download/releases)

## 목차

- [주요 기능](#주요-기능)
- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [설정](#설정)
  - [설정 파일 우선순위](#설정-파일-우선순위)
  - [코드 수정 없이 정책 바꾸기](#코드-수정-없이-정책-바꾸기)
  - [자주 바꾸는 키](#자주-바꾸는-키)
- [사용법](#사용법)
  - [표준 Git 도구로 워크플로 산출물 추적하기](#표준-git-도구로-워크플로-산출물-추적하기)
- [디렉터리 개요](#디렉터리-개요)
- [빌드와 릴리스](#빌드와-릴리스)
- [롤백](#롤백)
- [Changelog](#changelog)

## 주요 기능

- **브랜치·커밋·머지를 잊지 않게 한다** — workflow command가 시작될 때 브랜치 생성·baseline·finalize 흐름을 자동으로 강제한다.
- **JSONC만 고치면 정책이 즉시 반영된다** — 브랜치 규칙과 워크플로 정책을 다음 워크플로 명령부터 자동 적용한다. 재시작이 필요하지 않다.
- **설정 머지 순서가 결정적이다** — 글로벌 → 프로젝트 layer가 정해진 순서로 머지되어 같은 입력에는 항상 같은 결과가 나온다.
- **모든 결정이 감사 이벤트로 남는다** — `config.validation.failed`, `plugin bootstrap` 등 명시적 이벤트로 부트스트랩·검증 결과를 추적한다. 파일·HTTP 전송은 별도 모듈에서 확장한다.
- **별도 리뷰 시스템 없이 책임을 추적한다** — `git log`, `git blame`만으로 워크플로 산출물의 변경 이력과 최종 수정자를 그대로 따라갈 수 있다.

## 설치

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

## 디렉터리 개요

저장소 최상위는 `src/`, `installer/`, `templates/`, `scripts/`, `dist/`, `release/`로 구성된다. 전체 트리와 경로별 역할은 [docs/directory-structure.md](./docs/directory-structure.md)에서 본다.

## 빌드와 릴리스

메인테이너용 번들·릴리스 흐름과 무결성 검증 절차는 [docs/build-and-release.md](./docs/build-and-release.md)에 정리되어 있다.

## 롤백

이전 버전으로 되돌리거나 플러그인을 제거하는 절차는 [docs/rollback.md](./docs/rollback.md)에서 본다.

## Changelog

버전별 변경 이력은 [CHANGELOG.md](./CHANGELOG.md)를 참고한다.
