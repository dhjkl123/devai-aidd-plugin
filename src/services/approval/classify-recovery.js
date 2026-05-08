/**
 * classify-recovery.js
 *
 * Story 2.5 — pure classifier that decides whether a given approval outcome
 * or Git execution failure is **recoverable** in the workflow-continuation
 * sense, and recommends a default recovery choice.
 *
 * Inputs come from the upstream layers verbatim:
 *   - Story 2.3 approval resolution: the resolver in
 *     `consume-approval-outcome.js` records `accept | deny | ignore-and-continue`.
 *   - Story 2.4 git executor envelope: `{ ok, status, action, code, message,
 *     details, audit, next }`. Story 2.5 consumes that envelope as the single
 *     source of truth for failure codes — it must NOT re-derive them here.
 *
 * Recoverable vs non-recoverable rules (mirroring the story spec):
 *   RECOVERABLE
 *     - approval was denied or ignored (controlled user choice, not a crash)
 *     - branch-conflict, branch-switch-mismatch (with safe manual path)
 *     - commit-failure (precondition fixable)
 *     - push-rejection (transient / sync / upstream)
 *     - repository-state-mismatch (re-evaluate after refresh)
 *     - readiness issues with a safe manual path
 *
 *   NON-RECOVERABLE
 *     - missing or mismatched sessionID (cross-session response)
 *     - missing proposal/action kind for an approval result
 *     - malformed stored recovery payload
 *     - cross-session recovery response applied to the wrong action
 *     - state-integrity invariant violations (corrupted internal state)
 *     - execution-unavailable (git missing / spawn / env broken — Story 2.4
 *       already flags `next.requiresRecoveryChoice = false` for this)
 *     - unknown-git-failure (cannot map to a safe next-step prompt)
 *
 * Output shape:
 *   {
 *     recoverable: boolean,
 *     reason: string,                         // canonical machine-readable code
 *     blockingScope: string,                  // BLOCKING_SCOPES value
 *     recommendedChoice: string | null,       // RECOVERY_CHOICES value or null
 *     details: object                         // structured supporting context
 *   }
 *
 * The classifier is deliberately the only Story 2.5 module that decides
 * recoverability. Audit and orchestration layers must consume `recoverable`
 * from here and never recompute it.
 */

import { FAILURE_CODES } from "../git/classify-git-execution-failure.js";
import {
  BLOCKING_SCOPES,
  RECOVERY_ACTION_KINDS,
  RECOVERY_CHOICES,
  defaultBlockingScopeFor,
  isRecoveryActionKind,
} from "./recovery-state.js";
import { APPROVAL_OUTCOMES } from "./approval-resolution-state.js";

const NON_RECOVERABLE_FAILURE_CODES = new Set([
  FAILURE_CODES.EXECUTION_UNAVAILABLE,
  FAILURE_CODES.UNKNOWN_GIT_FAILURE,
]);

/**
 * Map a Story 2.4 `suggestedRecoveryKind` hint onto a Story 2.5 recovery
 * choice. The classifier deliberately keeps this mapping conservative:
 * anything that does not map to one of the four canonical choices falls back
 * to `manual-resolution` because manual is always a safe path the user can
 * take while the automation gate stays closed.
 *
 * @param {string | null | undefined} suggested
 * @returns {string | null}
 */
function mapSuggestedRecovery(suggested) {
  if (typeof suggested !== "string" || suggested.length === 0) {
    return null;
  }
  switch (suggested) {
    case "switch-existing-branch":
    case "manual-fix-branch":
      return RECOVERY_CHOICES.MANUAL_RESOLUTION;
    case "stage-and-retry":
    case "fix-and-retry":
    case "retry-after-sync":
    case "configure-upstream":
      return RECOVERY_CHOICES.RETRY;
    case "re-evaluate-after-refresh":
      return RECOVERY_CHOICES.RETRY;
    case "manual-credentials":
    case "fix-environment":
      return RECOVERY_CHOICES.MANUAL_RESOLUTION;
    default:
      return RECOVERY_CHOICES.MANUAL_RESOLUTION;
  }
}

/**
 * Classify the **approval-side** of recovery: the user denied or ignored the
 * approval prompt. Both are controlled outcomes — not failures — and must be
 * recoverable so the workflow can continue past the bypassed action.
 *
 * @param {{
 *   approvalOutcome: string,
 *   actionKind?: string | null,
 *   actionId?: string | null,
 *   sessionID?: string | null
 * }} params
 * @returns {{
 *   recoverable: boolean,
 *   reason: string,
 *   blockingScope: string,
 *   recommendedChoice: string | null,
 *   details: object
 * }}
 */
