/**
 * init-service.js
 *
 * Story strengthen-git-init-proposal — repository initialization service.
 *
 * Mirrors `commit-service.js`: a thin action builder + executor that wraps
 * `executeGitAction` for `kind: "init"`. After a successful `git init`,
 * synchronously writes a default `.gitignore` if one is missing so the
 * caller's subsequent `listChangedFiles()` enumeration honors the ignore
 * rules (TD #6 ordering guarantee).
 *
 * Boundary rules:
 *   - approval logic lives elsewhere (allow/deny/ask/skip) — not here.
 *   - subprocess execution lives inside `runGitAction` via `executeGitAction`.
 *   - `.gitignore` write failure is best-effort and never flips envelope.ok.
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { executeGitAction } from "./git-executor.js";

export const DEFAULT_GITIGNORE_LINES = Object.freeze([
  "node_modules/",
  "dist/",
  ".env",
  ".env.local",
  ".DS_Store",
  "*.log",
  ".vscode/",
  ".idea/",
  "_bmad-output/",
  ".claude/",
]);

/**
 * Build a normalized init action plan suitable for the executor.
 *
 * @param {{
 *   directory: string,
 *   correlationId?: string | null,
 *   gitignoreContent?: string | null,
 * }} input
 * @returns {{ kind: "init", operation: "init", branchName: null, targetBranch: null, remoteName: null, correlationId: string | null, directory: string, gitignoreContent: string | null }}
 */
export function buildInitAction(input = {}) {
  return {
    kind: "init",
    operation: "init",
    branchName: null,
    targetBranch: null,
    remoteName: null,
    correlationId:
      typeof input.correlationId === "string" && input.correlationId.length > 0
        ? input.correlationId
        : null,
    directory: typeof input.directory === "string" ? input.directory : "",
    gitignoreContent:
      typeof input.gitignoreContent === "string" && input.gitignoreContent.length > 0
        ? input.gitignoreContent
        : null,
  };
}

async function writeGitignoreIfMissing(directory, contentOverride, audit) {
  if (typeof directory !== "string" || directory.length === 0) return;
  const target = join(directory, ".gitignore");
  try {
    if (existsSync(target)) return;
  } catch {
    // existsSync should not throw in normal operation; if it does, skip
    return;
  }
  const body =
    typeof contentOverride === "string" && contentOverride.length > 0
      ? contentOverride
      : DEFAULT_GITIGNORE_LINES.join("\n") + "\n";
  try {
    writeFileSync(target, body, "utf8");
  } catch (error) {
    if (audit) {
      try {
        await audit.info("init.gitignore.write.failed", {
          event: "init.gitignore.write.failed",
          timestamp: new Date().toISOString(),
          workflow: null,
          command: null,
          sessionID: null,
          outcome: "skip",
          details: {
            reason: "writeFileSync-threw",
            error: error?.message ?? String(error),
          },
        });
      } catch {
        // best-effort
      }
    }
  }
}

/**
 * Execute a planned init through the canonical executor envelope. On success
 * (`envelope.ok === true`), synchronously writes a default `.gitignore` if
 * one is missing before returning. The caller can then invoke
 * `listChangedFiles()` with the ignore rules already in effect (TD #6).
 *
 * @param {{
 *   plan: ReturnType<typeof buildInitAction>,
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
export async function executeInit(params = {}) {
  const plan = params.plan ?? buildInitAction({});
  const envelope = await executeGitAction({
    plan,
    approval: params.approval ?? null,
    expectedState: params.expectedState ?? null,
    repositorySnapshot: params.repositorySnapshot ?? null,
    workflowContext: params.workflowContext ?? null,
    gitRunner: typeof params.gitRunner === "function" ? params.gitRunner : null,
    audit: params.audit ?? null,
    workflowState: params.workflowState ?? null,
  });

  if (envelope?.ok && typeof plan.directory === "string" && plan.directory.length > 0) {
    await writeGitignoreIfMissing(plan.directory, plan.gitignoreContent, params.audit ?? null);
  }

  return envelope;
}
