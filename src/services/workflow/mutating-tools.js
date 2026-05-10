/**
 * src/services/workflow/mutating-tools.js
 *
 * Single source of truth for mutating-tool and safe-read-tool name sets.
 * Both `tool.execute.before` and `tool.execute.after` import from here so
 * the two hook factories cannot drift.
 *
 * Element values are the canonical guard sets used by the wrapper
 * `tool.execute.before` and `tool.execute.after` hooks.
 */

export const MUTATING_TOOLS = Object.freeze(new Set(["edit", "write", "patch", "multiedit"]));

export const SAFE_READ_TOOLS = Object.freeze(
  new Set([
    "read",
    "glob",
    "grep",
    "list",
    "lsp",
    "webfetch",
    "websearch",
    "codesearch",
    "skill",
    "todoread",
  ]),
);
