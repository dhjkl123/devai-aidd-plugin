/**
 * build-init-proposal.js
 *
 * Pure builders for the init chain proposals:
 *   - `buildInitProposal` — readiness "ask" path, requests git repository
 *     initialization. Carries a `correlationId` so audit timelines can join
 *     the eventual `git.action.executed` to this planning event.
 *   - `buildBaselineCommitProposal` — emitted after a successful `executeInit`
 *     to seed the working tree with an Initial commit. Uses `kind: "commit"`
 *     so it flows through the existing approval + executor machinery; the
 *     `action: "baseline-commit"` discriminator is checked by
 *     `executeApprovedAction` to drive the post-commit branch planning chain.
 *     When the directory is empty after `git init` the proposal sets
 *     `allowEmpty: true`, and `buildCommitArgs` will swap the standard
 *     `add + commit -- <pathspec>` for `commit --allow-empty -m <message>`.
 */

function defaultCorrelationId(prefix, directory) {
  const ts = Date.now().toString(36);
  const dirToken =
    typeof directory === "string" && directory.length > 0
      ? directory.replace(/[^A-Za-z0-9]+/g, "_").slice(-40)
      : "no-dir";
  return `${prefix}:${dirToken}:${ts}`;
}

export function buildInitProposal({ directory, reason, correlationId } = {}) {
  const dir = directory || "";
  return {
    kind: "init",
    action: "git-init",
    directory: dir,
    reason: reason || "git-not-initialized",
    requiresApproval: true,
    correlationId:
      typeof correlationId === "string" && correlationId.length > 0
        ? correlationId
        : defaultCorrelationId("init", dir),
    message: `Git repository initialization is required for ${dir || "this directory"}.`,
    details: {
      directory: dir,
      reason: reason || "git-not-initialized",
    },
  };
}

/**
 * Build the baseline commit proposal published after `executeInit` succeeds.
 *
 * `proposal.action === "baseline-commit"` is the load-bearing discriminator —
 * `buildProposalFingerprint` includes this field so the actionId is distinct
 * from regular commit proposals, and the post-commit chain in
 * `execute-approved-action.js` keys off it to drive branch planning.
 *
 * `proposal.reason === "baseline-commit"` is informational and is preserved
 * so audit consumers can recognize the chain origin without parsing `action`.
 *
 * @param {{ directory: string, files?: string[]|null, sessionID: string, correlationId?: string|null }} input
 */
export function buildBaselineCommitProposal({ directory, files, sessionID, correlationId } = {}) {
  const dir = typeof directory === "string" ? directory : "";
  const sid = typeof sessionID === "string" && sessionID.length > 0 ? sessionID : "no-session";
  const filesArray = Array.isArray(files) ? [...files] : [];
  const allowEmpty = filesArray.length === 0;
  return {
    kind: "commit",
    action: "baseline-commit",
    reason: "baseline-commit",
    message: "Initial commit",
    files: filesArray,
    allowEmpty,
    directory: dir,
    requiresApproval: true,
    correlationId:
      typeof correlationId === "string" && correlationId.length > 0
        ? correlationId
        : `baseline-commit:${sid}:${Date.now().toString(36)}`,
  };
}
