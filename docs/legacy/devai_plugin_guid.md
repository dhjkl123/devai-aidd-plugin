# DevAI Hook / Event / Config 정리

기준 소스:

- [devai.js](C:/Users/KSW/.config/opencode/plugins/devai.js)
- [devai-plugin.json](C:/Users/KSW/.config/opencode/devai-plugin.json)

이 문서는 `devai` 로컬 번들 소스를 기준으로 정리했다. 공식 문서 요약이 아니라 현재 내 환경에서 확인된 항목 위주다.

## 1. 설정 파일 위치

- 사용자 전역 설정: `C:\Users\KSW\.config\opencode\devai-plugin.json`
- 프로젝트 로컬 설정: `PROJECT\.opencode\devai-plugin.json`

`devai`는 사용자 설정과 프로젝트 설정을 merge 해서 읽는다.

## 2. 가장 기본적인 설정 예시

```json
{
  "claude_code": {
    "hooks": true,
    "plugins": true,
    "commands": false,
    "skills": false,
    "agents": false,
    "mcp": false
  },
  "notification": {
    "force_enable": true
  },
  "disabled_hooks": []
}
```

의미:

- `claude_code.hooks`: Claude Code 호환 hook 계층 사용 여부
- `claude_code.plugins`: Claude Code 호환 plugin 로더 사용 여부
- `notification.force_enable`: 외부 notification plugin 감지 시에도 `devai` 내장 notification hook 강제 사용
- `disabled_hooks`: 특정 내장 hook 비활성화

## 3. 소스에서 확인된 주요 설정 키

이 섹션은 `devai-plugin.json`에서 조절하는 설정 개념을 다룬다.  
실무적으로는 어떤 기능을 켜고 끄는지, 어떤 런타임 제약을 넣는지, 어느 호환 계층을 활성화할지를 결정하는 레이어다.

### 3.1 상위 설정 키

| 키 | 설명 | 실무 용도 |
| --- | --- | --- |
| `$schema` | 설정 스키마 선언 | 에디터 자동완성, 검증 |
| `default_run_agent` | 기본 실행 agent 지정 | 기본 agent 강제 |
| `disabled_mcps` | 비활성화할 MCP 목록 | 외부 연결 제한 |
| `disabled_agents` | 비활성화할 agent 목록 | 특정 agent 차단 |
| `disabled_skills` | 비활성화할 skill 목록 | 자동 skill 로딩 제한 |
| `disabled_hooks` | 비활성화할 hook 목록 | 내장 hook 선택적 비활성화 |
| `disabled_commands` | 비활성화할 command 목록 | command 숨김/차단 |
| `disabled_tools` | 비활성화할 tool 목록 | 위험 tool 제한 |
| `agents` | agent override 설정 | 모델, verbosity, reasoning 조정 |
| `categories` | category override 설정 | 카테고리별 정책 |
| `claude_code` | Claude Code 호환 계층 설정 | hooks/plugins/skills/mcp on/off |
| `experimental` | 실험 기능 설정 | task system, truncation 등 |
| `skills` | skill 소스/enable/disable 설정 | skill 확장 |
| `runtime_fallback` | 런타임 fallback 정책 | 모델 fallback |
| `background_task` | 백그라운드 작업 설정 | 동시성, timeout |
| `notification` | notification hook 관련 설정 | 내장 알림 강제 사용 |
| `openclaw` | OpenClaw 관련 설정 | 외부 게이트웨이/리스너 |
| `babysitting` | babysitting 설정 | 안정성 보호 |
| `git_master` | git 관련 규칙 설정 | 커밋 footer 등 |
| `browser_automation_engine` | 브라우저 자동화 엔진 설정 | playwright 등 |
| `websearch` | 웹검색 provider 설정 | exa/tavily |
| `tmux` | tmux 설정 | pane/layout 조정 |
| `session_header` | 세션 헤더 표시 설정 | UI 표시 제어 |
| `providers` | provider 설정 | 모델/프로바이더 제어 |
| `start_work` | 작업 시작 자동화 설정 | auto commit 등 |
| `_migrations` | 마이그레이션 기록 | 내부 호환성 관리 |

### 3.2 자주 쓰는 하위 설정 키

