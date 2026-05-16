import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";

// Inline pathspec is forwarded as `git add -A -- <f1> <f2> ...`. On Windows
// CreateProcess caps the combined commandline at ~32K characters. For a
// brownfield baseline-commit (`git init` on top of an existing tree with
// hundreds of files), the inline form blows past that ceiling. Above this
// file count we switch to git's `--pathspec-from-file=<path> --pathspec-file-nul`
// mode, which reads NUL-separated paths from a temp file with no argv limit.
const PATHSPEC_INLINE_LIMIT = 80;

const DEFAULT_READINESS_TIMEOUT_MS = 1500;
const DEFAULT_STATUS_TIMEOUT_MS = 5000;
const DEFAULT_BRANCH_LIST_TIMEOUT_MS = 3000;
const DEFAULT_BRANCH_ACTION_TIMEOUT_MS = 5000;
const DEFAULT_INIT_TIMEOUT_MS = 5000;
const DEFAULT_COMMIT_TIMEOUT_MS = 15000;
const DEFAULT_PUSH_TIMEOUT_MS = 20000;

const ALLOWED_COMMANDS = new Map([
  ["rev-parse-inside-work-tree", ["rev-parse", "--is-inside-work-tree"]],
  ["rev-parse-head", ["rev-parse", "HEAD"]],
  ["symbolic-ref-short-head", ["symbolic-ref", "--short", "HEAD"]],
  ["remote-verbose", ["remote", "-v"]],
  ["status-porcelain", ["status", "--short", "--untracked-files=all"]],
  ["branch-list", ["branch", "--format=%(refname:short)"]],
]);

function resolveAllowedArgs(command) {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`Unsupported git readiness command: ${String(command)}`);
  }

  return [...ALLOWED_COMMANDS.get(command)];
}

function resolveReadOnlyTimeout(command, timeoutMs) {
  if (typeof timeoutMs === "number") {
    return timeoutMs;
  }

  if (command === "status-porcelain") {
    return DEFAULT_STATUS_TIMEOUT_MS;
  }
  if (command === "branch-list") {
    return DEFAULT_BRANCH_LIST_TIMEOUT_MS;
  }
  return DEFAULT_READINESS_TIMEOUT_MS;
}

function resolveActionTimeout(action, timeoutMs) {
  if (typeof timeoutMs === "number") {
    return timeoutMs;
  }

  switch (action?.kind) {
    case "commit":
      return DEFAULT_COMMIT_TIMEOUT_MS;
    case "push":
      return DEFAULT_PUSH_TIMEOUT_MS;
    case "branch":
      return DEFAULT_BRANCH_ACTION_TIMEOUT_MS;
    case "init":
      return DEFAULT_INIT_TIMEOUT_MS;
    default:
      return DEFAULT_BRANCH_ACTION_TIMEOUT_MS;
  }
}

function buildGitEnv() {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "DevAI AIDD",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "devai-aidd@example.invalid",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "DevAI AIDD",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "devai-aidd@example.invalid",
  };

  // simple-git blocks inherited editor variables unless allowUnsafeEditor is
  // enabled. The plugin never launches interactive editors, so strip them
  // from subprocess env to keep read-only and mutating git flows non-interactive.
  delete env.EDITOR;
  delete env.VISUAL;
  delete env.GIT_EDITOR;

  return env;
}

function createGitClient(directory, timeoutMs) {
  return simpleGit({
    baseDir: directory,
    trimmed: false,
    timeout: { block: timeoutMs },
  }).env(buildGitEnv());
}

function truncateDiagnostic(value, maxLength = 4000) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function pickErrorText(error) {
  if (typeof error?.stderr === "string" && error.stderr.length > 0) {
    return error.stderr;
  }
  if (typeof error?.stdErr === "string" && error.stdErr.length > 0) {
    return error.stdErr;
  }
  if (Buffer.isBuffer(error?.stdErr) && error.stdErr.length > 0) {
    return error.stdErr.toString("utf8");
  }
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return "";
}

function pickOutputText(error) {
  if (typeof error?.stdout === "string") {
    return error.stdout;
  }
  if (typeof error?.stdOut === "string") {
    return error.stdOut;
  }
  if (Buffer.isBuffer(error?.stdOut)) {
    return error.stdOut.toString("utf8");
  }
  return "";
}

