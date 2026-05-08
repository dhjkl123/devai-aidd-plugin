# Story 1.4: Compute Branch Strategy and Candidate Branch Names

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a workflow user,
I want the system to compute the appropriate branch behavior for the active workflow,
so that branch creation or switching follows the configured naming and policy rules automatically.

## Acceptance Criteria

1. **Given** a workflow command has been identified and policy has been resolved
   **When** the plugin evaluates branch behavior for that workflow
   **Then** it determines whether a branch is required, optional, or unnecessary for the workflow
   **And** it computes a candidate branch name from configured command type, ticket context, fallback values, and slug rules.
2. **Given** the current branch is long-lived or does not satisfy the workflow policy
   **When** branch evaluation runs
   **Then** the plugin prepares a branch creation or switch proposal instead of silently mutating Git state
   **And** the proposal preserves user approval as a separate later step.

## Tasks / Subtasks

- [x] `branch-service`瑜??좉퇋 紐⑤뱢濡?異붿텧?쒕떎 (AC: 1, 2)
  - [x] `src/services/git/branch-service.js`瑜??앹꽦?섍퀬 ?ㅼ쓬 ??媛쒖쓽 ?쒖닔 ?⑥닔瑜?export ?쒕떎.
    - `evaluateBranchStrategy({ workflowContext, workflowPolicy, branchConfig, currentBranch })` ??`{ requirement: "required" | "optional" | "unnecessary", reason, policyMatch }` 諛섑솚.
    - `computeCandidateBranchName({ workflowContext, workflowPolicy, branchConfig })` ??臾몄옄???꾨낫 釉뚮옖移섎챸 ?먮뒗 `null` 諛섑솚.
  - [x] ???⑥닔 紐⑤몢 I/O? 遺?섑슚怨?肄섏넄, 媛먯궗 濡쒓렇, git ?몄텧, ?뚯씪 ?쒖뒪??瑜??섑뻾?섏? ?딅뒗 ?쒖닔 ?⑥닔濡??묒꽦?쒕떎. ?쒓컙???꾩슂??寃쎌슦 ?몄텧?먭? `detectedAt`瑜?二쇱엯?쒕떎.
  - [x] ?숈씪 紐⑤뱢?먯꽌 ?щ윭洹??뺢퇋???ы띁 `slugifyArguments(value, { fallback })`??export ?쒕떎. 洹쒖튃: `toLowerCase` ??怨듬갚/?몃뜑?ㅼ퐫?대? `-`濡?移섑솚 ??`[a-z0-9-]` ??臾몄옄 ?쒓굅 ???곗냽??`-` ?뺤텞 ?????앹쓽 `-` ?쒓굅 ??寃곌낵媛 鍮?臾몄옄?댁씠硫?`fallback`???ъ슜.
  - [x] ?곗폆 異붿텧 ?ы띁 `extractTicketToken(args, { fallbackTicket })`??export ?쒕떎. 洹쒖튃: `[A-Z]+-\d+` ?뺢퇋?앹쑝濡??몄옄 臾몄옄?댁뿉??泥?留ㅼ튂瑜??ъ슜, ?놁쑝硫?`branchConfig.fallbackTicket` ?ъ슜.

- [x] 釉뚮옖移??꾨왂 ?먯젙 濡쒖쭅??援ы쁽?쒕떎 (AC: 1)
  - [x] `workflowPolicy.branchRequired === true` ??`requirement: "required"`.
  - [x] `workflowPolicy.branchRequired === false`?대㈃??`workflowPolicy.category`媛 `"implementation"`??寃쎌슦??`optional`(?꾩옱 `defaults.js`???뺤콉 ?쒖뿉???대떦 議고빀???놁쑝誘濡??덉쟾??fallback ?뺤쓽 紐⑹쟻)濡? 洹??몃뒗 `unnecessary`濡??먯젙?쒕떎.
  - [x] `workflowPolicy`媛 `null`/`undefined`(Story 1.3 resolver媛 ?뺤콉 留ㅽ븨 誘몄뒪瑜?諛섑솚??寃쎌슦) ??`requirement: "unnecessary"`, `reason: "no-policy-match"`.
  - [x] `policyMatch`?먮뒗 ?ъ슜??`commandName`, `category`, `identityStrategy`, `branchRequired`, `finalization` ?ㅼ꽢 ?꾨뱶瑜?洹몃?濡??댁븘 ?ㅼ슫?ㅽ듃由?媛먯궗/?뱀씤 ?먮쫫???숈씪 媛앹껜瑜??ъ궗?⑺븯?꾨줉 ?쒕떎.

