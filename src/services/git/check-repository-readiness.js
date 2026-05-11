import { buildInitProposal } from "./build-init-proposal.js";
import { runGitCommand } from "./run-git-command.js";

function createBaseDetails(directory, checkedAt) {
  return {
    isGitRepository: false,
    branch: null,
    hasCommit: false,
    hasRemote: false,
    remoteNames: [],
    directory,
    checkedAt,
  };
}

function normalizeRemoteNames(remoteOutput) {
  const names = new Set();

  for (const line of String(remoteOutput || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [name] = trimmed.split(/\s+/, 1);
    if (name) {
      names.add(name);
    }
  }

  return [...names];
}

function buildUnavailableResult(directory, checkedAt, error) {
  return {
    outcome: "skip",
    reason: "readiness-check-unavailable",
    message: "Repository readiness checks are unavailable; continuing without blocking the workflow.",
    details: {
      ...createBaseDetails(directory, checkedAt),
      errorCode: error?.code || null,
      errorName: error?.name || null,
    },
  };
}

function isNotRepositoryError(error) {
  const stderr = error?.stderr ? String(error.stderr) : "";
  return error?.status === 128 && /not a git repository/i.test(stderr);
}

function isDetachedHeadError(error) {
  const stderr = error?.stderr ? String(error.stderr) : "";
  return error?.status === 128 && /ref HEAD is not a symbolic ref/i.test(stderr);
}

export function checkRepositoryReadiness({
  directory,
  gitRunner = runGitCommand,
  policy,
} = {}) {
  const checkedAt = new Date().toISOString();
  const baseDetails = createBaseDetails(directory, checkedAt);

  try {
    let repositoryResult = "";

    try {
      repositoryResult = String(
        gitRunner({
          directory,
          command: "rev-parse-inside-work-tree",
        }) || "",
      ).trim();
    } catch (error) {
      if (!isNotRepositoryError(error)) {
        throw error;
      }
    }

    if (repositoryResult !== "true") {
      const proposal = buildInitProposal({
        directory,
        reason: "git-not-initialized",
      });

      return {
        outcome: "ask",
        reason: "git-not-initialized",
        message: "This working directory is not an initialized Git repository.",
        details: {
          ...baseDetails,
          proposal,
        },
      };
    }

    let branch = null;

    try {
      branch = String(
        gitRunner({
          directory,
          command: "symbolic-ref-short-head",
        }) || "",
      ).trim() || null;
    } catch (error) {
      if (!isDetachedHeadError(error)) {
        throw error;
      }
    }

    const shouldCheckRemotes = policy?.requiresRemote !== false;
    const remoteNames = shouldCheckRemotes
      ? normalizeRemoteNames(
          gitRunner({
            directory,
            command: "remote-verbose",
          }),
        )
      : [];

    // strengthen-approval-prompt-instructions follow-up: detect HEAD-absent
    // repos (git init done but no commits yet). Branch chains MUST NOT
    // proceed in this state -- a `git checkout -b feat/foo` against an
    // unborn HEAD creates a "virtual" branch invisible to `git branch`,
    // breaks PR/diff/push, and undermines the standard workflow assumption
    // that main carries a baseline commit. Downstream code (e.g.
    // shouldSkipBranchPlanning) reads `hasCommit` to suppress branch
    // planning AND to re-publish a baseline-commit prompt in fresh sessions
    // where the workflowState scope flag (baselineSkipped) is no longer
    // visible.
    let hasCommit = false;
    try {
      const headOutput = String(
        gitRunner({
          directory,
          command: "rev-parse-head",
        }) || "",
      ).trim();
      hasCommit = headOutput.length > 0;
    } catch {
      // `git rev-parse HEAD` fails with exit code 128 on a fresh repo with
      // no commits ("fatal: bad default revision 'HEAD'" /
      // "fatal: ambiguous argument 'HEAD'"). Treat that as the load-bearing
      // signal -- there is no commit yet.
      hasCommit = false;
    }

    return {
      outcome: "allow",
      reason: "repository-ready",
      message: "Repository readiness checks completed successfully.",
      details: {
        ...baseDetails,
        isGitRepository: true,
        branch,
        hasCommit,
        hasRemote: remoteNames.length > 0,
        remoteNames,
      },
    };
  } catch (error) {
    return buildUnavailableResult(directory, checkedAt, error);
  }
}
