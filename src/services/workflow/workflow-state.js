import { WORKFLOW_PHASES } from "./detect-workflow-context.js";

/**
 * In-memory, session-scoped workflow state store.
 * Keyed by sessionID; scoped to the bootstrap closure — no global singletons.
 *
 * Mutability policy: stored entries are owned by the store. `set` deep-enough-
 * copies the input via shallow spread, `get` returns a shallow copy so callers
 * cannot mutate state through the returned reference, and `advancePhase`
 * mutates the internal entry in place.
 *
 * Approval state fields (Story 2.1+):
 *   approvalCurrent          — current pending ApprovalRequest object or null.
 *                              Set to a request object when awaitingApproval.
 *                              Cleared by Story 2.3 on resolve.
 *   approvalHistory          — append-only array. Story 2.1 records the request
 *                              at issue time; Story 2.3 appends a resolution
 *                              snapshot with the user-selected outcome.
 *   pendingActions (Story 2.3)
 *                            — FIFO queue of normalized planned actions waiting
 *                              behind the active approval. Each entry follows
 *                              the plannedAction shape:
 *                                { actionId, kind, action, proposal,
 *                                  requiresApproval, sessionID, phase,
 *                                  createdAt }
 *   lastContinuationDecision (Story 2.3)
 *                            — last terminal outcome envelope describing how
 *                              workflow continuation should be interpreted by
 *                              downstream planning steps.
 *
 * Execution-result fields (Story 2.4):
 *   lastGitAction            — the most recent mutating Git action that was
 *                              attempted through `git-executor.js`. Mirrors
 *                              the executor envelope's `action` object plus
 *                              the optional `approvedAt` timestamp.
 *   lastGitResult            — terminal status summary for the last attempt:
 *                                { ok, status, code, message, correlationId }.
 *                              `status` is one of `succeeded` | `failed` |
 *                              `skipped`. Approval success and execution
 *                              success are deliberately tracked separately —
 *                              an approved-but-failed action is observable as
 *                              `approvalCurrent === null` (Story 2.3 cleared
 *                              it) plus `lastGitResult.status === "failed"`.
 *   lastGitFailure           — failure-only summary populated when
 *                              `lastGitResult.status === "failed"`. Carries
 *                              the canonical `code`, the `recoverable` /
 *                              `suggestedRecoveryKind` hints, and the
 *                              `expectedState` / `observedState` snapshots
 *                              for downstream surfacing. Cleared to `null`
 *                              on successful executions.
 *   pendingRecoveryContext   — preparation hand-off for Story 2.5; consumed
 *                              by the Story 2.5 orchestrator when opening a
 *                              recovery gate from an executor failure. Shape:
 *                                { source, correlationId, code,
 *                                  recoverable, suggestedRecoveryKind }.
 *
 * Recovery gate field (Story 2.5):
 *   recoveryGate             — null when no gate is open. Otherwise the
 *                              orchestrator-owned object describing the
 *                              current recovery cycle:
 *                                { gateId, sessionID, actionKind, actionId,
 *                                  correlationId, state, source, recoverable,
 *                                  reason, blockingScope, options,
 *                                  recommendedChoice, choice, attempt,
 *                                  openedAt, updatedAt, resolvedAt,
 *                                  continuationPhase, history, details }
 *                              The gate is session-scoped and cleared by the
 *                              same `session.deleted` cleanup path that owns
 *                              approval state.
 *
 * Workflow phase values:  start | in-progress | finish  (WORKFLOW_PHASES)
 *
 * Approval lifecycle (state representation, not status field):
 *   - while pending : approvalCurrent !== null and approvalCurrent.status
 *                     === "awaitingApproval" (set by Story 2.1).
 *   - on resolve    : Story 2.3 sets approvalCurrent = null and appends a
 *                     resolution snapshot to approvalHistory (the entry
 *                     carries the terminal outcome — "accept" | "deny" |
 *                     "ignore-and-continue" — alongside the original
 *                     request fields). There is no separate transition
 *                     field on approvalCurrent itself; "resolved" is
 *                     observable as approvalCurrent === null with a
 *                     populated approvalHistory tail.
 *
 * Copy policy:
 *   - `set` performs a top-level spread. Inputs are caller-owned at call time;
 *     deep cloning here would defeat the carry-over merge pattern used by
 *     command-execute-before (which intentionally preserves prior nested refs).
 *   - `get` returns a top-level shallow copy AND deep clones approval nested
 *     fields (`approvalCurrent`, `approvalHistory`, `pendingActions`,
 *     `lastContinuationDecision`) via `structuredClone` so external mutations
 *     of nested fields like `approvalCurrent.proposal.action` cannot reach the
 *     store's internal state. Node 22 native — no deps.
 *
 * @returns {{ set: Function, get: Function, clear: Function, advancePhase: Function }}
 */
