import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";
import { evaluateWorkflowFinalization } from "../services/workflow/evaluate-workflow-finalization.js";

export function createToolExecuteAfterHook(
  legacyHandlers,
  { workflowState, audit, pluginContext } = {},
) {
  return async (input, output) => {
    if (input?.tool === "finish") {
      await evaluateWorkflowFinalization({
        workflowState,
        sessionID: input?.sessionID,
        input,
        output,
        audit,
        pluginContext,
      });
    } else {
      advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");
    }

    const handler = legacyHandlers["tool.execute.after"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