- [x] ?꾨낫 釉뚮옖移섎챸 怨꾩궛 濡쒖쭅??援ы쁽?쒕떎 (AC: 1)
  - [x] `branchConfig.commandTypeMap[normalizedCommand]`媛 議댁옱?섎㈃ 洹?媛믪쓣, ?놁쑝硫?`branchConfig.defaultType`(湲곕낯 `"chore"`)??`{type}`濡??ъ슜?쒕떎.
  - [x] ?곗폆 ?좏겙? `extractTicketToken(workflowContext.arguments, { fallbackTicket: branchConfig.fallbackTicket })`濡?寃곗젙?쒕떎. ??寃곌낵媛 fallback??寃쎌슦 ?щ윭洹멸? 鍮꾩뼱?덉쑝硫????섎룄濡??щ윭洹?fallback??媛뺤젣?쒕떎(`workflowContext.normalizedCommand` ?먮뒗 `"workflow"`).
  - [x] ?щ윭洹몃뒗 `workflowContext.arguments`?먯꽌 ticket ?좏겙???쒖쇅???섎㉧吏瑜?`slugifyArguments`濡??뺢퇋?뷀븳?? ?몄옄 ?먯껜媛 鍮꾩뼱?덉쑝硫?`workflowContext.normalizedCommand`瑜??щ윭洹??뚯뒪濡??ъ슜?쒕떎.
  - [x] 理쒖쥌 ?꾨낫紐낆? `branchConfig.pattern`(湲곕낯 `"{type}/{ticket}-{slug}"`)??`{type}`, `{ticket}`, `{slug}` ?좏겙??移섑솚???앹꽦?쒕떎. ?⑦꽩???뺤쓽?섏? ?딆? ?좏겙? 臾댁떆?쒕떎.
  - [x] ?앹꽦???꾨낫紐낆쓣 `branchConfig.validationRegex`濡?寃利앺븳?? ?듦낵?섏? 紐삵븯硫?`null`??諛섑솚?섍퀬 ?몄텧?먭? ?ъ쑀瑜?湲곕줉?????덈룄濡?`reason: "candidate-failed-validation"`???숇컲 媛앹껜濡??꾨떖?????덈뒗 ?뺤떇 ??利??꾨낫紐?而댄벂?곕뒗 `{ name, valid, reason }` ?뺥깭???④퍡 export ?쒕떎(硫붿씤 ?⑥닔??valid??寃쎌슦 `name` 臾몄옄?댁쓣 諛섑솚, ?ㅽ뙣 ??`null`??諛섑솚?섎릺 ?몄텧?먭? 遺媛 ?뺣낫瑜?諛쏆쓣 ???덈룄濡?`computeCandidateBranchNameDetailed(...)` 蹂댁“ export瑜??붾떎).

- [x] long-lived 釉뚮옖移?遺꾧린 諛?proposal ?앹꽦 濡쒖쭅??援ы쁽?쒕떎 (AC: 2)
  - [x] `evaluateBranchStrategy`??`requirement: "required"`?????몄텧?먭? proposal???앹꽦?섍린 ?꾪빐 ?꾩슂??異붽? ?뺣낫(`isLongLived: boolean`, `currentBranch`, `policyMatch`)瑜??④퍡 諛섑솚?쒕떎.
  - [x] long-lived ?먮떒? `branchConfig.longLivedBranches`(湲곕낯 `["main", "master"]`) 諛곗뿴???뺥솗??臾몄옄??留ㅼ튂濡??섑뻾?쒕떎. ??뚮Ц???묐몢??遺遺꾩씪移섎뒗 ?ъ슜?섏? ?딅뒗??
  - [x] 蹂꾨룄 export ?⑥닔 `buildBranchProposal({ strategy, candidateName, currentBranch })`瑜?異붽????ㅼ쓬 媛앹껜瑜?諛섑솚?쒕떎.
    - ?꾨낫紐낆씠 議댁옱?섍퀬 ?꾩옱 釉뚮옖移섍? long-lived嫄곕굹 `validationRegex`瑜??듦낵?섏? 紐삵븯??寃쎌슦 ??`{ kind: "branch", action: "create", name, reason, current, policyMatch }`.
    - ?꾨낫紐낆씠 議댁옱?섍퀬 ?꾩옱 釉뚮옖移섍? ?뺤콉?먮뒗 遺?⑺븯吏留??꾨낫紐낃낵 ?ㅻⅨ 寃쎌슦 ??`{ kind: "branch", action: "switch", name, reason, current, policyMatch }`.
    - ?꾨낫紐낆씠 議댁옱?섍퀬 ?꾩옱 釉뚮옖移섍? ?뺥솗???꾨낫紐낃낵 ?쇱튂?섎㈃ ??`null`(異붽? ?묒뾽 遺덊븘??.
    - ?꾨낫紐낆쓣 怨꾩궛?????녿뒗 寃쎌슦(`null`) ?먮뒗 `requirement === "unnecessary"`?대㈃ ??`null`.
  - [x] proposal 媛앹껜???덈? git???몄텧?섏? ?딅뒗?? 利????ㅽ넗由щ뒗 ?대뼡 ?쒖젏?먮룄 `git checkout`, `git switch`, `git branch -m`???ㅽ뻾?섏? ?딅뒗??Epic 2 ?뱀씤 ?먮쫫怨?Story 1.5/Epic 2 ?ㅽ뻾 ?먮쫫??蹂꾨룄 梨낆엫).

