/**
 * permission-asked.js
 *
 * Wrapper hook for the `permission.asked` runtime channel. Routes runtime
 * permission events to the approval resolver or the recovery orchestrator.
 *
 * Determinism guarantee: when wrapper-side resolution paths fail, this hook
 * returns `undefined` without throwing. A throw here would be misread by
 * the runtime as a permission failure and break unrelated workflows.
 *
 * Story 2.3: this hook is the primary ingress for approval outcomes
 * (accept / deny / ignore-and-continue) selected by the runtime user.
 *
 * Story 2.5: this hook is ALSO the ingress for recovery decisions
 * (retry / continue-without-automation / manual-resolution / abandon)
 * selected by the runtime user against an active recovery gate.
 *
 * Native event refactor: the reusable approval/recovery resolution logic was
 * lifted into the shared resolver below (`resolveApprovalOrRecovery`) so the
 * native-event router can reuse the exact same audit + state + executor
 * delegation chain when routing `question.replied` / `question.rejected`
 * events. The wrapper hook stays thin: it parses the legacy permission
 * payload into the resolver's normalized input shape and delegates.
 */

import { consumeApprovalOutcome } from "../services/approval/consume-approval-outcome.js";
import {
  APPROVAL_OUTCOMES,
  APPROVAL_RESOLUTION_REASONS,
} from "../services/approval/approval-resolution-state.js";
import {
  confirmManualResolution,
  openRecoveryFromApproval,
  openRecoveryFromExecution,
  readRecoveryGate,
  selectRecoveryChoice,
} from "../services/approval/recovery-orchestrator.js";
import { executeApprovedAction } from "../services/git/execute-approved-action.js";
import {
  isTerminalRecoveryState,
  RECOVERY_CHOICES,
  RECOVERY_STATES,
} from "../services/approval/recovery-state.js";
import {
  APPROVAL_OUTCOME_ALIASES as OUTCOME_ALIASES,
  RECOVERY_CHOICE_ALIASES,
} from "../services/approval/permission-asked-aliases.js";

