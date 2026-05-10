import { buildCommitAction, executeCommit } from "./commit-service.js";

function buildRepositorySnapshot(state) {
  const details = state?.readiness?.details ?? {};
  if (!state?.readiness || typeof details !== "object") {
    return null;
  }

  return {
    repositoryReady: details.isGitRepository === true,
    headBranch: typeof details.branch === "string" ? details.branch : null,
    hasRemote: details.hasRemote === true,
  };
}

export async function executeApprovedAction({
  workflowState,
  sessionID,
  approvalRequest,
  resolution = null,
  pluginContext = null,
  audit = null,
} = {}) {
  if (!workflowState || !sessionID || !approvalRequest) {
    return { outcome: "skip", reason: "missing-context" };
  }

  if (approvalRequest.actionType !== "commit" || approvalRequest.proposal?.kind !== "commit") {
    return { outcome: "skip", reason: "unsupported-action-type" };
  }

  const state = workflowState.get(sessionID) ?? {};
  const repositorySnapshot = buildRepositorySnapshot(state);
  const plan = buildCommitAction({
    message: approvalRequest.proposal.message,
    branchName: repositorySnapshot?.headBranch ?? null,
    correlationId: approvalRequest.proposal.correlationId ?? null,
    files: approvalRequest.proposal.files ?? [],
  });

  const envelope = await executeCommit({
    plan,
    approval: {
      resolvedAt: resolution?.resolvedAt ?? new Date().toISOString(),
    },
    expectedState: repositorySnapshot,
    repositorySnapshot,
    workflowContext: {
      sessionID,
      commandName: approvalRequest.command ?? approvalRequest.workflow ?? null,
      phase: approvalRequest.phase ?? "finish",
    },
    gitRunner: pluginContext?.gitActionRunner ?? null,
    audit,
    workflowState,
  });

  if (envelope.ok) {
    const nextState = workflowState.get(sessionID) ?? {};
    workflowState.set(sessionID, {
      ...nextState,
      commitProposal: null,
    });
  }

  return {
    outcome: "executed",
    envelope,
  };
}
