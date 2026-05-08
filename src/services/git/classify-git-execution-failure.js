/**
 * classify-git-execution-failure.js
 *
 * Story 2.4 — pure failure classification helper.
 *
 * Maps the (action, error, repositorySnapshot, expectedState, workflowContext)
 * tuple produced by `git-executor.js` onto a canonical, stable failure code
 * plus a human-readable explanation. The classifier never throws on an
 * expected git failure, never echoes raw stderr/stdout through the stack,
 * and never accesses subprocess state.
 *
 * Canonical codes (the ONLY allowed `code` values):
 *   - branch-conflict
 *   - branch-switch-mismatch
 *   - commit-failure
 *   - push-rejection
 *   - repository-state-mismatch
 *   - execution-unavailable
 *   - unknown-git-failure
 *
 * Recoverability is metadata; it is NOT part of the failure code itself.
 *
 * Detection-order rules (matters when classification is ambiguous):
 *   1. Pre-flight `repository-state-mismatch` wins before any mutating
 *      execution attempt — drift detected during preflight short-circuits the
 *      executor and must produce this code regardless of what error class the
 *      caller passes in. This step requires the caller to assert
 *      `preflightDrift: true`; mere disagreement between expectedState and
 *      observedState is NOT enough on its own, because action-kind-specific
 *      taxonomy (e.g. branch-switch-mismatch) must still be reachable for
 *      post-condition mismatches.
 *   2. `execution-unavailable` (git-not-found / spawn-failure / timeout / cwd
 *      unavailable) wins next, because it indicates the command never
 *      actually ran against a git repo and should never be conflated with a
 *      legitimate git-level rejection.
 *   3. Action-kind-driven taxonomy applies last, using a coarse stderr
 *      summary string (no raw passthrough). Branch post-condition mismatches
 *      route through this layer and produce `branch-switch-mismatch`.
 *
 * The classifier deliberately does NOT generate recovery choices — that is
 * Story 2.5's surface. It only emits `recoverable` and
 * `suggestedRecoveryKind` hints inside the returned details object.
 */

export const FAILURE_CODES = Object.freeze({
  BRANCH_CONFLICT: "branch-conflict",
  BRANCH_SWITCH_MISMATCH: "branch-switch-mismatch",
  COMMIT_FAILURE: "commit-failure",
  PUSH_REJECTION: "push-rejection",
  REPOSITORY_STATE_MISMATCH: "repository-state-mismatch",
  EXECUTION_UNAVAILABLE: "execution-unavailable",
  UNKNOWN_GIT_FAILURE: "unknown-git-failure",
});

const STDERR_SUMMARY_LIMIT = 240;

const EXEC_UNAVAILABLE_ERROR_CODES = new Set([
  "ENOENT",
  "ETIMEDOUT",
  "EACCES",
  "EPERM",
  "ENOTDIR",
  "EAGAIN",
  "EMFILE",
  "ENOMEM",
]);

const ACTION_KINDS = new Set(["branch", "commit", "push", "init", "finalize"]);

function summarizeStderr(stderr) {
  if (typeof stderr !== "string" || stderr.length === 0) {
    return null;
  }
  const collapsed = stderr.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) {
    return null;
  }
  return collapsed.length > STDERR_SUMMARY_LIMIT
    ? `${collapsed.slice(0, STDERR_SUMMARY_LIMIT)}…`
    : collapsed;
}

function pickStderr(error) {
  if (!error) return "";
  if (typeof error.stderr === "string") return error.stderr;
  if (error.stderr && typeof error.stderr.toString === "function") {
    try {
      return String(error.stderr);
    } catch {
      return "";
    }
  }
  return "";
}

function pickStdout(error) {
  if (!error) return "";
  if (typeof error.stdout === "string") return error.stdout;
  if (error.stdout && typeof error.stdout.toString === "function") {
    try {
      return String(error.stdout);
    } catch {
      return "";
    }
  }
  return "";
}

function detectExecutionUnavailable(error) {
  if (!error) return false;
  if (error.executionUnavailable === true) return true;
  if (typeof error.code === "string" && EXEC_UNAVAILABLE_ERROR_CODES.has(error.code)) {
    return true;
  }
  if (error.killed === true && error.signal === "SIGTERM") {
    // Subprocess timeout (Node child_process behavior).
    return true;
  }
  if (typeof error.message === "string") {
    if (/spawn .* ENOENT/i.test(error.message)) return true;
    if (/git: command not found/i.test(error.message)) return true;
  }
  return false;
}

