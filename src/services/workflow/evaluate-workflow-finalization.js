import { detectFinalizableOutputs } from "./detect-finalizable-outputs.js";
import {
  mergeTrackedFiles,
  normalizeTrackedFileEntry,
} from "./finalization-artifacts.js";

function extractChangedFiles(input, output, pluginContext) {
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

  if (fallbackFiles.length === 0 && typeof pluginContext?.listChangedFiles === "function") {
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
    extractChangedFiles(input, output, pluginContext)
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

  workflowState.set(sessionID, {
    ...finishedState,
    phase: "finish",
    touchedFiles: trackedFiles,
    finalizationAssessment: assessment,
    finalizationArtifacts: {
      matchedFiles: assessment.details?.matchedFiles ?? [],
      ignoredFiles: assessment.details?.ignoredFiles ?? [],
    },
  });

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
    await audit.info("workflow.finalization.evaluated", {
      event: "workflow.finalization.evaluated",
      ...eventBase,
    });
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
  }

  return assessment;
}
