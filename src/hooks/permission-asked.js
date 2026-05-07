export function createPermissionAskedHook(legacyHandlers) {
  return async (input) => {
    const handler = legacyHandlers["permission.asked"];
    if (typeof handler !== "function") {
      return;
    }

    return handler(input);
  };
}