#### `claude_code`

이 블록은 Claude Code 호환 레이어를 얼마나 사용할지 정한다.

| 키 | 설명 | 비고 |
| --- | --- | --- |
| `mcp` | Claude Code 호환 MCP 로드 여부 | `true/false` |
| `commands` | Claude Code 호환 command 로드 여부 | `true/false` |
| `skills` | Claude Code 호환 skill 로드 여부 | `true/false` |
| `agents` | Claude Code 호환 agent 로드 여부 | `true/false` |
| `hooks` | Claude Code 호환 hook 로드 여부 | `true/false` |
| `plugins` | Claude Code 호환 plugin 로더 사용 여부 | `true/false` |
| `plugins_override` | 특정 plugin 강제 enable/disable | `{ "plugin@market": true }` 형태 |

예시:

```json
{
  "claude_code": {
    "hooks": true,
    "plugins": true,
    "plugins_override": {
      "some-plugin@marketplace": true
    }
  }
}
```

#### `notification`

이 블록은 `devai` 내장 notification 훅의 우선순위를 제어한다.

| 키 | 설명 | 비고 |
| --- | --- | --- |
| `force_enable` | 외부 notification plugin이 감지되어도 `devai` 내장 notification hook 사용 | 현재 소스에서 확인된 유일한 키 |

예시:

```json
{
  "notification": {
    "force_enable": true
  }
}
```

#### `experimental`

이 블록은 실험적 기능과 런타임 동작을 바꾼다.

| 키 | 설명 | 용도 |
| --- | --- | --- |
| `aggressive_truncation` | tool output 강한 절단 | 컨텍스트 절약 |
| `auto_resume` | 자동 재개 관련 동작 | 실패 후 이어가기 |
| `preemptive_compaction` | 선제 compaction 사용 | 토큰 초과 방지 |
| `truncate_all_tool_outputs` | 모든 tool output 절단 | 긴 출력 억제 |
| `task_system` | task system 사용 여부 | background/task 기능 |
| `safe_hook_creation` | hook 생성 안전모드 | 불안정 hook 격리 |
| `disable_devai_env` | devai 환경 주입 비활성화 | 환경 영향 최소화 |
| `hashline_edit` | hashline edit 관련 기능 | 텍스트 편집 동작 |
| `model_fallback_title` | fallback 시 타이틀 반영 | UI 힌트 |
| `plugin_load_timeout_ms` | plugin 로딩 타임아웃 | plugin 진단 |

#### `runtime_fallback`

이 블록은 모델/실행 fallback 정책을 제어한다.

| 키 | 설명 | 용도 |
| --- | --- | --- |
| `enabled` | fallback 기능 사용 여부 | on/off |
| `retry_on_errors` | fallback 대상 에러 코드 목록 | 재시도 제어 |
| `max_fallback_attempts` | 최대 fallback 횟수 | 무한 반복 방지 |
| `cooldown_seconds` | fallback 전 대기 시간 | rate limit 대응 |
| `timeout_seconds` | fallback 처리 제한 시간 | 장기 대기 방지 |
| `notify_on_fallback` | fallback 발생 시 토스트 여부 | 사용자 알림 |

## 4. 소스에서 확인된 Hook 이름

이 섹션은 `disabled_hooks`에 넣을 수 있는 내장 hook 이름 개념을 다룬다.  
모든 hook을 외울 필요는 없고, 역할별로 묶어서 이해하는 게 현실적이다.

