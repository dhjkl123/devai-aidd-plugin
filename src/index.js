import { DevaiGitWorkflowPlugin } from "./policies/legacy/devai-git-workflo.js";
import { createFileSystemAdapter } from "./adapters/fs.js";
import { createConsoleAdapter } from "./adapters/console.js";
import { createHttpAdapter } from "./adapters/http.js";
import {
  ensureLegacyProjectConfigCompatibility,
  loadRuntimeConfig,
  loadWorkflowCommands,
} from "./config/load-config.js";
import { createAuditLogger } from "./audit/logger.js";
import { createCommandExecuteBeforeHook } from "./hooks/command-execute-before.js";
import { createToolExecuteBeforeHook } from "./hooks/tool-execute-before.js";
import { createToolExecuteAfterHook } from "./hooks/tool-execute-after.js";
import { createSessionHook } from "./hooks/session.js";
import { createPermissionAskedHook } from "./hooks/permission-asked.js";
import { createFileEditedHook } from "./hooks/file-edited.js";

export async function DevaiAiddGuardPlugin({ client, directory }) {
  const fsAdapter = createFileSystemAdapter();
  const consoleAdapter = createConsoleAdapter();
  const httpAdapter = createHttpAdapter();
  const runtimeConfig = loadRuntimeConfig(directory, fsAdapter);
  const workflowCommands = loadWorkflowCommands(directory, fsAdapter);
  const audit = createAuditLogger({
    client,
    directory,
    config: runtimeConfig.config,
    fsAdapter,
    consoleAdapter,
    httpAdapter,
  });

  ensureLegacyProjectConfigCompatibility(directory, fsAdapter, runtimeConfig);

  await audit.info("plugin bootstrap", {
    workflowCommandCount: workflowCommands.size,
    hasGlobalConfig: runtimeConfig.sources.hasGlobalConfig,
    hasProjectConfig: runtimeConfig.sources.hasProjectConfig,
    hasLegacyProjectConfig: runtimeConfig.sources.hasLegacyProjectConfig,
  });

  // The legacy core keeps the existing guard behavior intact while the outer structure
  // moves to the standard DevAI layout.
  const legacyHandlers = await DevaiGitWorkflowPlugin({ client, directory });

  return {
    "command.execute.before": createCommandExecuteBeforeHook(legacyHandlers),
    "tool.execute.before": createToolExecuteBeforeHook(legacyHandlers),
    "tool.execute.after": createToolExecuteAfterHook(legacyHandlers),
    "permission.asked": createPermissionAskedHook(legacyHandlers),
    "file.edited": createFileEditedHook(legacyHandlers),
    event: createSessionHook(legacyHandlers),
  };
}

export { DevaiAiddGuardPlugin as DevaiGitWorkflowPlugin };
export default DevaiAiddGuardPlugin;
