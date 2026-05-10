---
title: 디렉터리 개요
description: devai-aidd-plugin 저장소 최상위 디렉터리 구조
---

# 디렉터리 개요

`devai-aidd-plugin` 저장소의 최상위 구조는 다음과 같다.

```text
devai-aidd-plugin/
├── src/
│   ├── index.js
│   ├── hooks/
│   ├── services/
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

| 경로 | 역할 |
|---|---|
| `src/` | 플러그인 진입점과 hook·service·config·audit·adapters·utils 모듈 |
| `installer/` | PowerShell·bash 설치/제거 스크립트 |
| `templates/` | 글로벌·프로젝트 JSONC 설정 템플릿과 `opencode.jsonc.example` |
| `scripts/` | `build.js`, `make-release.js` 등 빌드·릴리스 자동화 스크립트 |
| `dist/` | esbuild가 생성하는 번들 산출물 (`devai-aidd-plugin.js`) |
| `release/` | 게시용 산출물 트리 (`latest/`, `versions/<version>/`) |
| `package.json` | 패키지 메타데이터와 `build`·`release`·`pack` 스크립트 |
| `README.md` | 설치·설정·사용법 요약 |
| `CHANGELOG.md` | 버전별 변경 이력 |
