/**
 * command-execute-before.js
 *
 * Wrapper hook for `command.execute.before`. Performs workflow detection,
 * repository readiness check, branch strategy planning, approval publication,
 * and finally pushes the start-instruction text into `output.parts` for
 * detected BMAD workflow commands. The start-instruction string is the
 * single source of truth for the active-guard signal in `output.parts`.
 */

import { detectWorkflowContext } from "../services/workflow/detect-workflow-context.js";
import { checkRepositoryReadiness } from "../services/git/check-repository-readiness.js";
import { planBranchProposal } from "../services/git/plan-branch-proposal.js";
import { publishNextPlannedAction } from "../services/approval/publish-next-planned-action.js";
import { buildQuestionInstruction } from "../services/approval/build-question-instruction.js";
import { buildBaselineCommitProposal } from "../services/git/build-init-proposal.js";

function resolveCurrentBranch(input, context, pluginContext) {
  if (typeof input?.currentBranch === "string" && input.currentBranch.length > 0) {
    return input.currentBranch;
  }

  if (typeof input?.branch === "string" && input.branch.length > 0) {
    return input.branch;
  }

  if (typeof pluginContext?.resolveCurrentBranch === "function") {
    const resolvedBranch = pluginContext.resolveCurrentBranch(input, context);
    return typeof resolvedBranch === "string" && resolvedBranch.length > 0
      ? resolvedBranch
      : null;
  }

  return null;
}

function shouldSkipBranchPlanning(readiness, state) {
  if (readiness?.outcome === "ask" && readiness?.reason === "git-not-initialized") {
    return true;
  }
  // strengthen-approval-prompt-instructions follow-up: HEAD-absent repo
  // (git init done but no commits yet) MUST NOT enter branch planning.
  // `git checkout -b feat/foo` on an unborn HEAD creates a "virtual"
  // branch invisible to `git branch`, breaks PR/diff/push, and undermines
  // the standard workflow assumption that main carries a baseline commit.
  // The baseline-commit prompt is published instead (see the dedicated
  // block below in createCommandExecuteBeforeHook).
  if (readiness?.outcome === "allow" && readiness?.details?.hasCommit === false) {
    return true;
  }
  // When the user picked "Skip" on a baseline-commit prompt OR on the
  // Initialize Git prompt, consume-approval-outcome.js sets
  // workflowState.baselineSkipped / gitInitSkipped. From that point on,
  // every subsequent command.execute.before in this session must skip
  // branch planning -- the user explicitly opted out of git automation.
  if (state?.baselineSkipped === true || state?.gitInitSkipped === true) {
    return true;
  }
  return false;
}

function buildStartInstructionText({ commandName, readiness, approvalCurrent, state }) {
  const header = `Git workflow guard is active for /${commandName}.`;

  // strengthen-approval-prompt-instructions follow-up: the user already
  // opted out of git automation for this session (Skip on Initialize Git or
  // on a baseline commit). Tell the model explicitly to proceed with the
  // workflow without any git-related step -- otherwise the next
  // command.execute.before lands the bare guard header (textLength 54) and
  // the model stalls waiting for a git decision that will never come.
  if (state?.gitInitSkipped === true || state?.baselineSkipped === true) {
    const which = state?.gitInitSkipped === true ? "git initialization" : "baseline commit";
    return [
      header,
      `The user already chose to skip ${which} for this session. Git automation (init, baseline commit, branch creation, push) is disabled.`,
      "Proceed with the workflow steps normally: read, plan, write, and edit files. Do NOT call git, do NOT ask for branch names, and do NOT wait for git approvals.",
      "If the user later requests a commit, ask them to run git manually themselves.",
    ].join("\n");
  }

  if (readiness?.outcome === "ask" && readiness?.reason === "git-not-initialized") {
    return [
      header,
      `This workflow cannot continue yet because /${commandName} is running in a directory that is not a git repository.`,
      "Ask the user the `Initialize Git` question with these exact options:",
      "1. `Initialize Git (Recommended)`",
      "2. `Skip`",
      "If the user chooses Initialize Git, run `git init` only after that approval.",
      "If the user chooses Skip, do not run `git init`. The workflow will continue, but git automation (baseline commit, branch creation, push) will be disabled for this session.",
      "Do not ask for a branch name or continue implementation before the git-init decision is made.",
    ].join("\n");
  }

  // strengthen-approval-prompt-instructions follow-up: when an approval is
  // already active for this command.execute.before pass (e.g. branch/create,
  // branch/switch), inject the same multi-line strong instruction the
  // promptAsync channel sends. The previous one-line guard text was too weak:
  // the model would respond with plain text and never call the question tool,
  // leaving the dialog unrendered. output.parts is a synchronous channel that
  // the model cannot route around, so this is the load-bearing strength lever.
  if (approvalCurrent && typeof approvalCurrent.actionType === "string") {
    try {
      const instruction = buildQuestionInstruction({
        commandName,
        actionType: approvalCurrent.actionType,
        proposal: approvalCurrent.proposal ?? null,
      });
      if (instruction && typeof instruction.instructionText === "string" && instruction.instructionText.length > 0) {
        return instruction.instructionText;
      }
    } catch {
      // best-effort: never crash the hook because of an instruction-text
      // build failure. Fall through to the short header.
    }
  }

  return header;
}

