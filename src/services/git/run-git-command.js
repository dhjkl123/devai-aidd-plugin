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

function buildGitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "DevAI AIDD",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "devai-aidd@example.invalid",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "DevAI AIDD",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "devai-aidd@example.invalid",
  };
}

function truncateDiagnostic(value, maxLength = 4000) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

export function buildGitFailureDiagnostics(
  error,
  { directory, args, timeoutMs, command = null, operation = null, startedAt = null, trace = null } = {},
) {
  const durationMs =
    typeof startedAt === "bigint" ? Number(process.hrtime.bigint() - startedAt) / 1e6 : null;
  return {
    operation,
    command,
    gitExecutable: "git",
    cwd: typeof directory === "string" && directory.length > 0 ? directory : null,
    args: Array.isArray(args) ? [...args] : [],
    timeoutMs: typeof timeoutMs === "number" ? timeoutMs : null,
    durationMs,
    pid: typeof error?.pid === "number" ? error.pid : null,
    errorName: error?.name || null,
    errorCode: error?.code || null,
    errorErrno: error?.errno ?? null,
    errorStatus: typeof error?.status === "number" ? error.status : null,
    errorSignal: error?.signal || null,
    errorSyscall: error?.syscall || null,
    errorPath: error?.path || null,
    errorSpawnargs: Array.isArray(error?.spawnargs) ? [...error.spawnargs] : null,
    errorMessage: error?.message ? truncateDiagnostic(error.message) : null,
    stdout: error?.stdout ? truncateDiagnostic(error.stdout) : null,
    stderr: error?.stderr ? truncateDiagnostic(error.stderr) : null,
    pathEnv: process.env.PATH || null,
    trace: trace && typeof trace === "object" ? { ...trace } : null,
  };
}

function logGitFailure(debug, message, error, context) {
  debug?.log?.("git-subprocess", message, buildGitFailureDiagnostics(error, context));
}

function execGitSync(directory, args, timeoutMs, debugContext = null) {
  const startedAt = process.hrtime.bigint();
  try {
    return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    env: buildGitEnv(),
    });
  } catch (error) {
    logGitFailure(debugContext?.debug, debugContext?.message || "git sync command failed", error, {
      directory,
      args,
      timeoutMs,
      command: debugContext?.command || null,
      operation: debugContext?.operation || null,
      startedAt,
      trace: debugContext?.trace || null,
    });
    throw error;
  }
}

async function execGit(directory, args, timeoutMs, debugContext = null) {
  const startedAt = process.hrtime.bigint();
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: directory,
      encoding: "utf8",
      timeout: timeoutMs,
      env: buildGitEnv(),
    });
    return stdout;
  } catch (error) {
    logGitFailure(debugContext?.debug, debugContext?.message || "git async command failed", error, {
      directory,
      args,
      timeoutMs,
      command: debugContext?.command || null,
      operation: debugContext?.operation || null,
      startedAt,
      trace: debugContext?.trace || null,
    });
    throw error;
  }
}

export function runGitCommand({ directory, command, timeoutMs = 1500, debug = null, trace = null } = {}) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("A valid directory is required for git readiness commands.");
  }

  const args = resolveAllowedArgs(command);
  return execGitSync(directory, args, timeoutMs, {
    debug,
    command,
    operation: "runGitCommand",
    message: "git readiness command failed",
    trace,
  });
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
 * @param {{ message?: string|null, files?: string[]|null, allowEmpty?: boolean, allFiles?: boolean }} action
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

  if (action.allFiles === true) {
    return {
      addArgs: ["add", "-A"],
      commitArgs: ["commit", "-m", message],
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

export function buildBranchArgs(action) {
  if (!action || typeof action !== "object") {
    throw new Error("A valid branch action is required.");
  }
  const operation = typeof action.operation === "string" ? action.operation : null;
  const branchName =
    typeof action.branchName === "string" && action.branchName.length > 0
      ? action.branchName
      : null;
  const targetBranch =
    typeof action.targetBranch === "string" && action.targetBranch.length > 0
      ? action.targetBranch
      : branchName;

  if (operation === "create") {
    if (!branchName) throw new Error("Branch create actions require a branch name.");
    return ["switch", "-c", branchName];
  }
  if (operation === "switch") {
    if (!targetBranch) throw new Error("Branch switch actions require a target branch.");
    return ["switch", targetBranch];
  }
  throw new Error(`Unsupported branch operation: ${String(operation)}`);
}

export async function runGitAction({ directory, action, timeoutMs = 5000, debug = null, trace = null } = {}) {
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
        await execGit(directory, addArgs, timeoutMs, {
          debug,
          operation: "runGitAction",
          command: "commit:add",
          message: "git action failed",
          trace,
        });
      }
      const stdout = await execGit(directory, commitArgs, timeoutMs, {
        debug,
        operation: "runGitAction",
        command: "commit",
        message: "git action failed",
        trace,
      });
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
    const stdout = await execGit(directory, args, timeoutMs, {
      debug,
      operation: "runGitAction",
      command: "push",
      message: "git action failed",
      trace,
    });
    return { stdout, observedState: null };
  }

  if (action.kind === "init") {
    // ALLOWED_COMMANDS is intentionally untouched — that allowlist scopes the
    // read-only readiness probes invoked via `runGitCommand`. `runGitAction`
    // dispatches on `action.kind` and is the canonical write path; init joins
    // commit/push here without traversing the read-only allowlist.
    const stdout = await execGit(directory, ["init"], timeoutMs, {
      debug,
      operation: "runGitAction",
      command: "init",
      message: "git action failed",
      trace,
    });
    return { stdout, observedState: null };
  }

  if (action.kind === "branch") {
    const args = buildBranchArgs(action);
    const stdout = await execGit(directory, args, timeoutMs, {
      debug,
      operation: "runGitAction",
      command: `branch:${action.operation || "unknown"}`,
      message: "git action failed",
      trace,
    });
    let headBranch = null;
    try {
      headBranch = (
        await execGit(directory, ["symbolic-ref", "--short", "HEAD"], timeoutMs, {
          debug,
          operation: "runGitAction",
          command: "branch:resolve-head",
          message: "git action failed",
          trace,
        })
      ).trim();
    } catch {
      headBranch = null;
    }
    return { stdout, observedState: { headBranch } };
  }

  throw new Error(`Unsupported git action command: ${String(action.kind)}`);
}
