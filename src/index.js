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
import { createWorkflowStateStore } from "./services/workflow/workflow-state.js";
import { createCommandExecuteBeforeHook } from "./hooks/command-execute-before.js";
import { createToolExecuteBeforeHook } from "./hooks/tool-execute-before.js";
import { createToolExecuteAfterHook } from "./hooks/tool-execute-after.js";
import { createSessionHook } from "./hooks/session.js";
import { createPermissionAskedHook } from "./hooks/permission-asked.js";
import { createFileEditedHook } from "./hooks/file-edited.js";
import { resolveWorkflowPolicy } from "./services/workflow/resolve-workflow-policy.js";
import { runGitCommand } from "./services/git/run-git-command.js";

const SUPPORTED_RUNTIME = "Node.js ESM plugin runtime (Node 22 target)";

function assertBootstrapEnvironment({ client, directory }) {
  if (!directory || typeof directory !== "string") {
    throw new Error("A valid plugin directory is required.");
  }

  if (!client || typeof client !== "object") {
    throw new Error("A valid runtime client is required.");
  }
}

export async function DevaiAiddGuardPlugin({ client, directory }) {
  const fsAdapter = createFileSystemAdapter();
  const consoleAdapter = createConsoleAdapter();
  const httpAdapter = createHttpAdapter();
  let audit;

  try {
    assertBootstrapEnvironment({ client, directory });

    const runtimeConfig = loadRuntimeConfig(directory, fsAdapter);
    const workflowCommands = loadWorkflowCommands(directory, fsAdapter);
    audit = createAuditLogger({
      client,
      directory,
      config: runtimeConfig.config,
      fsAdapter,
      consoleAdapter,
      httpAdapter,
    });

    // Emit config.validation.failed audit event if any config layer was dropped or had errors.
    // Best-effort only — bootstrap continues regardless of audit outcome (NFR7/NFR8).
    if (!runtimeConfig.validation.valid || runtimeConfig.validation.droppedLayers.length > 0) {
      const normalizedErrors = (runtimeConfig.validation.errors || []).map((err) => ({
        instancePath: err.instancePath,
        message: err.message,
        params: err.params,
      }));
      await audit.info("config.validation.failed", {
        event: "config.validation.failed",
        timestamp: new Date().toISOString(),
        workflow: null,
        command: null,
        details: {
          droppedLayers: runtimeConfig.validation.droppedLayers,
          errors: normalizedErrors,
        },
      });
    }

    ensureLegacyProjectConfigCompatibility(directory, fsAdapter, runtimeConfig);

    await audit.info("plugin bootstrap", {
      workflowCommandCount: workflowCommands.size,
      hasGlobalConfig: runtimeConfig.sources.hasGlobalConfig,
      hasProjectConfig: runtimeConfig.sources.hasProjectConfig,
      hasLegacyProjectConfig: runtimeConfig.sources.hasLegacyProjectConfig,
      supportedRuntime: SUPPORTED_RUNTIME,
    });

    const legacyHandlers = await DevaiGitWorkflowPlugin({
      client,
      directory,
      workflowCommands,
    });
    if (!legacyHandlers || typeof legacyHandlers !== "object") {
      throw new Error("Legacy hook registration did not return a handler map.");
    }

    const wrapperOnlyHooks = ["permission.asked", "file.edited"].filter(
      (hookName) => typeof legacyHandlers[hookName] !== "function",
    );
    if (wrapperOnlyHooks.length > 0) {
      await audit.info("plugin bootstrap registered no-op hooks", {
        hooks: wrapperOnlyHooks,
        reason: "no legacy handler present; wrapper returns undefined for these hook names",
      });
    }

    const workflowState = createWorkflowStateStore();
    const branchConfig = runtimeConfig.config.branch;

    // Build pluginContext so downstream hook factories (Story 1.4+) and
    // approval hooks (Epic 2) can consume the resolver without re-loading config.
    const pluginContext = {
      runtimeConfig,
      directory,
      gitRunner: runGitCommand,
      resolvePolicy: (workflowContext) => resolveWorkflowPolicy(workflowContext, runtimeConfig.config),
    };

    return {
      "command.execute.before": createCommandExecuteBeforeHook(legacyHandlers, {
        workflowCommands,
        workflowState,
        audit,
        pluginContext,
        branchConfig,
      }),
      "tool.execute.before": createToolExecuteBeforeHook(legacyHandlers, { workflowState, pluginContext }),
      "tool.execute.after": createToolExecuteAfterHook(legacyHandlers, { workflowState, pluginContext }),
      "permission.asked": createPermissionAskedHook(legacyHandlers, { pluginContext }),
      "file.edited": createFileEditedHook(legacyHandlers, { pluginContext }),
      event: createSessionHook(legacyHandlers, { workflowState, pluginContext }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (audit) {
      await audit.error("plugin bootstrap failed", {
        message,
        supportedRuntime: SUPPORTED_RUNTIME,
      });
    } else {
      consoleAdapter.error(`[devai-aidd-guard] plugin bootstrap failed: ${message}`);
    }

    throw new Error(
      `DevAI AIDD Guard bootstrap failed: ${message}. Supported runtime: ${SUPPORTED_RUNTIME}.`,
      { cause: error },
    );
  }
}

export { DevaiAiddGuardPlugin as DevaiGitWorkflowPlugin };
export default DevaiAiddGuardPlugin;