export function createCommandExecuteBeforeHook(
  { workflowCommands, workflowState, audit, pluginContext, branchConfig } = {},
) {
  return async (input, output) => {
    if (workflowCommands && workflowState) {
      const context = detectWorkflowContext(input, workflowCommands, {
        detectedAt: new Date().toISOString(),
      });
      pluginContext?.debug?.log?.("command-execute-before", "workflow detection result", {
        rawCommand: input?.command,
        sessionID: input?.sessionID,
        detected: context !== null,
        detectedCommand: context?.commandName ?? null,
        workflowCommandCount: workflowCommands?.size ?? null,
      });
      if (context) {
        const priorState = workflowState.get(context.sessionID);
        workflowState.set(context.sessionID, {
          ...priorState,
          ...context,
          approvalCurrent: priorState?.approvalCurrent ?? null,
          approvalHistory: priorState?.approvalHistory ?? [],
          pendingActions: Array.isArray(priorState?.pendingActions)
            ? priorState.pendingActions
            : [],
          lastContinuationDecision: priorState?.lastContinuationDecision ?? null,
          readiness: undefined,
          branchProposal: undefined,
          initProposal: undefined,
        });
        if (audit) {
          // Story 3.4: every audit emission on the finalization path is
          // best-effort. A throwing audit sink must NEVER abort the hook.
          try {
            await audit.info("workflow.detected", {
              event: "workflow.detected",
              timestamp: context.detectedAt,
              workflow: context.commandName,
              command: context.commandName,
              sessionID: context.sessionID,
              details: {
                sessionID: context.sessionID,
                hasArguments: Boolean(context.arguments),
                source: "command.execute.before",
              },
            });
          } catch {
            // Best-effort only.
          }
        }

        const resolvedPolicy = pluginContext?.resolvePolicy?.(context);
        const workflowPolicy =
          resolvedPolicy?.outcome === "allow" ? resolvedPolicy.details?.policy : null;
        const readinessStartedAt = process.hrtime.bigint();
        const readiness = checkRepositoryReadiness({
          directory: pluginContext?.directory,
          gitRunner: pluginContext?.gitRunner,
          policy: workflowPolicy,
        });
        pluginContext?.debug?.log?.("command-execute-before", "readiness check completed", {
          outcome: readiness?.outcome,
          reason: readiness?.reason,
          isGitRepository: readiness?.details?.isGitRepository ?? null,
          hasProposal: Boolean(readiness?.details?.proposal),
        });
        const readinessDurationMs = Number(process.hrtime.bigint() - readinessStartedAt) / 1e6;

        workflowState.set(context.sessionID, {
          ...workflowState.get(context.sessionID),
          readiness,
        });

        // strengthen-approval-prompt-instructions follow-up: if the user
        // already picked "Skip" on the Initialize Git prompt earlier in this
        // session, do NOT re-publish an init proposal even though readiness
        // still reports git-not-initialized. The workflow continues without
        // git automation; baseline commit and branch chains stay disabled
        // via the same flag through shouldSkipBranchPlanning() below.
        const stateForInitGate = workflowState.get(context.sessionID);
        const initSkippedThisSession = stateForInitGate?.gitInitSkipped === true;

        // strengthen-approval-prompt-instructions follow-up: HEAD-absent repo
        // detection (readiness "allow" but no commits yet) -- publish a fresh
        // baseline-commit proposal so the workflow asks the user how to
        // proceed instead of silently letting branch planning land an unborn
        // HEAD. This complements the post-init chain in
        // execute-approved-action.js (which only fires within a single
        // session); the readiness-driven path handles fresh sessions
        // entering a no-baseline repo (e.g. opencode restart after the user
        // skipped baseline once).
        const baselineRequired =
          readiness?.outcome === "allow" &&
          readiness.details?.hasCommit === false &&
          stateForInitGate?.baselineSkipped !== true &&
          stateForInitGate?.gitInitSkipped !== true;
        if (baselineRequired) {
          const changedFiles =
            typeof pluginContext?.listChangedFiles === "function"
              ? (() => {
                  try {
                    return pluginContext.listChangedFiles();
                  } catch {
                    return [];
                  }
                })()
              : [];
          const baselineProposal = buildBaselineCommitProposal({
            directory: pluginContext?.directory ?? "",
            files: changedFiles,
            sessionID: context.sessionID,
          });
          workflowState.set(context.sessionID, {
            ...workflowState.get(context.sessionID),
            commitProposal: baselineProposal,
          });
          if (audit) {
            try {
              await audit.info("git.action.planned", {
                event: "git.action.planned",
                timestamp: new Date().toISOString(),
                workflow: context.commandName,
                command: context.commandName,
                sessionID: context.sessionID,
                outcome: "allow",
                details: {
                  kind: "commit",
                  action: "baseline-commit",
                  requiresApproval: true,
                  correlationId: baselineProposal.correlationId,
                  reason: "head-absent-fresh-session",
                  fileCount: changedFiles.length,
                  sensitiveFileCount: baselineProposal.sensitiveFiles.length,
                },
              });
            } catch {
              // best-effort
            }
          }
        }

        if (readiness?.outcome === "ask" && readiness.details?.proposal && !initSkippedThisSession) {
          workflowState.set(context.sessionID, {
            ...workflowState.get(context.sessionID),
            initProposal: readiness.details.proposal,
          });
          if (audit) {
            // Story 3.4: best-effort audit; never abort the hook on a
            // throwing logger.
            try {
              await audit.info("git.action.planned", {
                event: "git.action.planned",
                timestamp: new Date().toISOString(),
                workflow: context.commandName,
                command: context.commandName,
                sessionID: context.sessionID,
                outcome: readiness.outcome,
                details: {
                  kind: "init",
                  requiresApproval: true,
                },
              });
            } catch {
              // Best-effort only.
            }
          }
        }

        if (audit) {
          // Story 3.4: best-effort audit; never abort the hook on a
          // throwing logger.
          try {
            await audit.info("git.readiness.checked", {
              event: "git.readiness.checked",
              timestamp: new Date().toISOString(),
              workflow: context.commandName,
              command: context.commandName,
              sessionID: context.sessionID,
              outcome: readiness.outcome,
              details: {
                isGitRepository: readiness.details?.isGitRepository === true,
                hasRemote: readiness.details?.hasRemote === true,
                branch: readiness.details?.branch || null,
                durationMs: readinessDurationMs,
              },
            });
          } catch {
            // Best-effort only.
          }
        }

        const stateForBranchGate = workflowState.get(context.sessionID);
        if (!shouldSkipBranchPlanning(readiness, stateForBranchGate)) {
          const currentBranch = resolveCurrentBranch(input, context, pluginContext);
          await planBranchProposal({
            workflowContext: context,
            workflowPolicy,
            branchConfig,
            currentBranch,
            workflowState,
            audit,
          });
        }

        await publishNextPlannedAction({
          workflowState,
          workflowContext: context,
          workflowPolicy,
          audit,
          pluginContext,
        });

        if (!Array.isArray(output.parts)) {
          output.parts = [];
        }
        const stateAfterPublish = workflowState.get(context.sessionID);
        const startInstructionText = buildStartInstructionText({
          commandName: context.commandName,
          readiness,
          approvalCurrent: stateAfterPublish?.approvalCurrent ?? null,
          state: stateAfterPublish ?? null,
        });
        output.parts.push({
          type: "text",
          text: startInstructionText,
          synthetic: true,
          metadata: {
            source: "devai-git-workflow",
            phase: "start",
          },
        });
        pluginContext?.debug?.log?.(
          "command-execute-before",
          "start instruction pushed to output.parts",
          {
            sessionID: context.sessionID,
            commandName: context.commandName,
            readinessOutcome: readiness?.outcome ?? null,
            readinessReason: readiness?.reason ?? null,
            needsGitInit:
              readiness?.outcome === "ask" && readiness?.reason === "git-not-initialized",
            textLength: startInstructionText.length,
            textPreview: startInstructionText.slice(0, 200),
          },
        );
      }
    }
  };
}
