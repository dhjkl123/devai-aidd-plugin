/**
 * git-executor.js
 *
 * Story 2.4 — single normalization point for mutating Git execution results.
 *
 * `executeGitAction` orchestrates one execution attempt: it performs preflight
 * snapshot validation, optionally delegates the actual subprocess call to an
 * injected runner, runs post-condition verification, classifies any failure
 * via `classify-git-execution-failure.js`, emits a structured
 * `git.action.executed` audit event in best-effort mode, and persists the
 * normalized envelope into workflow state when one is provided.
 *
 * Story 2.4 is the contract layer: this module never branches into recovery
 * choices. Recovery decisions are Story 2.5.
 *
 * Returned envelope:
 *
 * ```js
 * {
 *   ok: boolean,
 *   status: "succeeded" | "failed" | "skipped",
 *   action: {
 *     kind: "branch" | "commit" | "push" | "init" | "finalize",
 *     operation: string,
 *     branchName: string | null,
 *     targetBranch: string | null,
 *     remoteName: string | null,
 *     correlationId: string,
 *     approvedAt: string | null,
 *   },
 *   code: string | null,
 *   message: string | null,
 *   details: object,
 *   audit: {
 *     attempted: boolean,
 *     logged: boolean,
 *     loggingError: string | null,
 *   },
 *   next: {
 *     continueWorkflow: boolean,
 *     requiresRecoveryChoice: boolean,
 *   },
 * }
 * ```
 *
 * Boundary rules:
 *   - hooks must NEVER parse raw stderr — they consume this envelope
 *   - approval state is read-only; the executor does not redefine outcomes
 *   - audit logging is best-effort (mirrors `src/audit/logger.js` contract)
 *   - sensitive details (full stderr, remote URL, credentials) never enter
 *     the audit payload — only the summarized fields the classifier emits.
 */

import { randomUUID } from "node:crypto";
import {
  classifyGitExecutionFailure,
  FAILURE_CODES,
} from "./classify-git-execution-failure.js";

const ACTION_KINDS = new Set(["branch", "commit", "push", "init", "finalize"]);