export function createWorkflowStateStore() {
  const _store = new Map();

  return {
    set(sessionID, context) {
      _store.set(sessionID, { ...context });
    },

    get(sessionID) {
      const entry = _store.get(sessionID);
      if (entry === undefined) {
        return undefined;
      }
      // Produce a shallow top-level copy. Approval nested fields are deep
      // cloned so callers cannot mutate proposal/prompt/metadata reachable
      // through approvalCurrent / approvalHistory / pendingActions /
      // lastContinuationDecision. Story 2.4 extends the same isolation to the
      // executor envelope mirror fields (lastGitAction / lastGitResult /
      // lastGitFailure / pendingRecoveryContext) so callers cannot tamper
      // with the recorded execution outcome through the returned snapshot.
      const copy = { ...entry };
      if (copy.approvalCurrent !== null && copy.approvalCurrent !== undefined) {
        copy.approvalCurrent = structuredClone(copy.approvalCurrent);
      }
      if (Array.isArray(copy.approvalHistory)) {
        copy.approvalHistory = structuredClone(copy.approvalHistory);
      }
      if (Array.isArray(copy.pendingActions)) {
        copy.pendingActions = structuredClone(copy.pendingActions);
      }
      if (
        copy.lastContinuationDecision !== null &&
        copy.lastContinuationDecision !== undefined
      ) {
        copy.lastContinuationDecision = structuredClone(copy.lastContinuationDecision);
      }
      if (copy.lastGitAction !== null && copy.lastGitAction !== undefined) {
        copy.lastGitAction = structuredClone(copy.lastGitAction);
      }
      if (copy.lastGitResult !== null && copy.lastGitResult !== undefined) {
        copy.lastGitResult = structuredClone(copy.lastGitResult);
      }
      if (copy.lastGitFailure !== null && copy.lastGitFailure !== undefined) {
        copy.lastGitFailure = structuredClone(copy.lastGitFailure);
      }
      if (copy.pendingRecoveryContext !== null && copy.pendingRecoveryContext !== undefined) {
        copy.pendingRecoveryContext = structuredClone(copy.pendingRecoveryContext);
      }
      // Story 2.5: deep-clone the recovery gate so callers cannot tamper with
      // gate state, options, or history through the returned snapshot.
      if (copy.recoveryGate !== null && copy.recoveryGate !== undefined) {
        copy.recoveryGate = structuredClone(copy.recoveryGate);
      }
      if (Array.isArray(copy.touchedFiles)) {
        copy.touchedFiles = structuredClone(copy.touchedFiles);
      }
      if (
        copy.finalizationAssessment !== null &&
        copy.finalizationAssessment !== undefined
      ) {
        copy.finalizationAssessment = structuredClone(copy.finalizationAssessment);
      }
      if (
        copy.finalizationArtifacts !== null &&
        copy.finalizationArtifacts !== undefined
      ) {
        copy.finalizationArtifacts = structuredClone(copy.finalizationArtifacts);
      }
      if (copy.commitProposal !== null && copy.commitProposal !== undefined) {
        copy.commitProposal = structuredClone(copy.commitProposal);
      }
      return copy;
    },

    clear(sessionID) {
      _store.delete(sessionID);
    },

    /**
     * Idempotent: no-op when the session is unknown or phase already equals nextPhase.
     * Throws when nextPhase is not a member of WORKFLOW_PHASES — catches typos like
     * "in_progress" early instead of letting them silently drift into the store.
     */
    advancePhase(sessionID, nextPhase) {
      if (!WORKFLOW_PHASES.includes(nextPhase)) {
        throw new Error(
          `Invalid workflow phase: ${String(nextPhase)}. Expected one of ${WORKFLOW_PHASES.join(", ")}.`,
        );
      }
      const state = _store.get(sessionID);
      if (!state || state.phase === nextPhase) {
        return;
      }
      state.phase = nextPhase;
    },
  };
}
