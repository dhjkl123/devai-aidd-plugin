/**
 * tool-execute-before.js
 *
 * Story 4.3 — THIN WRAPPER over the legacy `tool.execute.before` handler.
 * The wrapper advances workflow phase to `in-progress` and then ALWAYS
 * delegates to `legacyHandlers["tool.execute.before"]` as the LAST step.
 * The legacy handler is responsible for throwing the mutating-tool guard
 * message (`"Git workflow guard: create or switch to branch \`workflow\`
 * before editing files for /<command>."`); the wrapper MUST NOT swallow,
 * rewrite, or replace that message. Story 4.5 regression compares
 * `wrapperError.message === legacyError.message` to enforce the invariant.
 */

import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";

export function createToolExecuteBeforeHook(legacyHandlers, { workflowState } = {}) {
  return async (input, output) => {
    advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");

    const handler = legacyHandlers["tool.execute.before"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
