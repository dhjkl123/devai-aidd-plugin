import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";

export function createToolExecuteAfterHook(legacyHandlers, { workflowState } = {}) {
  return async (input, output) => {
    advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");

    const handler = legacyHandlers["tool.execute.after"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
