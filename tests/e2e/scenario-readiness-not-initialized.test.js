import fs from "node:fs";
import path from "node:path";

import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  findAuditEvents,
  findFirstAuditEvent,
  runScenario,
} from "./helpers.js";

async function uninitializedRepositoryProposesStartupChain() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-readiness-noninit";
    const output = { parts: [] };
    await handlers["command.execute.before"](
      { command: "/bmad-bmm-create-prd", arguments: "", sessionID },
      output,
    );

    const readiness = findFirstAuditEvent(mock.logs, "git.readiness.checked");
    assert.ok(readiness, "git.readiness.checked event present");
    assert.equal(readiness.outcome, "ask");
    assert.equal(readiness.details.isGitRepository, false);

    const startupRequested = findFirstAuditEvent(mock.logs, "startup.chain.requested");
    assert.ok(startupRequested, "startup.chain.requested fired");
    assert.deepEqual(startupRequested.details.questionKeys, ["init", "baseline"]);

    const planned = findAuditEvents(mock.logs, "git.action.planned");
    assert.ok(planned.find((event) => event.details?.kind === "init"));
    assert.equal(planned.find((event) => event.details?.kind === "branch"), undefined);

    assert.equal(mock.prompts.length, 0, "startup chain must not use promptAsync");
    const startupPart = output.parts.find((part) => part?.metadata?.startupChain === true);
    assert.ok(startupPart, "startup instruction part emitted");
    assert.deepEqual(startupPart.metadata.questionKeys, ["init", "baseline"]);
    assert.match(startupPart.text, /native `question` tool/);
    assert.doesNotMatch(startupPart.text, /devai_git_startup_approval/);
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function nativeEventStartupSkipBaselineFlow() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-native-startup";

    await handlers.event({
      event: {
        type: "command.executed",
        properties: { sessionID, name: "/bmad-bmm-create-prd", arguments: "" },
      },
    });

    assert.equal(mock.prompts.length, 0, "native startup chain must not use promptAsync");

    const startupChainId = `startup-chain:${sessionID}:bmad-bmm-create-prd`;
    await handlers.event({
      event: {
        type: "question.asked",
        properties: {
          sessionID,
          questions: [
            {
              id: `${startupChainId}:init`,
              header: "Initialize Git",
              options: ["Initialize Git (Recommended)", "Skip"],
            },
            {
              id: `${startupChainId}:baseline`,
              header: "Create Baseline Commit",
              options: [
                "Setup .gitignore and Commit (Recommended)",
                "Commit Without .gitignore",
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
          answers: [["Initialize Git (Recommended)"], ["Skip"]],
        },
      },
    });

    assert.equal(fs.existsSync(path.join(directory, ".git")), true);
    assert.equal(findAuditEvents(mock.logs, "startup.chain.resolved").length, 1);
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario(
  "readiness: uninitialized workspace proposes startup chain",
  uninitializedRepositoryProposesStartupChain,
);
await runScenario(
  "native: startup chain init approve and baseline skip",
  nativeEventStartupSkipBaselineFlow,
);
