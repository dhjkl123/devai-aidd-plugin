import { detectWorkflowContext } from "../services/workflow/detect-workflow-context.js";
import {
  buildBranchProposal,
  computeCandidateBranchName,
  evaluateBranchStrategy,
} from "../services/git/branch-service.js";
import { checkRepositoryReadiness } from "../services/git/check-repository-readiness.js";
import { classifyGitAction } from "../services/approval/classify-git-action.js";
import {
  buildActionId,
  buildApprovalRequest,
} from "../services/approval/build-approval-request.js";
import {
  evaluateRequestGate,
  selectNextPlannedAction,
} from "../services/approval/approval-policy-service.js";
import {
  buildHookBlockedEvent,
  isActionBlockedByGate,
  readRecoveryGate,
} from "../services/approval/recovery-orchestrator.js";

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
        // Carry over existing approval state when the same sessionID re-enters.
        // priorState is spread first so future stash fields (Story 2.3's
        // approvalResolved/approvalDecision, etc.) survive re-entry; context
        // overrides workflow-identifying fields; explicit approval fields are
        // re-pinned last to guarantee their default shape (null / []).
        //
        // Stale Git-evaluation fields (readiness/branchProposal/initProposal)
        // are explicitly invalidated here. They are recomputed below on every
        // entry, and a stale proposal carrying over from priorState would
        // surface as a phantom request once Story 2.3 clears the pending gate.
        const priorState = workflowState.get(context.sessionID);
        workflowState.set(context.sessionID, {
          ...priorState,
          ...context,
          approvalCurrent: priorState?.approvalCurrent ?? null,
          approvalHistory: priorState?.approvalHistory ?? [],
          // Story 2.3: queue + last continuation must survive re-entry so the
          // resolver's effects are visible to the next planning pass.
          pendingActions: Array.isArray(priorState?.pendingActions)
            ? priorState.pendingActions
            : [],
          lastContinuationDecision: priorState?.lastContinuationDecision ?? null,
          readiness: undefined,
          branchProposal: undefined,
          initProposal: undefined,
        });
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

        // ── Approval Gate (Story 2.1) ─────────────────────────────────────
        // Evaluate whether a new approval request can be published.
        // Priority: initProposal (1) > branchProposal (2).
        // Only one approval request per session is active at a time.
        const currentState = workflowState.get(context.sessionID);
        const gate = evaluateRequestGate(currentState);

        if (gate.outcome === "allow") {
          const nextProposal = selectNextPlannedAction(currentState);
          const classified = classifyGitAction(nextProposal);

          // Story 2.5: a pending recovery gate blocks dependent later Git
          // automation for the same session. Honor it here — the gate is
          // released only when the orchestrator marks the action as retried,
          // bypassed, or resolved manually.
          const activeRecoveryGate = readRecoveryGate(workflowState, context.sessionID);
          const recoveryBlock = classified
            ? isActionBlockedByGate(activeRecoveryGate, classified.kind)
            : { blocked: false, reason: "no-classification" };

          if (classified && recoveryBlock.blocked) {
            if (audit) {
              // Story 2.5 (MEDIUM review round 2): route through the
              // orchestrator's shared envelope builder so this hook-emitted
              // `git.action.recovery.blocked` carries the same minimum
              // `details` keys (failureCode / recoverable / attempt / gateId
              // / correlationId / blockingScope / source / sessionID) as the
              // orchestrator's own emission of the same event name. Audit
              // consumers no longer have to branch on emission origin.
              const hookBlocked = buildHookBlockedEvent({
                gate: activeRecoveryGate,
                workflow: context.commandName,
                command: context.commandName,
                sessionID: context.sessionID,
                source: "command.execute.before",
                reason: recoveryBlock.reason,
                extraDetails: {
                  // Preserve the planning-pass action kind even when it
                  // differs from the gate's actionKind (e.g. a session-git
                  // scope blocking unrelated kinds).
                  actionKind: classified.kind,
                },
              });
              await audit.info("git.action.recovery.blocked", hookBlocked);
            }
          } else if (classified) {
            // Story 2.2: pass workflow source-of-truth so the approval request
            // can derive its canonical explanation payload (intent / impact /
            // workflow / policy rationale) without re-resolving anything.
            const approvalRequest = buildApprovalRequest({
              sessionID: context.sessionID,
              workflow: context.commandName,
              command: context.commandName,
              phase: currentState?.phase || "start",
              actionType: classified.actionType,
              proposal: nextProposal,
              workflowContext: context,
              workflowPolicy,
              readiness: currentState?.readiness ?? null,
            });

            // Stash the request and append to history — state update is
            // non-negotiable; audit is best-effort (FR22).
            //
            // Story 2.3 promotion: when the resolved next proposal came from
            // pendingActions[0] (queue head), shift the head off the queue so
            // the same action is not republished on subsequent re-entries.
            const stateBeforeApproval = workflowState.get(context.sessionID);
            const existingHistory = Array.isArray(stateBeforeApproval?.approvalHistory)
              ? stateBeforeApproval.approvalHistory
              : [];
            const currentQueue = Array.isArray(stateBeforeApproval?.pendingActions)
              ? stateBeforeApproval.pendingActions
              : [];
            const promotedFromQueue =
              currentQueue.length > 0 &&
              currentQueue[0]?.actionId === approvalRequest.actionId;
            const nextQueue = promotedFromQueue ? currentQueue.slice(1) : currentQueue;

            workflowState.set(context.sessionID, {
              ...stateBeforeApproval,
              approvalCurrent: approvalRequest,
              approvalHistory: [...existingHistory, approvalRequest],
              pendingActions: nextQueue,
            });

            // Audit — relies on createAuditLogger.write() per-sink try/catch.
            // No hook-level try/catch (M2: symmetry with workflow.detected,
            // git.action.planned, git.readiness.checked above).
            //
            // Story 2.3 details shape:
            //   actionKind / actionName / proposalKind / proposalReason /
            //   requiresApproval / phase  (per story spec)
            // The `requestId / actionId / actionType / sessionID /
            // explanationFallback` keys are kept as a Story 2.3 traceability
            // superset so existing audit consumers continue to correlate the
            // approval.requested → approval.resolved → git.action.skipped
            // lifecycle through actionId.
            if (audit) {
              await audit.info("approval.requested", {
                event: "approval.requested",
                timestamp: new Date().toISOString(),
                workflow: context.commandName,
                command: context.commandName,
                outcome: "ask",
                details: {
                  actionKind: classified.kind,
                  actionName: nextProposal.action || classified.actionType,
                  proposalKind: nextProposal.kind,
                  proposalReason: nextProposal.reason || null,
                  requiresApproval: classified.requiresApproval === true,
                  phase: approvalRequest.phase,
                  // Traceability extensions
                  requestId: approvalRequest.id,
                  actionId: approvalRequest.actionId,
                  actionType: classified.actionType,
                  sessionID: context.sessionID,
                  // Story 2.2: surface fallback-explanation use so a regression
                  // in the canonical builder is visible in audit instead of
                  // silently degrading to generic copy.
                  explanationFallback:
                    approvalRequest.metadata?.explanation?.fallback === true,
                },
              });
            }

            // Delegate prompt presentation to the injected adapter (if any).
            // Story 2.3 will wire the accept/deny/ignore outcome back.
            // Prompt delivery failure is audited (H1) but never throws —
            // FR22: workflow must not break when the runtime client misbehaves.
            if (typeof pluginContext?.requestApproval === "function") {
              try {
                await pluginContext.requestApproval(approvalRequest);
              } catch (err) {
                // outcome: "skip" because the user was never actually asked —
                // the prompt failed before reaching them. reason carries the
                // machine-readable cause per architecture's standard outcomes.
                if (audit) {
                  await audit.info("approval.prompt.delivery.failed", {
                    event: "approval.prompt.delivery.failed",
                    timestamp: new Date().toISOString(),
                    workflow: context.commandName,
                    command: context.commandName,
                    outcome: "skip",
                    details: {
                      reason: "prompt-delivery-failed",
                      requestId: approvalRequest.id,
                      actionType: approvalRequest.actionType,
                      sessionID: context.sessionID,
                      error: err?.message ?? String(err),
                    },
                  });
                }
              }
            }
          }
        } else if (gate.outcome === "skip" && gate.reason === "approval-already-pending") {
          // Story 2.3: a fresh planned action that arrived while another
          // approval is still active must wait its turn. Append it to the
          // pendingActions FIFO queue using the common plannedAction shape so
          // consume-approval-outcome can advance the queue after resolve.
          const nextProposal = selectNextPlannedAction(currentState);
          const classified = classifyGitAction(nextProposal);
          if (classified) {
            const candidateActionId = buildActionId(classified.actionType, nextProposal);
            const activeActionId = currentState?.approvalCurrent?.actionId ?? null;
            const currentQueue = Array.isArray(currentState?.pendingActions)
              ? currentState.pendingActions
              : [];
            const alreadyQueued = currentQueue.some(
              (item) => item?.actionId === candidateActionId,
            );
            if (candidateActionId !== activeActionId && !alreadyQueued) {
              const stateBeforeQueue = workflowState.get(context.sessionID);
              const queue = Array.isArray(stateBeforeQueue?.pendingActions)
                ? stateBeforeQueue.pendingActions
                : [];
              workflowState.set(context.sessionID, {
                ...stateBeforeQueue,
                pendingActions: [
                  ...queue,
                  {
                    actionId: candidateActionId,
                    approvalId: null,
                    kind: classified.kind,
                    action: nextProposal?.action ?? null,
                    proposal: nextProposal,
                    requiresApproval: true,
                    sessionID: context.sessionID,
                    phase: stateBeforeQueue?.phase || "start",
                    createdAt: new Date().toISOString(),
                  },
                ],
              });
            }
          }
        }
        // Other "skip" outcomes (no-planned-git-action) are deliberately
        // ignored — there is nothing to queue or publish.
      }
    }

    const handler = legacyHandlers["command.execute.before"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
