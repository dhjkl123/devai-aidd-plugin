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
//   - `normalizeConfig` in `src/config/load-config.js` fills `branch.pattern`,
//     `branch.defaultType`, `branch.fallbackTicket`, `branch.validationRegex`
//     when missing (`SAFE_BRANCH_DEFAULTS`), coerces `branch.commandTypeMap`
//     to `{}`, and dedupes `branch.longLivedBranches`.
//   - `normalizeBranchConfig` in `src/services/git/branch-service.js` provides
//     the same defensive shape for direct callers that bypass loadRuntimeConfig.
//   - `buildSafeDefaultPolicy` in `src/services/workflow/resolve-workflow-policy.js`
//     returns a fallback policy shape (`branchRequired: false`,
//     `finalization: "no-forced-finalization"`) when a command has no entry
//     in the merged workflowPolicy.
//
// Top-level keys are kept as empty containers so deep-merge consumers can
// rely on `config.branch`, `config.workflowPolicy`, `config.audit`,
// `config.debug` always being non-null objects.
export const DEFAULT_PLUGIN_CONFIG = {
  branch: {},
  workflowPolicy: {},
  audit: {},
  debug: {},
};
