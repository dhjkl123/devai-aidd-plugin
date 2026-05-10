/**
 * tool-execute-before.js
 *
 * Wrapper hook for `tool.execute.before`. Advances workflow phase to
 * `in-progress` for tracked sessions and throws the mutating-tool guard
 * message when a mutating tool is requested while the workflow guard is
 * active. The throw message is a frozen contract string — renaming or
 * rewording it is a contract break (Story 4.5 regression compares it
 * byte-for-byte).
 */

import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";
import { MUTATING_TOOLS, SAFE_READ_TOOLS } from "../services/workflow/mutating-tools.js";

export function createToolExecuteBeforeHook({ workflowState } = {}) {
  return async (input) => {
    advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");

    const state = workflowState?.get?.(input?.sessionID);
    if (state && state.commandName && input?.tool) {
      if (input.tool === "question" || SAFE_READ_TOOLS.has(input.tool)) {
        // safe — no guard
      } else if (MUTATING_TOOLS.has(input.tool)) {
        throw new Error(
          `Git workflow guard: create or switch to branch \`workflow\` before editing files for /${state.commandName}.`,
        );
      }
    }
  };
}
