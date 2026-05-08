import { buildInitProposal } from "./build-init-proposal.js";
import { runGitCommand } from "./run-git-command.js";

function createBaseDetails(directory, checkedAt) {
  return {
    isGitRepository: false,
    branch: null,
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

    return {
      outcome: "allow",
      reason: "repository-ready",
      message: "Repository readiness checks completed successfully.",
      details: {
        ...baseDetails,
        isGitRepository: true,
        branch,
        hasRemote: remoteNames.length > 0,
        remoteNames,
      },
    };
  } catch (error) {
    return buildUnavailableResult(directory, checkedAt, error);
  }
}
