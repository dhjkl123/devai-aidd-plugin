export const DISPLAY_NAME = "DevAI AIDD Plugin";
export const PRODUCT_NAME = "DevAI AIDD Guard";
export const PACKAGE_NAME = "devai-aidd-guard";
export const DIST_FILE_NAME = "devai-aidd-guard.js";
export const GLOBAL_CONFIG_FILE_NAME = "devai-aidd-guard.global.jsonc";
export const PROJECT_CONFIG_FILE_NAME = "devai-aidd-guard.project.jsonc";
export const LEGACY_PROJECT_CONFIG_FILE_NAME = "opencode-aidd-plugin.json";
export const LEGACY_WORKFLOW_PROJECT_CONFIG_FILE_NAME = "devai-git-workflow.json";
export const GLOBAL_CONFIG_DIR = ".config/opencode";
export const PROJECT_CONFIG_DIR = ".opencode";
export const LEGACY_PLUGIN_SERVICE_NAME = "opencode-aidd-plugin";
export const PLUGIN_SERVICE_NAME = "devai-aidd-guard";
export const LEGACY_STATE_DIRECTORY_NAME = "opencode-aidd-plugin";
export const STATE_DIRECTORY_NAME = "devai-aidd-guard";
export const LEGACY_COMPAT_MARKER_FILE_NAME = ".devai-aidd-guard.compat.generated";

// ────────────────────────────────────────────────────────────────────────────
// Story 4.3 — BMAD command compatibility contract (single source of truth)
// ────────────────────────────────────────────────────────────────────────────
//
// These two frozen tuples express the wrapper ↔ legacy compatibility contract
// for Epic 4 (FR29 — "사용자는 기존 BMAD 핵심 workflow command를 변경 없이
// 계속 사용할 수 있어야 한다"). Story 4.5 will reference the SAME exports so
// regression coverage validates the contract from a single source.
//
// Type note (Story 4.3 R2): both exports are `Object.freeze([...])` — i.e.
// frozen Arrays, not Set instances. Treat them as iterable tuples; if a
// consumer needs set semantics (membership tests, set equality, key-order
// independence) it should construct a Set locally:
//   `const supported = new Set(SUPPORTED_HOOK_KEYS);`
// Keeping the export as a frozen Array makes the contract trivially
// JSON-serialisable for audit payloads and lets `Array.prototype.filter`
// callers (see `src/index.js` no-op derivation) operate without conversion.
//
// SUPPORTED_HOOK_KEYS — the 6 hook keys returned by `DevaiAiddGuardPlugin`
//   bootstrap. Names, count, and the `async (input, output?) => any` shape of
//   these handlers ARE the external plugin contract; renaming, dropping, or
//   adding a key is a contract break.
//
// WRAPPER_ONLY_HOOK_KEYS — the 2 keys with NO matching legacy core handler.
//   These hooks intentionally have no "legacy-equivalent" behavior; they
//   carry wrapper-only responsibilities (approval ingress / recovery routing
//   for `permission.asked`; touched-file tracking for `file.edited`). They
//   MUST stay deterministic no-ops when wrapper-side responsibilities are
//   absent or fail (no throws bubble out to the runtime), and the
//   `plugin bootstrap registered no-op hooks` audit emission documents that
//   asymmetry once at bootstrap.
//
// Anything outside SUPPORTED_HOOK_KEYS \ WRAPPER_ONLY_HOOK_KEYS — i.e. the
// 4 keys also implemented by the frozen legacy core
// (`src/policies/legacy/devai-git-workflo.js`) — is "wrapper composes the
// legacy behavior; legacy text/messages are forwarded byte-for-byte".
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
