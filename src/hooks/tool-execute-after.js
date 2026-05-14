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
import { FINALIZATION_SENTINEL_HEADER } from "../services/approval/build-finalization-sentinel-instruction.js";
import { buildApprovalRequest } from "../services/approval/build-approval-request.js";
import { executeApprovedAction } from "../services/git/execute-approved-action.js";

function extractQuestionHeader(input) {
  const args = input?.args;
  if (!args || typeof args !== "object") return null;
  const questions = Array.isArray(args.questions) ? args.questions : null;
  if (questions && questions.length > 0) {
    const first = questions[0];
    if (first && typeof first === "object") {
      if (typeof first.header === "string") return first.header;
      if (typeof first.title === "string") return first.title;
    }
  }
  if (typeof args.header === "string") return args.header;
  return null;
}

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

function summarizeToolOutputShape(output) {
  if (!output || typeof output !== "object") return null;
  const outputKeys = Object.keys(output);
  const metadata = output.metadata && typeof output.metadata === "object" ? output.metadata : null;
  const metadataKeys = metadata ? Object.keys(metadata) : null;
  let outputTextPreview = null;
  if (typeof output.output === "string") {
    outputTextPreview = output.output.slice(0, 200);
  } else if (typeof output.text === "string") {
    outputTextPreview = output.text.slice(0, 200);
  }
  return {
    outputKeys,
    metadataKeys,
    outputTextPreview,
    hasError: typeof output.error === "string" && output.error.length > 0,
  };
}

