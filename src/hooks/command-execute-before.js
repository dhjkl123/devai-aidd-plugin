/**
 * command-execute-before.js
 *
 * Wrapper hook for `command.execute.before`. Performs workflow detection,
 * repository readiness check, branch strategy planning, approval publication,
 * and finally pushes the start-instruction text into `output.parts` for
 * detected BMAD workflow commands. The start-instruction string is the
 * single source of truth for the active-guard signal in `output.parts`.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { detectWorkflowContext } from "../services/workflow/detect-workflow-context.js";
import { checkRepositoryReadiness } from "../services/git/check-repository-readiness.js";
import { planBranchProposal } from "../services/git/plan-branch-proposal.js";
import { publishNextPlannedAction } from "../services/approval/publish-next-planned-action.js";
import { buildQuestionInstruction } from "../services/approval/build-question-instruction.js";
import { buildBaselineCommitProposal } from "../services/git/build-init-proposal.js";
import { buildStartupChainPlan } from "../services/git/startup-chain-planner.js";
import { resolveReadinessGate } from "../services/git/resolve-readiness-gate.js";
import {
  isReadinessUnavailable,
  resolveReadinessStateUpdate,
} from "../services/git/readiness-state-policy.js";
import {
  buildStartupChainQuestionInstruction,
} from "../services/approval/build-startup-chain-question-instruction.js";
import { buildFinalizationSentinelInstruction } from "../services/approval/build-finalization-sentinel-instruction.js";
import {
  describeStartupChainSkip,
  resolveWorkflowRunTransition,
  updateWorkflowRunFinalization,
  updateWorkflowRunStartup,
} from "../services/workflow/workflow-run-lifecycle.js";

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

function trustedReadinessBranch(effectiveReadiness) {
  const details = effectiveReadiness?.details ?? {};
  if (
    effectiveReadiness?.outcome !== "allow" ||
    effectiveReadiness?.reason !== "repository-ready" ||
    details.isGitRepository !== true ||
    details.hasCommit !== true ||
    typeof details.branch !== "string" ||
    details.branch.length === 0
  ) {
    return null;
  }

  return details.branch;
}

function resolveEffectiveCurrentBranch(input, context, pluginContext, effectiveReadiness) {
  return (
    resolveCurrentBranch(input, context, pluginContext) ??
    trustedReadinessBranch(effectiveReadiness)
  );
}

function shouldSkipBranchPlanning(readiness, state) {
  if (!readiness || isReadinessUnavailable(readiness)) {
    return true;
  }
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

  if (state?.startupChainCurrent) {
    try {
      const instruction = buildStartupChainQuestionInstruction(state.startupChainCurrent);
      if (instruction?.instructionText) return instruction.instructionText;
    } catch {
      // best-effort fallback to header
    }
  }

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

function shouldInjectFinalizationSentinel(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    return false;
  }
  try {
    return existsSync(join(directory, ".git"));
  } catch {
    return false;
  }
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
        const pushSentinelPart = (readiness) => {
          if (!shouldInjectFinalizationSentinel(pluginContext?.directory)) {
            pluginContext?.debug?.log?.(
              "command-execute-before",
              "finalization sentinel skipped because repository is not initialized",
              {
                sessionID: context.sessionID,
                commandName: context.commandName,
                readinessOutcome: readiness?.outcome ?? null,
                readinessReason: readiness?.reason ?? null,
                isGitRepository: readiness?.details?.isGitRepository ?? null,
              },
            );
            return;
          }
          const sentinel = buildFinalizationSentinelInstruction({
            sessionID: context.sessionID,
            commandName: context.commandName,
          });
          if (!Array.isArray(output.parts)) output.parts = [];
          output.parts.push({
            type: "text",
            text: sentinel.instructionText,
            synthetic: true,
            metadata: sentinel.metadata,
          });
          const currentState = workflowState.get(context.sessionID) ?? {};
          workflowState.set(context.sessionID, {
            ...currentState,
            workflowRunCurrent: updateWorkflowRunFinalization(
              currentState.workflowRunCurrent ?? null,
              currentState.finalizationCompletion ?? null,
            ),
          });
        };
        const priorState = workflowState.get(context.sessionID);
        const runTransition = resolveWorkflowRunTransition({
          priorState,
          workflowContext: context,
        });
        const isSameRun = runTransition.reused === true;
        const nextState = {
          ...priorState,
          ...context,
          workflowRunCurrent: runTransition.workflowRun,
          workflowRunHistory: Array.isArray(priorState?.workflowRunHistory)
            ? priorState.workflowRunHistory
            : [],
          approvalCurrent: isSameRun ? priorState?.approvalCurrent ?? null : null,
          pendingApprovalQuestion: isSameRun ? priorState?.pendingApprovalQuestion ?? null : null,
          approvalHistory: priorState?.approvalHistory ?? [],
          pendingActions: isSameRun && Array.isArray(priorState?.pendingActions)
            ? priorState.pendingActions
            : [],
          startupChainCurrent: isSameRun ? priorState?.startupChainCurrent ?? null : null,
          pendingStartupQuestion: isSameRun ? priorState?.pendingStartupQuestion ?? null : null,
          startupChainHistory: Array.isArray(priorState?.startupChainHistory)
            ? priorState.startupChainHistory
            : [],
          lastContinuationDecision: priorState?.lastContinuationDecision ?? null,
          recoveryGate: isSameRun ? priorState?.recoveryGate ?? null : null,
          pendingRecoveryQuestion: isSameRun ? priorState?.pendingRecoveryQuestion ?? null : null,
          readinessGate: undefined,
          readiness: isSameRun ? priorState?.readiness ?? undefined : undefined,
          latestReadinessError: isSameRun ? priorState?.latestReadinessError ?? null : null,
          branchProposal: undefined,
          initProposal: undefined,
          commitProposal: isSameRun ? priorState?.commitProposal ?? null : null,
          pushProposal: isSameRun ? priorState?.pushProposal ?? null : null,
          gitInitSkipped: isSameRun ? priorState?.gitInitSkipped === true : false,
          baselineSkipped: isSameRun ? priorState?.baselineSkipped === true : false,
          finalizationTriggered: isSameRun ? priorState?.finalizationTriggered === true : false,
          delegatedFinalization: isSameRun ? priorState?.delegatedFinalization ?? null : null,
          finalizationCompletion: isSameRun ? priorState?.finalizationCompletion ?? null : null,
        };
        workflowState.set(context.sessionID, nextState);
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
        const readinessGate = resolveReadinessGate({
          runtimeConfig: pluginContext?.runtimeConfig?.config ?? null,
          workflowPolicy,
          workflowName: context.commandName,
        });
        if (readinessGate.overrideApplied) {
          pluginContext?.debug?.log?.("command-execute-before", "readiness skip overridden by workflow policy", {
            workflowName: context.commandName,
            configuredSkip: readinessGate.configuredSkip,
            overrideField: readinessGate.overrideField,
            overrideValue: readinessGate.overrideValue,
          });
        }
        const readinessStartedAt = process.hrtime.bigint();
        const rawReadiness = checkRepositoryReadiness({
          directory: pluginContext?.directory,
          gitRunner: pluginContext?.gitRunner,
          policy: workflowPolicy,
          readinessGate,
          trace: {
            hook: "command-execute-before",
            stage: "workflow-readiness-check",
            sessionID: context.sessionID,
            workflow: context.commandName,
            phase: context.phase,
          },
        });
        pluginContext?.debug?.log?.("command-execute-before", "readiness check completed", {
          outcome: rawReadiness?.outcome,
          reason: rawReadiness?.reason,
          isGitRepository: rawReadiness?.details?.isGitRepository ?? null,
          hasProposal: Boolean(rawReadiness?.details?.proposal),
          readinessGateEnabled: readinessGate.enabled === true,
          errorCode: rawReadiness?.details?.errorCode ?? null,
          errorName: rawReadiness?.details?.errorName ?? null,
          errorStatus: rawReadiness?.details?.errorStatus ?? null,
          errorSignal: rawReadiness?.details?.errorSignal ?? null,
          errorMessage: rawReadiness?.details?.errorMessage ?? null,
          stderrSummary: rawReadiness?.details?.stderrSummary ?? null,
          failedProbe: rawReadiness?.details?.failedProbe ?? null,
          failedProbeDurationMs: rawReadiness?.details?.failedProbeDurationMs ?? null,
          probeTrace: rawReadiness?.details?.probeTrace ?? null,
        });
        const readinessDurationMs = Number(process.hrtime.bigint() - readinessStartedAt) / 1e6;
        const readinessState = resolveReadinessStateUpdate({
          previousReadiness: priorState?.readiness ?? null,
          nextReadiness: rawReadiness,
        });
        const readiness = readinessState.readiness;

        workflowState.set(context.sessionID, {
          ...workflowState.get(context.sessionID),
          readinessGate,
          readiness,
          latestReadinessError: readinessState.latestReadinessError,
        });

        const currentBranchForStartup = resolveEffectiveCurrentBranch(
          input,
          context,
          pluginContext,
          readiness,
        );
        const stateForStartupChain = workflowState.get(context.sessionID);
        const startupSkip = describeStartupChainSkip({
          workflowRun: stateForStartupChain?.workflowRunCurrent ?? null,
          state: stateForStartupChain,
        });
        let startupBranchProposal = null;
        const branchPlanningGateState = workflowState.get(context.sessionID);
        if (
          startupSkip.skip !== true &&
          !shouldSkipBranchPlanning(readiness, branchPlanningGateState)
        ) {
          const branchPlan = await planBranchProposal({
            workflowContext: context,
            workflowPolicy,
            branchConfig,
            currentBranch: currentBranchForStartup,
            workflowState,
            pluginContext,
            audit,
          });
          startupBranchProposal = branchPlan.proposal ?? null;
        }
        const startupChainPlan = buildStartupChainPlan({
          readiness,
          readinessGate,
          workflowContext: context,
          workflowPolicy,
          branchConfig,
          currentBranch: currentBranchForStartup,
          branchProposal: startupBranchProposal,
          state: stateForStartupChain,
        });

        let startupChainPromptDelivered = false;
        if (
          startupSkip.skip !== true &&
          startupChainPlan.shouldAsk === true &&
          typeof pluginContext?.requestStartupChainApproval === "function"
        ) {
          const startupChainId = `startup-chain:${context.sessionID}:${context.commandName}`;
          const startupChain = {
            ...startupChainPlan,
            startupChainId,
            sessionID: context.sessionID,
            commandName: context.commandName,
            workflowContext: context,
            workflowPolicy,
            branchConfig,
            createdAt: new Date().toISOString(),
          };
          workflowState.set(context.sessionID, {
            ...workflowState.get(context.sessionID),
            startupChainCurrent: startupChain,
            pendingStartupQuestion: null,
            initProposal: null,
            commitProposal: null,
            branchProposal: null,
            approvalCurrent: null,
            workflowRunCurrent: updateWorkflowRunStartup(
              workflowState.get(context.sessionID)?.workflowRunCurrent ?? null,
              {
                status: "question-pending",
                reason: "startup-chain-requested",
                terminal: false,
                startupChainId,
                resolvedAt: null,
                answers: null,
                resolutionSource: "command.execute.before",
              },
            ),
          });
          if (audit) {
            try {
              await audit.info("startup.chain.requested", {
                event: "startup.chain.requested",
                timestamp: startupChain.createdAt,
                workflow: context.commandName,
                command: context.commandName,
                sessionID: context.sessionID,
                outcome: "ask",
                details: {
                  startupChainId,
                  questionKeys: startupChain.steps.map((step) => step.key),
                  actionIds: startupChain.steps.map((step) => step.correlationId ?? null),
                  correlationIds: startupChain.steps.map((step) => step.correlationId ?? null),
                },
              });
            } catch {
              // best-effort
            }
          }
          try {
            await pluginContext.requestStartupChainApproval(startupChain);
            startupChainPromptDelivered = true;
          } catch (error) {
            workflowState.set(context.sessionID, {
              ...workflowState.get(context.sessionID),
              startupChainCurrent: null,
              pendingStartupQuestion: null,
              workflowRunCurrent: updateWorkflowRunStartup(
                workflowState.get(context.sessionID)?.workflowRunCurrent ?? null,
                {
                  status: "not-started",
                  reason: "prompt-delivery-failed",
                  terminal: false,
                  startupChainId: null,
                  resolvedAt: null,
                },
              ),
            });
            if (audit) {
              try {
                await audit.info("startup.chain.prompt.delivery.failed", {
                  event: "startup.chain.prompt.delivery.failed",
                  timestamp: new Date().toISOString(),
                  workflow: context.commandName,
                  command: context.commandName,
                  sessionID: context.sessionID,
                  outcome: "skip",
                  details: {
                    reason: "prompt-delivery-failed",
                    startupChainId,
                    error: error?.message ?? String(error),
                  },
                });
              } catch {
                // best-effort
              }
            }
          }
        } else if (startupSkip.skip === true && audit) {
          try {
            await audit.info("startup.chain.skipped", {
              event: "startup.chain.skipped",
              timestamp: new Date().toISOString(),
              workflow: context.commandName,
              command: context.commandName,
              sessionID: context.sessionID,
              outcome: "skip",
              details: {
                reason: startupSkip.reason,
                runId: stateForStartupChain?.workflowRunCurrent?.runId ?? null,
              },
            });
          } catch {
            // best-effort
          }
        }

        if (startupChainPromptDelivered) {
          const stateAfterStartupPrompt = workflowState.get(context.sessionID);
          let startupInstruction = null;
          try {
            startupInstruction = buildStartupChainQuestionInstruction(
              stateAfterStartupPrompt?.startupChainCurrent ?? null,
            );
          } catch {
            startupInstruction = null;
          }
          if (audit) {
            try {
              await audit.info("git.readiness.checked", {
                event: "git.readiness.checked",
                timestamp: new Date().toISOString(),
                workflow: context.commandName,
                command: context.commandName,
                sessionID: context.sessionID,
                outcome: readiness?.outcome ?? rawReadiness?.outcome ?? "skip",
                details: {
                  isGitRepository: readiness?.details?.isGitRepository === true,
                  hasRemote: readiness?.details?.hasRemote === true,
                  branch: readiness?.details?.branch || null,
                  durationMs: readinessDurationMs,
                },
              });
            } catch {
              // Best-effort only.
            }
            const initStep = stateAfterStartupPrompt?.startupChainCurrent?.steps?.find?.(
              (step) => step.key === "init",
            );
            if (initStep) {
              try {
                await audit.info("git.action.planned", {
                  event: "git.action.planned",
                  timestamp: new Date().toISOString(),
                  workflow: context.commandName,
                  command: context.commandName,
                  sessionID: context.sessionID,
                  outcome: "ask",
                  details: {
                    kind: "init",
                    requiresApproval: true,
                    startupChainId: stateAfterStartupPrompt.startupChainCurrent.startupChainId,
                  },
                });
              } catch {
                // Best-effort only.
              }
            }
          }
          if (!Array.isArray(output.parts)) {
            output.parts = [];
          }
          output.parts.push({
            type: "text",
            text: buildStartInstructionText({
              commandName: context.commandName,
              readiness,
              approvalCurrent: null,
              state: stateAfterStartupPrompt ?? null,
            }),
            synthetic: true,
            metadata: {
              source: "devai-git-workflow",
              phase: "start",
              startupChain: true,
              ...(startupInstruction?.metadata ?? {}),
            },
          });
          pushSentinelPart();
          return;
        }

        if (startupSkip.skip !== true && startupChainPlan.shouldAsk !== true) {
          workflowState.set(context.sessionID, {
            ...workflowState.get(context.sessionID),
            workflowRunCurrent: updateWorkflowRunStartup(
              workflowState.get(context.sessionID)?.workflowRunCurrent ?? null,
              {
                status: "resolved",
                reason: startupChainPlan.reason ?? "startup-not-required",
                terminal: true,
                startupChainId: null,
                resolvedAt: new Date().toISOString(),
                answers: null,
                resolutionSource: "command.execute.before",
              },
            ),
          });
        }

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
          readinessGate.enabled === true &&
          readiness?.outcome === "allow" &&
          readiness.details?.hasCommit === false &&
          stateForInitGate?.baselineSkipped !== true &&
          stateForInitGate?.gitInitSkipped !== true;
        if (baselineRequired) {
          const changedFiles =
            typeof pluginContext?.listChangedFiles === "function"
              ? (() => {
                  try {
                    return pluginContext.listChangedFiles({
                      hook: "command-execute-before",
                      stage: "baseline-proposal-refresh",
                      sessionID: context.sessionID,
                      workflow: context.commandName,
                      phase: context.phase,
                    });
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
              outcome: readiness?.outcome ?? rawReadiness?.outcome ?? "skip",
              details: {
                isGitRepository: readiness?.details?.isGitRepository === true,
                hasRemote: readiness?.details?.hasRemote === true,
                branch: readiness?.details?.branch || null,
                durationMs: readinessDurationMs,
              },
            });
          } catch {
            // Best-effort only.
          }
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
        pushSentinelPart(readiness);
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
