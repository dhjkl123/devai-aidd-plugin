import { publishNextPlannedAction } from "../approval/publish-next-planned-action.js";
import { buildCommitAction, executeCommit } from "./commit-service.js";
import { buildPushAction, executePush } from "./push-service.js";

function buildRepositorySnapshot(state) {
  const details = state?.readiness?.details ?? {};
  if (!state?.readiness || typeof details !== "object") {
    return null;
  }

  return {
    repositoryReady: details.isGitRepository === true,
    headBranch: typeof details.branch === "string" ? details.branch : null,
    hasRemote: details.hasRemote === true,
    remoteNames: Array.isArray(details.remoteNames) ? [...details.remoteNames] : [],
  };
}

function buildWorkflowContext(sessionID, approvalRequest) {
  return {
    sessionID,
    commandName: approvalRequest.command ?? approvalRequest.workflow ?? null,
    phase: approvalRequest.phase ?? "finish",
  };
}

function resolveWorkflowPolicy(pluginContext, workflowContext) {
  const resolvedPolicy = pluginContext?.resolvePolicy?.(workflowContext);
  return resolvedPolicy?.outcome === "allow" ? resolvedPolicy.details?.policy ?? null : null;
}

function buildPushCorrelationId(sessionID, remoteName, branchName) {
  return `push:${sessionID}:${remoteName}:${branchName}`;
}

function buildPushProposal({ sessionID, workflowPolicy, repositorySnapshot, observedState }) {
  const finalizationMode = workflowPolicy?.finalization;
  if (
    finalizationMode !== "commit-and-push" &&
    finalizationMode !== "commit-optional-push"
  ) {
    return null;
  }

  const hasRemote =
    observedState?.hasRemote === true || repositorySnapshot?.hasRemote === true;
  if (!hasRemote) {
    return null;
  }

  const remoteName = Array.isArray(repositorySnapshot?.remoteNames)
    ? repositorySnapshot.remoteNames.find(
        (name) => typeof name === "string" && name.length > 0,
      ) ?? null
    : null;
  const branchName =
    typeof observedState?.headBranch === "string" && observedState.headBranch.length > 0
      ? observedState.headBranch
      : typeof repositorySnapshot?.headBranch === "string" && repositorySnapshot.headBranch.length > 0
        ? repositorySnapshot.headBranch
        : null;

  if (!remoteName || !branchName) {
    return null;
  }

  return buildPushAction({
    remoteName,
    branchName,
    targetBranch: branchName,
    correlationId: buildPushCorrelationId(sessionID, remoteName, branchName),
  });
}

async function publishPushApprovalIfNeeded({
  workflowState,
  sessionID,
  approvalRequest,
  pluginContext,
  audit,
  repositorySnapshot,
  observedState,
}) {
  const workflowContext = buildWorkflowContext(sessionID, approvalRequest);
  const workflowPolicy = resolveWorkflowPolicy(pluginContext, workflowContext);
  const pushProposal = buildPushProposal({
    sessionID,
    workflowPolicy,
    repositorySnapshot,
    observedState,
  });
  const nextState = workflowState.get(sessionID) ?? {};

  workflowState.set(sessionID, {
    ...nextState,
    commitProposal: null,
    pushProposal,
  });

  if (!pushProposal) {
    return;
  }

  if (audit) {
    await audit.info("git.action.planned", {
      event: "git.action.planned",
      timestamp: new Date().toISOString(),
      workflow: workflowContext.commandName,
      command: workflowContext.commandName,
      outcome: "allow",
      details: {
        kind: "push",
        action: "push",
        requiresApproval: true,
        remoteName: pushProposal.remoteName,
        branchName: pushProposal.branchName,
      },
    });
  }

  await publishNextPlannedAction({
    workflowState,
    workflowContext,
    workflowPolicy,
    audit,
    pluginContext,
  });
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

  const state = workflowState.get(sessionID) ?? {};
  const repositorySnapshot = buildRepositorySnapshot(state);
  const workflowContext = buildWorkflowContext(sessionID, approvalRequest);
  const approvedAt = resolution?.resolvedAt ?? new Date().toISOString();

  let envelope;
  if (approvalRequest.actionType === "commit" && approvalRequest.proposal?.kind === "commit") {
    const plan = buildCommitAction({
      message: approvalRequest.proposal.message,
      branchName: repositorySnapshot?.headBranch ?? null,
      correlationId: approvalRequest.proposal.correlationId ?? null,
      files: approvalRequest.proposal.files ?? [],
    });

    envelope = await executeCommit({
      plan,
      approval: { resolvedAt: approvedAt },
      expectedState: repositorySnapshot,
      repositorySnapshot,
      workflowContext,
      gitRunner: pluginContext?.gitActionRunner ?? null,
      audit,
      workflowState,
    });

    if (envelope.ok) {
      await publishPushApprovalIfNeeded({
        workflowState,
        sessionID,
        approvalRequest,
        pluginContext,
        audit,
        repositorySnapshot,
        observedState: envelope.observedState ?? null,
      });
    }
  } else if (
    approvalRequest.actionType === "push" &&
    approvalRequest.proposal?.kind === "push"
  ) {
    const branchName =
      approvalRequest.proposal.branchName ??
      approvalRequest.proposal.branch ??
      repositorySnapshot?.headBranch ??
      null;
    const targetBranch =
      approvalRequest.proposal.targetBranch ?? branchName ?? null;
    const remoteName =
      approvalRequest.proposal.remoteName ??
      approvalRequest.proposal.remote ??
      "origin";

    const plan = buildPushAction({
      branchName,
      targetBranch,
      remoteName,
      correlationId: approvalRequest.proposal.correlationId ?? null,
    });

    envelope = await executePush({
      plan,
      approval: { resolvedAt: approvedAt },
      expectedState: repositorySnapshot,
      repositorySnapshot,
      workflowContext,
      gitRunner: pluginContext?.gitActionRunner ?? null,
      audit,
      workflowState,
    });

    if (envelope.ok) {
      const nextState = workflowState.get(sessionID) ?? {};
      workflowState.set(sessionID, {
        ...nextState,
        pushProposal: null,
      });
    }
  } else {
    return { outcome: "skip", reason: "unsupported-action-type" };
  }

  return {
    outcome: "executed",
    envelope,
  };
}