function classifyBranchFailure({ action, error, expectedState, observedState }) {
  // Post-condition mismatch wins over raw exit code: an apparent success
  // can still leave us on the wrong branch (or detached HEAD).
  if (
    typeof expectedState?.headBranch === "string" &&
    typeof observedState?.headBranch === "string" &&
    expectedState.headBranch !== observedState.headBranch
  ) {
    const detached = observedState?.headDetached === true;
    return {
      code: FAILURE_CODES.BRANCH_SWITCH_MISMATCH,
      message: detached
        ? `The branch action completed but HEAD is detached, so the workflow cannot continue on the approved branch "${expectedState.headBranch}".`
        : `The branch action completed but HEAD is on "${observedState.headBranch}" instead of the approved branch "${expectedState.headBranch}".`,
      recoverable: true,
      suggestedRecoveryKind: "manual-fix-branch",
    };
  }

  const stderrSummary = summarizeStderr(pickStderr(error));
  // "already exists" in particular is a stable, cross-version git phrase for
  // create-conflicts; we match coarsely instead of locking to exact wording.
  if (
    action?.operation === "create" &&
    typeof stderrSummary === "string" &&
    /already exists/i.test(stderrSummary)
  ) {
    return {
      code: FAILURE_CODES.BRANCH_CONFLICT,
      message: `The branch "${action.branchName ?? "<unknown>"}" already exists, so it cannot be created again from the approved plan.`,
      recoverable: true,
      suggestedRecoveryKind: "switch-existing-branch",
    };
  }

  return {
    code: FAILURE_CODES.BRANCH_CONFLICT,
    message: "The branch action could not complete because of a conflicting working-tree or branch state.",
    recoverable: true,
    suggestedRecoveryKind: "manual-fix-branch",
  };
}

function classifyCommitFailure({ error }) {
  const stderrSummary = summarizeStderr(pickStderr(error));
  const stdoutSummary = summarizeStderr(pickStdout(error));

  if (
    (typeof stdoutSummary === "string" && /nothing to commit/i.test(stdoutSummary)) ||
    (typeof stderrSummary === "string" && /nothing to commit/i.test(stderrSummary))
  ) {
    return {
      code: FAILURE_CODES.COMMIT_FAILURE,
      message: "The commit was approved, but no staged changes were available to create a commit.",
      recoverable: true,
      suggestedRecoveryKind: "stage-and-retry",
    };
  }
  if (typeof stderrSummary === "string" && /pre-commit hook/i.test(stderrSummary)) {
    return {
      code: FAILURE_CODES.COMMIT_FAILURE,
      message: "The commit was rejected by a local commit hook before it could be recorded.",
      recoverable: true,
      suggestedRecoveryKind: "fix-and-retry",
    };
  }
  return {
    code: FAILURE_CODES.COMMIT_FAILURE,
    message: "The commit did not complete; the working tree or index state prevented git from creating the commit.",
    recoverable: true,
    suggestedRecoveryKind: "fix-and-retry",
  };
}

function classifyPushFailure({ action, error }) {
  const stderrSummary = summarizeStderr(pickStderr(error));
  const remoteName = action?.remoteName ?? "origin";
  const branchLabel = action?.branchName ?? "the current branch";

  if (typeof stderrSummary === "string" && /non-fast-forward|rejected/i.test(stderrSummary)) {
    return {
      code: FAILURE_CODES.PUSH_REJECTION,
      message: `The remote "${remoteName}" rejected the push for ${branchLabel}; the remote history is ahead of the local branch.`,
      recoverable: true,
      suggestedRecoveryKind: "retry-after-sync",
    };
  }
  if (typeof stderrSummary === "string" && /no upstream|no configured push destination/i.test(stderrSummary)) {
    return {
      code: FAILURE_CODES.PUSH_REJECTION,
      message: `The push was rejected because ${branchLabel} has no upstream configured on "${remoteName}".`,
      recoverable: true,
      suggestedRecoveryKind: "configure-upstream",
    };
  }
  if (
    typeof stderrSummary === "string" &&
    /(authentication|permission denied|forbidden|protected branch)/i.test(stderrSummary)
  ) {
    return {
      code: FAILURE_CODES.PUSH_REJECTION,
      message: `The remote "${remoteName}" rejected the push for ${branchLabel}; authentication or branch protection prevented the update.`,
      recoverable: false,
      suggestedRecoveryKind: "manual-credentials",
    };
  }
  return {
    code: FAILURE_CODES.PUSH_REJECTION,
    message: `The remote "${remoteName}" rejected the push for ${branchLabel}.`,
    recoverable: true,
    suggestedRecoveryKind: "retry-after-sync",
  };
}