function parseApprovalOutcome(input) {
  const candidates = [
    input?.outcome,
    input?.decision,
    input?.response,
    input?.choice,
  ];
  for (const value of candidates) {
    if (typeof value !== "string" || value.length === 0) continue;
    const normalized = OUTCOME_ALIASES[value.toLowerCase()];
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function parseRecoveryChoice(input) {
  const candidates = [
    input?.recoveryChoice,
    input?.outcome,
    input?.decision,
    input?.response,
    input?.choice,
  ];
  for (const value of candidates) {
    if (typeof value !== "string" || value.length === 0) continue;
    const normalized = RECOVERY_CHOICE_ALIASES[value.toLowerCase()];
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function readEchoedRecoveryGateId(input) {
  const candidates = [
    input?.recoveryGateId,
    input?.metadata?.recoveryGateId,
    input?.payload?.recoveryGateId,
    input?.gateId,
    input?.metadata?.gateId,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function readEchoedIdentifiers(input) {
  const requestId =
    input?.requestId ??
    input?.approvalId ??
    input?.metadata?.requestId ??
    input?.payload?.requestId ??
    null;
  const actionId =
    input?.actionId ??
    input?.metadata?.actionId ??
    input?.payload?.actionId ??
    null;
  return {
    requestId: typeof requestId === "string" ? requestId : null,
    actionId: typeof actionId === "string" ? actionId : null,
  };
}

function matchesActiveApproval(activeApproval, echoed) {
  if (!activeApproval) return false;
  if (echoed.requestId && echoed.requestId === activeApproval.id) return true;
  if (echoed.actionId && echoed.actionId === activeApproval.actionId) return true;
  return false;
}

function reasonCodeForOutcome(outcome) {
  if (outcome === APPROVAL_OUTCOMES.DENY) {
    return APPROVAL_RESOLUTION_REASONS.APPROVAL_DENIED;
  }
  if (outcome === APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE) {
    return APPROVAL_RESOLUTION_REASONS.APPROVAL_IGNORED;
  }
  return null;
}

function matchesActiveRecoveryGate(gate, echoedGateId, parsedChoice) {
  if (!gate) return false;
  if (isTerminalRecoveryState(gate.state)) return false;
  if (echoedGateId && gate.gateId && echoedGateId === gate.gateId) return true;
  if (echoedGateId && gate.gateId && echoedGateId !== gate.gateId) return false;
  return Boolean(parsedChoice);
}

async function deliverRecoveryPrompt({ pluginContext, gate, audit, sessionID, workflow, command }) {
  if (typeof pluginContext?.requestRecoveryDecision !== "function") return;
  if (!gate || !Array.isArray(gate.options) || gate.options.length === 0) return;
  try {
    await pluginContext.requestRecoveryDecision(gate);
  } catch (error) {
    if (audit) {
      try {
        await audit.info("recovery.prompt.delivery.failed", {
          event: "recovery.prompt.delivery.failed",
          timestamp: new Date().toISOString(),
          workflow: workflow ?? null,
          command: command ?? null,
          sessionID,
          outcome: "skip",
          details: {
            reason: "prompt-delivery-failed",
            recoveryGateId: gate.gateId ?? null,
            actionKind: gate.actionKind ?? null,
            actionId: gate.actionId ?? null,
            sessionID,
            error: error?.message ?? String(error),
          },
        });
      } catch {
        // Audit failure is itself best-effort.
      }
    }
  }
}

/**
 * Shared resolver consumed by both the legacy `permission.asked` ingress and
 * the native `question.replied` / `question.rejected` ingress. The native
 * router pre-parses the runtime payload into the normalized input below so
 * this function never has to know whether the call originated from native
 * event routing or from the legacy permission channel.
 *
 * @param {{
 *   workflowState: object,
 *   audit: object | null,
 *   pluginContext: object | null,
 *   sessionID: string,
 *   sourceHook: string,
 *   parsedOutcome: string | null,
 *   parsedRecoveryChoice: string | null,
 *   echoedRequestId?: string | null,
 *   echoedActionId?: string | null,
 *   echoedRecoveryGateId?: string | null,
 *   verifyManual?: boolean
 * }} args
 */
export async function resolveApprovalOrRecovery(args) {
  const {
    workflowState,
    audit,
    pluginContext,
    sessionID,
    sourceHook,
    parsedOutcome,
    parsedRecoveryChoice,
    echoedRequestId = null,
    echoedActionId = null,
    echoedRecoveryGateId = null,
    verifyManual = false,
  } = args;

  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return;
  }

  try {
    const activeRecoveryGate = readRecoveryGate(workflowState, sessionID);

    if (
      matchesActiveRecoveryGate(activeRecoveryGate, echoedRecoveryGateId, parsedRecoveryChoice) &&
      parsedRecoveryChoice
    ) {
      if (
        parsedRecoveryChoice === RECOVERY_CHOICES.MANUAL_RESOLUTION &&
        activeRecoveryGate.state === RECOVERY_STATES.AWAITING_MANUAL_RESOLUTION
      ) {
        await confirmManualResolution({
          workflowState,
          sessionID,
          workflow: activeRecoveryGate.workflow ?? null,
          command: activeRecoveryGate.command ?? null,
          audit,
        });
      } else {
        await selectRecoveryChoice({
          workflowState,
          sessionID,
          choice: parsedRecoveryChoice,
          workflow: activeRecoveryGate.workflow ?? null,
          command: activeRecoveryGate.command ?? null,
          audit,
          verifyManual,
        });
      }
      return;
    }

    const state = workflowState.get(sessionID);
    const active = state?.approvalCurrent ?? null;
    const echoed = { requestId: echoedRequestId, actionId: echoedActionId };

    if (!active || !matchesActiveApproval(active, echoed)) {
      return;
    }

    const outcome = parsedOutcome;
    if (!outcome) {
      if (audit) {
        try {
          await audit.info("approval.resolution.failed", {
            event: "approval.resolution.failed",
            timestamp: new Date().toISOString(),
            workflow: active.workflow ?? null,
            command: active.command ?? null,
            sessionID,
            approvalId: active.id,
            actionId: active.actionId,
            outcome: "skip",
            details: {
              reason: "unknown-outcome",
              sourceHook,
            },
          });
        } catch {
          // best-effort
        }
      }
      return;
    }

    const result = consumeApprovalOutcome({
      workflowState,
      sessionID,
      outcome,
      sourceHook,
      reasonCode: reasonCodeForOutcome(outcome),
    });

    if (result.outcome === "resolved" && audit && Array.isArray(result.auditEvents)) {
      for (const event of result.auditEvents) {
        try {
          await audit.info(event.event, event);
        } catch {
          // best-effort
        }
      }
    }

    if (
      result.outcome === "resolved" &&
      outcome === APPROVAL_OUTCOMES.ACCEPT &&
      (result.resolution?.actionKind === "commit" ||
        result.resolution?.actionKind === "push" ||
        result.resolution?.actionKind === "init")
    ) {
      const executionResult = await executeApprovedAction({
        workflowState,
        sessionID,
        approvalRequest: active,
        resolution: result.resolution,
        pluginContext,
        audit,
      });

      if (
        executionResult.outcome === "executed" &&
        executionResult.envelope?.ok === false
      ) {
        try {
          const recoveryResult = await openRecoveryFromExecution({
            workflowState,
            sessionID,
            envelope: executionResult.envelope,
            workflow: result.resolution?.metadata?.workflow ?? active.workflow ?? null,
            command: result.resolution?.metadata?.command ?? active.command ?? null,
            audit,
          });

          if (recoveryResult.outcome === "opened" && recoveryResult.gate) {
            await deliverRecoveryPrompt({
              pluginContext,
              gate: recoveryResult.gate,
              audit,
              sessionID,
              workflow: result.resolution?.metadata?.workflow ?? active.workflow ?? null,
              command: result.resolution?.metadata?.command ?? active.command ?? null,
            });
          }
        } catch {
          // Execution recovery is best-effort.
        }
      }
    }

    if (
      result.outcome === "resolved" &&
      (outcome === APPROVAL_OUTCOMES.DENY ||
        outcome === APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE)
    ) {
      try {
        const recoveryResult = await openRecoveryFromApproval({
          workflowState,
          sessionID,
          approvalOutcome: outcome,
          actionKind: result.resolution?.actionKind ?? null,
          actionId: result.resolution?.actionId ?? null,
          workflow: result.resolution?.metadata?.workflow ?? active.workflow ?? null,
          command: result.resolution?.metadata?.command ?? active.command ?? null,
          audit,
        });

        if (recoveryResult.outcome === "opened" && recoveryResult.gate) {
          await deliverRecoveryPrompt({
            pluginContext,
            gate: recoveryResult.gate,
            audit,
            sessionID,
            workflow: result.resolution?.metadata?.workflow ?? active.workflow ?? null,
            command: result.resolution?.metadata?.command ?? active.command ?? null,
          });
        }
      } catch {
        // Recovery is best-effort.
      }
    }
  } catch (error) {
    if (audit) {
      try {
        await audit.info("approval.resolution.failed", {
          event: "approval.resolution.failed",
          timestamp: new Date().toISOString(),
          workflow: null,
          command: null,
          sessionID: sessionID ?? null,
          outcome: "skip",
          details: {
            reason: "resolver-threw",
            error: error?.message ?? String(error),
            sourceHook,
          },
        });
      } catch {
        // best-effort
      }
    }
  }
}

export function createPermissionAskedHook(injections = {}) {
  const { workflowState, audit, pluginContext } = injections;

  return async (input) => {
    if (!workflowState || !input?.sessionID) return;

    await resolveApprovalOrRecovery({
      workflowState,
      audit,
      pluginContext,
      sessionID: input.sessionID,
      sourceHook: "permission.asked",
      parsedOutcome: parseApprovalOutcome(input),
      parsedRecoveryChoice: parseRecoveryChoice(input),
      echoedRequestId: readEchoedIdentifiers(input).requestId,
      echoedActionId: readEchoedIdentifiers(input).actionId,
      echoedRecoveryGateId: readEchoedRecoveryGateId(input),
      verifyManual:
        input?.verifyManual === true ||
        input?.metadata?.verifyManual === true,
    });
  };
}