| Hook 이름 | 역할 | 언제 쓰는가 |
| --- | --- | --- |
| `session-notification` | 세션 이벤트 알림 | idle/이벤트 토스트 |
| `background-notification` | 백그라운드 작업 알림 | subtask/task 알림 |
| `session-recovery` | 세션 복구 처리 | 오류 세션 복구 |
| `comment-checker` | 코멘트/설명 점검 | 응답 품질 보조 |
| `tool-output-truncator` | tool 출력 절단 | 긴 출력 제한 |
| `question-label-truncator` | question 레이블 정리 | 질문 UI 보정 |
| `directory-agents-injector` | 디렉터리 기반 agent 문맥 주입 | 프로젝트별 문맥 |
| `directory-readme-injector` | README 기반 문맥 주입 | 프로젝트 규칙 반영 |
| `rules-injector` | 규칙 문서 주입 | coding rule 자동 반영 |
| `think-mode` | think mode 관련 제어 | reasoning 정책 |
| `model-fallback` | 모델 fallback | 모델 장애 대응 |
| `preemptive-compaction` | 선제 compaction | 토큰 초과 방지 |
| `startup-toast` | 시작 시 토스트 | 환경 상태 안내 |
| `keyword-detector` | 특정 키워드 감지 | 자동 동작 트리거 |
| `agent-usage-reminder` | agent 사용 유도 | agent 선택 가이드 |
| `non-interactive-env` | 비대화형 환경 보호 | CI/headless 대응 |
| `interactive-bash-session` | bash 세션 처리 | 장기 shell 작업 |
| `claude-code-hooks` | Claude Code 호환 hook 묶음 | 호환 계층 |
| `auto-slash-command` | slash command 자동화 | 명령 자동 호출 |
| `dispatcher` | 작업 분배 관련 hook | orchestration |
| `runtime-fallback` | 런타임 fallback | 오류 시 대체 경로 |
| `write-existing-file-guard` | 기존 파일 수정 보호 | overwrite 방지 |
| `usage-display` | 사용량/상태 표시 | UI toast/display |
| `provider-cache-initializer` | provider cache 초기화 | 모델/프로바이더 상태 |
| `atlassian-auth-bootstrap` | Atlassian 인증 부트스트랩 | Atlassian 연동 |

비활성화 예시:

```json
{
  "disabled_hooks": [
    "auto-update-checker",
    "comment-checker"
  ]
}
```

## 5. Hook 핸들러에서 보이는 이벤트 종류

이 섹션은 hook이 반응하는 런타임 이벤트 개념을 다룬다.  
핵심은 세션 이벤트, 메시지 이벤트, 툴 이벤트, 채팅 후처리 이벤트로 나눠 이해하는 것이다.

| 이벤트 | 설명 | 자주 쓰는 목적 |
| --- | --- | --- |
| `chat.message` | chat message 조립/처리 구간 | 프롬프트 주입, 후처리 |
| `message.updated` | 메시지 업데이트 감지 | 사용자 입력/응답 변화 감지 |
| `tool.execute.before` | tool 실행 직전 | 위험 명령 차단, 입력 검증 |
| `tool.execute.after` | tool 실행 직후 | 결과 검사, 알림, 후속 처리 |
| `session.created` | 세션 생성 시점 | 초기화 처리 |
| `session.idle` | 세션 유휴 상태 | idle 토스트, 후처리 |
| `session.deleted` | 세션 삭제 | 정리(cleanup) |
| `session.status` | 세션 상태 변경 | thinking/active/idle 감시 |
| `command.executed` | command 실행 완료 | slash command 추적 |

주의:

- 모든 hook이 모든 이벤트를 받는 것은 아니다.
- 어떤 hook은 `event(input)` 스타일이고, 어떤 hook은 `'chat.message'`, `'tool.execute.before'` 같은 named handler를 반환한다.
- 실제 payload 구조는 이벤트 종류와 hook 구현에 따라 다를 수 있다.

## 6. Hook 구현 패턴

이 섹션은 `devai` hook을 어떻게 구현하는지에 대한 구조 개념을 다룬다.  
실제로는 크게 `event 기반`과 `named handler 기반` 두 종류가 확인된다.

### 6.1 event 기반

```js
function createMyHook(ctx, config = {}) {
  return async ({ event }) => {
    if (event.type === "message.updated") {
      // 처리
    }
  };
}
```

이 패턴은 `session-notification`, `background-notification` 류에서 많이 보인다.

| 항목 | 설명 |
| --- | --- |
| 입력 형태 | `({ event })` |
| 핵심 분기 | `event.type` |
| 장점 | 모든 이벤트를 한 함수에서 처리하기 쉬움 |
| 적합한 용도 | notification, 상태 감시, 공통 로깅 |

### 6.2 named handler 기반

```js
function createMyHook(ctx) {
  return {
    "chat.message": async (input, output) => {
      // 처리
    },
    "tool.execute.before": async (input, output) => {
      // 처리
    },
    "tool.execute.after": async (input, output) => {
      // 처리
    }
  };
}
```

