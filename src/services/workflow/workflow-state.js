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
      return entry === undefined ? undefined : { ...entry };
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
