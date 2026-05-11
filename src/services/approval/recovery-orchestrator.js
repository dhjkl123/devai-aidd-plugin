/**
 * recovery-orchestrator.js
 *
 * Story 2.5 — central orchestrator that opens a recovery gate, records the
 * user's continuation choice, releases the gate, and assembles audit events.
 *
 * The orchestrator is the only Story 2.5 module that mutates `workflowState`.
 * Hooks call into it; the orchestrator delegates classification to
 * `classify-recovery.js`, recovery option construction to
 * `build-recovery-options.js`, and state-machine validation to
 * `recovery-state.js`.
 *
 * Recovery state shape stored under `workflowState[sessionID].recoveryGate`:
 *
 * ```js
 * {
 *   gateId,                   // stable per active gate; rotates on each open
 *   actionKind,               // "branch" | "init" | "commit" | "push"
 *   actionId,                 // upstream action correlation id
 *   correlationId,            // executor envelope correlation id (or null)
 *   state,                    // RECOVERY_STATES value
 *   source,                   // "approval" | "execution" | "invariant"
 *   recoverable,              // boolean
 *   reason,                   // canonical reason code
 *   blockingScope,            // BLOCKING_SCOPES value
 *   options,                  // [{ choice, label, instructions, nextState, ... }]
 *   recommendedChoice,        // RECOVERY_CHOICES value | null
 *   choice,                   // RECOVERY_CHOICES value | null (set after select)
 *   attempt,                  // 1 on open; ++attempt on retry
 *   openedAt,                 // ISO-8601
 *   updatedAt,                // ISO-8601
 *   resolvedAt,               // ISO-8601 | null (set when terminal)
 *   continuationPhase,        // "open" | "selected" | "terminal"
 *   history: [                // append-only state log
 *     { state, at, reason, choice }
 *   ],
 *   details                   // classifier-supplied structured context
 * }
 * ```
 *
 * Audit events emitted:
 *   - git.action.recovery.offered    (open)
 *   - git.action.recovery.selected   (user picked a choice)
 *   - git.action.recovery.completed  (terminal continuation reached)
 *   - git.action.recovery.blocked    (non-recoverable abandonment)
 *
 * Orchestration boundary rules:
 *   - audit emission is best-effort (mirrors src/audit/logger.js contract)
 *   - state mutation happens before audit emission so audit failure cannot
 *     leave workflow state inconsistent
 *   - one active recovery gate per session; opening a new gate while one is
 *     active returns `{ outcome: "skip", reason: "gate-already-open" }`
 *   - cross-session selection (sessionID mismatch) is treated as an
 *     invariant violation and produces `git.action.recovery.blocked`
 *
 * Storage: the gate lives on the existing `workflowState` keyed by sessionID,
 * so `session.deleted` cleanup in `src/hooks/native-event.js` already disposes it.
 */

import { randomUUID } from "node:crypto";
import {
  BLOCKING_SCOPES,
  RECOVERY_CHOICES,
  RECOVERY_STATES,
  intentStateForChoice,
  isRecoveryActionKind,
  isRecoveryChoice,
  isTerminalRecoveryState,
  validateRecoveryTransition,
} from "./recovery-state.js";
import { buildRecoveryOptions } from "./build-recovery-options.js";
import {
  classifyApprovalRecovery,
  classifyExecutionRecovery,
  classifyInvariantViolation,
} from "./classify-recovery.js";

const RECOVERY_EVENTS = Object.freeze({
  OFFERED: "git.action.recovery.offered",
  SELECTED: "git.action.recovery.selected",
  COMPLETED: "git.action.recovery.completed",
  BLOCKED: "git.action.recovery.blocked",
});

function nowIso() {
  return new Date().toISOString();
}

