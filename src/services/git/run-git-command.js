import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ALLOWED_COMMANDS = new Map([
  ["rev-parse-inside-work-tree", ["rev-parse", "--is-inside-work-tree"]],
  ["rev-parse-head", ["rev-parse", "HEAD"]],
  ["symbolic-ref-short-head", ["symbolic-ref", "--short", "HEAD"]],
  ["remote-verbose", ["remote", "-v"]],
  ["status-porcelain", ["status", "--short", "--untracked-files=all"]],
]);

function resolveAllowedArgs(command) {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`Unsupported git readiness command: ${String(command)}`);
  }

  return [...ALLOWED_COMMANDS.get(command)];
}

function execGitSync(directory, args, timeoutMs) {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });
}

async function execGit(directory, args, timeoutMs) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: directory,
    encoding: "utf8",
    timeout: timeoutMs,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  return stdout;
}

export function runGitCommand({ directory, command, timeoutMs = 1500 } = {}) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("A valid directory is required for git readiness commands.");
  }

  const args = resolveAllowedArgs(command);
  return execGitSync(directory, args, timeoutMs);
}

/**
 * Build the argv arrays runGitAction would use for a commit action so callers
 * (and tests) can assert the exact pathspec that reaches `git`.
 *
 * Returns `{ addArgs, commitArgs }`:
 *   - `addArgs` uses `git add -A -- <files>` so deleted files in the proposal
 *     scope are staged for removal alongside additions/modifications. The
 *     `-A` flag is restricted to the proposal pathspec — files outside the
 *     scope are never affected.
 *   - `commitArgs` repeats the pathspec on the `git commit` line so that
 *     unrelated, previously-staged files are NOT swept into the commit. This
 *     fix addresses the Story 3.2 review HIGH item: the prior implementation
 *     omitted the pathspec on commit and could include files staged outside
 *     the approved proposal.
 *
 * @param {{ message?: string|null, files?: string[]|null }} action
 * @returns {{ addArgs: string[], commitArgs: string[] }}
 */
export function buildCommitArgs(action) {
  if (!action || typeof action !== "object") {
    throw new Error("A valid commit action is required.");
  }

  const message =
    typeof action.message === "string" && action.message.length > 0
      ? action.message
      : "Finish workflow outputs";

  // Baseline commit case (post-`git init` with no working tree changes).
  // `allowEmpty: true` swaps the standard `add + commit -- <pathspec>` for a
  // single `commit --allow-empty -m <message>` so a fresh repository can land
  // its first commit and grow a HEAD ref. The pathspec is omitted because
  // there are no files to scope to.
  if (action.allowEmpty === true) {
    return {
      addArgs: null,
      commitArgs: ["commit", "--allow-empty", "-m", message],
    };
  }

  if (!Array.isArray(action.files) || action.files.length === 0) {
    throw new Error("Commit actions require at least one file.");
  }

  return {
    addArgs: ["add", "-A", "--", ...action.files],
    commitArgs: ["commit", "-m", message, "--", ...action.files],
  };
}

/**
 * Build the argv array runGitAction would use for a push action.
 *
 * @param {{ remoteName?: string|null, branchName?: string|null, targetBranch?: string|null }} action
 * @returns {string[]}
 */
export function buildPushArgs(action) {
  if (!action || typeof action !== "object") {
    throw new Error("A valid push action is required.");
  }
  const remoteName =
    typeof action.remoteName === "string" && action.remoteName.length > 0
      ? action.remoteName
      : "origin";
  const branchName =
    typeof action.branchName === "string" && action.branchName.length > 0
      ? action.branchName
      : null;
  const targetBranch =
    typeof action.targetBranch === "string" && action.targetBranch.length > 0
      ? action.targetBranch
      : branchName;

  if (!branchName) {
    throw new Error("Push actions require a branch name.");
  }

  const refspec = targetBranch && targetBranch !== branchName ? `${branchName}:${targetBranch}` : branchName;
  return ["push", remoteName, refspec];
}

export async function runGitAction({ directory, action, timeoutMs = 5000 } = {}) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("A valid directory is required for git action commands.");
  }
  if (!action || typeof action !== "object") {
    throw new Error("A valid git action is required.");
  }

  if (action.kind === "commit") {
    const { addArgs, commitArgs } = buildCommitArgs(action);
    if (Array.isArray(addArgs) && addArgs.length > 0) {
      await execGit(directory, addArgs, timeoutMs);
    }
    const stdout = await execGit(directory, commitArgs, timeoutMs);
    return { stdout, observedState: null };
  }

  if (action.kind === "push") {
    const args = buildPushArgs(action);
    const stdout = await execGit(directory, args, timeoutMs);
    return { stdout, observedState: null };
  }

  if (action.kind === "init") {
    // ALLOWED_COMMANDS is intentionally untouched — that allowlist scopes the
    // read-only readiness probes invoked via `runGitCommand`. `runGitAction`
    // dispatches on `action.kind` and is the canonical write path; init joins
    // commit/push here without traversing the read-only allowlist.
    const stdout = await execGit(directory, ["init"], timeoutMs);
    return { stdout, observedState: null };
  }

  throw new Error(`Unsupported git action command: ${String(action.kind)}`);
}