function normalizeGitError(error, { args = [], directory, timeoutMs } = {}) {
  const normalized = error instanceof Error ? error : new Error(String(error ?? "Git command failed."));

  if (!Array.isArray(normalized.spawnargs)) {
    if (Array.isArray(normalized.task?.commands)) {
      normalized.spawnargs = [...normalized.task.commands];
    } else if (Array.isArray(args) && args.length > 0) {
      normalized.spawnargs = [...args];
    }
  }
  if (typeof normalized.path !== "string") {
    normalized.path = "git";
  }
  if (typeof normalized.syscall !== "string") {
    normalized.syscall = "spawn git";
  }
  if (typeof normalized.stdout !== "string") {
    normalized.stdout = pickOutputText(normalized);
  }
  if (typeof normalized.stderr !== "string" || normalized.stderr.length === 0) {
    normalized.stderr = pickErrorText(normalized);
  }
  if (
    (normalized.code === "timeout" || normalized.plugin === "timeout") &&
    typeof normalized.message === "string" &&
    /timeout/i.test(normalized.message)
  ) {
    normalized.code = "ETIMEDOUT";
    normalized.signal = normalized.signal || "SIGTERM";
    normalized.killed = true;
    normalized.message = `spawn git ETIMEDOUT (${timeoutMs}ms block timeout reached)`;
  }
  if (
    typeof normalized.message === "string" &&
    /Cannot use simple-git on a directory that does not exist/i.test(normalized.message)
  ) {
    normalized.code = normalized.code || "ENOTDIR";
  }
  if (
    typeof normalized.status !== "number" &&
    typeof normalized.exitCode === "number" &&
    normalized.exitCode >= 0
  ) {
    normalized.status = normalized.exitCode;
  }
  if (
    typeof normalized.cwd !== "string" &&
    typeof directory === "string" &&
    directory.length > 0
  ) {
    normalized.cwd = directory;
  }

  return normalized;
}

export function buildGitFailureDiagnostics(
  error,
  { directory, args, timeoutMs, command = null, operation = null, startedAt = null, trace = null } = {},
) {
  const normalized = normalizeGitError(error, { args, directory, timeoutMs });
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
    pid: typeof normalized?.pid === "number" ? normalized.pid : null,
    errorName: normalized?.name || null,
    errorCode: normalized?.code || null,
    errorErrno: normalized?.errno ?? null,
    errorStatus: typeof normalized?.status === "number" ? normalized.status : null,
    errorSignal: normalized?.signal || null,
    errorSyscall: normalized?.syscall || null,
    errorPath: normalized?.path || null,
    errorSpawnargs: Array.isArray(normalized?.spawnargs) ? [...normalized.spawnargs] : null,
    errorMessage: normalized?.message ? truncateDiagnostic(normalized.message) : null,
    stdout: normalized?.stdout ? truncateDiagnostic(normalized.stdout) : null,
    stderr: normalized?.stderr ? truncateDiagnostic(normalized.stderr) : null,
    pathEnv: process.env.PATH || null,
    trace: trace && typeof trace === "object" ? { ...trace } : null,
  };
}

function logGitFailure(debug, message, error, context) {
  debug?.log?.("git-subprocess", message, buildGitFailureDiagnostics(error, context));
}

async function runRawGitCommand(directory, args, timeoutMs, debugContext = null) {
  const startedAt = process.hrtime.bigint();
  try {
    return await createGitClient(directory, timeoutMs).raw(args);
  } catch (error) {
    const normalized = normalizeGitError(error, { args, directory, timeoutMs });
    logGitFailure(debugContext?.debug, debugContext?.message || "git async command failed", normalized, {
      directory,
      args,
      timeoutMs,
      command: debugContext?.command || null,
      operation: debugContext?.operation || null,
      startedAt,
      trace: debugContext?.trace || null,
    });
    throw normalized;
  }
}