export function classifyApprovalRecovery({
  approvalOutcome,
  actionKind = null,
  actionId = null,
  sessionID = null,
}) {
  if (
    approvalOutcome !== APPROVAL_OUTCOMES.DENY &&
    approvalOutcome !== APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE
  ) {
    return {
      recoverable: false,
      reason: "approval-outcome-not-recoverable",
      blockingScope: BLOCKING_SCOPES.NONE,
      recommendedChoice: null,
      details: {
        source: "approval",
        approvalOutcome: approvalOutcome ?? null,
        actionKind,
        actionId,
        sessionID,
      },
    };
  }

  // Deny on init blocks the entire session's Git automation because the
  // repository is not initialized — branch/commit/push all become unsafe.
  // For other action kinds, the gate is git-only by default.
  const blockingScope =
    isRecoveryActionKind(actionKind) && actionKind === RECOVERY_ACTION_KINDS.INIT
      ? BLOCKING_SCOPES.SESSION_GIT
      : defaultBlockingScopeFor(actionKind ?? "");

  // Deny suggests "continue-without-automation" — the user explicitly said no.
  // Ignore-and-continue suggests the same path: workflow advances unchanged.
  return {
    recoverable: true,
    reason:
      approvalOutcome === APPROVAL_OUTCOMES.DENY
        ? "approval-denied"
        : "approval-ignored",
    blockingScope,
    recommendedChoice: RECOVERY_CHOICES.CONTINUE_WITHOUT_AUTOMATION,
    details: {
      source: "approval",
      approvalOutcome,
      actionKind: isRecoveryActionKind(actionKind) ? actionKind : null,
      actionId,
      sessionID,
    },
  };
}

/**
 * Classify the **execution-side** of recovery: a Story 2.4 envelope arrived
 * with `ok === false` and `status === "failed"`. The classifier converts the
 * canonical failure code into a recoverability verdict and a recommended
 * recovery choice.
 *
 * @param {{
 *   envelope: object,
 *   sessionID?: string | null
 * }} params
 * @returns {{
 *   recoverable: boolean,
 *   reason: string,
 *   blockingScope: string,
 *   recommendedChoice: string | null,
 *   details: object
 * }}
 */
export function classifyExecutionRecovery({ envelope, sessionID = null }) {
  if (!envelope || typeof envelope !== "object" || envelope.ok !== false) {
    return {
      recoverable: false,
      reason: "envelope-not-failed",
      blockingScope: BLOCKING_SCOPES.NONE,
      recommendedChoice: null,
      details: {
        source: "execution",
        envelopeStatus: envelope?.status ?? null,
        sessionID,
      },
    };
  }

  const action = envelope.action || {};
  const actionKind = isRecoveryActionKind(action.kind) ? action.kind : null;
  const failureCode =
    typeof envelope.code === "string" ? envelope.code : FAILURE_CODES.UNKNOWN_GIT_FAILURE;
  const detailsBlock = envelope.details || {};
  const story24Recoverable = detailsBlock.recoverable === true;
  const suggestedFromStory24 = mapSuggestedRecovery(detailsBlock.suggestedRecoveryKind);

  // Hard non-recoverable failure codes — these arrive with `recoverable: false`
  // from Story 2.4 already; we honor that and do not re-derive.
  if (NON_RECOVERABLE_FAILURE_CODES.has(failureCode) || !story24Recoverable) {
    return {
      recoverable: false,
      reason: failureCode,
      blockingScope:
        actionKind && failureCode === FAILURE_CODES.EXECUTION_UNAVAILABLE
          ? BLOCKING_SCOPES.SESSION_GIT
          : BLOCKING_SCOPES.GIT_ONLY,
      recommendedChoice: null,
      details: {
        source: "execution",
        failureCode,
        actionKind,
        actionId: action.correlationId ?? null,
        sessionID,
        story24Recoverable,
        story24SuggestedRecoveryKind: detailsBlock.suggestedRecoveryKind ?? null,
        expectedState: detailsBlock.expectedState ?? null,
        observedState: detailsBlock.observedState ?? null,
      },
    };
  }

  // Recoverable execution failure — pick the recommended choice from the
  // Story 2.4 hint, falling back to manual-resolution.
  const recommendedChoice = suggestedFromStory24 ?? RECOVERY_CHOICES.MANUAL_RESOLUTION;
  const blockingScope = defaultBlockingScopeFor(actionKind ?? "");

  return {
    recoverable: true,
    reason: failureCode,
    blockingScope,
    recommendedChoice,
    details: {
      source: "execution",
      failureCode,
      actionKind,
      actionId: action.correlationId ?? null,
      sessionID,
      story24Recoverable: true,
      story24SuggestedRecoveryKind: detailsBlock.suggestedRecoveryKind ?? null,
      expectedState: detailsBlock.expectedState ?? null,
      observedState: detailsBlock.observedState ?? null,
    },
  };
}

/**
 * Classify a state-integrity failure: the recovery layer detected an
 * invariant violation (missing sessionID, malformed payload, cross-session
 * mismatch, etc.). These are always non-recoverable — the controlled stop is
 * `abandoned` and audit must record `git.action.recovery.blocked`.
 *
 * @param {{
 *   reason: string,
 *   sessionID?: string | null,
 *   actionKind?: string | null,
 *   actionId?: string | null,
 *   detail?: object | null
 * }} params
 * @returns {{
 *   recoverable: false,
 *   reason: string,
 *   blockingScope: string,
 *   recommendedChoice: null,
 *   details: object
 * }}
 */
export function classifyInvariantViolation({
  reason,
  sessionID = null,
  actionKind = null,
  actionId = null,
  detail = null,
}) {
  return {
    recoverable: false,
    reason: typeof reason === "string" && reason.length > 0 ? reason : "invariant-violation",
    blockingScope: BLOCKING_SCOPES.GIT_ONLY,
    recommendedChoice: null,
    details: {
      source: "invariant",
      actionKind: isRecoveryActionKind(actionKind) ? actionKind : null,
      actionId,
      sessionID,
      detail: detail ?? null,
    },
  };
}
