/**
 * tool-execute-before.js
 *
 * Wrapper hook for `tool.execute.before`. Two guard layers:
 *
 *   1. block-until-init (strengthen-git-init-proposal):
 *      When the working directory is not a git repository, or an init proposal
 *      is pending/active, refuse any `bash` tool call whose command looks
 *      like a `git` invocation. The guard runs **before** the workflow-session
 *      gate so the model's pre-workflow `git rev-parse` race no longer leaks
 *      a `fatal: not a git repository` stderr through to the user.
 *
 *   2. mutating-tool guard (existing):
 *      For tracked workflow sessions, throws the contract message when a
 *      mutating tool is requested while the workflow guard is active.
 *
 * Both guard messages are frozen contract strings (regression suite compares
 * byte-for-byte). Renaming or rewording is a contract break.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { advancePhaseIfWorkflowSession } from "../services/workflow/detect-workflow-context.js";
import { MUTATING_TOOLS, SAFE_READ_TOOLS } from "../services/workflow/mutating-tools.js";
import { looksLikeGitCommand } from "../services/workflow/looks-like-git-command.js";
import { buildQuestionInstruction } from "../services/approval/build-question-instruction.js";
import {
  buildStartupChainQuestionInstruction,
} from "../services/approval/build-startup-chain-question-instruction.js";

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

export function createToolExecuteBeforeHook({ workflowState, pluginContext } = {}) {
  // opencode SDK 1.14 — tool.execute.before signature is
  //   (input: { tool, sessionID, callID }, output: { args: any })
  // The actual tool arguments live on `output.args`, NOT on `input.args`.
  // Prior strengthen-git-init-proposal code read `input.args?.command` and
  // silently never matched in production; the new question-header guard
  // hit the same bug. Always read args from `output.args`, with a defensive
  // fallback to `input.args` so the regression test mocks (which still put
  // args on the input) keep passing.
  return async (input, output) => {
    const toolArgs =
      output && typeof output === "object" && output.args != null
        ? output.args
        : input?.args ?? null;

    // Layer 1: bash + git block (most specific — gives the model the exact
    // "approve the pending Initialize Git prompt instead of running git
    // directly" guidance). Runs first so its canonical contract message
    // wins over Layer 0's generic approval-pending block.
    if (input?.tool === "bash" && looksLikeGitCommand(toolArgs?.command)) {
      const state = workflowState?.get?.(input?.sessionID);
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
      if (!userOptedOut && (initPending || initActive || !dirIsGit)) {
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

    // Layer 3: mutating-tool guard (existing).
    const state = workflowState?.get?.(input?.sessionID);
    if (state && state.commandName && input?.tool) {
      if (
        input.tool === "question" ||
        SAFE_READ_TOOLS.has(input.tool)
      ) {
        // safe — no guard
      } else if (MUTATING_TOOLS.has(input.tool)) {
        throw new Error(
          `Git workflow guard: create or switch to branch \`workflow\` before editing files for /${state.commandName}.`,
        );
      }
    }
  };
}
