/**
 * Unit tests for the workflow finalization sentinel after the
 * single-source + commit/skip rework:
 *
 *   - Verify 1: command-execute-before sentinel part shape (builder canonical)
 *   - Verify 2: "Commit" answer → sentinel.received(decision=commit),
 *               approval.requested(sentinelPreApproved=true), commit executed
 *   - Verify 2-b: "Skip" answer → sentinel.skipped, no evaluation, no execute
 *   - Verify 2-c: Unknown answer → routed to Skip with reason=unrecognized-answer
 *   - Verify 3: duplicate sentinel after a triggered run emits .duplicate only
 *   - Verify 4: tool-execute-before sentinel passthrough — active approval
 *   - Verify 4-b: tool-execute-before sentinel passthrough — startup chain
 *   - Verify 5: premature (phase != "mutating") emits .premature, no work done
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

const toolExecuteAfterUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "tool-execute-after.js"),
).href;
const toolExecuteBeforeUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "tool-execute-before.js"),
).href;
const commandExecuteBeforeUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "command-execute-before.js"),
).href;
const sentinelBuilderUrl = pathToFileURL(
  path.join(
    projectRoot,
    "src",
    "services",
    "approval",
    "build-finalization-sentinel-instruction.js",
  ),
).href;

const { createToolExecuteAfterHook } = await import(toolExecuteAfterUrl);
const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeUrl);
const { createCommandExecuteBeforeHook } = await import(commandExecuteBeforeUrl);
const {
  FINALIZATION_SENTINEL_HEADER,
  FINALIZATION_SENTINEL_MESSAGE_PLACEHOLDER,
  FINALIZATION_SENTINEL_TITLE_TEMPLATE,
  buildFinalizationSentinelInstruction,
} =
  await import(sentinelBuilderUrl);

function createStubStore() {
  const map = new Map();
  return {
    set(sessionID, value) {
      map.set(sessionID, { ...value });
    },
    get(sessionID) {
      const entry = map.get(sessionID);
      return entry ? { ...entry } : undefined;
    },
    advancePhase(sessionID, phase) {
      const entry = map.get(sessionID);
      if (entry) entry.phase = phase;
    },
    _raw: map,
  };
}

function createAudit() {
  const events = [];
  return {
    events,
    async info(name, payload) {
      events.push({ name, payload });
    },
    countOf(name) {
      return events.filter((e) => e.name === name).length;
    },
    findOf(name) {
      return events.filter((e) => e.name === name);
    },
  };
}

function createCommitReadyPluginContext({
  listChangedFilesReturn = ["index.html"],
} = {}) {
  return {
    debug: { log: () => {} },
    directory: projectRoot,
    listChangedFiles() {
      return listChangedFilesReturn;
    },
    resolvePolicy() {
      return {
        outcome: "allow",
        details: {
          policy: {
            category: "workflow",
            finalization: "commit-only",
            identityStrategy: "workflow-scope",
          },
        },
      };
    },
  };
}

const minimalPluginContext = { debug: { log: () => {} }, directory: projectRoot };

// ───────────────────────────────────────────────────────────────────────────
// Verify 1: sentinel injection (builder output is the canonical part shape)
// ───────────────────────────────────────────────────────────────────────────
{
  const sentinel = buildFinalizationSentinelInstruction({
    sessionID: "s-inject",
    commandName: "bmad-bmm-quick-dev",
  });
  const part = {
    type: "text",
    text: sentinel.instructionText,
    synthetic: true,
    metadata: sentinel.metadata,
  };
  assert.equal(part.metadata.sentinelKind, "workflow-finalize");
  assert.equal(part.metadata.sessionID, "s-inject");
  assert.equal(part.metadata.commandName, "bmad-bmm-quick-dev");
  assert.ok(part.text.includes(FINALIZATION_SENTINEL_HEADER));
  assert.ok(part.text.includes('"Commit"'));
  assert.ok(part.text.includes('"Skip"'));
  assert.ok(part.text.includes(FINALIZATION_SENTINEL_TITLE_TEMPLATE));
  assert.ok(part.text.includes(FINALIZATION_SENTINEL_MESSAGE_PLACEHOLDER));
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 2: "Commit" answer triggers commit execution (no extra approval prompt)
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-commit";
  const pluginContext = createCommitReadyPluginContext();
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    arguments: "",
    detectedAt: new Date().toISOString(),
    phase: "mutating",
    touchedFiles: [],
    finalizationTriggered: false,
  });

  const hook = createToolExecuteAfterHook({
    workflowState,
    audit,
    pluginContext,
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  const output = { metadata: { answers: [["Commit"]] } };
  await hook(input, output);

  const received = audit.findOf("workflow.finalization.sentinel.received");
  assert.equal(received.length, 1, "sentinel.received audit emitted once");
  assert.equal(
    received[0].payload?.details?.decision,
    "commit",
    "sentinel.received audit details.decision === 'commit'",
  );

  const skipped = audit.countOf("workflow.finalization.sentinel.skipped");
  assert.equal(skipped, 0, "sentinel.skipped MUST NOT emit on commit path");

  const delegated = audit.findOf("workflow.finalization.delegated");
  assert.equal(delegated.length, 1, "delegated finalization audit emitted once");

  assert.equal(
    workflowState.get(sessionID).finalizationTriggered,
    true,
    "finalizationTriggered flag set true",
  );

  assert.equal(
    workflowState.get(sessionID).delegatedFinalization?.stage,
    "awaiting-commit",
    "delegated finalization state opened",
  );
  assert.ok(
    typeof workflowState.get(sessionID).delegatedFinalization?.commitMessage === "string" &&
      workflowState.get(sessionID).delegatedFinalization.commitMessage.length > 0,
    "delegated finalization must carry a suggested commit message",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 2-b: "Skip" answer ends the workflow without evaluating or executing
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-skip";
  const pluginContext = createCommitReadyPluginContext();
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    arguments: "",
    detectedAt: new Date().toISOString(),
    phase: "mutating",
    touchedFiles: [],
    finalizationTriggered: false,
  });

  const hook = createToolExecuteAfterHook({
    workflowState,
    audit,
    pluginContext,
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  const output = { metadata: { answers: [["Skip"]] } };
  await hook(input, output);

  const skipped = audit.findOf("workflow.finalization.sentinel.skipped");
  assert.equal(skipped.length, 1, "sentinel.skipped audit emitted once");
  assert.equal(skipped[0].payload?.details?.reason, "user-skipped");

  assert.equal(
    audit.countOf("workflow.finalization.sentinel.received"),
    0,
    "sentinel.received MUST NOT emit on skip path",
  );
  assert.equal(
    audit.countOf("workflow.finalization.evaluated"),
    0,
    "evaluateWorkflowFinalization MUST NOT be called on skip path",
  );
  assert.equal(
    workflowState.get(sessionID).finalizationTriggered,
    false,
    "skip terminal cleanup clears finalizationTriggered",
  );
  assert.equal(
    workflowState.get(sessionID).delegatedFinalization ?? null,
    null,
  );
  assert.equal(workflowState.get(sessionID).finalizationCompletion?.outcome, "skip");
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 2-c: Unknown answer is routed to the Skip branch
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-unknown";
  const pluginContext = createCommitReadyPluginContext();
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    arguments: "",
    detectedAt: new Date().toISOString(),
    phase: "mutating",
    touchedFiles: [],
    finalizationTriggered: false,
  });

  const hook = createToolExecuteAfterHook({
    workflowState,
    audit,
    pluginContext,
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  const output = { metadata: { answers: [["NotAValidChoice"]] } };
  await hook(input, output);

  const skipped = audit.findOf("workflow.finalization.sentinel.skipped");
  assert.equal(skipped.length, 1, "unknown answer emits sentinel.skipped once");
  assert.equal(
    skipped[0].payload?.details?.reason,
    "unrecognized-answer",
    "skipped reason flags the answer as unrecognized",
  );
  assert.equal(
    workflowState.get(sessionID).finalizationTriggered,
    false,
  );
}

// Verify 2-d: "Commit" with no remaining changes is downgraded to a skip
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-no-changes";
  const pluginContext = createCommitReadyPluginContext({
    listChangedFilesReturn: [],
  });
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    arguments: "",
    detectedAt: new Date().toISOString(),
    phase: "mutating",
    touchedFiles: [],
    finalizationTriggered: false,
  });

  const hook = createToolExecuteAfterHook({
    workflowState,
    audit,
    pluginContext,
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  const output = { metadata: { answers: [["Commit"]] } };
  await hook(input, output);

  const skipped = audit.findOf("workflow.finalization.sentinel.skipped");
  assert.equal(skipped.length, 1, "no-change commit answer is downgraded to skip");
  assert.equal(skipped[0].payload?.details?.reason, "no-working-tree-changes");
  assert.equal(workflowState.get(sessionID).delegatedFinalization ?? null, null);
  assert.equal(workflowState.get(sessionID).finalizationCompletion?.reason, "no-working-tree-changes");
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 3: duplicate sentinel → .duplicate audit, no re-trigger
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-dup";
  const pluginContext = createCommitReadyPluginContext();
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    arguments: "",
    detectedAt: new Date().toISOString(),
    phase: "mutating",
    touchedFiles: [],
    finalizationTriggered: true, // already triggered
  });

  const hook = createToolExecuteAfterHook({
    workflowState,
    audit,
    pluginContext,
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  const output = { metadata: { answers: [["Commit"]] } };
  await hook(input, output);

  assert.equal(
    audit.countOf("workflow.finalization.sentinel.duplicate"),
    1,
    "sentinel.duplicate audit emitted",
  );
  assert.equal(
    audit.countOf("workflow.finalization.sentinel.received"),
    0,
    "sentinel.received NOT emitted on duplicate",
  );
  assert.equal(
    audit.countOf("workflow.finalization.sentinel.skipped"),
    0,
    "sentinel.skipped NOT emitted on duplicate either",
  );
  assert.equal(workflowState.get(sessionID).delegatedFinalization ?? null, null);
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 4: passthrough — active approval present, no throw, phase unchanged
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-passthrough-approval";
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    phase: "in-progress",
    readiness: {
      outcome: "allow",
      reason: "repository-ready",
      details: {
        isGitRepository: true,
      },
    },
    approvalCurrent: {
      actionType: "branch/create",
      proposal: { name: "feat/foo" },
    },
    pendingApprovalQuestion: null,
  });

  const beforeHook = createToolExecuteBeforeHook({
    workflowState,
    audit,
    pluginContext: minimalPluginContext,
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  await beforeHook(input, {});
  assert.equal(
    workflowState.get(sessionID).phase,
    "in-progress",
    "phase unchanged after sentinel passthrough",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 4-b: passthrough — startup chain pending
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-passthrough-startup";
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    phase: "in-progress",
    readiness: {
      outcome: "allow",
      reason: "repository-ready",
      details: {
        isGitRepository: true,
      },
    },
    startupChainCurrent: {
      startupChainId: "startup-chain:abc",
      steps: [{ key: "init" }, { key: "baseline" }],
    },
    pendingStartupQuestion: null,
  });

  const beforeHook = createToolExecuteBeforeHook({
    workflowState,
    audit,
    pluginContext: minimalPluginContext,
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  await beforeHook(input, {});
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 5: premature sentinel (phase != "mutating") → .premature, no work
// touchedFiles is irrelevant: the new guard hangs entirely on phase.
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-premature";
  const pluginContext = createCommitReadyPluginContext();
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    arguments: "",
    detectedAt: new Date().toISOString(),
    phase: "in-progress", // not "mutating"
    touchedFiles: [
      // touchedFiles must NOT bypass the premature guard anymore.
      { path: "src/foo.js", kind: "code" },
    ],
    finalizationTriggered: false,
  });

  const hook = createToolExecuteAfterHook({
    workflowState,
    audit,
    pluginContext,
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  const output = { metadata: { answers: [["Commit"]] } };
  await hook(input, output);

  assert.equal(
    audit.countOf("workflow.finalization.sentinel.premature"),
    1,
    "sentinel.premature audit emitted",
  );
  assert.equal(
    audit.countOf("workflow.finalization.sentinel.received"),
    0,
    "sentinel.received NOT emitted on premature",
  );
  assert.equal(
    audit.countOf("workflow.finalization.delegated"),
    0,
    "delegated finalization NOT emitted on premature",
  );
  assert.equal(
    workflowState.get(sessionID).finalizationTriggered,
    false,
    "finalizationTriggered remains false on premature",
  );
}

// Verify 6: sentinel blocked when readiness says the workspace is not a git repo
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-passthrough-non-git";
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "devai-non-git-question-"));
  workflowState.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    phase: "in-progress",
    readiness: {
      outcome: "allow",
      reason: "readiness-gate-skipped",
      details: {
        isGitRepository: false,
      },
    },
  });

  const beforeHook = createToolExecuteBeforeHook({
    workflowState,
    audit,
    pluginContext: { debug: { log: () => {} }, directory: tempWorkspace },
  });

  const input = {
    tool: "question",
    sessionID,
    args: {
      questions: [
        { header: FINALIZATION_SENTINEL_HEADER, options: ["Commit", "Skip"] },
      ],
    },
  };
  try {
    await assert.rejects(
      () => beforeHook(input, {}),
      /do not call the workflow finalization question in a non-git workspace/i,
    );
  } finally {
    fs.rmSync(tempWorkspace, { force: true, recursive: true });
  }
}

// Verify 7: command-execute-before does not inject sentinel in non-git workspace
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "devai-sentinel-gate-"));
  const output = { parts: [] };

  const hook = createCommandExecuteBeforeHook({
    workflowCommands: new Set(["policy-light"]),
    workflowState,
    audit,
    branchConfig: {},
    pluginContext: {
      directory: tempWorkspace,
      runtimeConfig: { config: { readiness: { skipInitAndBaseline: true } } },
      resolvePolicy() {
        return {
          outcome: "allow",
          details: {
            policy: {
              category: "docs",
              identityStrategy: "ticket-or-args",
              branchRequired: false,
              finalization: "no-forced-finalization",
            },
          },
        };
      },
      debug: { log: () => {} },
    },
  });

  try {
    await hook({ command: "/policy-light", arguments: "", sessionID: "no-git-sentinel" }, output);
    assert.equal(
      output.parts.some(
        (part) => typeof part?.text === "string" && part.text.includes(FINALIZATION_SENTINEL_HEADER),
      ),
      false,
      "non-git workspace must not receive finalization sentinel instruction",
    );
  } finally {
    fs.rmSync(tempWorkspace, { force: true, recursive: true });
  }
}

console.log("sentinel-finalization-trigger.test.js: PASS");
