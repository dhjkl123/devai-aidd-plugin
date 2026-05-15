import {
  buildBranchProposal,
  computeCandidateBranchName,
  evaluateBranchStrategy,
} from "./branch-service.js";

function listLocalBranches(pluginContext) {
  if (typeof pluginContext?.listLocalBranches !== "function") return [];
  try {
    const branches = pluginContext.listLocalBranches();
    return Array.isArray(branches)
      ? branches.filter((branch) => typeof branch === "string" && branch.length > 0)
      : [];
  } catch {
    return [];
  }
}

function buildDecisionContext({
  workflowContext,
  workflowPolicy,
  branchConfig,
  currentBranch,
  candidateName,
  localBranches,
  strategy,
  state,
} = {}) {
  return {
    workflow: {
      commandName: workflowContext?.commandName ?? null,
      arguments: workflowContext?.arguments ?? "",
      sessionID: workflowContext?.sessionID ?? null,
      phase: workflowContext?.phase ?? null,
    },
    repository: {
      currentBranch: currentBranch ?? null,
      localBranches,
    },
    policy: workflowPolicy
      ? {
          category: workflowPolicy.category ?? null,
          identityStrategy: workflowPolicy.identityStrategy ?? null,
          branchRequired: workflowPolicy.branchRequired === true,
          finalization: workflowPolicy.finalization ?? null,
        }
      : null,
    branchGuardrails: {
      longLivedBranches: Array.isArray(branchConfig?.longLivedBranches)
        ? [...branchConfig.longLivedBranches]
        : [],
      defaultMergeTarget:
        typeof branchConfig?.defaultMergeTarget === "string"
          ? branchConfig.defaultMergeTarget
          : "",
      validationRegex:
        typeof branchConfig?.validationRegex === "string" ? branchConfig.validationRegex : "",
      decision: branchConfig?.decision ?? null,
    },
    recommended: {
      candidateName,
      currentBranch: currentBranch ?? null,
      action: buildBranchProposal({ strategy, candidateName, currentBranch })?.action ?? null,
    },
    recentContext: {
      lastContinuationDecision: state?.lastContinuationDecision ?? null,
      finalizationCompletion: state?.finalizationCompletion ?? null,
      approvalHistoryTail: Array.isArray(state?.approvalHistory)
        ? state.approvalHistory.slice(-3)
        : [],
    },
  };
}

function buildBranchDecisionSummary(decision, { reason, branchName } = {}) {
  return {
    status: "evaluated",
    reason: reason ?? null,
    source: decision?.source ?? "deterministic",
    conclusion: decision?.conclusion ?? null,
    branchName: branchName ?? null,
    evaluatedAt: new Date().toISOString(),
  };
}

function normalizeRequestedBranchName(rawName, candidateName) {
  if (typeof rawName === "string" && rawName.trim().length > 0) {
    return rawName.trim();
  }
  if (typeof candidateName === "string" && candidateName.length > 0) {
    return candidateName;
  }
  return null;
}

