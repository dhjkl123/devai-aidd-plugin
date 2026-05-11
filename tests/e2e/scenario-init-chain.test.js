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

    // Verify real .git exists. .gitignore is NO LONGER auto-written at init
    // time -- the unified baseline-commit prompt now asks the user explicitly
    // (Setup .gitignore and Commit / Commit Without .gitignore / Skip) and
    // the executor writes the template only when the user picks the setup
    // option.
    assert.equal(fs.existsSync(path.join(directory, ".git")), true, ".git directory must exist");
    assert.equal(
      fs.existsSync(path.join(directory, ".gitignore")),
      false,
      ".gitignore must NOT be auto-written at init time (created at baseline-commit accept instead)",
    );
    // HEAD has no commits yet → `rev-parse HEAD` fails with code 128.
    const preCommitHead = gitOk(directory, ["rev-parse", "HEAD"]);
    assert.equal(preCommitHead, null, "no commit must exist yet before baseline commit");

    // Step 3: baseline commit prompt arrives via post-init chain.
    const baselinePrompt = mock.prompts.find(
      (p) => p?.parts?.[0]?.metadata?.actionType === "commit",
    );
    assert.ok(baselinePrompt, "baseline commit approval prompt must follow init accept");

    // strengthen-approval-prompt-instructions (AC11): plugin-emitted metadata
    // must carry the new "Create Baseline Commit" header and option labels,
    // and the prompt body must start with the builder's strong instruction
    // text (not the prior weak "Ask the user with the question tool..." line).
    const baselineMd = baselinePrompt.parts[0].metadata;
    assert.equal(
      baselineMd.questionHeader,
      "Create Baseline Commit",
      "baseline commit prompt metadata.questionHeader must be 'Create Baseline Commit'",
    );
    assert.deepEqual(
      baselineMd.questionOptions,
      [
        "Setup .gitignore and Commit (Recommended)",
        "Commit Without .gitignore",
        "Skip",
      ],
      "baseline commit prompt metadata.questionOptions must enumerate the new unified 3-option set",
    );
    const baselineText = baselinePrompt.parts[0].text || "";
    assert.match(
      baselineText,
      /Ask the user the `Create Baseline Commit` question with these exact options:/,
      "baseline commit prompt body must include the strong builder instruction line",
    );

    // Configure git author so commit can land.
    execFileSync("git", ["config", "user.email", "e2e@example.com"], { cwd: directory, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "E2E Chain"], { cwd: directory, stdio: "pipe" });

    // Step 4: user approves baseline commit.
    const commitQID = "commit-q";
    await handlers.event({
      event: {
        type: "question.asked",
        properties: { sessionID, id: commitQID, header: "Create Baseline Commit" },
      },
    });
    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          requestID: commitQID,
          // Pick "Setup .gitignore and Commit (Recommended)" -- exercises the
          // new gitignore-writing executor branch end-to-end.
          answers: [["Setup .gitignore and Commit (Recommended)"]],
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