- [x] `command.execute.before` ?먮쫫???듯빀?쒕떎 (AC: 1, 2)
  - [x] `src/index.js`?먯꽌 `branchConfig = runtimeConfig.config.branch`瑜?異붿텧??`createCommandExecuteBeforeHook`??二쇱엯?????덈룄濡??섏〈?깆쓣 ?뺤옣?쒕떎.
  - [x] `src/hooks/command-execute-before.js`?먯꽌 Story 1.2??`detectWorkflowContext`濡?而⑦뀓?ㅽ듃瑜?諛쏄퀬, Story 1.3??`resolveWorkflowPolicy`濡??뺤콉??諛쏆? ?? `evaluateBranchStrategy` + `computeCandidateBranchName` + `buildBranchProposal`??李⑤?濡??몄텧?쒕떎.
  - [x] proposal???앹꽦?섎㈃ ?뚰겕?뚮줈???곹깭 ??μ냼??`state.branchProposal = proposal`濡?湲곕줉留??쒕떎(Epic 2媛 ?뚮퉬). proposal??洹??먮━?먯꽌 ?ъ슜?먯뿉寃??쒖떆?섍굅??git??蹂寃쏀븯吏 ?딅뒗??
  - [x] proposal ?앹꽦 ??`git.action.planned` 援ъ“??媛먯궗 ?대깽?몃? best-effort濡?湲곕줉?쒕떎. payload??`{ event: "git.action.planned", timestamp, workflow, command, details: { kind: "branch", action, name, reason, isLongLived } }` ?뺥깭(architecture event contract 以??. raw arguments???덈? details???ы븿?섏? ?딅뒗??
  - [x] `detectWorkflowContext`媛 `null`??諛섑솚?섍굅??`requirement === "unnecessary"`?대㈃ ?대뼡 ?몄텧??異붽?濡??쇱뼱?섏? ?딆븘???섎ŉ, 湲곗〈 legacy parity ?숈옉??洹몃?濡??좎??쒕떎.

- [x] ?뚭? 諛??⑥쐞 寃利?而ㅻ쾭由ъ?瑜??뺤옣?쒕떎 (AC: 1, 2)
  - [x] `tests/regression.test.js`???ㅼ쓬 耳?댁뒪瑜?異붽??쒕떎.
    - ?뚰겕?뚮줈??紐낅졊(`bmad-bmm-quick-dev`)??`arguments: "ABC-123 regression coverage"`濡??ㅼ뼱?붿쓣 ??wrapper???뚰겕?뚮줈???곹깭??`branchProposal.kind === "branch"`, `action === "create"`, `name === "feat/ABC-123-regression-coverage"`媛 湲곕줉?섎뒗吏.
    - 媛숈? 紐낅졊??`arguments: ""` ?낅젰 ??fallback 寃쎈줈(`feat/no-ticket-bmad-bmm-quick-dev` ?뺥깭 ?먮뒗 ?뺤콉???뺤쓽??fallback ?щ윭洹?媛 `validationRegex`瑜??듦낵?섎뒗吏.
    - 鍮??뚰겕?뚮줈??紐낅졊(`/non-workflow-command`)???ㅼ뼱?붿쓣 ??`branchProposal`???앹꽦?섏? ?딄퀬 audit `git.action.planned`??諛쒖깮?섏? ?딅뒗吏(idempotency + isolation).
    - long-lived 遺꾧린: ?꾩옱 釉뚮옖移섍? `"main"`???쒕??덉씠???낅젰?????`action === "create"`媛 ?좏깮?섎뒗吏(?꾩옱 釉뚮옖移섎뒗 ?몄텧?먭? mock?쇰줈 二쇱엯?쒕떎).
    - `branchRequired: false`???뺤콉(`bmad-bmm-create-prd`)??寃쎌슦 proposal??`null`?닿퀬 audit ?대깽?멸? emit?섏? ?딅뒗吏.
  - [x] legacy parity: 湲곗〈 `normalizeOutputParts` deepEqual怨?mutating-tool error parity??洹몃?濡??좎??쒕떎(legacy core ?숈옉 蹂寃?湲덉?).
  - [x] ?щ윭洹??곗폆 ?ы띁??媛?ν븯硫??숈씪 ?뚯씪 ?덉쓽 export濡?遺꾨━???뚭? ?ㅽ겕由쏀듃?먯꽌 吏곸젒 ?⑥쐞 ?몄텧??媛?ν븯?꾨줉 ?쒕떎(`tests/regression.test.js` ?덉뿉 ?몃씪???⑥쐞 ?몄텧 異붽? ?덉슜 ??Story 1.2? ?숈씪???⑦꽩).

- [x] 鍮뚮뱶/?고???怨꾩빟??寃利앺븳??(AC: 1, 2)
  - [x] `npm run build && npm test`媛 ?대┛ 泥댄겕?꾩썐?먯꽌 ?듦낵?쒕떎(Story 1.1, 1.2, 1.3?먯꽌 ?뺣┰??怨꾩빟 ?좎?).
  - [x] 鍮뚮뱶??`dist/devai-aidd-guard.js`媛 ?덈줈 異붽???`src/services/git/branch-service.js`瑜??몃씪?대떇?섎뒗吏 ?뺤씤?쒕떎(esbuild媛 ?먮룞 泥섎━?섎?濡?蹂꾨룄 ?ㅼ젙 蹂寃??놁씠 鍮뚮뱶 ?깃났留??뺤씤).

### Review Follow-ups (AI)

- [x] [AI-Review][High] `command.execute.before`가 입력 또는 주입된 resolver에서 `currentBranch`를 읽어 `switch`/`current-branch-is-long-lived` proposal 경로를 실제 통합 훅에서도 만들 수 있게 한다.
- [x] [AI-Review][Medium] `branch.validationRegex`를 구성 검증 단계에서 유효성 검사하고, 런타임 브랜치 계산 중 잘못된 정규식이 들어와도 예외 대신 validation failure로 안전하게 강등한다.

## Dev Notes

### Story Intent

???ㅽ넗由щ뒗 Epic 1??釉뚮옖移??섏궗寃곗젙 ?④퀎?? Story 1.2媛 ?앸퀎??**?뚰겕?뚮줈??而⑦뀓?ㅽ듃**? Story 1.3???댁냼??**effective config + workflow policy**瑜??낅젰?쇰줈 諛쏆븘, ?ㅼ쓬 ??媛吏瑜??곗텧?섎뒗 寃껋씠 ?좎씪??梨낆엫?대떎. (1) ???뚰겕?뚮줈?곗뿉 釉뚮옖移섍? `required`/`optional`/`unnecessary` 以?臾댁뾿?몄????먯젙. (2) ?뺤콉??留욌뒗 ?꾨낫 釉뚮옖移섎챸 臾몄옄??怨꾩궛 諛?洹멸쾬???댁? **proposal 媛앹껜**. ???ㅽ넗由щ뒗 ?대뼡 git 紐낅졊???ㅽ뻾?섏? ?딆쑝硫? ?ъ슜?먯뿉寃??뱀씤 ?꾨＼?꾪듃瑜??꾩슦吏???딅뒗??Epic 2). ???ㅽ넗由ъ쓽 異쒕젰 媛앹껜??Epic 2???뱀씤 ?뚰겕?뚮줈?곗? Story 3.x??finalization ?먮쫫??紐낆떆???낅젰 怨꾩빟?대떎.

### Verified Baseline Findings

- `src/config/defaults.js`???ㅼ쓬???대? ?쒓났?쒕떎.
  - `branch.pattern = "{type}/{ticket}-{slug}"`
  - `branch.defaultType = "chore"`
  - `branch.fallbackTicket = "no-ticket"`
  - `branch.longLivedBranches = ["main", "master"]`
  - `branch.validationRegex`(而댄뙆???????뺤떇 ???쒖? `TICKET-NUM` ?먮뒗 `no-ticket-`)
  - `branch.commandTypeMap` ??`bmad-bmm-*` 紐낅졊?ㅼ씠 `feat/fix/docs/chore/refactor/design`濡?留ㅽ븨??
  - `workflowPolicy[command]`???대? `category`, `identityStrategy`, `branchRequired`, `finalization`???닿퀬 ?덈떎.
- 洹몃윭???ㅼ쓬? ?꾩쭅 ?대뵒?먮룄 議댁옱?섏? ?딅뒗??
  - ?꾨낫 釉뚮옖移섎챸??鍮뚮뱶?섎뒗 ?⑥닔.
  - ?щ윭洹??뺢퇋???ы띁.
  - long-lived 釉뚮옖移?寃???ы띁.
  - branch proposal 媛앹껜 ?뺤떇 ?뺤쓽.
  - `branchRequired`瑜?`required`/`optional`/`unnecessary` 3-媛?紐⑤뜽濡??섏궛?섎뒗 濡쒖쭅.
- `src/policies/legacy/devai-git-workflo.js`??`tool.execute.before`??mutating tool 媛?쒖뿉??`Git workflow guard: create or switch to branch \`workflow\` before editing files for /${state.commandName}.`?쇰뒗 ?뺤쟻 臾멸뎄瑜?諛섑솚?쒕떎. ??硫붿떆吏???뚭? ?뚯뒪?멸? deepEqual濡?寃?ы븯誘濡?**legacy core???덈? ?섏젙?섏? ?딅뒗??*. Story 1.4????proposal ?먮쫫? wrapper ?ъ씠?쒖뿉 遺媛??肉?legacy??媛??硫붿떆吏??蹂寃쏀븯吏 ?딅뒗??
- Story 1.2媛 `src/services/workflow/`瑜??좎꽕?섍퀬 `workflow.detected` ?대깽?몃? emit ?섎뒗 ?⑦꽩???뺣┰?덈떎. Story 1.4???숈씪 ?⑦꽩??`src/services/git/`濡??뺤옣?쒕떎.

### Technical Requirements

- **?쒖닔 ?⑥닔 ?먯튃**: `evaluateBranchStrategy`, `computeCandidateBranchName`, `buildBranchProposal`? 紐⑤몢 ?낅젰留뚯쑝濡?寃곗젙?섎ŉ I/O瑜??섑뻾?섏? ?딅뒗?? 遺?섑슚怨?audit emit, ?곹깭 ??μ냼 湲곕줉)??hook wrapper?먯꽌留??쇱뼱?쒕떎.
- **slug ?뺢퇋??洹쒖튃**:
  1. `String(value || "")` ??`toLowerCase()`.
  2. 怨듬갚瑜?`\s+`)? `_`瑜?`-`濡?移섑솚.
  3. `[a-z0-9-]` ?댁쇅??紐⑤뱺 臾몄옄 ?쒓굅.
  4. ?곗냽??`-`瑜??⑥씪 `-`濡??뺤텞.
  5. ???앹쓽 `-` ?쒓굅.
  6. 寃곌낵媛 鍮?臾몄옄?댁씠硫??몄텧?먭? ?쒓났??fallback(`workflowContext.normalizedCommand` ?먮뒗 `"workflow"`)???ъ슜.