export function createToolExecuteAfterHook(
  { workflowState, audit, pluginContext } = {},
) {
  return async (input, output) => {
    // Diagnostic: every tool.execute.after firing is logged so we can verify
    // when (and whether) the `skill` tool's after-hook actually fires —
    // immediately on skill load vs. at skill completion. Compare these
    // timestamps with the matching tool-execute-before entries by
    // sessionID + tool to compute elapsed lifetime.
    pluginContext?.debug?.log?.(
      "tool-execute-after",
      "hook fired",
      {
        sessionID: input?.sessionID,
        callID: input?.callID ?? null,
        toolName: typeof input?.tool === "string" ? input.tool : null,
        inputKeys:
          input && typeof input === "object" && !Array.isArray(input)
            ? Object.keys(input)
            : null,
        outputShape: summarizeToolOutputShape(output),
      },
    );

    if (input?.tool === "question") {
      const handled = await resolveStartupChainFromQuestion({
        input,
        output,
        workflowState,
        audit,
        pluginContext,
      });
      pluginContext?.debug?.log?.(
        "tool-execute-after",
        "branch: question — startup-chain resolution attempted",
        {
          sessionID: input?.sessionID,
          callID: input?.callID ?? null,
          handledStartupChain: handled === true,
        },
      );
      if (handled) return;

      if (extractQuestionHeader(input) === FINALIZATION_SENTINEL_HEADER) {
        const sessionID = input?.sessionID;
        const state = workflowState?.get?.(sessionID) ?? null;
        if (!state?.commandName) return;

        if (state.phase !== "mutating") {
          pluginContext?.debug?.log?.(
            "tool-execute-after",
            "sentinel premature — phase != mutating, skip finalization",
            { sessionID, phase: state.phase ?? null },
          );
          try {
            await audit?.info?.("workflow.finalization.sentinel.premature", {
              event: "workflow.finalization.sentinel.premature",
              timestamp: new Date().toISOString(),
              workflow: state.commandName,
              command: state.commandName,
              sessionID,
              outcome: "skip",
              details: { phase: state.phase ?? null },
            });
          } catch {
            // best-effort
          }
          return;
        }

        if (state.finalizationTriggered === true) {
          pluginContext?.debug?.log?.(
            "tool-execute-after",
            "sentinel duplicate — skip",
            { sessionID },
          );
          try {
            await audit?.info?.("workflow.finalization.sentinel.duplicate", {
              event: "workflow.finalization.sentinel.duplicate",
              timestamp: new Date().toISOString(),
              workflow: state.commandName,
              command: state.commandName,
              sessionID,
              outcome: "skip",
            });
          } catch {
            // best-effort
          }
          return;
        }

        // Parse sentinel answer: ["Commit", "Skip"] in lowercase token form.
        // Unknown/missing answers are routed to the Skip branch with an
        // additional reason flag so audit forensics can distinguish them.
        const answers = extractQuestionAnswers(output);
        const rawAnswer = answers?.[0];
        const normalized = String(rawAnswer ?? "").trim().toLowerCase();
        let decision;
        let skipReason;
        if (normalized === "commit") {
          decision = "commit";
        } else if (normalized === "skip") {
          decision = "skip";
          skipReason = "user-skipped";
        } else {
          decision = "skip";
          skipReason = "unrecognized-answer";
        }

        workflowState.set(sessionID, { ...state, finalizationTriggered: true });

        if (decision === "skip") {
          pluginContext?.debug?.log?.(
            "tool-execute-after",
            "sentinel skip — finalization not evaluated",
            { sessionID, reason: skipReason, rawAnswer: rawAnswer ?? null },
          );
          try {
            await audit?.info?.("workflow.finalization.sentinel.skipped", {
              event: "workflow.finalization.sentinel.skipped",
              timestamp: new Date().toISOString(),
              workflow: state.commandName,
              command: state.commandName,
              sessionID,
              outcome: "skip",
              details: {
                phase: state.phase ?? null,
                reason: skipReason,
              },
            });
          } catch {
            // best-effort
          }
          return;
        }

        // decision === "commit"
        try {
          await audit?.info?.("workflow.finalization.sentinel.received", {
            event: "workflow.finalization.sentinel.received",
            timestamp: new Date().toISOString(),
            workflow: state.commandName,
            command: state.commandName,
            sessionID,
            outcome: "trigger",
            details: { decision: "commit" },
          });
        } catch {
          // best-effort
        }

        await evaluateWorkflowFinalization({
          workflowState,
          sessionID,
          input,
          output,
          audit,
          pluginContext,
        });
        const finishedState = workflowState.get(sessionID);
        if (!finishedState?.commitProposal) {
          pluginContext?.debug?.log?.(
            "tool-execute-after",
            "sentinel commit — no commitProposal produced, nothing to commit",
            { sessionID },
          );
          return;
        }

        const workflowContext = {
          commandName: finishedState.commandName,
          arguments: finishedState.arguments || "",
          sessionID,
          detectedAt: finishedState.detectedAt,
          phase: "finish",
        };
        const resolvedPolicy = pluginContext?.resolvePolicy?.(workflowContext);
        const workflowPolicy =
          resolvedPolicy?.outcome === "allow"
            ? resolvedPolicy.details?.policy || null
            : null;

        const approvalRequest = buildApprovalRequest({
          sessionID,
          workflow: finishedState.commandName,
          command: finishedState.commandName,
          phase: "finish",
          actionType: "commit",
          proposal: finishedState.commitProposal,
          workflowContext,
          workflowPolicy,
          readiness: finishedState.readiness ?? null,
        });

        try {
          await audit?.info?.("approval.requested", {
            event: "approval.requested",
            timestamp: new Date().toISOString(),
            workflow: finishedState.commandName,
            command: finishedState.commandName,
            sessionID,
            outcome: "ask",
            details: {
              actionKind: "commit",
              actionType: "commit",
              phase: "finish",
              requestId: approvalRequest.id,
              actionId: approvalRequest.actionId,
              sentinelPreApproved: true,
              finalizationMode: workflowPolicy?.finalization ?? null,
            },
          });
        } catch {
          // best-effort
        }

        const prev = workflowState.get(sessionID) ?? {};
        workflowState.set(sessionID, {
          ...prev,
          approvalCurrent: approvalRequest,
          approvalHistory: [
            ...(Array.isArray(prev.approvalHistory) ? prev.approvalHistory : []),
            approvalRequest,
          ],
        });

        await executeApprovedAction({
          workflowState,
          sessionID,
          approvalRequest,
          resolution: {
            resolvedAt: new Date().toISOString(),
            decision: "sentinel-pre-approved",
          },
          pluginContext,
          audit,
        });

        // Push delegation intentionally NOT performed — out of spec scope.
        return;
      }
    }
    if (input?.tool === "finish") {
      const sessionStateForFinish = workflowState?.get?.(input?.sessionID) ?? null;
      if (sessionStateForFinish?.finalizationTriggered === true) {
        pluginContext?.debug?.log?.(
          "tool-execute-after",
          "finish branch — already finalized via sentinel, skip",
          { sessionID: input?.sessionID },
        );
        return;
      }
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
      pluginContext?.debug?.log?.(
        "tool-execute-after",
        "branch: finish — finalization evaluated",
        {
          sessionID: input?.sessionID,
          callID: input?.callID ?? null,
          assessmentOutcome: assessment?.outcome ?? null,
          hasFinalizationProposal,
          shouldPublishFinishApproval,
          commandName: finishedState?.commandName ?? null,
        },
      );
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
      pluginContext?.debug?.log?.(
        "tool-execute-after",
        "branch: mutating — phase advanced to 'mutating'",
        {
          sessionID: input?.sessionID,
          callID: input?.callID ?? null,
          toolName: input?.tool,
        },
      );
    } else {
      advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");
      pluginContext?.debug?.log?.(
        "tool-execute-after",
        "branch: default — phase advanced to 'in-progress'",
        {
          sessionID: input?.sessionID,
          callID: input?.callID ?? null,
          toolName: input?.tool,
        },
      );
    }
  };
}
