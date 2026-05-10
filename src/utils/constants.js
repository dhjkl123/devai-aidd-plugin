export const DISPLAY_NAME = "DevAI AIDD Plugin";
export const PRODUCT_NAME = "DevAI AIDD Plugin";
export const PACKAGE_NAME = "devai-aidd-plugin";
export const DIST_FILE_NAME = "devai-aidd-plugin.js";
export const GLOBAL_CONFIG_FILE_NAME = "devai-aidd-plugin.global.jsonc";
export const PROJECT_CONFIG_FILE_NAME = "devai-aidd-plugin.project.jsonc";
export const GLOBAL_CONFIG_DIR = ".config/opencode";
export const PROJECT_CONFIG_DIR = ".opencode";
export const PLUGIN_SERVICE_NAME = "devai-aidd-plugin";
export const STATE_DIRECTORY_NAME = "devai-aidd-plugin";

// ────────────────────────────────────────────────────────────────────────────
// BMAD command compatibility contract (single source of truth)
// ────────────────────────────────────────────────────────────────────────────
//
// SUPPORTED_HOOK_KEYS — the 6 hook keys returned by `DevaiAiddGuardPlugin`
//   bootstrap. Names, count, and the `async (input, output?) => any` shape of
//   these handlers ARE the external plugin contract; renaming, dropping, or
//   adding a key is a contract break.
//
// WRAPPER_ONLY_HOOK_KEYS — exported for traceability so consumers can express
//   the historical asymmetry between approval/file-tracking hooks and the
//   command/tool/session lifecycle hooks. The wrapper itself implements all 6
//   keys directly.
export const SUPPORTED_HOOK_KEYS = Object.freeze([
  "command.execute.before",
  "tool.execute.before",
  "tool.execute.after",
  "permission.asked",
  "file.edited",
  "event",
]);

export const WRAPPER_ONLY_HOOK_KEYS = Object.freeze([
  "permission.asked",
  "file.edited",
]);
