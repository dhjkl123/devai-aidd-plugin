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
  ".DS_Store",
  "*.log",
  ".vscode/",
  ".idea/",
  "_bmad-output/",
  ".claude/",
  // strengthen-approval-prompt-instructions follow-up: catch common secret
  // file shapes by default so a no-gitignore project does not leak .env
  // variants, private keys, or local databases into the baseline commit.
  // detectSensitiveFiles() uses the same patterns at runtime to warn the
  // user when a tracked path matches one of these before commit.
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "id_rsa",
  "id_rsa.pub",
  "id_ed25519",
  "id_ed25519.pub",
  "secrets/",
  "credentials/",
  "*.sqlite",
  "*.sqlite3",
  "*.db",
]);

/**
 * Regular expressions that match paths a typical project would NOT want in a
 * baseline commit. Patterns are applied against the path string emitted by
 * `git status --porcelain` (forward-slash separators, repository-relative,
 * already trimmed of the porcelain status code).
 *
 * Each entry pairs the regex with the corresponding `.gitignore` rule that
 * `executeApprovedAction`'s "Add to .gitignore and Commit" branch will append
 * when the user picks that option. The rule string MUST be a single line
 * suitable for direct append to `.gitignore` -- no leading/trailing slash
 * normalization at runtime.
 */
export const SENSITIVE_FILE_PATTERNS = Object.freeze([
  { regex: /(^|\/)\.env(\..+)?$/, rule: ".env*" },
  { regex: /\.pem$/, rule: "*.pem" },
  { regex: /\.key$/, rule: "*.key" },
  { regex: /\.p12$/, rule: "*.p12" },
  { regex: /\.pfx$/, rule: "*.pfx" },
  { regex: /(^|\/)id_rsa(\.pub)?$/, rule: "id_rsa*" },
  { regex: /(^|\/)id_ed25519(\.pub)?$/, rule: "id_ed25519*" },
  { regex: /(^|\/)secrets\//, rule: "secrets/" },
  { regex: /(^|\/)credentials\//, rule: "credentials/" },
  { regex: /\.sqlite3?$/, rule: "*.sqlite*" },
  { regex: /\.db$/, rule: "*.db" },
]);

/**
 * Scan a list of repository-relative file paths and return both the matched
 * paths and the de-duplicated set of .gitignore rules that would shield them.
 * Used by `buildBaselineCommitProposal` to attach a warning payload to the
 * proposal so `buildQuestionInstruction` can switch to the "Sensitive Files
 * Detected" prompt variant.
 *
 * @param {Array<string> | null | undefined} files
 * @returns {{ files: string[], rules: string[] }}
 */
export function detectSensitiveFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return { files: [], rules: [] };
  }
  const matchedFiles = [];
  const ruleSet = new Set();
  for (const raw of files) {
    if (typeof raw !== "string" || raw.length === 0) continue;
    const normalized = raw.replace(/\\/g, "/");
    for (const { regex, rule } of SENSITIVE_FILE_PATTERNS) {
      if (regex.test(normalized)) {
        matchedFiles.push(normalized);
        ruleSet.add(rule);
        break;
      }
    }
  }
  return { files: matchedFiles, rules: Array.from(ruleSet) };
}

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
 * Execute a planned init through the canonical executor envelope.
 *
 * Previously this function also wrote a default `.gitignore` on success.
 * That was removed (strengthen-approval-prompt-instructions follow-up) --
 * `.gitignore` creation is now an explicit user choice surfaced on the
 * baseline-commit prompt ("Setup .gitignore and Commit" option), so the
 * model never silently lands a default ignore file the user did not see.
 * The helper `writeGitignoreIfMissing` and `DEFAULT_GITIGNORE_LINES` /
 * `SENSITIVE_FILE_PATTERNS` exports stay -- the baseline-commit executor
 * branch in `execute-approved-action.js` consumes them now.
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

  return envelope;
}

export { writeGitignoreIfMissing };
