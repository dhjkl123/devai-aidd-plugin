export function createSessionHook(legacyHandlers) {
  return async ({ event }) => {
    const handler = legacyHandlers.event;
    if (!handler) {
      return;
    }

    return handler({ event });
  };
}
