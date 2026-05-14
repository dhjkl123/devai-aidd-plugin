import { APPROVAL_OUTCOMES } from "../approval/approval-resolution-state.js";
import { normalizeBaselineAnswer, resolveBaselineCommitFiles } from "./baseline-commit-service.js";
import { buildBaselineCommitProposal } from "./build-init-proposal.js";
import { buildCommitAction, executeCommit } from "./commit-service.js";
import { buildInitAction, executeInit } from "./init-service.js";
import { buildBranchAction, executeBranch } from "./branch-action-service.js";
import { checkRepositoryReadiness } from "./check-repository-readiness.js";
import {
  buildBranchProposal,
  computeCandidateBranchName,
  evaluateBranchStrategy,
} from "./branch-service.js";
import {
  buildAssumedRepositoryReadyReadiness,
  resolveReadinessStateUpdate,
} from "./readiness-state-policy.js";

export async function executeStartupChain({
  workflowState,
  sessionID,
  chain,
  answers,
  pluginContext,
  audit,
} = {}) {
  if (!workflowState || !sessionID || !chain || !answers) {
    return { outcome: "skip", reason: "missing-context" };
  }

  const state = workflowState.get(sessionID) ?? {};
  const workflowContext = chain.workflowContext ?? {
    sessionID,
    commandName: state.commandName ?? state.command ?? state.workflow ?? null,
    phase: "start",
  };
  const workflowPolicy = chain.workflowPolicy ?? null;
  const resolved = [];
  let readiness = state.readiness ?? null;
  let repositorySnapshot = buildRepositorySnapshot(readiness);

  for (const step of chain.steps ?? []) {
    if (step.key === "init") {
      const answer = answers.init;
      const decision = parseInitDecision(answer);
      resolved.push({ key: "init", decision, answer });
      if (decision !== APPROVAL_OUTCOMES.ACCEPT) {
        addBlockedDownstreamSteps({
          chain,
          fromKey: "init",
          resolved,
          answers,
          reason: "git-init-skipped",
        });
        updateState(workflowState, sessionID, {
          gitInitSkipped: true,
          initProposal: null,
          commitProposal: null,
          branchProposal: null,
          startupChainCurrent: null,
          pendingStartupQuestion: null,
        });
        await auditResolved({ audit, sessionID, workflowContext, chain, answers, resolved });
        return { outcome: "resolved", resolved };
      }

      const proposal = step.proposal ?? readiness?.details?.proposal ?? {};
      const plan = buildInitAction({
        directory: pluginContext?.directory ?? "",
        correlationId: proposal.correlationId ?? step.correlationId ?? null,
      });
      const envelope = await executeInit({
        plan,
        approval: { resolvedAt: new Date().toISOString() },
        expectedState: repositorySnapshot,
        repositorySnapshot,
        workflowContext,
        gitRunner: pluginContext?.gitActionRunner ?? null,
        audit,
        workflowState,
      });
      if (!envelope.ok) {
        await auditResolved({ audit, sessionID, workflowContext, chain, answers, resolved });
        return { outcome: "failed", envelope, resolved };
      }
      readiness = resolveRefreshedReadiness({
        workflowState,
        sessionID,
        previousReadiness: readiness,
        rawReadiness: refreshReadiness({
          pluginContext,
          fallback: readiness,
          branch: null,
          sessionID,
          workflowContext,
          stage: "startup-chain-post-init-readiness-refresh",
        }),
        unavailableFallbackReadiness: buildAssumedRepositoryReadyReadiness({
          previousReadiness: readiness,
          directory: pluginContext?.directory,
          hasCommit: false,
          branch: null,
        }),
      });
      repositorySnapshot = buildRepositorySnapshot(readiness);
      updateState(workflowState, sessionID, { readiness, initProposal: null });
    }

    if (step.key === "baseline") {
      const answer = answers.baseline;
      const decision = parseBaselineDecision(answer);
      resolved.push({ key: "baseline", decision, answer });
      if (decision !== APPROVAL_OUTCOMES.ACCEPT) {
        addBlockedDownstreamSteps({
          chain,
          fromKey: "baseline",
          resolved,
          answers,
          reason: "baseline-skipped",
        });
        updateState(workflowState, sessionID, {
          baselineSkipped: true,
          commitProposal: null,
          branchProposal: null,
          startupChainCurrent: null,
          pendingStartupQuestion: null,
        });
        await auditResolved({ audit, sessionID, workflowContext, chain, answers, resolved });
        return { outcome: "resolved", resolved };
      }

      const listed = safeListChangedFiles(pluginContext, {
        hook: "startup-chain-executor",
        stage: "startup-chain-baseline-files",
        sessionID,
        workflow: workflowContext?.commandName ?? null,
        phase: workflowContext?.phase ?? null,
      });
      const proposal = buildBaselineCommitProposal({
        directory: pluginContext?.directory ?? "",
        files: listed,
        sessionID,
        correlationId: step.correlationId ?? null,
      });
      const baseline = await resolveBaselineCommitFiles({
        answer,
        proposal,
        directory: pluginContext?.directory ?? "",
        listChangedFiles:
          typeof pluginContext?.listChangedFiles === "function"
            ? () =>
                pluginContext.listChangedFiles({
                  hook: "startup-chain-executor",
                  stage: "startup-chain-baseline-resolve-files",
                  sessionID,
                  workflow: workflowContext?.commandName ?? null,
                  phase: workflowContext?.phase ?? null,
                })
            : null,
        audit,
        workflowContext,
        sessionID,
      });
      const plan = buildCommitAction({
        message: proposal.message,
        branchName: repositorySnapshot?.headBranch ?? null,
        correlationId: proposal.correlationId ?? null,
        files: baseline.files,
        allowEmpty: baseline.allowEmpty,
      });
      const envelope = await executeCommit({
        plan,
        approval: { resolvedAt: new Date().toISOString() },
        expectedState: repositorySnapshot,
        repositorySnapshot,
        workflowContext,
        gitRunner: pluginContext?.gitActionRunner ?? null,
        audit,
        workflowState,
      });
      if (!envelope.ok) {
        await auditResolved({ audit, sessionID, workflowContext, chain, answers, resolved });
        return { outcome: "failed", envelope, resolved };
      }
      readiness = resolveRefreshedReadiness({
        workflowState,
        sessionID,
        previousReadiness: readiness,
        rawReadiness: refreshReadiness({
          pluginContext,
          fallback: readiness,
          sessionID,
          workflowContext,
          stage: "startup-chain-post-baseline-readiness-refresh",
        }),
        unavailableFallbackReadiness: buildAssumedRepositoryReadyReadiness({
          previousReadiness: readiness,
          directory: pluginContext?.directory,
          hasCommit: true,
        }),
      });
      repositorySnapshot = buildRepositorySnapshot(readiness);
      updateState(workflowState, sessionID, { readiness, commitProposal: null });
    }

    if (step.key === "branch") {
      const answer = answers.branch;
      const decision = parseApproveDecision(answer);
      resolved.push({ key: "branch", decision, answer });
      if (decision !== APPROVAL_OUTCOMES.ACCEPT) {
        updateState(workflowState, sessionID, {
          branchProposal: null,
          startupChainCurrent: null,
          pendingStartupQuestion: null,
        });
        await auditResolved({ audit, sessionID, workflowContext, chain, answers, resolved });
        return { outcome: "resolved", resolved };
      }

      const proposal = recomputeBranchProposal({
        chain,
        workflowContext,
        workflowPolicy,
        readiness,
        branchConfig: chain.branchConfig ?? pluginContext?.runtimeConfig?.config?.branch ?? null,
      });
      if (!proposal) continue;
      const plan = buildBranchAction({ proposal, correlationId: step.correlationId ?? null });
      const expectedBranchState = {
        ...(repositorySnapshot ?? {}),
        headBranch: plan.targetBranch,
      };
      const envelope = await executeBranch({
        plan,
        approval: { resolvedAt: new Date().toISOString() },
        expectedState: expectedBranchState,
        repositorySnapshot,
        workflowContext,
        gitRunner: pluginContext?.gitActionRunner ?? null,
        audit,
        workflowState,
      });
      if (!envelope.ok) {
        await auditResolved({ audit, sessionID, workflowContext, chain, answers, resolved });
        return { outcome: "failed", envelope, resolved };
      }
      readiness = resolveRefreshedReadiness({
        workflowState,
        sessionID,
        previousReadiness: readiness,
        rawReadiness: refreshReadiness({
          pluginContext,
          fallback: readiness,
          branch: envelope.details?.observedState?.headBranch ?? plan.targetBranch,
          sessionID,
          workflowContext,
          stage: "startup-chain-post-branch-readiness-refresh",
        }),
        unavailableFallbackReadiness: buildAssumedRepositoryReadyReadiness({
          previousReadiness: readiness,
          directory: pluginContext?.directory,
          hasCommit: true,
          branch: envelope.details?.observedState?.headBranch ?? plan.targetBranch,
        }),
      });
      updateState(workflowState, sessionID, { readiness, branchProposal: null });
    }
  }

  updateState(workflowState, sessionID, {
    startupChainCurrent: null,
    pendingStartupQuestion: null,
    initProposal: null,
    commitProposal: null,
    branchProposal: null,
  });
  await auditResolved({ audit, sessionID, workflowContext, chain, answers, resolved });
  return { outcome: "resolved", resolved };
}

