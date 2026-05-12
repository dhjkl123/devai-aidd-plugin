import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_GITIGNORE_LINES } from "./init-service.js";

export function normalizeBaselineAnswer(answer) {
  if (typeof answer !== "string") return "";
  return answer
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9-]+/g, " ")
    .trim();
}

export async function appendGitignoreRules(directory, rules, audit) {
  if (typeof directory !== "string" || directory.length === 0) return false;
  if (!Array.isArray(rules) || rules.length === 0) return false;
  const target = join(directory, ".gitignore");
  let existing = "";
  try {
    if (existsSync(target)) {
      existing = readFileSync(target, "utf8");
    }
  } catch (error) {
    await auditGitignoreFailure(audit, "init.gitignore.read.failed", "readFileSync-threw", error);
    existing = "";
  }

  const existingLines = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
  const additions = rules.filter((rule) => !existingLines.has(rule));
  if (additions.length === 0) return false;

  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const block =
    existing.length === 0
      ? ""
      : "# Added by devai-aidd-plugin to shield sensitive paths from the baseline commit\n";
  try {
    writeFileSync(target, existing + separator + block + additions.join("\n") + "\n", "utf8");
  } catch (error) {
    await auditGitignoreFailure(audit, "init.gitignore.append.failed", "writeFileSync-threw", error);
    return false;
  }
  return true;
}

export async function resolveBaselineCommitFiles({
  answer,
  proposal,
  directory,
  listChangedFiles,
  audit,
  workflowContext = null,
  sessionID = null,
} = {}) {
  let files = Array.isArray(proposal?.files) ? [...proposal.files] : [];
  let allowEmpty = proposal?.allowEmpty === true;
  const normalizedAnswer = normalizeBaselineAnswer(answer);
  const sensitiveRules = Array.isArray(proposal?.sensitiveRules) ? proposal.sensitiveRules : [];
  const setupGitignore =
    normalizedAnswer === "setup gitignore and commit" ||
    (normalizedAnswer === "add to gitignore and commit" && sensitiveRules.length > 0);

  if (!setupGitignore) {
    return { files, allowEmpty, gitignoreUpdated: false, rulesAppended: [] };
  }

  const rulesToAppend = Array.from(new Set([...DEFAULT_GITIGNORE_LINES, ...sensitiveRules]));
  const appended = await appendGitignoreRules(
    proposal?.directory ?? directory ?? "",
    rulesToAppend,
    audit,
  );
  if (!appended || typeof listChangedFiles !== "function") {
    return { files, allowEmpty, gitignoreUpdated: appended, rulesAppended: rulesToAppend };
  }

  let refreshed = null;
  try {
    refreshed = listChangedFiles();
  } catch (error) {
    if (audit) {
      try {
        await audit.info("baseline-commit.gitignore.refresh.failed", {
          event: "baseline-commit.gitignore.refresh.failed",
          timestamp: new Date().toISOString(),
          workflow: workflowContext?.commandName ?? null,
          command: workflowContext?.commandName ?? null,
          sessionID,
          outcome: "skip",
          details: { reason: "listChangedFiles-threw", error: error?.message ?? String(error) },
        });
      } catch {
        // best-effort
      }
    }
  }

  if (Array.isArray(refreshed)) {
    files = refreshed;
    allowEmpty = refreshed.length === 0;
    if (audit) {
      try {
        await audit.info("baseline-commit.gitignore.updated", {
          event: "baseline-commit.gitignore.updated",
          timestamp: new Date().toISOString(),
          workflow: workflowContext?.commandName ?? null,
          command: workflowContext?.commandName ?? null,
          sessionID,
          outcome: "allow",
          details: {
            rulesAppended: rulesToAppend,
            filesRemaining: refreshed.length,
          },
        });
      } catch {
        // best-effort
      }
    }
  }

  return { files, allowEmpty, gitignoreUpdated: appended, rulesAppended: rulesToAppend };
}

async function auditGitignoreFailure(audit, event, reason, error) {
  if (!audit) return;
  try {
    await audit.info(event, {
      event,
      timestamp: new Date().toISOString(),
      workflow: null,
      command: null,
      sessionID: null,
      outcome: "skip",
      details: { reason, error: error?.message ?? String(error) },
    });
  } catch {
    // best-effort
  }
}
