export function createCommandExecuteBeforeHook(legacyHandlers) {
  return async (input, output) => {
    const handler = legacyHandlers["command.execute.before"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
