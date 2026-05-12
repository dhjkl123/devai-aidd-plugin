/**
 * tool-execute-after.js
 *
 * Wrapper hook for `tool.execute.after`. Handles `finish`-tool finalization
 * gating + finish-phase approval publication, and otherwise advances
 * workflow phase. For mutating tools, advances phase to `"mutating"` so the
 * single workflow `phase` field is the source of truth (no separate
 * `lifecycle` field).
 */

import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";
import { evaluateWorkflowFinalization } from "../services/workflow/evaluate-workflow-finalization.js";
import { publishNextPlannedAction } from "../services/approval/publish-next-planned-action.js";
import { MUTATING_TOOLS } from "../services/workflow/mutating-tools.js";
import { executeStartupChain } from "../services/git/startup-chain-executor.js";
import { openRecoveryFromExecution } from "../services/approval/recovery-orchestrator.js";
import { deliverRecoveryPrompt } from "./permission-asked.js";

function extractQuestionAnswers(output) {
  // opencode's native `question` tool returns `output.metadata.answers` as
  // an array of arrays — `[["choice1"], ["choice2"], ...]` — positionally
  // matching the input questions. Single-select returns a 1-element inner
  // array; multi-select returns more. Pick the first string per slot.
  const meta = output?.metadata;
  if (!meta || typeof meta !== "object") return null;
  const raw = meta.answers;
  if (!Array.isArray(raw)) return null;
  return raw.map((entry) => {
    if (Array.isArray(entry)) {
      const first = entry.find((value) => typeof value === "string");
      return typeof first === "string" ? first : null;
    }
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const value = entry.answer ?? entry.value ?? entry.label;
      return typeof value === "string" ? value : null;
    }
    return null;
  });
}

function describeBlockReason(reason) {
  if (reason === "git-init-skipped") {
    return "git initialization was skipped by the user, so this action could not run.";
  }
  if (reason === "baseline-skipped") {
    return "the baseline commit was skipped by the user, so this action could not run (a feature branch cannot be created on an unborn HEAD).";
  }
  return `an upstream step (${reason}) was skipped, so this action could not run.`;
}

function describeStepOutcome(entry, chain) {
  if (!entry || typeof entry !== "object") return null;
  const answer = typeof entry.answer === "string" && entry.answer.length > 0
    ? entry.answer
    : "(no answer)";
  const branchStep = Array.isArray(chain?.steps)
    ? chain.steps.find((step) => step?.key === "branch")
    : null;
  const branchName =
    typeof branchStep?.proposal?.name === "string" && branchStep.proposal.name.length > 0
      ? branchStep.proposal.name
      : null;
  const branchLabel = branchName ? `\`${branchName}\`` : "the proposed branch";
  if (typeof entry.blockedBy === "string") {
    return `\`${entry.key}\`: blocked — user picked \`${answer}\`, but ${describeBlockReason(entry.blockedBy)}`;
  }
  if (entry.decision === "accept") {
    if (entry.key === "init") return "`init`: git repository initialized.";
    if (entry.key === "baseline") return `\`baseline\`: baseline commit created (user picked \`${answer}\`).`;
    if (entry.key === "branch") {
      const verb = branchStep?.action === "switch" ? "switched to" : "created and switched to";
      return `\`branch\`: ${verb} ${branchLabel} (user picked \`${answer}\`).`;
    }
    return `\`${entry.key}\`: completed (user picked \`${answer}\`).`;
  }
  // ignore-and-continue
  if (entry.key === "init") {
    return "`init`: git initialization skipped — git automation is now disabled for this session.";
  }
  if (entry.key === "baseline") {
    return "`baseline`: baseline commit skipped — git automation is now disabled for this session.";
  }
  if (entry.key === "branch") {
    return `\`branch\`: ${branchLabel} was NOT created — the workflow will continue on the CURRENT branch.`;
  }
  return `\`${entry.key}\`: skipped by user (\`${answer}\`).`;
}

function buildSessionAutomationStatus(resolved) {
  const initEntry = resolved.find((entry) => entry?.key === "init");
  const baselineEntry = resolved.find((entry) => entry?.key === "baseline");
  if (initEntry?.decision === "ignore-and-continue" || initEntry?.blockedBy) {
    return "Git automation (init, baseline commit, branch, push) is now DISABLED for this session.";
  }
  if (baselineEntry?.decision === "ignore-and-continue" || baselineEntry?.blockedBy) {
    return "Git automation (baseline commit, branch, push) is now DISABLED for this session.";
  }
  return null;
}

function appendStartupChainNotice({ output, result, chain }) {
  const resolved = Array.isArray(result?.resolved) ? result.resolved : [];
  if (resolved.length === 0) return;

  const stepLines = resolved
    .map((entry) => describeStepOutcome(entry, chain))
    .filter((line) => typeof line === "string" && line.length > 0)
    .map((line) => `- ${line}`);

  const lines = [
    "",
    "[Git workflow guard — startup chain resolved]",
    "Please relay this summary to the user IN THEIR LANGUAGE before continuing with the workflow, so they know which git actions were taken or skipped:",
    ...stepLines,
  ];

  const automationStatus = buildSessionAutomationStatus(resolved);
  if (automationStatus) {
    lines.push(automationStatus);
  }
  lines.push(
    "After acknowledging the summary, proceed with the workflow. Do not run additional git commands — the plugin has already executed every approved git step.",
  );

  const notice = lines.join("\n");
  if (output && typeof output === "object") {
    if (typeof output.output === "string" && output.output.length > 0) {
      output.output = `${output.output}\n${notice}`;
    } else {
      output.output = notice.trimStart();
    }
  }
}

