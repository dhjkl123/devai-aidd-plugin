/**
 * commit-service.js
 *
 * Story 2.4 — commit intent assembly + executor invocation only.
 *
 * This module is intentionally thin: it does NOT shell out to git, does NOT
 * parse stderr, and does NOT decide approval. It builds a normalized commit
 * action plan and delegates execution + classification to `git-executor.js`.
 *
 * Boundary rules (from Story 2.4 Dev Notes):
 *   - approval logic lives elsewhere (allow/deny/ask/skip) — not here.
 *   - subprocess execution and exit-status normalization live in the executor.
 *   - this file may not handle raw git stderr or invent its own failure codes.
 */

import { executeGitAction } from "./git-executor.js";

/**
 * Build a normalized commit action plan suitable for the executor.
 *
 * Optional `logger` lets callers surface a warning when `input.files` is not a
 * usable array — silently dropping caller mistakes hides upstream contract
 * breakages and was flagged by Story 3.2 review (LOW).
 *
 * @param {{
 *   message?: string|null,
 *   branchName?: string|null,
 *   targetBranch?: string|null,
 *   correlationId?: string|null,
 *   files?: string[]|null,
 * }} input
 * @param {{ logger?: { warn?: (message: string, payload?: object) => void } | null }} [options]
 * @returns {{ kind: "commit", operation: "commit", branchName: string|null, targetBranch: string|null, remoteName: null, correlationId: string|null, message: string|null, files: string[] }}
 */
export function buildCommitAction(input = {}, options = {}) {
  const filesProvided = Object.prototype.hasOwnProperty.call(input, "files");
  const filesArray = Array.isArray(input.files) ? [...input.files] : [];
  if (filesProvided && !Array.isArray(input.files)) {
    const logger = options?.logger ?? null;
    if (logger && typeof logger.warn === "function") {
      try {
        logger.warn("commit-service: buildCommitAction received non-array files; falling back to []", {
          providedType: typeof input.files,
          correlationId: typeof input.correlationId === "string" ? input.correlationId : null,
        });
      } catch {
        // best-effort logging only
      }
    }
  }
  return {
    kind: "commit",
    operation: "commit",
    branchName: typeof input.branchName === "string" ? input.branchName : null,
    targetBranch: typeof input.targetBranch === "string" ? input.targetBranch : null,
    remoteName: null,
    correlationId:
      typeof input.correlationId === "string" && input.correlationId.length > 0
        ? input.correlationId
        : null,
    message: typeof input.message === "string" ? input.message : null,
    files: filesArray,
  };
}

/**
 * Execute a planned commit through the canonical executor envelope.
 *
 * The caller MUST provide a `gitRunner` that performs the actual subprocess
 * invocation; commit-service does not hold a child_process import. The runner
 * receives `{ action }` and may return `{ stdout, stderr, observedState }`.
 *
 * @param {{
 *   plan: ReturnType<typeof buildCommitAction>,
 *   approval?: object|null,
 *   expectedState?: object|null,
 *   repositorySnapshot?: object|null,
 *   workflowContext?: object|null,
 *   gitRunner?: ((args: { action: object }) => Promise<object>) | null,
 *   audit?: object|null,
 *   workflowState?: object|null,
 * }} params
 * @returns {Promise<object>} executor envelope
 */
export async function executeCommit(params = {}) {
  const plan = params.plan ?? buildCommitAction({});
  return executeGitAction({
    plan,
    approval: params.approval ?? null,
    expectedState: params.expectedState ?? null,
    repositorySnapshot: params.repositorySnapshot ?? null,
    workflowContext: params.workflowContext ?? null,
    gitRunner: typeof params.gitRunner === "function" ? params.gitRunner : null,
    audit: params.audit ?? null,
    workflowState: params.workflowState ?? null,
  });
}
