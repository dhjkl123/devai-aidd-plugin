import { existsSync } from "node:fs";
import { join } from "node:path";

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

function truncateDiagnostic(value, maxLength = 500) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function buildUnavailableResult(directory, checkedAt, error, probeTrace = []) {
  return {
    outcome: "skip",
    reason: "readiness-check-unavailable",
    message: "Repository readiness checks are unavailable; continuing without blocking the workflow.",
    details: {
      ...createBaseDetails(directory, checkedAt),
      errorCode: error?.code || null,
      errorName: error?.name || null,
      errorStatus: typeof error?.status === "number" ? error.status : null,
      errorSignal: error?.signal || null,
      errorMessage: error?.message ? truncateDiagnostic(error.message) : null,
      stderrSummary: error?.stderr ? truncateDiagnostic(error.stderr) : null,
      stdoutSummary: error?.stdout ? truncateDiagnostic(error.stdout) : null,
      failedProbe: error?.readinessProbe || null,
      failedProbeDurationMs:
        typeof error?.readinessProbeDurationMs === "number" ? error.readinessProbeDurationMs : null,
      probeTrace,
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
  readinessGate = null,
} = {}) {
  const checkedAt = new Date().toISOString();
  const baseDetails = createBaseDetails(directory, checkedAt);
  const gateEnabled = readinessGate?.enabled !== false;
  const probeTrace = [];

  function runProbe(command) {
    const startedAt = process.hrtime.bigint();
    try {
      const output = gitRunner({ directory, command });
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      probeTrace.push({ command, outcome: "ok", durationMs });
      return output;
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      probeTrace.push({ command, outcome: "error", durationMs });
      error.readinessProbe = command;
      error.readinessProbeDurationMs = durationMs;
      throw error;
    }
  }

  try {
    const hasDirectory = typeof directory === "string" && directory.length > 0;
    const hasGitMarker = hasDirectory ? existsSync(join(directory, ".git")) : null;
    if (hasGitMarker === false) {
      if (!gateEnabled) {
        return {
          outcome: "allow",
          reason: "readiness-gate-skipped",
          message: "Repository readiness gating is disabled for this workflow.",
          details: baseDetails,
        };
      }

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

    let repositoryResult = "";

    try {
      repositoryResult = String(
        runProbe("rev-parse-inside-work-tree") || "",
      ).trim();
    } catch (error) {
      if (!isNotRepositoryError(error)) {
        throw error;
      }
    }

    if (repositoryResult !== "true") {
      if (!gateEnabled) {
        return {
          outcome: "allow",
          reason: "readiness-gate-skipped",
          message: "Repository readiness gating is disabled for this workflow.",
          details: baseDetails,
        };
      }

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
        runProbe("symbolic-ref-short-head") || "",
      ).trim() || null;
    } catch (error) {
      if (!isDetachedHeadError(error)) {
        throw error;
      }
    }

    const shouldCheckRemotes = policy?.requiresRemote !== false;
    const remoteNames = shouldCheckRemotes
      ? normalizeRemoteNames(
          runProbe("remote-verbose"),
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
        runProbe("rev-parse-head") || "",
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
      reason: gateEnabled ? "repository-ready" : "readiness-gate-skipped",
      message: gateEnabled
        ? "Repository readiness checks completed successfully."
        : "Repository readiness gating is disabled for this workflow.",
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
    return buildUnavailableResult(directory, checkedAt, error, probeTrace);
  }
}
