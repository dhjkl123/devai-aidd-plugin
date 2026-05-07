import { detectWorkflowContext } from "../services/workflow/detect-workflow-context.js";

export function createCommandExecuteBeforeHook(legacyHandlers, { workflowCommands, workflowState, audit } = {}) {
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
      }
    }

    const handler = legacyHandlers["command.execute.before"];
    if (!handler) {
      return;
    }

    return handler(input, output);
  };
}
