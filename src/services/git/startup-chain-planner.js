import {
  buildBranchProposal,
  computeCandidateBranchName,
  evaluateBranchStrategy,
} from "./branch-service.js";
import { isReadinessUnavailable } from "./readiness-state-policy.js";

export function buildStartupChainPlan({
  readiness,
  readinessGate = null,
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
  const gateEnabled = readinessGate?.enabled !== false;
  const needsInit =
    readiness?.outcome === "ask" && readiness?.reason === "git-not-initialized";
  const unavailable = isReadinessUnavailable(readiness);
  const repositoryKnownInitialized =
    readiness?.outcome === "allow" && isGitRepository;

  if (gateEnabled && needsInit) {
    steps.push({
      key: "init",
      kind: "init",
      action: "git-init",
      proposal: details.proposal ?? null,
      correlationId: details.proposal?.correlationId ?? null,
    });
  }

  if (
    gateEnabled &&
    !unavailable &&
    (needsInit || (repositoryKnownInitialized && !hasCommit))
  ) {
    steps.push({
      key: "baseline",
      kind: "commit",
      action: "baseline-commit",
      correlationId: `startup-baseline:${workflowContext?.sessionID ?? "no-session"}:${Date.now().toString(36)}`,
    });
  }

  let branchPreview = null;
  if (
    workflowPolicy?.branchRequired === true &&
    !unavailable &&
    (needsInit || repositoryKnownInitialized)
  ) {
    const branchCurrent =
      typeof currentBranch === "string" && currentBranch.length > 0
        ? currentBranch
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
