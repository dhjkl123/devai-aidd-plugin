/**
 * Workflow policy resolver service.
 *
 * Pure function — no I/O, no logger calls, no external state.
 * Returns the standard policy result envelope:
 *   { outcome, reason, message, details }
 * where outcome is one of: "allow" | "deny" | "ask" | "skip"
 *
 * Architecture reference:
 *   - Format Patterns → API Response Formats
 *   - Communication Patterns → Event System Patterns
 */

/**
 * Build the canonical safe-default policy object.
 * Exported so tests and future stories can assert on the same fallback shape.
 *
 * @returns {{ category: string, identityStrategy: string, branchRequired: boolean, finalization: string }}
 */
export function buildSafeDefaultPolicy() {
  return {
    category: "uncategorized",
    identityStrategy: "ticket-or-args",
    branchRequired: false,
    finalization: "no-forced-finalization",
  };
}

/**
 * Resolve the effective workflow policy for a given workflow context.
 *
 * @param {object|null} workflowContext - The workflow context object produced by detectWorkflowContext.
 *   Expected shape: { commandName, arguments, sessionID, detectedAt, phase }
 * @param {object} runtimeConfig - The effective runtime configuration produced by loadRuntimeConfig.
 *   Expected shape: { branch: { ... }, workflowPolicy: { ... }, audit: { ... } }
 * @returns {{ outcome: string, reason: string, message: string, details: object }}
 */
export function resolveWorkflowPolicy(workflowContext, runtimeConfig) {
  // Case 1: null context or missing commandName → skip
  if (!workflowContext || !workflowContext.commandName) {
    return {
      outcome: "skip",
      reason: "no-workflow-context",
      message: "No BMAD workflow command detected.",
      details: { commandName: null },
    };
  }

  const commandName = workflowContext.commandName;
  const workflowPolicy = (runtimeConfig && runtimeConfig.workflowPolicy) || {};
  const branch = (runtimeConfig && runtimeConfig.branch) || {};

  // Build shared branch details (used in both matched and fallback cases)
  const commandType =
    (branch.commandTypeMap && branch.commandTypeMap[commandName]) ||
    branch.defaultType ||
    "chore";

  const branchDetails = {
    defaultType: branch.defaultType || "chore",
    commandType,
    longLivedBranches: Array.isArray(branch.longLivedBranches)
      ? [...branch.longLivedBranches]
      : [],
    fallbackTicket: branch.fallbackTicket || "no-ticket",
    defaultMergeTarget: branch.defaultMergeTarget || "",
    pattern: branch.pattern || "{type}/{ticket}-{slug}",
    validationRegex: branch.validationRegex || "",
  };

  // Case 2: commandName recognized but no policy entry → safe-default fallback
  if (!Object.prototype.hasOwnProperty.call(workflowPolicy, commandName)) {
    return {
      outcome: "ask",
      reason: "policy-default-fallback",
      message: `No explicit policy for ${commandName}; using safe defaults.`,
      details: {
        commandName,
        fallback: buildSafeDefaultPolicy(),
      },
    };
  }

  // Case 3: commandName matched → return resolved policy
  const policyEntry = workflowPolicy[commandName];

  // Build a fresh policy object to avoid mutating runtimeConfig
  const effectivePolicy = {
    category: policyEntry.category,
    identityStrategy: policyEntry.identityStrategy,
    branchRequired: policyEntry.branchRequired,
    finalization: policyEntry.finalization,
  };
  if (Object.prototype.hasOwnProperty.call(policyEntry, "artifactKey")) {
    effectivePolicy.artifactKey = policyEntry.artifactKey;
  }

  return {
    outcome: "allow",
    reason: "policy-resolved",
    message: `Resolved workflow policy for ${commandName}.`,
    details: {
      policy: effectivePolicy,
      branch: branchDetails,
    },
  };
}
