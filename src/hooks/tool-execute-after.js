export function createToolExecuteAfterHook(legacyHandlers, { workflowState } = {}) {
  return async (input, output) => {
    if (workflowState) {
      const state = workflowState.get(input?.sessionID);
      if (state) {
        workflowState.advancePhase(input.sessionID, "in-progress");
      }
    }

    const handler = legacyHandlers["tool.execute.after"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
