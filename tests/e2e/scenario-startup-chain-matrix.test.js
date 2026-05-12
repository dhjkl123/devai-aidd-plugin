import { execFileSync } from "node:child_process";

import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  runScenario,
} from "./helpers.js";

async function promptKeysFor(directory, sessionID, args = "ABC-123 matrix") {
  const { handlers, mock } = await bootstrapPlugin(directory);
  const output = { parts: [] };
  let currentBranch = null;
  try {
    currentBranch = execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
      cwd: directory,
      stdio: "pipe",
      encoding: "utf8",
    }).trim();
  } catch {
    currentBranch = null;
  }
  await handlers["command.execute.before"](
    { sessionID, command: "/bmad-bmm-quick-dev", arguments: args, currentBranch },
    output,
  );
  assert.equal(
    mock.prompts.filter((prompt) => prompt?.parts?.[0]?.metadata?.startupChain === true).length,
    0,
    "startup matrix must not use promptAsync for startup chains",
  );
  const part = output.parts.find((item) => item?.metadata?.startupChain === true);
  return part?.metadata?.questionKeys ?? [];
}

async function startupMatrix() {
  const nonGit = createTempWorkspace({ initializeGit: false });
  const noHead = createTempWorkspace({ initializeGit: true, withInitialCommit: false });
  const main = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  const ready = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    execFileSync("git", ["switch", "-c", "feat/ABC-123-matrix"], {
      cwd: ready,
      stdio: "pipe",
    });

    assert.deepEqual(
      await promptKeysFor(nonGit, "matrix-non-git"),
      ["init", "baseline", "branch"],
      "non-git workspace should ask init/baseline/branch",
    );
    assert.deepEqual(
      await promptKeysFor(noHead, "matrix-no-head"),
      ["baseline", "branch"],
      "git repo without HEAD should ask baseline/branch",
    );
    assert.deepEqual(
      await promptKeysFor(main, "matrix-main"),
      ["branch"],
      "repo on long-lived branch should ask branch only",
    );
    assert.deepEqual(
      await promptKeysFor(ready, "matrix-ready"),
      [],
      "repo already on computed branch should not ask startup chain",
    );
  } finally {
    cleanupTempWorkspace(nonGit);
    cleanupTempWorkspace(noHead);
    cleanupTempWorkspace(main);
    cleanupTempWorkspace(ready);
  }
}

await runScenario("startup chain matrix", startupMatrix);
