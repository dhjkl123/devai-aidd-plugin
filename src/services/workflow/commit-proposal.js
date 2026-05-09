import { summarizeArtifactKinds } from "./finalization-artifacts.js";

const KIND_LABELS = new Map([
  ["code", "code"],
  ["technical-doc", "technical-doc"],
  ["planning-artifact", "planning-artifact"],
]);

function formatCount(count, label) {
  return `${count} ${label} file${count === 1 ? "" : "s"}`;
}

export function summarizeChangeCount(files = []) {
  const counts = new Map();
  for (const file of Array.isArray(files) ? files : []) {
    if (!file?.kind) {
      continue;
    }
    counts.set(file.kind, (counts.get(file.kind) || 0) + 1);
  }

  const ordered = ["code", "technical-doc", "planning-artifact"]
    .filter((kind) => counts.has(kind))
    .map((kind) => formatCount(counts.get(kind), KIND_LABELS.get(kind) || kind));

  return ordered.length > 0 ? ordered.join(", ") : "0 files";
}

function buildCommitMessage(workflowContext, artifactScope) {
  const workflowName =
    typeof workflowContext?.commandName === "string" && workflowContext.commandName.length > 0
      ? workflowContext.commandName
      : "workflow";
  const scope =
    typeof artifactScope === "string" && artifactScope.length > 0
      ? artifactScope
      : "workflow";
  return `Finish ${workflowName}: update ${scope} outputs`;
}

function buildCorrelationId(workflowContext, matchedFiles) {
  const sessionID =
    typeof workflowContext?.sessionID === "string" && workflowContext.sessionID.length > 0
      ? workflowContext.sessionID
      : "workflow";
  return `commit:${sessionID}:${matchedFiles.length}`;
}

export function buildCommitProposal({
  workflowContext = null,
  workflowPolicy = null,
  finalizationAssessment = null,
  finalizationArtifacts = null,
} = {}) {
  const matchedFiles = Array.isArray(finalizationArtifacts?.matchedFiles)
    ? finalizationArtifacts.matchedFiles
    : [];
  const shouldProposeCommit = finalizationAssessment?.details?.shouldProposeCommit === true;

  if (finalizationAssessment?.outcome !== "allow" || !shouldProposeCommit || matchedFiles.length === 0) {
    return null;
  }

  const artifactScope =
    typeof finalizationAssessment?.details?.artifactScope === "string"
      ? finalizationAssessment.details.artifactScope
      : workflowPolicy?.category || "workflow";

  return {
    kind: "commit",
    action: "commit",
    message: buildCommitMessage(workflowContext, artifactScope),
    artifactScope,
    artifactKinds: summarizeArtifactKinds(matchedFiles),
    changeCountSummary: summarizeChangeCount(matchedFiles),
    files: matchedFiles.map((entry) => entry.path),
    correlationId: buildCorrelationId(workflowContext, matchedFiles),
  };
}