| 항목 | 설명 |
| --- | --- |
| 입력 형태 | `{ "chat.message": fn, "tool.execute.before": fn }` |
| 핵심 분기 | 이벤트별 함수 분리 |
| 장점 | 이벤트별 책임 분리가 명확함 |
| 적합한 용도 | 프롬프트 주입, tool 가드, 결과 후처리 |

### 6.3 프롬프트에 특정 문구 주입 예시

가장 실용적인 패턴은 `chat.message`에서 출력 구조에 문맥을 덧붙이는 방식이다.

#### 예시 A: 시스템 문구 prepend

```js
function createPromptInjectionHook() {
  return {
    "chat.message": async (input, output) => {
      const injection = {
        role: "system",
        content: "항상 한국어로 답변하고, 위험 요소를 먼저 요약해라."
      };

      output.messages = [
        injection,
        ...(output.messages ?? [])
      ];
    }
  };
}
```

#### 예시 B: 특정 디렉터리에서만 주입

```js
function createScopedPromptInjectionHook(ctx) {
  return {
    "chat.message": async (_input, output) => {
      if (!String(ctx.directory).includes("spring")) {
        return;
      }

      output.messages = [
        {
          role: "system",
          content: "이 프로젝트에서는 Spring Boot 관례와 테스트 코드를 우선한다."
        },
        ...(output.messages ?? [])
      ];
    }
  };
}
```

#### 예시 C: 중복 주입 방지

```js
function createSafePromptInjectionHook() {
  const marker = "[CUSTOM_RULE_INJECTED]";

  return {
    "chat.message": async (_input, output) => {
      const alreadyInjected = (output.messages ?? []).some((msg) =>
        typeof msg?.content === "string" && msg.content.includes(marker)
      );

      if (alreadyInjected) {
        return;
      }

      output.messages = [
        {
          role: "system",
          content: `${marker}\n코드 수정 후 반드시 검증 여부를 명시해라.`
        },
        ...(output.messages ?? [])
      ];
    }
  };
}
```

## 7. 소스에서 확인된 클라이언트 메서드

이 섹션은 hook 내부에서 만질 수 있는 `ctx.client` 계열 객체 개념을 다룬다.  
현재 로컬 번들 기준으로는 `client.session.*`와 `client.tui.showToast(...)`가 가장 실용적이다.

### 7.1 `client.tui`

| 메서드 | 설명 | 예시 용도 |
| --- | --- | --- |
| `client.tui.showToast(...)` | TUI/알림 toast 표시 | 성공/실패/경고 알림 |

예시 형태:

```js
await ctx.client.tui.showToast({
  body: {
    title: "Title",
    message: "Message",
    variant: "info",
    duration: 3000
  }
});
```

`variant` 예시로 보인 값:

- `info`
- `success`
- `warning`
- `error`

### 7.2 `client.session`

| 메서드 | 설명 | 예시 용도 |
| --- | --- | --- |
| `messages(...)` | 세션 메시지 조회 | 과거 대화 문맥 읽기 |
| `promptAsync(...)` | 비동기 프롬프트 전송 | 후속 요청 자동 삽입 |
| `prompt(...)` | 프롬프트 전송 | 동기/기본 전송 |
| `summarize(...)` | 세션 요약 | compaction, 요약 자동화 |
| `abort(...)` | 세션 중단 | 멈춤/취소 처리 |
| `get(...)` | 세션 정보 조회 | 상태/메타 정보 조회 |
| `create(...)` | 세션 생성 | 새 세션/하위 세션 생성 |
| `update(...)` | 세션 정보 갱신 | 메타데이터 수정 |
| `status(...)` | 세션 상태 조회 | idle/active/thinking 확인 |
| `todo(...)` | 세션 todo 조회 | 작업 추적 |

자주 보이는 형태:

```js
await client.session.messages({ path: { id: sessionID } });
await client.session.promptAsync(promptBody);
await client.session.abort({ path: { id: sessionID } });
await client.session.status();
```

### 7.3 `client.app`