function parseInitDecision(answer) {
  return normalizeAnswer(answer).startsWith("initialize")
    ? APPROVAL_OUTCOMES.ACCEPT
    : APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE;
}

function parseBaselineDecision(answer) {
  return normalizeBaselineAnswer(answer) === "skip"
    ? APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE
    : APPROVAL_OUTCOMES.ACCEPT;
}

function parseApproveDecision(answer) {
  const key = normalizeAnswer(answer);
  return key === "approve" || key === "approved" || key === "yes"
    ? APPROVAL_OUTCOMES.ACCEPT
    : APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE;
}

function normalizeAnswer(answer) {
  if (typeof answer !== "string") return "";
  return answer
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9-]+/g, " ")
    .trim();
}

function buildRepositorySnapshot(readiness) {
  const details = readiness?.details ?? {};
  if (!readiness || typeof details !== "object") return null;
  return {
    repositoryReady: details.isGitRepository === true,
    headBranch: typeof details.branch === "string" ? details.branch : null,
    hasRemote: details.hasRemote === true,
    remoteNames: Array.isArray(details.remoteNames) ? [...details.remoteNames] : [],
  };
}

function refreshReadiness({
  pluginContext,
  fallback,
  branch = undefined,
  sessionID = null,
  workflowContext = null,
  stage = "startup-chain-readiness-refresh",
} = {}) {
  try {
    const readiness = checkRepositoryReadiness({
      directory: pluginContext?.directory,
      gitRunner: pluginContext?.gitRunner,
      policy: null,
      trace: {
        hook: "startup-chain-executor",
        stage,
        sessionID,
        workflow: workflowContext?.commandName ?? null,
        phase: workflowContext?.phase ?? null,
      },
    });
    pluginContext?.debug?.log?.("startup-chain-executor", "readiness refresh completed", {
      outcome: readiness?.outcome,
      reason: readiness?.reason,
      isGitRepository: readiness?.details?.isGitRepository ?? null,
      hasCommit: readiness?.details?.hasCommit ?? null,
      branch: readiness?.details?.branch ?? null,
      errorCode: readiness?.details?.errorCode ?? null,
      errorName: readiness?.details?.errorName ?? null,
      errorStatus: readiness?.details?.errorStatus ?? null,
      errorSignal: readiness?.details?.errorSignal ?? null,
      errorMessage: readiness?.details?.errorMessage ?? null,
      stderrSummary: readiness?.details?.stderrSummary ?? null,
      failedProbe: readiness?.details?.failedProbe ?? null,
      failedProbeDurationMs: readiness?.details?.failedProbeDurationMs ?? null,
      probeTrace: readiness?.details?.probeTrace ?? null,
    });
    return readiness;
  } catch {
    if (branch === undefined) return fallback;
    return {
      ...(fallback ?? {}),
      details: {
        ...(fallback?.details ?? {}),
        isGitRepository: true,
        hasCommit: true,
        branch,
      },
    };
  }
}

