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

function git(directory, args) {
  return execFileSync("git", args, {
    cwd: directory,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

async function fullStartupChain() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    fs.writeFileSync(path.join(directory, "README.md"), "# seed\n", "utf8");
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-full-startup-chain";

    await handlers.event({
      event: {
        type: "command.executed",
        properties: { sessionID, name: "/bmad-bmm-quick-dev", arguments: "ABC-123 startup chain" },
      },
    });

    assert.equal(mock.prompts.length, 0, "startup chain must use native question tool, not promptAsync");

    const startupChainId = `startup-chain:${sessionID}:bmad-bmm-quick-dev`;
    await handlers.event({
      event: {
        type: "question.asked",
        properties: {
          sessionID,
          questions: [
            {
              id: `${startupChainId}:init`,
              header: "Initialize Git",
              question: "Initialize Git for this workspace before the workflow continues?",
              options: ["Initialize Git (Recommended)", "Skip"],
            },
            {
              id: `${startupChainId}:baseline`,
              header: "Create Baseline Commit",
              question: "Create a baseline commit before starting workflow changes?",
              options: [
                "Setup .gitignore and Commit (Recommended)",
                "Commit Without .gitignore",
                "Skip",
              ],
            },
            {
              id: `${startupChainId}:branch`,
              header: "Create Branch `feat/ABC-123-startup-chain`",
              question: "Create and check out feat/ABC-123-startup-chain before editing files, or stay on the current branch?",
              options: [
                "Create New Branch (Recommended)",
                "Stay On Current Branch",
                "Skip",
              ],
            },
          ],
        },
      },
    });

    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          answers: [
            ["Initialize Git (Recommended)"],
            ["Setup .gitignore and Commit (Recommended)"],
            ["Create New Branch (Recommended)"],
          ],
        },
      },
    });

    assert.equal(fs.existsSync(path.join(directory, ".git")), true, ".git directory must exist");
    assert.ok(git(directory, ["rev-parse", "HEAD"]).length > 0, "baseline commit must exist");
    assert.equal(git(directory, ["log", "-1", "--pretty=%s"]), "Initial commit");
    assert.equal(
      git(directory, ["symbolic-ref", "--short", "HEAD"]),
      "feat/ABC-123-startup-chain",
    );

    const executed = findAuditEvents(mock.logs, "git.action.executed");
    assert.ok(executed.some((e) => e.details?.actionKind === "init"));
    assert.ok(executed.some((e) => e.details?.actionKind === "commit"));
    assert.ok(executed.some((e) => e.details?.actionKind === "branch"));
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario("startup chain: init -> baseline commit -> branch execution", fullStartupChain);
