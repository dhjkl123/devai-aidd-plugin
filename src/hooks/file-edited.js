export function createFileEditedHook(legacyHandlers) {
  return async (input) => {
    const handler = legacyHandlers["file.edited"];
    if (typeof handler !== "function") {
      return;
    }

    return handler(input);
  };
}
