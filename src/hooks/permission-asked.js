/**
 * permission-asked.js
 *
 * Story 2.3: this hook is the primary ingress for approval outcomes
 * (accept / deny / ignore-and-continue) selected by the runtime user.
 *
 * Story 2.5: this hook is ALSO the ingress for recovery decisions
 * (retry / continue-without-automation / manual-resolution / abandon)
 * selected by the runtime user against an active recovery gate. After
 * `consumeApprovalOutcome` resolves a `deny` / `ignore-and-continue`, the
 * orchestrator opens a recovery gate AND the hook now delivers the
 * recovery prompt via `pluginContext.requestRecoveryDecision`. Subsequent
 * `permission.asked` events that carry a recovery choice are routed to
 * `selectRecoveryChoice` / `confirmManualResolution`.
 *
 * The hook itself stays thin:
 *   1. If the incoming event carries a recovery choice that targets the
 *      active recovery gate, route it to the orchestrator and skip approval
 *      handling.
 *   2. Otherwise, detect that the incoming permission event is referring to
 *      one of our published approval requests (matched by approvalId /
 *      actionId).
 *   3. Parse the runtime payload into a canonical outcome string.
 *   4. Delegate to the `consumeApprovalOutcome` resolver in
 *      `services/approval` for state mutation + audit payload assembly.
 *   5. Emit any returned audit events.
 *   6. After deny / ignore-and-continue, open a recovery gate and deliver the
 *      recovery prompt via `pluginContext.requestRecoveryDecision`.
 *   7. Always invoke the legacy handler last so existing wrapper behavior
 *      (Story 1.x) remains intact.
 *
 * Failure isolation: an exception while parsing or resolving must NEVER
 * surface to the caller. The runtime would otherwise misinterpret it as a
 * permission failure. We swallow + audit instead, in the same spirit as
 * the prompt-delivery failure handling in `command-execute-before`.
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
// Story 2.5 (LOW review round 3): alias maps were lifted into a shared module
// so the disjointness invariant between approval and recovery vocabularies is
// testable from a single source of truth. The recovery-first routing in this
// hook only stays unambiguous while these two key sets remain disjoint.
import {
  APPROVAL_OUTCOME_ALIASES as OUTCOME_ALIASES,
  RECOVERY_CHOICE_ALIASES,
} from "../services/approval/permission-asked-aliases.js";

/**
 * Extracts a canonical outcome string from the runtime payload.
 *
 * Candidate fields are restricted to permission-decision keys
 * (`outcome | decision | response | choice`). The generic `action` field is
 * intentionally excluded — runtimes routinely populate `action` with the
 * tool/operation name (e.g. "write", "block", "allow"), which would otherwise
 * collide with the alias table on unrelated permission events even when the
 * approval was never the prompt being answered.
 *
 * @param {object} input
 * @returns {"accept" | "deny" | "ignore-and-continue" | null}
 */
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

/**
 * Story 2.5 (MEDIUM review): extract a canonical recovery choice from the
 * runtime payload. Mirrors `parseApprovalOutcome` but with the recovery
 * choice vocabulary.
 *
 * @param {object} input
 * @returns {string | null}
 */
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

/**
 * Story 2.5 (MEDIUM review): extract the recovery gate identifier echoed back
 * by the runtime. The `requestRecoveryDecision` adapter in `src/index.js`
 * stamps this on the prompt metadata so the response can be matched to the
 * correct gate even if a stale gate is still hanging around.
 *
 * @param {object} input
 * @returns {string | null}
 */
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

/**
 * Reads the approval request identifier echoed back by the runtime, in any of
 * the conventional locations.
 *
 * @param {object} input
 * @returns {{ requestId: string | null, actionId: string | null }}
 */
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

/**
 * Returns true when the incoming event matches the active approval for the
 * given session. Defensive guard so unrelated permission prompts can never
 * accidentally close our approval.
 *
 * @param {object | null | undefined} activeApproval
 * @param {{ requestId: string | null, actionId: string | null }} echoed
 * @returns {boolean}
 */
function matchesActiveApproval(activeApproval, echoed) {
  if (!activeApproval) return false;
  if (echoed.requestId && echoed.requestId === activeApproval.id) return true;
  if (echoed.actionId && echoed.actionId === activeApproval.actionId) return true;
  return false;
}

/**
 * Story 2.3 (LOW-4): map a terminal outcome to the canonical reason code so
 * `consumeApprovalOutcome` records `reasonCode: "approval-denied" |
 * "approval-ignored"` on the resolution and continuation marker. `accept`
 * has no skip reason.
 *
 * @param {string} outcome
 * @returns {string | null}
 */
