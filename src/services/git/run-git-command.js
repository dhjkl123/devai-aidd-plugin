import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

// Inline pathspec is forwarded as `git add -A -- <f1> <f2> ...`. On Windows
// CreateProcess caps the combined commandline at ~32K characters. For a
// brownfield baseline-commit (`git init` on top of an existing tree with
// hundreds of files), the inline form blows past that ceiling and the
// child_process spawn fails before git ever sees the request. Above this
// file count we switch to git's `--pathspec-from-file=<path> --pathspec-file-nul`
// mode, which reads NUL-separated paths from a temp file with no argv limit.
const PATHSPEC_INLINE_LIMIT = 80;

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
 *   - Inline mode (default): `git add -A -- <files>` / `git commit -m <msg> -- <files>`.
 *     The pathspec is restricted to the approved proposal so unrelated
 *     pre-staged files cannot be swept into the commit (Story 3.2 review HIGH).
 *   - File mode (`options.pathspecFromFile = "<absolute path>"`): the same
 *     scoping guarantee, but path list arrives via `--pathspec-from-file=<path>
 *     --pathspec-file-nul` to bypass the Windows ~32K argv limit when the
 *     proposal contains hundreds of files (typical brownfield baseline).
 *
 * @param {{ message?: string|null, files?: string[]|null, allowEmpty?: boolean }} action
 * @param {{ pathspecFromFile?: string|null }} [options]
 * @returns {{ addArgs: string[]|null, commitArgs: string[] }}
 */
export function buildCommitArgs(action, options = {}) {
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

  const pathspecFile =
    typeof options.pathspecFromFile === "string" && options.pathspecFromFile.length > 0
      ? options.pathspecFromFile
      : null;
  if (pathspecFile) {
    return {
      addArgs: ["add", "-A", `--pathspec-from-file=${pathspecFile}`, "--pathspec-file-nul"],
      commitArgs: [
        "commit",
        "-m",
        message,
        `--pathspec-from-file=${pathspecFile}`,
        "--pathspec-file-nul",
      ],
    };
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
    const fileCount = Array.isArray(action.files) ? action.files.length : 0;
    const useFileMode = action.allowEmpty !== true && fileCount > PATHSPEC_INLINE_LIMIT;
    let pathspecDir = null;
    let pathspecFile = null;
    if (useFileMode) {
      pathspecDir = mkdtempSync(join(tmpdir(), "devai-aidd-pathspec-"));
      pathspecFile = join(pathspecDir, "files.lst");
      // NUL-separated payload pairs with `--pathspec-file-nul` so paths with
      // whitespace, quotes, or backslashes survive untouched.
      writeFileSync(pathspecFile, action.files.join("\0"), "utf8");
    }
    try {
      const { addArgs, commitArgs } = buildCommitArgs(
        action,
        useFileMode ? { pathspecFromFile: pathspecFile } : {},
      );
      if (Array.isArray(addArgs) && addArgs.length > 0) {
        await execGit(directory, addArgs, timeoutMs);
      }
      const stdout = await execGit(directory, commitArgs, timeoutMs);
      return { stdout, observedState: null };
    } finally {
      if (pathspecDir) {
        try {
          rmSync(pathspecDir, { recursive: true, force: true });
        } catch {
          // best-effort
        }
      }
    }
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
