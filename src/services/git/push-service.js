/**
 * push-service.js
 *
 * Story 2.4 — push intent assembly + executor invocation only.
 *
 * Mirrors the boundary rules of `commit-service.js`:
 *   - no subprocess plumbing
 *   - no raw stderr parsing
 *   - no approval semantics
 *   - all execution + failure classification flows through `git-executor.js`.
 */

import { executeGitAction } from "./git-executor.js";

/**
 * Build a normalized push action plan suitable for the executor.
 *
 * @param {{
 *   branchName?: string|null,
 *   targetBranch?: string|null,
 *   remoteName?: string|null,
 *   correlationId?: string|null,
 * }} input
 * @returns {{
 *   kind: "push",
 *   action: "push",
 *   operation: "push",
 *   branchName: string|null,
 *   branch: string|null,
 *   targetBranch: string|null,
 *   remoteName: string,
 *   remote: string,
 *   correlationId: string|null
 * }}
 */
export function buildPushAction(input = {}) {
  const branchName = typeof input.branchName === "string" ? input.branchName : null;
  // Story 3.3 review (Low): require an explicit remoteName from the caller.
  // A silent "origin" fallback would allow an upstream regression to push to
  // a non-existent remote.
  if (typeof input.remoteName !== "string" || input.remoteName.length === 0) {
    throw new TypeError(
      "buildPushAction requires a non-empty remoteName from the caller",
    );
  }
  // Story 3.3 review round 2 (Low): reject URL-shaped remoteName values so a
  // future regression that accidentally feeds a full remote URL through the
  // executor cannot leak it via `git.action.planned.details.remoteName` /
  // `git.action.executed.details.remoteName` / `correlationId`. The shape
  // check mirrors `redactRemoteLabel` (slash, colon, at-sign, or `https?`
  // schemes are URL-like and never valid short remote names).
  if (/[/:@]/.test(input.remoteName) || /^https?$/i.test(input.remoteName)) {
    throw new TypeError(
      "buildPushAction requires a remote name (e.g. \"origin\"), not a URL or path",
    );
  }
  const remoteName = input.remoteName;
  return {
    kind: "push",
    action: "push",
    operation: "push",
    branchName,
    branch: branchName,
    targetBranch: typeof input.targetBranch === "string" ? input.targetBranch : null,
    remoteName,
    remote: remoteName,
    correlationId:
      typeof input.correlationId === "string" && input.correlationId.length > 0
        ? input.correlationId
        : null,
  };
}

/**
 * Execute a planned push through the canonical executor envelope.
 *
 * @param {{
 *   plan: ReturnType<typeof buildPushAction>,
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
export async function executePush(params = {}) {
  if (!params.plan) {
    throw new TypeError("executePush requires a plan from buildPushAction");
  }
  const plan = params.plan;
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
