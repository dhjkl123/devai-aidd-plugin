/**
 * Shared branch-planning helper so both the initial workflow-start path and
 * the post-baseline-commit path can compute a branch proposal in one place.
 *
 * Returned shape: `{ proposal, strategy, decision }`.
 */

import { resolveBranchPlanning } from "./resolve-branch-planning.js";

export async function planBranchProposal({
  workflowContext,
  workflowPolicy = null,
  branchConfig = null,
  currentBranch = null,
  workflowState,
  pluginContext = null,
  audit = null,
} = {}) {
  if (!workflowState || !workflowContext?.sessionID) {
    return { proposal: null, strategy: null, decision: null };
  }

  const { proposal, strategy, decision } = await resolveBranchPlanning({
    workflowContext,
    workflowPolicy,
    branchConfig,
    currentBranch,
    workflowState,
    pluginContext,
    audit,
  });

  if (proposal && audit) {
    try {
      await audit.info("git.action.planned", {
        event: "git.action.planned",
        timestamp: new Date().toISOString(),
        workflow: workflowContext.commandName,
        command: workflowContext.commandName,
        sessionID: workflowContext.sessionID,
        details: {
          kind: "branch",
          action: proposal.action,
          name: proposal.name,
          reason: proposal.reason,
          isLongLived: strategy?.isLongLived === true,
          decisionSource: decision?.source ?? "deterministic",
          decisionConclusion: decision?.conclusion ?? null,
        },
      });
    } catch {
      // best-effort
    }
  }

  return { proposal, strategy, decision };
}
