/**
 * tool-execute-before.js
 *
 * Wrapper hook for `tool.execute.before`. Guard layers:
 *
 *   1. block-until-init (strengthen-git-init-proposal):
 *      When the working directory is not a git repository, or an init proposal
 *      is pending/active, refuse any `bash` tool call whose command looks
 *      like a `git` invocation. The guard runs **before** the workflow-session
 *      gate so the model's pre-workflow `git rev-parse` race no longer leaks
 *      a `fatal: not a git repository` stderr through to the user.
 *
 * File-mutating tools are intentionally allowed here. Git workflow automation
 * tracks those changes after execution instead of blocking the edit/write
 * tool call up front.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";
import { looksLikeGitCommand } from "../services/workflow/looks-like-git-command.js";
import { buildQuestionInstruction } from "../services/approval/build-question-instruction.js";
import {
  buildStartupChainQuestionInstruction,
} from "../services/approval/build-startup-chain-question-instruction.js";
import { FINALIZATION_SENTINEL_HEADER } from "../services/approval/build-finalization-sentinel-instruction.js";
import { SKILL_TOOL_TOKENS } from "../utils/constants.js";
import { adaptAndInvokeCommandHandler } from "./native-event.js";

// TD #3 canonical block message — exported so regression tests can import the
// single source of truth instead of duplicating the literal in multiple files.
export const BASH_GIT_BLOCK_MESSAGE =
  "Git workflow guard: a git repository must be initialized before running git commands. Approve the pending \"Initialize Git\" prompt instead of running git directly.";

/**
 * Builds the throw message used when the model calls the native `question`
 * tool with a header that does not match the active approval's expected
 * header. The message lists the expected header AND options so the model can
 * retry the tool call without paraphrasing.
 */
function buildQuestionHeaderMismatchMessage({ expected, actual }) {
  const optionsJson = JSON.stringify(expected.options);
  return (
    `Git workflow guard: an approval is pending and the question tool must be called with ` +
    `header \`${expected.header}\` and options ${optionsJson}. ` +
    `Got header \`${actual ?? "(missing)"}\`. ` +
    `Re-call the question tool with those exact values.`
  );
}

function readQuestionToolHeader(args) {
  if (!args || typeof args !== "object") return null;
  if (typeof args.header === "string" && args.header.length > 0) return args.header;
  if (typeof args.title === "string" && args.title.length > 0) return args.title;
  if (Array.isArray(args.questions) && args.questions.length > 0) {
    const first = args.questions[0];
    if (typeof first?.header === "string" && first.header.length > 0) return first.header;
    if (typeof first?.title === "string" && first.title.length > 0) return first.title;
  }
  return null;
}

function directoryIsGitRepo(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    // F5 fix: fail CLOSED when pluginContext.directory is missing/empty.
    // This is the race-safe contract — if we cannot determine whether the
    // working directory is a git repository, behave as if it isn't and let
    // the block fire. Otherwise a future bootstrap regression that drops the
    // pluginContext injection silently disables the block-until-init guard.
    return false;
  }
  try {
    return existsSync(join(directory, ".git"));
  } catch {
    // existsSync should not throw in normal operation; if it does, fall
    // CLOSED (treat as not-a-repo) to preserve the safe default.
    return false;
  }
}

function normalizeShellCommand(command) {
  return typeof command === "string" ? command.trim() : "";
}

function hasQuotedCommitMessage(command, message) {
  if (typeof command !== "string" || typeof message !== "string" || message.length === 0) {
    return false;
  }
  const escapedDouble = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedSingle = message.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return (
    command.includes(`-m "${escapedDouble}"`) ||
    command.includes(`--message "${escapedDouble}"`) ||
    command.includes(`-m '${escapedSingle}'`) ||
    command.includes(`--message '${escapedSingle}'`)
  );
}

function isDelegatedFinalizationStatusCheck(command) {
  const raw = normalizeShellCommand(command);
  if (raw.length === 0) return false;
  return (
    /^git\s+status(?:\s|$)/i.test(raw) ||
    /^git\s+status\s+--short(?:\s|$)/i.test(raw) ||
    /^git\s+status\s+--porcelain(?:\s|$)/i.test(raw)
  );
}

