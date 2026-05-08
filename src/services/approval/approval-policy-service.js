/**
 * approval-policy-service.js
 *
 * Pure functions: evaluate whether a new approval request can be published
 * from the current workflow state. No I/O or side-effects.
 *
 * Exported API:
 *   getPendingApproval(state)     → existing pending ApprovalRequest or null
 *   selectNextPlannedAction(state) → first unresolved proposal or null
 *   evaluateRequestGate(state)    → { outcome: "allow" | "skip", reason }
 *
 * Priority order for selectNextPlannedAction:
 *   1. initProposal
 *   2. branchProposal
 *   (future: commitProposal, pushProposal — added by Story 3.x)
 */

/**
 * Returns the current pending approval request from state, or null.
 *
 * @param {{ approvalCurrent?: object | null }} state
 * @returns {object | null}
 */
export function getPendingApproval(state) {
  if (!state || state.approvalCurrent == null) {
    return null;
  }
  return state.approvalCurrent;
}

/**
 * Selects the highest-priority unresolved planned action from state.
 * Priority:
 *   0. pendingActions[0].proposal — Story 2.3 queue head promotion. When the
 *      previous active approval has been resolved, the next planning pass
 *      must surface the FIFO queue head ahead of any newly-recomputed
 *      init/branch proposal so queued actions are not lost.
 *   1. initProposal
 *   2. branchProposal
 *
 * @param {{
 *   pendingActions?: Array<{ proposal?: object } | null>,
 *   initProposal?: object | null,
 *   branchProposal?: object | null
 * }} state
 * @returns {object | null}
 */
export function selectNextPlannedAction(state) {
  if (!state) {
    return null;
  }

  // Priority 0: queue head (Story 2.3 promotion path).
  if (Array.isArray(state.pendingActions) && state.pendingActions.length > 0) {
    const head = state.pendingActions[0];
    if (head?.proposal && typeof head.proposal === "object") {
      return head.proposal;
    }
  }

  // Priority 1: initProposal
  if (state.initProposal && typeof state.initProposal === "object") {
    return state.initProposal;
  }

  // Priority 2: branchProposal
  if (state.branchProposal && typeof state.branchProposal === "object") {
    return state.branchProposal;
  }

  // Future: commitProposal, pushProposal (Story 3.x)

  return null;
}

/**
 * Evaluates whether a new approval request can be issued.
 *
 * Returns:
 *   { outcome: "allow", reason: "ready-to-publish" }
 *     — new request can be published
 *   { outcome: "skip", reason: "approval-already-pending" }
 *     — an existing pending request exists; do not issue a new one
 *   { outcome: "skip", reason: "no-planned-git-action" }
 *     — no proposal is available to convert into a request
 *
 * @param {{ approvalCurrent?: object | null, initProposal?: object, branchProposal?: object }} state
 * @returns {{ outcome: "allow" | "skip", reason: string }}
 */
export function evaluateRequestGate(state) {
  const pending = getPendingApproval(state);
  if (pending !== null) {
    return { outcome: "skip", reason: "approval-already-pending" };
  }

  const nextAction = selectNextPlannedAction(state);
  if (nextAction === null) {
    return { outcome: "skip", reason: "no-planned-git-action" };
  }

  return { outcome: "allow", reason: "ready-to-publish" };
}