function compileRegex(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function validateDecisionBranchName(branchName, branchConfig) {
  if (typeof branchName !== "string" || branchName.length === 0) {
    return false;
  }
  const compiled = compileRegex(branchConfig?.validationRegex);
  if (!compiled) {
    return typeof branchConfig?.validationRegex === "string"
      ? branchConfig.validationRegex.length === 0
      : true;
  }
  return compiled.test(branchName);
}

function normalizeModelDecision(raw, context = {}) {
  if (!raw || typeof raw !== "object") {
    return { valid: false, reason: "missing-model-decision" };
  }

  const conclusion =
    typeof raw.conclusion === "string" && raw.conclusion.length > 0
      ? raw.conclusion
      : null;
  if (!conclusion) {
    return { valid: false, reason: "missing-model-conclusion" };
  }

  const currentBranch = context.currentBranch ?? null;
  const localBranchSet = new Set(context.localBranches ?? []);
  const branchName = normalizeRequestedBranchName(raw.branchName, context.candidateName);

  switch (conclusion) {
    case "stay-on-current-branch":
      if (!currentBranch) {
        return { valid: false, reason: "no-current-branch-for-stay" };
      }
      return {
        valid: true,
        source: "model",
        conclusion,
        proposal: {
          kind: "branch",
          action: "stay",
          name: currentBranch,
          reason: "model-selected-current-branch",
          current: currentBranch,
          policyMatch: context.strategy?.policyMatch ?? null,
        },
        branchName: currentBranch,
      };
    case "reuse-current-matching-branch":
      if (!currentBranch || !context.candidateName || currentBranch !== context.candidateName) {
        return { valid: false, reason: "current-branch-not-matching-candidate" };
      }
      return {
        valid: true,
        source: "model",
        conclusion,
        proposal: {
          kind: "branch",
          action: "stay",
          name: currentBranch,
          reason: "model-reused-current-matching-branch",
          current: currentBranch,
          policyMatch: context.strategy?.policyMatch ?? null,
        },
        branchName: currentBranch,
      };
    case "switch-to-existing-branch":
      if (!branchName || !localBranchSet.has(branchName)) {
        return { valid: false, reason: "missing-existing-branch-target" };
      }
      if (branchName === currentBranch) {
        return {
          valid: true,
          source: "model",
          conclusion: "reuse-current-matching-branch",
          proposal: null,
          branchName,
        };
      }
      return {
        valid: true,
        source: "model",
        conclusion,
        branchName,
        proposal: {
          kind: "branch",
          action: "switch",
          name: branchName,
          reason: "model-selected-existing-branch",
          current: currentBranch,
          policyMatch: context.strategy?.policyMatch ?? null,
        },
      };
    case "create-new-branch":
      if (!branchName || !validateDecisionBranchName(branchName, context.branchConfig)) {
        return { valid: false, reason: "invalid-new-branch-name" };
      }
      if (localBranchSet.has(branchName)) {
        return { valid: false, reason: "new-branch-already-exists" };
      }
      return {
        valid: true,
        source: "model",
        conclusion,
        branchName,
        proposal: {
          kind: "branch",
          action: "create",
          name: branchName,
          reason: "model-selected-new-branch",
          current: currentBranch,
          policyMatch: context.strategy?.policyMatch ?? null,
        },
      };
    case "ask-user":
      return {
        valid: true,
        source: "model",
        conclusion,
        branchName,
        proposal: null,
      };
    default:
      return { valid: false, reason: "unsupported-model-conclusion", conclusion };
  }
}

export async function resolveBranchPlanning({
  workflowContext,
  workflowPolicy = null,
  branchConfig = null,
  currentBranch = null,
  workflowState = null,
  pluginContext = null,
  audit = null,
  persist = true,
} = {}) {
  if (!workflowContext?.sessionID) {
    return { proposal: null, strategy: null, decision: null, localBranches: [] };
  }

  const state = workflowState?.get?.(workflowContext.sessionID) ?? {};
  const strategy = evaluateBranchStrategy({
    workflowContext,
    workflowPolicy,
    branchConfig,
    currentBranch,
  });

  if (strategy.requirement === "unnecessary") {
    const decision = {
      source: "policy",
      conclusion: "stay-on-current-branch",
      reason: strategy.reason,
      branchName: currentBranch ?? null,
    };
    if (persist && workflowState) {
      workflowState.set(workflowContext.sessionID, {
        ...state,
        branchProposal: null,
      });
    }
    return { proposal: null, strategy, decision, localBranches: [] };
  }

  const candidateName = computeCandidateBranchName({
    workflowContext,
    workflowPolicy,
    branchConfig,
  });
  const localBranches = listLocalBranches(pluginContext);
  const deterministicProposal = buildBranchProposal({
    strategy,
    candidateName,
    currentBranch,
  });

  let proposal = deterministicProposal;
  let decision = {
    source: "deterministic",
    conclusion: proposal ? `${proposal.action}-proposal` : "reuse-current-matching-branch",
    reason: proposal?.reason ?? strategy.reason,
    branchName: proposal?.name ?? currentBranch ?? candidateName ?? null,
  };

  if (typeof pluginContext?.resolveBranchDecision === "function") {
    const decisionContext = buildDecisionContext({
      workflowContext,
      workflowPolicy,
      branchConfig,
      currentBranch,
      candidateName,
      localBranches,
      strategy,
      state,
    });
    let rawDecision = null;
    try {
      if (audit) {
        try {
          await audit.info("branch.decision.requested", {
            event: "branch.decision.requested",
            timestamp: new Date().toISOString(),
            workflow: workflowContext.commandName,
            command: workflowContext.commandName,
            sessionID: workflowContext.sessionID,
            outcome: "allow",
            details: {
              currentBranch,
              candidateName,
              localBranchCount: localBranches.length,
            },
          });
        } catch {
          // best-effort
        }
      }
      rawDecision = await pluginContext.resolveBranchDecision(decisionContext);
    } catch (error) {
      rawDecision = { invalid: true, error: error?.message ?? String(error) };
    }

    const normalizedDecision = normalizeModelDecision(rawDecision, {
      candidateName,
      currentBranch,
      localBranches,
      branchConfig,
      strategy,
    });

    if (normalizedDecision.valid) {
      proposal = normalizedDecision.proposal;
      decision = {
        source: normalizedDecision.source,
        conclusion: normalizedDecision.conclusion,
        reason: rawDecision?.reason ?? "model-decision-accepted",
        branchName: normalizedDecision.branchName ?? proposal?.name ?? null,
      };
    } else if (audit) {
      try {
        await audit.info("branch.decision.invalid", {
          event: "branch.decision.invalid",
          timestamp: new Date().toISOString(),
          workflow: workflowContext.commandName,
          command: workflowContext.commandName,
          sessionID: workflowContext.sessionID,
          outcome: "skip",
          details: {
            reason: normalizedDecision.reason,
            candidateName,
            currentBranch,
          },
        });
      } catch {
        // best-effort
      }
    }
  }

  if (persist && workflowState) {
    workflowState.set(workflowContext.sessionID, {
      ...state,
      branchProposal: proposal ?? null,
      workflowRunCurrent: state?.workflowRunCurrent
        ? {
            ...state.workflowRunCurrent,
            branchDecision: buildBranchDecisionSummary(decision, {
              reason: decision.reason,
              branchName: decision.branchName ?? proposal?.name ?? null,
            }),
          }
        : state?.workflowRunCurrent ?? null,
    });
  }

  return { proposal, strategy, decision, localBranches };
}