function isScopedDelegatedFinalizationCommand(command, delegatedFinalization) {
  if (delegatedFinalization?.stage !== "awaiting-commit") {
    return false;
  }
  const raw = normalizeShellCommand(command);
  if (raw.length === 0) return false;
  if (isDelegatedFinalizationStatusCheck(raw)) return true;
  if (!/\bgit\s+commit\b/i.test(raw)) return false;
  if (!hasQuotedCommitMessage(raw, delegatedFinalization.commitMessage)) return false;
  const gitCommands = raw.match(/\bgit\s+/gi) ?? [];
  if (gitCommands.length > 2) return false;
  if (gitCommands.length === 2 && !/\bgit\s+add\b/i.test(raw)) return false;
  return true;
}

function buildDelegatedFinalizationBlockMessage(delegatedFinalization) {
  const message = delegatedFinalization?.commitMessage ?? "";
  return (
    "Git workflow guard: delegated finalization is active. " +
    "Only the scoped finalization path is allowed right now. " +
    "You may run `git status` re-checks and then the final commit. " +
    `The commit MUST use the exact suggested message \`${message}\`, ` +
    "or complete the skip branch if the user chose Skip."
  );
}

export function createToolExecuteBeforeHook({
  workflowState,
  pluginContext,
  commandExecuteBeforeHandler,
  workflowNames,
  audit,
  runtimeConfig,
} = {}) {
  // opencode SDK 1.14 — tool.execute.before signature is
  //   (input: { tool, sessionID, callID }, output: { args: any })
  // The actual tool arguments live on `output.args`, NOT on `input.args`.
  // Prior strengthen-git-init-proposal code read `input.args?.command` and
  // silently never matched in production; the new question-header guard
  // hit the same bug. Always read args from `output.args`, with a defensive
  // fallback to `input.args` so the regression test mocks (which still put
  // args on the input) keep passing.
  const debugEnabled = runtimeConfig?.config?.debug?.enabled === true;
  return async (input, output) => {
    const toolArgs =
      output && typeof output === "object" && output.args != null
        ? output.args
        : input?.args ?? null;

    // F1 (opencode-skill-workflow-guard): unconditional unknown-tool-name
    // observation log. Fires BEFORE the skill-trigger matching block so an
    // incorrect SKILL_TOOL_TOKENS guess does NOT silence the diagnostic.
    // Dedup is session-scoped via workflowState.observedToolNames(sessionID).
    if (debugEnabled && typeof input?.tool === "string") {
      try {
        const seen = workflowState?.observedToolNames?.(input.sessionID);
        if (seen && !seen.has(input.tool)) {
          seen.add(input.tool);
          pluginContext?.debug?.log?.(
            "tool-execute-before",
            "tool name observed (first time this session)",
            {
              sessionID: input?.sessionID,
              toolName: input.tool,
              toolArgsKeys:
                toolArgs && typeof toolArgs === "object" && !Array.isArray(toolArgs)
                  ? Object.keys(toolArgs)
                  : null,
              matchesSkillTokenSet: SKILL_TOOL_TOKENS.has(input.tool.toLowerCase()),
            },
          );
        }
      } catch {
        // best-effort: never crash the hook on diagnostic logging.
      }
    }

    // Skill-as-workflow trigger (opencode-skill-workflow-guard).
    // Position: hook body entry, immediately after F1 diagnostic log, BEFORE
    // Layer 1 (bash+git block). Layer-order regression is detected by
    // AC4-a (debug.log call-sequence test).
    //
    // Effect: when the model invokes a Skill tool, this branch wakes the same
    // commandExecuteBeforeHandler that the slash-command path uses, seeding
    // readiness/branch/init/approval state. The actual model-side guidance is
    // delivered by Layer 0's throw on the next cycle (see Technical Decision
    // 7 in the tech-spec) — the synthetic `{ parts: [] }` we pass through
    // never reaches the runtime.
    if (
      typeof input?.tool === "string" &&
      SKILL_TOOL_TOKENS.has(input.tool.toLowerCase())
    ) {
      // F2: trigger-name candidates are `skill` / `skillName` only.
      // `name` is too generic and would risk false-matching unrelated tools'
      // `name` fields — log it as a diagnostic side-field only.
      const skillName =
        typeof toolArgs?.skill === "string" && toolArgs.skill.length > 0
          ? toolArgs.skill
          : typeof toolArgs?.skillName === "string" && toolArgs.skillName.length > 0
            ? toolArgs.skillName
            : null;
      const fallbackNameField =
        typeof toolArgs?.name === "string" ? toolArgs.name : null;

      pluginContext?.debug?.log?.(
        "tool-execute-before",
        "skill tool invocation observed",
        {
          sessionID: input?.sessionID,
          toolName: input.tool,
          resolvedSkillName: skillName,
          fallbackNameField,
          toolArgsKeys:
            toolArgs && typeof toolArgs === "object" && !Array.isArray(toolArgs)
              ? Object.keys(toolArgs)
              : null,
        },
      );

      const priorState = workflowState?.get?.(input?.sessionID);
      const guardBusy =
        priorState?.approvalCurrent != null ||
        priorState?.startupChainCurrent != null;
      if (
        typeof skillName === "string" &&
        workflowNames &&
        typeof workflowNames.has === "function" &&
        workflowNames.has(skillName) &&
        priorState?.commandName !== skillName &&
        !guardBusy
      ) {
        try {
          await adaptAndInvokeCommandHandler({
            commandExecuteBeforeHandler,
            commandName: skillName,
            args: "",
            sessionID: input?.sessionID,
            audit,
            source: "tool-execute-before",
          });
        } catch (error) {
          pluginContext?.debug?.log?.(
            "tool-execute-before",
            "skill-trigger handler invocation failed (best-effort)",
            {
              sessionID: input?.sessionID,
              resolvedSkillName: skillName,
              error: error?.message ?? String(error),
            },
          );
        }
      }
    }

    // Layer 1: bash + git block (most specific — gives the model the exact
    // "approve the pending Initialize Git prompt instead of running git
    // directly" guidance). Runs first so its canonical contract message
    // wins over Layer 0's generic approval-pending block.
    if (input?.tool === "bash" && looksLikeGitCommand(toolArgs?.command)) {
      const state = workflowState?.get?.(input?.sessionID);
      const delegatedFinalization = state?.delegatedFinalization ?? null;
      if (delegatedFinalization) {
        if (isScopedDelegatedFinalizationCommand(toolArgs?.command, delegatedFinalization)) {
          return;
        }
        throw new Error(buildDelegatedFinalizationBlockMessage(delegatedFinalization));
      }
      // When the user has explicitly opted out of git automation for this
      // session — by picking Skip OR a freeform answer on the Initialize Git
      // prompt, or by skipping the baseline commit — we must NOT keep
      // throwing the "approve the pending Initialize Git prompt" message
      // (there is no pending prompt anymore). The start-instruction text
      // already tells the model that git automation is disabled; if the
      // model runs `git` anyway, that is on the model, not on the guard.
      const userOptedOut =
        state?.gitInitSkipped === true || state?.baselineSkipped === true;
      const initPending = state?.initProposal != null;
      const initActive = state?.approvalCurrent?.actionType === "init";
      const dirIsGit = directoryIsGitRepo(pluginContext?.directory);
      const trackedSkipActive =
        typeof state?.commandName === "string" &&
        state.commandName.length > 0 &&
        state?.readinessGate?.enabled === false;
      if (!userOptedOut && (initPending || initActive || (!dirIsGit && !trackedSkipActive))) {
        throw new Error(BASH_GIT_BLOCK_MESSAGE);
      }
    }

    // Layer 0 (despite the name, runs after Layer 1): approval-pending block
    // (legacy-pattern). If an approval is active and the model has not yet
    // emitted the matching question.asked event, refuse every non-question
    // tool call -- forcing the model into a dead-end where the only valid
    // next action is to call the question tool with the canonical header.
    // The throw message inlines the full builder instruction text so the
    // model sees the exact header/options on every retry without depending
    // on the promptAsync prompt landing twice.
    if (input?.tool !== "question") {
      const state = workflowState?.get?.(input?.sessionID);
      const delegatedFinalization = state?.delegatedFinalization ?? null;
      if (delegatedFinalization?.stage === "awaiting-commit") {
        const allowedScopedCommit =
          input?.tool === "bash" &&
          isScopedDelegatedFinalizationCommand(toolArgs?.command, delegatedFinalization);
        if (!allowedScopedCommit) {
          throw new Error(buildDelegatedFinalizationBlockMessage(delegatedFinalization));
        }
      }
      const active = state?.approvalCurrent;
      if (active && state?.pendingApprovalQuestion == null) {
        let pendingInstruction = null;
        try {
          pendingInstruction = buildQuestionInstruction({
            commandName: active.workflow || active.command || null,
            actionType: active.actionType,
            proposal: active.proposal ?? null,
          });
        } catch {
          // best-effort: fall back to a generic message if the builder throws
          pendingInstruction = null;
        }
        const expectedHeader = pendingInstruction?.header ?? "Approval Required";
        const expectedOptions =
          pendingInstruction?.options && pendingInstruction.options.length > 0
            ? pendingInstruction.options
            : ["Approve (Recommended)", "Deny", "Ignore and continue"];
        const inlinedInstructionText =
          pendingInstruction?.instructionText ??
          `Ask the user the \`${expectedHeader}\` question with these exact options: ${expectedOptions.map((o) => `\`${o}\``).join(", ")}.`;
        pluginContext?.debug?.log?.(
          "tool-execute-before",
          "approval-pending block — throwing to force model to call the question tool",
          {
            sessionID: input?.sessionID,
            tool: input?.tool,
            actionType: active.actionType,
            expectedHeader,
          },
        );
        throw new Error(
          `Git workflow guard: an approval is pending and you must call the question tool with header \`${expectedHeader}\` and options ${JSON.stringify(expectedOptions)} BEFORE any other tool. Do not run any other tool, read or modify files, or respond with plain text until the user answers the question. ${inlinedInstructionText}`,
        );
      }
      const startupChain = state?.startupChainCurrent;
      if (startupChain && state?.pendingStartupQuestion == null) {
        const instruction = buildStartupChainQuestionInstruction(startupChain);
        throw new Error(
          `Git workflow guard: a startup approval chain is pending and you must call the native \`question\` tool with the staged question batch BEFORE any other tool. Do not run any other tool, read or modify files, or respond with plain text until the user answers the startup questions. ${instruction.instructionText}`,
        );
      }
    }

    // Layer 2: question-header guard (force the model to use the header we
    // staged via promptAsync metadata). The model has been observed to ignore
    // the strong instruction text and emit a paraphrased question (e.g.
    // "초기화 확인" instead of "Initialize Git") while an approval is pending.
    // We re-derive the expected header from the same builder the
    // `requestApproval` adapter uses, compare to the tool args, and throw a
    // retry-with-exact-values error on mismatch.
    if (input?.tool === "question") {
      // Sentinel passthrough — MUST be first inside the question branch so it
      // bypasses both the startup-chain header guard and the active-approval
      // header guard. The model is required to emit this sentinel as the last
      // workflow action; blocking it would prevent finalization detection.
      const sentinelHeaderFromArgs = readQuestionToolHeader(toolArgs);
      if (sentinelHeaderFromArgs === FINALIZATION_SENTINEL_HEADER) {
        const state = workflowState?.get?.(input?.sessionID) ?? null;
        if (!directoryIsGitRepo(pluginContext?.directory)) {
          pluginContext?.debug?.log?.(
            "tool-execute-before",
            "sentinel blocked because repository is not initialized",
            {
              sessionID: input?.sessionID,
              readinessOutcome: state?.readiness?.outcome ?? null,
              readinessReason: state?.readiness?.reason ?? null,
              isGitRepository: state?.readiness?.details?.isGitRepository ?? null,
            },
          );
          throw new Error(
            "Git workflow guard: do not call the workflow finalization question in a non-git workspace. The plugin only allows finalization commit/skip questions after repository readiness confirms `isGitRepository === true`.",
          );
        }
        pluginContext?.debug?.log?.(
          "tool-execute-before",
          "sentinel header passthrough",
          { sessionID: input?.sessionID },
        );
        return;
      }
      const state = workflowState?.get?.(input?.sessionID);
      const active = state?.approvalCurrent;
      const startupChain = state?.startupChainCurrent;
      if (startupChain && state?.pendingStartupQuestion == null) {
        const expected = buildStartupChainQuestionInstruction(startupChain);
        const questions = Array.isArray(toolArgs?.questions)
          ? toolArgs.questions
          : Array.isArray(toolArgs)
            ? toolArgs
            : null;
        const expectedHeaders = expected.questions.map((q) => q.header);
        const actualHeaders = Array.isArray(questions)
          ? questions.map((q) =>
              typeof q?.header === "string"
                ? q.header
                : typeof q?.title === "string"
                  ? q.title
                  : null,
            )
          : [];
        const lengthOk = Array.isArray(questions) && actualHeaders.length === expectedHeaders.length;
        const headersOk =
          lengthOk &&
          expectedHeaders.every((header, index) => actualHeaders[index] === header);
        if (!headersOk) {
          throw new Error(
            `Git workflow guard: a startup approval chain is pending and the question tool must be called with this exact list of questions (same length, same order, same headers): ${JSON.stringify(expected.questions.map((q) => ({ header: q.header, options: q.options })))}. The plugin matches answers positionally, so question ids are optional, but the headers and option order MUST be byte-for-byte identical.`,
          );
        }
      }
      // Only enforce while an approval is actually pending. If the model is
      // asking a normal clarification question with no active gate, pass
      // through.
      if (active && state?.pendingApprovalQuestion == null) {
        let expected = null;
        try {
          expected = buildQuestionInstruction({
            commandName: active.workflow || active.command || null,
            actionType: active.actionType,
            proposal: active.proposal ?? null,
          });
        } catch {
          // best-effort: if the builder throws we don't block — the throw
          // shouldn't happen for canonical actionTypes but we never want this
          // guard to crash the workflow.
          expected = null;
        }
        if (expected && typeof expected.header === "string" && expected.header.length > 0) {
          const actualHeader = readQuestionToolHeader(toolArgs);
          if (actualHeader !== expected.header) {
            // Diagnostic dump: when actualHeader is null we don't know which
            // key the model is using -- log the args shape AND the input
            // shape (keys only at top level, plus nested keys for likely
            // containers) so we can extend readQuestionToolHeader if a new
            // shape is in use. opencode appears to nest the actual tool
            // arguments somewhere other than `input.args`; this dump exposes
            // the wrapping object.
            const dumpKeys = (obj) =>
              obj && typeof obj === "object" && !Array.isArray(obj) ? Object.keys(obj) : null;
            const inputShape = {
              inputKeys: dumpKeys(input),
              outputKeys: dumpKeys(output),
              toolArgsKeys: dumpKeys(toolArgs),
              toolArgsType: typeof toolArgs,
            };
            pluginContext?.debug?.log?.(
              "tool-execute-before",
              "question header mismatch — throwing to force model retry",
              {
                sessionID: input?.sessionID,
                actionType: active.actionType,
                expectedHeader: expected.header,
                actualHeader: actualHeader ?? null,
                inputShape,
                toolArgsRaw: JSON.stringify(toolArgs ?? null).slice(0, 500),
              },
            );
            throw new Error(buildQuestionHeaderMismatchMessage({ expected, actual: actualHeader }));
          }
        }
      }
    }

    advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");

  };
}
