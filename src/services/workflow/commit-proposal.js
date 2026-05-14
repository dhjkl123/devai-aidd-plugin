import { randomUUID } from "node:crypto";
import {
  summarizeArtifactKinds,
  summarizePathScope,
} from "./finalization-artifacts.js";

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
    if (!file?.kind) continue;
    counts.set(file.kind, (counts.get(file.kind) || 0) + 1);
  }

  const ordered = ["code", "technical-doc", "planning-artifact"]
    .filter((kind) => counts.has(kind))
    .map((kind) => formatCount(counts.get(kind), KIND_LABELS.get(kind) || kind));

  return ordered.length > 0 ? ordered.join(", ") : "0 files";
}

export function buildSuggestedCommitMessage(workflowContext, artifactScope) {
  const workflowName =
    typeof workflowContext?.commandName === "string" && workflowContext.commandName.length > 0
      ? workflowContext.commandName
      : "?Œí¬?Œë¡œ??";
  const scope =
    typeof artifactScope === "string" && artifactScope.length > 0
      ? artifactScope
      : "?Œí¬?Œë¡œ??";
  return `?Œí¬?Œë¡œ???„ë£Œ(${workflowName}): ${scope} ?°ì¶œë¬??…ë°?´íŠ¸`;
}

function generateAttemptToken() {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

function buildCorrelationId(workflowContext, files, prefix = "commit") {
  const sessionID =
    typeof workflowContext?.sessionID === "string" && workflowContext.sessionID.length > 0
      ? workflowContext.sessionID
      : "workflow";
  return `${prefix}:${sessionID}:${files.length}:${generateAttemptToken()}`;
}

function buildProposalBase({
  workflowContext = null,
  artifactScope = "workflow",
  files = [],
  allFiles = false,
  correlationPrefix = "commit",
} = {}) {
  return {
    kind: "commit",
    action: "commit",
    message: buildSuggestedCommitMessage(workflowContext, artifactScope),
    artifactScope,
    artifactKinds: summarizeArtifactKinds(files),
    changeCountSummary: summarizeChangeCount(files),
    pathScopeSummary: summarizePathScope(files),
    files: files.map((entry) => entry.path),
    allFiles,
    correlationId: buildCorrelationId(workflowContext, files, correlationPrefix),
  };
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

  if (
    finalizationAssessment?.outcome !== "allow" ||
    !shouldProposeCommit ||
    matchedFiles.length === 0
  ) {
    return null;
  }

  const artifactScope =
    typeof finalizationAssessment?.details?.artifactScope === "string"
      ? finalizationAssessment.details.artifactScope
      : workflowPolicy?.category || "workflow";

  return buildProposalBase({
    workflowContext,
    artifactScope,
    files: matchedFiles,
    allFiles: false,
  });
}

export function buildDirectCommitProposal({
  workflowContext = null,
  workflowPolicy = null,
  changedFiles = [],
} = {}) {
  const files = Array.isArray(changedFiles) ? changedFiles.filter(Boolean) : [];
  if (files.length === 0) {
    return null;
  }

  return buildProposalBase({
    workflowContext,
    artifactScope: workflowPolicy?.category || "workflow",
    files,
    allFiles: true,
    correlationPrefix: "commit-all",
  });
}

