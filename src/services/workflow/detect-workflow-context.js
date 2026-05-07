/**
 * @typedef {'start'|'in-progress'|'finish'} WorkflowPhase
 * 'finish' is a reserved phase value; downstream stories (3.1+) set it.
 */

/**
 * @typedef {{
 *   commandName: string,
 *   normalizedCommand: string,
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
 * workflow command, or null when it does not.  No I/O or side effects.
 *
 * @param {{ command: string, arguments?: string, sessionID: string }} commandInput
 * @param {Set<string>} workflowCommands
 * @returns {WorkflowContext | null}
 */
export function detectWorkflowContext(commandInput, workflowCommands) {
  const normalizedCommand = normalizeCommandName(commandInput?.command);
  if (!workflowCommands.has(normalizedCommand)) {
    return null;
  }

  return {
    commandName: normalizedCommand,
    normalizedCommand,
    arguments: commandInput?.arguments ?? "",
    sessionID: commandInput?.sessionID,
    detectedAt: new Date().toISOString(),
    phase: "start",
  };
}
