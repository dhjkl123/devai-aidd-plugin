/**
 * tool-execute-after.js
 *
 * Story 4.3 — THIN WRAPPER over the legacy `tool.execute.after` handler.
 * The wrapper handles `finish`-tool finalization gating and phase advancement
 * for non-finish tools, then ALWAYS delegates to
 * `legacyHandlers["tool.execute.after"]` as the LAST step. The legacy handler
 * mutates `state.lifecycle = "mutating"` for tracked sessions on mutating
 * tools; the wrapper MUST keep that delegation order so legacy state mirrors
 * wrapper state.
 *
 * Finalization-gating asymmetry note (Story 4.3 R2): the `finish`-tool
 * finalization gating + finish-phase approval publication implemented below
 * is a WRAPPER-ONLY responsibility added by Epic 3. The legacy core's
 * `tool.execute.after` is a no-op for the `finish` tool (`finish` is not in
 * the legacy `MUTATING_TOOLS` set), so this wrapper-side addition does NOT
 * break the byte-for-byte parity invariant — Story 4.5's `legacy-vs-wrapper`
 * comparison still observes legacy === wrapper for tracked-session lifecycle
 * mutations on mutating tools, and the finish-tool path simply has no
 * legacy counterpart to compare against.
 */

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