- **ticket 異붿텧 洹쒖튃**:
  1. ?몄옄 臾몄옄?댁뿉??`/[A-Z]+-\d+/` 泥?留ㅼ튂瑜??곗꽑 ?ъ슜.
  2. ?놁쑝硫?`branchConfig.fallbackTicket`(`"no-ticket"`)???ъ슜.
  3. fallback ?ъ슜 ??`validationRegex`??`no-ticket` 遺꾧린瑜?留뚯”?쒗궎?꾨줉 ?щ윭洹??뺤떇??媛뺤젣?쒕떎(利?fallback ticket????type ?좏겙? 洹몃?濡??먭퀬 ?щ윭洹몃쭔?쇰줈 寃利앹쓣 ?듦낵?댁빞 ?쒕떎).
- **pattern ?좏겙 移섑솚 洹쒖튃**: `branchConfig.pattern.replace("{type}", type).replace("{ticket}", ticket).replace("{slug}", slug)`. ?뺤쓽?섏? ?딆? ?좏겙? 洹몃?濡??붾떎(?ν썑 `{user}`, `{date}` 媛숈? ?좏겙 ?꾩엯??怨좊젮??strict 留ㅼ튂 ???known-token-only 移섑솚).
- **寃利?洹쒖튃**: ?꾨낫紐낆? 諛섎뱶??`branchConfig.validationRegex`瑜?留뚯”?댁빞 ?섎ŉ, 留뚯”?섏? 紐삵븯硫??꾨낫紐낆? `null`濡?諛섑솚?섍퀬 proposal? ?앹꽦?섏? ?딅뒗??
- **no-mutate ?먯튃**: ???ㅽ넗由ъ쓽 ?대뼡 肄붾뱶??`child_process`, `node:fs`???곌린 API, `git` CLI, ?먮뒗 working tree瑜?蹂寃쏀븯???대뼡 ?몄텧???섑뻾?섏? ?딅뒗?? ?꾩냽 ?ㅽ넗由?Epic 2 ?뱀씤 ?먮쫫, Story 1.5 readiness, ?ν썑 git executor)媛 ?ㅼ젣 git ?몄텧 梨낆엫??媛吏꾨떎.
- **?꾩옱 釉뚮옖移??낅젰**: ?꾩옱 釉뚮옖移??앸퀎? Story 1.5 readiness service??梨낆엫 ?곸뿭?댁?留? Story 1.4??洹?寃곌낵瑜??낅젰?쇰줈 諛쏅뒗 ?명꽣?섏씠?ㅻ? 誘몃━ ?뺤쓽?댁빞 ?쒕떎. ?곕씪??`evaluateBranchStrategy`/`buildBranchProposal`? ?몄텧?먭? `currentBranch` 臾몄옄?댁쓣 紐낆떆?곸쑝濡?二쇱엯?섎룄濡??ㅺ퀎?쒕떎. ?듯빀 ?쒖젏?먮뒗 ?꾩떆濡?`null`??二쇱엯?대룄 ?숈옉?섎룄濡?fallback???붾떎(`null`?대㈃ `isLongLived: false`濡?媛꾩＜, action? `create`).
- **non-blocking ?먯튃**: `audit.info` ?몄텧怨??뚰겕?뚮줈???곹깭 湲곕줉? best-effort. ?ㅽ뙣?대룄 hook ?먯껜??throw ?섏? ?딆쑝硫?legacy parity ?먮쫫???덈? 李⑤떒?섏? ?딅뒗??