| 메서드/객체 | 설명 | 비고 |
| --- | --- | --- |
| `client.app` | 앱 레벨 API 컨테이너 | 현재 번들에선 사용 흔적이 적음 |
| `client.app.log(...)` | 로그 기록 용도로 추정 | 커스텀 코드에서는 사용 가능했음 |

주의:

- 현재 내 환경 기준으로는 `client.session.*`와 `client.tui.showToast(...)`가 핵심이다.
- `client.app.*`는 확장 포인트로 볼 수 있지만, 의존성을 크게 두는 건 아직 이르다.

## 8. 이벤트별로 자주 쓰는 데이터 예시

이 섹션은 각 이벤트 payload에서 어디를 주로 읽는지에 대한 데이터 구조 개념을 다룬다.  
이건 정식 타입 문서가 아니라 현재 번들에서 자주 접근하는 필드 패턴이다.

### 8.1 `message.updated`

| 키 | 설명 | 비고 |
| --- | --- | --- |
| `event.properties.info` | 메시지 관련 메타 묶음 | 구조물 전체 |
| `event.properties.info.message.content` | 메시지 본문 후보 | 가장 먼저 볼 후보 |
| `event.properties.info.content` | 단순 content 후보 | 구현에 따라 존재 |
| `event.properties.message.content` | 다른 경로의 본문 후보 | fallback 용 |

### 8.2 `tool.execute.before` / `tool.execute.after`

| 키 | 설명 | 비고 |
| --- | --- | --- |
| `event.properties.sessionID` | 어떤 세션의 tool 실행인지 식별 | 세션 추적 |
| `event.properties.tool` | 실행 대상 tool 이름 | `bash`, `edit` 등 |
| `event.properties.args` | tool 인자 묶음 | 원본 입력 |
| `event.properties.args.command` | 명령 문자열 | shell 계열에서 자주 유용 |

### 8.3 `session.*`

| 키 | 설명 | 비고 |
| --- | --- | --- |
| `event.properties.sessionID` | 세션 식별자 | status/idle 등에서 자주 사용 |
| `event.properties.info` | 세션 메타 정보 | created/deleted 계열 |
| `event.properties.info.id` | 세션 id 후보 | created/deleted 처리 |
| `event.properties.status` | 세션 상태 값 | `session.status`에서 사용 |
| `event.properties.type` | 상태 타입/보조 상태 | fallback 용 |

## 9. 가장 실용적인 토스트 hook 예시

현재 환경에서 가장 간단한 형태:

```js
function createToastHook(ctx) {
  return async ({ event }) => {
    await ctx.client.tui.showToast({
      body: {
        title: `[${event.type}]`,
        message: JSON.stringify(event.properties ?? {}).slice(0, 120),
        variant: "info",
        duration: 3000
      }
    });
  };
}
```

## 10. 내 기준 추천 개발 방식

- 1단계: `event.type`만 토스트로 띄워서 실제 발생 이벤트 확인
- 2단계: 필요한 이벤트만 필터링
- 3단계: payload 에서 실제 필요한 필드만 추출
- 4단계: 설정값을 `devai-plugin.json`으로 분리

예:

```json
{
  "notification": {
    "force_enable": true
  },
  "disabled_hooks": [
    "auto-update-checker"
  ]
}
```

## 11. 주의할 점

- `devai`는 Claude Code hook 개념을 일부 가져오지만, 패키지 구조를 그대로 복붙해서 되는 구조는 아니다.
- 실제로 안정적으로 먹는 건 `devai.js` 내부 hook 생성/등록 패턴을 따라가는 방식이다.
- 이벤트 payload 구조는 hook 마다 약간씩 다를 수 있으니 초반에는 반드시 raw payload 를 짧게 확인하는 게 좋다.
- `tool.execute.before`는 매우 자주 발생할 수 있다.

## 12. 바로 써볼 체크리스트

- `devai-plugin.json`에서 `claude_code.hooks` 확인
- 필요하면 `notification.force_enable: true` 설정
- `disabled_hooks`에 내가 막아둔 hook 이 없는지 확인
- 테스트 hook 은 먼저 `session.created`, `message.updated`, `tool.execute.after` 정도만 걸어보기
- 과한 알림이 뜨면 `tool.execute.before`는 나중에 켜기