function newGateId() {
  try {
    return `recovery:${randomUUID()}`;
  } catch {
    return `recovery:${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

function safeReadState(workflowState, sessionID) {
  if (!workflowState || typeof workflowState.get !== "function") return null;
  if (typeof sessionID !== "string" || sessionID.length === 0) return null;
  try {
    return workflowState.get(sessionID) ?? null;
  } catch {
    return null;
  }
}

function persistGate(workflowState, sessionID, gate) {
  if (!workflowState || typeof workflowState.set !== "function") return;
  const prior = safeReadState(workflowState, sessionID) ?? {};
  workflowState.set(sessionID, { ...prior, recoveryGate: gate });
}

function clearGate(workflowState, sessionID) {
  if (!workflowState || typeof workflowState.set !== "function") return;
  const prior = safeReadState(workflowState, sessionID) ?? {};
  workflowState.set(sessionID, { ...prior, recoveryGate: null });
}

function appendHistory(gate, entry) {
  const history = Array.isArray(gate.history) ? gate.history : [];
  return [...history, entry];
}

function buildEventEnvelope({
  event,
  workflow,
  command,
  outcome,
  gate,
  details = {},
  timestamp,
}) {
  // Story 2.5 (HIGH review round 2): when an event is emitted via a path that
  // does not have direct access to the source workflow/command (the
  // permission-asked recovery routing path is the canonical example), fall
  // back to the gate's persisted attribution so the audit consumer can still
  // group/filter `selected` / `completed` / `blocked` by workflow. Without
  // this, those events arrive at audit with `workflow: null, command: null`
  // even though `offered` (emitted directly with full params) was correctly
  // attributed.
  return {
    event,
    timestamp: timestamp || nowIso(),
    workflow: workflow ?? gate?.workflow ?? null,
    command: command ?? gate?.command ?? null,
    outcome: outcome ?? null,
    details: {
      actionKind: gate?.actionKind ?? null,
      actionId: gate?.actionId ?? null,
      correlationId: gate?.correlationId ?? null,
      failureCode: gate?.reason ?? null,
      recoverable: gate?.recoverable === true,
      blockingScope: gate?.blockingScope ?? BLOCKING_SCOPES.NONE,
      attempt: gate?.attempt ?? 1,
      gateId: gate?.gateId ?? null,
      sessionID: gate?.sessionID ?? null,
      source: gate?.source ?? null,
      ...details,
    },
  };
}

/**
 * Story 2.5 (MEDIUM review round 2): shared helper for emitting
 * `git.action.recovery.blocked` from any non-orchestrator emission site
 * (today: the planning hook in `command-execute-before.js`). Keeps the
 * `details` shape symmetric across hook-emitted and orchestrator-emitted
 * blocked events so audit consumers don't have to branch on emission origin.
 *
 * @param {{
 *   gate: object,
 *   workflow?: string | null,
 *   command?: string | null,
 *   sessionID?: string | null,
 *   source?: string | null,
 *   reason?: string | null,
 *   timestamp?: string,
 *   extraDetails?: object
 * }} params
 * @returns {object} the canonical event envelope
 */
export function buildHookBlockedEvent({
  gate,
  workflow = null,
  command = null,
  sessionID = null,
  source = null,
  reason = null,
  timestamp,
  extraDetails = {},
}) {
  return buildEventEnvelope({
    event: RECOVERY_EVENTS.BLOCKED,
    workflow,
    command,
    outcome: "skip",
    gate,
    details: {
      reason: reason ?? null,
      source: source ?? gate?.source ?? null,
      sessionID: sessionID ?? gate?.sessionID ?? null,
      ...extraDetails,
    },
    timestamp,
  });
}

async function emitAuditBestEffort(audit, event) {
  if (!audit || typeof audit.info !== "function" || !event) return;
  try {
    await audit.info(event.event, event);
  } catch {
    // Audit is best-effort. Swallowing here mirrors src/audit/logger.js's
    // per-sink try/catch — a sink failure must never abort recovery handling.
  }
}

/**
 * Open a recovery gate from a denied or ignored approval outcome.
 *
 * @param {{
 *   workflowState: { get: Function, set: Function },
 *   sessionID: string,
 *   approvalOutcome: "deny" | "ignore-and-continue",
 *   actionKind: string,
 *   actionId?: string | null,
 *   workflow?: string | null,
 *   command?: string | null,
 *   audit?: { info: Function } | null
 * }} params
 * @returns {Promise<{ outcome: "opened" | "blocked" | "skip", reason?: string, gate?: object, event?: object }>}
 */
export async function openRecoveryFromApproval(params) {
  const {
    workflowState,
    sessionID,
    approvalOutcome,
    actionKind,
    actionId = null,
    workflow = null,
    command = null,
    audit = null,
  } = params || {};

  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return { outcome: "skip", reason: "session-not-tracked" };
  }
  if (!isRecoveryActionKind(actionKind)) {
    const violation = classifyInvariantViolation({
      reason: "missing-action-kind",
      sessionID,
      actionKind,
      actionId,
      detail: { source: "approval", approvalOutcome },
    });
    return _openBlockedGate({
      workflowState,
      sessionID,
      classification: violation,
      actionKind: null,
      actionId,
      operation: null,
      correlationId: null,
      source: "invariant",
      workflow,
      command,
      audit,
    });
  }

  const prior = safeReadState(workflowState, sessionID);
  if (prior?.recoveryGate && !isTerminalRecoveryState(prior.recoveryGate.state)) {
    return { outcome: "skip", reason: "gate-already-open", gate: prior.recoveryGate };
  }

  const classification = classifyApprovalRecovery({
    approvalOutcome,
    actionKind,
    actionId,
    sessionID,
  });

  if (!classification.recoverable) {
    return _openBlockedGate({
      workflowState,
      sessionID,
      classification,
      actionKind,
      actionId,
      operation: null,
      correlationId: null,
      source: "approval",
      workflow,
      command,
      audit,
    });
  }

  return _openRecoverableGate({
    workflowState,
    sessionID,
    classification,
    actionKind,
    actionId,
    operation: null,
    correlationId: null,
    source: "approval",
    workflow,
    command,
    audit,
  });
}

/**
 * Open a recovery gate from a Story 2.4 executor failure envelope.
 *
 * @param {{
 *   workflowState: { get: Function, set: Function },
 *   sessionID: string,
 *   envelope: object,
 *   workflow?: string | null,
 *   command?: string | null,
 *   audit?: { info: Function } | null
 * }} params
 * @returns {Promise<{ outcome: "opened" | "blocked" | "skip", reason?: string, gate?: object, event?: object }>}
 */
export async function openRecoveryFromExecution(params) {
  const {
    workflowState,
    sessionID,
    envelope,
    workflow = null,
    command = null,
    audit = null,
  } = params || {};

  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return { outcome: "skip", reason: "session-not-tracked" };
  }
  if (!envelope || typeof envelope !== "object") {
    return { outcome: "skip", reason: "missing-envelope" };
  }
  if (envelope.ok === true) {
    return { outcome: "skip", reason: "envelope-not-failed" };
  }

  const prior = safeReadState(workflowState, sessionID);
  if (prior?.recoveryGate && !isTerminalRecoveryState(prior.recoveryGate.state)) {
    return { outcome: "skip", reason: "gate-already-open", gate: prior.recoveryGate };
  }

  const classification = classifyExecutionRecovery({ envelope, sessionID });
  const action = envelope.action || {};
  const actionKind = isRecoveryActionKind(action.kind) ? action.kind : null;
  const actionId = action.correlationId ?? null;
  const operation = typeof action.operation === "string" ? action.operation : null;
  const correlationId = action.correlationId ?? null;

  if (!classification.recoverable) {
    return _openBlockedGate({
      workflowState,
      sessionID,
      classification,
      actionKind,
      actionId,
      operation,
      correlationId,
      source: "execution",
      workflow,
      command,
      audit,
    });
  }

  return _openRecoverableGate({
    workflowState,
    sessionID,
    classification,
    actionKind,
    actionId,
    operation,
    correlationId,
    source: "execution",
    workflow,
    command,
    audit,
  });
}

/**
 * Record the user's recovery choice. Validates the transition, mutates the
 * gate, and emits `git.action.recovery.selected`. Terminal choices
 * (`continue-without-automation`, `abandon`) also emit
 * `git.action.recovery.completed` (or `.blocked` for abandon-from-non-
 * recoverable).
 *
 * @param {{
 *   workflowState: { get: Function, set: Function },
 *   sessionID: string,
 *   choice: string,
 *   workflow?: string | null,
 *   command?: string | null,
 *   audit?: { info: Function } | null,
 *   verifyManual?: boolean
 * }} params
 * @returns {Promise<{
 *   outcome: "selected" | "skip",
 *   reason?: string,
 *   gate?: object,
 *   events?: object[]
 * }>}
 */
export async function selectRecoveryChoice(params) {
  const {
    workflowState,
    sessionID,
    choice,
    workflow = null,
    command = null,
    audit = null,
    verifyManual = false,
  } = params || {};

  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return { outcome: "skip", reason: "session-not-tracked" };
  }
  if (!isRecoveryChoice(choice)) {
    return { outcome: "skip", reason: "invalid-choice" };
  }

  const prior = safeReadState(workflowState, sessionID);
  const gate = prior?.recoveryGate ?? null;
  if (!gate) {
    return { outcome: "skip", reason: "no-active-gate" };
  }
  if (gate.state !== RECOVERY_STATES.AWAITING_RECOVERY) {
    return { outcome: "skip", reason: "gate-not-awaiting-recovery" };
  }
  if (typeof gate.sessionID === "string" && gate.sessionID !== sessionID) {
    // Cross-session response — invariant violation.
    const violation = classifyInvariantViolation({
      reason: "session-mismatch",
      sessionID,
      actionKind: gate.actionKind,
      actionId: gate.actionId,
      detail: { gateSessionId: gate.sessionID },
    });
    const blocked = await _abandonGate({
      workflowState,
      sessionID,
      gate,
      reason: violation.reason,
      workflow,
      command,
      audit,
    });
    return { outcome: "skip", reason: "session-mismatch", gate: blocked.gate, events: blocked.events };
  }

  // The gate cannot offer a choice the classifier did not include in options.
  const matchingOption = (gate.options || []).find((opt) => opt.choice === choice);
  if (!matchingOption) {
    return { outcome: "skip", reason: "choice-not-offered" };
  }

  const intentState = intentStateForChoice(choice);
  if (!intentState) {
    return { outcome: "skip", reason: "invalid-choice" };
  }
  const transition = validateRecoveryTransition(gate.state, intentState);
  if (!transition.ok) {
    return { outcome: "skip", reason: transition.reason };
  }

  const ts = nowIso();
  let updatedGate = {
    ...gate,
    state: intentState,
    choice,
    updatedAt: ts,
    continuationPhase: isTerminalRecoveryState(intentState) ? "terminal" : "selected",
    history: appendHistory(gate, { state: intentState, at: ts, reason: gate.reason, choice }),
  };

  // Choice-specific finalization: retry/abandon/continue-without-automation are
  // single-step terminal transitions; manual-resolution may complete now if
  // verifyManual is true (the user confirmed prerequisite is resolved), or
  // remain `awaitingManualResolution` until a follow-up call confirms.
  let finalEvents = [];
  if (choice === RECOVERY_CHOICES.RETRY) {
    // retry → next state is `planned` with attempt incremented; the gate
    // itself is closed (a fresh planning pass will open a new approval cycle).
    const plannedState = RECOVERY_STATES.PLANNED;
    const retryTransition = validateRecoveryTransition(intentState, plannedState);
    if (!retryTransition.ok) {
      return { outcome: "skip", reason: retryTransition.reason };
    }
    const retryTs = nowIso();
    updatedGate = {
      ...updatedGate,
      state: plannedState,
      attempt: (gate.attempt || 1) + 1,
      updatedAt: retryTs,
      resolvedAt: retryTs,
      continuationPhase: "terminal",
      history: appendHistory(updatedGate, { state: plannedState, at: retryTs, reason: "retry-requested", choice }),
    };
  } else if (choice === RECOVERY_CHOICES.CONTINUE_WITHOUT_AUTOMATION) {
    updatedGate.resolvedAt = ts;
  } else if (choice === RECOVERY_CHOICES.ABANDON) {
    updatedGate.resolvedAt = ts;
  } else if (choice === RECOVERY_CHOICES.MANUAL_RESOLUTION && verifyManual === true) {
    const completedState = RECOVERY_STATES.CONTINUED_AFTER_MANUAL_RESOLUTION;
    const completion = validateRecoveryTransition(intentState, completedState);
    if (!completion.ok) {
      return { outcome: "skip", reason: completion.reason };
    }
    const manualTs = nowIso();
    updatedGate = {
      ...updatedGate,
      state: completedState,
      updatedAt: manualTs,
      resolvedAt: manualTs,
      continuationPhase: "terminal",
      history: appendHistory(updatedGate, {
        state: completedState,
        at: manualTs,
        reason: "manual-resolution-confirmed",
        choice,
      }),
    };
  }

  persistGate(workflowState, sessionID, updatedGate);

  // Always emit `selected`; for terminal states also emit completed/blocked.
  const selectedEvent = buildEventEnvelope({
    event: RECOVERY_EVENTS.SELECTED,
    workflow,
    command,
    outcome: "ask",
    gate: updatedGate,
    details: {
      choice,
      previousState: gate.state,
      requiresRecheck:
        choice === RECOVERY_CHOICES.MANUAL_RESOLUTION ||
        choice === RECOVERY_CHOICES.RETRY,
      continuedWorkflowPhase: prior?.phase ?? null,
    },
    timestamp: ts,
  });
  finalEvents.push(selectedEvent);
  await emitAuditBestEffort(audit, selectedEvent);

  // Emit `completed` (or `blocked` for abandon) whenever the gate has reached
  // its terminal continuation phase. `planned` after a retry counts: the gate
  // itself is closed and a fresh planning pass will start a new approval
  // cycle, even though `planned` is not a strict-terminal state in the
  // overall recovery vocabulary.
  if (updatedGate.continuationPhase === "terminal") {
    const isBlocked = updatedGate.state === RECOVERY_STATES.ABANDONED;
    const completionEvent = buildEventEnvelope({
      event: isBlocked ? RECOVERY_EVENTS.BLOCKED : RECOVERY_EVENTS.COMPLETED,
      workflow,
      command,
      outcome: isBlocked ? "deny" : "allow",
      gate: updatedGate,
      details: {
        choice,
        terminalState: updatedGate.state,
        continuedWorkflowPhase: prior?.phase ?? null,
        requiresRecheck: choice === RECOVERY_CHOICES.RETRY,
      },
      timestamp: updatedGate.resolvedAt || ts,
    });
    finalEvents.push(completionEvent);
    await emitAuditBestEffort(audit, completionEvent);
  }

  // Story 2.5 (HIGH review): once retry resolves, the gate's purpose is
  // fulfilled — the next planning pass must run an entirely fresh approval
  // cycle. Leaving the gate in the store with `state: "planned"` and the
  // original `blockingScope` causes `isActionBlockedByGate` to keep emitting
  // `git.action.recovery.blocked` for the same `actionKind`, never republishing
  // an approval. Clearing the store entry here lets the next
  // `command-execute-before` pass open a brand-new gate (or none) without
  // racing the now-historical retry record. The audit trail for the retry
  // still stands via the `selected` + `completed` events emitted above.
  if (choice === RECOVERY_CHOICES.RETRY) {
    clearGate(workflowState, sessionID);
  }

  return { outcome: "selected", gate: updatedGate, events: finalEvents };
}

/**
 * Confirm a previously selected manual-resolution path. Used when the gate
 * was left in `awaitingManualResolution` (verifyManual=false at selection
 * time) and the user later asks the workflow to continue.
 *
 * @param {{
 *   workflowState: { get: Function, set: Function },
 *   sessionID: string,
 *   workflow?: string | null,
 *   command?: string | null,
 *   audit?: { info: Function } | null
 * }} params
 * @returns {Promise<{ outcome: "completed" | "skip", reason?: string, gate?: object, events?: object[] }>}
 */
export async function confirmManualResolution(params) {
  const { workflowState, sessionID, workflow = null, command = null, audit = null } = params || {};
  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return { outcome: "skip", reason: "session-not-tracked" };
  }
  const prior = safeReadState(workflowState, sessionID);
  const gate = prior?.recoveryGate ?? null;
  if (!gate) return { outcome: "skip", reason: "no-active-gate" };
  if (gate.state !== RECOVERY_STATES.AWAITING_MANUAL_RESOLUTION) {
    return { outcome: "skip", reason: "gate-not-awaiting-manual-resolution" };
  }

  const next = RECOVERY_STATES.CONTINUED_AFTER_MANUAL_RESOLUTION;
  const transition = validateRecoveryTransition(gate.state, next);
  if (!transition.ok) {
    return { outcome: "skip", reason: transition.reason };
  }

  const ts = nowIso();
  const updatedGate = {
    ...gate,
    state: next,
    updatedAt: ts,
    resolvedAt: ts,
    continuationPhase: "terminal",
    history: appendHistory(gate, {
      state: next,
      at: ts,
      reason: "manual-resolution-confirmed",
      choice: gate.choice ?? RECOVERY_CHOICES.MANUAL_RESOLUTION,
    }),
  };
  persistGate(workflowState, sessionID, updatedGate);

  const event = buildEventEnvelope({
    event: RECOVERY_EVENTS.COMPLETED,
    workflow,
    command,
    outcome: "allow",
    gate: updatedGate,
    details: {
      choice: gate.choice ?? RECOVERY_CHOICES.MANUAL_RESOLUTION,
      terminalState: next,
      requiresRecheck: false,
    },
    timestamp: ts,
  });
  await emitAuditBestEffort(audit, event);
  return { outcome: "completed", gate: updatedGate, events: [event] };
}

/**
 * Read the active recovery gate (or null). Used by hook gating logic that
 * wants to know whether to suppress further Git automation for the session.
 *
 * @param {{ get: Function }} workflowState
 * @param {string} sessionID
 * @returns {object | null}
 */
export function readRecoveryGate(workflowState, sessionID) {
  const state = safeReadState(workflowState, sessionID);
  return state?.recoveryGate ?? null;
}

/**
 * Clear an active gate. Used by tests and by retry resolution where the
 * orchestrator wants to start the next planning cycle from a clean slate.
 *
 * @param {{ get: Function, set: Function }} workflowState
 * @param {string} sessionID
 */
export function clearRecoveryGate(workflowState, sessionID) {
  clearGate(workflowState, sessionID);
}

/**
 * Determine whether a recovery gate currently blocks the given action kind
 * for the given session. This is the gating-release helper consumed by
 * planning hooks: a session with an active init-recovery gate must NOT plan
 * any further branch/commit/push proposals; a workflow-finalization gate
 * must NOT auto-trigger push planning, but unrelated content work proceeds.
 *
 * @param {object | null} gate  the gate returned by `readRecoveryGate`
 * @param {string} actionKind  the action kind being proposed next
 * @returns {{ blocked: boolean, reason: string }}
 */
export function isActionBlockedByGate(gate, actionKind) {
  if (!gate) return { blocked: false, reason: "no-gate" };
  // Story 2.5 (LOW review round 2): the retry path persists the gate at
  // `state: "planned"` with `continuationPhase: "terminal"` for two awaited
  // emissions before `clearGate` runs. In that window `state === "planned"`
  // is NOT in `TERMINAL_RECOVERY_STATES`, so without this defense any
  // re-entrant reader would see `{ blocked: true, reason: "same-action-
  // blocked" }` even though the retry has already finalised. The fix below
  // (HIGH round 1) clears the gate already; this is defense in depth so a
  // future parallel ingress path cannot reopen the same regression.
  if (gate.continuationPhase === "terminal") {
    return { blocked: false, reason: "gate-terminal-phase" };
  }
  if (isTerminalRecoveryState(gate.state)) return { blocked: false, reason: "gate-terminal" };
  const scope = gate.blockingScope || BLOCKING_SCOPES.NONE;
  if (scope === BLOCKING_SCOPES.NONE) return { blocked: false, reason: "scope-none" };
  if (scope === BLOCKING_SCOPES.SESSION_GIT) {
    return { blocked: true, reason: "session-git-blocked" };
  }
  if (scope === BLOCKING_SCOPES.GIT_ONLY) {
    if (gate.actionKind === actionKind) {
      return { blocked: true, reason: "same-action-blocked" };
    }
    return { blocked: false, reason: "different-action" };
  }
  if (scope === BLOCKING_SCOPES.WORKFLOW_FINALIZATION) {
    if (actionKind === "push" || actionKind === "commit") {
      return { blocked: true, reason: "finalization-blocked" };
    }
    return { blocked: false, reason: "non-finalization-action" };
  }
  return { blocked: false, reason: "unknown-scope" };
}

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

async function _openRecoverableGate({
  workflowState,
  sessionID,
  classification,
  actionKind,
  actionId,
  operation,
  correlationId,
  source,
  workflow,
  command,
  audit,
}) {
  const ts = nowIso();
  const options = buildRecoveryOptions({
    actionKind,
    operation,
    recoverable: true,
    recommendedChoice: classification.recommendedChoice,
  });
  const gate = {
    gateId: newGateId(),
    sessionID,
    // Story 2.5 (HIGH review round 2): persist workflow/command on the gate so
    // emitters that do not have direct access to the source request (e.g. the
    // recovery-choice routing path in permission-asked.js) can still attribute
    // selected/completed/blocked audit events correctly via gate fallback in
    // buildEventEnvelope. Without persistence, those audit events arrived with
    // workflow: null / command: null even though `offered` was attributed
    // correctly because the orchestrator received params directly.
    workflow: workflow ?? null,
    command: command ?? null,
    actionKind,
    actionId: actionId ?? null,
    correlationId: correlationId ?? null,
    state: RECOVERY_STATES.AWAITING_RECOVERY,
    source,
    recoverable: true,
    reason: classification.reason,
    blockingScope: classification.blockingScope,
    options,
    recommendedChoice: classification.recommendedChoice ?? null,
    choice: null,
    attempt: 1,
    openedAt: ts,
    updatedAt: ts,
    resolvedAt: null,
    continuationPhase: "open",
    history: [{ state: RECOVERY_STATES.AWAITING_RECOVERY, at: ts, reason: classification.reason, choice: null }],
    details: classification.details ?? null,
  };
  persistGate(workflowState, sessionID, gate);

  const event = buildEventEnvelope({
    event: RECOVERY_EVENTS.OFFERED,
    workflow,
    command,
    outcome: "ask",
    gate,
    details: {
      recommendedChoice: classification.recommendedChoice ?? null,
      offeredChoices: options.map((opt) => opt.choice),
      requiresRecheck: false,
    },
    timestamp: ts,
  });
  await emitAuditBestEffort(audit, event);
  return { outcome: "opened", gate, event };
}

async function _openBlockedGate({
  workflowState,
  sessionID,
  classification,
  actionKind,
  actionId,
  operation,
  correlationId,
  source,
  workflow,
  command,
  audit,
}) {
  const ts = nowIso();
  const options = buildRecoveryOptions({
    actionKind,
    operation,
    recoverable: false,
    recommendedChoice: null,
  });
  const gate = {
    gateId: newGateId(),
    sessionID,
    // Story 2.5 (HIGH review round 2): persist workflow/command on blocked
    // gates too. Even though _openBlockedGate emits its `git.action.recovery
    // .blocked` directly with full params, downstream consumers (e.g. the
    // hook's `git.action.recovery.blocked` planning emission) read from the
    // stored gate and would otherwise get `workflow: null / command: null`.
    workflow: workflow ?? null,
    command: command ?? null,
    actionKind: isRecoveryActionKind(actionKind) ? actionKind : null,
    actionId: actionId ?? null,
    correlationId: correlationId ?? null,
    state: RECOVERY_STATES.ABANDONED,
    source,
    recoverable: false,
    reason: classification.reason,
    blockingScope: classification.blockingScope,
    options,
    recommendedChoice: null,
    choice: RECOVERY_CHOICES.ABANDON,
    attempt: 1,
    openedAt: ts,
    updatedAt: ts,
    resolvedAt: ts,
    continuationPhase: "terminal",
    // Story 2.5 (LOW review round 3): the gate is created directly into
    // `abandoned`; it never actually entered `awaitingRecovery`. Recording a
    // synthetic `awaitingRecovery` precursor here would mislead audit
    // consumers reconstructing the timeline from `gate.history`. Keep history
    // strictly to states the gate genuinely held — for the controlled-stop
    // path that is just the single `abandoned` entry below.
    history: [
      { state: RECOVERY_STATES.ABANDONED, at: ts, reason: classification.reason, choice: RECOVERY_CHOICES.ABANDON },
    ],
    details: classification.details ?? null,
  };
  persistGate(workflowState, sessionID, gate);

  const event = buildEventEnvelope({
    event: RECOVERY_EVENTS.BLOCKED,
    workflow,
    command,
    outcome: "deny",
    gate,
    details: {
      choice: RECOVERY_CHOICES.ABANDON,
      terminalState: RECOVERY_STATES.ABANDONED,
      requiresRecheck: false,
    },
    timestamp: ts,
  });
  await emitAuditBestEffort(audit, event);
  // Story 2.5 (LOW review): non-recoverable opens collapse straight to
  // `abandoned`. Return `outcome: "blocked"` to disambiguate from
  // `_openRecoverableGate`, whose `"opened"` always means a non-terminal
  // gate that still awaits a user decision.
  return { outcome: "blocked", gate, event };
}

async function _abandonGate({
  workflowState,
  sessionID,
  gate,
  reason,
  workflow,
  command,
  audit,
}) {
  const ts = nowIso();
  const updatedGate = {
    ...gate,
    state: RECOVERY_STATES.ABANDONED,
    choice: RECOVERY_CHOICES.ABANDON,
    updatedAt: ts,
    resolvedAt: ts,
    continuationPhase: "terminal",
    history: appendHistory(gate, {
      state: RECOVERY_STATES.ABANDONED,
      at: ts,
      reason,
      choice: RECOVERY_CHOICES.ABANDON,
    }),
  };
  persistGate(workflowState, sessionID, updatedGate);
  const event = buildEventEnvelope({
    event: RECOVERY_EVENTS.BLOCKED,
    workflow,
    command,
    outcome: "deny",
    gate: updatedGate,
    details: {
      choice: RECOVERY_CHOICES.ABANDON,
      terminalState: RECOVERY_STATES.ABANDONED,
      requiresRecheck: false,
    },
    timestamp: ts,
  });
  await emitAuditBestEffort(audit, event);
  return { outcome: "abandoned", gate: updatedGate, events: [event] };
}

export const RECOVERY_EVENT_NAMES = RECOVERY_EVENTS;
