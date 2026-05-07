import { detectWorkflowContext } from "../services/workflow/detect-workflow-context.js";

export function createCommandExecuteBeforeHook(legacyHandlers, { workflowCommands, workflowState, audit } = {}) {
  return async (input, output) => {
    if (workflowCommands && workflowState) {
      const context = detectWorkflowContext(input, workflowCommands);
      if (context) {
        workflowState.set(context.sessionID, context);
        if (audit) {
          try {
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
          } catch {
            // best-effort; audit failures must not interrupt detection or legacy delegation
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
