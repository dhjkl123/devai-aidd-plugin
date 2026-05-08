/**
 * recovery-state.js
 *
 * Story 2.5 — pure constants and helpers describing the recovery lifecycle.
 *
 * Story 2.5 sits AFTER Story 2.3 approval resolution and AFTER Story 2.4 git
 * execution. By the time this module is invoked, an action outcome already
 * exists in one of the following shapes:
 *   - approval was denied (`deny`)
 *   - approval was ignored (`ignore-and-continue`)
 *   - executor returned `failed` envelope from `git-executor.js`
 *
 * This module defines:
 *   - canonical recovery state names,
 *   - allowed transitions between them,
 *   - canonical user-facing recovery choice strings,
 *   - the `actionKind` vocabulary recovery understands,
 *   - the `blockingScope` vocabulary that gating uses to decide which
 *     downstream Git automation must wait on this recovery gate.
 *
 * The module is pure: no I/O, no audit, no workflow-state mutation.
 * Higher-level modules (`build-recovery-options.js`,
 * `recovery-orchestrator.js`) own state mutation and emission of events.
 *
 * State machine (per active recovery gate):
 *
 *   planned
 *     ─▶ awaitingApproval
 *          ─▶ approved   ─▶ executing ─▶ completed
 *                                      ─▶ failed ─▶ awaitingRecovery
 *          ─▶ denied     ─▶ awaitingRecovery
 *          ─▶ skipped    ─▶ awaitingRecovery
 *
 *   awaitingRecovery
 *     ─▶ retryRequested              ─▶ planned        (fresh attempt; attempt++)
 *     ─▶ continuedWithoutAutomation                     (terminal — bypassed)
 *     ─▶ awaitingManualResolution    ─▶ continuedAfterManualResolution
 *                                                        (terminal — user-managed)
 *     ─▶ abandoned                                       (non-recoverable controlled stop)
 *
 *   Terminal: completed | continuedWithoutAutomation |
 *             continuedAfterManualResolution | abandoned
 *
 * The `abandoned` state is reserved for the non-recoverable controlled stop:
 *   failed ─▶ git.action.recovery.blocked ─▶ abandoned
 *
 * Recovery choices fed to the user (UI/runtime layer) and recorded into audit:
 *   - retry
 *   - continue-without-automation
 *   - manual-resolution
 *   - abandon  (only when the failure is non-recoverable)
 *
 * Action-kind vocabulary supported for recovery:
 *   - branch  (covers branch/create and branch/switch)
 *   - init
 *   - commit  (preparation/preconditions only — Epic 3 owns commit creation)
 *   - push    (preparation/preconditions only — Epic 3 owns push execution)
 *
 * Blocking scope tells later planning passes which dependent automation must
 * wait on this gate before scheduling more Git activity:
 *   - none                  : nothing is blocked by this gate
 *   - git-only              : block only later Git automation tied to this action
 *   - session-git           : block ALL later Git automation for this session
 *                             (used when init or repository readiness is unresolved)
 *   - workflow-finalization : block only the future Story 3.x finalization
 *                             planning, not active BMAD content work
 */

export const RECOVERY_STATES = Object.freeze({
  PLANNED: "planned",
  AWAITING_APPROVAL: "awaitingApproval",
  APPROVED: "approved",
  EXECUTING: "executing",
  FAILED: "failed",
  AWAITING_RECOVERY: "awaitingRecovery",
  RETRY_REQUESTED: "retryRequested",
  CONTINUED_WITHOUT_AUTOMATION: "continuedWithoutAutomation",
  AWAITING_MANUAL_RESOLUTION: "awaitingManualResolution",
  CONTINUED_AFTER_MANUAL_RESOLUTION: "continuedAfterManualResolution",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
});

const RECOVERY_STATE_VALUES = new Set(Object.values(RECOVERY_STATES));

export const TERMINAL_RECOVERY_STATES = Object.freeze([
  RECOVERY_STATES.COMPLETED,
  RECOVERY_STATES.CONTINUED_WITHOUT_AUTOMATION,
  RECOVERY_STATES.CONTINUED_AFTER_MANUAL_RESOLUTION,
  RECOVERY_STATES.ABANDONED,
]);

export const RECOVERY_CHOICES = Object.freeze({
  RETRY: "retry",
  CONTINUE_WITHOUT_AUTOMATION: "continue-without-automation",
  MANUAL_RESOLUTION: "manual-resolution",
  ABANDON: "abandon",
});

const RECOVERY_CHOICE_VALUES = new Set(Object.values(RECOVERY_CHOICES));

export const RECOVERY_ACTION_KINDS = Object.freeze({
  BRANCH: "branch",
  INIT: "init",
  COMMIT: "commit",
  PUSH: "push",
});

const RECOVERY_ACTION_KIND_VALUES = new Set(Object.values(RECOVERY_ACTION_KINDS));

