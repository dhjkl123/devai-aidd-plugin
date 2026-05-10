import {
  artifactScopeMatches,
  mergeTrackedFiles,
  normalizeTrackedFileEntry,
  splitFinalizableFiles,
  summarizeArtifactKinds,
} from "./finalization-artifacts.js";

function buildBaseDetails(workflowPolicy, matchedFiles, ignoredFiles) {
  return {
    hasFinalizableOutputs: matchedFiles.length > 0,
    artifactScope:
      workflowPolicy?.identityStrategy === "artifact-singleton"
        ? workflowPolicy?.artifactKey || "artifact-singleton"
        : workflowPolicy?.category || "workflow",
    artifactKinds: summarizeArtifactKinds(matchedFiles),
    matchedFiles,
    ignoredFiles,
    policyFinalization: workflowPolicy?.finalization || "no-forced-finalization",
    shouldProposeCommit: false,
    shouldConsiderPushLater: false,
  };
}

function resolveContinuationOptOut(lastContinuationDecision) {
  const outcome = lastContinuationDecision?.outcome;
  const reason = lastContinuationDecision?.reason;
  return outcome === "continue-without-automation" || reason === "continue-without-automation";
}

export function detectFinalizableOutputs({
  workflowContext = null,
  workflowPolicy = null,
  trackedFiles = [],
  repositorySnapshot = null,
  lastContinuationDecision = null,
  activeRecoveryGate = null,
} = {}) {
  const normalizedTrackedFiles = mergeTrackedFiles(
    (Array.isArray(trackedFiles) ? trackedFiles : []).map((entry) => normalizeTrackedFileEntry(entry)).filter(Boolean),
    (Array.isArray(repositorySnapshot?.changedFiles) ? repositorySnapshot.changedFiles : [])
      .map((entry) => normalizeTrackedFileEntry(entry))
      .filter(Boolean),
  );
  const { matchedFiles, ignoredFiles } = splitFinalizableFiles(normalizedTrackedFiles);
  const details = buildBaseDetails(workflowPolicy, matchedFiles, ignoredFiles);

  if (!workflowContext?.commandName) {
    return {
      outcome: "skip",
      reason: "no-workflow-context",
      message: "Workflow finalization cannot be evaluated without workflow context.",
      details,
    };
  }

  if (!workflowPolicy || typeof workflowPolicy !== "object") {
    return {
      outcome: "skip",
      reason: "no-workflow-policy",
      message: "Workflow finalization cannot be evaluated without a resolved workflow policy.",
      details,
    };
  }

  if (!details.hasFinalizableOutputs) {
    return {
      outcome: "skip",
      reason: "no-finalizable-outputs",
      message: "No finalizable workflow outputs were detected for this session.",
      details,
    };
  }

  if (
    workflowPolicy.identityStrategy === "artifact-singleton" &&
    !artifactScopeMatches(workflowPolicy.artifactKey, matchedFiles)
  ) {
    return {
      outcome: "skip",
      reason: "artifact-scope-mismatch",
      message: "Touched files do not match the singleton artifact scope for this workflow.",
      details,
    };
  }

  if (resolveContinuationOptOut(lastContinuationDecision)) {
    return {
      outcome: "skip",
      reason: "continuation-opted-out",
      message: "A prior continuation choice disabled automated finalization for this session.",
      details,
    };
  }

  if (activeRecoveryGate?.blockingScope === "workflow-finalization") {
    return {
      outcome: "skip",
      reason: "finalization-blocked",
      message: "A recovery gate is currently blocking workflow finalization.",
      details,
    };
  }

  if (workflowPolicy.finalization === "no-forced-finalization") {
    return {
      outcome: "skip",
      reason: "finalization-not-forced",
      message: "The workflow produced outputs, but its policy does not auto-propose finalization.",
      details,
    };
  }

  details.shouldProposeCommit = true;
  details.shouldConsiderPushLater =
    workflowPolicy.finalization === "commit-and-push" ||
    workflowPolicy.finalization === "commit-optional-push";

  return {
    outcome: "allow",
    reason: "finalizable-outputs-detected",
    message: "Finalizable workflow outputs were detected for this session.",
    details,
  };
}