export async function runGitCommand({
  directory,
  command,
  timeoutMs = undefined,
  debug = null,
  trace = null,
} = {}) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("A valid directory is required for git readiness commands.");
  }

  const args = resolveAllowedArgs(command);
  const resolvedTimeoutMs = resolveReadOnlyTimeout(command, timeoutMs);
  return runRawGitCommand(directory, args, resolvedTimeoutMs, {
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
 *     pre-staged files cannot be swept into the commit.
 *   - File mode (`options.pathspecFromFile = "<absolute path>"`): the same
 *     scoping guarantee, but path list arrives via `--pathspec-from-file=<path>
 *     --pathspec-file-nul` to bypass the Windows ~32K argv limit when the
 *     proposal contains hundreds of files.
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

async function resolveHeadBranch(directory, timeoutMs, debug, trace) {
  try {
    return (
      await runRawGitCommand(
        directory,
        ["symbolic-ref", "--short", "HEAD"],
        timeoutMs,
        {
          debug,
          operation: "runGitAction",
          command: "branch:resolve-head",
          message: "git action failed",
          trace,
        },
      )
    ).trim() || null;
  } catch {
    return null;
  }
}

export async function runGitAction({
  directory,
  action,
  timeoutMs = undefined,
  debug = null,
  trace = null,
} = {}) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("A valid directory is required for git action commands.");
  }
  if (!action || typeof action !== "object") {
    throw new Error("A valid git action is required.");
  }

  const resolvedTimeoutMs = resolveActionTimeout(action, timeoutMs);
  const git = createGitClient(directory, resolvedTimeoutMs);

  if (action.kind === "commit") {
    const fileCount = Array.isArray(action.files) ? action.files.length : 0;
    const useFileMode = action.allowEmpty !== true && fileCount > PATHSPEC_INLINE_LIMIT;
    let pathspecDir = null;
    let pathspecFile = null;
    if (useFileMode) {
      pathspecDir = mkdtempSync(join(tmpdir(), "devai-aidd-pathspec-"));
      pathspecFile = join(pathspecDir, "files.lst");
      writeFileSync(pathspecFile, action.files.join("\0"), "utf8");
    }
    try {
      const { addArgs, commitArgs } = buildCommitArgs(
        action,
        useFileMode ? { pathspecFromFile: pathspecFile } : {},
      );
      if (Array.isArray(addArgs) && addArgs.length > 0) {
        await runRawGitCommand(directory, addArgs, resolvedTimeoutMs, {
          debug,
          operation: "runGitAction",
          command: "commit:add",
          message: "git action failed",
          trace,
        });
      }
      const stdout = await runRawGitCommand(directory, commitArgs, resolvedTimeoutMs, {
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
    try {
      await git.push(action.remoteName || "origin", args[2]);
      return { stdout: "", observedState: null };
    } catch (error) {
      const normalized = normalizeGitError(error, {
        args,
        directory,
        timeoutMs: resolvedTimeoutMs,
      });
      logGitFailure(debug, "git action failed", normalized, {
        directory,
        args,
        timeoutMs: resolvedTimeoutMs,
        command: "push",
        operation: "runGitAction",
        trace,
      });
      throw normalized;
    }
  }

  if (action.kind === "init") {
    const args = ["init"];
    try {
      await git.init();
      return { stdout: "", observedState: null };
    } catch (error) {
      const normalized = normalizeGitError(error, {
        args,
        directory,
        timeoutMs: resolvedTimeoutMs,
      });
      logGitFailure(debug, "git action failed", normalized, {
        directory,
        args,
        timeoutMs: resolvedTimeoutMs,
        command: "init",
        operation: "runGitAction",
        trace,
      });
      throw normalized;
    }
  }

  if (action.kind === "branch") {
    const args = buildBranchArgs(action);
    try {
      if (action.operation === "create") {
        if (!action.branchName) {
          throw new Error("Branch create actions require a branch name.");
        }
        await git.checkoutLocalBranch(action.branchName);
      } else if (action.operation === "switch") {
        const targetBranch =
          typeof action.targetBranch === "string" && action.targetBranch.length > 0
            ? action.targetBranch
            : action.branchName;
        if (!targetBranch) {
          throw new Error("Branch switch actions require a target branch.");
        }
        await git.checkout(targetBranch);
      } else {
        throw new Error(`Unsupported branch operation: ${String(action.operation)}`);
      }
    } catch (error) {
      const normalized = normalizeGitError(error, {
        args,
        directory,
        timeoutMs: resolvedTimeoutMs,
      });
      logGitFailure(debug, "git action failed", normalized, {
        directory,
        args,
        timeoutMs: resolvedTimeoutMs,
        command: `branch:${action.operation || "unknown"}`,
        operation: "runGitAction",
        trace,
      });
      throw normalized;
    }

    const headBranch = await resolveHeadBranch(directory, resolvedTimeoutMs, debug, trace);
    return { stdout: "", observedState: { headBranch } };
  }

  throw new Error(`Unsupported git action command: ${String(action.kind)}`);
}
