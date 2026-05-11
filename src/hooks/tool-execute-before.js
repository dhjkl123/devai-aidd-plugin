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

// TD #3 canonical block message — exported so regression tests can import the
// single source of truth instead of duplicating the literal in multiple files.
export const BASH_GIT_BLOCK_MESSAGE =
  "Git workflow guard: a git repository must be initialized before running git commands. Approve the pending \"Initialize Git\" prompt instead of running git directly.";

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
  return async (input) => {
    // Layer 1: bash + git block (runs first, independent of state.commandName).
    if (input?.tool === "bash" && looksLikeGitCommand(input?.args?.command)) {
      const state = workflowState?.get?.(input?.sessionID);
      const initPending = state?.initProposal != null;
      const initActive = state?.approvalCurrent?.actionType === "init";
      const dirIsGit = directoryIsGitRepo(pluginContext?.directory);
      if (initPending || initActive || !dirIsGit) {
        throw new Error(BASH_GIT_BLOCK_MESSAGE);
      }
    }

    advancePhaseIfWorkflowSession(workflowState, input?.sessionID, "in-progress");

    // Layer 2: mutating-tool guard (existing).
    const state = workflowState?.get?.(input?.sessionID);
    if (state && state.commandName && input?.tool) {
      if (input.tool === "question" || SAFE_READ_TOOLS.has(input.tool)) {
        // safe — no guard
      } else if (MUTATING_TOOLS.has(input.tool)) {
        throw new Error(
          `Git workflow guard: create or switch to branch \`workflow\` before editing files for /${state.commandName}.`,
        );
      }
    }
  };
}
