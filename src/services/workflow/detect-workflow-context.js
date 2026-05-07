/**
 * @typedef {'start'|'in-progress'|'finish'} WorkflowPhase
 * 'finish' is a reserved phase value; downstream stories (3.1+) set it.
 */

/** Frozen list of valid workflow phases — single source of truth for runtime checks. */
export const WORKFLOW_PHASES = Object.freeze(["start", "in-progress", "finish"]);

/**
 * @typedef {{
 *   commandName: string,
 *   arguments: string,
 *   sessionID: string,
 *   detectedAt: string,
 *   phase: WorkflowPhase
 * }} WorkflowContext
 */

export function normalizeCommandName(command) {
  return String(command || "").trim().replace(/^\/+/, "");
}

/**
 * Pure function: returns a WorkflowContext when the command matches a known
 * workflow command, or null when it does not. No I/O or side effects — the
 * caller MUST inject `detectedAt` so the result is deterministic.
 *
 * @param {{ command: string, arguments?: string, sessionID?: string }} commandInput
 * @param {Set<string>} workflowCommands
 * @param {{ detectedAt: string }} options
 * @returns {WorkflowContext | null}
 */
export function detectWorkflowContext(commandInput, workflowCommands, { detectedAt } = {}) {
  const commandName = normalizeCommandName(commandInput?.command);
  if (!workflowCommands.has(commandName)) {
    return null;
  }

  const sessionID = commandInput?.sessionID;
  if (typeof sessionID !== "string" || sessionID.length === 0) {
    return null;
  }

  return {
    commandName,
    arguments: commandInput?.arguments ?? "",
    sessionID,
    detectedAt,
    phase: "start",
  };
}

/**
 * Advance the recorded workflow phase for `sessionID` if (and only if) the
 * session has a workflow context. Idempotent — a no-op when the session is
 * not a workflow session or already at `nextPhase`.
 *
 * @param {{ get: Function, advancePhase: Function }} workflowState
 * @param {string | undefined} sessionID
 * @param {WorkflowPhase} nextPhase
 */
export function advancePhaseIfWorkflowSession(workflowState, sessionID, nextPhase) {
  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return;
  }
  if (workflowState.get(sessionID)) {
    workflowState.advancePhase(sessionID, nextPhase);
  }
}
