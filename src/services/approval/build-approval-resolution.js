/**
 * build-approval-resolution.js
 *
 * Pure helpers that turn a (request, outcome) pair into:
 *   1. the canonical resolution result envelope stored in workflowState and
 *      passed back to the runtime,
 *   2. the `approval.resolved` audit payload,
 *   3. the `git.action.skipped` audit payload (only when the outcome is
 *      `deny` or `ignore-and-continue`).
 *
 * No I/O. The hook layer is responsible for emitting the audit payload and
 * the resolver is responsible for state mutation.
 *
 * Story 2.3 boundary:
 *   - `accept` records the executor hand-off intent only. Story 2.4 owns the
 *     actual git execution and its success/failure classification.
 *   - `deny` and `ignore-and-continue` produce a `git.action.skipped` event
 *     with distinct `reason` codes so audit consumers can tell them apart.
 */

import {
  APPROVAL_OUTCOMES,
  continuationFor,
  skipReasonFor,
} from "./approval-resolution-state.js";

/**
 * Reduces an actionType like "branch/create" to its kind segment ("branch").
 * Pure utility so the resolution payloads carry a coarse `actionKind` while
 * the existing `actionType` remains intact on the request itself.
 *
 * @param {string | null | undefined} actionType
 * @returns {string | null}
 */
export function deriveActionKind(actionType) {
  if (typeof actionType !== "string" || actionType.length === 0) {
    return null;
  }
  const slashIndex = actionType.indexOf("/");
  return slashIndex === -1 ? actionType : actionType.slice(0, slashIndex);
}

/**
 * Builds the canonical resolution envelope.
 *
 * @param {{
 *   request: object,
 *   outcome: string,
 *   sourceHook?: string,
 *   resolvedAt?: string,
 *   resolvedBy?: string | null,
 *   reasonCode?: string | null
 * }} params
 * @returns {{
 *   approvalId: string,
 *   actionId: string,
 *   sessionID: string,
 *   actionKind: string | null,
 *   actionType: string | null,
 *   status: string,
 *   previousStatus: "pending",
 *   continuation: string | null,
 *   resolvedAt: string,
 *   resolvedBy: string | null,
 *   sourceHook: string,
 *   reasonCode: string | null,
 *   metadata: { phase: string | null, workflow: string | null, command: string | null }
 * }}
 */
export function buildApprovalResolution({
  request,
  outcome,
  sourceHook = "permission.asked",
  resolvedAt,
  resolvedBy = null,
  reasonCode = null,
}) {
  const ts = resolvedAt || new Date().toISOString();
  return {
    approvalId: request?.id ?? null,
    actionId: request?.actionId ?? request?.id ?? null,
    sessionID: request?.sessionID ?? null,
    actionKind: deriveActionKind(request?.actionType),
    actionType: request?.actionType ?? null,
    status: outcome,
    previousStatus: APPROVAL_OUTCOMES.PENDING,
    continuation: continuationFor(outcome),
    resolvedAt: ts,
    resolvedBy,
    sourceHook,
    reasonCode,
    metadata: {
      phase: request?.phase ?? null,
      workflow: request?.workflow ?? null,
      command: request?.command ?? null,
    },
  };
}

/**
 * Builds the `approval.resolved` audit payload.
 *
 * @param {{
 *   request: object,
 *   resolution: object,
 *   hadActiveApproval?: boolean,
 *   timestamp?: string
 * }} params
 * @returns {object}
 */
export function buildApprovalResolvedAudit({
  request,
  resolution,
  hadActiveApproval = true,
  timestamp,
}) {
  return {
    event: "approval.resolved",
    timestamp: timestamp || resolution.resolvedAt || new Date().toISOString(),
    workflow: request?.workflow ?? null,
    command: request?.command ?? null,
    sessionID: request?.sessionID ?? null,
    approvalId: resolution.approvalId,
    actionId: resolution.actionId,
    outcome: resolution.status,
    details: {
      actionKind: resolution.actionKind,
      actionType: resolution.actionType,
      continuation: resolution.continuation,
      phase: resolution.metadata.phase,
      sourceHook: resolution.sourceHook,
      hadActiveApproval,
    },
  };
}

/**
 * Builds the `git.action.skipped` audit payload. Returns null for outcomes
 * that do not produce a skip event (currently `accept`).
 *
 * @param {{ request: object, resolution: object, timestamp?: string }} params
 * @returns {object | null}
 */
export function buildGitActionSkippedAudit({ request, resolution, timestamp }) {
  const reason = skipReasonFor(resolution.status);
  if (!reason) {
    return null;
  }
  return {
    event: "git.action.skipped",
    timestamp: timestamp || resolution.resolvedAt || new Date().toISOString(),
    workflow: request?.workflow ?? null,
    command: request?.command ?? null,
    sessionID: request?.sessionID ?? null,
    actionId: resolution.actionId,
    outcome: resolution.status,
    details: {
      actionKind: resolution.actionKind,
      actionType: resolution.actionType,
      reason,
      continuation: resolution.continuation,
    },
  };
}
