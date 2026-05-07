export function createToolExecuteBeforeHook(legacyHandlers, { workflowState } = {}) {
  return async (input, output) => {
    if (workflowState) {
      const state = workflowState.get(input?.sessionID);
      if (state) {
        workflowState.advancePhase(input.sessionID, "in-progress");
      }
    }

    const handler = legacyHandlers["tool.execute.before"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
