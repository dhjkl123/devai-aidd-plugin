/**
 * classify-git-action.js
 *
 * Pure function: normalizes a proposal object into a standard action category
 * descriptor. No I/O or side-effects — all orchestration stays in the hook layer.
 *
 * Supported proposal kinds:
 *   - branchProposal  → actionType: "branch/create" | "branch/switch"
 *   - initProposal    → actionType: "init"
 *   - (future) commitProposal → actionType: "commit"
 *   - (future) pushProposal   → actionType: "push"
 *
 * Output shape:
 *   { kind, actionType, actionLabel, requiresApproval: true }
 */

/** @type {Set<string>} */
const ALLOWED_ACTION_TYPES = new Set([
  "branch/create",
  "branch/switch",
  "init",
  "commit",
  "push",
]);

/**
 * Maps a branch proposal to its actionType.
 *
 * @param {{ action: string }} proposal
 * @returns {"branch/create" | "branch/switch" | null}
 */
function classifyBranchAction(proposal) {
  if (proposal?.action === "create") {
    return "branch/create";
  }
  if (proposal?.action === "switch") {
    return "branch/switch";
  }
  return null;
}

/**
 * Classifies a proposal into a standard action category.
 *
 * @param {{ kind: string, [key: string]: unknown }} proposal
 * @returns {{ kind: string, actionType: string, actionLabel: string, requiresApproval: true } | null}
 *   Returns null when the proposal kind is unrecognised or actionType cannot be determined.
 */
export function classifyGitAction(proposal) {
  if (!proposal || typeof proposal.kind !== "string") {
    return null;
  }

  const kind = proposal.kind;

  if (kind === "branch") {
    const actionType = classifyBranchAction(proposal);
    if (!actionType) {
      return null;
    }
    const actionLabel =
      actionType === "branch/create"
        ? `Create branch: ${proposal.name || "(unnamed)"}`
        : `Switch to branch: ${proposal.name || "(unnamed)"}`;
    return { kind, actionType, actionLabel, requiresApproval: true };
  }

  if (kind === "init") {
    return {
      kind,
      actionType: "init",
      actionLabel: "Initialize Git repository",
      requiresApproval: true,
    };
  }

  if (kind === "commit") {
    return {
      kind,
      actionType: "commit",
      actionLabel: "Commit staged changes",
      requiresApproval: true,
    };
  }

  if (kind === "push") {
    return {
      kind,
      actionType: "push",
      actionLabel: "Push commits to remote",
      requiresApproval: true,
    };
  }

  return null;
}

/**
 * Validates that a given actionType is within the allowed set.
 * Exported for contract tests.
 *
 * @param {string} actionType
 * @returns {boolean}
 */
export function isAllowedActionType(actionType) {
  return ALLOWED_ACTION_TYPES.has(actionType);
}
