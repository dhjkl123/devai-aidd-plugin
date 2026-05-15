export const DISPLAY_NAME = "DevAI AIDD Plugin";
export const PRODUCT_NAME = "DevAI AIDD Plugin";
export const PACKAGE_NAME = "devai-aidd-plugin";
export const DIST_FILE_NAME = "devai-aidd-plugin.js";
export const GLOBAL_CONFIG_FILE_NAME = "devai-aidd-plugin.global.jsonc";
export const PROJECT_CONFIG_FILE_NAME = "devai-aidd-plugin.project.jsonc";
export const GLOBAL_CONFIG_DIR = ".config/opencode";
export const PROJECT_CONFIG_DIR = ".opencode";
export const SKILLS_SUBDIR = "skills";

// opencode-skill-workflow-guard: tool-name candidates emitted by the opencode
// runtime when a Skill is invoked by the model. The token shape is unconfirmed
// at the SDK version we target — the first release ships diagnostic logging
// and uses case-insensitive matching against this set. After D1 capture (see
// tech-spec) the set will be narrowed.
export const SKILL_TOOL_TOKENS = Object.freeze(
  new Set(["skill", "launch-skill", "invokeskill"]),
);
export const PLUGIN_SERVICE_NAME = "devai-aidd-plugin";
export const STATE_DIRECTORY_NAME = "devai-aidd-plugin";

// ────────────────────────────────────────────────────────────────────────────
// Native plugin contract (opencode .opencode/plugins runtime)
// ────────────────────────────────────────────────────────────────────────────
//
// Under the native opencode plugin runtime, the load-bearing entrypoint is the
// single `event` handler that routes all session/command/question/recovery
// signals via `event.type`. The native router (see `src/hooks/native-event.js`)
// is what makes the plugin work when bundled into `.opencode/plugins`.
//
// `SUPPORTED_HOOK_KEYS` remains the canonical native plugin surface list.
// surface and regression tests (Story 4.5 src/dist parity) intact. The legacy
// named handlers (`command.execute.before`, `tool.execute.before`,
// `tool.execute.after`, `permission.asked`) are now **compatibility-only**
// ingress points retained for the in-process test harness and any non-native
// invocation path; they are NOT required for native opencode operation.
//
// `file.edited` was removed when workflow finalization switched to a single
// git-status source — the opencode runtime publishes `file.edited` events
// without sessionID, so the handler could not attribute edits to a session.
export const SUPPORTED_HOOK_KEYS = Object.freeze([
  "tool",
  "command.execute.before",
  "tool.execute.before",
  "tool.execute.after",
  "permission.asked",
  "event",
]);

// Native event types the `event` handler routes. Anything not listed is a
// silent no-op so unrelated runtime events cannot mutate workflow state.
export const NATIVE_EVENT_TYPES = Object.freeze([
  "question.asked",
  "question.replied",
  "question.rejected",
  "command.executed",
  "session.deleted",
]);

// Kept for legacy traceability — these named handlers were historically the
// wrapper-only asymmetry surface relative to the rest of the lifecycle hooks.
// Under native operation they remain available as compatibility shims.
export const WRAPPER_ONLY_HOOK_KEYS = Object.freeze([
  "permission.asked",
]);
