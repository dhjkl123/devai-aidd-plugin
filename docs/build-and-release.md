---
title: 빌드와 릴리스
description: 메인테이너용 번들·릴리스 산출물 생성과 무결성 검증 절차
---

# 빌드와 릴리스

> 이 섹션은 메인테이너 대상이다. 사용자는 [롤백](./rollback.md)으로 건너뛴다.

## 스크립트

```bash
npm run build       # esbuild → dist/devai-aidd-plugin.js (ESM, --target=node22)
npm run release     # release/devai-aidd-plugin/{latest,versions/<version>}/ 채움
npm run pack        # build + release 체인 (메인테이너 배포 흐름 한 번에)
```

리팩터링·릴리스 전에는 항상 `npm run build && npm test` 조합이 회귀 게이트로 동작한다. `npm test`는 wrapper / built 두 변형의 hook 셰이프, 명령 프롬프트, mutating-tool 가드 메시지를 비교하므로(`verifyStory45WrapperBuiltHandlerShapesMatch` 외 N종), 빌드 산출물 부재나 호환성 드리프트가 조용히 통과되지 않는다.

## 메인테이너 흐름

1. `package.json.version` 올림 (semver)
2. `npm run pack` — 번들 + 릴리스 산출물 + 매니페스트 + 체크섬 일괄 생성
3. `release/devai-aidd-plugin/latest/` 및 `release/devai-aidd-plugin/versions/<version>/` 양쪽 산출물 점검
4. (선택) 설치기 dry-run 무결성 검증. `npm test`가 동일한 검증을 자동으로 돌리지만(회귀: `verifyStory44ReleaseChecksumLinesMatchInstallerParsers`), 수동으로 확인하려면 다음과 같이 한다.

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

## 빌드 계약

`scripts/build.js`는 `src/index.js`를 esbuild(`--bundle --platform=node --format=esm --target=node22`)로 묶어 `dist/devai-aidd-plugin.js` 단일 파일로 출력한다. 출력 경로·타깃·포맷은 회귀 테스트와 설치기 양쪽이 의존하는 계약이므로 변경하지 않는다.

## 릴리스 산출물

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