function generateCorrelationId() {
  try {
    return randomUUID();
  } catch {
    // crypto unavailable — fall back to a non-cryptographic timestamp ID.
    return `git-action-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

function toNullableString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeAction(plan, approval) {
  const kind = ACTION_KINDS.has(plan?.kind) ? plan.kind : null;
  return {
    kind,
    operation: toNullableString(plan?.operation),
    branchName: toNullableString(plan?.branchName),
    targetBranch: toNullableString(plan?.targetBranch),
    remoteName: toNullableString(plan?.remoteName),
    correlationId: toNullableString(plan?.correlationId) ?? generateCorrelationId(),
    approvedAt: toNullableString(approval?.resolvedAt) ?? toNullableString(approval?.approvedAt),
    message: toNullableString(plan?.message),
    files: Array.isArray(plan?.files) ? [...plan.files] : [],
    allFiles: plan?.allFiles === true,
    allowEmpty: plan?.allowEmpty === true,
  };
}

function snapshotsAgree(expected, observed) {
  if (!expected || !observed) return true;
  if (typeof expected !== "object" || typeof observed !== "object") return true;

  const fields = [
    "headBranch",
    "headCommit",
    "repositoryReady",
    "hasRemote",
    "hasStagedChanges",
  ];
  for (const field of fields) {
    const e = expected[field];
    const o = observed[field];
    if (e === undefined || o === undefined) continue;
    if (typeof e !== typeof o) continue;
    if (e !== o) return false;
  }
  return true;
}

function buildSucceededEnvelope({ action, expectedState, observedState }) {
  return {
    ok: true,
    status: "succeeded",
    action,
    code: null,
    message: null,
    details: {
      exitCode: 0,
      signal: null,
      stderrSummary: null,
      stdoutSummary: null,
      branch: action.branchName,
      targetBranch: action.targetBranch,
      remoteName: action.remoteName,
      expectedState: expectedState ?? null,
      observedState: observedState ?? null,
      recoverable: true,
      suggestedRecoveryKind: null,
    },
    audit: {
      attempted: false,
      logged: false,
      loggingError: null,
    },
    next: {
      continueWorkflow: true,
      requiresRecoveryChoice: false,
    },
  };
}

function buildFailureEnvelope({ action, classification }) {
  return {
    ok: false,
    status: "failed",
    action,
    code: classification.code,
    message: classification.message,
    details: classification.details,
    audit: {
      attempted: false,
      logged: false,
      loggingError: null,
    },
    next: {
      continueWorkflow: true,
      requiresRecoveryChoice: classification.code !== FAILURE_CODES.EXECUTION_UNAVAILABLE,
    },
  };
}

function buildAuditEvent({ envelope, workflowContext }) {
  const command = toNullableString(workflowContext?.commandName);
  // Story 3.4: surface actionId (deterministic per-action identifier from the
  // approval contract) and finalizationMode (workflowPolicy.finalization) as
  // first-class details so an auditor can join planning → approval → execution
  // by the same axes used by `approval.requested` / `approval.resolved` /
  // `git.action.skipped`. The executor is the natural normalization point;
  // we accept these as workflowContext fields rather than mutating the plan
  // shape so the existing executor envelope contract stays stable.
  const actionId =
    toNullableString(workflowContext?.actionId) ?? envelope.action.correlationId;
  const finalizationMode = toNullableString(workflowContext?.finalizationMode);
  return {
    event: "git.action.executed",
    timestamp: new Date().toISOString(),
    workflow: command,
    command,
    // Story 3.4: surface sessionID at top-level alongside workflow/command
    // (mirrors the same shape on approval.requested / approval.resolved /
    // git.action.skipped) so audit consumers can group all events for one
    // finalization flow without digging into details.
    sessionID: toNullableString(workflowContext?.sessionID),
    outcome: envelope.ok ? "succeeded" : "failed",
    details: {
      sessionID: toNullableString(workflowContext?.sessionID),
      phase: "end",
      actionKind: envelope.action.kind,
      actionId,
      operation: envelope.action.operation,
      code: envelope.code,
      branch: envelope.action.branchName,
      targetBranch: envelope.action.targetBranch,
      remoteName: envelope.action.remoteName,
      recoverable: envelope.details?.recoverable === true,
      stderrSummary: envelope.details?.stderrSummary ?? null,
      correlationId: envelope.action.correlationId,
      finalizationMode,
    },
  };
}

async function emitAuditBestEffort({ audit, envelope, workflowContext }) {
  if (!audit || typeof audit.info !== "function") {
    envelope.audit = { attempted: false, logged: false, loggingError: null };
    return;
  }

  const event = buildAuditEvent({ envelope, workflowContext });
  envelope.audit = { attempted: true, logged: false, loggingError: null };
  try {
    await audit.info(event.event, event);
    envelope.audit.logged = true;
  } catch (error) {
    // Best-effort: never let audit failure overwrite the primary cause.
    envelope.audit.logged = false;
    envelope.audit.loggingError = error?.message ?? String(error);
  }
}

function persistEnvelopeToWorkflowState({ envelope, workflowState, workflowContext }) {
  if (!workflowState || typeof workflowState.set !== "function") {
    return;
  }
  const sessionID = toNullableString(workflowContext?.sessionID);
  if (!sessionID) {
    return;
  }
  const prior = typeof workflowState.get === "function" ? workflowState.get(sessionID) : null;

  const lastGitAction = {
    kind: envelope.action.kind,
    operation: envelope.action.operation,
    branchName: envelope.action.branchName,
    targetBranch: envelope.action.targetBranch,
    remoteName: envelope.action.remoteName,
    correlationId: envelope.action.correlationId,
    approvedAt: envelope.action.approvedAt,
  };

  const lastGitResult = {
    ok: envelope.ok,
    status: envelope.status,
    code: envelope.code,
    message: envelope.message,
    correlationId: envelope.action.correlationId,
  };

  const lastGitFailure = envelope.ok
    ? null
    : {
        code: envelope.code,
        message: envelope.message,
        recoverable: envelope.details?.recoverable === true,
        suggestedRecoveryKind: envelope.details?.suggestedRecoveryKind ?? null,
        expectedState: envelope.details?.expectedState ?? null,
        observedState: envelope.details?.observedState ?? null,
        correlationId: envelope.action.correlationId,
      };

  const pendingRecoveryContext = envelope.ok
    ? null
    : {
        source: "git-action-failure",
        correlationId: envelope.action.correlationId,
        code: envelope.code,
        recoverable: envelope.details?.recoverable === true,
        suggestedRecoveryKind: envelope.details?.suggestedRecoveryKind ?? null,
      };

  workflowState.set(sessionID, {
    ...(prior ?? {}),
    lastGitAction,
    lastGitResult,
    lastGitFailure,
    pendingRecoveryContext,
  });
}

/**
 * Execute (or short-circuit) one mutating Git action through the canonical
 * envelope contract.
 *
 * Detection-order rules — the executor never reorders these:
 *   1. plan kind sanity check → unknown-git-failure if invalid.
 *   2. preflight drift between expectedState and observedState →
 *      repository-state-mismatch (never invokes gitRunner).
 *   3. subprocess failure (gitRunner threw) → classifier.
 *   4. successful run + branch post-condition mismatch →
 *      classifier (branch-switch-mismatch, etc.).
 *   5. otherwise → succeeded envelope.
 *
 * Subprocess execution is delegated to the injected `gitRunner` so the
 * executor itself stays test-friendly and free of `child_process` plumbing.
 *
 * @param {{
 *   plan: object,
 *   approval?: object|null,
 *   repositorySnapshot?: object|null,
 *   expectedState?: object|null,
 *   workflowContext?: object|null,
 *   gitRunner?: ((args: { action: object }) => Promise<{ stdout?: string, stderr?: string, observedState?: object }>) | null,
 *   audit?: object|null,
 *   workflowState?: object|null,
 * }} params
 * @returns {Promise<object>} the normalized result envelope
 */
export async function executeGitAction(params = {}) {
  const {
    plan,
    approval = null,
    repositorySnapshot = null,
    expectedState = null,
    workflowContext = null,
    gitRunner = null,
    audit = null,
    workflowState = null,
  } = params;

  const action = normalizeAction(plan, approval);

  // (1) Plan sanity — unknown action kinds short-circuit before any work.
  if (!action.kind) {
    const classification = classifyGitExecutionFailure({
      action: { kind: "unknown" },
      error: { message: "Unsupported git action kind" },
    });
    const envelope = buildFailureEnvelope({ action, classification });
    await emitAuditBestEffort({ audit, envelope, workflowContext });
    persistEnvelopeToWorkflowState({ envelope, workflowState, workflowContext });
    return envelope;
  }

  // (2) Preflight drift — must short-circuit BEFORE gitRunner is invoked,
  // because the repository state already disagrees with what the approval was
  // granted against. Mutating execution against drifted state is unsafe.
  const preflightExpectedState =
    action.kind === "branch" && expectedState && repositorySnapshot
      ? { ...expectedState, headBranch: repositorySnapshot.headBranch }
      : expectedState;
  if (!snapshotsAgree(preflightExpectedState, repositorySnapshot)) {
    const classification = classifyGitExecutionFailure({
      action,
      preflightDrift: true,
      expectedState: preflightExpectedState,
      observedState: repositorySnapshot,
    });
    const envelope = buildFailureEnvelope({ action, classification });
    await emitAuditBestEffort({ audit, envelope, workflowContext });
    persistEnvelopeToWorkflowState({ envelope, workflowState, workflowContext });
    return envelope;
  }

  // (3) Subprocess execution — runner is optional so callers (tests, future
  // hook integration) can plug in their own subprocess strategy.
  let runnerResult;
  let runnerError;
  if (typeof gitRunner === "function") {
    try {
      runnerResult = await gitRunner({
        action,
        trace: {
          hook: "git-executor",
          stage: `execute-${action.kind || "unknown"}`,
          sessionID: workflowContext?.sessionID ?? null,
          workflow: workflowContext?.commandName ?? null,
          phase: workflowContext?.phase ?? null,
          finalizationMode: workflowContext?.finalizationMode ?? null,
          correlationId: action?.correlationId ?? null,
        },
      });
    } catch (error) {
      runnerError = error;
    }
  }

  if (runnerError) {
    const classification = classifyGitExecutionFailure({
      action,
      error: runnerError,
      expectedState,
      observedState: repositorySnapshot,
    });
    const envelope = buildFailureEnvelope({ action, classification });
    await emitAuditBestEffort({ audit, envelope, workflowContext });
    persistEnvelopeToWorkflowState({ envelope, workflowState, workflowContext });
    return envelope;
  }

  // (4) Post-condition verification — the runner can return an observedState
  // captured AFTER the mutating command. Mismatch with expectedState becomes
  // a branch-switch-mismatch (or equivalent) failure even though git itself
  // exited zero.
  const observedState = runnerResult?.observedState ?? repositorySnapshot ?? null;
  if (
    action.kind === "branch" &&
    expectedState &&
    observedState &&
    !snapshotsAgree(expectedState, observedState)
  ) {
    const classification = classifyGitExecutionFailure({
      action,
      error: null,
      expectedState,
      observedState,
    });
    const envelope = buildFailureEnvelope({ action, classification });
    await emitAuditBestEffort({ audit, envelope, workflowContext });
    persistEnvelopeToWorkflowState({ envelope, workflowState, workflowContext });
    return envelope;
  }

  // (5) Success.
  const envelope = buildSucceededEnvelope({ action, expectedState, observedState });
  await emitAuditBestEffort({ audit, envelope, workflowContext });
  persistEnvelopeToWorkflowState({ envelope, workflowState, workflowContext });
  return envelope;
}
