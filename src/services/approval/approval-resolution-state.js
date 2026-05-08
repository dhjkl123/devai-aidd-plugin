/**
 * approval-resolution-state.js
 *
 * Pure constants and helpers describing the Story 2.3 approval lifecycle.
 * Imported by `consume-approval-outcome.js`, `build-approval-resolution.js`,
 * and the permission-asked hook so the plugin has a single source of truth
 * for outcome strings, terminal status, and continuation semantics.
 *
 * The state machine is:
 *
 *   planned -> pending -> accept
 *                      -> deny
 *                      -> ignore-and-continue
 *
 *   - planned                : queue item exists, no approval request yet.
 *   - pending                : `activeApproval` published, awaiting user.
 *   - accept                 : terminal. Executor hand-off allowed.
 *   - deny                   : terminal. Repository mutation forbidden.
 *   - ignore-and-continue    : terminal. Skipped; workflow advances.
 *
 * Continuation semantics:
 *
 *   accept                  -> "execute-now"
 *   deny                    -> "continue-without-action"
 *   ignore-and-continue     -> "continue-without-action"
 *
 * Story 2.3 only records resolution. Actual `services/git` execution and
 * failure taxonomy belong to Story 2.4/2.5.
 */

export const APPROVAL_OUTCOMES = Object.freeze({
  PENDING: "pending",
  ACCEPT: "accept",
  DENY: "deny",
  IGNORE_AND_CONTINUE: "ignore-and-continue",
});

export const APPROVAL_OUTCOME_VALUES = Object.freeze([
  APPROVAL_OUTCOMES.PENDING,
  APPROVAL_OUTCOMES.ACCEPT,
  APPROVAL_OUTCOMES.DENY,
  APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE,
]);

export const TERMINAL_OUTCOMES = Object.freeze([
  APPROVAL_OUTCOMES.ACCEPT,
  APPROVAL_OUTCOMES.DENY,
  APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE,
]);

export const CONTINUATION = Object.freeze({
  EXECUTE_NOW: "execute-now",
  CONTINUE_WITHOUT_ACTION: "continue-without-action",
});

export const APPROVAL_RESOLUTION_REASONS = Object.freeze({
  APPROVAL_DENIED: "approval-denied",
  APPROVAL_IGNORED: "approval-ignored",
});

/**
 * @param {string} outcome
 * @returns {boolean}
 */
export function isTerminalOutcome(outcome) {
  return TERMINAL_OUTCOMES.includes(outcome);
}

/**
 * @param {string} outcome
 * @returns {boolean}
 */
export function isValidOutcome(outcome) {
  return APPROVAL_OUTCOME_VALUES.includes(outcome);
}

/**
 * Maps a terminal outcome to its continuation marker. The runtime never
 * blocks workflow progress on `deny` or `ignore-and-continue`; both
 * collapse to "continue-without-action" while preserving the distinction
 * in audit/state for traceability.
 *
 * @param {string} outcome
 * @returns {"execute-now" | "continue-without-action" | null}
 */
export function continuationFor(outcome) {
  if (outcome === APPROVAL_OUTCOMES.ACCEPT) {
    return CONTINUATION.EXECUTE_NOW;
  }
  if (
    outcome === APPROVAL_OUTCOMES.DENY ||
    outcome === APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE
  ) {
    return CONTINUATION.CONTINUE_WITHOUT_ACTION;
  }
  return null;
}

/**
 * Maps a terminal skip outcome to its `git.action.skipped` reason code.
 * Only deny/ignore-and-continue have a skip reason — accept never produces
 * a skip event.
 *
 * @param {string} outcome
 * @returns {"approval-denied" | "approval-ignored" | null}
 */
export function skipReasonFor(outcome) {
  if (outcome === APPROVAL_OUTCOMES.DENY) {
    return APPROVAL_RESOLUTION_REASONS.APPROVAL_DENIED;
  }
  if (outcome === APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE) {
    return APPROVAL_RESOLUTION_REASONS.APPROVAL_IGNORED;
  }
  return null;
}

/**
 * Validates that `nextOutcome` is reachable from `previousOutcome`.
 * Story 2.3 allows only `pending -> {accept|deny|ignore-and-continue}`.
 * Terminal -> any other outcome is rejected so duplicate resolves stay
 * idempotent at the resolver layer.
 *
 * @param {string} previousOutcome
 * @param {string} nextOutcome
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateTransition(previousOutcome, nextOutcome) {
  if (!isValidOutcome(nextOutcome) || nextOutcome === APPROVAL_OUTCOMES.PENDING) {
    return { ok: false, reason: "invalid-outcome" };
  }
  if (previousOutcome !== APPROVAL_OUTCOMES.PENDING) {
    return { ok: false, reason: "non-pending-source" };
  }
  return { ok: true };
}
