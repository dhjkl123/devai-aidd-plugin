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
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

const toolExecuteAfterUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "tool-execute-after.js"),
).href;
const toolExecuteBeforeUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "tool-execute-before.js"),
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
const { FINALIZATION_SENTINEL_HEADER, buildFinalizationSentinelInstruction } =
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
  gitActionCalls = [],
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
    gitActionRunner({ action }) {
      gitActionCalls.push({
        kind: action?.kind ?? null,
        operation: action?.operation ?? null,
      });
      return {
        ok: true,
        status: "executed",
        action: {
          kind: action?.kind ?? "commit",
          operation: action?.operation ?? "commit",
          branchName: null,
          targetBranch: null,
          remoteName: null,
          correlationId: action?.correlationId ?? null,
          approvedAt: new Date().toISOString(),
        },
        code: null,
        message: null,
        details: { observedState: null },
        audit: { attempted: false, logged: false, loggingError: null },
        next: { continueWorkflow: true, requiresRecoveryChoice: false },
      };
    },
  };
}

const minimalPluginContext = { debug: { log: () => {} } };

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
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 2: "Commit" answer triggers commit execution (no extra approval prompt)
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-commit";
  const gitActionCalls = [];
  const pluginContext = createCommitReadyPluginContext({ gitActionCalls });
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

  const approvalRequested = audit.findOf("approval.requested");
  assert.ok(
    approvalRequested.length >= 1,
    "approval.requested audit emitted on commit path",
  );
  assert.equal(
    approvalRequested[0].payload?.details?.sentinelPreApproved,
    true,
    "approval.requested marks details.sentinelPreApproved === true",
  );
  assert.equal(
    approvalRequested[0].payload?.details?.actionType,
    "commit",
    "approval.requested actionType === 'commit'",
  );

  assert.equal(
    workflowState.get(sessionID).finalizationTriggered,
    true,
    "finalizationTriggered flag set true",
  );

  const commitCalls = gitActionCalls.filter((entry) => entry.kind === "commit");
  assert.equal(
    commitCalls.length,
    1,
    "gitActionRunner invoked exactly once for commit",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 2-b: "Skip" answer ends the workflow without evaluating or executing
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-skip";
  const gitActionCalls = [];
  const pluginContext = createCommitReadyPluginContext({ gitActionCalls });
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
    audit.countOf("approval.requested"),
    0,
    "approval.requested MUST NOT emit on skip path",
  );
  assert.equal(
    gitActionCalls.length,
    0,
    "gitActionRunner MUST NOT be called on skip path",
  );
  assert.equal(
    workflowState.get(sessionID).finalizationTriggered,
    true,
    "finalizationTriggered flag set true so re-fire is blocked",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 2-c: Unknown answer is routed to the Skip branch
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-unknown";
  const gitActionCalls = [];
  const pluginContext = createCommitReadyPluginContext({ gitActionCalls });
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
  assert.equal(gitActionCalls.length, 0);
  assert.equal(
    workflowState.get(sessionID).finalizationTriggered,
    true,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Verify 3: duplicate sentinel → .duplicate audit, no re-trigger
// ───────────────────────────────────────────────────────────────────────────
{
  const workflowState = createStubStore();
  const audit = createAudit();
  const sessionID = "session-dup";
  const gitActionCalls = [];
  const pluginContext = createCommitReadyPluginContext({ gitActionCalls });
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
  assert.equal(gitActionCalls.length, 0, "no git execution on duplicate");
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
  const gitActionCalls = [];
  const pluginContext = createCommitReadyPluginContext({ gitActionCalls });
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
    audit.countOf("approval.requested"),
    0,
    "approval.requested NOT emitted on premature",
  );
  assert.equal(gitActionCalls.length, 0);
  assert.equal(
    workflowState.get(sessionID).finalizationTriggered,
    false,
    "finalizationTriggered remains false on premature",
  );
}

console.log("sentinel-finalization-trigger.test.js: PASS");
