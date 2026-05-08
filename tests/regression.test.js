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
const commandExecuteBeforeModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "command-execute-before.js"),
).href;
const toolExecuteAfterModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "tool-execute-after.js"),
).href;
const loadConfigModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "config", "load-config.js"),
).href;
const resolveWorkflowPolicyModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "resolve-workflow-policy.js"),
).href;
const branchServiceModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "branch-service.js"),
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
  fs.writeFileSync(path.join(commandsDir, "bmad-bmm-create-prd.md"), "# create prd\n", "utf8");
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

/**
 * Story 1.3: Verify config merge precedence.
 * - Project config values override global config values.
 * - Legacy files are read when no modern project file exists.
 */
async function verifyConfigMergePrecedence() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?v=${Date.now()}`);

  // Create a sandboxed temp workspace with both global and project configs
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-merge-"));
  const globalConfigDir = path.join(tempRoot, "global-home", ".config", "opencode");
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  const legacyProjectDir = path.join(tempRoot, "legacy", ".opencode");
  fs.mkdirSync(globalConfigDir, { recursive: true });
  fs.mkdirSync(projectConfigDir, { recursive: true });
  fs.mkdirSync(legacyProjectDir, { recursive: true });

  try {
    // Write global config with a known defaultType
    fs.writeFileSync(
      path.join(globalConfigDir, "devai-aidd-guard.global.jsonc"),
      JSON.stringify({ branch: { defaultType: "docs" } }),
      "utf8",
    );

    // Write project config that overrides defaultType
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-guard.project.jsonc"),
      JSON.stringify({ branch: { defaultType: "feat" } }),
      "utf8",
    );

    // Test 1: project overrides global
    const fakeHomedir = path.join(tempRoot, "global-home");
    const fsAdapter = {
      existsSync: fs.existsSync.bind(fs),
      readFileSync: fs.readFileSync.bind(fs),
      readdirSync: fs.readdirSync.bind(fs),
      mkdirSync: fs.mkdirSync.bind(fs),
      writeFileSync: fs.writeFileSync.bind(fs),
      dirname: path.dirname.bind(path),
      homedir: () => fakeHomedir,
    };

    const projectDir = path.join(tempRoot, "project");
    const result1 = loadRuntimeConfig(projectDir, fsAdapter);
    assert.equal(
      result1.config.branch.defaultType,
      "feat",
      "verifyConfigMergePrecedence: project config must override global config",
    );
    assert.equal(
      result1.sources.hasProjectConfig,
      true,
      "verifyConfigMergePrecedence: hasProjectConfig must be true",
    );
    assert.equal(
      result1.sources.hasGlobalConfig,
      true,
      "verifyConfigMergePrecedence: hasGlobalConfig must be true",
    );

    // Test 2: legacy files are read when no modern project config
    const legacyDir = path.join(tempRoot, "legacy");
    fs.writeFileSync(
      path.join(legacyProjectDir, "opencode-aidd-plugin.json"),
      JSON.stringify({ branch: { defaultType: "refactor" } }),
      "utf8",
    );
    const result2 = loadRuntimeConfig(legacyDir, fsAdapter);
    assert.equal(
      result2.config.branch.defaultType,
      "refactor",
      "verifyConfigMergePrecedence: legacy project config must be read when no modern project file",
    );
    assert.equal(
      result2.sources.hasLegacyProjectConfig,
      true,
      "verifyConfigMergePrecedence: hasLegacyProjectConfig must be true when legacy file present",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 1.3: Verify validation fallback behavior.
 * - Invalid project config is dropped; effective config uses the lower layer.
 * - validation.droppedLayers includes "projectConfig".
 * - validation.errors is non-empty.
 */
async function verifyValidationFallback() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?v2=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-fallback-"));
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    // Write an intentionally invalid project config: branch.longLivedBranches must be array, not integer
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-guard.project.jsonc"),
      JSON.stringify({ branch: { longLivedBranches: 42 } }),
      "utf8",
    );

    const fakeHomedir = path.join(tempRoot, "no-home");
    const fsAdapter = {
      existsSync: fs.existsSync.bind(fs),
      readFileSync: fs.readFileSync.bind(fs),
      readdirSync: fs.readdirSync.bind(fs),
      mkdirSync: fs.mkdirSync.bind(fs),
      writeFileSync: fs.writeFileSync.bind(fs),
      dirname: path.dirname.bind(path),
      homedir: () => fakeHomedir,
    };

    const projectDir = path.join(tempRoot, "project");
    const result = loadRuntimeConfig(projectDir, fsAdapter);

    // (a) Effective config must use lower layer (defaults), so longLivedBranches is an array
    assert.ok(
      Array.isArray(result.config.branch.longLivedBranches),
      "verifyValidationFallback: effective config must use valid lower layer (longLivedBranches must be array)",
    );

    // (b) droppedLayers must include "projectConfig"
    assert.ok(
      result.validation.droppedLayers.includes("projectConfig"),
      "verifyValidationFallback: droppedLayers must include 'projectConfig' when project config is invalid",
    );

    // (c) errors must be non-empty
    assert.ok(
      result.validation.errors.length > 0,
      "verifyValidationFallback: validation.errors must be non-empty when project config is invalid",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 1.3 (AI-4): Verify validation fallback when an invalid LOWER layer
 * (globalConfig) coexists with a valid UPPER layer (projectConfig).
 *
 * Regression target: prior `validateAndRecover` algorithm dropped from the
 * highest priority down on every failure, which incorrectly destroyed the
 * valid `projectConfig` whenever `globalConfig` was malformed. The redesigned
 * algorithm validates each layer incrementally, so only `globalConfig` is
 * dropped and `projectConfig` overrides survive.
 */
async function verifyValidationFallbackLowerLayer() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?v3=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-fallback-lower-"));
  const globalConfigDir = path.join(tempRoot, "global-home", ".config", "opencode");
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(globalConfigDir, { recursive: true });
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    // Invalid global config: longLivedBranches must be an array, not an integer.
    fs.writeFileSync(
      path.join(globalConfigDir, "devai-aidd-guard.global.jsonc"),
      JSON.stringify({ branch: { longLivedBranches: 99, defaultType: "docs" } }),
      "utf8",
    );
    // Valid project config that overrides defaultType to "feat".
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-guard.project.jsonc"),
      JSON.stringify({ branch: { defaultType: "feat" } }),
      "utf8",
    );

    const fakeHomedir = path.join(tempRoot, "global-home");
    const fsAdapter = {
      existsSync: fs.existsSync.bind(fs),
      readFileSync: fs.readFileSync.bind(fs),
      readdirSync: fs.readdirSync.bind(fs),
      mkdirSync: fs.mkdirSync.bind(fs),
      writeFileSync: fs.writeFileSync.bind(fs),
      dirname: path.dirname.bind(path),
      homedir: () => fakeHomedir,
    };

    const projectDir = path.join(tempRoot, "project");
    const result = loadRuntimeConfig(projectDir, fsAdapter);

    // (a) projectConfig must NOT be in droppedLayers — its value must survive.
    assert.equal(
      result.validation.droppedLayers.includes("projectConfig"),
      false,
      "verifyValidationFallbackLowerLayer: projectConfig must NOT be dropped when only globalConfig is invalid",
    );

    // (b) globalConfig must be the dropped layer.
    assert.ok(
      result.validation.droppedLayers.includes("globalConfig"),
      "verifyValidationFallbackLowerLayer: globalConfig must be dropped when its branch.longLivedBranches is invalid",
    );

    // (c) Effective config must reflect the valid project override.
    assert.equal(
      result.config.branch.defaultType,
      "feat",
      "verifyValidationFallbackLowerLayer: project override (defaultType=feat) must survive after globalConfig is dropped",
    );

    // (d) longLivedBranches must come from defaults (not the invalid global).
    assert.ok(
      Array.isArray(result.config.branch.longLivedBranches),
      "verifyValidationFallbackLowerLayer: effective longLivedBranches must remain a valid array",
    );

    // (e) errors must be tagged with the offending layer name.
    const errorLayers = result.validation.errors
      .map((err) => (err && err.params && err.params.layer) || null)
      .filter(Boolean);
    assert.ok(
      errorLayers.includes("globalConfig"),
      "verifyValidationFallbackLowerLayer: error entries must be tagged with params.layer === 'globalConfig'",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 1.3 (AI-2): Verify that JSONC parse failures surface through the
 * validation pipeline instead of being silently dropped.
 */
async function verifyParseFailureSurfacing() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?v4=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-parse-"));
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    // Write a syntactically broken JSON file.
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-guard.project.jsonc"),
      "{ this is not valid JSON",
      "utf8",
    );

    const fakeHomedir = path.join(tempRoot, "no-home");
    const fsAdapter = {
      existsSync: fs.existsSync.bind(fs),
      readFileSync: fs.readFileSync.bind(fs),
      readdirSync: fs.readdirSync.bind(fs),
      mkdirSync: fs.mkdirSync.bind(fs),
      writeFileSync: fs.writeFileSync.bind(fs),
      dirname: path.dirname.bind(path),
      homedir: () => fakeHomedir,
    };

    const projectDir = path.join(tempRoot, "project");
    const result = loadRuntimeConfig(projectDir, fsAdapter);

    assert.equal(
      result.validation.valid,
      false,
      "verifyParseFailureSurfacing: validation.valid must be false on parse failure",
    );
    const parseErrorEntry = result.validation.errors.find(
      (err) => err && err.params && err.params.source === "parseJsonc",
    );
    assert.ok(
      parseErrorEntry,
      "verifyParseFailureSurfacing: parse error must be present in validation.errors with params.source === 'parseJsonc'",
    );
    assert.equal(
      parseErrorEntry.params.layer,
      "projectConfig",
      "verifyParseFailureSurfacing: parse error must be tagged with the layer name",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 1.3 (AI-3): Verify forward-compat: unknown additionalProperties on
 * extension-prone sections (branch, audit, workflowPolicy[command]) must NOT
 * cause the layer to be dropped.
 */
async function verifyForwardCompatExtensionKeys() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?v5=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-forward-"));
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-guard.project.jsonc"),
      JSON.stringify({
        branch: { defaultType: "feat", futureField: "preview" },
        audit: { enabled: true, futureTransport: "kafka" },
      }),
      "utf8",
    );

    const fakeHomedir = path.join(tempRoot, "no-home");
    const fsAdapter = {
      existsSync: fs.existsSync.bind(fs),
      readFileSync: fs.readFileSync.bind(fs),
      readdirSync: fs.readdirSync.bind(fs),
      mkdirSync: fs.mkdirSync.bind(fs),
      writeFileSync: fs.writeFileSync.bind(fs),
      dirname: path.dirname.bind(path),
      homedir: () => fakeHomedir,
    };

    const projectDir = path.join(tempRoot, "project");
    const result = loadRuntimeConfig(projectDir, fsAdapter);

    assert.equal(
      result.validation.droppedLayers.length,
      0,
      "verifyForwardCompatExtensionKeys: projectConfig with future fields must NOT be dropped",
    );
    assert.equal(
      result.config.branch.defaultType,
      "feat",
      "verifyForwardCompatExtensionKeys: projectConfig override must apply",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 1.3 (AI-5): Verify schemaVersion is enforced via const so a wrong
 * version explicitly fails validation rather than silently passing.
 */
async function verifySchemaVersionEnforcement() {
  const { validateRuntimeConfig, RUNTIME_CONFIG_SCHEMA_VERSION } = await import(
    `${pathToFileURL(path.join(projectRoot, "src", "config", "validate-config.js")).href}?v=${Date.now()}`
  );
  const { DEFAULT_PLUGIN_CONFIG } = await import(
    pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href
  );

  // Sanity: defaults pass.
  const defaultsResult = validateRuntimeConfig(DEFAULT_PLUGIN_CONFIG);
  assert.equal(
    defaultsResult.valid,
    true,
    "verifySchemaVersionEnforcement: DEFAULT_PLUGIN_CONFIG must validate without schemaVersion",
  );

  // Correct version passes.
  const okResult = validateRuntimeConfig({
    ...DEFAULT_PLUGIN_CONFIG,
    schemaVersion: RUNTIME_CONFIG_SCHEMA_VERSION,
  });
  assert.equal(
    okResult.valid,
    true,
    "verifySchemaVersionEnforcement: correct schemaVersion must validate",
  );

  // Wrong version fails.
  const badResult = validateRuntimeConfig({
    ...DEFAULT_PLUGIN_CONFIG,
    schemaVersion: 999,
  });
  assert.equal(
    badResult.valid,
    false,
    "verifySchemaVersionEnforcement: schemaVersion=999 must fail validation",
  );
  assert.ok(
    badResult.errors.some(
      (err) => err.instancePath === "/schemaVersion" || (err.params && err.params.allowedValue !== undefined),
    ),
    "verifySchemaVersionEnforcement: errors must reference /schemaVersion",
  );
}

/**
 * Story 1.3: Verify resolveWorkflowPolicy behavior.
 * - Matched command → outcome: "allow", policy keys present
 * - Unmatched command → outcome: "ask", fallback policy shape
 * - null context → outcome: "skip"
 */
async function verifyResolveWorkflowPolicy() {
  const { resolveWorkflowPolicy } = await import(resolveWorkflowPolicyModuleUrl);
  const { DEFAULT_PLUGIN_CONFIG } = await import(
    pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href
  );

  // Case 1: matched command
  const matchedContext = {
    commandName: "bmad-bmm-dev-story",
    arguments: "",
    sessionID: "s-policy-test",
    detectedAt: "2026-05-08T00:00:00.000Z",
    phase: "start",
  };
  const matchedResult = resolveWorkflowPolicy(matchedContext, DEFAULT_PLUGIN_CONFIG);
  assert.equal(
    matchedResult.outcome,
    "allow",
    "verifyResolveWorkflowPolicy: matched command must resolve to outcome 'allow'",
  );
  assert.ok(
    matchedResult.details && matchedResult.details.policy,
    "verifyResolveWorkflowPolicy: matched result must have details.policy",
  );
  assert.ok(
    typeof matchedResult.details.policy.category === "string",
    "verifyResolveWorkflowPolicy: matched policy must have category",
  );
  assert.ok(
    typeof matchedResult.details.policy.identityStrategy === "string",
    "verifyResolveWorkflowPolicy: matched policy must have identityStrategy",
  );
  assert.ok(
    typeof matchedResult.details.policy.branchRequired === "boolean",
    "verifyResolveWorkflowPolicy: matched policy must have branchRequired",
  );
  assert.ok(
    typeof matchedResult.details.policy.finalization === "string",
    "verifyResolveWorkflowPolicy: matched policy must have finalization",
  );
  assert.ok(
    matchedResult.details.branch,
    "verifyResolveWorkflowPolicy: matched result must have details.branch",
  );

  // Case 2: unmatched command
  const unmatchedContext = {
    commandName: "bmad-bmm-something-new",
    arguments: "",
    sessionID: "s-policy-test-2",
    detectedAt: "2026-05-08T00:00:00.000Z",
    phase: "start",
  };
  const unmatchedResult = resolveWorkflowPolicy(unmatchedContext, DEFAULT_PLUGIN_CONFIG);
  assert.equal(
    unmatchedResult.outcome,
    "ask",
    "verifyResolveWorkflowPolicy: unmatched command must resolve to outcome 'ask'",
  );
  assert.ok(
    unmatchedResult.details && unmatchedResult.details.fallback,
    "verifyResolveWorkflowPolicy: unmatched result must have details.fallback",
  );
  assert.equal(
    typeof unmatchedResult.details.fallback.category,
    "string",
    "verifyResolveWorkflowPolicy: fallback policy must have category",
  );

  // Case 3: null context
  const nullResult = resolveWorkflowPolicy(null, DEFAULT_PLUGIN_CONFIG);
  assert.equal(
    nullResult.outcome,
    "skip",
    "verifyResolveWorkflowPolicy: null context must resolve to outcome 'skip'",
  );
  assert.equal(
    nullResult.details.commandName,
    null,
    "verifyResolveWorkflowPolicy: null context must have details.commandName === null",
  );
}

async function verifyBranchServiceContracts() {
  const branchService = await import(`${branchServiceModuleUrl}?v=${Date.now()}`);
  const { DEFAULT_PLUGIN_CONFIG } = await import(
    pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href
  );

  assert.equal(
    branchService.slugifyArguments("Regression Coverage", { fallback: "workflow" }),
    "regression-coverage",
    "verifyBranchServiceContracts: slugifyArguments must normalize spaces and case",
  );
  assert.equal(
    branchService.slugifyArguments("", { fallback: "bmad-bmm-quick-dev" }),
    "bmad-bmm-quick-dev",
    "verifyBranchServiceContracts: slugifyArguments must fall back when slug is empty",
  );
  assert.equal(
    branchService.extractTicketToken("ABC-123 cleanup", { fallbackTicket: "no-ticket" }),
    "ABC-123",
    "verifyBranchServiceContracts: extractTicketToken must return the first uppercase ticket match",
  );
  assert.equal(
    branchService.extractTicketToken("cleanup only", { fallbackTicket: "no-ticket" }),
    "no-ticket",
    "verifyBranchServiceContracts: extractTicketToken must fall back when no ticket is present",
  );

  const workflowContext = {
    commandName: "bmad-bmm-quick-dev",
    arguments: "ABC-123 regression coverage",
    sessionID: "branch-service-1",
    detectedAt: "2026-05-08T00:00:00.000Z",
    phase: "start",
  };
  const workflowPolicy = DEFAULT_PLUGIN_CONFIG.workflowPolicy["bmad-bmm-quick-dev"];
  const candidate = branchService.computeCandidateBranchName({
    workflowContext,
    workflowPolicy,
    branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
  });
  assert.equal(
    candidate,
    "feat/ABC-123-regression-coverage",
    "verifyBranchServiceContracts: quick-dev candidate branch name must use type, ticket, and slug",
  );

  const fallbackCandidate = branchService.computeCandidateBranchName({
    workflowContext: {
      ...workflowContext,
      arguments: "",
    },
    workflowPolicy,
    branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
  });
  assert.equal(
    fallbackCandidate,
    "feat/no-ticket-bmad-bmm-quick-dev",
    "verifyBranchServiceContracts: empty args must fall back to no-ticket + normalized command slug",
  );

  const defaultTypeCandidate = branchService.computeCandidateBranchName({
    workflowContext: {
      ...workflowContext,
      commandName: "bmad-bmm-unknown",
      arguments: "ABC-123 docs refresh",
    },
    workflowPolicy,
    branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
  });
  assert.equal(
    defaultTypeCandidate,
    "chore/ABC-123-docs-refresh",
    "verifyBranchServiceContracts: unknown command must fall back to branch.defaultType",
  );

  const requiredStrategy = branchService.evaluateBranchStrategy({
    workflowContext,
    workflowPolicy,
    branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
    currentBranch: "main",
  });
  assert.equal(
    requiredStrategy.requirement,
    "required",
    "verifyBranchServiceContracts: branchRequired=true must map to requirement=required",
  );
  assert.equal(
    requiredStrategy.isLongLived,
    true,
    "verifyBranchServiceContracts: main must be treated as long-lived",
  );

  const planningStrategy = branchService.evaluateBranchStrategy({
    workflowContext: {
      ...workflowContext,
      commandName: "bmad-bmm-create-prd",
    },
    workflowPolicy: DEFAULT_PLUGIN_CONFIG.workflowPolicy["bmad-bmm-create-prd"],
    branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
    currentBranch: "docs/ABC-123-prd",
  });
  assert.equal(
    planningStrategy.requirement,
    "unnecessary",
    "verifyBranchServiceContracts: planning workflows with branchRequired=false must be unnecessary",
  );

  const createProposal = branchService.buildBranchProposal({
    strategy: requiredStrategy,
    candidateName: candidate,
    currentBranch: "main",
  });
  assert.equal(
    createProposal?.action,
    "create",
    "verifyBranchServiceContracts: long-lived current branch must trigger create proposal",
  );

  const switchProposal = branchService.buildBranchProposal({
    strategy: branchService.evaluateBranchStrategy({
      workflowContext,
      workflowPolicy,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      currentBranch: "feat/ABC-999-other-work",
    }),
    candidateName: candidate,
    currentBranch: "feat/ABC-999-other-work",
  });
  assert.equal(
    switchProposal?.action,
    "switch",
    "verifyBranchServiceContracts: mismatched non-long-lived branch must trigger switch proposal",
  );

  const invalidRegexDetailed = branchService.computeCandidateBranchNameDetailed({
    workflowContext,
    workflowPolicy,
    branchConfig: {
      ...DEFAULT_PLUGIN_CONFIG.branch,
      validationRegex: "[",
    },
  });
  assert.equal(
    invalidRegexDetailed.valid,
    false,
    "verifyBranchServiceContracts: invalid validationRegex must degrade to a failed candidate instead of throwing",
  );
  assert.equal(
    invalidRegexDetailed.reason,
    "candidate-failed-validation",
    "verifyBranchServiceContracts: invalid validationRegex must surface candidate-failed-validation",
  );
}

async function verifyBranchProposalIntegration() {
  const [{ createWorkflowStateStore }, commandBeforeModule, branchService, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?branch=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?branch=${Date.now()}`),
      import(`${branchServiceModuleUrl}?branch=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const workflowState = createWorkflowStateStore();
  const logs = [];
  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    {
      "command.execute.before": async () => {},
    },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev", "bmad-bmm-create-prd"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        resolvePolicy(workflowContext) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[workflowContext.commandName];
          if (!policy) {
            return { outcome: "ask", details: { fallback: {} } };
          }
          return {
            outcome: "allow",
            details: {
              policy,
            },
          };
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  await hook(
    {
      command: "/bmad-bmm-quick-dev",
      arguments: "ABC-123 regression coverage",
      sessionID: "branch-integration-1",
    },
    { parts: [] },
  );

  const stateAfterQuickDev = workflowState.get("branch-integration-1");
  assert.deepEqual(
    stateAfterQuickDev?.branchProposal,
    {
      kind: "branch",
      action: "create",
      name: "feat/ABC-123-regression-coverage",
      reason: "no-current-branch",
      current: null,
      policyMatch: {
        commandName: "bmad-bmm-quick-dev",
        category: "implementation",
        identityStrategy: "ticket-or-args",
        branchRequired: true,
        finalization: "commit-and-push",
      },
    },
    "verifyBranchProposalIntegration: quick-dev must stash create proposal in workflow state",
  );

  const plannedLog = logs.find((entry) => entry.message === "git.action.planned");
  assert.ok(plannedLog, "verifyBranchProposalIntegration: git.action.planned audit must be emitted");
  assert.equal(
    plannedLog.extra.details.name,
    "feat/ABC-123-regression-coverage",
    "verifyBranchProposalIntegration: audit payload must include candidate branch name",
  );

  await hook(
    {
      command: "/bmad-bmm-quick-dev",
      arguments: "ABC-123 regression coverage",
      currentBranch: "feat/ABC-999-other-work",
      sessionID: "branch-integration-switch",
    },
    { parts: [] },
  );
  assert.deepEqual(
    workflowState.get("branch-integration-switch")?.branchProposal,
    {
      kind: "branch",
      action: "switch",
      name: "feat/ABC-123-regression-coverage",
      reason: "candidate-differs-from-current",
      current: "feat/ABC-999-other-work",
      policyMatch: {
        commandName: "bmad-bmm-quick-dev",
        category: "implementation",
        identityStrategy: "ticket-or-args",
        branchRequired: true,
        finalization: "commit-and-push",
      },
    },
    "verifyBranchProposalIntegration: hook must preserve an injected currentBranch and produce a switch proposal when it mismatches",
  );

  await hook(
    {
      command: "/bmad-bmm-quick-dev",
      arguments: "ABC-123 regression coverage",
      currentBranch: "main",
      sessionID: "branch-integration-long-lived",
    },
    { parts: [] },
  );
  assert.equal(
    workflowState.get("branch-integration-long-lived")?.branchProposal?.action,
    "create",
    "verifyBranchProposalIntegration: hook must treat an injected long-lived currentBranch as a create proposal",
  );

  await hook(
    {
      command: "/bmad-bmm-create-prd",
      arguments: "",
      sessionID: "branch-integration-2",
    },
    { parts: [] },
  );
  assert.equal(
    workflowState.get("branch-integration-2")?.branchProposal,
    undefined,
    "verifyBranchProposalIntegration: planning workflow must not stash a branch proposal",
  );

  await hook(
    {
      command: "/non-workflow-command",
      arguments: "",
      sessionID: "branch-integration-3",
    },
    { parts: [] },
  );
  assert.equal(
    workflowState.get("branch-integration-3"),
    undefined,
    "verifyBranchProposalIntegration: non-workflow commands must not create workflow state",
  );

  const gitPlannedCount = logs.filter((entry) => entry.message === "git.action.planned").length;
  assert.equal(
    gitPlannedCount,
    3,
    "verifyBranchProposalIntegration: each implementation workflow run with a proposal must emit git.action.planned",
  );

  const directDetailed = branchService.computeCandidateBranchNameDetailed({
    workflowContext: {
      commandName: "bmad-bmm-quick-dev",
      arguments: "bad slug ###",
      sessionID: "branch-integration-4",
      detectedAt: "2026-05-08T00:00:00.000Z",
      phase: "start",
    },
    workflowPolicy: DEFAULT_PLUGIN_CONFIG.workflowPolicy["bmad-bmm-quick-dev"],
    branchConfig: {
      ...DEFAULT_PLUGIN_CONFIG.branch,
      validationRegex: "^feat\\/[A-Z]+-\\d+-must-fail$",
    },
  });
  assert.equal(
    directDetailed.valid,
    false,
    "verifyBranchProposalIntegration: detailed candidate API must expose validation failure",
  );
  assert.equal(
    directDetailed.reason,
    "candidate-failed-validation",
    "verifyBranchProposalIntegration: failed detailed candidate must carry candidate-failed-validation reason",
  );
}

async function verifyInvalidBranchRegexValidation() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?invalid-branch-regex=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-invalid-branch-regex-"));
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-guard.project.jsonc"),
      JSON.stringify({ branch: { validationRegex: "[" } }),
      "utf8",
    );

    const fakeHomedir = path.join(tempRoot, "no-home");
    const fsAdapter = {
      existsSync: fs.existsSync.bind(fs),
      readFileSync: fs.readFileSync.bind(fs),
      readdirSync: fs.readdirSync.bind(fs),
      mkdirSync: fs.mkdirSync.bind(fs),
      writeFileSync: fs.writeFileSync.bind(fs),
      dirname: path.dirname.bind(path),
      homedir: () => fakeHomedir,
    };

    const result = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    assert.equal(
      result.validation.droppedLayers.includes("projectConfig"),
      true,
      "verifyInvalidBranchRegexValidation: invalid branch.validationRegex must cause the project layer to be dropped",
    );
    assert.ok(
      result.validation.errors.some(
        (err) => err.instancePath === "/branch/validationRegex" && err.params?.reason === "invalid-regex",
      ),
      "verifyInvalidBranchRegexValidation: validation errors must identify /branch/validationRegex as invalid-regex",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 1.3: Verify config.validation.failed audit payload shape.
 * When an invalid project config layer is provided, the wrapper must emit
 * a config.validation.failed audit entry with event, timestamp, and details keys.
 */
async function verifyConfigValidationFailedAuditPayload() {
  const wrapperModule = await import(`${wrapperModuleUrl}?vf=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-auditfail-"));
  const projectConfigDir = path.join(tempRoot, ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });
  const commandsDir = path.join(tempRoot, ".opencode", "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(path.join(commandsDir, "bmad-bmm-quick-dev.md"), "# quick dev\n", "utf8");

  // Write invalid project config to trigger validation failure
  fs.writeFileSync(
    path.join(projectConfigDir, "devai-aidd-guard.project.jsonc"),
    JSON.stringify({ branch: { longLivedBranches: 99 } }),
    "utf8",
  );

  try {
    const mock = createMockClient();
    await wrapperModule.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });

    const validationFailedLogs = mock.logs.filter(
      (l) => l.body?.message === "config.validation.failed",
    );
    assert.equal(
      validationFailedLogs.length,
      1,
      "verifyConfigValidationFailedAuditPayload: must emit exactly one config.validation.failed audit event",
    );
    const payload = validationFailedLogs[0].body.extra;
    assert.equal(
      typeof payload.event,
      "string",
      "verifyConfigValidationFailedAuditPayload: audit payload must have 'event' string",
    );
    assert.equal(
      payload.event,
      "config.validation.failed",
      "verifyConfigValidationFailedAuditPayload: event must equal 'config.validation.failed'",
    );
    assert.equal(
      typeof payload.timestamp,
      "string",
      "verifyConfigValidationFailedAuditPayload: audit payload must have 'timestamp' string",
    );
    assert.ok(
      payload.details && typeof payload.details === "object",
      "verifyConfigValidationFailedAuditPayload: audit payload must have 'details' object",
    );
    assert.ok(
      Array.isArray(payload.details.droppedLayers),
      "verifyConfigValidationFailedAuditPayload: details must have 'droppedLayers' array",
    );
    assert.ok(
      Array.isArray(payload.details.errors),
      "verifyConfigValidationFailedAuditPayload: details must have 'errors' array",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
  .then(() => verifyConfigMergePrecedence())
  .then(() => verifyValidationFallback())
  .then(() => verifyValidationFallbackLowerLayer())
  .then(() => verifyParseFailureSurfacing())
  .then(() => verifyForwardCompatExtensionKeys())
  .then(() => verifySchemaVersionEnforcement())
  .then(() => verifyResolveWorkflowPolicy())
  .then(() => verifyBranchServiceContracts())
  .then(() => verifyBranchProposalIntegration())
  .then(() => verifyInvalidBranchRegexValidation())
  .then(() => verifyConfigValidationFailedAuditPayload())
  .catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });
