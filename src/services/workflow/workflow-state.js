/**
 * In-memory, session-scoped workflow state store.
 * Keyed by sessionID; scoped to the bootstrap closure — no global singletons.
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
      return entry !== undefined ? entry : null;
    },

    clear(sessionID) {
      _store.delete(sessionID);
    },

    /** Idempotent: no-op when phase already equals nextPhase. */
    advancePhase(sessionID, nextPhase) {
      const state = _store.get(sessionID);
      if (!state || state.phase === nextPhase) {
        return;
      }
      state.phase = nextPhase;
    },
  };
}
