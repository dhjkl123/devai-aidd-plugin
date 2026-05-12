import { executeGitAction } from "./git-executor.js";

export function buildBranchAction({ proposal, correlationId } = {}) {
  if (!proposal || proposal.kind !== "branch") {
    throw new Error("A branch proposal is required.");
  }
  if (proposal.action !== "create" && proposal.action !== "switch") {
    throw new Error(`Unsupported branch action: ${String(proposal.action)}`);
  }
  const branchName = typeof proposal.name === "string" && proposal.name.length > 0
    ? proposal.name
    : null;
  if (!branchName) {
    throw new Error("Branch actions require a branch name.");
  }
  return {
    kind: "branch",
    operation: proposal.action,
    branchName,
    targetBranch: branchName,
    remoteName: null,
    correlationId:
      typeof correlationId === "string" && correlationId.length > 0
        ? correlationId
        : typeof proposal.correlationId === "string" && proposal.correlationId.length > 0
          ? proposal.correlationId
          : `branch:${proposal.action}:${branchName}:${Date.now().toString(36)}`,
  };
}

export async function executeBranch(params = {}) {
  const plan = params.plan ?? buildBranchAction({ proposal: params.proposal });
  return executeGitAction({
    plan,
    approval: params.approval ?? null,
    expectedState: params.expectedState ?? null,
    repositorySnapshot: params.repositorySnapshot ?? null,
    workflowContext: params.workflowContext ?? null,
    gitRunner: typeof params.gitRunner === "function" ? params.gitRunner : null,
    audit: params.audit ?? null,
    workflowState: params.workflowState ?? null,
  });
}
