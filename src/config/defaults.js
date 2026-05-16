// DEFAULT_PLUGIN_CONFIG carries NO field values.
//
// All tunable defaults that used to live here have been promoted into the
// installer-shipped templates:
//   - branch.* (pattern/defaultType/fallbackTicket/longLivedBranches/
//     defaultMergeTarget/validationRegex/commandTypeMap)
//                                  → templates/devai-aidd-plugin.global.jsonc
//   - audit.*                      → templates/devai-aidd-plugin.global.jsonc
//   - debug.*                      → templates/devai-aidd-plugin.global.jsonc
//   - workflowPolicy.<command>     → templates/devai-aidd-plugin.project.jsonc
//
// Code-side safety nets remain:
//   - The bundled merged project template (shared base + project override)
//     is embedded into the JS bundle at build time as `BASELINE_TEMPLATE_TEXT`
//     and merged in as a "Layer 0" baseline by `validateAndRecover` in
//     `src/config/load-config.js`. This supplies branch.pattern,
//     branch.defaultType, branch.fallbackTicket, branch.validationRegex,
//     branch.commandTypeMap, audit.*, and debug.* even when no JSONC has
//     been installed yet.
//   - `normalizeConfig` in `src/config/load-config.js` ALWAYS unions
//     `branch.longLivedBranches` with `["main", "master"]` (universal across
//     teams — a user can ADD branches but cannot remove these two), coerces
//     non-string `branch.validationRegex` to `""`, coerces non-object
//     `branch.commandTypeMap` to `{}`, and dedupes `branch.longLivedBranches`.
//   - `normalizeBranchConfig` in `src/services/git/branch-service.js` provides
//     the same defensive shape for direct callers that bypass
//     loadRuntimeConfig, sourcing pattern/defaultType/fallbackTicket from the
//     baseline (via `BASELINE_BRANCH_CONFIG`) and keeping
//     `longLivedBranches: ["main", "master"]` hardcoded.
//   - `buildSafeDefaultPolicy` in `src/services/workflow/resolve-workflow-policy.js`
//     returns a fallback policy shape (`branchRequired: false`,
//     `finalization: "no-forced-finalization"`) when a command has no entry
//     in the merged workflowPolicy.
//
// Top-level keys are kept as empty containers so deep-merge consumers can
// rely on `config.branch`, `config.workflowPolicy`, `config.audit`,
// `config.debug`, and `config.readiness` always being non-null objects.
export const DEFAULT_PLUGIN_CONFIG = {
  branch: {},
  workflowPolicy: {},
  audit: {},
  debug: {},
  readiness: {},
};
