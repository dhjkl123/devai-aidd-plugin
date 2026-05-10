# Changelog

## 1.0.0

- 기존 단일 파일 opencode 플러그인을 DevAI AIDD Guard 표준 구조로 재배치
- `src`, `installer`, `templates`, `scripts`, `release` 디렉터리 추가
- 빌드/릴리스/설치 스크립트 및 설정 템플릿 추가
- 기존 workflow guard 로직을 레거시 코어 모듈로 이동해 동작 유지 기반 확보
- 릴리스 패키징(Story 4.4): `make-release.js`가 누락 source를 사전 검증해 실패 메시지에 파일명을 명시하고, `latest/`·`versions/<version>/` 양쪽 산출물의 매니페스트/체크섬/파일 집합 일치를 회귀 테스트로 고정 (`tests/regression.test.js` `verifyStory44*`)
