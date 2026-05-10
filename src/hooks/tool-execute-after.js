/**
 * tool-execute-after.js
 *
 * Wrapper hook for `tool.execute.after`. Handles `finish`-tool finalization
 * gating + finish-phase approval publication, and otherwise advances
 * workflow phase. For mutating tools, advances phase to `"mutating"` so the
 * single workflow `phase` field is the source of truth (no separate
 * `lifecycle` field).
 */

import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";
import { evaluateWorkflowFinalization } from "../services/workflow/evaluate-workflow-finalization.js";
import { publishNextPlannedAction } from "../services/approval/publish-next-planned-action.js";
import { MUTATING_TOOLS } from "../services/workflow/mutating-tools.js";

export function createToolExecuteAfterHook(
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
      // Story 3.2 review (MEDIUM): only publish a finish-phase approval when
      // finalization actually produced a finishable proposal. When the
      // assessment short-circuits (no-finalizable-outputs / finalization-not-
      // forced / etc.), `selectNextPlannedAction` could otherwise surface a
      // stale `branchProposal` and re-emit `approval.requested` for a branch
      // approval that finish was never supposed to ask about.
      const hasFinalizationProposal =
        finishedState?.commitProposal != null || finishedState?.pushProposal != null;
      const shouldPublishFinishApproval =
        Boolean(finishedState?.commandName) &&
        (assessment?.outcome === "allow" || hasFinalizationProposal);
      if (shouldPublishFinishApproval) {
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
    } else if (MUTATING_TOOLS.has(input?.tool)) {
      advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "mutating");
    } else {
      advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");
    }
  };
}
