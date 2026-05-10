import { detectFinalizableOutputs } from "./detect-finalizable-outputs.js";
import { buildCommitProposal } from "./commit-proposal.js";
import {
  mergeTrackedFiles,
  normalizeTrackedFileEntry,
} from "./finalization-artifacts.js";

function extractChangedFiles(input, output, pluginContext, workflowPolicy) {
  const fallbackFiles = [];

  if (Array.isArray(output?.changedFiles)) {
    fallbackFiles.push(...output.changedFiles);
  }
  if (Array.isArray(input?.changedFiles)) {
    fallbackFiles.push(...input.changedFiles);
  }
  if (Array.isArray(input?.args?.changedFiles)) {
    fallbackFiles.push(...input.args.changedFiles);
  }

  // Story 3.1 review (HIGH): singleton artifact policies must NOT use the
  // repo-wide `git status` fallback. Otherwise a workflow whose only legit
  // touched output is e.g. `_bmad-output/planning-artifacts/prd.md` would
  // capture every unrelated dirty file in the repo and then flunk
  // `artifactScopeMatches` with `artifact-scope-mismatch`. Singleton workflows
  // are presumed to only mutate their declared artifact, so we trust
  // session-scoped touchedFiles + explicit input/output channels exclusively.
  const isSingletonArtifactPolicy =
    workflowPolicy?.identityStrategy === "artifact-singleton";

  if (
    !isSingletonArtifactPolicy &&
    fallbackFiles.length === 0 &&
    typeof pluginContext?.listChangedFiles === "function"
  ) {
    try {
      const pluginFiles = pluginContext.listChangedFiles();
      if (Array.isArray(pluginFiles)) {
        fallbackFiles.push(...pluginFiles);
      }
    } catch {
      // Best effort fallback only.
    }
  }

  return fallbackFiles;
}

export async function evaluateWorkflowFinalization({
  workflowState,
  sessionID,
  input,
  output,
  audit,
  pluginContext,
} = {}) {
  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return null;
  }

  const existingState = workflowState.get(sessionID);
  if (!existingState?.commandName) {
    return null;
  }

  workflowState.advancePhase(sessionID, "finish");
  const finishedState = workflowState.get(sessionID);
  const workflowContext = {
    commandName: finishedState.commandName,
    arguments: finishedState.arguments || "",
    sessionID,
    detectedAt: finishedState.detectedAt,
    phase: "finish",
  };

  const resolvedPolicy = pluginContext?.resolvePolicy?.(workflowContext);
  const workflowPolicy =
    resolvedPolicy?.outcome === "allow" ? resolvedPolicy.details?.policy || null : null;

  const trackedFiles = mergeTrackedFiles(
    (Array.isArray(finishedState.touchedFiles) ? finishedState.touchedFiles : [])
      .map((entry) => normalizeTrackedFileEntry(entry, pluginContext?.directory))
      .filter(Boolean),
    extractChangedFiles(input, output, pluginContext, workflowPolicy)
      .map((entry) => normalizeTrackedFileEntry(entry, pluginContext?.directory))
      .filter(Boolean),
  );

  const assessment = detectFinalizableOutputs({
    workflowContext,
    workflowPolicy,
    trackedFiles,
    repositorySnapshot: {
      changedFiles: trackedFiles,
    },
    lastContinuationDecision: finishedState.lastContinuationDecision ?? null,
    activeRecoveryGate: finishedState.recoveryGate ?? null,
  });

  const commitProposal = buildCommitProposal({
    workflowContext,
    workflowPolicy,
    finalizationAssessment: assessment,
    finalizationArtifacts: {
      matchedFiles: assessment.details?.matchedFiles ?? [],
      ignoredFiles: assessment.details?.ignoredFiles ?? [],
    },
  });

  workflowState.set(sessionID, {
    ...finishedState,
    phase: "finish",
    touchedFiles: trackedFiles,
    finalizationAssessment: assessment,
    finalizationArtifacts: {
      matchedFiles: assessment.details?.matchedFiles ?? [],
      ignoredFiles: assessment.details?.ignoredFiles ?? [],
    },
    commitProposal,
  });

  // Story 3.1 review (HIGH): audit is best-effort. A throwing audit sink
  // must NEVER abort the finish path — finalization assessment is already
  // persisted to workflowState by this point, and downstream stories
  // (3.2 commit, 3.3 push) depend on it being available regardless of the
  // audit channel's health.
  if (audit) {
    const eventBase = {
      timestamp: new Date().toISOString(),
      workflow: workflowContext.commandName,
      command: workflowContext.commandName,
      outcome: assessment.outcome,
      details: {
        sessionID,
        ...assessment.details,
      },
    };
    try {
      await audit.info("workflow.finalization.evaluated", {
        event: "workflow.finalization.evaluated",
        ...eventBase,
      });
    } catch {
      // best-effort
    }
    try {
      await audit.info(
        assessment.details?.hasFinalizableOutputs
          ? "git.finalization.outputs.detected"
          : "git.finalization.outputs.skipped",
        {
          event: assessment.details?.hasFinalizableOutputs
            ? "git.finalization.outputs.detected"
            : "git.finalization.outputs.skipped",
          ...eventBase,
        },
      );
    } catch {
      // best-effort
    }
    if (commitProposal) {
      try {
        await audit.info("git.action.planned", {
          event: "git.action.planned",
          timestamp: new Date().toISOString(),
          workflow: workflowContext.commandName,
          command: workflowContext.commandName,
          outcome: "allow",
          details: {
            kind: "commit",
            action: "commit",
            requiresApproval: true,
            fileCount: commitProposal.files.length,
            artifactScope: commitProposal.artifactScope,
          },
        });
      } catch {
        // best-effort
      }
    }
  }

  return assessment;
}
