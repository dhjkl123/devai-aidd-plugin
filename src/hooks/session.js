/**
 * session.js — wrapper hook for the `event` runtime channel.
 *
 * On `session.deleted`, clears workflow state for the given sessionID.
 */

export function createSessionHook({ workflowState } = {}) {
  return async ({ event }) => {
    if (workflowState) {
      const sessionID = event?.properties?.sessionID;
      if (event?.type === "session.deleted" && sessionID) {
        workflowState.clear(sessionID);
      }
    }
  };
}
