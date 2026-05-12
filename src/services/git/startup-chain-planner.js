import {
  buildBranchProposal,
  computeCandidateBranchName,
  evaluateBranchStrategy,
} from "./branch-service.js";

export function buildStartupChainPlan({
  readiness,
  workflowContext,
  workflowPolicy = null,
  branchConfig = null,
  currentBranch = null,
  state = null,
} = {}) {
  if (state?.gitInitSkipped === true) {
    return { shouldAsk: false, reason: "git-init-skipped", steps: [], branchPreview: null };
  }
  if (state?.baselineSkipped === true) {
    return { shouldAsk: false, reason: "baseline-skipped", steps: [], branchPreview: null };
  }

  const steps = [];
  const details = readiness?.details ?? {};
  const isGitRepository = details.isGitRepository === true;
  const hasCommit = details.hasCommit === true;

  if (!isGitRepository || readiness?.reason === "git-not-initialized") {
    steps.push({
      key: "init",
      kind: "init",
      action: "git-init",
      proposal: details.proposal ?? null,
      correlationId: details.proposal?.correlationId ?? null,
    });
  }

  if (!hasCommit) {
    steps.push({
      key: "baseline",
      kind: "commit",
      action: "baseline-commit",
      correlationId: `startup-baseline:${workflowContext?.sessionID ?? "no-session"}:${Date.now().toString(36)}`,
    });
  }

  let branchPreview = null;
  if (workflowPolicy?.branchRequired === true) {
    const branchCurrent =
      typeof currentBranch === "string" && currentBranch.length > 0
        ? currentBranch
        : typeof details.branch === "string" && details.branch.length > 0
          ? details.branch
          : null;
    const strategy = evaluateBranchStrategy({
      workflowContext,
      workflowPolicy,
      branchConfig,
      currentBranch: branchCurrent,
    });
    if (strategy.requirement !== "unnecessary") {
      const candidateName = computeCandidateBranchName({
        workflowContext,
        workflowPolicy,
        branchConfig,
      });
      branchPreview = buildBranchProposal({
        strategy,
        candidateName,
        currentBranch: branchCurrent,
      });
      if (branchPreview) {
        steps.push({
          key: "branch",
          kind: "branch",
          action: branchPreview.action,
          proposal: branchPreview,
          correlationId:
            branchPreview.correlationId ??
            `startup-branch:${workflowContext?.sessionID ?? "no-session"}:${branchPreview.name}`,
        });
      }
    }
  }

  return {
    shouldAsk: steps.length > 0,
    reason: steps.length > 0 ? "startup-actions-required" : "repository-ready",
    steps,
    branchPreview,
  };
}
