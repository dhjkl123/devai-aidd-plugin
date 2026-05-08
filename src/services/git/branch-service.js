function normalizeBranchConfig(branchConfig = {}) {
  return {
    pattern: branchConfig.pattern || "{type}/{ticket}-{slug}",
    defaultType: branchConfig.defaultType || "chore",
    fallbackTicket: branchConfig.fallbackTicket || "no-ticket",
    longLivedBranches: Array.isArray(branchConfig.longLivedBranches)
      ? [...branchConfig.longLivedBranches]
      : ["main", "master"],
    validationRegex: branchConfig.validationRegex || "",
    commandTypeMap:
      branchConfig.commandTypeMap && typeof branchConfig.commandTypeMap === "object"
        ? branchConfig.commandTypeMap
        : {},
  };
}

function clonePolicyMatch(commandName, workflowPolicy) {
  if (!workflowPolicy || typeof workflowPolicy !== "object") {
    return null;
  }

  return {
    commandName: commandName || null,
    category: workflowPolicy.category,
    identityStrategy: workflowPolicy.identityStrategy,
    branchRequired: workflowPolicy.branchRequired,
    finalization: workflowPolicy.finalization,
  };
}

function compileValidationRegex(validationRegex) {
  if (!validationRegex) {
    return null;
  }

  try {
    return new RegExp(validationRegex);
  } catch {
    return null;
  }
}

function isBranchNameValid(branchName, validationRegex) {
  if (typeof branchName !== "string" || branchName.length === 0) {
    return false;
  }
  if (!validationRegex) {
    return true;
  }

  const compiledRegex = compileValidationRegex(validationRegex);
  if (!compiledRegex) {
    return false;
  }

  return compiledRegex.test(branchName);
}

export function slugifyArguments(value, { fallback } = {}) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length > 0) {
    return normalized;
  }

  return String(fallback || "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractTicketToken(args, { fallbackTicket } = {}) {
  const match = String(args || "").match(/[A-Z]+-\d+/);
  return match ? match[0] : fallbackTicket || "no-ticket";
}

export function evaluateBranchStrategy({
  workflowContext,
  workflowPolicy,
  branchConfig,
  currentBranch,
} = {}) {
  const normalizedConfig = normalizeBranchConfig(branchConfig);
  const current = typeof currentBranch === "string" && currentBranch.length > 0 ? currentBranch : null;
  const isLongLived =
    current !== null && normalizedConfig.longLivedBranches.includes(current);

  if (!workflowPolicy) {
    return {
      requirement: "unnecessary",
      reason: "no-policy-match",
      policyMatch: null,
      isLongLived,
      currentBranch: current,
      validationRegex: normalizedConfig.validationRegex,
    };
  }

  const policyMatch = clonePolicyMatch(workflowContext?.commandName, workflowPolicy);

  if (workflowPolicy.branchRequired === true) {
    return {
      requirement: "required",
      reason: "policy-requires-branch",
      policyMatch,
      isLongLived,
      currentBranch: current,
      validationRegex: normalizedConfig.validationRegex,
    };
  }

  if (workflowPolicy.category === "implementation") {
    return {
      requirement: "optional",
      reason: "implementation-policy-optional-branch",
      policyMatch,
      isLongLived,
      currentBranch: current,
      validationRegex: normalizedConfig.validationRegex,
    };
  }

  return {
    requirement: "unnecessary",
    reason: "policy-does-not-require-branch",
    policyMatch,
    isLongLived,
    currentBranch: current,
    validationRegex: normalizedConfig.validationRegex,
  };
}

export function computeCandidateBranchNameDetailed({
  workflowContext,
  workflowPolicy,
  branchConfig,
} = {}) {
  if (!workflowContext || !workflowContext.commandName) {
    return { name: null, valid: false, reason: "no-workflow-context" };
  }

  const normalizedConfig = normalizeBranchConfig(branchConfig);
  const commandName = workflowContext.normalizedCommand || workflowContext.commandName;
  const type =
    normalizedConfig.commandTypeMap[commandName] || normalizedConfig.defaultType;
  const ticket = extractTicketToken(workflowContext.arguments, {
    fallbackTicket: normalizedConfig.fallbackTicket,
  });
  const slugSource = String(workflowContext.arguments || "").replace(/[A-Z]+-\d+/g, " ");
  const slugFallback = commandName || "workflow";
  const slug = slugifyArguments(slugSource, { fallback: slugFallback });
  const name = normalizedConfig.pattern
    .replace("{type}", type)
    .replace("{ticket}", ticket)
    .replace("{slug}", slug);

  if (!isBranchNameValid(name, normalizedConfig.validationRegex)) {
    return {
      name,
      valid: false,
      reason: "candidate-failed-validation",
      policyMatch: clonePolicyMatch(workflowContext.commandName, workflowPolicy),
    };
  }

  return { name, valid: true, reason: "candidate-valid" };
}

export function computeCandidateBranchName(input = {}) {
  const result = computeCandidateBranchNameDetailed(input);
  return result.valid ? result.name : null;
}

export function buildBranchProposal({ strategy, candidateName, currentBranch } = {}) {
  if (!strategy || strategy.requirement === "unnecessary" || !candidateName) {
    return null;
  }

  const current = typeof currentBranch === "string" && currentBranch.length > 0 ? currentBranch : null;
  if (current === candidateName) {
    return null;
  }

  let action = "switch";
  let reason = "candidate-differs-from-current";

  if (current === null) {
    action = "create";
    reason = "no-current-branch";
  } else if (strategy.isLongLived) {
    action = "create";
    reason = "current-branch-is-long-lived";
  } else if (!isBranchNameValid(current, strategy.validationRegex)) {
    action = "create";
    reason = "current-branch-failed-validation";
  }

  return {
    kind: "branch",
    action,
    name: candidateName,
    reason,
    current,
    policyMatch: strategy.policyMatch,
  };
}