function mapStartupChainAnswers(chain, perSlotAnswers) {
  const steps = Array.isArray(chain?.steps) ? chain.steps : [];
  if (!Array.isArray(perSlotAnswers) || perSlotAnswers.length !== steps.length) {
    return null;
  }
  const answers = {};
  for (let index = 0; index < steps.length; index += 1) {
    const value = perSlotAnswers[index];
    if (typeof value !== "string" || value.length === 0) return null;
    answers[steps[index].key] = value;
  }
  return answers;
}

async function resolveStartupChainFromQuestion({
  input,
  output,
  workflowState,
  audit,
  pluginContext,
}) {
  if (input?.tool !== "question") return false;
  const sessionID = input?.sessionID;
  if (typeof sessionID !== "string" || sessionID.length === 0) return false;
  const state = workflowState?.get?.(sessionID) ?? null;
  const chain = state?.startupChainCurrent ?? null;
  if (!chain) return false;

  const perSlotAnswers = extractQuestionAnswers(output);
  const answers = mapStartupChainAnswers(chain, perSlotAnswers);
  if (!answers) {
    if (audit) {
      try {
        await audit.info("startup.chain.answer.unmatched", {
          event: "startup.chain.answer.unmatched",
          timestamp: new Date().toISOString(),
          workflow: chain.commandName ?? null,
          command: chain.commandName ?? null,
          sessionID,
          outcome: "skip",
          details: {
            startupChainId: chain.startupChainId ?? null,
            reason: "answer-shape-mismatch",
            slotCount: Array.isArray(perSlotAnswers) ? perSlotAnswers.length : null,
            expectedSlots: Array.isArray(chain.steps) ? chain.steps.length : 0,
          },
        });
      } catch {
        // best-effort
      }
    }
    return false;
  }

  try {
    workflowState.set(sessionID, {
      ...(workflowState.get(sessionID) ?? {}),
      pendingStartupQuestion: null,
    });
  } catch {
    // best-effort
  }

  const result = await executeStartupChain({
    workflowState,
    sessionID,
    chain,
    answers,
    pluginContext,
    audit,
  });

  appendStartupChainNotice({ output, result, chain });

  if (result?.outcome === "failed" && result.envelope?.ok === false) {
    try {
      const recoveryResult = await openRecoveryFromExecution({
        workflowState,
        sessionID,
        envelope: result.envelope,
        workflow: chain.commandName ?? null,
        command: chain.commandName ?? null,
        audit,
      });
      if (recoveryResult.outcome === "opened" && recoveryResult.gate) {
        await deliverRecoveryPrompt({
          pluginContext,
          gate: recoveryResult.gate,
          audit,
          sessionID,
          workflow: chain.commandName ?? null,
          command: chain.commandName ?? null,
        });
      }
    } catch {
      // best-effort
    }
  }

  return true;
}

export function createToolExecuteAfterHook(
  { workflowState, audit, pluginContext } = {},
) {
  return async (input, output) => {
    if (input?.tool === "question") {
      const handled = await resolveStartupChainFromQuestion({
        input,
        output,
        workflowState,
        audit,
        pluginContext,
      });
      if (handled) return;
    }
    if (input?.tool === "finish") {
      const assessment = await evaluateWorkflowFinalization({
        workflowState,
        sessionID: input?.sessionID,
        input,
        output,
        audit,
        pluginContext,
      });
      const finishedState = workflowState?.get?.(input?.sessionID) ?? null;
      // Story 3.2 review (MEDIUM): only publish a finish-phase approval when
      // finalization actually produced a finishable proposal. When the
      // assessment short-circuits (no-finalizable-outputs / finalization-not-
      // forced / etc.), `selectNextPlannedAction` could otherwise surface a
      // stale `branchProposal` and re-emit `approval.requested` for a branch
      // approval that finish was never supposed to ask about.
      const hasFinalizationProposal =
        finishedState?.commitProposal != null || finishedState?.pushProposal != null;
      const shouldPublishFinishApproval =
        Boolean(finishedState?.commandName) &&
        (assessment?.outcome === "allow" || hasFinalizationProposal);
      if (shouldPublishFinishApproval) {
        const workflowContext = {
          commandName: finishedState.commandName,
          arguments: finishedState.arguments || "",
          sessionID: input?.sessionID,
          detectedAt: finishedState.detectedAt,
          phase: finishedState.phase || "finish",
        };
        const resolvedPolicy = pluginContext?.resolvePolicy?.(workflowContext);
        const workflowPolicy =
          resolvedPolicy?.outcome === "allow" ? resolvedPolicy.details?.policy || null : null;
        await publishNextPlannedAction({
          workflowState,
          workflowContext,
          workflowPolicy,
          audit,
          pluginContext,
        });
      }
    } else if (MUTATING_TOOLS.has(input?.tool)) {
      advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "mutating");
    } else {
      advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");
    }
  };
}
