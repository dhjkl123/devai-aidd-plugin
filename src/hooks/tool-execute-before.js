export function createToolExecuteBeforeHook(legacyHandlers) {
  return async (input, output) => {
    const handler = legacyHandlers["tool.execute.before"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
