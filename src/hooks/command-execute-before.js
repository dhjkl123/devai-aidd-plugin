import { detectWorkflowContext } from "../services/workflow/detect-workflow-context.js";
import {
  buildBranchProposal,
  computeCandidateBranchName,
  evaluateBranchStrategy,
} from "../services/git/branch-service.js";
import { checkRepositoryReadiness } from "../services/git/check-repository-readiness.js";
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
  legacyHandlers,
  { workflowCommands, workflowState, audit, pluginContext, branchConfig } = {},
) {
  return async (input, output) => {
    if (workflowCommands && workflowState) {
      const context = detectWorkflowContext(input, workflowCommands, {
        detectedAt: new Date().toISOString(),
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
          const strategy = evaluateBranchStrategy({
            workflowContext: context,
            workflowPolicy,
            branchConfig,
            currentBranch,
          });

          if (strategy.requirement !== "unnecessary") {
            const candidateName = computeCandidateBranchName({
              workflowContext: context,
              workflowPolicy,
              branchConfig,
            });
            const proposal = buildBranchProposal({
              strategy,
              candidateName,
              currentBranch,
            });

            if (proposal) {
              workflowState.set(context.sessionID, {
                ...workflowState.get(context.sessionID),
                branchProposal: proposal,
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
                    details: {
                      kind: "branch",
                      action: proposal.action,
                      name: proposal.name,
                      reason: proposal.reason,
                      isLongLived: strategy.isLongLived,
                    },
                  });
                } catch {
                  // Best-effort only.
                }
              }
            }
          }
        }

        await publishNextPlannedAction({
          workflowState,
          workflowContext: context,
          workflowPolicy,
          audit,
          pluginContext,
        });
      }
    }

    const handler = legacyHandlers["command.execute.before"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
