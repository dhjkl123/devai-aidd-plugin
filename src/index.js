/**
 * src/index.js — DevAI AIDD Plugin bootstrap.
 *
 * Entry point for the BMAD command compatibility wrapper. The function
 * `DevaiAiddGuardPlugin` returns the 6 hook keys listed in
 * `SUPPORTED_HOOK_KEYS` (see `src/utils/constants.js`). All hook handlers
 * are wrapper-side (the legacy frozen baseline has been removed).
 *
 * This module performs best-effort bootstrap audit emissions
 * (`config.validation.failed`, `plugin bootstrap`) — none of these may abort
 * bootstrap on a throwing audit sink (NFR7/NFR8).
 */

import { createFileSystemAdapter } from "./adapters/fs.js";
import { createConsoleAdapter } from "./adapters/console.js";
import { createHttpAdapter } from "./adapters/http.js";
import {
  loadRuntimeConfig,
  loadWorkflowCommands,
  loadWorkflowSkills,
} from "./config/load-config.js";
import { createAuditLogger } from "./audit/logger.js";
import { createDebugLogger } from "./audit/debug-logger.js";
import { createWorkflowStateStore } from "./services/workflow/workflow-state.js";
import { createCommandExecuteBeforeHook } from "./hooks/command-execute-before.js";
import { createToolExecuteBeforeHook } from "./hooks/tool-execute-before.js";
import { createToolExecuteAfterHook } from "./hooks/tool-execute-after.js";
import { createPermissionAskedHook } from "./hooks/permission-asked.js";
import { createFileEditedHook } from "./hooks/file-edited.js";
import { createNativeEventHook } from "./hooks/native-event.js";
import { resolveWorkflowPolicy } from "./services/workflow/resolve-workflow-policy.js";
import { runGitAction, runGitCommand } from "./services/git/run-git-command.js";
import { buildRecoveryPrompt } from "./services/approval/build-recovery-prompt.js";
import { buildQuestionInstruction } from "./services/approval/build-question-instruction.js";
import {
  buildStartupChainQuestionInstruction,
} from "./services/approval/build-startup-chain-question-instruction.js";
import { parseStatusPorcelainPaths } from "./services/workflow/parse-status-porcelain.js";
// `SUPPORTED_HOOK_KEYS` is the canonical 6-key contract list referenced by
// the regression suite. Keep the import live so the SOT anchor cannot be
// silently tree-shaken away.
import { SUPPORTED_HOOK_KEYS } from "./utils/constants.js";

