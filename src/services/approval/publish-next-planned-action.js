import { classifyGitAction } from "./classify-git-action.js";
import {
  buildActionId,
  buildApprovalRequest,
} from "./build-approval-request.js";
import {
  evaluateRequestGate,
  selectNextPlannedAction,
} from "./approval-policy-service.js";
import {
  buildHookBlockedEvent,
  isActionBlockedByGate,
  readRecoveryGate,
} from "./recovery-orchestrator.js";

export async function publishNextPlannedAction({
  workflowState,
  workflowContext,
  workflowPolicy = null,
  audit = null,
  pluginContext = null,
} = {}) {
  if (!workflowState || !workflowContext?.sessionID) {
    return { outcome: "skip", reason: "session-not-tracked" };
  }

  const currentState = workflowState.get(workflowContext.sessionID);
  const gate = evaluateRequestGate(currentState);

  if (gate.outcome === "allow") {
    const nextProposal = selectNextPlannedAction(currentState);
    const classified = classifyGitAction(nextProposal);
    const activeRecoveryGate = readRecoveryGate(workflowState, workflowContext.sessionID);
    const recoveryBlock = classified
      ? isActionBlockedByGate(activeRecoveryGate, classified.kind)
      : { blocked: false, reason: "no-classification" };

    if (classified && recoveryBlock.blocked) {
      if (audit) {
        const hookBlocked = buildHookBlockedEvent({
          gate: activeRecoveryGate,
          workflow: workflowContext.commandName,
          command: workflowContext.commandName,
          sessionID: workflowContext.sessionID,
          source: "approval.publish",
          reason: recoveryBlock.reason,
          extraDetails: {
            actionKind: classified.kind,
          },
        });
        await audit.info("git.action.recovery.blocked", hookBlocked);
      }
      return { outcome: "skip", reason: recoveryBlock.reason };
    }

    if (!classified) {
      return { outcome: "skip", reason: "no-classification" };
    }

    const approvalRequest = buildApprovalRequest({
      sessionID: workflowContext.sessionID,
      workflow: workflowContext.commandName,
      command: workflowContext.commandName,
      phase: currentState?.phase || "start",
      actionType: classified.actionType,
      proposal: nextProposal,
      workflowContext,
      workflowPolicy,
      readiness: currentState?.readiness ?? null,
    });

    const stateBeforeApproval = workflowState.get(workflowContext.sessionID);
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

    workflowState.set(workflowContext.sessionID, {
      ...stateBeforeApproval,
      approvalCurrent: approvalRequest,
      approvalHistory: [...existingHistory, approvalRequest],
      pendingActions: nextQueue,
    });

    if (audit) {
      await audit.info("approval.requested", {
        event: "approval.requested",
        timestamp: new Date().toISOString(),
        workflow: workflowContext.commandName,
        command: workflowContext.commandName,
        outcome: "ask",
        details: {
          actionKind: classified.kind,
          actionName: nextProposal.action || classified.actionType,
          proposalKind: nextProposal.kind,
          proposalReason: nextProposal.reason || null,
          requiresApproval: classified.requiresApproval === true,
          phase: approvalRequest.phase,
          requestId: approvalRequest.id,
          actionId: approvalRequest.actionId,
          actionType: classified.actionType,
          sessionID: workflowContext.sessionID,
          explanationFallback:
            approvalRequest.metadata?.explanation?.fallback === true,
        },
      });
    }

    if (typeof pluginContext?.requestApproval === "function") {
      try {
        await pluginContext.requestApproval(approvalRequest);
      } catch (err) {
        if (audit) {
          await audit.info("approval.prompt.delivery.failed", {
            event: "approval.prompt.delivery.failed",
            timestamp: new Date().toISOString(),
            workflow: workflowContext.commandName,
            command: workflowContext.commandName,
            outcome: "skip",
            details: {
              reason: "prompt-delivery-failed",
              requestId: approvalRequest.id,
              actionType: approvalRequest.actionType,
              sessionID: workflowContext.sessionID,
              error: err?.message ?? String(err),
            },
          });
        }
      }
    }

    return { outcome: "published", request: approvalRequest };
  }

  if (gate.outcome === "skip" && gate.reason === "approval-already-pending") {
    const nextProposal = selectNextPlannedAction(currentState);
    const classified = classifyGitAction(nextProposal);
    if (!classified) {
      return { outcome: "skip", reason: "no-classification" };
    }

    const candidateActionId = buildActionId(classified.actionType, nextProposal);
    const activeActionId = currentState?.approvalCurrent?.actionId ?? null;
    const currentQueue = Array.isArray(currentState?.pendingActions)
      ? currentState.pendingActions
      : [];
    const alreadyQueued = currentQueue.some((item) => item?.actionId === candidateActionId);
    if (candidateActionId !== activeActionId && !alreadyQueued) {
      const stateBeforeQueue = workflowState.get(workflowContext.sessionID);
      const queue = Array.isArray(stateBeforeQueue?.pendingActions)
        ? stateBeforeQueue.pendingActions
        : [];
      workflowState.set(workflowContext.sessionID, {
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
            sessionID: workflowContext.sessionID,
            phase: stateBeforeQueue?.phase || "start",
            createdAt: new Date().toISOString(),
          },
        ],
      });
      return { outcome: "queued", actionId: candidateActionId };
    }
  }

  return { outcome: "skip", reason: gate.reason };
}
