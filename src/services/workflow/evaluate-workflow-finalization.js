import { detectFinalizableOutputs } from "./detect-finalizable-outputs.js";
import { buildCommitProposal } from "./commit-proposal.js";
import {
  mergeTrackedFiles,
  normalizeTrackedFileEntry,
} from "./finalization-artifacts.js";

function extractChangedFiles(input, output, pluginContext) {
  const collected = [];

  if (Array.isArray(output?.changedFiles)) {
    collected.push(...output.changedFiles);
  }
  if (Array.isArray(input?.changedFiles)) {
    collected.push(...input.changedFiles);
  }
  if (Array.isArray(input?.args?.changedFiles)) {
    collected.push(...input.args.changedFiles);
  }

  // Single-source contract (workflow-finalization-single-source-commit-skip-sentinel):
  // always consult git status via pluginContext.listChangedFiles. Baseline
  // commit guarantees a clean tree at workflow start, so untracked + modified
  // files in the working tree are the workflow's outputs. artifactScopeMatches
  // applies its own scope filter downstream — no per-policy gating here.
  if (typeof pluginContext?.listChangedFiles === "function") {
    try {
      const pluginFiles = pluginContext.listChangedFiles();
      if (Array.isArray(pluginFiles)) {
        collected.push(...pluginFiles);
      }
    } catch {
      // Best-effort: throwing git is treated as "no files".
    }
  }

  return collected;
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
        // Story 3.4 (review M1): mirror the push planned-event correlation
        // axes (sessionID, actionId, correlationId, phase, finalizationMode)
        // so an auditor can join the commit-planned → commit-requested →
        // commit-executed chain by the same correlationId family used by
        // the push variant in execute-approved-action.js.
        await audit.info("git.action.planned", {
          event: "git.action.planned",
          timestamp: new Date().toISOString(),
          workflow: workflowContext.commandName,
          command: workflowContext.commandName,
          sessionID,
          outcome: "allow",
          details: {
            kind: "commit",
            action: "commit",
            actionKind: "commit",
            requiresApproval: true,
            actionId: commitProposal.correlationId ?? null,
            correlationId: commitProposal.correlationId ?? null,
            phase: workflowContext.phase ?? "finish",
            finalizationMode: workflowPolicy?.finalization ?? null,
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
