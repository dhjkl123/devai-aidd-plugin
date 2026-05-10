/**
 * session.js — wrapper hook for the `event` runtime channel.
 *
 * Story 4.3 — THIN WRAPPER over the legacy `event` handler. On
 * `session.deleted`, the wrapper clears its own `workflowState` for the given
 * sessionID FIRST, then ALWAYS delegates to `legacyHandlers.event`. The
 * legacy handler then independently calls `states.delete(sessionID)` on the
 * SAME sessionID — both stores are cleaned, neither leaks. The delegation
 * order MUST stay (wrapper-first, legacy-last) so wrapper-side teardown
 * happens before any future legacy-side teardown is observed.
 */

export function createSessionHook(legacyHandlers, { workflowState } = {}) {
  return async ({ event }) => {
    if (workflowState) {
      const sessionID = event?.properties?.sessionID;
      if (event?.type === "session.deleted" && sessionID) {
        workflowState.clear(sessionID);
      }
    }

    const handler = legacyHandlers.event;
    if (!handler) {
      return;
    }

    return handler({ event });
  };
}
