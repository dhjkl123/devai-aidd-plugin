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
