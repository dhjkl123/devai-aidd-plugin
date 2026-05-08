/**
 * build-recovery-prompt.js
 *
 * Story 2.5 (MEDIUM review) — pure builder that turns a recovery gate into a
 * user-facing prompt envelope. The runtime adapter
 * (`pluginContext.requestRecoveryDecision` in `src/index.js`) consumes this
 * envelope and forwards it to `client.session.promptAsync` so the user can
 * actually pick a continuation path.
 *
 * Boundary: this module must remain pure. No I/O, no audit, no workflow-state
 * mutation. The orchestrator owns state transitions; this module only renders
 * the human-facing description of the choices already offered on `gate.options`.
 *
 * Output shape (mirrors `request.prompt` from `build-approval-request.js`):
 *
 * ```js
 * {
 *   title:    "Recovery required: branch/create",
 *   summary:  "Approval was denied. Pick a continuation path.",
 *   lines:    [ ...rendered lines ready to be joined with newlines ],
 *   actionKind: "branch",
 *   recoveryGateId: "recovery:...",
 *   choices:  ["retry", "continue-without-automation", "manual-resolution"],
 *   recommendedChoice: "continue-without-automation" | null,
 * }
 * ```
 */

const REASON_TO_HEADLINE = {
  "approval-denied": "Approval was denied",
  "approval-ignored": "Approval was skipped",
  "execution-failed": "Git execution failed",
  "push-rejection": "Remote rejected the push",
  "branch-conflict": "Branch state conflicted",
  "execution-unavailable": "Git execution is unavailable",
  "unknown-git-failure": "Git failed with an unknown error",
  "session-mismatch": "Recovery response did not match session",
  "missing-action-kind": "Recovery cannot describe the next action",
};

function reasonHeadline(reason) {
  if (typeof reason !== "string" || reason.length === 0) {
    return "Continuation required";
  }
  return REASON_TO_HEADLINE[reason] || `Action paused: ${reason}`;
}

function actionLabel(gate) {
  const kind = gate?.actionKind ?? "action";
  const id = gate?.actionId ? ` (${gate.actionId})` : "";
  return `${kind}${id}`;
}

/**
 * @param {object} gate  the recovery gate produced by the orchestrator
 * @returns {{
 *   title: string,
 *   summary: string,
 *   lines: string[],
 *   actionKind: string | null,
 *   recoveryGateId: string | null,
 *   choices: string[],
 *   recommendedChoice: string | null,
 * }}
 */
export function buildRecoveryPrompt(gate) {
  const options = Array.isArray(gate?.options) ? gate.options : [];
  const headline = reasonHeadline(gate?.reason);
  const action = actionLabel(gate);
  const attempt = gate?.attempt ?? 1;

  const title = `Recovery required: ${action}`;
  const summary =
    options.length === 1
      ? `${headline}. Stop the automation path or fix the underlying issue.`
      : `${headline}. Pick a continuation path (attempt ${attempt}).`;

  const lines = [];
  lines.push(`🛑 ${headline} for ${action}.`);
  if (gate?.recoverable === true) {
    lines.push(`Attempt: ${attempt}`);
  } else {
    lines.push(`Status: non-recoverable — automation path will be closed.`);
  }
  lines.push("");
  lines.push("Available recovery paths:");
  for (const opt of options) {
    const marker = opt.recommended ? "→" : " ";
    const label = opt.label || opt.choice;
    const tag = opt.recommended ? " [recommended]" : "";
    lines.push(`  ${marker} ${label}${tag}`);
    if (typeof opt.instructions === "string" && opt.instructions.length > 0) {
      lines.push(`      ${opt.instructions}`);
    }
    lines.push(`      Choice value: \`${opt.choice}\``);
  }
  lines.push("");
  lines.push(
    "Reply with the choice value (retry / continue-without-automation / manual-resolution / abandon) so the workflow can proceed.",
  );

  return {
    title,
    summary,
    lines,
    actionKind: gate?.actionKind ?? null,
    recoveryGateId: gate?.gateId ?? null,
    choices: options.map((opt) => opt.choice),
    recommendedChoice: gate?.recommendedChoice ?? null,
  };
}
