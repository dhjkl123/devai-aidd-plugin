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
      : "워크플로우";
  const scope =
    typeof artifactScope === "string" && artifactScope.length > 0
      ? artifactScope
      : "워크플로우";
  return `워크플로우 완료(${workflowName}): ${scope} 산출물 업데이트`;
}

function generateAttemptToken() {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

function buildCorrelationId(workflowContext, matchedFiles) {
  // The UUID token disambiguates separate proposal generations (e.g. two
  // finish evaluations on the same session/file count). Within a single
  // proposal lifecycle, retries reuse the stored correlationId on purpose so
  // audit consumers can trace all execution attempts back to one proposal.
  const sessionID =
    typeof workflowContext?.sessionID === "string" && workflowContext.sessionID.length > 0
      ? workflowContext.sessionID
      : "workflow";
  return `commit:${sessionID}:${matchedFiles.length}:${generateAttemptToken()}`;
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
    // Story 3.5: pathScopeSummary surfaces a reviewer-friendly path-bucket
    // summary so the approval prompt and audit metadata can describe the
    // commit scope using prefixes the reviewer can paste into
    // `git log -- <prefix>`. The full `files` list stays inside the proposal
    // for git pathspec assembly only — basenames never reach the approval
    // explanation or audit payload.
    pathScopeSummary: summarizePathScope(matchedFiles),
    files: matchedFiles.map((entry) => entry.path),
    correlationId: buildCorrelationId(workflowContext, matchedFiles),
  };
}
