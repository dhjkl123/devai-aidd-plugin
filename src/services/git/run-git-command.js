import { execFileSync } from "node:child_process";

const ALLOWED_COMMANDS = new Map([
  ["rev-parse-inside-work-tree", ["rev-parse", "--is-inside-work-tree"]],
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

function execGit(directory, args, timeoutMs) {
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

export function runGitCommand({ directory, command, timeoutMs = 1500 } = {}) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("A valid directory is required for git readiness commands.");
  }

  const args = resolveAllowedArgs(command);
  return execGit(directory, args, timeoutMs);
}

export async function runGitAction({ directory, action, timeoutMs = 5000 } = {}) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("A valid directory is required for git action commands.");
  }
  if (!action || typeof action !== "object") {
    throw new Error("A valid git action is required.");
  }

  if (action.kind === "commit") {
    if (!Array.isArray(action.files) || action.files.length === 0) {
      throw new Error("Commit actions require at least one file.");
    }

    execGit(directory, ["add", "--", ...action.files], timeoutMs);
    const stdout = execGit(
      directory,
      ["commit", "-m", action.message || "Finish workflow outputs"],
      timeoutMs,
    );
    return { stdout, observedState: null };
  }

  throw new Error(`Unsupported git action command: ${String(action.kind)}`);
}
