/**
 * E2E: full init → baseline commit → branch publish chain.
 *
 * Pipeline under test (strengthen-git-init-proposal):
 *   command.executed (/bmad-*)
 *     -> init proposal published
 *     -> question.asked + question.replied("Initialize Git (Recommended)")
 *     -> executeInit (real `git init` + DEFAULT_GITIGNORE_LINES)
 *     -> readiness refreshed
 *     -> commitProposal (baseline-commit, allowEmpty=true on fresh dir)
 *     -> approval prompt for baseline commit
 *     -> question.replied(accept)
 *     -> executeCommit (`git commit --allow-empty`)
 *     -> planBranchProposal => branchProposal slot
 *     -> branch approval prompt
 *
 * Verifies real git binary state at each step.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  findAuditEvents,
  runScenario,
} from "./helpers.js";

function gitOk(directory, args) {
  try {
    return execFileSync("git", args, { cwd: directory, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  } catch {
    return null;
  }
}

async function fullInitChain() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-full-chain";

    // Step 1: workflow command starts → init proposal published.
    await handlers.event({
      event: {
        type: "command.executed",
        properties: { sessionID, name: "/bmad-bmm-quick-dev", arguments: "" },
      },
    });

    const initPrompt = mock.prompts.find(
      (p) => p?.parts?.[0]?.metadata?.actionType === "init",
    );
    assert.ok(initPrompt, "init approval prompt must be delivered first");
    assert.equal(initPrompt.directory, directory, "init prompt must carry workflow directory");

    // Step 2: user approves init.
    const initQID = "init-q";
    await handlers.event({
      event: { type: "question.asked", properties: { sessionID, id: initQID, header: "Initialize Git" } },
    });
    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          requestID: initQID,
          answers: [["Initialize Git (Recommended)"]],
        },
      },
    });

    // Verify real .git + .gitignore + that no commit exists yet.
    assert.equal(fs.existsSync(path.join(directory, ".git")), true, ".git directory must exist");
    assert.equal(fs.existsSync(path.join(directory, ".gitignore")), true, ".gitignore must be auto-written");
    // HEAD has no commits yet → `rev-parse HEAD` fails with code 128.
    const preCommitHead = gitOk(directory, ["rev-parse", "HEAD"]);
    assert.equal(preCommitHead, null, "no commit must exist yet before baseline commit");

    // Step 3: baseline commit prompt arrives via post-init chain.
    const baselinePrompt = mock.prompts.find(
      (p) => p?.parts?.[0]?.metadata?.actionType === "commit",
    );
    assert.ok(baselinePrompt, "baseline commit approval prompt must follow init accept");

    // Configure git author so commit can land.
    execFileSync("git", ["config", "user.email", "e2e@example.com"], { cwd: directory, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "E2E Chain"], { cwd: directory, stdio: "pipe" });

    // Step 4: user approves baseline commit.
    const commitQID = "commit-q";
    await handlers.event({
      event: {
        type: "question.asked",
        properties: { sessionID, id: commitQID, header: "Finalize Changes" },
      },
    });
    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          requestID: commitQID,
          answers: [["Approve (Recommended)"]],
        },
      },
    });

    // Verify the baseline commit landed in the real repo.
    const headSha = gitOk(directory, ["rev-parse", "HEAD"]);
    assert.ok(headSha && headSha.trim().length > 0, "HEAD must point to baseline commit after accept");
    const lastMsg = gitOk(directory, ["log", "-1", "--pretty=%s"]);
    assert.equal(
      (lastMsg || "").trim(),
      "Initial commit",
      `baseline commit message must be 'Initial commit'; got ${JSON.stringify(lastMsg)}`,
    );

    // Step 5: post-baseline chain must publish branch proposal.
    const planned = findAuditEvents(mock.logs, "git.action.planned");
    const branchPlanned = planned.find((e) => e.details?.kind === "branch");
    assert.ok(
      branchPlanned,
      `branch proposal must be planned after baseline commit; got planned: ${JSON.stringify(planned.map((p) => p.details))}`,
    );

    // The branch approval prompt should also have been delivered.
    const branchPrompt = mock.prompts.find(
      (p) => p?.parts?.[0]?.metadata?.actionType === "branch/create" || p?.parts?.[0]?.metadata?.actionType === "branch/switch",
    );
    assert.ok(branchPrompt, "branch approval prompt must follow baseline commit");
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario("init chain: command.executed → init → baseline commit → branch", fullInitChain);