### Architecture Compliance

- **?대뜑 ?꾩튂**: ?좉퇋 肄붾뱶??`src/services/git/branch-service.js`濡??ㅼ뼱媛꾨떎. ?꾪궎?띿쿂??Project Structure ??File Structure Patterns??`src/services/git/` 紐낆꽭瑜??뺥솗???곕Ⅸ?? `src/hooks/`??`src/policies/legacy/`??釉뚮옖移?怨꾩궛 濡쒖쭅???먯? ?딅뒗??
- **?ㅼ씠諛?*: ?뚯씪紐?`kebab-case.js`, ?⑥닔 `camelCase`, ?대깽???앸퀎??`dot.case`(`git.action.planned`).
- **Command/Event ?⑦꽩**: ?꾪궎?띿쿂??`PrepareBranchCommand`瑜??덉떆 command 以??섎굹濡?紐낆떆?쒕떎. Story 1.4??洹?紐낆꽭??遺?⑺븯??**proposal 媛앹껜**瑜??곗텧?섏?留? 蹂멸꺽?곸씤 Command ?ㅽ뻾 ?먮쫫(`src/commands/prepare-branch-command.js`)? Epic 2/Story 3.x?먯꽌 ?ㅽ쁽?쒕떎. ?곕씪??蹂??ㅽ넗由щ뒗 **?곗씠??媛앹껜濡쒖꽌??PrepareBranchCommand**瑜??꾩엯?쒕떎.
  - ?쒖? proposal ?ㅽ궎留? `{ kind: "branch", action: "create" | "switch", name: string, reason: string, current: string | null, policyMatch: { commandName, category, identityStrategy, branchRequired, finalization } }`.
- **?대깽??envelope**: `git.action.planned` payload??architecture???쒖? envelope???곕Ⅸ??
  ```js
  {
    event: "git.action.planned",
    timestamp: "<ISO-8601>",
    workflow: "<commandName>",
    command: "<commandName>",
    details: { kind: "branch", action, name, reason, isLongLived }
  }
  ```
- **誘쇨컧?뺣낫 ?뚰뵾**: raw `arguments` 臾몄옄?댁? audit details???ы븿?섏? ?딅뒗?? ?щ윭洹맞룻떚耳??좏겙???듯븳 derived 媛믩쭔 ?몄텧?쒕떎(NFR5, ?꾪궎?띿쿂 蹂댁븞 ?먯튃).
- **Approval 寃쎄퀎**: ???ㅽ넗由щ뒗 ?뺤콉 寃곌낵 ?쒖?媛?`allow`/`deny`/`ask`/`skip`)???곗텧?섏? ?딅뒗?? 洹멸쾬? Epic 2??`approval-policy-service` 梨낆엫. Story 1.4??proposal? ?낅젰 ?곗씠?곗씪 肉먯씠??

### Library / Framework Requirements