function resolveRefreshedReadiness({
  workflowState,
  sessionID,
  previousReadiness,
  rawReadiness,
  unavailableFallbackReadiness,
}) {
  const stateUpdate = resolveReadinessStateUpdate({
    previousReadiness,
    nextReadiness: rawReadiness,
    unavailableFallbackReadiness,
  });
  updateState(workflowState, sessionID, {
    readiness: stateUpdate.readiness,
    latestReadinessError: stateUpdate.latestReadinessError,
  });
  return stateUpdate.readiness;
}

function safeListChangedFiles(pluginContext, trace = null) {
  if (typeof pluginContext?.listChangedFiles !== "function") return [];
  try {
    const files = pluginContext.listChangedFiles(trace);
    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
}

function recomputeBranchProposal({ chain, workflowContext, workflowPolicy, readiness, branchConfig }) {
  const currentBranch =
    typeof readiness?.details?.branch === "string" && readiness.details.branch.length > 0
      ? readiness.details.branch
      : null;
  const strategy = evaluateBranchStrategy({
    workflowContext,
    workflowPolicy,
    branchConfig,
    currentBranch,
  });
  if (strategy.requirement === "unnecessary") return null;
  const candidateName = computeCandidateBranchName({
    workflowContext,
    workflowPolicy,
    branchConfig,
  });
  return buildBranchProposal({ strategy, candidateName, currentBranch }) ?? chain.branchPreview ?? null;
}

function updateState(workflowState, sessionID, patch) {
  workflowState.set(sessionID, {
    ...(workflowState.get(sessionID) ?? {}),
    ...patch,
  });
}

// When an upstream step is skipped (init or baseline), downstream git actions
// cannot proceed (you cannot create a baseline commit without `git init`, and
// you cannot create a feature branch off an unborn HEAD). Record the
// downstream steps in `resolved` with an explicit `blockedBy` reason so the
// audit trail shows them — and so `tool.execute.after` can surface a clear
// message back to the model explaining why the answer the user gave was not
// acted on.
function addBlockedDownstreamSteps({ chain, fromKey, resolved, answers, reason }) {
  const steps = Array.isArray(chain?.steps) ? chain.steps : [];
  const startIndex = steps.findIndex((step) => step.key === fromKey) + 1;
  if (startIndex <= 0) return;
  for (let index = startIndex; index < steps.length; index += 1) {
    const key = steps[index].key;
    resolved.push({
      key,
      decision: APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE,
      answer: answers?.[key] ?? null,
      blockedBy: reason,
    });
  }
}

async function auditResolved({ audit, sessionID, workflowContext, chain, answers, resolved }) {
  if (!audit) return;
  try {
    await audit.info("startup.chain.resolved", {
      event: "startup.chain.resolved",
      timestamp: new Date().toISOString(),
      workflow: workflowContext?.commandName ?? null,
      command: workflowContext?.commandName ?? null,
      sessionID,
      outcome: "allow",
      details: {
        startupChainId: chain.startupChainId ?? null,
        answers,
        resolved,
      },
    });
  } catch {
    // best-effort
  }
}
