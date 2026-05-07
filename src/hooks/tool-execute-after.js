export function createToolExecuteAfterHook(legacyHandlers) {
  return async (input, output) => {
    const handler = legacyHandlers["tool.execute.after"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