- **?좉퇋 ?몃? ?쇱씠釉뚮윭由??놁쓬**. 蹂??ㅽ넗由щ뒗 `String` 硫붿꽌?? `RegExp`, `Map`, `Set`留뚯쑝濡??꾩쟾??援ы쁽?쒕떎. ?щ윭洹몄슜 ?쇱씠釉뚮윭由?`slugify` ?? ?꾩엯 湲덉? ???뺤콉 ?뺢퇋?앷낵 100% ?뺥빀??留욎떠吏??대? 援ы쁽???꾩슂?섎떎.
- **`node:child_process` 誘몄궗??*. git ?몄텧? 蹂??ㅽ넗由ъ쓽 踰붿쐞瑜?踰쀬뼱?쒕떎(Story 1.5/Epic 2 梨낆엫).
- **`node:fs` ?곌린 API 誘몄궗??*. ?ㅼ젙 ?뚯씪? Story 1.3??loader媛 ?대? ?쎌? 寃곌낵留??뚮퉬?쒕떎.
- **鍮뚮뱶**: 湲곗〈 `esbuild` ESM Node 22 ?寃? ?좉퇋 ?뚯씪? `src/index.js`?먯꽌 import ?섎㈃ ?먮룞?쇰줈 踰덈뱾???ы븿?쒕떎.

### File Structure Requirements

- ?좉퇋 ?뚯씪:
  - `src/services/git/branch-service.js` ??pure ?⑥닔 紐⑥쓬(`slugifyArguments`, `extractTicketToken`, `evaluateBranchStrategy`, `computeCandidateBranchName`, `computeCandidateBranchNameDetailed`, `buildBranchProposal`).
- ?섏젙 ?뚯씪:
  - `src/index.js` ??`branchConfig`瑜?`command.execute.before` hook factory??二쇱엯.
  - `src/hooks/command-execute-before.js` ??detection ??policy resolution ??branch evaluation ??proposal stash ??audit emit ??legacy delegate ?쒖꽌濡??ㅼ??ㅽ듃?덉씠??
  - `src/services/workflow/workflow-state.js`(Story 1.2媛 ?대? ?좎꽕) ??proposal??蹂닿??섎뒗 ?꾨뱶(`branchProposal`)瑜?異붽?濡??덉슜. ??硫붿꽌??異붽? ?놁씠 湲곗〈 `set/advancePhase`濡?異⑸텇?섎떎硫?蹂寃?遺덊븘??
- ?섏젙?섏? 留먯븘???섎뒗 ?뚯씪:
  - `src/policies/legacy/devai-git-workflo.js` ??legacy core 洹몃?濡? mutating-tool 硫붿떆吏/`states.set` ?숈옉 蹂寃?湲덉?.
  - `src/config/defaults.js` ??蹂??ㅽ넗由ъ뿉?쒕뒗 湲곗〈 ?ㅻ쭔 ?뚮퉬. ??異붽?/?대쫫 蹂寃?湲덉?.
- ???대뜑 ?좎꽕 湲덉?: 蹂??ㅽ넗由щ뒗 `src/services/git/`留?異붽??쒕떎. `src/commands/`, `src/events/`??Epic 2/3?먯꽌 ?꾩엯.

### Testing Requirements

- ?꾩닔 寃利?紐낅졊: `npm run build && npm test`.
- ?뚭? ?뚯뒪???뺤옣 ?곸뿭(`tests/regression.test.js`):
  1. **?곗폆 ?щ윭洹?留ㅽ븨**: `bmad-bmm-quick-dev` + `arguments: "ABC-123 regression coverage"` ???꾨낫紐?`feat/ABC-123-regression-coverage`(`commandTypeMap`??`bmad-bmm-quick-dev`瑜?`feat`濡?留ㅽ븨) 諛?`validationRegex` ?듦낵 寃利?
  2. **?곗폆 fallback**: ?숈씪 紐낅졊 + 鍮?arguments ???꾨낫紐낆씠 `validationRegex`??`no-ticket-` 遺꾧린瑜?留뚯”?섎뒗吏 寃利??? `feat/no-ticket-bmad-bmm-quick-dev`).
  3. **defaultType fallback**: `commandTypeMap`???녿뒗 媛??紐낅졊(?? `bmad-bmm-unknown`)???뺤콉 留ㅽ븨???꾩떆 異붽??덉쓣 ??type??`chore`濡??⑥뼱吏?붿?(?먮뒗 ?뺤콉 留ㅽ븨???놁쑝硫?proposal ?먯껜媛 `null`???섎뒗吏) ?뺤씤.
  4. **long-lived 遺꾧린**: `currentBranch === "main"`??mock ?낅젰?쇰줈 二쇱엯?덉쓣 ??`action === "create"`媛 ?좏깮?섎뒗吏.
  5. **policy unnecessary**: `bmad-bmm-create-prd`(branchRequired: false) 紐낅졊?먯꽌 `branchProposal`??`null`?닿퀬 audit ?대깽?몃룄 emit?섏? ?딅뒗吏.
  6. **non-workflow isolation**: `/non-workflow-command` ?몄텧 ???대뼡 branch 愿???묒뾽??諛쒖깮?섏? ?딅뒗吏(state쨌audit 紐⑤몢 源⑤걮).
  7. **legacy parity**: 湲곗〈 `normalizeOutputParts` deepEqual怨?mutating-tool error 硫붿떆吏??洹몃?濡??좎??섎뒗吏.
