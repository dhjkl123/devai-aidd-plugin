/**
 * tests/e2e/helpers.js
 *
 * Shared test scaffolding for Hook → Service end-to-end scenarios.
 *
 * Why hand-rolled (no test framework): the project's existing
 * `tests/regression.test.js` runs under `node --check` + plain
 * `node:assert/strict` with no jest/vitest/mocha dependency. The e2e suite
 * matches that convention so both suites use the same `npm test` driver.
 *
 * Each scenario is intended to exercise a full pipeline through the real
 * `DevaiAiddGuardPlugin` factory: real `git` binary on a temp repo, real
 * `loadRuntimeConfig`, real audit logger, real workflow state store. Only
 * the runtime client (`client.app.log`, `client.session.promptAsync`) is
 * mocked so the test can observe audit events and approval prompts.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DevaiAiddGuardPlugin } from "../../src/index.js";

export function createTempWorkspace({
  initializeGit = false,
  withRemote = false,
  withInitialCommit = false,
  workflowCommands = ["bmad-bmm-quick-dev", "bmad-bmm-create-prd"],
} = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-e2e-"));
  const commandsDir = path.join(tempRoot, ".opencode", "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  for (const name of workflowCommands) {
    fs.writeFileSync(path.join(commandsDir, `${name}.md`), `# ${name}\n`, "utf8");
  }

  if (initializeGit) {
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: tempRoot, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "e2e@example.com"], { cwd: tempRoot, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "E2E Tester"], { cwd: tempRoot, stdio: "pipe" });
  }

  if (withRemote) {
    execFileSync(
      "git",
      ["remote", "add", "origin", "https://example.invalid/repo.git"],
      { cwd: tempRoot, stdio: "pipe" },
    );
  }

  if (withInitialCommit) {
    fs.writeFileSync(path.join(tempRoot, "README.md"), "# seed\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: tempRoot, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "seed"], { cwd: tempRoot, stdio: "pipe" });
  }

  return tempRoot;
}

export function cleanupTempWorkspace(tempRoot) {
  if (!tempRoot) return;
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // Best effort: Windows occasionally holds file handles on pack-archives.
  }
}

export function createMockClient() {
  const logs = [];
  const prompts = [];
  return {
    logs,
    prompts,
    client: {
      app: {
        async log(payload) {
          logs.push(payload);
        },
      },
      session: {
        async promptAsync(payload) {
          prompts.push(payload);
        },
      },
    },
  };
}

export async function bootstrapPlugin(directory) {
  const mock = createMockClient();
  const handlers = await DevaiAiddGuardPlugin({ client: mock.client, directory });
  return { handlers, mock };
}

export function findAuditEvents(logs, eventName) {
  return logs
    .map((entry) => entry?.body?.extra)
    .filter((extra) => extra && extra.event === eventName);
}

export function findFirstAuditEvent(logs, eventName) {
  return findAuditEvents(logs, eventName)[0] ?? null;
}

export function findApprovalPrompt(prompts) {
  for (const prompt of prompts) {
    const part = prompt?.parts?.[0];
    const md = part?.metadata;
    if (md?.requestId || md?.actionId) {
      return prompt;
    }
  }
  return null;
}

export function readApprovalIdentifiers(prompt) {
  const md = prompt?.parts?.[0]?.metadata ?? {};
  return {
    requestId: md.requestId ?? null,
    actionId: md.actionId ?? null,
    sessionID: prompt?.sessionID ?? null,
  };
}

export async function runScenario(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    const ms = Date.now() - startedAt;
    console.log(`✓ ${name} (${ms}ms)`);
  } catch (error) {
    const ms = Date.now() - startedAt;
    console.error(`✗ ${name} (${ms}ms)`);
    console.error(error?.stack || error);
    process.exitCode = 1;
    throw error;
  }
}

export { assert };
