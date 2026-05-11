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

  pluginContext?.debug?.log?.("publishNextPlannedAction", "entered publish gate", {
    sessionID: workflowContext.sessionID,
    gateOutcome: gate.outcome,
    gateReason: gate.reason,
    hasInitProposal: currentState?.initProposal != null,
    hasBranchProposal: currentState?.branchProposal != null,
    hasCommitProposal: currentState?.commitProposal != null,
    hasPushProposal: currentState?.pushProposal != null,
    baselineSkipped: currentState?.baselineSkipped === true,
    gitInitSkipped: currentState?.gitInitSkipped === true,
  });

  // strengthen-approval-prompt-instructions follow-up: hard-block publishing
  // when the session has opted out of git automation. consume-approval-outcome
  // clears the slots when it sets these flags, but we add a defensive guard
  // here so any future code path that repopulates a slot still cannot
  // re-publish a chain prompt the user explicitly declined.
  if (currentState?.gitInitSkipped === true || currentState?.baselineSkipped === true) {
    return {
      outcome: "skip",
      reason: currentState.gitInitSkipped ? "git-init-skipped" : "baseline-skipped",
    };
  }

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
        // Story 3.4: audit emission is best-effort. A throwing logger must
        // NOT prevent the recovery-block decision from short-circuiting
        // approval publish — the block itself has already been computed and
        // returning the skip outcome to the caller is the load-bearing path.
        try {
          await audit.info("git.action.recovery.blocked", hookBlocked);
        } catch {
          // Best-effort only.
        }
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
      // Story 3.4: audit is best-effort. The approval prompt delivery on the
      // line below is the load-bearing user-facing step; a throwing audit
      // sink must NOT prevent the user from seeing the prompt.
      try {
        await audit.info("approval.requested", {
          event: "approval.requested",
          timestamp: new Date().toISOString(),
          workflow: workflowContext.commandName,
          command: workflowContext.commandName,
          // Story 3.4: surface sessionID at the top-level alongside
          // workflow/command so audit consumers can group all events for one
          // finalization flow without having to dig into details.
          sessionID: workflowContext.sessionID,
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
            // Story 3.4: correlation axes so the auditor can join this
            // approval.requested event to the eventual git.action.executed /
            // git.action.skipped / approval.resolved events without relying
            // solely on the deterministic actionId fingerprint.
            correlationId:
              typeof nextProposal.correlationId === "string" &&
              nextProposal.correlationId.length > 0
                ? nextProposal.correlationId
                : null,
            finalizationMode:
              typeof workflowPolicy?.finalization === "string" &&
              workflowPolicy.finalization.length > 0
                ? workflowPolicy.finalization
                : null,
          },
        });
      } catch {
        // Best-effort only — see comment above.
      }
    }

    if (typeof pluginContext?.requestApproval === "function") {
      try {
        await pluginContext.requestApproval(approvalRequest);
      } catch (err) {
        if (audit) {
          // Story 3.4: prompt-delivery-failed is itself best-effort. The
          // primary failure (prompt delivery) is what the runtime is told
          // about by leaving approvalCurrent stashed; an audit sink throw
          // must not overwrite that primary cause with a logger error.
          try {
            await audit.info("approval.prompt.delivery.failed", {
              event: "approval.prompt.delivery.failed",
              timestamp: new Date().toISOString(),
              workflow: workflowContext.commandName,
              command: workflowContext.commandName,
              sessionID: workflowContext.sessionID,
              outcome: "skip",
              details: {
                reason: "prompt-delivery-failed",
                requestId: approvalRequest.id,
                actionId: approvalRequest.actionId,
                actionType: approvalRequest.actionType,
                sessionID: workflowContext.sessionID,
                error: err?.message ?? String(err),
              },
            });
          } catch {
            // Best-effort only.
          }
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
