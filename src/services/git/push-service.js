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
 * @returns {{ kind: "push", operation: "push", branchName: string|null, targetBranch: string|null, remoteName: string, correlationId: string|null }}
 */
export function buildPushAction(input = {}) {
  return {
    kind: "push",
    operation: "push",
    branchName: typeof input.branchName === "string" ? input.branchName : null,
    targetBranch: typeof input.targetBranch === "string" ? input.targetBranch : null,
    remoteName: typeof input.remoteName === "string" && input.remoteName.length > 0
      ? input.remoteName
      : "origin",
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
  const plan = params.plan ?? buildPushAction({});
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
