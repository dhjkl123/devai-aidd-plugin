export function createHttpAdapter() {
  return {
    async postJson() {
      // TODO: add internal audit forwarding when the destination contract is finalized.
      return { ok: false, skipped: true };
    },
  };
}
