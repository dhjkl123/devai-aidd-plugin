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
  branchProposal = null,
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

  let branchPreview = branchProposal ?? null;
  if (!branchPreview && workflowPolicy?.branchRequired === true && !unavailable) {
    const strategy = evaluateBranchStrategy({
      workflowContext,
      workflowPolicy,
      branchConfig,
      currentBranch,
    });
    if (strategy.requirement !== "unnecessary") {
      branchPreview = buildBranchProposal({
        strategy,
        candidateName: computeCandidateBranchName({
          workflowContext,
          workflowPolicy,
          branchConfig,
        }),
        currentBranch,
      });
    }
  }
  if (!unavailable && branchPreview && branchPreview.action !== "stay") {
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

  return {
    shouldAsk: steps.length > 0,
    reason: steps.length > 0 ? "startup-actions-required" : "repository-ready",
    steps,
    branchPreview,
  };
}
