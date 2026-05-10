import { DevaiGitWorkflowPlugin } from "./policies/legacy/devai-git-workflo.js";
import { createFileSystemAdapter } from "./adapters/fs.js";
import { createConsoleAdapter } from "./adapters/console.js";
import { createHttpAdapter } from "./adapters/http.js";
import {
  loadRuntimeConfig,
  loadWorkflowCommands,
} from "./config/load-config.js";
import { ensureLegacyProjectConfigCompatibility } from "./services/compat/legacy-bridge-service.js";
import { createAuditLogger } from "./audit/logger.js";
import { createWorkflowStateStore } from "./services/workflow/workflow-state.js";
import { createCommandExecuteBeforeHook } from "./hooks/command-execute-before.js";
import { createToolExecuteBeforeHook } from "./hooks/tool-execute-before.js";
import { createToolExecuteAfterHook } from "./hooks/tool-execute-after.js";
import { createSessionHook } from "./hooks/session.js";
import { createPermissionAskedHook } from "./hooks/permission-asked.js";
import { createFileEditedHook } from "./hooks/file-edited.js";
import { resolveWorkflowPolicy } from "./services/workflow/resolve-workflow-policy.js";
import { runGitAction, runGitCommand } from "./services/git/run-git-command.js";
import { buildRecoveryPrompt } from "./services/approval/build-recovery-prompt.js";
import { parseStatusPorcelainPaths } from "./services/workflow/parse-status-porcelain.js";

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
    //
    // Story 4.1: `validation.errors` may also contain vocabulary warnings
    // (`params.source === "vocabulary"`, `params.kind === "warning"`) that do
    // NOT flip `validation.valid` to false. Triggering on
    // `errors.length > 0` ensures those advisory entries also surface through
    // the audit channel without forcing a layer drop or fake "validation
    // failure" status.
    if (
      !runtimeConfig.validation.valid ||
      runtimeConfig.validation.droppedLayers.length > 0 ||
      (runtimeConfig.validation.errors || []).length > 0
    ) {
      const normalizedErrors = (runtimeConfig.validation.errors || []).map((err) => ({
        instancePath: err.instancePath,
        message: err.message,
        params: err.params,
      }));
      // Story 3.4 (review L2): bootstrap audit emissions are best-effort —
      // a throwing logger here must not crash plugin bootstrap.
      try {
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
      } catch {
        // best-effort
      }
    }

    // Story 4.2: emit the bridge lifecycle decision via best-effort audit so
    // operators can see exactly which decision-table branch fired (e.g.
    // `preserve-user-legacy` proves AC2 is enforced; `no-content-change`
    // confirms idempotent skip). Mirrors the Story 1.3 pattern for
    // `config.validation.failed` — a throwing audit sink must not crash
    // bootstrap (NFR7/NFR8).
    //
    // R2 (M-2): `ensureLegacyProjectConfigCompatibility` itself is now
    // best-effort and converts disk-write failures into
    // `{ written: false, reason: "write-failed", error }`. We additionally
    // wrap the call in try/catch as belt-and-suspenders so any future
    // contract change (e.g. an unexpected throw before the internal try)
    // still cannot crash bootstrap.
    let bridgeOutcome;
    try {
      bridgeOutcome = ensureLegacyProjectConfigCompatibility(
        directory,
        fsAdapter,
        runtimeConfig,
      );
    } catch (bridgeError) {
      const message =
        bridgeError && typeof bridgeError.message === "string"
          ? bridgeError.message
          : String(bridgeError);
      bridgeOutcome = {
        written: false,
        reason: "bridge-threw",
        error: message,
        sources: {
          hasGlobalConfig: Boolean(runtimeConfig.sources?.hasGlobalConfig),
          hasProjectConfig: Boolean(runtimeConfig.sources?.hasProjectConfig),
          hasLegacyProjectConfig: Boolean(runtimeConfig.sources?.hasLegacyProjectConfig),
          hasLegacyWorkflowProjectConfig: Boolean(
            runtimeConfig.sources?.hasLegacyWorkflowProjectConfig,
          ),
        },
        markerPresent: false,
      };
    }
    try {
      const bridgeAuditPayload = {
        event: "compat.bridge.evaluated",
        timestamp: new Date().toISOString(),
        workflow: null,
        command: null,
        details: {
          written: bridgeOutcome.written,
          reason: bridgeOutcome.reason,
          sources: bridgeOutcome.sources,
          markerPresent: bridgeOutcome.markerPresent,
          ...(bridgeOutcome.paths ? { bridgePaths: bridgeOutcome.paths } : {}),
          ...(bridgeOutcome.error ? { error: bridgeOutcome.error } : {}),
        },
      };
      await audit.info("compat.bridge.evaluated", bridgeAuditPayload);
    } catch {
      // best-effort
    }

    try {
      await audit.info("plugin bootstrap", {
        workflowCommandCount: workflowCommands.size,
        hasGlobalConfig: runtimeConfig.sources.hasGlobalConfig,
        hasProjectConfig: runtimeConfig.sources.hasProjectConfig,
        hasLegacyProjectConfig: runtimeConfig.sources.hasLegacyProjectConfig,
        supportedRuntime: SUPPORTED_RUNTIME,
      });
    } catch {
      // best-effort
    }

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
      try {
        await audit.info("plugin bootstrap registered no-op hooks", {
          hooks: wrapperOnlyHooks,
          reason: "no legacy handler present; wrapper returns undefined for these hook names",
        });
      } catch {
        // best-effort
      }
    }

    const workflowState = createWorkflowStateStore();
    const branchConfig = runtimeConfig.config.branch;

    // Build pluginContext so downstream hook factories (Story 1.4+) and
    // approval hooks (Epic 2) can consume the resolver without re-loading config.
    //
    // requestApproval(request) — prompt adapter; delegates to runtime client.
    // Story 2.3 will wire the outcome back. Failure here is best-effort (FR22).
    //
    // The runtime client dependency is only created here in bootstrap; services
    // never hold a direct reference to `client`.
    const pluginContext = {
      runtimeConfig,
      directory,
      gitRunner: runGitCommand,
      gitActionRunner: ({ action }) =>
        runGitAction({
          directory,
          action,
        }),
      resolvePolicy: (workflowContext) => resolveWorkflowPolicy(workflowContext, runtimeConfig.config),
      listChangedFiles() {
        try {
          const stdout = runGitCommand({
            directory,
            command: "status-porcelain",
          });
          return parseStatusPorcelainPaths(stdout);
        } catch {
          return [];
        }
      },

      // Prompt adapter — delegates to runtime client.session.promptAsync.
      // Injected here so hook tests can substitute a mock without touching client.
      //
      // Story 2.2: prompt body and metadata are derived from the canonical
      // explanation payload built by buildApprovalRequest — this adapter must
      // not recompose strings, only forward what the request already contains.
      async requestApproval(request) {
        if (client?.session?.promptAsync) {
          const promptText =
            Array.isArray(request.prompt?.lines) && request.prompt.lines.length > 0
              ? [request.prompt.title, "", ...request.prompt.lines].join("\n")
              : request.prompt?.summary || `Approval required: ${request.actionType}`;

          await client.session.promptAsync({
            sessionID: request.sessionID,
            parts: [
              {
                type: "text",
                text: promptText,
                metadata: {
                  requestId: request.id,
                  // Story 2.3 (LOW-2): echo actionId on the prompt so the
                  // permission-asked ingress can resolve via either the
                  // request's id or its actionId without forcing the runtime
                  // to know about the requestId-only path.
                  actionId: request.actionId,
                  actionType: request.actionType,
                  phase: request.phase,
                  workflow: request.workflow,
                  explanation: request.metadata?.explanation,
                  sensitivity: request.metadata?.sensitivity,
                  detailLevel: request.metadata?.detailLevel,
                },
              },
            ],
          });
        }
      },

      // Story 2.5 (MEDIUM review): prompt-delivery adapter for recovery gates.
      // Mirrors `requestApproval` so a recovery gate's `options[]` reaches the
      // user immediately. Without this, AC1 — "those options are explained in
      // a way the user can act on immediately" — would only be data-shape
      // complete and the gate would stay open indefinitely. Failure is
      // best-effort (FR22): the orchestrator already persisted the gate before
      // delivery, so a runtime client misbehavior must not throw out of the
      // hook that triggered it.
      async requestRecoveryDecision(gate) {
        if (
          client?.session?.promptAsync &&
          gate &&
          Array.isArray(gate.options) &&
          gate.options.length > 0
        ) {
          const prompt = buildRecoveryPrompt(gate);
          const promptText =
            Array.isArray(prompt.lines) && prompt.lines.length > 0
              ? [prompt.title, "", ...prompt.lines].join("\n")
              : prompt.summary;

          await client.session.promptAsync({
            sessionID: gate.sessionID,
            parts: [
              {
                type: "text",
                text: promptText,
                metadata: {
                  recoveryGateId: gate.gateId,
                  actionId: gate.actionId ?? null,
                  actionKind: gate.actionKind ?? null,
                  attempt: gate.attempt ?? 1,
                  recoverable: gate.recoverable === true,
                  choices: prompt.choices,
                  recommendedChoice: prompt.recommendedChoice,
                  source: gate.source ?? null,
                },
              },
            ],
          });
        }
      },
    };

    return {
      "command.execute.before": createCommandExecuteBeforeHook(legacyHandlers, {
        workflowCommands,
        workflowState,
        audit,
        pluginContext,
        branchConfig,
      }),
      // Story 2.3 (LOW): tool.execute.before / tool.execute.after only consume
      // workflowState today (phase advancement). pluginContext is unused by
      // these factories — keep the injection surface minimal so the contract
      // matches the consumer (mirrors the LOW-3 cleanup on permission.asked).
      "tool.execute.before": createToolExecuteBeforeHook(legacyHandlers, { workflowState }),
      "tool.execute.after": createToolExecuteAfterHook(legacyHandlers, {
        workflowState,
        audit,
        pluginContext,
      }),
      "permission.asked": createPermissionAskedHook(legacyHandlers, {
        // Story 2.5 (MEDIUM review): pluginContext is now consumed so the
        // hook can deliver recovery prompts via `requestRecoveryDecision`
        // and route the user's response back into `selectRecoveryChoice` /
        // `confirmManualResolution`. Approval ingress remains unchanged.
        workflowState,
        audit,
        pluginContext,
      }),
      "file.edited": createFileEditedHook(legacyHandlers, { workflowState, pluginContext }),
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