- ?⑥쐞 耳?댁뒪(?몃씪???덉슜):
  - `slugifyArguments("ABC-123 Regression Coverage")` ??`"abc-123-regression-coverage"` ?뺥깭?몄?(?щ윭洹몃뒗 ticket???쒖쇅??遺遺꾩쓣 諛쏆쑝誘濡? ?몄텧?먭? ticket 異붿텧 ???섎㉧吏瑜??섍릿?ㅻ뒗 媛?뺤쑝濡?蹂꾨룄 耳?댁뒪 寃利?.
  - `extractTicketToken("ABC-123 cleanup", { fallbackTicket: "no-ticket" })` ??`"ABC-123"`.
  - `extractTicketToken("just a slug", { fallbackTicket: "no-ticket" })` ??`"no-ticket"`.

### Previous Story Intelligence

- **Story 1.2 ?섏〈??*: `detectWorkflowContext`媛 諛섑솚?섎뒗 而⑦뀓?ㅽ듃 媛앹껜 ?뺤떇 ??`{ commandName, normalizedCommand, arguments, sessionID, detectedAt, phase }` ??媛 Story 1.4???낅젰 怨꾩빟?대떎. Story 1.4???⑥닔 ?쒓렇?덉쿂??`workflowContext`瑜?洹??뺤떇 洹몃?濡?諛쏅뒗?? ???꾨뱶瑜?異붽??섏? ?딅뒗??
- **Story 1.3 ?섏〈??*: `resolveWorkflowPolicy(workflowContext, runtimeConfig)` 媛 諛섑솚?섎뒗 ?뺤콉 媛앹껜 ??`{ commandName, category, identityStrategy, branchRequired, finalization, ... }` ??媛 Story 1.4???낅젰?대떎. Story 1.4???뺤콉 媛앹껜瑜?蹂?뺥븯吏 ?딆쑝硫?`policyMatch`濡?洹몃?濡?蹂댁〈?쒕떎.
- **Story 1.1 遺?몄뒪?몃옪 ?⑦꽩**: ???쒕퉬??紐⑤뱢? `src/index.js`??遺?몄뒪?몃옪 closure?먯꽌 ??踰??몄뒪?댁뒪?붾릺怨?hook factory??二쇱엯?쒕떎. ?꾩뿭 mutable singleton 湲덉?.
- **Story 1.2 audit emit ?⑦꽩**: `audit.info(...)` best-effort ?몄텧, ?ㅽ뙣 ??throw ?섏? ?딆쓬, payload??architecture envelope 以?? raw arguments 鍮꾪룷?? Story 1.4??`git.action.planned` emit???숈씪 洹쒖튃???곕Ⅸ??
- **Story 1.1 sprint-change-proposal ?곹뼢**: 遺?몄뒪?몃옪??install/setup migration??臾듭떆?곸쑝濡??섑뻾?섏? ?딅뒗?ㅻ뒗 ?먯튃??Story 1.4?먮룄 ?곸슜?쒕떎. 利?branch-service???대뼚??setup/migration ?됱쐞???섏? ?딅뒗??
- **Story 1.1 ?뚭? 怨꾩빟**: `npm run build && npm test` ?쒗?? prebuilt `dist/devai-aidd-guard.js` ?섏〈?? legacy parity deepEqual 洹몃?濡??좎?.

### Git Intelligence Summary

- 理쒓렐 而ㅻ컠(`dfaf0d9`, `576fa74`, `110a0ac`, `e2bf242`, `3e4a1d9`)? 紐⑤몢 planning/sprint ?곗텧臾쇱씠硫??좉퇋 production 肄붾뱶 蹂寃쎌? ?녿떎. Story 1.1/1.2/1.3???곸슜??`src/` ?몃━(?뱁엳 `src/policies/legacy/devai-git-workflo.js` 蹂듭썝, audit no-op-hook 濡쒓렇, `dist/devai-aidd-guard.js` prebuilt 怨꾩빟)瑜??좊ː 媛?ν븳 異쒕컻?먯쑝濡??ъ슜?쒕떎.
- ?꾩옱 釉뚮옖移섎뒗 `codex/bmad/epic1/story1-1`?대떎. 蹂??ㅽ넗由ъ쓽 ?대뼡 task??git 釉뚮옖移??먮룞 蹂寃쎌쓣 ?몃━嫄고빐?쒕뒗 ???쒕떎(?대뒗 怨?Story 1.4媛 ?먭린 ?먯떊???몄텧?섎뒗 遺?몄뒪?몃옪 ?ъ씠?댁쓣 留뚮뱾吏 留먮씪????.

### Project Structure Notes

- ?꾪궎?띿쿂 臾몄꽌媛 紐낆떆??`src/services/git/` ?고븯???ㅻⅨ ?뚯씪??`git-workflow-service.js`, `git-executor.js`, `commit-service.js`, `push-service.js`)? 蹂??ㅽ넗由ъ뿉??留뚮뱾吏 ?딅뒗?? Story 1.4??`branch-service.js`留??꾩엯?섍퀬, ?섎㉧吏??Epic 2/Story 3.x媛 ?먯쭊?곸쑝濡??꾩엯?쒕떎.
- **Epic 2 ?뱀씤 ?먮쫫怨쇱쓽 寃쎄퀎**: 蹂??ㅽ넗由ъ쓽 ?곗텧臾쇱? proposal 媛앹껜 + ?뚰겕?뚮줈???곹깭??stashed ??`branchProposal` ?꾨뱶 + `git.action.planned` audit ?대깽?? ???뗭씠 ?꾨??? ?ъ슜?먯뿉寃?蹂댁뿬二쇰뒗 approval ?꾨＼?꾪듃, accept/deny/ignore 寃곌낵 泥섎━, retry/skip 蹂듦뎄 寃쎈줈 ????紐⑤뱺 寃껋? Epic 2 梨낆엫?대떎. Story 1.4媛 proposal??留뚮뱺 吏곹썑?먮뒗 ?대뼡 ?ъ슜???곹샇?묒슜??諛쒖깮?섏? ?딆쑝硫? ?ъ슜?먭? mutating tool???쒕룄?섎㈃ legacy core??湲곗〈 mutating-tool 媛?쒓? 洹몃?濡??숈옉?쒕떎(behavior 蹂寃??놁쓬).
- **Story 1.5 readiness???寃쎄퀎**: ?꾩옱 釉뚮옖移??앸퀎, ?먭꺽 議댁옱 ?щ? ?뺤씤, `git init` ?쒖븞? Story 1.5??梨낆엫. Story 1.4??`currentBranch`瑜??낅젰?쇰줈留?諛쏄퀬 吏곸젒 ?앸퀎?섏? ?딅뒗?? ?듯빀 ?④퀎?먯꽌 Story 1.5??readiness 寃곌낵媛 ?꾩쭅 ?놁쑝硫?`currentBranch: null`濡??몄텧?섍퀬 fallback ?숈옉(`isLongLived: false`, `action: "create"`)?쇰줈 ?덉쟾?섍쾶 ?숈옉?쒕떎.
- **?먮룞 mutate 湲덉???紐낆떆??媛??*: 蹂??ㅽ넗由ъ쓽 ?대뼡 肄붾뱶??git working tree, `.git/HEAD`, refs, ?먭꺽 ?ㅼ젙??蹂寃쏀븯吏 ?딅뒗?? 寃?좎옄??PR?먯꽌 `child_process` ?먮뒗 git CLI ?몄텧???덉쑝硫?利됱떆 嫄곗젅?댁빞 ?쒕떎.

### References

- Epic and story definition: [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: Compute Branch Strategy and Candidate Branch Names]
- Functional requirements: [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements] (FR3, FR5, FR6; NFR1, NFR3, NFR5, NFR13)
- Architecture target folder layout: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] (?뱁엳 `src/services/git/branch-service.js` 紐낆꽭)
- Architecture command/event ?⑦꽩: [Source: _bmad-output/planning-artifacts/architecture.md#Core Architectural Decisions ??API & Communication Patterns] (PrepareBranchCommand, `git.action.planned`)
- Architecture naming/event envelope: [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- Branch ?뺤콉 ?ㅼ? commandTypeMap: [Source: src/config/defaults.js] (line 2~45 ??`branch.pattern`, `defaultType`, `fallbackTicket`, `longLivedBranches`, `validationRegex`, `commandTypeMap`)
- Workflow policy 留ㅽ븨: [Source: src/config/defaults.js] (line 46~131 ??`workflowPolicy[commandName]`)
- Legacy core(behavioral baseline ?좎? ???: [Source: src/policies/legacy/devai-git-workflo.js] (line 96~111 ??mutating-tool 媛??硫붿떆吏)
- Bootstrap injection 吏?? [Source: src/index.js] (line 30~86 ??runtimeConfig 異붿텧, hook factory 議곕┰)
- Story 1.1 遺?몄뒪?몃옪 ?좊?: [Source: _bmad-output/implementation-artifacts/1-1-register-runtime-hooks-through-the-plugin-bootstrap.md]
- Story 1.2 ?뚰겕?뚮줈??而⑦뀓?ㅽ듃 ?낅젰 怨꾩빟: [Source: _bmad-output/implementation-artifacts/1-2-detect-bmad-workflow-commands-and-runtime-context.md]
- Sprint-change scope 寃쎄퀎(install/setup vs runtime): [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-05-08.md]
- Regression baseline: [Source: tests/regression.test.js]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm run build`
- `npm test`
- `npm run build; if ($LASTEXITCODE -eq 0) { npm test; exit $LASTEXITCODE } else { exit $LASTEXITCODE }`

### Completion Notes List

- Added `src/services/git/branch-service.js` with pure helpers for strategy evaluation, candidate branch naming, validation, and proposal building.
- Wired branch policy evaluation into `command.execute.before` and preserved legacy mutating-tool behavior.
- Stashed `branchProposal` into workflow state and emitted best-effort `git.action.planned` audit events only for applicable workflows.
- Expanded regression coverage for helper contracts, fallback/default-type naming, long-lived branch handling, planning no-op behavior, and non-workflow isolation.
- Verified the built bundle contains the new branch-planning path and `git.action.planned` logic.
- Resolved review finding [High]: `command.execute.before` now honors runtime-provided `currentBranch` input and optional resolver injection so integration coverage reaches both `switch` and long-lived `create` proposal paths.
- Resolved review finding [Medium]: invalid `branch.validationRegex` values are rejected during config validation and degrade to candidate validation failure without throwing during workflow startup.

### File List

- `_bmad-output/implementation-artifacts/1-4-compute-branch-strategy-and-candidate-branch-names.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/hooks/command-execute-before.js`
- `src/index.js`
- `src/config/validate-config.js`
- `src/services/git/branch-service.js`
- `tests/regression.test.js`

### Change Log

- 2026-05-08: Implemented Story 1.4 branch strategy planning, proposal stashing, audit emission, and regression coverage updates.
- 2026-05-08: Senior Developer Review (AI) completed; status returned to in-progress due to unresolved review findings.
- 2026-05-08: Addressed code review findings - 2 items resolved (runtime currentBranch integration and invalid regex hardening).
- 2026-05-08: Senior Developer Review (AI) follow-up completed; no open findings remain and story approved as done.

## Senior Developer Review (AI)

### Outcome

Approved

### Findings

No open findings. The previously identified `currentBranch` integration gap and invalid `branch.validationRegex` handling issue are resolved, and the reviewed implementation now satisfies both acceptance criteria.

### Validation

- `npm run build`
- `npm test`
