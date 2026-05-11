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

function shouldSkipBranchPlanning(readiness) {
  return readiness?.outcome === "ask" && readiness?.reason === "git-not-initialized";
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

        if (readiness?.outcome === "ask" && readiness.details?.proposal) {
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

        if (!shouldSkipBranchPlanning(readiness)) {
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
        output.parts.push({
          type: "text",
          text: `Git workflow guard is active for /${context.commandName}.`,
          synthetic: true,
          metadata: {
            source: "devai-git-workflow",
            phase: "start",
          },
        });
      }
    }
  };
}
