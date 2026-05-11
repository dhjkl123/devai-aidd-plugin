/**
 * plan-branch-proposal.js
 *
 * Shared branch-planning helper extracted from `command-execute-before.js`
 * so both the initial workflow-start path AND the post-baseline-commit chain
 * (in `execute-approved-action.js`) can compute a branch proposal in one place.
 *
 * Responsibilities:
 *   - run `evaluateBranchStrategy` against the supplied workflow context/policy
 *   - if a branch action is needed, compute the candidate name and proposal
 *   - persist the proposal to `workflowState.branchProposal`
 *   - emit a best-effort `git.action.planned` audit event
 *
 * Out of scope: this helper does NOT call `publishNextPlannedAction`. Caller
 * decides whether/when to publish so the helper can be reused in a chain
 * where push and branch proposals are seeded together before one publish call.
 *
 * Returned shape: `{ proposal, strategy }` — `proposal` is `null` when no
 * branch action is required ("unnecessary" strategy or builder returned null).
 */

import {
  buildBranchProposal,
  computeCandidateBranchName,
  evaluateBranchStrategy,
} from "./branch-service.js";

/**
 * @param {{
 *   workflowContext: { sessionID: string, commandName?: string, [k: string]: unknown },
 *   workflowPolicy?: object|null,
 *   branchConfig?: object|null,
 *   currentBranch?: string|null,
 *   workflowState: { get: Function, set: Function },
 *   audit?: object|null,
 * }} params
 */
export async function planBranchProposal({
  workflowContext,
  workflowPolicy = null,
  branchConfig = null,
  currentBranch = null,
  workflowState,
  audit = null,
} = {}) {
  if (!workflowState || !workflowContext?.sessionID) {
    return { proposal: null, strategy: null };
  }

  const strategy = evaluateBranchStrategy({
    workflowContext,
    workflowPolicy,
    branchConfig,
    currentBranch,
  });

  if (strategy.requirement === "unnecessary") {
    return { proposal: null, strategy };
  }

  const candidateName = computeCandidateBranchName({
    workflowContext,
    workflowPolicy,
    branchConfig,
  });
  const proposal = buildBranchProposal({
    strategy,
    candidateName,
    currentBranch,
  });

  if (!proposal) {
    return { proposal: null, strategy };
  }

  workflowState.set(workflowContext.sessionID, {
    ...workflowState.get(workflowContext.sessionID),
    branchProposal: proposal,
  });

  if (audit) {
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
          isLongLived: strategy.isLongLived,
        },
      });
    } catch {
      // best-effort
    }
  }

  return { proposal, strategy };
}
