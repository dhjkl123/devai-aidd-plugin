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