function reasonCodeForOutcome(outcome) {
  if (outcome === APPROVAL_OUTCOMES.DENY) {
    return APPROVAL_RESOLUTION_REASONS.APPROVAL_DENIED;
  }
  if (outcome === APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE) {
    return APPROVAL_RESOLUTION_REASONS.APPROVAL_IGNORED;
  }
  return null;
}

/**
 * Story 2.5 (MEDIUM review): is this incoming event a response to an active
 * recovery gate? Match by echoed `recoveryGateId` first; if absent, fall back
 * to a recoverable-choice value AND a non-terminal active gate for the
 * session. The strict-match path supports multi-prompt sessions; the
 * fallback supports runtimes that only forward the choice value.
 *
 * @param {object | null} gate
 * @param {string | null} echoedGateId
 * @param {string | null} parsedChoice
 * @returns {boolean}
 */
function matchesActiveRecoveryGate(gate, echoedGateId, parsedChoice) {
  if (!gate) return false;
  if (isTerminalRecoveryState(gate.state)) return false;
  if (echoedGateId && gate.gateId && echoedGateId === gate.gateId) return true;
  if (echoedGateId && gate.gateId && echoedGateId !== gate.gateId) return false;
  return Boolean(parsedChoice);
}

/**
 * Story 2.5 (MEDIUM review): deliver the recovery prompt to the runtime via
 * `pluginContext.requestRecoveryDecision`. Failure is best-effort and never
 * surfaces to the runtime — the gate has already been persisted by the
 * orchestrator.
 */
