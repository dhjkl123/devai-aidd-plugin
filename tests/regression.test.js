import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const legacyModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "policies", "legacy", "devai-git-workflo.js"),
).href;
const wrapperModuleUrl = pathToFileURL(path.join(projectRoot, "src", "index.js")).href;
const workflowStateModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "workflow-state.js"),
).href;
const detectWorkflowContextModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "detect-workflow-context.js"),
).href;
const toolExecuteAfterModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "tool-execute-after.js"),
).href;
const builtModulePath = path.join(projectRoot, "dist", "devai-aidd-guard.js");
const builtModuleUrl = pathToFileURL(builtModulePath).href;
const legacyModulePath = path.join(
  projectRoot,
  "src",
  "policies",
  "legacy",
  "devai-git-workflo.js",
);

function verifyBuiltArtifactExists() {
  assert.equal(
    fs.existsSync(builtModulePath),
    true,
    "missing dist/devai-aidd-guard.js — run `npm run build` before `npm test`",
  );
}

function createTempWorkspace() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-regression-"));
  const commandsDir = path.join(tempRoot, ".opencode", "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(path.join(commandsDir, "bmad-bmm-quick-dev.md"), "# quick dev\n", "utf8");
  return tempRoot;
}

function createMockClient() {
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

function verifyLegacyBootstrapDependencyPath() {
  assert.equal(
    fs.existsSync(legacyModulePath),
    true,
    "restored legacy bootstrap entry is missing at src/policies/legacy/devai-git-workflo.js",
  );
}

function verifyMissingLegacyBootstrapDependencyFails() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-missing-legacy-"));
  const fixtureRoot = path.join(tempRoot, "fixture");
  const fixtureSrc = path.join(fixtureRoot, "src");
  const fixtureLegacyModulePath = path.join(
    fixtureSrc,
    "policies",
    "legacy",
    "devai-git-workflo.js",
  );

  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.cpSync(path.join(projectRoot, "src"), fixtureSrc, { recursive: true });
  fs.rmSync(fixtureLegacyModulePath);

  try {
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(pathToFileURL(path.join(fixtureSrc, "index.js")).href)});`,
      ],
      {
        cwd: fixtureRoot,
        stdio: "pipe",
      },
    );
    assert.fail("bootstrap import should fail when the restored legacy dependency is missing");
  } catch (error) {
    assert.notEqual(error?.status, 0, "missing legacy dependency should cause node import failure");
    const stderr = error?.stderr?.toString?.() || "";
    assert.match(stderr, /ERR_MODULE_NOT_FOUND/, "missing legacy dependency should fail as an import error");
    assert.match(
      stderr,
      /devai-git-workflo\.js/,
      "missing legacy dependency should identify the restored legacy bootstrap path",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function instantiate(pluginFactory, directory) {
  const mock = createMockClient();
  const handlers = await pluginFactory({
    client: mock.client,
    directory,
  });
  return { handlers, mock };
}

async function runCommandExecuteBefore(handlers) {
  const input = {
    command: "/bmad-bmm-quick-dev",
    arguments: "ABC-123 regression coverage",
    sessionID: "session-1",
  };
  const output = { parts: [] };
  await handlers["command.execute.before"](input, output);
  return { input, output };
}

async function runToolReadBefore(handlers) {
  const input = {
    sessionID: "session-1",
    tool: "read",
    args: {},
  };
  const output = { args: {} };
  await handlers["tool.execute.before"](input, output);
}

async function runToolMutatingBefore(handlers) {
  const input = {
    sessionID: "session-1",
    tool: "write",
    args: {},
  };
  const output = { args: {} };
  let error = null;
  try {
    await handlers["tool.execute.before"](input, output);
  } catch (caught) {
    error = caught;
  }
  return error;
}

async function runPermissionAsked(handlers) {
  if (typeof handlers["permission.asked"] !== "function") {
    return undefined;
  }

  return handlers["permission.asked"]({
    sessionID: "session-1",
    tool: "write",
    arguments: {},
  });
}

async function runFileEdited(handlers) {
  if (typeof handlers["file.edited"] !== "function") {
    return undefined;
  }

  return handlers["file.edited"]({
    sessionID: "session-1",
    filePath: "README.md",
  });
}

function summarizePrompt(prompt) {
  return {
    sessionID: prompt.sessionID,
    partCount: Array.isArray(prompt.parts) ? prompt.parts.length : 0,
    firstText: prompt.parts?.[0]?.text || "",
    phase: prompt.parts?.[0]?.metadata?.phase || "",
  };
}

function normalizeOutputParts(parts) {
  return (parts || []).map((part) => ({
    type: part.type,
    text: part.text,
    synthetic: part.synthetic,
    phase: part.metadata?.phase || "",
  }));
}

async function main() {
  verifyLegacyBootstrapDependencyPath();
  verifyBuiltArtifactExists();

  const legacyModule = await import(legacyModuleUrl);
  const wrapperModule = await import(wrapperModuleUrl);
  const builtModule = await import(`${builtModuleUrl}?t=${Date.now()}`);

  const legacyWorkspace = createTempWorkspace();
  const wrapperWorkspace = createTempWorkspace();
  const builtWorkspace = createTempWorkspace();
  try {
    const legacy = await instantiate(legacyModule.DevaiGitWorkflowPlugin, legacyWorkspace);
    const wrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, wrapperWorkspace);
    const built = await instantiate(
      builtModule.DevaiAiddGuardPlugin || builtModule.DevaiGitWorkflowPlugin || builtModule.default,
      builtWorkspace,
    );

    for (const instance of [legacy, wrapper, built]) {
      assert.equal(typeof instance.handlers["command.execute.before"], "function");
      assert.equal(typeof instance.handlers["tool.execute.before"], "function");
      assert.equal(typeof instance.handlers["tool.execute.after"], "function");
      assert.equal(typeof instance.handlers.event, "function");
    }
    for (const instance of [wrapper, built]) {
      assert.equal(typeof instance.handlers["permission.asked"], "function");
      assert.equal(typeof instance.handlers["file.edited"], "function");
    }

    const legacyCommand = await runCommandExecuteBefore(legacy.handlers);
    const wrapperCommand = await runCommandExecuteBefore(wrapper.handlers);
    const builtCommand = await runCommandExecuteBefore(built.handlers);

    assert.deepEqual(
      normalizeOutputParts(wrapperCommand.output.parts),
      normalizeOutputParts(legacyCommand.output.parts),
      "wrapper command.execute.before output differs from legacy",
    );
    assert.deepEqual(
      normalizeOutputParts(builtCommand.output.parts),
      normalizeOutputParts(legacyCommand.output.parts),
      "built command.execute.before output differs from legacy",
    );

    assert.deepEqual(
      wrapper.mock.prompts.map(summarizePrompt),
      legacy.mock.prompts.map(summarizePrompt),
      "wrapper prompts differ from legacy",
    );
    assert.deepEqual(
      built.mock.prompts.map(summarizePrompt),
      legacy.mock.prompts.map(summarizePrompt),
      "built prompts differ from legacy",
    );

    await runToolReadBefore(legacy.handlers);
    await runToolReadBefore(wrapper.handlers);
    await runToolReadBefore(built.handlers);

    const legacyError = await runToolMutatingBefore(legacy.handlers);
    const wrapperError = await runToolMutatingBefore(wrapper.handlers);
    const builtError = await runToolMutatingBefore(built.handlers);

    await runPermissionAsked(wrapper.handlers);
    await runPermissionAsked(built.handlers);

    await runFileEdited(wrapper.handlers);
    await runFileEdited(built.handlers);

    assert.equal(wrapperError?.message, legacyError?.message, "wrapper mutating-tool error differs");
    assert.equal(builtError?.message, legacyError?.message, "built mutating-tool error differs");

    // ── Non-workflow command path ───────────────────────────────────────────
    const freshWrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, wrapperWorkspace);
    const nonWorkflowOutput = { parts: [] };
    await freshWrapper.handlers["command.execute.before"](
      { command: "/non-workflow-command", arguments: "", sessionID: "session-nwf" },
      nonWorkflowOutput,
    );
    assert.equal(
      nonWorkflowOutput.parts.length,
      0,
      "non-workflow command: wrapper must produce zero output parts",
    );
    let nonWorkflowMutatingError = null;
    try {
      await freshWrapper.handlers["tool.execute.before"](
        { sessionID: "session-nwf", tool: "write", args: {} },
        { args: {} },
      );
    } catch (e) {
      nonWorkflowMutatingError = e;
    }
    assert.equal(
      nonWorkflowMutatingError,
      null,
      "non-workflow session: mutating-tool guard must not fire (zero state entries)",
    );
    const nonWorkflowWfLogs = freshWrapper.mock.logs.filter(
      (l) => l.body?.message === "workflow.detected",
    );
    assert.equal(
      nonWorkflowWfLogs.length,
      0,
      "non-workflow command: must emit no workflow.detected audit event",
    );

    // ── Audit payload shape (workflow.detected contract) ───────────────────
    const wfDetectedLogs = wrapper.mock.logs.filter(
      (l) => l.body?.message === "workflow.detected",
    );
    assert.equal(
      wfDetectedLogs.length,
      1,
      "workflow command: wrapper must emit exactly one workflow.detected audit event",
    );
    const auditPayload = wfDetectedLogs[0].body.extra;
    assert.equal(typeof auditPayload.event, "string", "audit payload: event must be string");
    assert.equal(typeof auditPayload.timestamp, "string", "audit payload: timestamp must be string");
    assert.equal(typeof auditPayload.workflow, "string", "audit payload: workflow must be string");
    assert.equal(typeof auditPayload.command, "string", "audit payload: command must be string");
    assert.ok(
      auditPayload.details && typeof auditPayload.details === "object",
      "audit payload: details must be an object",
    );
    assert.equal(
      typeof auditPayload.details.sessionID,
      "string",
      "audit payload details: sessionID must be string",
    );
    assert.equal(
      typeof auditPayload.details.hasArguments,
      "boolean",
      "audit payload details: hasArguments must be boolean",
    );
    assert.equal(
      auditPayload.details.source,
      "command.execute.before",
      "audit payload details: source must be command.execute.before",
    );

    // ── Phase advance idempotency ──────────────────────────────────────────
    // workflow command was already executed → phase is 'start'; first read advances it to 'in-progress'
    const logCountBefore = wrapper.mock.logs.filter(
      (l) => l.body?.message === "workflow.detected",
    ).length;
    await runToolReadBefore(wrapper.handlers);
    const logCountAfter = wrapper.mock.logs.filter(
      (l) => l.body?.message === "workflow.detected",
    ).length;
    assert.equal(
      logCountAfter,
      logCountBefore,
      "phase advance: additional read tool calls must not emit extra workflow.detected events (idempotent)",
    );

    // ── Workflow state contract (unit-style assertions) ────────────────────
    const { createWorkflowStateStore } = await import(workflowStateModuleUrl);
    const { detectWorkflowContext, advancePhaseIfWorkflowSession } = await import(
      detectWorkflowContextModuleUrl
    );

    // sessionID guard: detectWorkflowContext returns null when sessionID is missing
    const noSessionCtx = detectWorkflowContext(
      { command: "/bmad-bmm-quick-dev", arguments: "" },
      new Set(["bmad-bmm-quick-dev"]),
      { detectedAt: "2026-05-08T00:00:00.000Z" },
    );
    assert.equal(
      noSessionCtx,
      null,
      "detectWorkflowContext must return null when sessionID is absent",
    );

    // detectedAt is injected by the caller (pure function contract)
    const fixedAt = "2026-05-08T12:34:56.000Z";
    const detectedCtx = detectWorkflowContext(
      { command: "/bmad-bmm-quick-dev", arguments: "X", sessionID: "s-unit" },
      new Set(["bmad-bmm-quick-dev"]),
      { detectedAt: fixedAt },
    );
    assert.equal(detectedCtx?.commandName, "bmad-bmm-quick-dev");
    assert.equal(detectedCtx?.phase, "start");
    assert.equal(
      detectedCtx?.detectedAt,
      fixedAt,
      "detectedAt must be the value injected by the caller",
    );

    // workflow-state phase transition + idempotency
    const store = createWorkflowStateStore();
    store.set("s-unit", detectedCtx);
    assert.equal(store.get("s-unit")?.phase, "start");
    advancePhaseIfWorkflowSession(store, "s-unit", "in-progress");
    assert.equal(
      store.get("s-unit")?.phase,
      "in-progress",
      "advancePhaseIfWorkflowSession must transition start → in-progress",
    );
    advancePhaseIfWorkflowSession(store, "s-unit", "in-progress");
    assert.equal(
      store.get("s-unit")?.phase,
      "in-progress",
      "second advance must remain at in-progress (idempotent)",
    );

    // unknown / missing sessionID: no-op without errors
    advancePhaseIfWorkflowSession(store, "unknown-session", "in-progress");
    assert.equal(store.get("unknown-session"), undefined);
    advancePhaseIfWorkflowSession(store, undefined, "in-progress");

    // get() returns a copy — external mutations must not leak back
    const snapshot = store.get("s-unit");
    snapshot.phase = "tampered";
    assert.equal(
      store.get("s-unit")?.phase,
      "in-progress",
      "get must return a copy so external mutations do not leak into the store",
    );

    // clear removes the entry
    store.clear("s-unit");
    assert.equal(store.get("s-unit"), undefined, "clear must remove the entry");

    // ── tool.execute.after path advances phase via wrapper hook ────────────
    const afterWrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, wrapperWorkspace);
    const afterCmdOutput = { parts: [] };
    await afterWrapper.handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "", sessionID: "s-after" },
      afterCmdOutput,
    );
    const afterLogsBefore = afterWrapper.mock.logs.filter(
      (l) => l.body?.message === "workflow.detected",
    ).length;
    await afterWrapper.handlers["tool.execute.after"](
      { sessionID: "s-after", tool: "read", args: {} },
      { args: {} },
    );
    const afterLogsAfter = afterWrapper.mock.logs.filter(
      (l) => l.body?.message === "workflow.detected",
    ).length;
    assert.equal(
      afterLogsAfter,
      afterLogsBefore,
      "tool.execute.after: must not emit additional workflow.detected events",
    );

    // ── tool.execute.after wrapper directly advances phase (factory-level) ──
    // Exercises the wrapper hook factory against an inspectable workflowState so
    // we can directly assert phase === "in-progress" after the after-hook runs,
    // closing the gap left by the bootstrap-level test above.
    const { createToolExecuteAfterHook } = await import(toolExecuteAfterModuleUrl);
    const afterDirectStore = createWorkflowStateStore();
    afterDirectStore.set("s-after-direct", {
      commandName: "bmad-bmm-quick-dev",
      arguments: "",
      sessionID: "s-after-direct",
      detectedAt: "2026-05-08T00:00:00.000Z",
      phase: "start",
    });
    const afterDirectHook = createToolExecuteAfterHook({}, { workflowState: afterDirectStore });
    await afterDirectHook(
      { sessionID: "s-after-direct", tool: "read", args: {} },
      { args: {} },
    );
    assert.equal(
      afterDirectStore.get("s-after-direct")?.phase,
      "in-progress",
      "tool.execute.after wrapper must advance phase from start to in-progress",
    );

    // ── Re-detection on same sessionID resets state and re-emits audit ─────
    const reWrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, wrapperWorkspace);
    await reWrapper.handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "first", sessionID: "s-re" },
      { parts: [] },
    );
    await reWrapper.handlers["tool.execute.before"](
      { sessionID: "s-re", tool: "read", args: {} },
      { args: {} },
    );
    const reFirstAuditCount = reWrapper.mock.logs.filter(
      (l) => l.body?.message === "workflow.detected",
    ).length;
    assert.equal(
      reFirstAuditCount,
      1,
      "first invocation: exactly one workflow.detected audit event",
    );
    await reWrapper.handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "second", sessionID: "s-re" },
      { parts: [] },
    );
    const reSecondAuditCount = reWrapper.mock.logs.filter(
      (l) => l.body?.message === "workflow.detected",
    ).length;
    assert.equal(
      reSecondAuditCount,
      2,
      "re-invocation on same sessionID: must emit a second workflow.detected audit event (intentional state reset)",
    );

    // Unit-level: store.set on existing sessionID resets phase back to "start"
    const resetStore = createWorkflowStateStore();
    resetStore.set("s-reset", {
      commandName: "x",
      arguments: "",
      sessionID: "s-reset",
      detectedAt: "2026-05-08T00:00:00.000Z",
      phase: "start",
    });
    advancePhaseIfWorkflowSession(resetStore, "s-reset", "in-progress");
    assert.equal(resetStore.get("s-reset")?.phase, "in-progress");
    resetStore.set("s-reset", {
      commandName: "x",
      arguments: "",
      sessionID: "s-reset",
      detectedAt: "2026-05-08T00:00:00.000Z",
      phase: "start",
    });
    assert.equal(
      resetStore.get("s-reset")?.phase,
      "start",
      "set on existing sessionID must reset phase (overwrites prior context)",
    );

    // ── advancePhase rejects invalid phase values (typo guard) ─────────────
    const phaseGuardStore = createWorkflowStateStore();
    phaseGuardStore.set("s-guard", {
      commandName: "x",
      arguments: "",
      sessionID: "s-guard",
      detectedAt: "2026-05-08T00:00:00.000Z",
      phase: "start",
    });
    assert.throws(
      () => phaseGuardStore.advancePhase("s-guard", "in_progress"),
      /Invalid workflow phase/,
      "advancePhase must reject phase values outside WORKFLOW_PHASES (catches typos like 'in_progress')",
    );
    assert.equal(
      phaseGuardStore.get("s-guard")?.phase,
      "start",
      "rejected advancePhase call must not mutate stored phase",
    );

    // ── session.deleted clears state — subsequent tool events do not throw ──
    const delWrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, wrapperWorkspace);
    const delCmdOutput = { parts: [] };
    await delWrapper.handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "", sessionID: "s-deleted" },
      delCmdOutput,
    );
    await delWrapper.handlers.event({
      event: { type: "session.deleted", properties: { sessionID: "s-deleted" } },
    });
    let postDeleteError = null;
    try {
      await delWrapper.handlers["tool.execute.before"](
        { sessionID: "s-deleted", tool: "write", args: {} },
        { args: {} },
      );
    } catch (e) {
      postDeleteError = e;
    }
    assert.equal(
      postDeleteError,
      null,
      "session.deleted: state must be cleared so later mutating-tool calls do not trigger the legacy guard",
    );

    // ── Legacy parity still holds after refactor ───────────────────────────
    const legacyNonWorkflowOutput = { parts: [] };
    await legacy.handlers["command.execute.before"](
      { command: "/non-workflow-command", arguments: "", sessionID: "session-nwf-legacy" },
      legacyNonWorkflowOutput,
    );
    assert.equal(
      legacyNonWorkflowOutput.parts.length,
      0,
      "legacy non-workflow command must also produce zero output parts",
    );

    const result = {
      status: "passed",
      compared: ["legacy-vs-wrapper", "legacy-vs-built"],
      prompts: legacy.mock.prompts.map(summarizePrompt),
      mutatingToolError: legacyError?.message || "",
      wrapperLogs: wrapper.mock.logs.length,
      builtLogs: built.mock.logs.length,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    fs.rmSync(legacyWorkspace, { recursive: true, force: true });
    fs.rmSync(wrapperWorkspace, { recursive: true, force: true });
    fs.rmSync(builtWorkspace, { recursive: true, force: true });
  }
}

async function verifyBootstrapFailureShape() {
  const wrapperModule = await import(`${wrapperModuleUrl}?invalid=${Date.now()}`);
  let error = null;

  try {
    await wrapperModule.DevaiAiddGuardPlugin({
      client: {
        app: {
          async log() {},
        },
      },
      directory: "",
    });
  } catch (caught) {
    error = caught;
  }

  assert.ok(error, "bootstrap should fail for invalid environment");
  assert.match(
    error.message,
    /Supported runtime: Node\.js ESM plugin runtime \(Node 22 target\)\./,
    "bootstrap failure should explain supported runtime",
  );
}

main()
  .then(() => verifyBootstrapFailureShape())
  .then(() => verifyMissingLegacyBootstrapDependencyFails())
  .catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });
