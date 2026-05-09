import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";
import { evaluateWorkflowFinalization } from "../services/workflow/evaluate-workflow-finalization.js";
import { publishNextPlannedAction } from "../services/approval/publish-next-planned-action.js";

export function createToolExecuteAfterHook(
  legacyHandlers,
  { workflowState, audit, pluginContext } = {},
) {
  return async (input, output) => {
    if (input?.tool === "finish") {
      const assessment = await evaluateWorkflowFinalization({
        workflowState,
        sessionID: input?.sessionID,
        input,
        output,
        audit,
        pluginContext,
      });
      const finishedState = workflowState?.get?.(input?.sessionID) ?? null;
      if (assessment && finishedState?.commandName) {
        const workflowContext = {
          commandName: finishedState.commandName,
          arguments: finishedState.arguments || "",
          sessionID: input?.sessionID,
          detectedAt: finishedState.detectedAt,
          phase: finishedState.phase || "finish",
        };
        const resolvedPolicy = pluginContext?.resolvePolicy?.(workflowContext);
        const workflowPolicy =
          resolvedPolicy?.outcome === "allow" ? resolvedPolicy.details?.policy || null : null;
        await publishNextPlannedAction({
          workflowState,
          workflowContext,
          workflowPolicy,
          audit,
          pluginContext,
        });
      }
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
