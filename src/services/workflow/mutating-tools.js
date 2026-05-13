/**
 * src/services/workflow/mutating-tools.js
 *
 * Single source of truth for mutating-tool names.
 *
 * Element values identify file-changing tools whose completed execution should
 * advance workflow phase to "mutating" in `tool.execute.after`.
 */

export const MUTATING_TOOLS = Object.freeze(new Set(["edit", "write", "patch", "multiedit"]));