/**
 * Classify a Git execution failure into the canonical taxonomy.
 *
 * @param {{
 *   action: { kind: string, operation?: string, branchName?: string|null, targetBranch?: string|null, remoteName?: string|null, correlationId?: string|null },
 *   error?: { code?: string, message?: string, stderr?: string, stdout?: string, killed?: boolean, signal?: string|null, status?: number, executionUnavailable?: boolean }|null,
 *   repositorySnapshot?: object|null,
 *   expectedState?: object|null,
 *   observedState?: object|null,
 *   preflightDrift?: boolean,
 *   workflowContext?: object|null
 * }} params
 * @returns {{
 *   code: string,
 *   message: string,
 *   details: {
 *     exitCode: number|null,
 *     signal: string|null,
 *     stderrSummary: string|null,
 *     stdoutSummary: string|null,
 *     branch: string|null,
 *     targetBranch: string|null,
 *     remoteName: string|null,
 *     expectedState: object|null,
 *     observedState: object|null,
 *     recoverable: boolean,
 *     suggestedRecoveryKind: string|null
 *   }
 * }}
 */
export function classifyGitExecutionFailure(params = {}) {
  const action = params.action || {};
  const error = params.error || null;
  const expectedState = params.expectedState || null;
  const observedState = params.observedState || null;
  const preflightDrift = params.preflightDrift === true;

  const baseDetails = {
    exitCode: typeof error?.status === "number" ? error.status : null,
    signal: typeof error?.signal === "string" ? error.signal : null,
    stderrSummary: summarizeStderr(pickStderr(error)),
    stdoutSummary: summarizeStderr(pickStdout(error)),
    branch: typeof action.branchName === "string" ? action.branchName : null,
    targetBranch: typeof action.targetBranch === "string" ? action.targetBranch : null,
    remoteName: typeof action.remoteName === "string" ? action.remoteName : null,
    expectedState,
    observedState,
  };

  // (1) Preflight drift short-circuits any mutating-execution classification.
  // Only the explicit `preflightDrift: true` signal triggers this layer —
  // generic snapshot disagreement falls through so action-kind logic can map
  // post-condition mismatches (e.g. branch-switch-mismatch) correctly.
  if (preflightDrift) {
    return {
      code: FAILURE_CODES.REPOSITORY_STATE_MISMATCH,
      message:
        "The repository changed after the action was approved, so the planned Git action can no longer run safely against the expected state.",
      details: {
        ...baseDetails,
        recoverable: true,
        suggestedRecoveryKind: "re-evaluate-after-refresh",
      },
    };
  }

  // (2) Execution-unavailable wins over command-level rejections.
  if (detectExecutionUnavailable(error)) {
    return {
      code: FAILURE_CODES.EXECUTION_UNAVAILABLE,
      message:
        "The Git command could not be executed in this environment; git is missing, timed out, or the working directory is unavailable.",
      details: {
        ...baseDetails,
        recoverable: false,
        suggestedRecoveryKind: "fix-environment",
      },
    };
  }

  // (3) Action-kind-driven taxonomy.
  if (!ACTION_KINDS.has(action.kind)) {
    return {
      code: FAILURE_CODES.UNKNOWN_GIT_FAILURE,
      message: "The Git action failed and could not be safely mapped to a known failure category.",
      details: {
        ...baseDetails,
        recoverable: false,
        suggestedRecoveryKind: null,
      },
    };
  }

  let classification;
  if (action.kind === "branch") {
    classification = classifyBranchFailure({ action, error, expectedState, observedState });
  } else if (action.kind === "commit") {
    classification = classifyCommitFailure({ error });
  } else if (action.kind === "push") {
    classification = classifyPushFailure({ action, error });
  } else {
    // init / finalize have no canonical taxonomy in this story; surface as
    // unknown so callers cannot silently absorb them as a known failure.
    classification = {
      code: FAILURE_CODES.UNKNOWN_GIT_FAILURE,
      message: `The "${action.kind}" action failed and is not yet classified by Story 2.4.`,
      recoverable: false,
      suggestedRecoveryKind: null,
    };
  }

  return {
    code: classification.code,
    message: classification.message,
    details: {
      ...baseDetails,
      recoverable: classification.recoverable === true,
      suggestedRecoveryKind: classification.suggestedRecoveryKind ?? null,
    },
  };
}