void SUPPORTED_HOOK_KEYS;

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
    const workflowSkills = loadWorkflowSkills(directory, fsAdapter);
    // opencode-skill-workflow-guard: union the two discovery channels into a
    // single Set. Downstream consumers (`detectWorkflowContext`,
    // `resolveWorkflowPolicy`, `branch.commandTypeMap`) work on a single
    // name → policy model, so commands and skills do not need to be
    // distinguished past discovery.
    const workflowNames = new Set([...workflowCommands, ...workflowSkills]);
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

    try {
      await audit.info("plugin bootstrap", {
        workflowCommandCount: workflowCommands.size,
        workflowSkillCount: workflowSkills.size,
        workflowNameCount: workflowNames.size,
        hasGlobalConfig: runtimeConfig.sources.hasGlobalConfig,
        hasProjectConfig: runtimeConfig.sources.hasProjectConfig,
        supportedRuntime: SUPPORTED_RUNTIME,
      });
    } catch {
      // best-effort
    }

    const workflowState = createWorkflowStateStore();
    const branchConfig = runtimeConfig.config.branch;

    // strengthen-git-init-proposal D2/D3: optional diagnostic logger gated by
    // `config.debug.enabled`. No-op when disabled. Surfaced through
    // pluginContext.debug so any service or hook can append a trace line
    // without taking a hard dependency on the logger module.
    const debugLogger = createDebugLogger({
      enabled: runtimeConfig.config?.debug?.enabled === true,
      logFilePath: runtimeConfig.config?.debug?.logFilePath ?? "",
      directory,
    });
    debugLogger.log("bootstrap", "plugin instance constructed", {
      directory,
      workflowCommandCount: workflowCommands.size,
      workflowSkillCount: workflowSkills.size,
      workflowNameCount: workflowNames.size,
      hasGlobalConfig: runtimeConfig.sources.hasGlobalConfig,
      hasProjectConfig: runtimeConfig.sources.hasProjectConfig,
    });

    // Task 6: when debug logging is enabled, dump the merged workflowNames
    // members so operators can confirm skill discovery picked up the expected
    // directories (and surface command/skill name collisions explicitly).
    if (runtimeConfig.config?.debug?.enabled === true) {
      const collisions = [];
      for (const name of workflowSkills) {
        if (workflowCommands.has(name)) collisions.push(name);
      }
      debugLogger.log("bootstrap", "workflow name discovery", {
        commands: Array.from(workflowCommands),
        skills: Array.from(workflowSkills),
        union: Array.from(workflowNames),
        collisions,
      });
      for (const name of collisions) {
        debugLogger.log("bootstrap", "name collision between command and skill", { name });
      }
    }

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
      debug: debugLogger,
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
        debugLogger.log("requestApproval", "received approval request", {
          actionType: request?.actionType,
          requestId: request?.id,
          actionId: request?.actionId,
          sessionID: request?.sessionID,
          hasPromptAsync: typeof client?.session?.promptAsync === "function",
        });
        if (client?.session?.promptAsync) {
          // strengthen-approval-prompt-instructions: replace the weak
          // single-line "Ask the user with the question tool..." prompt with
          // a scenario-specific, multi-line instruction modelled on the
          // legacy buildXxxQuestionInstruction builders. The builder is the
          // single chokepoint for header/options/instructionText -- the
          // adapter only handles try/catch + fallback wiring + debug logging.
          //
          // Fallback policy (adversarial F4): per-actionType default header
          // is preserved so a builder throw does not regress init/commit/
          // branch/push prompts to a generic "Approval Required" label.
          const FALLBACK_HEADERS = {
            init: "Initialize Git",
            commit: "Finalize Changes",
            "branch/create": "Create Branch",
            "branch/switch": "Switch Branch",
            push: "Push Changes",
          };
          let instruction;
          try {
            instruction = buildQuestionInstruction({
              commandName: request.workflow || request.command || null,
              actionType: request.actionType,
              proposal: request.proposal == null ? null : request.proposal,
            });
          } catch (error) {
            debugLogger.log(
              "requestApproval",
              "buildQuestionInstruction threw -- falling back to per-actionType header",
              {
                actionType: request?.actionType,
                error: error && error.message ? error.message : String(error),
              },
            );
            const fallbackHeader = FALLBACK_HEADERS[request.actionType] || "Approval Required";
            const fallbackOptions =
              request.actionType === "init"
                ? ["Initialize Git (Recommended)", "Cancel"]
                : ["Approve (Recommended)", "Deny", "Ignore and continue"];
            instruction = {
              header: fallbackHeader,
              options: fallbackOptions,
              instructionText: `Ask the user with the question tool. Header: "${fallbackHeader}". Options: ${fallbackOptions
                .map((opt) => `"${opt}"`)
                .join(", ")}.`,
            };
          }
          const nativeHeader = instruction.header;
          const nativeOptions = instruction.options;
          const nativeInstruction = instruction.instructionText;

          const bodyText =
            Array.isArray(request.prompt?.lines) && request.prompt.lines.length > 0
              ? [request.prompt.title, "", ...request.prompt.lines].join("\n")
              : request.prompt?.summary || `Approval required: ${request.actionType}`;
          const promptText = `${nativeInstruction}\n\n${bodyText}`;

          await client.session.promptAsync({
            sessionID: request.sessionID,
            directory,
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
                  questionHeader: nativeHeader,
                  questionOptions: nativeOptions,
                  explanation: request.metadata?.explanation,
                  sensitivity: request.metadata?.sensitivity,
                  detailLevel: request.metadata?.detailLevel,
                },
              },
            ],
          });
          debugLogger.log("requestApproval", "prompt delivered to client.session.promptAsync", {
            actionType: request?.actionType,
            proposalKind: request?.proposal?.kind ?? null,
            proposalAction: request?.proposal?.action ?? null,
            requestId: request?.id,
            header: nativeHeader,
            options: nativeOptions,
            instructionLength: nativeInstruction?.length ?? 0,
            instructionPreview: nativeInstruction ? nativeInstruction.slice(0, 200) : "",
            promptTextLength: promptText?.length ?? 0,
          });
        } else {
          debugLogger.log("requestApproval", "SKIPPED — client.session.promptAsync is not a function", {
            actionType: request?.actionType,
            requestId: request?.id,
          });
        }
      },

      async requestStartupChainApproval(chainRequest) {
        debugLogger.log("requestStartupChainApproval", "received startup chain request", {
          startupChainId: chainRequest?.startupChainId,
          sessionID: chainRequest?.sessionID,
          stepCount: Array.isArray(chainRequest?.steps) ? chainRequest.steps.length : 0,
        });
        // Startup chain prompts are delivered to the model via `output.parts`
        // in `command-execute-before.js`. The model is instructed to call the
        // native `question` tool with the chain question batch; native-event
        // hook routes `question.asked` / `question.replied` back to
        // `executeStartupChain`. No promptAsync delivery is required here.
        const instruction = buildStartupChainQuestionInstruction(chainRequest);
        debugLogger.log("requestStartupChainApproval", "startup chain will be handled by native question tool via output.parts", {
          startupChainId: instruction.startupChainId,
          sessionID: chainRequest?.sessionID,
          questionKeys: instruction.metadata.questionKeys,
        });
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
          const nativeOptions = prompt.choices.map((choice) => `"${choice}"`).join(", ");
          const nativeInstruction = `Ask the user with the question tool. Header: "${prompt.title}". Options: ${nativeOptions}.`;
          const bodyText =
            Array.isArray(prompt.lines) && prompt.lines.length > 0
              ? [prompt.title, "", ...prompt.lines].join("\n")
              : prompt.summary;
          const promptText = `${nativeInstruction}\n\n${bodyText}`;

          await client.session.promptAsync({
            sessionID: gate.sessionID,
            directory,
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
                  questionHeader: prompt.title,
                  questionOptions: prompt.choices,
                  recommendedChoice: prompt.recommendedChoice,
                  source: gate.source ?? null,
                },
              },
            ],
          });
        }
      },
    };

    // The hook map below is the external plugin contract surface. Its keys
    // MUST stay byte-for-byte equal to `SUPPORTED_HOOK_KEYS`. Under the native
    // opencode runtime, `event` is the load-bearing native router that handles
    // `command.executed`, `question.asked`, `question.replied`,
    // `question.rejected`, and `session.deleted`. The other five named
    // handlers remain as compatibility-only ingress points for the in-process
    // test harness and any non-native invocation path.
    const commandExecuteBeforeHandler = createCommandExecuteBeforeHook({
      // opencode-skill-workflow-guard: inject the unioned name set under the
      // legacy `workflowCommands` key so the downstream factory and tests
      // continue to consume the same shape (single Set membership check).
      workflowCommands: workflowNames,
      workflowState,
      audit,
      pluginContext,
      branchConfig,
    });

    return {
      // The `tool` surface is retained as part of the SUPPORTED_HOOK_KEYS
      // contract (Story 4.5). The previous startup-approval custom tool was
      // removed because opencode's ToolContext does not expose an
      // `askQuestion()` API; startup chain approvals are now delivered to the
      // model via `output.parts` instruction text and resolved through the
      // native `question` tool flow (`question.asked` / `question.replied`).
      tool: {},
      "command.execute.before": commandExecuteBeforeHandler,
      // Story 2.3 (LOW): tool.execute.before / tool.execute.after only consume
      // workflowState today (phase advancement). pluginContext is unused by
      // these factories — keep the injection surface minimal so the contract
      // matches the consumer.
      "tool.execute.before": createToolExecuteBeforeHook({
        workflowState,
        pluginContext,
        // opencode-skill-workflow-guard: skill-trigger branch needs the
        // shared handler and the unioned name set. `runtimeConfig` gates the
        // F1 diagnostic logger.
        commandExecuteBeforeHandler,
        workflowNames,
        audit,
        runtimeConfig,
      }),
      "tool.execute.after": createToolExecuteAfterHook({
        workflowState,
        audit,
        pluginContext,
      }),
      "permission.asked": createPermissionAskedHook({
        // Story 2.5 (MEDIUM review): pluginContext is now consumed so the
        // hook can deliver recovery prompts via `requestRecoveryDecision`
        // and route the user's response back into `selectRecoveryChoice` /
        // `confirmManualResolution`.
        workflowState,
        audit,
        pluginContext,
      }),
      "file.edited": createFileEditedHook({ workflowState, pluginContext }),
      // Native event router. `command.executed` delegates to the legacy
      // command-execute-before factory to reuse workflow detection /
      // readiness / branch / init planning. `session.deleted` still clears
      // session state — the legacy session hook is now embedded inside the
      // native router so we keep a single ingress for session lifecycle.
      event: createNativeEventHook({
        workflowState,
        audit,
        pluginContext,
        commandExecuteBeforeHandler,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (audit) {
      await audit.error("plugin bootstrap failed", {
        message,
        supportedRuntime: SUPPORTED_RUNTIME,
      });
    } else {
      consoleAdapter.error(`[devai-aidd-plugin] plugin bootstrap failed: ${message}`);
    }

    throw new Error(
      `DevAI AIDD Plugin bootstrap failed: ${message}. Supported runtime: ${SUPPORTED_RUNTIME}.`,
      { cause: error },
    );
  }
}

export default DevaiAiddGuardPlugin;