export const BLOCKING_SCOPES = Object.freeze({
  NONE: "none",
  GIT_ONLY: "git-only",
  SESSION_GIT: "session-git",
  WORKFLOW_FINALIZATION: "workflow-finalization",
});

const BLOCKING_SCOPE_VALUES = new Set(Object.values(BLOCKING_SCOPES));

/**
 * Allowed state transitions. Keys are the source state; values are the set of
 * legal next states. Any pair NOT in this map is rejected by
 * `validateRecoveryTransition` so accidental jumps (e.g. completed → planned)
 * do not corrupt the gate.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  planned: new Set(["awaitingApproval", "executing", "abandoned"]),
  awaitingApproval: new Set(["approved", "awaitingRecovery", "abandoned"]),
  approved: new Set(["executing", "abandoned"]),
  executing: new Set(["completed", "failed", "abandoned"]),
  failed: new Set(["awaitingRecovery", "abandoned"]),
  awaitingRecovery: new Set([
    "retryRequested",
    "continuedWithoutAutomation",
    "awaitingManualResolution",
    "abandoned",
  ]),
  retryRequested: new Set(["planned", "abandoned"]),
  awaitingManualResolution: new Set([
    "continuedAfterManualResolution",
    "awaitingRecovery",
    "abandoned",
  ]),
  // Terminal — no further transitions allowed.
  completed: new Set(),
  continuedWithoutAutomation: new Set(),
  continuedAfterManualResolution: new Set(),
  abandoned: new Set(),
});

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isRecoveryState(state) {
  return typeof state === "string" && RECOVERY_STATE_VALUES.has(state);
}

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isTerminalRecoveryState(state) {
  return TERMINAL_RECOVERY_STATES.includes(state);
}

/**
 * @param {string} choice
 * @returns {boolean}
 */
export function isRecoveryChoice(choice) {
  return typeof choice === "string" && RECOVERY_CHOICE_VALUES.has(choice);
}

/**
 * @param {string} kind
 * @returns {boolean}
 */
export function isRecoveryActionKind(kind) {
  return typeof kind === "string" && RECOVERY_ACTION_KIND_VALUES.has(kind);
}

/**
 * @param {string} scope
 * @returns {boolean}
 */
export function isBlockingScope(scope) {
  return typeof scope === "string" && BLOCKING_SCOPE_VALUES.has(scope);
}

/**
 * Validate a transition from `previous` to `next`. The result mirrors the
 * shape used by `approval-resolution-state.js#validateTransition` so callers
 * can pattern-match in the same way.
 *
 * @param {string} previous
 * @param {string} next
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateRecoveryTransition(previous, next) {
  if (!isRecoveryState(previous)) {
    return { ok: false, reason: "invalid-previous-state" };
  }
  if (!isRecoveryState(next)) {
    return { ok: false, reason: "invalid-next-state" };
  }
  const allowed = ALLOWED_TRANSITIONS[previous];
  if (!allowed || !allowed.has(next)) {
    return { ok: false, reason: "transition-not-allowed" };
  }
  return { ok: true };
}

/**
 * Maps a recovery choice to the recovery state that records the user's
 * intent before any verification side-effect runs. Used by the orchestrator
 * to drive the next transition after `awaitingRecovery`.
 *
 * @param {string} choice
 * @returns {string | null}
 */
export function intentStateForChoice(choice) {
  switch (choice) {
    case RECOVERY_CHOICES.RETRY:
      return RECOVERY_STATES.RETRY_REQUESTED;
    case RECOVERY_CHOICES.CONTINUE_WITHOUT_AUTOMATION:
      return RECOVERY_STATES.CONTINUED_WITHOUT_AUTOMATION;
    case RECOVERY_CHOICES.MANUAL_RESOLUTION:
      return RECOVERY_STATES.AWAITING_MANUAL_RESOLUTION;
    case RECOVERY_CHOICES.ABANDON:
      return RECOVERY_STATES.ABANDONED;
    default:
      return null;
  }
}

/**
 * Default blocking scope when an action enters `awaitingRecovery`. Action-
 * specific recovery option builders may override this on a per-action basis.
 *
 * @param {string} actionKind
 * @returns {string}
 */
export function defaultBlockingScopeFor(actionKind) {
  if (actionKind === RECOVERY_ACTION_KINDS.INIT) {
    // init blocks ALL later Git automation for the session because branch /
    // commit / push all assume an initialized repository.
    return BLOCKING_SCOPES.SESSION_GIT;
  }
  if (actionKind === RECOVERY_ACTION_KINDS.COMMIT) {
    // unresolved commit must NOT auto-trigger push planning; later
    // finalization planning is gated until the commit recovery resolves.
    return BLOCKING_SCOPES.WORKFLOW_FINALIZATION;
  }
  return BLOCKING_SCOPES.GIT_ONLY;
}
