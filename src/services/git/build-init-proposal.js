export function buildInitProposal({ directory, reason } = {}) {
  return {
    kind: "init",
    action: "git-init",
    directory: directory || "",
    reason: reason || "git-not-initialized",
    requiresApproval: true,
    message: `Git repository initialization is required for ${directory || "this directory"}.`,
    details: {
      directory: directory || "",
      reason: reason || "git-not-initialized",
    },
  };
}
