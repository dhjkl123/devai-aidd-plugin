import { detectWorkflowContext } from "../services/workflow/detect-workflow-context.js";
import {
  buildBranchProposal,
  computeCandidateBranchName,
  evaluateBranchStrategy,
} from "../services/git/branch-service.js";
import { checkRepositoryReadiness } from "../services/git/check-repository-readiness.js";

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
        workflowState.set(context.sessionID, context);
        if (audit) {
          await audit.info("workflow.detected", {
            event: "workflow.detected",
            timestamp: context.detectedAt,
            workflow: context.commandName,
            command: context.commandName,
            details: {
              sessionID: context.sessionID,
              hasArguments: Boolean(context.arguments),
              source: "command.execute.before",
            },
          });
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
            await audit.info("git.action.planned", {
              event: "git.action.planned",
              timestamp: new Date().toISOString(),
              workflow: context.commandName,
              command: context.commandName,
              outcome: readiness.outcome,
              details: {
                kind: "init",
                requiresApproval: true,
              },
            });
          }
        }

        if (audit) {
          await audit.info("git.readiness.checked", {
            event: "git.readiness.checked",
            timestamp: new Date().toISOString(),
            workflow: context.commandName,
            command: context.commandName,
            outcome: readiness.outcome,
            details: {
              isGitRepository: readiness.details?.isGitRepository === true,
              hasRemote: readiness.details?.hasRemote === true,
              branch: readiness.details?.branch || null,
              durationMs: readinessDurationMs,
            },
          });
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
                await audit.info("git.action.planned", {
                  event: "git.action.planned",
                  timestamp: new Date().toISOString(),
                  workflow: context.commandName,
                  command: context.commandName,
                  details: {
                    kind: "branch",
                    action: proposal.action,
                    name: proposal.name,
                    reason: proposal.reason,
                    isLongLived: strategy.isLongLived,
                  },
                });
              }
            }
          }
        }
      }
    }

    const handler = legacyHandlers["command.execute.before"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