async function deliverRecoveryPrompt({ pluginContext, gate, audit, sessionID, workflow, command }) {
  if (typeof pluginContext?.requestRecoveryDecision !== "function") return;
  if (!gate || !Array.isArray(gate.options) || gate.options.length === 0) return;
  try {
    await pluginContext.requestRecoveryDecision(gate);
  } catch (error) {
    if (audit) {
      try {
        // Story 3.4 (review L1): adopt the top-level sessionID convention
        // used by the rest of the finalization audit events so this skip
        // event aligns with approval.resolved / git.action.skipped shape.
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

export function createPermissionAskedHook(legacyHandlers, injections = {}) {
  const { workflowState, audit, pluginContext } = injections;

  return async (input) => {
    if (workflowState && input?.sessionID) {
      try {
        // Story 2.5 (MEDIUM review): recovery routing runs first. If a
        // recovery gate is awaiting input AND the payload carries a
        // recovery-choice value (or echoes the gate's id), dispatch to the
        // orchestrator instead of the approval flow. The two flows do not
        // overlap because their choice vocabularies are disjoint.
        const echoedRecoveryGateId = readEchoedRecoveryGateId(input);
        const parsedRecoveryChoice = parseRecoveryChoice(input);
        const activeRecoveryGate = readRecoveryGate(workflowState, input.sessionID);

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
              sessionID: input.sessionID,
              workflow: activeRecoveryGate.workflow ?? null,
              command: activeRecoveryGate.command ?? null,
              audit,
            });
          } else {
            await selectRecoveryChoice({
              workflowState,
              sessionID: input.sessionID,
              choice: parsedRecoveryChoice,
              workflow: activeRecoveryGate.workflow ?? null,
              command: activeRecoveryGate.command ?? null,
              audit,
              verifyManual:
                input?.verifyManual === true ||
                input?.metadata?.verifyManual === true,
            });
          }

          // Recovery routed; legacy handler still runs at the end of this
          // function to preserve Story 1.x behavior.
        } else {
          const state = workflowState.get(input.sessionID);
          const active = state?.approvalCurrent ?? null;
          const echoed = readEchoedIdentifiers(input);

          if (active && matchesActiveApproval(active, echoed)) {
            const outcome = parseApprovalOutcome(input);
            if (outcome) {
              const result = consumeApprovalOutcome({
                workflowState,
                sessionID: input.sessionID,
                outcome,
                sourceHook: "permission.asked",
                // Story 2.3 (LOW-4): inject the canonical reason code so the
                // resolver no longer carries a dead parameter for the
                // permission.asked ingress path.
                reasonCode: reasonCodeForOutcome(outcome),
              });

              if (result.outcome === "resolved" && audit && Array.isArray(result.auditEvents)) {
                // Story 3.4: emit each resolution audit event independently
                // and best-effort. Without per-event isolation, a throwing
                // audit sink on the first event (e.g. approval.resolved)
                // would propagate up and prevent the second event
                // (git.action.skipped) AND the downstream executor /
                // recovery hand-off from running. Story 3.4 contract: a
                // throwing logger MUST NOT abort the finalization envelope.
                for (const event of result.auditEvents) {
                  try {
                    await audit.info(event.event, event);
                  } catch {
                    // Best-effort: keep emitting subsequent events and let
                    // the rest of the resolution flow proceed.
                  }
                }
              }

              if (
                result.outcome === "resolved" &&
                outcome === APPROVAL_OUTCOMES.ACCEPT &&
                (result.resolution?.actionKind === "commit" ||
                  result.resolution?.actionKind === "push")
              ) {
                const executionResult = await executeApprovedAction({
                  workflowState,
                  sessionID: input.sessionID,
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
                      sessionID: input.sessionID,
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
                        sessionID: input.sessionID,
                        workflow: result.resolution?.metadata?.workflow ?? active.workflow ?? null,
                        command: result.resolution?.metadata?.command ?? active.command ?? null,
                      });
                    }
                  } catch {
                    // Execution recovery is best-effort.
                  }
                }
              }

              // Story 2.5: deny / ignore-and-continue are recoverable user
              // choices, not failures. Open a recovery gate so the workflow
              // continues with an explicit continuation path on the same
              // session. The orchestrator emits its own audit events.
              if (
                result.outcome === "resolved" &&
                (outcome === APPROVAL_OUTCOMES.DENY ||
                  outcome === APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE)
              ) {
                try {
                  const recoveryResult = await openRecoveryFromApproval({
                    workflowState,
                    sessionID: input.sessionID,
                    approvalOutcome: outcome,
                    actionKind: result.resolution?.actionKind ?? null,
                    actionId: result.resolution?.actionId ?? null,
                    workflow: result.resolution?.metadata?.workflow ?? active.workflow ?? null,
                    command: result.resolution?.metadata?.command ?? active.command ?? null,
                    audit,
                  });

                  // Story 2.5 (MEDIUM review): once the recovery gate is
                  // persisted, deliver the prompt to the user so AC1 is
                  // satisfied end-to-end. Only deliver when the gate is
                  // actually awaiting a decision (`outcome === "opened"`);
                  // a `"blocked"` result is a non-recoverable controlled
                  // stop and has no choice for the user to make.
                  if (recoveryResult.outcome === "opened" && recoveryResult.gate) {
                    await deliverRecoveryPrompt({
                      pluginContext,
                      gate: recoveryResult.gate,
                      audit,
                      sessionID: input.sessionID,
                      workflow: result.resolution?.metadata?.workflow ?? active.workflow ?? null,
                      command: result.resolution?.metadata?.command ?? active.command ?? null,
                    });
                  }
                } catch {
                  // Recovery is best-effort. A throw here must not surface to
                  // the runtime — approval has already been resolved and the
                  // workflow can still continue without an open recovery gate.
                }
              }
            } else if (audit) {
              // Story 2.3 (LOW-5): we matched an active approval but the
              // payload did not carry a recognised outcome — surface this so
              // the silent skip is observable to audit consumers.
              try {
                await audit.info("approval.resolution.failed", {
                  event: "approval.resolution.failed",
                  timestamp: new Date().toISOString(),
                  workflow: active.workflow ?? null,
                  command: active.command ?? null,
                  sessionID: input.sessionID,
                  approvalId: active.id,
                  actionId: active.actionId,
                  outcome: "skip",
                  details: {
                    reason: "unknown-outcome",
                    sourceHook: "permission.asked",
                  },
                });
              } catch {
                // Audit failure is best-effort.
              }
            }
          }
        }
      } catch (error) {
        // Never surface resolver/parsing errors to the runtime. Audit
        // best-effort and continue with legacy delegation.
        if (audit) {
          try {
            await audit.info("approval.resolution.failed", {
              event: "approval.resolution.failed",
              timestamp: new Date().toISOString(),
              workflow: null,
              command: null,
              sessionID: input?.sessionID ?? null,
              outcome: "skip",
              details: {
                reason: "resolver-threw",
                error: error?.message ?? String(error),
                sourceHook: "permission.asked",
              },
            });
          } catch {
            // Audit failure is itself best-effort.
          }
        }
      }
    }

    const handler = legacyHandlers["permission.asked"];
    if (typeof handler !== "function") {
      return;
    }

    return handler(input);
  };
}
