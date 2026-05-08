/**
 * consume-approval-outcome.js
 *
 * Single resolver responsible for closing the open `activeApproval` on a
 * session with a user-selected outcome (accept | deny | ignore-and-continue).
 *
 * Hook layer responsibilities:
 *   - parse the runtime payload into an outcome string
 *   - call `consumeApprovalOutcome` once
 *   - emit any returned audit events through the bootstrap audit logger
 *
 * This module owns:
 *   - validation of the requested transition,
 *   - workflow state mutation (clear active slot, append history, set
 *     `lastContinuationDecision`, advance the queue),
 *   - assembly of the audit event payloads.
 *
 * It does NOT execute git, write files, or interact with the runtime client.
 * Story 2.4 will read the resolution and decide whether to invoke the git
 * executor; Story 2.3 only records intent.
 */

import {
  APPROVAL_OUTCOMES,
  isValidOutcome,
  validateTransition,
} from "./approval-resolution-state.js";
import {
  buildApprovalResolution,
  buildApprovalResolvedAudit,
  buildGitActionSkippedAudit,
} from "./build-approval-resolution.js";

/**
 * @typedef {{
 *   outcome: "skip" | "resolved",
 *   reason?: string,
 *   resolution?: object,
 *   auditEvents?: object[],
 *   hadActiveApproval?: boolean
 * }} ConsumeApprovalOutcomeResult
 */

/**
 * Resolves the active approval for a session.
 *
 * Returns:
 *   - `{ outcome: "resolved", resolution, auditEvents, hadActiveApproval: true }`
 *     when the active approval transitioned to a terminal state.
 *   - `{ outcome: "skip", reason }` when the call is idempotent / no-op:
 *       * "no-active-approval"     — nothing pending for this session
 *       * "session-not-tracked"    — sessionID has no workflow state
 *       * "invalid-outcome"        — outcome string is unknown / pending
 *       * "session-mismatch"       — approval state stale (defensive)
 *       * "already-resolved"       — active approval is already terminal
 *
 * @param {{
 *   workflowState: { get: Function, set: Function },
 *   sessionID: string,
 *   outcome: string,
 *   sourceHook?: string,
 *   resolvedAt?: string,
 *   resolvedBy?: string | null,
 *   reasonCode?: string | null
 * }} params
 * @returns {ConsumeApprovalOutcomeResult}
 */
export function consumeApprovalOutcome({
  workflowState,
  sessionID,
  outcome,
  sourceHook = "permission.asked",
  resolvedAt,
  resolvedBy = null,
  reasonCode = null,
}) {
  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return { outcome: "skip", reason: "session-not-tracked" };
  }

  if (!isValidOutcome(outcome) || outcome === APPROVAL_OUTCOMES.PENDING) {
    return { outcome: "skip", reason: "invalid-outcome" };
  }

  const state = workflowState.get(sessionID);
  if (!state) {
    return { outcome: "skip", reason: "session-not-tracked" };
  }

  const request = state.approvalCurrent;
  if (!request) {
    return { outcome: "skip", reason: "no-active-approval" };
  }

  // Defensive: never resolve an approval that does not belong to this session.
  if (request.sessionID && request.sessionID !== sessionID) {
    return { outcome: "skip", reason: "session-mismatch" };
  }

  const transition = validateTransition(APPROVAL_OUTCOMES.PENDING, outcome);
  if (!transition.ok) {
    return { outcome: "skip", reason: transition.reason };
  }

  const resolution = buildApprovalResolution({
    request,
    outcome,
    sourceHook,
    resolvedAt,
    resolvedBy,
    reasonCode,
  });

  const historyEntry = {
    ...request,
    status: outcome,
    resolution,
    resolvedAt: resolution.resolvedAt,
  };
  const nextHistory = Array.isArray(state.approvalHistory)
    ? [...state.approvalHistory, historyEntry]
    : [historyEntry];

  // Queue head removal is the responsibility of the next planning pass
  // (`command.execute.before` → promote head into approvalCurrent). The
  // resolver only clears the active slot and records history/continuation —
  // never advances the queue itself. Active and queue head can share an
  // actionId only via test fixtures; in production they are decoupled by the
  // promotion gate (`candidateActionId !== activeActionId`).
  const nextPending = Array.isArray(state.pendingActions)
    ? state.pendingActions
    : [];

  workflowState.set(sessionID, {
    ...state,
    approvalCurrent: null,
    approvalHistory: nextHistory,
    pendingActions: nextPending,
    lastContinuationDecision: {
      approvalId: resolution.approvalId,
      actionId: resolution.actionId,
      outcome: resolution.status,
      continuation: resolution.continuation,
      resolvedAt: resolution.resolvedAt,
      sourceHook: resolution.sourceHook,
    },
  });

  const auditEvents = [
    buildApprovalResolvedAudit({
      request,
      resolution,
      hadActiveApproval: true,
      timestamp: resolution.resolvedAt,
    }),
  ];
  const skipAudit = buildGitActionSkippedAudit({
    request,
    resolution,
    timestamp: resolution.resolvedAt,
  });
  if (skipAudit) {
    auditEvents.push(skipAudit);
  }

  return {
    outcome: "resolved",
    resolution,
    auditEvents,
    hadActiveApproval: true,
  };
}
