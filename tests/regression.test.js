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
const permissionAskedHookModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "permission-asked.js"),
).href;
const fileEditedHookModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "file-edited.js"),
).href;
const loadConfigModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "config", "load-config.js"),
).href;
const resolveWorkflowPolicyModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "resolve-workflow-policy.js"),
).href;
const detectFinalizableOutputsModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "detect-finalizable-outputs.js"),
).href;
const evaluateWorkflowFinalizationModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "evaluate-workflow-finalization.js"),
).href;
const finalizationArtifactsModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "finalization-artifacts.js"),
).href;
const parseStatusPorcelainModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "parse-status-porcelain.js"),
).href;
const branchServiceModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "branch-service.js"),
).href;
const readinessServiceModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "check-repository-readiness.js"),
).href;
const classifyGitExecutionFailureModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "classify-git-execution-failure.js"),
).href;
const gitExecutorModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "git-executor.js"),
).href;
const commitServiceModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "commit-service.js"),
).href;
const pushServiceModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "push-service.js"),
).href;
const runGitCommandModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "run-git-command.js"),
).href;
const commitProposalModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "commit-proposal.js"),
).href;
const recoveryStateModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "recovery-state.js"),
).href;
const classifyRecoveryModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "classify-recovery.js"),
).href;
const buildRecoveryOptionsModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "build-recovery-options.js"),
).href;
const recoveryOrchestratorModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "recovery-orchestrator.js"),
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

function createGitWorkspace({ initialize = false, withRemote = false } = {}) {
  const tempRoot = createTempWorkspace();

  if (initialize) {
    execFileSync("git", ["init"], {
      cwd: tempRoot,
      stdio: "pipe",
    });
  }

  if (withRemote) {
    execFileSync("git", ["remote", "add", "origin", "https://example.com/repo.git"], {
      cwd: tempRoot,
      stdio: "pipe",
    });
  }

  return tempRoot;
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

    // Story 2.1: wrapper and built now emit approval prompts (legacy does not).
    // Parity is asserted between wrapper and built — not against legacy which
    // has no approval layer.
    assert.deepEqual(
      built.mock.prompts.map(summarizePrompt),
      wrapper.mock.prompts.map(summarizePrompt),
      "built prompts differ from wrapper (approval prompt parity)",
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

  const noGitWorkspace = createGitWorkspace();

  try {
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

    const plannedLog = logs.find(
      (entry) => entry.message === "git.action.planned" && entry.extra?.details?.kind === "branch",
    );
    assert.ok(
      plannedLog,
      "verifyBranchProposalIntegration: branch git.action.planned audit must be emitted",
    );
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

    const noGitLogs = [];
    const noGitWorkflowState = createWorkflowStateStore();
    const noGitHook = commandBeforeModule.createCommandExecuteBeforeHook(
      {
        "command.execute.before": async () => {},
      },
      {
        workflowCommands: new Set(["bmad-bmm-quick-dev", "bmad-bmm-create-prd"]),
        workflowState: noGitWorkflowState,
        branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
        pluginContext: {
          directory: noGitWorkspace,
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
            noGitLogs.push({ message, extra });
          },
        },
      },
    );

    await noGitHook(
      {
        command: "/bmad-bmm-quick-dev",
        arguments: "ABC-123 regression coverage",
        sessionID: "branch-integration-ask",
      },
      { parts: [] },
    );
    assert.equal(
      noGitWorkflowState.get("branch-integration-ask")?.branchProposal,
      undefined,
      "verifyBranchProposalIntegration: non-git readiness ask must not stash a branch proposal",
    );
    assert.equal(
      noGitWorkflowState.get("branch-integration-ask")?.initProposal?.kind,
      "init",
      "verifyBranchProposalIntegration: non-git readiness ask must still stash the init proposal",
    );
    assert.equal(
      noGitLogs.filter(
        (entry) => entry.message === "git.action.planned" && entry.extra?.details?.kind === "branch",
      ).length,
      0,
      "verifyBranchProposalIntegration: non-git readiness ask must not emit branch git.action.planned",
    );
    assert.equal(
      noGitLogs.filter(
        (entry) => entry.message === "git.action.planned" && entry.extra?.details?.kind === "init",
      ).length,
      1,
      "verifyBranchProposalIntegration: non-git readiness ask must still emit init git.action.planned",
    );

    const branchPlannedCount = logs.filter(
      (entry) => entry.message === "git.action.planned" && entry.extra?.details?.kind === "branch",
    ).length;
    assert.equal(
      branchPlannedCount,
      3,
      "verifyBranchProposalIntegration: each implementation workflow run with a branch proposal must emit branch git.action.planned",
    );
  } finally {
    fs.rmSync(noGitWorkspace, { recursive: true, force: true });
  }

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

async function verifyRepositoryReadinessContracts() {
  const readinessModule = await import(`${readinessServiceModuleUrl}?readiness=${Date.now()}`);

  const noGitWorkspace = createGitWorkspace();
  const gitWorkspace = createGitWorkspace({ initialize: true });
  const remoteWorkspace = createGitWorkspace({ initialize: true, withRemote: true });

  try {
    const askResult = readinessModule.checkRepositoryReadiness({
      directory: noGitWorkspace,
    });
    assert.equal(
      askResult.outcome,
      "ask",
      "verifyRepositoryReadinessContracts: non-git workspace must request initialization approval",
    );
    assert.equal(
      askResult.reason,
      "git-not-initialized",
      "verifyRepositoryReadinessContracts: non-git workspace must expose git-not-initialized reason",
    );
    assert.equal(
      askResult.details?.proposal?.kind,
      "init",
      "verifyRepositoryReadinessContracts: non-git workspace must attach init proposal details",
    );

    const allowResult = readinessModule.checkRepositoryReadiness({
      directory: gitWorkspace,
    });
    assert.equal(
      allowResult.outcome,
      "allow",
      "verifyRepositoryReadinessContracts: initialized repository must be allowed",
    );
    assert.equal(
      allowResult.details?.isGitRepository,
      true,
      "verifyRepositoryReadinessContracts: initialized repository must report isGitRepository=true",
    );
    assert.equal(
      allowResult.details?.hasRemote,
      false,
      "verifyRepositoryReadinessContracts: repository without remotes must report hasRemote=false",
    );

    const detachedHeadResult = readinessModule.checkRepositoryReadiness({
      directory: remoteWorkspace,
      gitRunner({ command }) {
        if (command === "rev-parse-inside-work-tree") {
          return "true\n";
        }
        if (command === "symbolic-ref-short-head") {
          const error = new Error("detached HEAD");
          error.status = 128;
          error.stderr = "fatal: ref HEAD is not a symbolic ref\n";
          throw error;
        }
        if (command === "remote-verbose") {
          return "origin https://example.com/repo.git (fetch)\norigin https://example.com/repo.git (push)\n";
        }

        throw new Error(`unexpected command: ${command}`);
      },
    });
    assert.equal(
      detachedHeadResult.outcome,
      "allow",
      "verifyRepositoryReadinessContracts: detached HEAD must still be treated as a valid repository",
    );
    assert.equal(
      detachedHeadResult.details?.branch,
      null,
      "verifyRepositoryReadinessContracts: detached HEAD must report branch=null",
    );
    assert.equal(
      detachedHeadResult.details?.hasRemote,
      true,
      "verifyRepositoryReadinessContracts: detached HEAD must still continue remote readiness reporting",
    );
    assert.deepEqual(
      detachedHeadResult.details?.remoteNames,
      ["origin"],
      "verifyRepositoryReadinessContracts: detached HEAD must preserve remote names",
    );

    const invokedCommands = [];
    const skippedRemoteResult = readinessModule.checkRepositoryReadiness({
      directory: remoteWorkspace,
      policy: { requiresRemote: false },
      gitRunner({ command }) {
        invokedCommands.push(command);
        if (command === "rev-parse-inside-work-tree") {
          return "true\n";
        }
        if (command === "symbolic-ref-short-head") {
          return "main\n";
        }
        if (command === "remote-verbose") {
          throw new Error("remote-verbose should not run when requiresRemote=false");
        }

        throw new Error(`unexpected command: ${command}`);
      },
    });
    assert.equal(
      skippedRemoteResult.outcome,
      "allow",
      "verifyRepositoryReadinessContracts: requiresRemote=false must still allow an initialized repository",
    );
    assert.equal(
      invokedCommands.includes("remote-verbose"),
      false,
      "verifyRepositoryReadinessContracts: requiresRemote=false must skip remote-verbose entirely",
    );

    const unavailableResult = readinessModule.checkRepositoryReadiness({
      directory: gitWorkspace,
      gitRunner() {
        const error = new Error("git missing");
        error.code = "ENOENT";
        throw error;
      },
    });
    assert.equal(
      unavailableResult.outcome,
      "skip",
      "verifyRepositoryReadinessContracts: ENOENT must degrade to skip outcome",
    );
    assert.equal(
      unavailableResult.reason,
      "readiness-check-unavailable",
      "verifyRepositoryReadinessContracts: ENOENT must use readiness-check-unavailable reason",
    );
  } finally {
    fs.rmSync(noGitWorkspace, { recursive: true, force: true });
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
    fs.rmSync(remoteWorkspace, { recursive: true, force: true });
  }
}

async function verifyRepositoryReadinessIntegration() {
  const wrapperModule = await import(`${wrapperModuleUrl}?readiness-integration=${Date.now()}`);

  const noGitWorkspace = createGitWorkspace();
  const gitWorkspace = createGitWorkspace({ initialize: true });

  try {
    const askWrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, noGitWorkspace);
    const askStartedAt = process.hrtime.bigint();
    await askWrapper.handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 readiness", sessionID: "readiness-ask" },
      { parts: [] },
    );
    const askDurationMs = Number(process.hrtime.bigint() - askStartedAt) / 1e6;
    assert.ok(
      askDurationMs < 500,
      "verifyRepositoryReadinessIntegration: readiness check must complete within the NFR1 budget",
    );

    const askReadinessLogs = askWrapper.mock.logs.filter(
      (entry) => entry.body?.message === "git.readiness.checked",
    );
    assert.equal(
      askReadinessLogs.length,
      1,
      "verifyRepositoryReadinessIntegration: workflow command must emit one git.readiness.checked event",
    );
    assert.equal(
      askReadinessLogs[0].body.extra.outcome,
      "ask",
      "verifyRepositoryReadinessIntegration: non-git workflow workspace must emit ask outcome",
    );

    const askPlannedLogs = askWrapper.mock.logs.filter(
      (entry) => entry.body?.message === "git.action.planned" && entry.body?.extra?.details?.kind === "init",
    );
    assert.equal(
      askPlannedLogs.length,
      1,
      "verifyRepositoryReadinessIntegration: init proposal must emit one git.action.planned event",
    );
    const askBranchPlannedLogs = askWrapper.mock.logs.filter(
      (entry) => entry.body?.message === "git.action.planned" && entry.body?.extra?.details?.kind === "branch",
    );
    assert.equal(
      askBranchPlannedLogs.length,
      0,
      "verifyRepositoryReadinessIntegration: init proposal path must not emit branch git.action.planned",
    );

    const allowWrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, gitWorkspace);
    await allowWrapper.handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 readiness", sessionID: "readiness-allow" },
      { parts: [] },
    );
    const allowReadinessLogs = allowWrapper.mock.logs.filter(
      (entry) => entry.body?.message === "git.readiness.checked",
    );
    assert.equal(
      allowReadinessLogs.length,
      1,
      "verifyRepositoryReadinessIntegration: initialized repository must still emit readiness audit",
    );
    assert.equal(
      allowReadinessLogs[0].body.extra.outcome,
      "allow",
      "verifyRepositoryReadinessIntegration: initialized repository must emit allow outcome",
    );

    const nonWorkflowWrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, noGitWorkspace);
    await nonWorkflowWrapper.handlers["command.execute.before"](
      { command: "/non-workflow-command", arguments: "", sessionID: "readiness-nwf" },
      { parts: [] },
    );
    const nonWorkflowReadinessLogs = nonWorkflowWrapper.mock.logs.filter(
      (entry) => entry.body?.message === "git.readiness.checked",
    );
    assert.equal(
      nonWorkflowReadinessLogs.length,
      0,
      "verifyRepositoryReadinessIntegration: non-workflow commands must not run readiness checks",
    );
  } finally {
    fs.rmSync(noGitWorkspace, { recursive: true, force: true });
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
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

// ─────────────────────────────────────────────────────────────────────────────
// Story 2.1: Present Approval Requests for Planned Git Actions
// ─────────────────────────────────────────────────────────────────────────────

const approvalServiceModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "approval-policy-service.js"),
).href;
const classifyGitActionModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "classify-git-action.js"),
).href;
const buildApprovalRequestModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "build-approval-request.js"),
).href;
const buildApprovalExplanationModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "build-approval-explanation.js"),
).href;
const redactApprovalFieldsModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "redact-approval-fields.js"),
).href;
const approvalResolutionStateModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "approval-resolution-state.js"),
).href;
const buildApprovalResolutionModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "build-approval-resolution.js"),
).href;
const consumeApprovalOutcomeModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "approval", "consume-approval-outcome.js"),
).href;
const permissionAskedModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "permission-asked.js"),
).href;

/**
 * Story 2.1: classifyGitAction — unit contract tests.
 * Verifies that proposals map to the correct actionType.
 */
async function verifyClassifyGitActionContracts() {
  const { classifyGitAction, isAllowedActionType } = await import(
    `${classifyGitActionModuleUrl}?v=${Date.now()}`
  );

  // Branch create
  const branchCreate = classifyGitAction({ kind: "branch", action: "create", name: "feat/ABC-1" });
  assert.equal(
    branchCreate?.actionType,
    "branch/create",
    "classifyGitAction: branch+create must map to branch/create",
  );
  assert.equal(
    branchCreate?.requiresApproval,
    true,
    "classifyGitAction: requiresApproval must always be true",
  );

  // Branch switch
  const branchSwitch = classifyGitAction({ kind: "branch", action: "switch", name: "feat/ABC-2" });
  assert.equal(
    branchSwitch?.actionType,
    "branch/switch",
    "classifyGitAction: branch+switch must map to branch/switch",
  );

  // Init proposal
  const init = classifyGitAction({ kind: "init", directory: "/tmp/repo" });
  assert.equal(
    init?.actionType,
    "init",
    "classifyGitAction: init kind must map to init actionType",
  );

  // Unknown kind → null
  const unknown = classifyGitAction({ kind: "unknown-future" });
  assert.equal(
    unknown,
    null,
    "classifyGitAction: unknown proposal kind must return null",
  );

  // Null / missing proposal → null
  assert.equal(classifyGitAction(null), null, "classifyGitAction: null must return null");
  assert.equal(classifyGitAction(undefined), null, "classifyGitAction: undefined must return null");

  // isAllowedActionType
  assert.equal(isAllowedActionType("branch/create"), true);
  assert.equal(isAllowedActionType("branch/switch"), true);
  assert.equal(isAllowedActionType("init"), true);
  assert.equal(isAllowedActionType("commit"), true);
  assert.equal(isAllowedActionType("push"), true);
  assert.equal(isAllowedActionType("nope"), false, "isAllowedActionType: unknown type must be false");
}

/**
 * Story 2.1: buildApprovalRequest — unit contract tests.
 * Verifies the output shape and deterministic ID.
 */
async function verifyBuildApprovalRequestContracts() {
  const { buildApprovalRequest } = await import(
    `${buildApprovalRequestModuleUrl}?v=${Date.now()}`
  );

  const proposal = { kind: "branch", action: "create", name: "feat/ABC-1" };
  const req = buildApprovalRequest({
    sessionID: "s-approval-1",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    actionLabel: "Create branch: feat/ABC-1",
    proposal,
  });

  assert.equal(typeof req.id, "string", "buildApprovalRequest: id must be a string");
  assert.equal(req.sessionID, "s-approval-1", "buildApprovalRequest: sessionID preserved");
  assert.equal(req.workflow, "bmad-bmm-quick-dev", "buildApprovalRequest: workflow preserved");
  assert.equal(req.command, "bmad-bmm-quick-dev", "buildApprovalRequest: command preserved");
  assert.equal(req.phase, "start", "buildApprovalRequest: phase preserved");
  assert.equal(req.actionType, "branch/create", "buildApprovalRequest: actionType preserved");
  assert.equal(req.status, "awaitingApproval", "buildApprovalRequest: status must be awaitingApproval");
  assert.deepEqual(req.proposal, proposal, "buildApprovalRequest: proposal preserved");
  assert.ok(req.prompt && typeof req.prompt === "object", "buildApprovalRequest: prompt must be an object");
  assert.equal(typeof req.prompt.summary, "string", "buildApprovalRequest: prompt.summary must be a string");
  assert.ok(req.metadata && typeof req.metadata === "object", "buildApprovalRequest: metadata must be an object");
  assert.equal(req.metadata.proposalKind, "branch", "buildApprovalRequest: metadata.proposalKind preserved");
  assert.equal(typeof req.createdAt, "string", "buildApprovalRequest: createdAt must be a string");

  // Deterministic ID — same inputs produce the same id
  const req2 = buildApprovalRequest({
    sessionID: "s-approval-1",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    actionLabel: "Create branch: feat/ABC-1",
    proposal,
  });
  assert.equal(req.id, req2.id, "buildApprovalRequest: same inputs must produce the same deterministic id");

  // Different proposal → different ID
  const req3 = buildApprovalRequest({
    sessionID: "s-approval-1",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/switch",
    actionLabel: "Switch to branch: feat/ABC-2",
    proposal: { kind: "branch", action: "switch", name: "feat/ABC-2" },
  });
  assert.notEqual(req.id, req3.id, "buildApprovalRequest: different proposals must produce different ids");

  // L5: same target name but different `current` (starting branch) → different ids.
  const reqFromMain = buildApprovalRequest({
    sessionID: "s-approval-1",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    actionLabel: "Create branch: feat/SAME-TARGET",
    proposal: { kind: "branch", action: "create", name: "feat/SAME-TARGET", current: "main" },
  });
  const reqFromDevelop = buildApprovalRequest({
    sessionID: "s-approval-1",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    actionLabel: "Create branch: feat/SAME-TARGET",
    proposal: { kind: "branch", action: "create", name: "feat/SAME-TARGET", current: "develop" },
  });
  assert.notEqual(
    reqFromMain.id,
    reqFromDevelop.id,
    "buildApprovalRequest: same target name with different `current` must produce different ids",
  );
}

/**
 * Story 2.1: approvalPolicyService — unit contract tests.
 */
async function verifyApprovalPolicyServiceContracts() {
  const { getPendingApproval, selectNextPlannedAction, evaluateRequestGate } = await import(
    `${approvalServiceModuleUrl}?v=${Date.now()}`
  );

  // getPendingApproval: null when no current
  assert.equal(getPendingApproval({}), null, "getPendingApproval: missing approvalCurrent returns null");
  assert.equal(getPendingApproval({ approvalCurrent: null }), null, "getPendingApproval: null returns null");
  const fakeRequest = { id: "req-1", status: "awaitingApproval" };
  assert.deepEqual(
    getPendingApproval({ approvalCurrent: fakeRequest }),
    fakeRequest,
    "getPendingApproval: returns existing pending request",
  );

  // selectNextPlannedAction: priority order
  assert.equal(selectNextPlannedAction(null), null, "selectNextPlannedAction: null state returns null");
  assert.equal(selectNextPlannedAction({}), null, "selectNextPlannedAction: no proposals returns null");

  const initProposal = { kind: "init", directory: "/tmp" };
  const branchProposal = { kind: "branch", action: "create", name: "feat/X" };
  const commitProposal = { kind: "commit", message: "Finish workflow outputs" };

  assert.deepEqual(
    selectNextPlannedAction({ initProposal }),
    initProposal,
    "selectNextPlannedAction: initProposal alone selected",
  );
  assert.deepEqual(
    selectNextPlannedAction({ branchProposal }),
    branchProposal,
    "selectNextPlannedAction: branchProposal alone selected",
  );
  assert.deepEqual(
    selectNextPlannedAction({ initProposal, branchProposal }),
    initProposal,
    "selectNextPlannedAction: initProposal takes priority over branchProposal",
  );
  assert.deepEqual(
    selectNextPlannedAction({ commitProposal }),
    commitProposal,
    "selectNextPlannedAction: commitProposal alone selected",
  );
  assert.deepEqual(
    selectNextPlannedAction({ branchProposal, commitProposal }),
    branchProposal,
    "selectNextPlannedAction: branchProposal takes priority over commitProposal",
  );

  // evaluateRequestGate
  // Case: no proposals → skip
  const noProposals = evaluateRequestGate({});
  assert.equal(noProposals.outcome, "skip", "evaluateRequestGate: no proposals must skip");
  assert.equal(noProposals.reason, "no-planned-git-action");

  // Case: pending approval → skip
  const withPending = evaluateRequestGate({ approvalCurrent: fakeRequest, branchProposal });
  assert.equal(withPending.outcome, "skip", "evaluateRequestGate: pending approval must skip");
  assert.equal(withPending.reason, "approval-already-pending");

  // Case: proposal available, no pending → allow
  const withProposal = evaluateRequestGate({ branchProposal });
  assert.equal(withProposal.outcome, "allow", "evaluateRequestGate: available proposal must allow");
  assert.equal(withProposal.reason, "ready-to-publish");
}

/**
 * Story 2.1: workflowState approval fields — isolation tests.
 * Verifies that get() returns copies of approvalCurrent and approvalHistory.
 */
async function verifyWorkflowStateApprovalIsolation() {
  const { createWorkflowStateStore } = await import(
    `${workflowStateModuleUrl}?approval-isolation=${Date.now()}`
  );

  const store = createWorkflowStateStore();
  const approvalRequest = { id: "req-iso-1", status: "awaitingApproval", sessionID: "s-iso" };
  store.set("s-iso", {
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: approvalRequest,
    approvalHistory: [approvalRequest],
  });

  // Mutating returned approvalCurrent must not leak into the store
  const snapshot1 = store.get("s-iso");
  snapshot1.approvalCurrent.status = "tampered";
  assert.equal(
    store.get("s-iso")?.approvalCurrent?.status,
    "awaitingApproval",
    "workflowState: external mutation of returned approvalCurrent must not reach the store",
  );

  // Mutating returned approvalHistory must not leak into the store
  const snapshot2 = store.get("s-iso");
  snapshot2.approvalHistory.push({ id: "injected" });
  assert.equal(
    store.get("s-iso")?.approvalHistory?.length,
    1,
    "workflowState: external mutation of returned approvalHistory must not reach the store",
  );

  // approvalHistory append — previous snapshot must not be contaminated
  const snapBefore = store.get("s-iso");
  const newRequest = { id: "req-iso-2", status: "awaitingApproval" };
  store.set("s-iso", {
    ...store.get("s-iso"),
    approvalCurrent: newRequest,
    approvalHistory: [...(store.get("s-iso").approvalHistory || []), newRequest],
  });
  assert.equal(
    snapBefore.approvalHistory?.length,
    1,
    "workflowState: previous snapshot must not be contaminated after new append",
  );
  assert.equal(
    store.get("s-iso")?.approvalHistory?.length,
    2,
    "workflowState: approvalHistory must grow after append",
  );
}

/**
 * Story 2.1: hook integration — branchProposal only → approvalCurrent.actionType.
 * Tests implementation workflow where only a branch proposal exists.
 */
async function verifyApprovalRequestFromBranchProposal() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?approval-branch=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?approval-branch=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const workflowState = createWorkflowStateStore();
  const logs = [];
  const prompts = [];
  const gitWorkspace = createGitWorkspace({ initialize: true });

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev", "bmad-bmm-create-prd"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
        requestApproval(request) {
          prompts.push(request);
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  try {
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 test", sessionID: "s-branch-approval" },
      { parts: [] },
    );

    const state = workflowState.get("s-branch-approval");

    // Branch proposal must exist
    assert.ok(state?.branchProposal, "verifyApprovalRequestFromBranchProposal: branchProposal must exist");

    // approvalCurrent must be set with branch actionType
    assert.ok(
      state?.approvalCurrent,
      "verifyApprovalRequestFromBranchProposal: approvalCurrent must be set after branch proposal",
    );
    assert.ok(
      state.approvalCurrent.actionType === "branch/create" ||
        state.approvalCurrent.actionType === "branch/switch",
      "verifyApprovalRequestFromBranchProposal: approvalCurrent.actionType must be branch/create or branch/switch",
    );
    assert.equal(
      state.approvalCurrent.status,
      "awaitingApproval",
      "verifyApprovalRequestFromBranchProposal: approvalCurrent.status must be awaitingApproval",
    );
    assert.equal(
      state.approvalCurrent.sessionID,
      "s-branch-approval",
      "verifyApprovalRequestFromBranchProposal: approvalCurrent.sessionID must match",
    );

    // approvalHistory must have one entry
    assert.equal(
      state.approvalHistory?.length,
      1,
      "verifyApprovalRequestFromBranchProposal: approvalHistory must have one entry",
    );

    // approval.requested audit event must be emitted
    const approvalRequestedLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(
      approvalRequestedLogs.length,
      1,
      "verifyApprovalRequestFromBranchProposal: must emit one approval.requested audit event",
    );
    const auditExtra = approvalRequestedLogs[0].extra;
    assert.equal(auditExtra.event, "approval.requested");
    assert.equal(typeof auditExtra.timestamp, "string");
    assert.equal(typeof auditExtra.workflow, "string");
    assert.equal(typeof auditExtra.command, "string");
    assert.equal(auditExtra.outcome, "ask");
    assert.equal(typeof auditExtra.details.requestId, "string");
    assert.ok(
      auditExtra.details.actionType === "branch/create" || auditExtra.details.actionType === "branch/switch",
    );
    assert.equal(typeof auditExtra.details.sessionID, "string");

    // requestApproval adapter must have been called
    assert.equal(
      prompts.length,
      1,
      "verifyApprovalRequestFromBranchProposal: requestApproval adapter must be called once",
    );
    assert.equal(prompts[0].sessionID, "s-branch-approval");
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.1: hook integration — initProposal only → approvalCurrent.actionType === "init".
 * Also: branch approval request must NOT be created when initProposal is present.
 */
async function verifyApprovalRequestFromInitProposal() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?approval-init=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?approval-init=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const noGitWorkspace = createGitWorkspace(); // non-git → initProposal
  const workflowState = createWorkflowStateStore();
  const logs = [];

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: noGitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  try {
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 init-test", sessionID: "s-init-approval" },
      { parts: [] },
    );

    const state = workflowState.get("s-init-approval");

    // initProposal must be set, branchProposal must not
    assert.ok(
      state?.initProposal,
      "verifyApprovalRequestFromInitProposal: initProposal must exist in state",
    );
    assert.equal(
      state?.branchProposal,
      undefined,
      "verifyApprovalRequestFromInitProposal: branchProposal must not exist when initProposal is present",
    );

    // approvalCurrent must be for init, not branch
    assert.equal(
      state?.approvalCurrent?.actionType,
      "init",
      "verifyApprovalRequestFromInitProposal: approvalCurrent.actionType must be init",
    );
    assert.equal(
      state?.approvalCurrent?.status,
      "awaitingApproval",
      "verifyApprovalRequestFromInitProposal: approvalCurrent.status must be awaitingApproval",
    );

    // approval.requested audit must reference init
    const approvalLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(
      approvalLogs.length,
      1,
      "verifyApprovalRequestFromInitProposal: must emit one approval.requested event",
    );
    assert.equal(
      approvalLogs[0].extra.details.actionType,
      "init",
      "verifyApprovalRequestFromInitProposal: audit actionType must be init",
    );
    assert.equal(
      approvalLogs[0].extra.details.proposalKind,
      "init",
      "verifyApprovalRequestFromInitProposal: audit proposalKind must be init",
    );
  } finally {
    fs.rmSync(noGitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.1: pending approval idempotency.
 * Second command.execute.before call must NOT emit a new approval.requested event.
 */
async function verifyApprovalIdempotency() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?approval-idem=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?approval-idem=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();
  const logs = [];

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  try {
    // First call → should emit approval.requested
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 idem-test", sessionID: "s-idem" },
      { parts: [] },
    );
    const firstApprovalLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(
      firstApprovalLogs.length,
      1,
      "verifyApprovalIdempotency: first call must emit one approval.requested",
    );

    const stateAfterFirst = workflowState.get("s-idem");
    assert.ok(stateAfterFirst?.approvalCurrent, "verifyApprovalIdempotency: approvalCurrent must be set after first call");
    const firstRequestId = stateAfterFirst.approvalCurrent.id;

    // Second call with same sessionID — pending approval exists → must NOT emit again
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 idem-test", sessionID: "s-idem" },
      { parts: [] },
    );
    const secondApprovalLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(
      secondApprovalLogs.length,
      1,
      "verifyApprovalIdempotency: second call with pending approval must NOT emit a new approval.requested",
    );

    // approvalHistory must still be 1 after the second call (pending gate blocks new entry)
    const stateAfterSecond = workflowState.get("s-idem");
    assert.equal(
      stateAfterSecond?.approvalHistory?.length,
      1,
      "verifyApprovalIdempotency: approvalHistory must remain length 1 when gate blocks second request",
    );
    // Request ID must remain stable
    assert.equal(
      stateAfterSecond?.approvalCurrent?.id,
      firstRequestId,
      "verifyApprovalIdempotency: approvalCurrent.id must not change on second blocked call",
    );
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.1: non-workflow and planning commands → no approval state created.
 */
async function verifyNoApprovalForNonWorkflowAndPlanning() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?approval-nwf=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?approval-nwf=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const noGitWorkspace = createGitWorkspace();
  const workflowState = createWorkflowStateStore();
  const logs = [];

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev", "bmad-bmm-create-prd"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  try {
    // Non-workflow command → no workflow state → no approval
    await hook(
      { command: "/non-workflow-command", arguments: "", sessionID: "s-nwf-approval" },
      { parts: [] },
    );
    assert.equal(
      workflowState.get("s-nwf-approval"),
      undefined,
      "verifyNoApprovalForNonWorkflowAndPlanning: non-workflow command must not create workflow state",
    );
    const nwfApprovalLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(
      nwfApprovalLogs.length,
      0,
      "verifyNoApprovalForNonWorkflowAndPlanning: non-workflow command must not emit approval.requested",
    );

    // Planning workflow (branchRequired=false) → no branch proposal → no approval
    await hook(
      { command: "/bmad-bmm-create-prd", arguments: "", sessionID: "s-planning-approval" },
      { parts: [] },
    );
    const planningState = workflowState.get("s-planning-approval");
    assert.ok(
      planningState?.approvalCurrent == null,
      "verifyNoApprovalForNonWorkflowAndPlanning: planning workflow must not create approvalCurrent (must be null or undefined)",
    );
    const planningApprovalLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(
      planningApprovalLogs.length,
      0,
      "verifyNoApprovalForNonWorkflowAndPlanning: planning workflow must not emit approval.requested",
    );
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
    fs.rmSync(noGitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.1: approval request payload shape — sessionID, workflow, actionType, proposal.kind.
 */
async function verifyApprovalRequestPayloadShape() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?approval-shape=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?approval-shape=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: { async info() {} },
    },
  );

  try {
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 shape-test", sessionID: "s-shape" },
      { parts: [] },
    );

    const state = workflowState.get("s-shape");
    const req = state?.approvalCurrent;
    assert.ok(req, "verifyApprovalRequestPayloadShape: approvalCurrent must exist");
    assert.equal(req.sessionID, "s-shape", "payload: sessionID preserved");
    assert.equal(req.workflow, "bmad-bmm-quick-dev", "payload: workflow preserved");
    assert.ok(
      req.actionType === "branch/create" || req.actionType === "branch/switch",
      "payload: actionType must be branch/create or branch/switch",
    );
    assert.equal(req.proposal?.kind, "branch", "payload: proposal.kind must be branch");
    assert.equal(typeof req.id, "string", "payload: id must be string");
    assert.equal(req.status, "awaitingApproval", "payload: status must be awaitingApproval");
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.1: built artifact parity for approval.requested event and approvalCurrent stash.
 * Both wrapper (src/index.js) and built (dist/devai-aidd-guard.js) must produce the
 * same approvalCurrent shape for the same input.
 */
async function verifyApprovalBuiltArtifactParity() {
  const wrapperMod = await import(`${wrapperModuleUrl}?approval-parity=${Date.now()}`);
  const builtMod = await import(`${builtModuleUrl}?approval-parity=${Date.now()}`);

  const noGitForWrapper = createGitWorkspace();
  const noGitForBuilt = createGitWorkspace();

  try {
    const wrapperMock = createMockClient();
    const wrapperHandlers = await wrapperMod.DevaiAiddGuardPlugin({
      client: wrapperMock.client,
      directory: noGitForWrapper,
    });

    const builtFactory = builtMod.DevaiAiddGuardPlugin || builtMod.DevaiGitWorkflowPlugin || builtMod.default;
    const builtMock = createMockClient();
    const builtHandlers = await builtFactory({
      client: builtMock.client,
      directory: noGitForBuilt,
    });

    await wrapperHandlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 parity", sessionID: "s-parity" },
      { parts: [] },
    );
    await builtHandlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 parity", sessionID: "s-parity" },
      { parts: [] },
    );

    // Both must emit approval.requested
    const wrapperApprovalLogs = wrapperMock.logs.filter(
      (l) => l.body?.message === "approval.requested",
    );
    const builtApprovalLogs = builtMock.logs.filter(
      (l) => l.body?.message === "approval.requested",
    );
    assert.equal(
      wrapperApprovalLogs.length,
      1,
      "verifyApprovalBuiltArtifactParity: wrapper must emit one approval.requested",
    );
    assert.equal(
      builtApprovalLogs.length,
      1,
      "verifyApprovalBuiltArtifactParity: built must emit one approval.requested",
    );

    // Both must emit approval prompts
    assert.equal(
      wrapperMock.prompts.length,
      1,
      "verifyApprovalBuiltArtifactParity: wrapper must emit one approval prompt",
    );
    assert.equal(
      builtMock.prompts.length,
      1,
      "verifyApprovalBuiltArtifactParity: built must emit one approval prompt",
    );

    // audit payload shapes must match
    const wrapperAudit = wrapperApprovalLogs[0].body.extra;
    const builtAudit = builtApprovalLogs[0].body.extra;
    assert.equal(wrapperAudit.event, builtAudit.event, "parity: event");
    assert.equal(wrapperAudit.outcome, builtAudit.outcome, "parity: outcome");
    assert.equal(wrapperAudit.details.actionType, builtAudit.details.actionType, "parity: actionType");
    assert.equal(wrapperAudit.details.proposalKind, builtAudit.details.proposalKind, "parity: proposalKind");
  } finally {
    fs.rmSync(noGitForWrapper, { recursive: true, force: true });
    fs.rmSync(noGitForBuilt, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 2.1 — Code Review Fixes (H1, H2, M1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * H1: requestApproval throw must emit approval.prompt.delivery.failed audit
 * and the workflow must continue (legacy handler still invoked, no exception
 * surfaces to the caller).
 */
async function verifyApprovalPromptDeliveryFailureAudit() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?h1=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?h1=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();
  const logs = [];
  let legacyHandlerCalled = false;

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    {
      "command.execute.before": async () => {
        legacyHandlerCalled = true;
      },
    },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
        async requestApproval() {
          throw new Error("simulated prompt delivery failure");
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  let surfacedError = null;
  try {
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 h1", sessionID: "s-h1" },
      { parts: [] },
    );
  } catch (e) {
    surfacedError = e;
  }

  try {
    assert.equal(
      surfacedError,
      null,
      "verifyApprovalPromptDeliveryFailureAudit: prompt failure must NOT surface to caller (FR22)",
    );
    assert.equal(
      legacyHandlerCalled,
      true,
      "verifyApprovalPromptDeliveryFailureAudit: legacy handler must still be invoked after prompt failure",
    );

    const failureLogs = logs.filter((l) => l.message === "approval.prompt.delivery.failed");
    assert.equal(
      failureLogs.length,
      1,
      "verifyApprovalPromptDeliveryFailureAudit: must emit one approval.prompt.delivery.failed event",
    );
    const payload = failureLogs[0].extra;
    assert.equal(payload.event, "approval.prompt.delivery.failed");
    assert.equal(typeof payload.timestamp, "string");
    assert.equal(payload.workflow, "bmad-bmm-quick-dev");
    assert.equal(payload.command, "bmad-bmm-quick-dev");
    assert.equal(
      payload.outcome,
      "skip",
      "verifyApprovalPromptDeliveryFailureAudit: prompt failure must use outcome=skip (user was never asked)",
    );
    assert.equal(
      payload.details.reason,
      "prompt-delivery-failed",
      "verifyApprovalPromptDeliveryFailureAudit: details.reason must be machine-readable",
    );
    assert.equal(typeof payload.details.requestId, "string");
    assert.ok(
      payload.details.actionType === "branch/create" || payload.details.actionType === "branch/switch",
    );
    assert.equal(payload.details.sessionID, "s-h1");
    assert.equal(
      payload.details.error,
      "simulated prompt delivery failure",
      "verifyApprovalPromptDeliveryFailureAudit: error message must be captured",
    );

    // approvalCurrent must remain stashed despite prompt failure.
    const state = workflowState.get("s-h1");
    assert.ok(
      state?.approvalCurrent,
      "verifyApprovalPromptDeliveryFailureAudit: approvalCurrent must remain stashed after prompt failure",
    );
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * H2: full priorState carry-over — arbitrary fields stashed by future stories
 * (e.g., Story 2.3's approvalResolved/approvalDecision) must survive a second
 * command.execute.before invocation on the same sessionID.
 */
async function verifyPriorStateCarryOver() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?h2=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?h2=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: { async info() {} },
    },
  );

  try {
    // First call seeds state.
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 h2", sessionID: "s-h2" },
      { parts: [] },
    );

    // Inject a future-story field directly into the store.
    const seeded = workflowState.get("s-h2");
    workflowState.set("s-h2", {
      ...seeded,
      approvalDecision: { outcome: "accept", at: "2026-05-08T00:00:00.000Z" },
      futureCustomField: { story: "2.3", marker: "must-survive" },
    });

    // Second command.execute.before — must spread priorState first so the
    // injected fields persist through re-entry.
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 h2", sessionID: "s-h2" },
      { parts: [] },
    );

    const finalState = workflowState.get("s-h2");
    assert.deepEqual(
      finalState?.approvalDecision,
      { outcome: "accept", at: "2026-05-08T00:00:00.000Z" },
      "verifyPriorStateCarryOver: future approvalDecision field must survive re-entry",
    );
    assert.deepEqual(
      finalState?.futureCustomField,
      { story: "2.3", marker: "must-survive" },
      "verifyPriorStateCarryOver: arbitrary future custom fields must survive re-entry",
    );

    // approvalCurrent and approvalHistory must also remain consistent.
    assert.ok(
      finalState?.approvalCurrent,
      "verifyPriorStateCarryOver: approvalCurrent must remain after re-entry",
    );
    assert.ok(
      Array.isArray(finalState?.approvalHistory),
      "verifyPriorStateCarryOver: approvalHistory must remain an array",
    );
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * M1: structuredClone-based nested isolation. Mutating a nested field reachable
 * through approvalCurrent (e.g., proposal.action) must not contaminate the store.
 */
async function verifyWorkflowStateNestedDeepIsolation() {
  const { createWorkflowStateStore } = await import(
    `${workflowStateModuleUrl}?m1=${Date.now()}`
  );

  const store = createWorkflowStateStore();
  const seedRequest = {
    id: "req-m1-1",
    status: "awaitingApproval",
    sessionID: "s-m1",
    proposal: { kind: "branch", action: "create", name: "feat/X" },
    metadata: { proposalKind: "branch", nested: { tag: "original" } },
  };
  store.set("s-m1", {
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: seedRequest,
    approvalHistory: [seedRequest],
  });

  // (a) Mutate nested proposal field on the returned snapshot.
  const snapshot = store.get("s-m1");
  snapshot.approvalCurrent.proposal.action = "switch";
  snapshot.approvalCurrent.metadata.nested.tag = "tampered";

  const reFetched = store.get("s-m1");
  assert.equal(
    reFetched.approvalCurrent.proposal.action,
    "create",
    "verifyWorkflowStateNestedDeepIsolation: nested mutation of approvalCurrent.proposal.action must not reach store",
  );
  assert.equal(
    reFetched.approvalCurrent.metadata.nested.tag,
    "original",
    "verifyWorkflowStateNestedDeepIsolation: nested mutation of approvalCurrent.metadata.nested.tag must not reach store",
  );

  // (b) Mutate nested field inside approvalHistory[0].
  const histSnapshot = store.get("s-m1");
  histSnapshot.approvalHistory[0].proposal.name = "feat/Tampered";

  const reFetched2 = store.get("s-m1");
  assert.equal(
    reFetched2.approvalHistory[0].proposal.name,
    "feat/X",
    "verifyWorkflowStateNestedDeepIsolation: nested mutation of approvalHistory[0].proposal.name must not reach store",
  );
}

async function verifyWorkflowStateFinalizationIsolation() {
  const { createWorkflowStateStore } = await import(
    `${workflowStateModuleUrl}?finalization-iso=${Date.now()}`
  );

  const store = createWorkflowStateStore();
  store.set("s-final-iso", {
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    touchedFiles: [
      { path: "src/index.js", kind: "code" },
      { path: "README.md", kind: "technical-doc" },
    ],
    finalizationArtifacts: {
      matchedFiles: [{ path: "src/index.js", kind: "code" }],
      ignoredFiles: [{ path: ".opencode/state/cache.json", kind: "other" }],
    },
    finalizationAssessment: {
      outcome: "allow",
      reason: "finalizable-outputs-detected",
      details: {
        matchedFiles: [{ path: "src/index.js", kind: "code" }],
        artifactKinds: ["code"],
      },
    },
    commitProposal: {
      kind: "commit",
      artifactScope: "implementation",
      files: ["src/index.js"],
    },
  });

  const snapshot = store.get("s-final-iso");
  snapshot.touchedFiles[0].path = "tampered.js";
  snapshot.finalizationArtifacts.matchedFiles[0].kind = "other";
  snapshot.finalizationAssessment.details.artifactKinds.push("planning-artifact");
  snapshot.commitProposal.files[0] = "tampered.md";

  const reFetched = store.get("s-final-iso");
  assert.equal(reFetched.touchedFiles[0].path, "src/index.js");
  assert.equal(reFetched.finalizationArtifacts.matchedFiles[0].kind, "code");
  assert.deepEqual(reFetched.finalizationAssessment.details.artifactKinds, ["code"]);
  assert.deepEqual(reFetched.commitProposal.files, ["src/index.js"]);
}

async function verifyFileEditedTracksTouchedFilesAndSessionCleanup() {
  const [{ createWorkflowStateStore }, { createFileEditedHook }] = await Promise.all([
    import(`${workflowStateModuleUrl}?file-edited=${Date.now()}`),
    import(`${fileEditedHookModuleUrl}?file-edited=${Date.now()}`),
  ]);

  const store = createWorkflowStateStore();
  store.set("s-file-edited", {
    sessionID: "s-file-edited",
    commandName: "bmad-bmm-quick-dev",
    phase: "in-progress",
  });

  const hook = createFileEditedHook(
    { "file.edited": async () => {} },
    { workflowState: store, pluginContext: { directory: projectRoot } },
  );

  await hook({
    sessionID: "s-file-edited",
    filePath: path.join(projectRoot, "src", "index.js"),
  });
  await hook({
    sessionID: "s-file-edited",
    filePath: "README.md",
  });
  await hook({
    sessionID: "s-file-edited",
    filePath: path.join(projectRoot, "src", "index.js"),
  });

  const snapshot = store.get("s-file-edited");
  assert.deepEqual(
    snapshot.touchedFiles.map((entry) => entry.path),
    ["src/index.js", "README.md"],
  );
  assert.deepEqual(
    snapshot.touchedFiles.map((entry) => entry.kind),
    ["code", "technical-doc"],
  );

  store.clear("s-file-edited");
  assert.equal(store.get("s-file-edited"), undefined);
}

async function verifyDetectFinalizableOutputs() {
  const { detectFinalizableOutputs } = await import(
    `${detectFinalizableOutputsModuleUrl}?finalizable=${Date.now()}`
  );

  const commitAndPush = detectFinalizableOutputs({
    workflowContext: { commandName: "bmad-bmm-quick-dev", sessionID: "s-final-1", phase: "finish" },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "story",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    trackedFiles: [{ path: "src/index.js", kind: "code" }],
    repositorySnapshot: null,
    lastContinuationDecision: null,
    activeRecoveryGate: null,
  });
  assert.equal(commitAndPush.details.hasFinalizableOutputs, true);
  assert.equal(commitAndPush.details.shouldProposeCommit, true);
  assert.equal(commitAndPush.details.shouldConsiderPushLater, true);

  const noRelevantOutputs = detectFinalizableOutputs({
    workflowContext: { commandName: "bmad-bmm-quick-dev", sessionID: "s-final-2", phase: "finish" },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "story",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    trackedFiles: [{ path: ".opencode/state/cache.json", kind: "other" }],
    repositorySnapshot: null,
    lastContinuationDecision: null,
    activeRecoveryGate: null,
  });
  assert.equal(noRelevantOutputs.details.hasFinalizableOutputs, false);
  assert.equal(noRelevantOutputs.details.shouldProposeCommit, false);

  const artifactMismatch = detectFinalizableOutputs({
    workflowContext: { commandName: "bmad-bmm-create-prd", sessionID: "s-final-3", phase: "finish" },
    workflowPolicy: {
      category: "planning",
      identityStrategy: "artifact-singleton",
      artifactKey: "prd",
      branchRequired: false,
      finalization: "commit-optional-push",
    },
    trackedFiles: [{ path: "_bmad-output/planning-artifacts/architecture.md", kind: "planning-artifact" }],
    repositorySnapshot: null,
    lastContinuationDecision: null,
    activeRecoveryGate: null,
  });
  assert.equal(artifactMismatch.reason, "artifact-scope-mismatch");
  assert.equal(artifactMismatch.details.shouldProposeCommit, false);

  const blockedByRecovery = detectFinalizableOutputs({
    workflowContext: { commandName: "bmad-bmm-quick-dev", sessionID: "s-final-4", phase: "finish" },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "story",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    trackedFiles: [{ path: "src/index.js", kind: "code" }],
    repositorySnapshot: null,
    lastContinuationDecision: null,
    activeRecoveryGate: {
      blockingScope: "workflow-finalization",
      state: "awaitingRecovery",
    },
  });
  assert.equal(blockedByRecovery.reason, "finalization-blocked");
  assert.equal(blockedByRecovery.details.hasFinalizableOutputs, true);
  assert.equal(blockedByRecovery.details.shouldProposeCommit, false);
  assert.equal(blockedByRecovery.details.shouldConsiderPushLater, false);
}

async function verifyToolExecuteAfterFinishEvaluatesFinalization() {
  const [{ createWorkflowStateStore }, { createToolExecuteAfterHook }] = await Promise.all([
    import(`${workflowStateModuleUrl}?finish-hook=${Date.now()}`),
    import(`${toolExecuteAfterModuleUrl}?finish-hook=${Date.now()}`),
  ]);

  const store = createWorkflowStateStore();
  store.set("s-finish-hook", {
    sessionID: "s-finish-hook",
    commandName: "bmad-bmm-quick-dev",
    arguments: "ABC-123 finish hook",
    detectedAt: "2026-05-09T00:00:00.000Z",
    phase: "in-progress",
    touchedFiles: [{ path: "src/index.js", kind: "code" }],
  });

  const events = [];
  const hook = createToolExecuteAfterHook(
    { "tool.execute.after": async () => {} },
    {
      workflowState: store,
      audit: {
        async info(message, payload) {
          events.push({ message, payload });
        },
      },
      pluginContext: {
        directory: projectRoot,
        resolvePolicy() {
          return {
            outcome: "allow",
            details: {
              policy: {
                category: "implementation",
                identityStrategy: "story",
                branchRequired: true,
                finalization: "commit-and-push",
              },
            },
          };
        },
        listChangedFiles() {
          return ["src/index.js"];
        },
      },
    },
  );

  await hook(
    { sessionID: "s-finish-hook", tool: "finish", args: {} },
    { changedFiles: ["src/index.js"] },
  );

  const snapshot = store.get("s-finish-hook");
  assert.equal(snapshot.phase, "finish");
  assert.equal(snapshot.finalizationAssessment.reason, "finalizable-outputs-detected");
  assert.ok(
    events.some((entry) => entry.message === "workflow.finalization.evaluated"),
    "finish hook must emit workflow.finalization.evaluated",
  );
  assert.ok(
    events.some((entry) => entry.message === "git.finalization.outputs.detected"),
    "finish hook must emit git.finalization.outputs.detected when outputs exist",
  );
}

async function verifyToolExecuteAfterFinishPublishesCommitApproval() {
  const [{ createWorkflowStateStore }, { createToolExecuteAfterHook }] = await Promise.all([
    import(`${workflowStateModuleUrl}?finish-approval=${Date.now()}`),
    import(`${toolExecuteAfterModuleUrl}?finish-approval=${Date.now()}`),
  ]);

  const approvals = [];
  const events = [];
  const store = createWorkflowStateStore();
  store.set("s-finish-approval", {
    sessionID: "s-finish-approval",
    commandName: "bmad-bmm-quick-dev",
    arguments: "finish approval coverage",
    detectedAt: "2026-05-09T00:00:00.000Z",
    phase: "in-progress",
    touchedFiles: [{ path: "src/index.js", kind: "code" }],
  });

  const hook = createToolExecuteAfterHook(
    { "tool.execute.after": async () => {} },
    {
      workflowState: store,
      audit: {
        async info(message, payload) {
          events.push({ message, payload });
        },
      },
      pluginContext: {
        directory: projectRoot,
        resolvePolicy() {
          return {
            outcome: "allow",
            details: {
              policy: {
                category: "implementation",
                identityStrategy: "story",
                branchRequired: true,
                finalization: "commit-and-push",
              },
            },
          };
        },
        listChangedFiles() {
          return ["src/index.js", "README.md"];
        },
        async requestApproval(request) {
          approvals.push(request);
        },
      },
    },
  );

  await hook(
    { sessionID: "s-finish-approval", tool: "finish", args: {} },
    { changedFiles: ["src/index.js", "README.md"] },
  );

  assert.equal(approvals.length, 1, "finish hook must publish one commit approval request");
  assert.equal(approvals[0].actionType, "commit");
  assert.equal(approvals[0].proposal.kind, "commit");
  assert.deepEqual(approvals[0].proposal.files, ["src/index.js", "README.md"]);
  assert.equal(
    approvals[0].metadata.finalization,
    "commit-and-push",
    "commit approval must keep workflow finalization mode metadata",
  );
  assert.equal(store.get("s-finish-approval").approvalCurrent?.actionType, "commit");
  assert.ok(
    events.some((entry) => entry.message === "approval.requested"),
    "finish hook must emit approval.requested for commit proposals",
  );
}

async function verifyPermissionAskedAcceptExecutesCommitProposal() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?commit-accept=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?commit-accept=${Date.now()}`),
  ]);

  const events = [];
  const store = createWorkflowStateStore();
  store.set("s-commit-accept", {
    sessionID: "s-commit-accept",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: {
        isGitRepository: true,
        branch: "feat/story-3-2",
        hasRemote: true,
      },
    },
    approvalCurrent: {
      id: "approval:s-commit-accept:commit:commit",
      actionId: "action:commit:commit",
      sessionID: "s-commit-accept",
      workflow: "bmad-bmm-quick-dev",
      command: "bmad-bmm-quick-dev",
      phase: "finish",
      actionType: "commit",
      status: "awaitingApproval",
      proposal: {
        kind: "commit",
        action: "commit",
        message: "Finish bmad-bmm-quick-dev: update implementation outputs",
        artifactScope: "implementation",
        changeCountSummary: "1 code file",
        files: ["src/index.js"],
        correlationId: "corr-commit-accept",
      },
      metadata: {
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
      },
    },
    approvalHistory: [],
    pendingActions: [],
  });

  const hook = createPermissionAskedHook(
    { "permission.asked": async () => {} },
    {
      workflowState: store,
      audit: {
        async info(message, payload) {
          events.push({ message, payload });
        },
      },
      pluginContext: {
        async gitActionRunner({ action }) {
          assert.equal(action.kind, "commit");
          assert.deepEqual(action.files, ["src/index.js"]);
          return {
            observedState: {
              headBranch: "feat/story-3-2",
              hasRemote: true,
            },
          };
        },
      },
    },
  );

  await hook({
    sessionID: "s-commit-accept",
    approvalId: "approval:s-commit-accept:commit:commit",
    actionId: "action:commit:commit",
    outcome: "accept",
  });

  const state = store.get("s-commit-accept");
  assert.equal(state.approvalCurrent, null, "accept must clear the pending approval");
  assert.equal(state.lastGitAction.kind, "commit");
  assert.equal(state.lastGitResult.status, "succeeded");
  assert.equal(state.pendingRecoveryContext, null);
  assert.equal(state.commitProposal, null, "successful commit must clear commitProposal");
  assert.ok(
    events.some((entry) => entry.message === "git.action.executed"),
    "commit execution must emit git.action.executed",
  );
}

async function verifyPermissionAskedCommitFailureOpensRecovery() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?commit-failure=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?commit-failure=${Date.now()}`),
  ]);

  const prompts = [];
  const store = createWorkflowStateStore();
  store.set("s-commit-failure", {
    sessionID: "s-commit-failure",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: {
        isGitRepository: true,
        branch: "feat/story-3-2",
        hasRemote: true,
      },
    },
    approvalCurrent: {
      id: "approval:s-commit-failure:commit:commit",
      actionId: "action:commit:commit",
      sessionID: "s-commit-failure",
      workflow: "bmad-bmm-quick-dev",
      command: "bmad-bmm-quick-dev",
      phase: "finish",
      actionType: "commit",
      status: "awaitingApproval",
      proposal: {
        kind: "commit",
        action: "commit",
        message: "Finish bmad-bmm-quick-dev: update implementation outputs",
        artifactScope: "implementation",
        changeCountSummary: "1 code file",
        files: ["src/index.js"],
        correlationId: "corr-commit-failure",
      },
      metadata: {
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
      },
    },
    approvalHistory: [],
    pendingActions: [],
  });

  const hook = createPermissionAskedHook(
    { "permission.asked": async () => {} },
    {
      workflowState: store,
      audit: {
        async info() {},
      },
      pluginContext: {
        async gitActionRunner() {
          const error = new Error("nothing to commit");
          error.status = 1;
          error.stdout = "nothing to commit, working tree clean";
          throw error;
        },
        async requestRecoveryDecision(gate) {
          prompts.push(gate);
        },
      },
    },
  );

  await hook({
    sessionID: "s-commit-failure",
    approvalId: "approval:s-commit-failure:commit:commit",
    actionId: "action:commit:commit",
    outcome: "accept",
  });

  const state = store.get("s-commit-failure");
  assert.equal(state.lastGitAction.kind, "commit");
  assert.equal(state.lastGitResult.status, "failed");
  assert.equal(state.lastGitResult.code, "commit-failure");
  assert.equal(state.pendingRecoveryContext.code, "commit-failure");
  assert.equal(state.recoveryGate.actionKind, "commit");
  assert.equal(prompts.length, 1, "commit failure must deliver one recovery prompt");
}

/**
 * L4 (Story 2.1 second review): stale Git-evaluation fields (branchProposal /
 * initProposal / readiness) must NOT survive re-entry — they are recomputed
 * every call. Approval state and arbitrary future fields still carry over.
 */
async function verifyStaleGitFieldsInvalidatedOnReentry() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?l4=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?l4=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: { async info() {} },
    },
  );

  try {
    // First call seeds branchProposal/readiness.
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 l4-first", sessionID: "s-l4" },
      { parts: [] },
    );
    const seeded = workflowState.get("s-l4");
    assert.ok(seeded?.branchProposal, "verifyStaleGitFieldsInvalidatedOnReentry: branchProposal must seed on first call");
    assert.ok(seeded?.readiness, "verifyStaleGitFieldsInvalidatedOnReentry: readiness must seed on first call");

    // Inject a stale phantom proposal — must NOT survive next entry.
    workflowState.set("s-l4", {
      ...seeded,
      branchProposal: { kind: "branch", action: "create", name: "feat/STALE-PHANTOM", reason: "stale" },
      futureCustomField: { story: "2.3", marker: "must-survive" },
    });

    // Second entry recomputes — stale phantom must be wiped, future field preserved.
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 l4-second", sessionID: "s-l4" },
      { parts: [] },
    );
    const reComputed = workflowState.get("s-l4");
    assert.notEqual(
      reComputed?.branchProposal?.name,
      "feat/STALE-PHANTOM",
      "verifyStaleGitFieldsInvalidatedOnReentry: stale branchProposal must be invalidated on re-entry",
    );
    assert.deepEqual(
      reComputed?.futureCustomField,
      { story: "2.3", marker: "must-survive" },
      "verifyStaleGitFieldsInvalidatedOnReentry: arbitrary future fields must still carry over",
    );
    assert.ok(
      reComputed?.approvalCurrent,
      "verifyStaleGitFieldsInvalidatedOnReentry: approvalCurrent (pending) must still carry over",
    );
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 2.2: Explain Intent and Expected Impact in Approval Prompts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Story 2.2: redaction helpers — branch label, directory label, remote label.
 * These are pure helpers and the only place URL/path filtering should live
 * before reaching prompt body or audit metadata.
 */
async function verifyApprovalRedactionHelpers() {
  const { redactBranchLabel, redactDirectoryLabel, redactRemoteLabel } =
    await import(`${redactApprovalFieldsModuleUrl}?v=${Date.now()}`);

  // Branch label: only string + non-empty allowed; passes through otherwise.
  assert.equal(redactBranchLabel("feat/ABC-1"), "feat/ABC-1", "redactBranchLabel: passes safe slug");
  assert.equal(redactBranchLabel(""), null, "redactBranchLabel: empty → null");
  assert.equal(redactBranchLabel(null), null, "redactBranchLabel: null → null");
  assert.equal(redactBranchLabel(undefined), null, "redactBranchLabel: undefined → null");

  // Directory label: never returns the raw path.
  const safeDir = redactDirectoryLabel("/Users/secret/private/project");
  assert.equal(
    safeDir,
    "current working directory",
    "redactDirectoryLabel: must NEVER return the raw absolute path",
  );
  assert.ok(
    !safeDir.includes("/"),
    "redactDirectoryLabel: must not contain a slash from the raw input",
  );

  // Remote label: only short identifiers like "origin"; URLs and paths rejected.
  assert.equal(redactRemoteLabel("origin"), "origin", "redactRemoteLabel: passes name");
  assert.equal(redactRemoteLabel("upstream"), "upstream", "redactRemoteLabel: passes name");
  assert.equal(
    redactRemoteLabel("https://example.com/repo.git"),
    null,
    "redactRemoteLabel: must reject full URL",
  );
  assert.equal(
    redactRemoteLabel("git@example.com:org/repo.git"),
    null,
    "redactRemoteLabel: must reject SSH URL",
  );
  assert.equal(redactRemoteLabel(""), null, "redactRemoteLabel: empty → null");
  assert.equal(redactRemoteLabel(null), null, "redactRemoteLabel: null → null");
}

/**
 * Story 2.2: explanation builder — canonical payload contract.
 * Verifies:
 *   - all categories produce intent/impact/workflow/policy fields
 *   - sensitivity = "sanitized", detailLevel = "concise" are fixed
 *   - branch reason code is preserved as a code, not as a sentence
 *   - identity/finalization rationale is rule-based
 */
async function verifyApprovalExplanationContracts() {
  const { buildApprovalExplanation, buildFallbackExplanation } = await import(
    `${buildApprovalExplanationModuleUrl}?v=${Date.now()}`
  );

  const workflowContext = {
    commandName: "bmad-bmm-quick-dev",
    normalizedCommand: "bmad-bmm-quick-dev",
  };
  const workflowPolicy = {
    category: "implementation",
    identityStrategy: "ticket-or-args",
    branchRequired: true,
    finalization: "commit-and-push",
  };

  // branch/create
  const branchCreate = buildApprovalExplanation({
    actionCategory: "branch/create",
    workflowContext,
    workflowPolicy,
    branchProposal: {
      kind: "branch",
      action: "create",
      name: "feat/ABC-1",
      current: "main",
      reason: "current-branch-is-long-lived",
    },
  });
  assert.equal(branchCreate.actionCategory, "branch/create", "explanation: actionCategory preserved");
  assert.equal(branchCreate.sensitivity, "sanitized", "explanation: sensitivity must be sanitized");
  assert.equal(branchCreate.detailLevel, "concise", "explanation: detailLevel must be concise");
  for (const key of ["intentSummary", "impactSummary", "workflowSummary", "policyRationale"]) {
    assert.equal(typeof branchCreate[key], "string", `explanation: ${key} must be a string`);
    assert.ok(branchCreate[key].length > 0, `explanation: ${key} must be non-empty`);
  }
  assert.equal(branchCreate.fields.targetBranchLabel, "feat/ABC-1", "explanation: target branch preserved");
  assert.equal(branchCreate.fields.currentBranchLabel, "main", "explanation: current branch preserved");
  assert.equal(
    branchCreate.fields.branchReasonCode,
    "current-branch-is-long-lived",
    "explanation: branch reason code preserved",
  );
  assert.ok(
    branchCreate.policyRationale.includes("전용 브랜치 정책") ||
      branchCreate.policyRationale.includes("브랜치 정책"),
    "explanation: branchRequired=true must surface in policyRationale",
  );

  // branch/switch with no explicit reason
  const branchSwitch = buildApprovalExplanation({
    actionCategory: "branch/switch",
    workflowContext,
    workflowPolicy,
    branchProposal: {
      kind: "branch",
      action: "switch",
      name: "feat/ABC-2",
      current: "feat/ABC-1",
      reason: "candidate-differs-from-current",
    },
  });
  assert.equal(branchSwitch.fields.targetBranchLabel, "feat/ABC-2");
  assert.equal(branchSwitch.fields.currentBranchLabel, "feat/ABC-1");
  assert.notEqual(
    branchSwitch.fields.targetBranchLabel,
    branchSwitch.fields.currentBranchLabel,
    "explanation: target/current branch must not be confused",
  );

  // init: directory must be a label, not a raw path
  const initExplanation = buildApprovalExplanation({
    actionCategory: "init",
    workflowContext,
    workflowPolicy,
    initProposal: {
      kind: "init",
      action: "git-init",
      directory: "/Users/secret/some/private/path",
      reason: "git-not-initialized",
    },
    readiness: {
      outcome: "ask",
      reason: "git-not-initialized",
    },
  });
  assert.equal(initExplanation.fields.directoryLabel, "current working directory");
  assert.ok(
    !initExplanation.fields.directoryLabel.includes("/"),
    "explanation: directoryLabel must not include a slash",
  );
  assert.equal(initExplanation.fields.repoStateCode, "git-not-initialized");
  assert.ok(
    initExplanation.policyRationale.includes("초기화") ||
      initExplanation.policyRationale.includes("Git"),
    "explanation: init rationale must mention initialization",
  );

  // push: only remote name, no full URL
  const pushExplanation = buildApprovalExplanation({
    actionCategory: "push",
    workflowContext,
    workflowPolicy,
    pushProposal: {
      kind: "push",
      action: "push",
      remote: "origin",
      branch: "feat/ABC-1",
    },
  });
  assert.equal(pushExplanation.fields.targetRemoteLabel, "origin");
  assert.equal(pushExplanation.fields.targetBranchLabel, "feat/ABC-1");

  // push: full remote URL passed in must be redacted to null
  const pushWithUrl = buildApprovalExplanation({
    actionCategory: "push",
    workflowContext,
    workflowPolicy,
    pushProposal: {
      kind: "push",
      action: "push",
      remote: "https://github.com/example/repo.git",
      branch: "feat/ABC-1",
    },
  });
  assert.equal(
    pushWithUrl.fields.targetRemoteLabel,
    null,
    "explanation: full remote URL must be redacted to null, never passed through",
  );

  // commit: extension point preserved even though Epic 3 will source the proposal
  const commitExplanation = buildApprovalExplanation({
    actionCategory: "commit",
    workflowContext,
    workflowPolicy,
  });
  assert.equal(typeof commitExplanation.intentSummary, "string");
  assert.equal(commitExplanation.fields.finalizationMode, "commit-and-push");

  // fallback explanation must be safe and labelled
  const fb = buildFallbackExplanation("branch/create");
  assert.equal(fb.actionCategory, "branch/create");
  assert.equal(fb.sensitivity, "sanitized");
  assert.equal(fb.detailLevel, "concise");
  assert.equal(typeof fb.intentSummary, "string");
  assert.equal(typeof fb.policyRationale, "string");
}

/**
 * Story 2.2: buildApprovalRequest — body/metadata derived from a single
 * canonical explanation payload, with full Story 2.2 fields populated.
 */
async function verifyBuildApprovalRequestStory22Fields() {
  const { buildApprovalRequest } = await import(
    `${buildApprovalRequestModuleUrl}?v22=${Date.now()}`
  );

  const proposal = {
    kind: "branch",
    action: "create",
    name: "feat/ABC-1",
    current: "main",
    reason: "current-branch-is-long-lived",
  };
  const workflowContext = {
    commandName: "bmad-bmm-quick-dev",
    normalizedCommand: "bmad-bmm-quick-dev",
  };
  const workflowPolicy = {
    category: "implementation",
    identityStrategy: "ticket-or-args",
    branchRequired: true,
    finalization: "commit-and-push",
  };

  const req = buildApprovalRequest({
    sessionID: "s-22-1",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    actionLabel: "Create branch: feat/ABC-1",
    proposal,
    workflowContext,
    workflowPolicy,
    readiness: { outcome: "allow", reason: "ready" },
  });

  // Prompt body — Story 2.2 fields
  assert.equal(typeof req.prompt.title, "string", "prompt.title must be a string");
  assert.equal(typeof req.prompt.summary, "string", "prompt.summary must remain a string (backward compat)");
  assert.ok(Array.isArray(req.prompt.lines), "prompt.lines must be an array");
  assert.equal(req.prompt.lines.length, 4, "prompt.lines must contain exactly 4 explanation lines");
  assert.ok(
    req.prompt.lines[0].startsWith("Intent:") &&
      req.prompt.lines[1].startsWith("Impact:") &&
      req.prompt.lines[2].startsWith("Context:") &&
      req.prompt.lines[3].startsWith("Why approval is needed:"),
    "prompt.lines must follow Intent/Impact/Context/Why approval is needed ordering",
  );

  // Metadata — schema + canonical explanation
  assert.equal(req.metadata.event, "approval.requested", "metadata.event must equal approval.requested");
  assert.equal(req.metadata.actionCategory, "branch/create", "metadata.actionCategory");
  assert.equal(req.metadata.proposalKind, "branch", "metadata.proposalKind preserved");
  assert.equal(req.metadata.proposalAction, "create", "metadata.proposalAction");
  assert.equal(req.metadata.policyCategory, "implementation");
  assert.equal(req.metadata.identityStrategy, "ticket-or-args");
  assert.equal(req.metadata.finalization, "commit-and-push");
  assert.equal(req.metadata.detailLevel, "concise");
  assert.equal(req.metadata.sensitivity, "sanitized");

  // Explanation block must mirror canonical fields
  for (const key of ["intentSummary", "impactSummary", "workflowSummary", "policyRationale"]) {
    assert.equal(typeof req.metadata.explanation[key], "string", `explanation.${key} must be a string`);
    assert.ok(req.metadata.explanation[key].length > 0, `explanation.${key} must be non-empty`);
  }

  // Source-of-truth: prompt summary must equal explanation.intentSummary so
  // there is no second formatting path for the same idea.
  assert.equal(
    req.prompt.summary,
    req.metadata.explanation.intentSummary,
    "prompt.summary must derive from the same canonical intentSummary",
  );

  // Action-specific fields
  assert.equal(req.metadata.explanation.fields.targetBranchLabel, "feat/ABC-1");
  assert.equal(req.metadata.explanation.fields.currentBranchLabel, "main");
  assert.equal(req.metadata.explanation.fields.branchReasonCode, "current-branch-is-long-lived");
}

/**
 * Story 2.2: redaction at the request level — sensitive inputs in the proposal
 * must NOT leak into prompt text or metadata.
 */
async function verifyApprovalRedactionThroughRequest() {
  const { buildApprovalRequest } = await import(
    `${buildApprovalRequestModuleUrl}?v22redact=${Date.now()}`
  );

  // init proposal carrying an absolute path — must NOT surface in prompt or metadata
  const sensitivePath = "/Users/secret/private-project";
  const initReq = buildApprovalRequest({
    sessionID: "s-22-redact-init",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "init",
    actionLabel: "Initialize Git repository",
    proposal: {
      kind: "init",
      action: "git-init",
      directory: sensitivePath,
      reason: "git-not-initialized",
      message: `Git repository initialization is required for ${sensitivePath}.`,
    },
    workflowContext: { commandName: "bmad-bmm-quick-dev" },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "ticket-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    readiness: { outcome: "ask", reason: "git-not-initialized" },
  });

  const promptText = [
    initReq.prompt.title,
    initReq.prompt.summary,
    ...(initReq.prompt.lines || []),
  ].join("\n");
  assert.ok(
    !promptText.includes(sensitivePath),
    "redaction: prompt must not include absolute path from init proposal",
  );
  assert.ok(
    !JSON.stringify(initReq.metadata).includes(sensitivePath),
    "redaction: metadata must not include absolute path from init proposal",
  );
  assert.equal(
    initReq.metadata.explanation.fields.directoryLabel,
    "current working directory",
    "redaction: directoryLabel must be the safe label",
  );

  // push proposal carrying a full remote URL — must NOT surface anywhere
  const sensitiveUrl = "https://corp.example.com/team/secret-repo.git";
  const pushReq = buildApprovalRequest({
    sessionID: "s-22-redact-push",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "finish",
    actionType: "push",
    actionLabel: "Push commits to remote",
    proposal: {
      kind: "push",
      action: "push",
      remote: sensitiveUrl,
      branch: "feat/ABC-1",
    },
    workflowContext: { commandName: "bmad-bmm-quick-dev" },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "ticket-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
  });
  const pushPromptText = [
    pushReq.prompt.title,
    pushReq.prompt.summary,
    ...(pushReq.prompt.lines || []),
  ].join("\n");
  assert.ok(
    !pushPromptText.includes(sensitiveUrl),
    "redaction: prompt must not include full remote URL",
  );
  assert.ok(
    !JSON.stringify(pushReq.metadata).includes(sensitiveUrl),
    "redaction: metadata must not include full remote URL",
  );
  assert.equal(
    pushReq.metadata.explanation.fields.targetRemoteLabel,
    null,
    "redaction: targetRemoteLabel must be null when input is a URL",
  );

  // raw arguments containing a secret-like string must never reach prompt/metadata
  const rawArgs = "ABC-123 --auth-token=hunter2-supersecret";
  const branchReq = buildApprovalRequest({
    sessionID: "s-22-redact-branch",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    actionLabel: "Create branch: feat/ABC-1",
    proposal: { kind: "branch", action: "create", name: "feat/ABC-1", current: "main", reason: "current-branch-is-long-lived" },
    workflowContext: { commandName: "bmad-bmm-quick-dev", arguments: rawArgs },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "ticket-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
  });
  const branchPromptText = [
    branchReq.prompt.title,
    branchReq.prompt.summary,
    ...(branchReq.prompt.lines || []),
  ].join("\n");
  assert.ok(
    !branchPromptText.includes("hunter2-supersecret"),
    "redaction: prompt must not echo raw argument secret",
  );
  assert.ok(
    !JSON.stringify(branchReq.metadata).includes("hunter2-supersecret"),
    "redaction: metadata must not echo raw argument secret",
  );
}

/**
 * Story 2.2: hook integration — explanation flows from command-execute-before
 * through to the workflow state without losing fields and stays sanitized in
 * the audit pipeline.
 */
async function verifyApprovalExplanationHookIntegration() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?explain-hook=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?explain-hook=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();
  const logs = [];
  const prompts = [];

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
        requestApproval(request) {
          prompts.push(request);
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  try {
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-123 hook-explain", sessionID: "s-explain-hook" },
      { parts: [] },
    );

    const state = workflowState.get("s-explain-hook");
    const req = state?.approvalCurrent;
    assert.ok(req, "hook integration: approvalCurrent must be set");

    // Story 2.2 fields end-to-end
    assert.equal(req.metadata.event, "approval.requested");
    assert.equal(req.metadata.actionCategory, req.actionType);
    assert.ok(req.metadata.explanation, "hook integration: metadata.explanation must be present");
    assert.equal(req.metadata.sensitivity, "sanitized");
    assert.equal(req.metadata.detailLevel, "concise");
    for (const key of ["intentSummary", "impactSummary", "workflowSummary", "policyRationale"]) {
      assert.equal(
        typeof req.metadata.explanation[key],
        "string",
        `hook integration: explanation.${key} must be a string`,
      );
    }
    assert.ok(Array.isArray(req.prompt.lines), "hook integration: prompt.lines must be an array");
    assert.equal(req.prompt.lines.length, 4, "hook integration: prompt.lines must have 4 entries");

    // Workflow context surfaced as policy-derived fields, not raw args
    assert.equal(req.metadata.policyCategory, "implementation");
    assert.equal(req.metadata.identityStrategy, "ticket-or-args");

    // Sanity: requestApproval was called and got the same prompt structure
    assert.equal(prompts.length, 1, "hook integration: requestApproval must be called once");
    assert.equal(prompts[0].id, req.id, "hook integration: prompt and stashed request share id");
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.2: graceful degradation — when proposal data is malformed enough to
 * break explanation building, the request still ships with a safe fallback
 * explanation rather than throwing.
 */
async function verifyApprovalExplanationFallback() {
  const { buildApprovalRequest } = await import(
    `${buildApprovalRequestModuleUrl}?v22fallback=${Date.now()}`
  );

  // (1) Missing-policy path — canonical builder still produces a payload, so
  // fallback flag must be FALSE here.
  const reqMissingPolicy = buildApprovalRequest({
    sessionID: "s-22-fallback",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal: { kind: "branch", action: "create", name: "feat/ABC-1" },
    // workflowPolicy intentionally omitted; explanation must still produce safe defaults
  });

  assert.equal(reqMissingPolicy.metadata.event, "approval.requested");
  assert.equal(reqMissingPolicy.metadata.sensitivity, "sanitized");
  assert.equal(reqMissingPolicy.metadata.detailLevel, "concise");
  assert.equal(typeof reqMissingPolicy.metadata.explanation.policyRationale, "string");
  assert.ok(reqMissingPolicy.metadata.explanation.policyRationale.length > 0);
  assert.equal(reqMissingPolicy.metadata.policyCategory, null, "fallback: policyCategory must be null when no policy provided");
  assert.equal(reqMissingPolicy.metadata.identityStrategy, null, "fallback: identityStrategy must be null when no policy provided");
  assert.equal(
    reqMissingPolicy.metadata.explanation.fallback,
    false,
    "fallback flag must be false when canonical builder succeeds",
  );

  // (2) Forced builder failure — proposal.reason getter throws. Fingerprint
  // building only reads kind/action/name/current/directory so it succeeds; the
  // explanation builder reads `proposal.reason` which throws, so the
  // safeBuildExplanation catch must engage and produce fallback=true.
  const explodingProposal = {
    kind: "branch",
    action: "create",
    name: "feat/ABC-1",
    current: "main",
    get reason() {
      throw new Error("simulated explanation builder failure");
    },
  };
  const reqExploded = buildApprovalRequest({
    sessionID: "s-22-fallback-throw",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal: explodingProposal,
    workflowContext: { commandName: "bmad-bmm-quick-dev" },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "ticket-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
  });
  assert.equal(reqExploded.status, "awaitingApproval", "fallback: request must still be awaitingApproval");
  assert.equal(
    reqExploded.metadata.explanation.fallback,
    true,
    "fallback flag must be true when canonical builder throws",
  );
  assert.equal(reqExploded.metadata.sensitivity, "sanitized");
  assert.equal(reqExploded.metadata.detailLevel, "concise");
  // Generic safe copy must populate the four core fields.
  for (const key of ["intentSummary", "impactSummary", "workflowSummary", "policyRationale"]) {
    assert.equal(typeof reqExploded.metadata.explanation[key], "string", `fallback.${key} must be string`);
    assert.ok(reqExploded.metadata.explanation[key].length > 0, `fallback.${key} must be non-empty`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 2.3: Support Accept, Deny, and Ignore-and-Continue Outcomes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Story 2.3: approval-resolution-state pure helpers.
 * Asserts the state machine constants and transition validator.
 */
async function verifyApprovalResolutionStateContracts() {
  const mod = await import(`${approvalResolutionStateModuleUrl}?v23-state=${Date.now()}`);
  const {
    APPROVAL_OUTCOMES,
    APPROVAL_OUTCOME_VALUES,
    TERMINAL_OUTCOMES,
    CONTINUATION,
    APPROVAL_RESOLUTION_REASONS,
    isTerminalOutcome,
    isValidOutcome,
    continuationFor,
    skipReasonFor,
    validateTransition,
  } = mod;

  assert.deepEqual(APPROVAL_OUTCOME_VALUES, [
    "pending",
    "accept",
    "deny",
    "ignore-and-continue",
  ]);
  assert.deepEqual(TERMINAL_OUTCOMES, ["accept", "deny", "ignore-and-continue"]);
  assert.equal(APPROVAL_OUTCOMES.PENDING, "pending");
  assert.equal(CONTINUATION.EXECUTE_NOW, "execute-now");
  assert.equal(CONTINUATION.CONTINUE_WITHOUT_ACTION, "continue-without-action");
  assert.equal(APPROVAL_RESOLUTION_REASONS.APPROVAL_DENIED, "approval-denied");
  assert.equal(APPROVAL_RESOLUTION_REASONS.APPROVAL_IGNORED, "approval-ignored");

  // isTerminalOutcome / isValidOutcome
  assert.equal(isTerminalOutcome("accept"), true);
  assert.equal(isTerminalOutcome("deny"), true);
  assert.equal(isTerminalOutcome("ignore-and-continue"), true);
  assert.equal(isTerminalOutcome("pending"), false);
  assert.equal(isTerminalOutcome("anything-else"), false);
  assert.equal(isValidOutcome("pending"), true);
  assert.equal(isValidOutcome("accept"), true);
  assert.equal(isValidOutcome("nope"), false);

  // continuationFor
  assert.equal(continuationFor("accept"), "execute-now");
  assert.equal(continuationFor("deny"), "continue-without-action");
  assert.equal(continuationFor("ignore-and-continue"), "continue-without-action");
  assert.equal(continuationFor("pending"), null);

  // skipReasonFor
  assert.equal(skipReasonFor("deny"), "approval-denied");
  assert.equal(skipReasonFor("ignore-and-continue"), "approval-ignored");
  assert.equal(skipReasonFor("accept"), null);

  // validateTransition
  assert.equal(validateTransition("pending", "accept").ok, true);
  assert.equal(validateTransition("pending", "deny").ok, true);
  assert.equal(validateTransition("pending", "ignore-and-continue").ok, true);
  assert.equal(validateTransition("pending", "pending").ok, false);
  assert.equal(validateTransition("accept", "deny").ok, false);
  assert.equal(validateTransition("deny", "accept").ok, false);
  assert.equal(validateTransition("pending", "wrong").ok, false);
}

/**
 * Story 2.3: buildApprovalResolution / buildApprovalResolvedAudit /
 * buildGitActionSkippedAudit pure payload contracts.
 */
async function verifyBuildApprovalResolutionContracts() {
  const mod = await import(`${buildApprovalResolutionModuleUrl}?v23-build=${Date.now()}`);
  const {
    deriveActionKind,
    buildApprovalResolution,
    buildApprovalResolvedAudit,
    buildGitActionSkippedAudit,
  } = mod;

  assert.equal(deriveActionKind("branch/create"), "branch");
  assert.equal(deriveActionKind("branch/switch"), "branch");
  assert.equal(deriveActionKind("init"), "init");
  assert.equal(deriveActionKind("push"), "push");
  assert.equal(deriveActionKind(""), null);
  assert.equal(deriveActionKind(null), null);

  const baseRequest = {
    id: "approval:s-23:branch/create:branch:create:feat/X",
    actionId: "action:branch/create:branch:create:feat/X",
    sessionID: "s-23",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    status: "awaitingApproval",
  };

  const resolved = buildApprovalResolution({
    request: baseRequest,
    outcome: "accept",
    sourceHook: "permission.asked",
    resolvedAt: "2026-05-09T10:00:00.000Z",
  });
  assert.equal(resolved.approvalId, baseRequest.id);
  assert.equal(resolved.actionId, baseRequest.actionId);
  assert.equal(resolved.sessionID, baseRequest.sessionID);
  assert.equal(resolved.actionKind, "branch");
  assert.equal(resolved.actionType, "branch/create");
  assert.equal(resolved.status, "accept");
  assert.equal(resolved.previousStatus, "pending");
  assert.equal(resolved.continuation, "execute-now");
  assert.equal(resolved.resolvedAt, "2026-05-09T10:00:00.000Z");
  assert.equal(resolved.sourceHook, "permission.asked");
  assert.equal(resolved.metadata.phase, "start");
  assert.equal(resolved.metadata.workflow, "bmad-bmm-quick-dev");

  const denied = buildApprovalResolution({
    request: baseRequest,
    outcome: "deny",
    resolvedAt: "2026-05-09T10:00:01.000Z",
  });
  assert.equal(denied.continuation, "continue-without-action");

  const ignored = buildApprovalResolution({
    request: baseRequest,
    outcome: "ignore-and-continue",
    resolvedAt: "2026-05-09T10:00:02.000Z",
  });
  assert.equal(ignored.continuation, "continue-without-action");

  // approval.resolved audit shape
  const audit = buildApprovalResolvedAudit({
    request: baseRequest,
    resolution: resolved,
    hadActiveApproval: true,
  });
  assert.equal(audit.event, "approval.resolved");
  assert.equal(audit.workflow, baseRequest.workflow);
  assert.equal(audit.command, baseRequest.command);
  assert.equal(audit.sessionID, baseRequest.sessionID);
  assert.equal(audit.approvalId, resolved.approvalId);
  assert.equal(audit.actionId, resolved.actionId);
  assert.equal(audit.outcome, "accept");
  assert.equal(audit.details.actionKind, "branch");
  assert.equal(audit.details.actionType, "branch/create");
  assert.equal(audit.details.continuation, "execute-now");
  assert.equal(audit.details.phase, "start");
  assert.equal(audit.details.sourceHook, "permission.asked");
  assert.equal(audit.details.hadActiveApproval, true);

  // git.action.skipped only emitted for deny / ignore-and-continue
  assert.equal(
    buildGitActionSkippedAudit({ request: baseRequest, resolution: resolved }),
    null,
    "buildGitActionSkippedAudit: accept must return null",
  );
  const skipDeny = buildGitActionSkippedAudit({ request: baseRequest, resolution: denied });
  assert.equal(skipDeny.event, "git.action.skipped");
  assert.equal(skipDeny.outcome, "deny");
  assert.equal(skipDeny.details.reason, "approval-denied");
  assert.equal(skipDeny.details.continuation, "continue-without-action");
  const skipIgnore = buildGitActionSkippedAudit({
    request: baseRequest,
    resolution: ignored,
  });
  assert.equal(skipIgnore.outcome, "ignore-and-continue");
  assert.equal(skipIgnore.details.reason, "approval-ignored");
}

/**
 * Story 2.3: build a workflowState seeded with a Story 2.1 ApprovalRequest
 * and exercise consumeApprovalOutcome end-to-end. Reusable helper.
 */
async function _seedApprovalState({ outcomeFor = null } = {}) {
  const [{ createWorkflowStateStore }, buildModule] = await Promise.all([
    import(`${workflowStateModuleUrl}?v23-seed=${Date.now()}`),
    import(`${buildApprovalRequestModuleUrl}?v23-seed=${Date.now()}`),
  ]);
  const { buildApprovalRequest } = buildModule;

  const store = createWorkflowStateStore();
  const proposal = {
    kind: "branch",
    action: "create",
    name: "feat/STORY-23",
    current: "main",
    reason: "branch-required-for-implementation",
  };
  const request = buildApprovalRequest({
    sessionID: "s-23-seed",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal,
    workflowContext: { commandName: "bmad-bmm-quick-dev" },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "ticket-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
  });
  store.set("s-23-seed", {
    sessionID: "s-23-seed",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    branchProposal: proposal,
    approvalCurrent: request,
    approvalHistory: [request],
    pendingActions: [],
    lastContinuationDecision: null,
  });
  return { store, request, proposal, outcomeFor };
}

/**
 * Story 2.3: accept resolves state, appends history, leaves continuation
 * marker, and emits only `approval.resolved` (no git.action.skipped).
 */
async function verifyConsumeApprovalOutcomeAccept() {
  const { consumeApprovalOutcome } = await import(
    `${consumeApprovalOutcomeModuleUrl}?v23-accept=${Date.now()}`
  );
  const { store, request } = await _seedApprovalState();

  const result = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-23-seed",
    outcome: "accept",
    sourceHook: "permission.asked",
  });

  assert.equal(result.outcome, "resolved");
  assert.equal(result.hadActiveApproval, true);
  assert.equal(result.resolution.status, "accept");
  assert.equal(result.resolution.continuation, "execute-now");
  assert.equal(result.resolution.actionId, request.actionId);
  assert.equal(result.resolution.approvalId, request.id);

  const events = result.auditEvents;
  assert.equal(events.length, 1, "accept must emit only approval.resolved");
  assert.equal(events[0].event, "approval.resolved");
  assert.equal(events[0].outcome, "accept");
  assert.equal(events[0].details.continuation, "execute-now");
  assert.equal(events[0].details.actionKind, "branch");

  const finalState = store.get("s-23-seed");
  assert.equal(finalState.approvalCurrent, null, "accept must clear approvalCurrent");
  assert.equal(finalState.approvalHistory.length, 2, "history must include resolution snapshot");
  const last = finalState.approvalHistory[1];
  assert.equal(last.status, "accept");
  assert.equal(last.resolution.continuation, "execute-now");
  assert.equal(finalState.lastContinuationDecision.outcome, "accept");
  assert.equal(finalState.lastContinuationDecision.continuation, "execute-now");
}

/**
 * Story 2.3: deny clears state, emits both approval.resolved (outcome=deny)
 * and git.action.skipped (reason=approval-denied), and never invokes any
 * mutation-capable executor (asserted by the absence of additional events).
 */
async function verifyConsumeApprovalOutcomeDeny() {
  const { consumeApprovalOutcome } = await import(
    `${consumeApprovalOutcomeModuleUrl}?v23-deny=${Date.now()}`
  );
  const { store, request } = await _seedApprovalState();

  const result = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-23-seed",
    outcome: "deny",
  });

  assert.equal(result.outcome, "resolved");
  assert.equal(result.resolution.status, "deny");
  assert.equal(result.resolution.continuation, "continue-without-action");

  const events = result.auditEvents;
  assert.equal(events.length, 2, "deny must emit approval.resolved AND git.action.skipped");
  assert.equal(events[0].event, "approval.resolved");
  assert.equal(events[0].outcome, "deny");
  assert.equal(events[0].details.continuation, "continue-without-action");
  assert.equal(events[1].event, "git.action.skipped");
  assert.equal(events[1].outcome, "deny");
  assert.equal(events[1].details.reason, "approval-denied");
  assert.equal(events[1].details.continuation, "continue-without-action");
  assert.equal(events[1].actionId, request.actionId);

  const finalState = store.get("s-23-seed");
  assert.equal(finalState.approvalCurrent, null);
  assert.equal(finalState.lastContinuationDecision.outcome, "deny");
  assert.equal(finalState.lastContinuationDecision.continuation, "continue-without-action");
}

/**
 * Story 2.3: ignore-and-continue mirrors deny in shape but uses the
 * "approval-ignored" reason code so audit consumers can distinguish them.
 */
async function verifyConsumeApprovalOutcomeIgnoreAndContinue() {
  const { consumeApprovalOutcome } = await import(
    `${consumeApprovalOutcomeModuleUrl}?v23-ignore=${Date.now()}`
  );
  const { store } = await _seedApprovalState();

  const result = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-23-seed",
    outcome: "ignore-and-continue",
  });

  assert.equal(result.outcome, "resolved");
  assert.equal(result.resolution.status, "ignore-and-continue");
  assert.equal(result.resolution.continuation, "continue-without-action");

  const events = result.auditEvents;
  assert.equal(events.length, 2);
  assert.equal(events[1].event, "git.action.skipped");
  assert.equal(events[1].outcome, "ignore-and-continue");
  assert.equal(events[1].details.reason, "approval-ignored");
  assert.equal(events[1].details.continuation, "continue-without-action");

  const finalState = store.get("s-23-seed");
  assert.equal(finalState.lastContinuationDecision.outcome, "ignore-and-continue");
}

/**
 * Story 2.3: idempotency — duplicate resolve / unknown outcome / no-active /
 * unknown session must all return outcome:"skip" without throwing or
 * mutating anything beyond what the first call did.
 */
async function verifyConsumeApprovalOutcomeIdempotent() {
  const { consumeApprovalOutcome } = await import(
    `${consumeApprovalOutcomeModuleUrl}?v23-idem=${Date.now()}`
  );
  const { store } = await _seedApprovalState();

  // First resolve succeeds.
  const first = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-23-seed",
    outcome: "accept",
  });
  assert.equal(first.outcome, "resolved");

  const stateAfterFirst = store.get("s-23-seed");
  const historyLengthAfterFirst = stateAfterFirst.approvalHistory.length;

  // Second resolve on already-resolved approval is a no-op.
  const second = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-23-seed",
    outcome: "deny",
  });
  assert.equal(second.outcome, "skip");
  assert.equal(second.reason, "no-active-approval");

  const stateAfterSecond = store.get("s-23-seed");
  assert.equal(
    stateAfterSecond.approvalHistory.length,
    historyLengthAfterFirst,
    "duplicate resolve must not append another history entry",
  );

  // Unknown session
  const unknown = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-not-tracked",
    outcome: "accept",
  });
  assert.equal(unknown.outcome, "skip");
  assert.equal(unknown.reason, "session-not-tracked");

  // Invalid outcome
  const invalid = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-23-seed",
    outcome: "yolo",
  });
  assert.equal(invalid.outcome, "skip");
  assert.equal(invalid.reason, "invalid-outcome");

  // pending is not a valid resolve target
  const pendingTarget = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-23-seed",
    outcome: "pending",
  });
  assert.equal(pendingTarget.outcome, "skip");
  assert.equal(pendingTarget.reason, "invalid-outcome");
}

/**
 * Story 2.3 (post-review MED-1): the resolver no longer touches the
 * pendingActions queue. Queue-head removal is the responsibility of the
 * next planning pass (`command.execute.before` promotion). In production,
 * pendingActions[0] never shares its actionId with the approvalCurrent
 * because command-execute-before's queue-append guard
 * (`candidateActionId !== activeActionId`) prevents that fixture. So the
 * resolver MUST leave the queue intact.
 */
async function verifyConsumeApprovalOutcomeLeavesQueueIntact() {
  const [{ createWorkflowStateStore }, buildModule, { consumeApprovalOutcome }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?v23-queue=${Date.now()}`),
      import(`${buildApprovalRequestModuleUrl}?v23-queue=${Date.now()}`),
      import(`${consumeApprovalOutcomeModuleUrl}?v23-queue=${Date.now()}`),
    ]);
  const { buildApprovalRequest, buildActionId } = buildModule;
  const store = createWorkflowStateStore();

  const activeProposal = {
    kind: "branch",
    action: "create",
    name: "feat/active-head",
    current: "main",
  };
  const activeRequest = buildApprovalRequest({
    sessionID: "s-23-q",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal: activeProposal,
  });

  const queuedProposal = {
    kind: "init",
    action: "git-init",
    directory: "current working directory",
  };
  const queuedItem = {
    actionId: buildActionId("init", queuedProposal),
    approvalId: null,
    kind: "init",
    action: "git-init",
    proposal: queuedProposal,
    requiresApproval: true,
    sessionID: "s-23-q",
    phase: "start",
    createdAt: "2026-05-09T09:00:00.000Z",
  };

  store.set("s-23-q", {
    sessionID: "s-23-q",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: activeRequest,
    approvalHistory: [activeRequest],
    pendingActions: [queuedItem],
    lastContinuationDecision: null,
  });

  const result = consumeApprovalOutcome({
    workflowState: store,
    sessionID: "s-23-q",
    outcome: "accept",
  });
  assert.equal(result.outcome, "resolved");

  const finalState = store.get("s-23-q");
  assert.equal(finalState.approvalCurrent, null, "active slot must be cleared on accept");
  assert.equal(
    finalState.pendingActions.length,
    1,
    "resolver must not advance the queue — that is command.execute.before's job",
  );
  assert.equal(
    finalState.pendingActions[0].actionId,
    queuedItem.actionId,
    "queue head must be untouched after resolver",
  );
}

/**
 * Story 2.3 (post-review MED-1): when the previous active approval has
 * resolved and the queue has a pending head, the next `command.execute.before`
 * pass must promote that head into approvalCurrent and shift it off the
 * queue, instead of re-running the proposal-priority fallback.
 */
async function verifyCommandExecuteBeforePromotesQueueHead() {
  const [
    { createWorkflowStateStore },
    buildModule,
    commandBeforeModule,
    { DEFAULT_PLUGIN_CONFIG },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?v23-promote=${Date.now()}`),
    import(`${buildApprovalRequestModuleUrl}?v23-promote=${Date.now()}`),
    import(`${commandExecuteBeforeModuleUrl}?v23-promote=${Date.now()}`),
    import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
  ]);
  const { buildActionId } = buildModule;

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();
  const logs = [];

  const queuedProposal = {
    kind: "branch",
    action: "create",
    name: "feature/QUEUED-1",
    current: "main",
    reason: "queued-promotion",
    isLongLived: false,
  };
  const queuedItem = {
    actionId: buildActionId("branch/create", queuedProposal),
    approvalId: null,
    kind: "branch",
    action: "create",
    proposal: queuedProposal,
    requiresApproval: true,
    sessionID: "s-23-promote",
    phase: "start",
    createdAt: "2026-05-09T09:00:00.000Z",
  };

  // Seed the session as if a prior approval has just been resolved:
  //   - approvalCurrent = null  (resolved)
  //   - pendingActions = [queuedItem]  (queue head waiting to promote)
  workflowState.set("s-23-promote", {
    sessionID: "s-23-promote",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: null,
    approvalHistory: [],
    pendingActions: [queuedItem],
    lastContinuationDecision: {
      approvalId: "apr_prior",
      actionId: "act_prior",
      outcome: "deny",
      continuation: "continue-without-action",
      resolvedAt: "2026-05-09T09:00:00.000Z",
      sourceHook: "permission.asked",
    },
  });

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  try {
    await hook(
      {
        command: "/bmad-bmm-quick-dev",
        arguments: "QUEUED-1 promote",
        sessionID: "s-23-promote",
      },
      { parts: [] },
    );

    const finalState = workflowState.get("s-23-promote");
    assert.ok(finalState.approvalCurrent, "queue head must be promoted to approvalCurrent");
    assert.equal(
      finalState.approvalCurrent.actionId,
      queuedItem.actionId,
      "promoted approval must carry the queued actionId",
    );
    assert.equal(
      finalState.pendingActions.length,
      0,
      "queue head must be shifted off after promotion",
    );

    const requestedLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(requestedLogs.length, 1, "promotion must publish a fresh approval.requested");
    assert.equal(
      requestedLogs[0].extra.details.actionId,
      queuedItem.actionId,
      "approval.requested audit must reference the promoted actionId",
    );
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.3: permission.asked hook ingress — runtime payload echoing the
 * approval requestId and "approve"/"deny"/"ignore" outcome must drive
 * consumeApprovalOutcome and emit audit events. Unrelated permission events
 * (no requestId echo) must not touch approval state.
 */
async function verifyPermissionAskedHookFlow() {
  const [
    { createWorkflowStateStore },
    buildModule,
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?v23-hook=${Date.now()}`),
    import(`${buildApprovalRequestModuleUrl}?v23-hook=${Date.now()}`),
    import(`${permissionAskedModuleUrl}?v23-hook=${Date.now()}`),
  ]);

  const store = createWorkflowStateStore();
  const proposal = {
    kind: "branch",
    action: "create",
    name: "feat/HOOK-1",
    current: "main",
  };
  const request = buildModule.buildApprovalRequest({
    sessionID: "s-23-hook",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal,
  });
  store.set("s-23-hook", {
    sessionID: "s-23-hook",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: request,
    approvalHistory: [request],
    pendingActions: [],
    lastContinuationDecision: null,
  });

  const logs = [];
  let legacyCalls = 0;
  const hook = createPermissionAskedHook(
    {
      "permission.asked": async () => {
        legacyCalls += 1;
      },
    },
    {
      workflowState: store,
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  // (1) Unrelated permission event — no requestId/actionId echo. Must not
  // resolve our approval.
  await hook({ sessionID: "s-23-hook", tool: "write", arguments: {} });
  assert.equal(
    store.get("s-23-hook").approvalCurrent?.id,
    request.id,
    "unrelated permission event must not resolve approval",
  );
  assert.equal(legacyCalls, 1, "legacy delegate must be invoked");
  assert.equal(
    logs.some((l) => l.message === "approval.resolved"),
    false,
    "no approval.resolved event for unrelated permission",
  );

  // (2) Echoed requestId + outcome="deny" → resolve with deny.
  await hook({
    sessionID: "s-23-hook",
    tool: "write",
    requestId: request.id,
    outcome: "deny",
  });
  const stateAfterDeny = store.get("s-23-hook");
  assert.equal(stateAfterDeny.approvalCurrent, null, "deny must clear approvalCurrent");
  assert.equal(
    stateAfterDeny.lastContinuationDecision.outcome,
    "deny",
    "lastContinuationDecision must reflect deny",
  );
  const resolvedLogs = logs.filter((l) => l.message === "approval.resolved");
  const skippedLogs = logs.filter((l) => l.message === "git.action.skipped");
  assert.equal(resolvedLogs.length, 1);
  assert.equal(resolvedLogs[0].extra.outcome, "deny");
  assert.equal(skippedLogs.length, 1);
  assert.equal(skippedLogs[0].extra.details.reason, "approval-denied");
  assert.equal(legacyCalls, 2, "legacy delegate must be invoked again");

  // (3) Replay same payload — already-resolved branch is idempotent (no new
  // audit events).
  await hook({
    sessionID: "s-23-hook",
    tool: "write",
    requestId: request.id,
    outcome: "deny",
  });
  assert.equal(
    logs.filter((l) => l.message === "approval.resolved").length,
    1,
    "idempotent replay must not emit a second approval.resolved",
  );

  // (4) actionId echo also matches active approval (alternate ingress path).
  store.set("s-23-hook", {
    sessionID: "s-23-hook",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: request,
    approvalHistory: [request],
    pendingActions: [],
    lastContinuationDecision: null,
  });
  await hook({
    sessionID: "s-23-hook",
    tool: "write",
    actionId: request.actionId,
    outcome: "ignore-and-continue",
  });
  const stateAfterIgnore = store.get("s-23-hook");
  assert.equal(stateAfterIgnore.approvalCurrent, null);
  assert.equal(stateAfterIgnore.lastContinuationDecision.outcome, "ignore-and-continue");
}

/**
 * Story 2.3: session.deleted cleanup — clearing the session removes
 * approvalCurrent/approvalHistory/pendingActions/lastContinuationDecision.
 */
async function verifySessionDeletedClearsAllApprovalState() {
  const wrapperMod = await import(`${wrapperModuleUrl}?v23-cleanup=${Date.now()}`);
  const noGit = createGitWorkspace();
  try {
    const mock = createMockClient();
    const handlers = await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: noGit,
    });

    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-23 cleanup", sessionID: "s-23-cleanup" },
      { parts: [] },
    );
    // approval should be set
    // (workflowState is private to bootstrap; we assert via re-entry after
    //  session.deleted: a brand-new approvalCurrent must be created.)
    await handlers.event({
      event: { type: "session.deleted", properties: { sessionID: "s-23-cleanup" } },
    });

    // Re-entry on the same sessionID must behave as a brand-new session.
    const promptsBefore = mock.prompts.length;
    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-23 cleanup-2", sessionID: "s-23-cleanup" },
      { parts: [] },
    );
    assert.ok(
      mock.prompts.length >= promptsBefore + 1,
      "re-entry after session.deleted must publish a fresh approval prompt",
    );
  } finally {
    fs.rmSync(noGit, { recursive: true, force: true });
  }
}

/**
 * Story 2.3: ApprovalRequest now carries a stable `actionId` derived from
 * the proposal fingerprint.
 */
async function verifyApprovalRequestActionIdContract() {
  const { buildApprovalRequest, buildActionId } = await import(
    `${buildApprovalRequestModuleUrl}?v23-actionid=${Date.now()}`
  );
  const proposal = { kind: "branch", action: "create", name: "feat/AID-1", current: "main" };
  const req = buildApprovalRequest({
    sessionID: "s-23-aid",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal,
  });
  assert.equal(typeof req.actionId, "string", "actionId must be a string");
  assert.ok(req.actionId.length > 0, "actionId must be non-empty");
  assert.notEqual(req.actionId, req.id, "actionId and id must be distinct strings");
  assert.equal(
    req.actionId,
    buildActionId("branch/create", proposal),
    "actionId must match buildActionId output for the same inputs",
  );
}

/**
 * Story 2.3: approval.requested audit event must include the actionId so the
 * resolved/skipped events can be correlated downstream.
 */
async function verifyApprovalRequestedAuditIncludesActionId() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?v23-aid-audit=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?v23-aid-audit=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();
  const logs = [];

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  try {
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-23 audit", sessionID: "s-23-audit" },
      { parts: [] },
    );

    const requestedLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(requestedLogs.length, 1);
    const detail = requestedLogs[0].extra.details;
    assert.equal(typeof detail.actionId, "string", "details.actionId must be string");
    assert.ok(detail.actionId.length > 0, "details.actionId must be non-empty");
    const stateActiveActionId = workflowState.get("s-23-audit").approvalCurrent.actionId;
    assert.equal(
      detail.actionId,
      stateActiveActionId,
      "audit details.actionId must match approvalCurrent.actionId",
    );
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.3 post-review (MED-2): the approval.requested audit details must
 * carry the story-spec fields (actionKind, actionName, proposalKind,
 * proposalReason, requiresApproval, phase) alongside the existing Story 2.3
 * traceability extensions (requestId, actionId, actionType, sessionID,
 * explanationFallback).
 */
async function verifyApprovalRequestedAuditDetailsShape() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?v23-detail-shape=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?v23-detail-shape=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();
  const logs = [];

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    { "command.execute.before": async () => {} },
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: DEFAULT_PLUGIN_CONFIG.branch,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = DEFAULT_PLUGIN_CONFIG.workflowPolicy[wfCtx.commandName];
          if (!policy) return { outcome: "ask", details: { fallback: {} } };
          return { outcome: "allow", details: { policy } };
        },
      },
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  try {
    await hook(
      { command: "/bmad-bmm-quick-dev", arguments: "DETAIL-1 audit", sessionID: "s-23-detail" },
      { parts: [] },
    );

    const requestedLogs = logs.filter((l) => l.message === "approval.requested");
    assert.equal(requestedLogs.length, 1);
    const details = requestedLogs[0].extra.details;

    // Story-spec required keys
    assert.equal(typeof details.actionKind, "string", "details.actionKind required");
    assert.ok(details.actionKind.length > 0, "details.actionKind non-empty");
    assert.equal(typeof details.actionName, "string", "details.actionName required");
    assert.ok(details.actionName.length > 0, "details.actionName non-empty");
    assert.equal(typeof details.proposalKind, "string", "details.proposalKind required");
    assert.equal(
      Object.prototype.hasOwnProperty.call(details, "proposalReason"),
      true,
      "details.proposalReason must be present (string or null)",
    );
    assert.equal(
      details.requiresApproval,
      true,
      "details.requiresApproval must be the literal true",
    );
    assert.equal(typeof details.phase, "string", "details.phase required");

    // Traceability superset
    assert.equal(typeof details.requestId, "string", "details.requestId required");
    assert.equal(typeof details.actionId, "string", "details.actionId required");
    assert.equal(typeof details.actionType, "string", "details.actionType required");
    assert.equal(typeof details.sessionID, "string", "details.sessionID required");
    assert.equal(
      typeof details.explanationFallback,
      "boolean",
      "details.explanationFallback required",
    );
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.3 post-review (LOW-2): the prompt metadata forwarded to
 * client.session.promptAsync must include actionId so the permission-asked
 * ingress can resolve via the actionId echo path (not only requestId).
 */
async function verifyPromptMetadataIncludesActionId() {
  const wrapperMod = await import(`${wrapperModuleUrl}?v23-prompt-aid=${Date.now()}`);
  const gitWorkspace = createGitWorkspace({ initialize: true });
  try {
    const mock = createMockClient();
    const handlers = await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: gitWorkspace,
    });

    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "AID-PROMPT-1", sessionID: "s-23-prompt-aid" },
      { parts: [] },
    );

    assert.ok(mock.prompts.length >= 1, "promptAsync must have been invoked at least once");
    const metadata = mock.prompts[0].parts?.[0]?.metadata;
    assert.ok(metadata, "prompt parts[0].metadata required");
    assert.equal(typeof metadata.actionId, "string", "prompt metadata.actionId required");
    assert.ok(metadata.actionId.length > 0, "prompt metadata.actionId must be non-empty");
    // requestId path must remain intact for backwards compatibility
    assert.equal(typeof metadata.requestId, "string", "prompt metadata.requestId required");
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.3 post-review (LOW-5): when permission-asked matches our active
 * approval but the payload outcome is unknown, the hook must emit
 * approval.resolution.failed (reason="unknown-outcome") for visibility,
 * instead of silently skipping.
 */
async function verifyPermissionAskedHookEmitsResolutionFailedOnUnknownOutcome() {
  const [{ createWorkflowStateStore }, buildModule, { createPermissionAskedHook }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?v23-low5=${Date.now()}`),
      import(`${buildApprovalRequestModuleUrl}?v23-low5=${Date.now()}`),
      import(`${permissionAskedModuleUrl}?v23-low5=${Date.now()}`),
    ]);
  const store = createWorkflowStateStore();
  const proposal = { kind: "branch", action: "create", name: "feat/LOW5-1", current: "main" };
  const request = buildModule.buildApprovalRequest({
    sessionID: "s-23-low5",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal,
  });
  store.set("s-23-low5", {
    sessionID: "s-23-low5",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: request,
    approvalHistory: [request],
    pendingActions: [],
    lastContinuationDecision: null,
  });

  const logs = [];
  const hook = createPermissionAskedHook(
    { "permission.asked": async () => {} },
    {
      workflowState: store,
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  // Echoed requestId matches active approval, but outcome is gibberish.
  await hook({
    sessionID: "s-23-low5",
    tool: "write",
    requestId: request.id,
    outcome: "frobnicate",
  });

  // Active approval must remain — resolver must not have run.
  const after = store.get("s-23-low5");
  assert.equal(after.approvalCurrent?.id, request.id, "unknown outcome must not resolve");

  const failureLogs = logs.filter((l) => l.message === "approval.resolution.failed");
  assert.equal(
    failureLogs.length,
    1,
    "unknown outcome must emit a single approval.resolution.failed event",
  );
  assert.equal(failureLogs[0].extra.details.reason, "unknown-outcome");
  assert.equal(failureLogs[0].extra.details.sourceHook, "permission.asked");
  assert.equal(failureLogs[0].extra.approvalId, request.id);
  assert.equal(failureLogs[0].extra.actionId, request.actionId);
}

/**
 * Story 2.3 post-review (LOW-4): the permission-asked ingress must inject
 * the canonical reasonCode for deny (approval-denied) and ignore-and-continue
 * (approval-ignored) so the resolution snapshot recorded in approvalHistory
 * carries the standard code.
 */
async function verifyPermissionAskedHookInjectsReasonCode() {
  const [{ createWorkflowStateStore }, buildModule, { createPermissionAskedHook }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?v23-low4=${Date.now()}`),
      import(`${buildApprovalRequestModuleUrl}?v23-low4=${Date.now()}`),
      import(`${permissionAskedModuleUrl}?v23-low4=${Date.now()}`),
    ]);

  async function runOnce(outcomeWord, expectedReason) {
    const store = createWorkflowStateStore();
    const proposal = {
      kind: "branch",
      action: "create",
      name: `feat/LOW4-${outcomeWord}`,
      current: "main",
    };
    const request = buildModule.buildApprovalRequest({
      sessionID: `s-23-low4-${outcomeWord}`,
      workflow: "bmad-bmm-quick-dev",
      command: "bmad-bmm-quick-dev",
      phase: "start",
      actionType: "branch/create",
      proposal,
    });
    store.set(`s-23-low4-${outcomeWord}`, {
      sessionID: `s-23-low4-${outcomeWord}`,
      commandName: "bmad-bmm-quick-dev",
      phase: "start",
      approvalCurrent: request,
      approvalHistory: [request],
      pendingActions: [],
      lastContinuationDecision: null,
    });

    const hook = createPermissionAskedHook(
      { "permission.asked": async () => {} },
      { workflowState: store, audit: { async info() {} } },
    );

    await hook({
      sessionID: `s-23-low4-${outcomeWord}`,
      tool: "write",
      requestId: request.id,
      outcome: outcomeWord,
    });

    const after = store.get(`s-23-low4-${outcomeWord}`);
    const last = after.approvalHistory[after.approvalHistory.length - 1];
    assert.equal(
      last.resolution.reasonCode,
      expectedReason,
      `outcome=${outcomeWord} must record resolution.reasonCode=${expectedReason}`,
    );
  }

  await runOnce("deny", "approval-denied");
  await runOnce("ignore-and-continue", "approval-ignored");

  // accept must NOT carry a skip-reason code (resolver passes null through).
  const store = createWorkflowStateStore();
  const proposal = { kind: "branch", action: "create", name: "feat/LOW4-accept", current: "main" };
  const request = buildModule.buildApprovalRequest({
    sessionID: "s-23-low4-accept",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal,
  });
  store.set("s-23-low4-accept", {
    sessionID: "s-23-low4-accept",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: request,
    approvalHistory: [request],
    pendingActions: [],
    lastContinuationDecision: null,
  });
  const hook = createPermissionAskedHook(
    { "permission.asked": async () => {} },
    { workflowState: store, audit: { async info() {} } },
  );
  await hook({
    sessionID: "s-23-low4-accept",
    tool: "write",
    requestId: request.id,
    outcome: "accept",
  });
  const after = store.get("s-23-low4-accept");
  const last = after.approvalHistory[after.approvalHistory.length - 1];
  assert.equal(
    last.resolution.reasonCode,
    null,
    "accept must record resolution.reasonCode=null",
  );
}

/**
 * Story 2.3 second review (LOW): the permission-asked outcome parser must NOT
 * fall back to the generic `input.action` field. Runtimes commonly populate
 * `action` with the tool/operation name, which would otherwise collide with
 * the alias table on unrelated permission events. The parser must only honor
 * the dedicated decision keys (`outcome | decision | response | choice`).
 */
async function verifyPermissionAskedHookIgnoresGenericActionField() {
  const [{ createWorkflowStateStore }, buildModule, { createPermissionAskedHook }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?v23-low-action=${Date.now()}`),
      import(`${buildApprovalRequestModuleUrl}?v23-low-action=${Date.now()}`),
      import(`${permissionAskedModuleUrl}?v23-low-action=${Date.now()}`),
    ]);

  const store = createWorkflowStateStore();
  const proposal = {
    kind: "branch",
    action: "create",
    name: "feat/LOW-ACTION-1",
    current: "main",
  };
  const request = buildModule.buildApprovalRequest({
    sessionID: "s-23-low-action",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "start",
    actionType: "branch/create",
    proposal,
  });
  store.set("s-23-low-action", {
    sessionID: "s-23-low-action",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: request,
    approvalHistory: [request],
    pendingActions: [],
    lastContinuationDecision: null,
  });

  const logs = [];
  const hook = createPermissionAskedHook(
    { "permission.asked": async () => {} },
    {
      workflowState: store,
      audit: {
        async info(message, extra) {
          logs.push({ message, extra });
        },
      },
    },
  );

  // Runtime echoes the requestId AND populates `action: "allow"` (the tool's
  // intent, not an outcome decision). Without the LOW fix, "allow" would map
  // through OUTCOME_ALIASES → "accept" and silently close the approval.
  await hook({
    sessionID: "s-23-low-action",
    tool: "write",
    requestId: request.id,
    action: "allow",
  });

  const after = store.get("s-23-low-action");
  assert.equal(
    after.approvalCurrent?.id,
    request.id,
    "input.action='allow' must NOT resolve the active approval",
  );
  // Parser returns null → unknown-outcome surfaces via approval.resolution.failed.
  const failureLogs = logs.filter((l) => l.message === "approval.resolution.failed");
  assert.equal(
    failureLogs.length,
    1,
    "missing dedicated decision field must emit approval.resolution.failed",
  );
  assert.equal(failureLogs[0].extra.details.reason, "unknown-outcome");

  // Sanity: the dedicated decision key still works on a fresh approval.
  store.set("s-23-low-action", {
    sessionID: "s-23-low-action",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: request,
    approvalHistory: [request],
    pendingActions: [],
    lastContinuationDecision: null,
  });
  await hook({
    sessionID: "s-23-low-action",
    tool: "write",
    requestId: request.id,
    decision: "accept",
  });
  assert.equal(
    store.get("s-23-low-action").approvalCurrent,
    null,
    "decision='accept' must still resolve via the dedicated key",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 2.4 — detect and report Git conflicts and execution failures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Story 2.4: classifier contract — canonical FAILURE_CODES set, public
 * signature, and per-action-kind mapping for the documented taxonomy.
 */
async function verifyClassifyGitExecutionFailureContract() {
  const { classifyGitExecutionFailure, FAILURE_CODES } = await import(
    `${classifyGitExecutionFailureModuleUrl}?contract=${Date.now()}`
  );

  // Frozen canonical code set — only-extend-do-not-narrow rule from Story 2.4.
  assert.deepEqual(
    Object.values(FAILURE_CODES).sort(),
    [
      "branch-conflict",
      "branch-switch-mismatch",
      "commit-failure",
      "execution-unavailable",
      "push-rejection",
      "repository-state-mismatch",
      "unknown-git-failure",
    ],
    "classifier: FAILURE_CODES must expose exactly the seven canonical codes",
  );
  assert.ok(
    Object.isFrozen(FAILURE_CODES),
    "classifier: FAILURE_CODES must be frozen so callers cannot mutate the taxonomy",
  );

  // Branch / create / "already exists" → branch-conflict.
  const branchConflict = classifyGitExecutionFailure({
    action: { kind: "branch", operation: "create", branchName: "feat/X" },
    error: { status: 128, stderr: "fatal: A branch named 'feat/X' already exists." },
    expectedState: { headBranch: "main" },
    observedState: { headBranch: "main" },
  });
  assert.equal(branchConflict.code, FAILURE_CODES.BRANCH_CONFLICT);
  assert.equal(typeof branchConflict.message, "string");
  assert.equal(branchConflict.details.recoverable, true);
  assert.equal(branchConflict.details.suggestedRecoveryKind, "switch-existing-branch");
  assert.ok(
    typeof branchConflict.details.stderrSummary === "string" &&
      branchConflict.details.stderrSummary.length <= 240,
    "classifier: stderr must be summarized, never raw passthrough",
  );

  // Branch post-condition mismatch → branch-switch-mismatch (no preflightDrift
  // assertion, so the executor-side post-condition path is reachable).
  const switchMismatch = classifyGitExecutionFailure({
    action: { kind: "branch", operation: "switch", targetBranch: "feat/X" },
    error: null,
    expectedState: { headBranch: "feat/X" },
    observedState: { headBranch: "main" },
  });
  assert.equal(switchMismatch.code, FAILURE_CODES.BRANCH_SWITCH_MISMATCH);
  assert.equal(switchMismatch.details.recoverable, true);
  assert.equal(switchMismatch.details.suggestedRecoveryKind, "manual-fix-branch");

  // Detached HEAD post-condition still maps to branch-switch-mismatch.
  const detached = classifyGitExecutionFailure({
    action: { kind: "branch", operation: "switch", targetBranch: "feat/X" },
    error: null,
    expectedState: { headBranch: "feat/X" },
    observedState: { headBranch: "(detached)", headDetached: true },
  });
  assert.equal(detached.code, FAILURE_CODES.BRANCH_SWITCH_MISMATCH);

  // Commit / nothing-to-commit → commit-failure.
  const commitNothing = classifyGitExecutionFailure({
    action: { kind: "commit", operation: "commit" },
    error: { status: 1, stdout: "nothing to commit, working tree clean" },
  });
  assert.equal(commitNothing.code, FAILURE_CODES.COMMIT_FAILURE);
  assert.equal(commitNothing.details.recoverable, true);

  // Push / non-fast-forward → push-rejection.
  const pushReject = classifyGitExecutionFailure({
    action: { kind: "push", operation: "push", branchName: "feat/X", remoteName: "origin" },
    error: { status: 1, stderr: "! [rejected] feat/X -> feat/X (non-fast-forward)" },
  });
  assert.equal(pushReject.code, FAILURE_CODES.PUSH_REJECTION);
  assert.equal(pushReject.details.recoverable, true);
  assert.equal(pushReject.details.suggestedRecoveryKind, "retry-after-sync");

  // Push / protected branch → push-rejection (non-recoverable hint).
  const pushProtected = classifyGitExecutionFailure({
    action: { kind: "push", operation: "push", branchName: "main", remoteName: "origin" },
    error: { status: 1, stderr: "remote: error: GH006: Protected branch update failed" },
  });
  assert.equal(pushProtected.code, FAILURE_CODES.PUSH_REJECTION);
  assert.equal(pushProtected.details.recoverable, false);

  // Execution-unavailable wins over push semantics.
  const execMissing = classifyGitExecutionFailure({
    action: { kind: "push", operation: "push" },
    error: { code: "ENOENT", message: "spawn git ENOENT" },
  });
  assert.equal(execMissing.code, FAILURE_CODES.EXECUTION_UNAVAILABLE);
  assert.equal(execMissing.details.recoverable, false);

  // Subprocess timeout → execution-unavailable.
  const execTimeout = classifyGitExecutionFailure({
    action: { kind: "commit", operation: "commit" },
    error: { killed: true, signal: "SIGTERM" },
  });
  assert.equal(execTimeout.code, FAILURE_CODES.EXECUTION_UNAVAILABLE);

  // Preflight drift wins over everything.
  const drift = classifyGitExecutionFailure({
    action: { kind: "commit", operation: "commit" },
    preflightDrift: true,
    expectedState: { headBranch: "feat/X", hasStagedChanges: true },
    observedState: { headBranch: "main", hasStagedChanges: false },
    error: { status: 1, stderr: "nothing to commit" },
  });
  assert.equal(drift.code, FAILURE_CODES.REPOSITORY_STATE_MISMATCH);

  // Unknown action kind → unknown-git-failure.
  const unknown = classifyGitExecutionFailure({
    action: { kind: "weird", operation: "?" },
    error: { status: 1 },
  });
  assert.equal(unknown.code, FAILURE_CODES.UNKNOWN_GIT_FAILURE);
}

/**
 * Story 2.4: executor envelope shape — ok/status/action/code/message/details/
 * audit/next must always be present.
 */
async function verifyGitExecutorEnvelopeShape() {
  const { executeGitAction } = await import(
    `${gitExecutorModuleUrl}?envelope-shape=${Date.now()}`
  );

  const envelope = await executeGitAction({
    plan: { kind: "branch", operation: "switch", targetBranch: "feat/X", correlationId: "corr-1" },
    expectedState: { headBranch: "feat/X" },
    repositorySnapshot: { headBranch: "feat/X" },
    workflowContext: { sessionID: "s-2-4-shape", commandName: "bmad-bmm-quick-dev", phase: "start" },
    gitRunner: async () => ({ observedState: { headBranch: "feat/X" } }),
  });

  for (const key of ["ok", "status", "action", "code", "message", "details", "audit", "next"]) {
    assert.ok(
      Object.hasOwn(envelope, key),
      `executor envelope must always include the "${key}" field`,
    );
  }
  assert.equal(envelope.ok, true);
  assert.equal(envelope.status, "succeeded");
  assert.equal(envelope.code, null);
  assert.equal(envelope.action.correlationId, "corr-1");
  assert.equal(envelope.action.kind, "branch");
  assert.equal(envelope.action.operation, "switch");
  assert.equal(envelope.action.targetBranch, "feat/X");
  assert.equal(envelope.next.continueWorkflow, true);
  assert.equal(envelope.next.requiresRecoveryChoice, false);
}

/**
 * Story 2.4: preflight drift short-circuits BEFORE the runner is invoked.
 * Mutating execution against drifted state is unsafe and must produce
 * repository-state-mismatch with no subprocess attempt.
 */
async function verifyGitExecutorPreflightShortCircuit() {
  const { executeGitAction } = await import(
    `${gitExecutorModuleUrl}?preflight=${Date.now()}`
  );

  let runnerCalls = 0;
  const envelope = await executeGitAction({
    plan: { kind: "commit", operation: "commit", correlationId: "corr-pf" },
    expectedState: { headBranch: "feat/X", hasStagedChanges: true },
    repositorySnapshot: { headBranch: "main", hasStagedChanges: false },
    workflowContext: { sessionID: "s-2-4-pf", commandName: "bmad-bmm-quick-dev", phase: "start" },
    gitRunner: async () => {
      runnerCalls += 1;
      return { stdout: "" };
    },
  });

  assert.equal(runnerCalls, 0, "preflight drift must short-circuit BEFORE the runner is called");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.status, "failed");
  assert.equal(envelope.code, "repository-state-mismatch");
  assert.equal(envelope.details.recoverable, true);
  assert.equal(envelope.details.suggestedRecoveryKind, "re-evaluate-after-refresh");
}

/**
 * Story 2.4: subprocess errors flow through the classifier and the executor
 * envelope mirrors stable, machine-readable codes.
 */
async function verifyGitExecutorSubprocessFailureMapping() {
  const { executeGitAction } = await import(
    `${gitExecutorModuleUrl}?subproc-fail=${Date.now()}`
  );

  // Push / non-fast-forward.
  const pushEnvelope = await executeGitAction({
    plan: {
      kind: "push",
      operation: "push",
      branchName: "feat/X",
      remoteName: "origin",
      correlationId: "corr-push",
    },
    expectedState: { headBranch: "feat/X", hasRemote: true },
    repositorySnapshot: { headBranch: "feat/X", hasRemote: true },
    workflowContext: { sessionID: "s-push", commandName: "bmad-bmm-quick-dev", phase: "start" },
    gitRunner: async () => {
      const error = new Error("git push rejected");
      error.status = 1;
      error.stderr = "! [rejected] feat/X -> feat/X (non-fast-forward)";
      throw error;
    },
  });
  assert.equal(pushEnvelope.ok, false);
  assert.equal(pushEnvelope.code, "push-rejection");
  assert.equal(typeof pushEnvelope.message, "string");
  assert.equal(pushEnvelope.details.remoteName, "origin");
  assert.equal(pushEnvelope.details.recoverable, true);
  assert.equal(pushEnvelope.next.requiresRecoveryChoice, true);

  // Commit / nothing to commit.
  const commitEnvelope = await executeGitAction({
    plan: { kind: "commit", operation: "commit", correlationId: "corr-commit" },
    expectedState: { headBranch: "feat/X" },
    repositorySnapshot: { headBranch: "feat/X" },
    workflowContext: { sessionID: "s-commit", commandName: "bmad-bmm-quick-dev", phase: "start" },
    gitRunner: async () => {
      const error = new Error("git commit failed");
      error.status = 1;
      error.stdout = "nothing to commit, working tree clean";
      throw error;
    },
  });
  assert.equal(commitEnvelope.ok, false);
  assert.equal(commitEnvelope.code, "commit-failure");

  // Branch / create / already exists.
  const branchEnvelope = await executeGitAction({
    plan: {
      kind: "branch",
      operation: "create",
      branchName: "feat/X",
      correlationId: "corr-branch",
    },
    expectedState: { headBranch: "main" },
    repositorySnapshot: { headBranch: "main" },
    workflowContext: { sessionID: "s-branch", commandName: "bmad-bmm-quick-dev", phase: "start" },
    gitRunner: async () => {
      const error = new Error("branch exists");
      error.status = 128;
      error.stderr = "fatal: A branch named 'feat/X' already exists.";
      throw error;
    },
  });
  assert.equal(branchEnvelope.code, "branch-conflict");

  // Subprocess spawn failure → execution-unavailable wins.
  const execEnvelope = await executeGitAction({
    plan: { kind: "push", operation: "push", correlationId: "corr-spawn" },
    workflowContext: { sessionID: "s-exec", commandName: "bmad-bmm-quick-dev", phase: "start" },
    gitRunner: async () => {
      const error = new Error("spawn git ENOENT");
      error.code = "ENOENT";
      throw error;
    },
  });
  assert.equal(execEnvelope.code, "execution-unavailable");
  assert.equal(execEnvelope.details.recoverable, false);
  assert.equal(
    execEnvelope.next.requiresRecoveryChoice,
    false,
    "execution-unavailable failures cannot be addressed via runtime recovery choices",
  );
}

/**
 * Story 2.4: post-condition mismatch on a successful subprocess run still
 * produces a failure envelope — branch landed on the wrong head.
 */
async function verifyGitExecutorPostConditionFailure() {
  const { executeGitAction } = await import(
    `${gitExecutorModuleUrl}?postcond=${Date.now()}`
  );

  const envelope = await executeGitAction({
    plan: { kind: "branch", operation: "switch", targetBranch: "feat/X", correlationId: "corr-pc" },
    expectedState: { headBranch: "feat/X" },
    repositorySnapshot: { headBranch: "main" },
    workflowContext: { sessionID: "s-pc", commandName: "bmad-bmm-quick-dev", phase: "start" },
    // Runner reports success but observedState says HEAD never moved.
    gitRunner: async () => ({ observedState: { headBranch: "main" } }),
  });

  // Preflight runs first — expected vs repositorySnapshot already disagree —
  // so this case actually short-circuits as repository-state-mismatch. That is
  // the correct contract: drift dominates, so the runner never gets invoked.
  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, "repository-state-mismatch");

  // Now a true post-condition failure: preflight matches, runner exits cleanly,
  // but observedState afterwards differs from expectedState.
  const postOnlyEnvelope = await executeGitAction({
    plan: { kind: "branch", operation: "switch", targetBranch: "feat/X", correlationId: "corr-pc2" },
    expectedState: { headBranch: "feat/X" },
    repositorySnapshot: { headBranch: "feat/X" }, // preflight aligned
    workflowContext: { sessionID: "s-pc2", commandName: "bmad-bmm-quick-dev", phase: "start" },
    gitRunner: async () => ({ observedState: { headBranch: "main" } }),
  });
  assert.equal(postOnlyEnvelope.ok, false);
  assert.equal(postOnlyEnvelope.code, "branch-switch-mismatch");
  assert.equal(postOnlyEnvelope.details.recoverable, true);
}

/**
 * Story 2.4: structured `git.action.executed` audit event payload — required
 * fields plus best-effort behavior when the audit sink throws.
 */
async function verifyGitExecutorAuditEventPayload() {
  const { executeGitAction } = await import(
    `${gitExecutorModuleUrl}?audit=${Date.now()}`
  );

  const recorded = [];
  const envelope = await executeGitAction({
    plan: {
      kind: "push",
      operation: "push",
      branchName: "feat/X",
      remoteName: "origin",
      correlationId: "corr-audit",
    },
    expectedState: { headBranch: "feat/X", hasRemote: true },
    repositorySnapshot: { headBranch: "feat/X", hasRemote: true },
    workflowContext: {
      sessionID: "s-audit",
      commandName: "bmad-bmm-quick-dev",
      phase: "in-progress",
    },
    gitRunner: async () => {
      const error = new Error("rejected");
      error.status = 1;
      error.stderr = "! [rejected] feat/X (non-fast-forward)";
      throw error;
    },
    audit: {
      async info(message, payload) {
        recorded.push({ message, payload });
      },
    },
  });

  assert.equal(recorded.length, 1, "executor must emit exactly one git.action.executed event");
  const [{ message, payload }] = recorded;
  assert.equal(message, "git.action.executed");
  assert.equal(payload.event, "git.action.executed");
  assert.equal(typeof payload.timestamp, "string");
  assert.equal(payload.workflow, "bmad-bmm-quick-dev");
  assert.equal(payload.command, "bmad-bmm-quick-dev");
  assert.equal(payload.outcome, "failed");
  assert.equal(payload.details.actionKind, "push");
  assert.equal(payload.details.operation, "push");
  assert.equal(payload.details.code, "push-rejection");
  assert.equal(payload.details.branch, "feat/X");
  assert.equal(payload.details.remoteName, "origin");
  assert.equal(payload.details.correlationId, "corr-audit");
  assert.equal(payload.details.phase, "end");
  assert.equal(payload.details.sessionID, "s-audit");
  assert.equal(payload.details.recoverable, true);
  assert.equal(typeof payload.details.stderrSummary, "string");
  assert.ok(
    !/\(non-fast-forward\)\n/.test(payload.details.stderrSummary),
    "audit payload must not carry raw multi-line stderr",
  );

  assert.equal(envelope.audit.attempted, true);
  assert.equal(envelope.audit.logged, true);
  assert.equal(envelope.audit.loggingError, null);

  // Best-effort: throwing audit sink must not corrupt the primary envelope.
  const throwingEnvelope = await executeGitAction({
    plan: {
      kind: "push",
      operation: "push",
      branchName: "feat/X",
      remoteName: "origin",
      correlationId: "corr-audit-fail",
    },
    expectedState: { headBranch: "feat/X", hasRemote: true },
    repositorySnapshot: { headBranch: "feat/X", hasRemote: true },
    workflowContext: { sessionID: "s-audit-fail", commandName: "bmad-bmm-quick-dev", phase: "end" },
    gitRunner: async () => {
      const error = new Error("rejected");
      error.status = 1;
      error.stderr = "! [rejected]";
      throw error;
    },
    audit: {
      async info() {
        throw new Error("audit sink unavailable");
      },
    },
  });
  assert.equal(throwingEnvelope.ok, false);
  assert.equal(throwingEnvelope.code, "push-rejection");
  assert.equal(throwingEnvelope.audit.attempted, true);
  assert.equal(throwingEnvelope.audit.logged, false);
  assert.equal(typeof throwingEnvelope.audit.loggingError, "string");
}

/**
 * Story 2.4: workflowState mirror — executor persists lastGitAction /
 * lastGitResult / lastGitFailure / pendingRecoveryContext, and get() deep
 * clones each so external mutations cannot leak back into the store.
 */
async function verifyWorkflowStateExecutionMirror() {
  const [{ createWorkflowStateStore }, { executeGitAction }] = await Promise.all([
    import(`${workflowStateModuleUrl}?exec-mirror=${Date.now()}`),
    import(`${gitExecutorModuleUrl}?exec-mirror=${Date.now()}`),
  ]);

  const store = createWorkflowStateStore();
  store.set("s-exec-mirror", {
    sessionID: "s-exec-mirror",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
    approvalCurrent: null,
    approvalHistory: [],
  });

  await executeGitAction({
    plan: {
      kind: "push",
      operation: "push",
      branchName: "feat/X",
      remoteName: "origin",
      correlationId: "corr-mirror",
    },
    expectedState: { headBranch: "feat/X", hasRemote: true },
    repositorySnapshot: { headBranch: "feat/X", hasRemote: true },
    workflowContext: {
      sessionID: "s-exec-mirror",
      commandName: "bmad-bmm-quick-dev",
      phase: "in-progress",
    },
    gitRunner: async () => {
      const error = new Error("rejected");
      error.status = 1;
      error.stderr = "! [rejected] feat/X (non-fast-forward)";
      throw error;
    },
    workflowState: store,
  });

  const after = store.get("s-exec-mirror");
  assert.equal(after.approvalHistory?.length, 0, "execution must not touch approval history");
  assert.equal(after.lastGitAction.kind, "push");
  assert.equal(after.lastGitAction.operation, "push");
  assert.equal(after.lastGitAction.correlationId, "corr-mirror");
  assert.equal(after.lastGitResult.status, "failed");
  assert.equal(after.lastGitResult.code, "push-rejection");
  assert.equal(typeof after.lastGitResult.message, "string");
  assert.equal(after.lastGitFailure.code, "push-rejection");
  assert.equal(after.lastGitFailure.recoverable, true);
  assert.equal(after.lastGitFailure.suggestedRecoveryKind, "retry-after-sync");
  assert.equal(after.pendingRecoveryContext.source, "git-action-failure");
  assert.equal(after.pendingRecoveryContext.correlationId, "corr-mirror");

  // Mutating the returned snapshot must NOT leak back into the store.
  after.lastGitResult.code = "tampered";
  after.lastGitFailure.suggestedRecoveryKind = "tampered";
  after.lastGitAction.branchName = "tampered";
  after.pendingRecoveryContext.code = "tampered";
  const refetched = store.get("s-exec-mirror");
  assert.equal(refetched.lastGitResult.code, "push-rejection");
  assert.equal(refetched.lastGitFailure.suggestedRecoveryKind, "retry-after-sync");
  assert.equal(refetched.lastGitAction.branchName, "feat/X");
  assert.equal(refetched.pendingRecoveryContext.code, "push-rejection");

  // A subsequent successful execution clears lastGitFailure and the recovery
  // context but still records lastGitAction / lastGitResult.
  await executeGitAction({
    plan: {
      kind: "push",
      operation: "push",
      branchName: "feat/X",
      remoteName: "origin",
      correlationId: "corr-mirror-ok",
    },
    expectedState: { headBranch: "feat/X", hasRemote: true },
    repositorySnapshot: { headBranch: "feat/X", hasRemote: true },
    workflowContext: {
      sessionID: "s-exec-mirror",
      commandName: "bmad-bmm-quick-dev",
      phase: "end",
    },
    gitRunner: async () => ({ observedState: { headBranch: "feat/X", hasRemote: true } }),
    workflowState: store,
  });
  const okState = store.get("s-exec-mirror");
  assert.equal(okState.lastGitResult.status, "succeeded");
  assert.equal(okState.lastGitResult.code, null);
  assert.equal(okState.lastGitFailure, null);
  assert.equal(okState.pendingRecoveryContext, null);
}

/**
 * Story 2.4: commit-service / push-service produce normalized envelopes only —
 * no ad-hoc throws, no raw stderr leakage, and the action.kind is fixed.
 */
async function verifyCommitAndPushServicesSurfaceEnvelopes() {
  const [commitModule, pushModule] = await Promise.all([
    import(`${commitServiceModuleUrl}?services=${Date.now()}`),
    import(`${pushServiceModuleUrl}?services=${Date.now()}`),
  ]);

  const commitEnvelope = await commitModule.executeCommit({
    plan: commitModule.buildCommitAction({
      message: "chore: smoke",
      branchName: "feat/X",
      correlationId: "corr-svc-commit",
    }),
    expectedState: { headBranch: "feat/X" },
    repositorySnapshot: { headBranch: "feat/X" },
    workflowContext: { sessionID: "s-svc-commit", commandName: "bmad-bmm-quick-dev", phase: "end" },
    gitRunner: async () => {
      const error = new Error("hook reject");
      error.status = 1;
      error.stderr = "pre-commit hook failed";
      throw error;
    },
  });
  assert.equal(commitEnvelope.action.kind, "commit");
  assert.equal(commitEnvelope.action.operation, "commit");
  assert.equal(commitEnvelope.code, "commit-failure");
  assert.equal(commitEnvelope.action.correlationId, "corr-svc-commit");

  const pushEnvelope = await pushModule.executePush({
    plan: pushModule.buildPushAction({
      branchName: "feat/X",
      remoteName: "origin",
      correlationId: "corr-svc-push",
    }),
    expectedState: { headBranch: "feat/X", hasRemote: true },
    repositorySnapshot: { headBranch: "feat/X", hasRemote: true },
    workflowContext: { sessionID: "s-svc-push", commandName: "bmad-bmm-quick-dev", phase: "end" },
    gitRunner: async () => ({ observedState: { headBranch: "feat/X", hasRemote: true } }),
  });
  assert.equal(pushEnvelope.action.kind, "push");
  assert.equal(pushEnvelope.action.remoteName, "origin");
  assert.equal(pushEnvelope.ok, true);
  assert.equal(pushEnvelope.status, "succeeded");
}

// ─────────────────────────────────────────────────────────────────────
// Story 2.5 — recovery paths without failing the workflow
// ─────────────────────────────────────────────────────────────────────

/**
 * Story 2.5: recovery-state state-machine guarantees.
 * - planned -> awaitingApproval -> approved -> executing -> completed
 * - awaitingRecovery -> retryRequested -> planned (attempt resets)
 * - awaitingRecovery -> continuedWithoutAutomation (terminal)
 * - awaitingRecovery -> awaitingManualResolution -> continuedAfterManualResolution
 * - illegal jumps (e.g. completed -> planned) are rejected
 */
async function verifyRecoveryStateMachineContracts() {
  const {
    RECOVERY_STATES,
    RECOVERY_CHOICES,
    BLOCKING_SCOPES,
    isRecoveryState,
    isTerminalRecoveryState,
    isRecoveryChoice,
    intentStateForChoice,
    validateRecoveryTransition,
    defaultBlockingScopeFor,
  } = await import(`${recoveryStateModuleUrl}?v25-state=${Date.now()}`);

  // Vocabulary completeness — the spec calls out exactly these states.
  for (const expected of [
    "planned",
    "awaitingApproval",
    "approved",
    "executing",
    "failed",
    "awaitingRecovery",
    "retryRequested",
    "continuedWithoutAutomation",
    "awaitingManualResolution",
    "continuedAfterManualResolution",
    "completed",
    "abandoned",
  ]) {
    assert.equal(isRecoveryState(expected), true, `state ${expected} must be valid`);
  }
  assert.equal(isRecoveryState("yolo"), false);

  // Terminal states.
  for (const t of ["completed", "continuedWithoutAutomation", "continuedAfterManualResolution", "abandoned"]) {
    assert.equal(isTerminalRecoveryState(t), true, `${t} must be terminal`);
  }
  assert.equal(isTerminalRecoveryState("awaitingRecovery"), false);

  // Allowed canonical progression.
  assert.deepEqual(
    validateRecoveryTransition(RECOVERY_STATES.PLANNED, RECOVERY_STATES.AWAITING_APPROVAL),
    { ok: true },
  );
  assert.deepEqual(
    validateRecoveryTransition(RECOVERY_STATES.AWAITING_RECOVERY, RECOVERY_STATES.RETRY_REQUESTED),
    { ok: true },
  );
  assert.deepEqual(
    validateRecoveryTransition(RECOVERY_STATES.RETRY_REQUESTED, RECOVERY_STATES.PLANNED),
    { ok: true },
  );
  assert.deepEqual(
    validateRecoveryTransition(
      RECOVERY_STATES.AWAITING_MANUAL_RESOLUTION,
      RECOVERY_STATES.CONTINUED_AFTER_MANUAL_RESOLUTION,
    ),
    { ok: true },
  );

  // Illegal transitions stay rejected.
  const illegal = validateRecoveryTransition(
    RECOVERY_STATES.COMPLETED,
    RECOVERY_STATES.PLANNED,
  );
  assert.equal(illegal.ok, false);
  assert.equal(illegal.reason, "transition-not-allowed");

  const garbage = validateRecoveryTransition("yolo", RECOVERY_STATES.PLANNED);
  assert.equal(garbage.ok, false);
  assert.equal(garbage.reason, "invalid-previous-state");

  // Choice → intent state mapping.
  assert.equal(intentStateForChoice(RECOVERY_CHOICES.RETRY), RECOVERY_STATES.RETRY_REQUESTED);
  assert.equal(
    intentStateForChoice(RECOVERY_CHOICES.CONTINUE_WITHOUT_AUTOMATION),
    RECOVERY_STATES.CONTINUED_WITHOUT_AUTOMATION,
  );
  assert.equal(
    intentStateForChoice(RECOVERY_CHOICES.MANUAL_RESOLUTION),
    RECOVERY_STATES.AWAITING_MANUAL_RESOLUTION,
  );
  assert.equal(intentStateForChoice(RECOVERY_CHOICES.ABANDON), RECOVERY_STATES.ABANDONED);
  assert.equal(intentStateForChoice("nope"), null);
  assert.equal(isRecoveryChoice(RECOVERY_CHOICES.RETRY), true);
  assert.equal(isRecoveryChoice("nope"), false);

  // Default blocking scope rules.
  assert.equal(defaultBlockingScopeFor("init"), BLOCKING_SCOPES.SESSION_GIT);
  assert.equal(defaultBlockingScopeFor("commit"), BLOCKING_SCOPES.WORKFLOW_FINALIZATION);
  assert.equal(defaultBlockingScopeFor("branch"), BLOCKING_SCOPES.GIT_ONLY);
  assert.equal(defaultBlockingScopeFor("push"), BLOCKING_SCOPES.GIT_ONLY);
}

/**
 * Story 2.5: recoverable vs non-recoverable classification.
 * - approval deny / ignore → recoverable, recommends continue-without-automation
 * - branch-conflict / push-rejection (recoverable=true on Story 2.4 envelope)
 *   → recoverable; recommendedChoice mapped from suggestedRecoveryKind
 * - execution-unavailable → non-recoverable, session-git blocked
 * - unknown-git-failure → non-recoverable
 * - invariant violation (cross-session, missing kind) → non-recoverable
 */
async function verifyClassifyRecoveryContracts() {
  const {
    classifyApprovalRecovery,
    classifyExecutionRecovery,
    classifyInvariantViolation,
  } = await import(`${classifyRecoveryModuleUrl}?v25-classify=${Date.now()}`);

  // Approval deny — recoverable continue-without-automation, GIT_ONLY scope
  // for non-init actions.
  const denyClass = classifyApprovalRecovery({
    approvalOutcome: "deny",
    actionKind: "branch",
    actionId: "action:branch/create:feat",
    sessionID: "s-25-deny",
  });
  assert.equal(denyClass.recoverable, true);
  assert.equal(denyClass.reason, "approval-denied");
  assert.equal(denyClass.recommendedChoice, "continue-without-automation");
  assert.equal(denyClass.blockingScope, "git-only");

  // Approval ignore on init — session-git scope.
  const ignoreInit = classifyApprovalRecovery({
    approvalOutcome: "ignore-and-continue",
    actionKind: "init",
    sessionID: "s-25-ignore-init",
  });
  assert.equal(ignoreInit.recoverable, true);
  assert.equal(ignoreInit.reason, "approval-ignored");
  assert.equal(ignoreInit.blockingScope, "session-git");

  // Approval accept must NOT be classified as recovery — it is a successful path.
  const accept = classifyApprovalRecovery({
    approvalOutcome: "accept",
    actionKind: "branch",
  });
  assert.equal(accept.recoverable, false);
  assert.equal(accept.reason, "approval-outcome-not-recoverable");

  // Recoverable execution failure (push-rejection with retry-after-sync).
  const recoverableEnvelope = {
    ok: false,
    status: "failed",
    action: {
      kind: "push",
      operation: "push",
      branchName: "feat/X",
      remoteName: "origin",
      correlationId: "corr-rec-push",
    },
    code: "push-rejection",
    message: "remote rejected non-fast-forward",
    details: {
      recoverable: true,
      suggestedRecoveryKind: "retry-after-sync",
      expectedState: { headBranch: "feat/X" },
      observedState: { headBranch: "feat/X" },
    },
  };
  const recExec = classifyExecutionRecovery({
    envelope: recoverableEnvelope,
    sessionID: "s-25-rec",
  });
  assert.equal(recExec.recoverable, true);
  assert.equal(recExec.reason, "push-rejection");
  assert.equal(recExec.recommendedChoice, "retry");
  assert.equal(recExec.blockingScope, "git-only");

  // Non-recoverable: execution-unavailable.
  const execUnavailable = classifyExecutionRecovery({
    envelope: {
      ok: false,
      status: "failed",
      action: { kind: "branch", operation: "create", correlationId: "corr-eu" },
      code: "execution-unavailable",
      details: {
        recoverable: false,
        suggestedRecoveryKind: "fix-environment",
      },
    },
    sessionID: "s-25-exec-unavail",
  });
  assert.equal(execUnavailable.recoverable, false);
  assert.equal(execUnavailable.reason, "execution-unavailable");
  assert.equal(execUnavailable.recommendedChoice, null);
  assert.equal(execUnavailable.blockingScope, "session-git");

  // Non-recoverable: unknown-git-failure.
  const unknown = classifyExecutionRecovery({
    envelope: {
      ok: false,
      status: "failed",
      action: { kind: "init", correlationId: "corr-unk" },
      code: "unknown-git-failure",
      details: { recoverable: false },
    },
    sessionID: "s-25-unknown",
  });
  assert.equal(unknown.recoverable, false);
  assert.equal(unknown.reason, "unknown-git-failure");

  // Story 2.4 says recoverable=false even though code may be a known one
  // (e.g. push-rejection caused by branch-protection / authentication).
  // Story 2.5 must respect the upstream recoverable flag.
  const protectedPush = classifyExecutionRecovery({
    envelope: {
      ok: false,
      status: "failed",
      action: { kind: "push", correlationId: "corr-protected" },
      code: "push-rejection",
      details: { recoverable: false, suggestedRecoveryKind: "manual-credentials" },
    },
    sessionID: "s-25-protected",
  });
  assert.equal(protectedPush.recoverable, false);
  assert.equal(protectedPush.recommendedChoice, null);

  // Envelope.ok === true is not a recovery candidate.
  const successCase = classifyExecutionRecovery({
    envelope: { ok: true, status: "succeeded", action: { kind: "branch" } },
  });
  assert.equal(successCase.recoverable, false);
  assert.equal(successCase.reason, "envelope-not-failed");

  // Invariant violation always non-recoverable.
  const violation = classifyInvariantViolation({
    reason: "session-mismatch",
    sessionID: "s-actual",
    actionKind: "branch",
    actionId: "stale-action-id",
    detail: { stale: true },
  });
  assert.equal(violation.recoverable, false);
  assert.equal(violation.reason, "session-mismatch");
  assert.equal(violation.recommendedChoice, null);
  assert.equal(violation.details.source, "invariant");
}

/**
 * Story 2.5: action-specific recovery options for branch/init/commit/push.
 * Every option must include user-facing instructions and the canonical
 * nextState. Non-recoverable failures collapse to a single `abandon` option.
 */
async function verifyRecoveryOptionsContracts() {
  const { buildRecoveryOptions } = await import(
    `${buildRecoveryOptionsModuleUrl}?v25-opts=${Date.now()}`
  );

  const branchOpts = buildRecoveryOptions({
    actionKind: "branch",
    operation: "switch",
    recoverable: true,
    recommendedChoice: "manual-resolution",
  });
  assert.equal(branchOpts.length, 3);
  for (const opt of branchOpts) {
    assert.equal(typeof opt.instructions, "string");
    assert.ok(opt.instructions.length > 0, "branch option must include instructions");
    assert.ok(typeof opt.nextState === "string" && opt.nextState.length > 0);
  }
  const branchManual = branchOpts.find((o) => o.choice === "manual-resolution");
  assert.equal(branchManual.recommended, true, "recommendedChoice must be flagged");

  const initOpts = buildRecoveryOptions({
    actionKind: "init",
    recoverable: true,
    recommendedChoice: "retry",
  });
  assert.equal(initOpts.length, 3);
  for (const opt of initOpts) {
    assert.equal(opt.blockingScope, "session-git", "init recovery options block whole session Git automation");
  }

  const commitOpts = buildRecoveryOptions({
    actionKind: "commit",
    recoverable: true,
  });
  assert.equal(commitOpts.length, 3);
  for (const opt of commitOpts) {
    assert.equal(opt.blockingScope, "workflow-finalization");
  }

  const pushOpts = buildRecoveryOptions({
    actionKind: "push",
    recoverable: true,
  });
  assert.equal(pushOpts.length, 3);
  for (const opt of pushOpts) {
    assert.equal(opt.blockingScope, "git-only");
  }

  const nonRec = buildRecoveryOptions({
    actionKind: "push",
    recoverable: false,
  });
  assert.equal(nonRec.length, 1);
  assert.equal(nonRec[0].choice, "abandon");
  assert.equal(nonRec[0].recommended, true);

  const unknownKind = buildRecoveryOptions({
    actionKind: "yolo",
    recoverable: true,
  });
  assert.equal(unknownKind.length, 1);
  assert.equal(unknownKind[0].choice, "abandon");
}

/**
 * Story 2.5: recovery orchestrator opens a gate from a denied approval and
 * emits git.action.recovery.offered with the expected envelope shape.
 */
async function verifyOpenRecoveryFromApprovalDeny() {
  const [{ createWorkflowStateStore }, { openRecoveryFromApproval }] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-deny=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-deny=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-deny", { sessionID: "s-25-deny", commandName: "bmad-bmm-quick-dev", phase: "start" });

  const events = [];
  const audit = {
    async info(name, payload) {
      events.push(payload);
    },
  };

  const result = await openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-deny",
    approvalOutcome: "deny",
    actionKind: "branch",
    actionId: "action:branch/create:feat",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    audit,
  });
  assert.equal(result.outcome, "opened");
  assert.equal(result.gate.state, "awaitingRecovery");
  assert.equal(result.gate.recoverable, true);
  assert.equal(result.gate.reason, "approval-denied");
  assert.equal(result.gate.blockingScope, "git-only");
  assert.equal(result.gate.actionKind, "branch");
  assert.equal(result.gate.attempt, 1);
  assert.equal(result.gate.options.length, 3);

  // git.action.recovery.offered audit event must follow the existing envelope
  // (event/timestamp/workflow/command/outcome/details), with all required
  // recovery details fields present.
  assert.equal(events.length, 1);
  const offered = events[0];
  assert.equal(offered.event, "git.action.recovery.offered");
  assert.equal(typeof offered.timestamp, "string");
  assert.equal(offered.workflow, "bmad-bmm-quick-dev");
  assert.equal(offered.command, "bmad-bmm-quick-dev");
  assert.equal(offered.outcome, "ask");
  assert.equal(offered.details.actionKind, "branch");
  assert.equal(offered.details.actionId, "action:branch/create:feat");
  assert.equal(offered.details.failureCode, "approval-denied");
  assert.equal(offered.details.recoverable, true);
  assert.equal(offered.details.attempt, 1);
  assert.deepEqual(
    offered.details.offeredChoices.sort(),
    ["continue-without-automation", "manual-resolution", "retry"].sort(),
  );
  assert.equal(offered.details.recommendedChoice, "continue-without-automation");

  // Re-opening while a non-terminal gate exists must skip.
  const dup = await openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-deny",
    approvalOutcome: "deny",
    actionKind: "branch",
  });
  assert.equal(dup.outcome, "skip");
  assert.equal(dup.reason, "gate-already-open");
}

/**
 * Story 2.5: orchestrator opens a gate from a Story 2.4 executor failure
 * envelope, classifies the failure, and emits offered/blocked accordingly.
 */
async function verifyOpenRecoveryFromExecution() {
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-exec=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-exec=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-exec", { sessionID: "s-25-exec", commandName: "bmad-bmm-quick-dev", phase: "in-progress" });

  const events = [];
  const audit = {
    async info(_name, payload) {
      events.push(payload);
    },
  };

  // Recoverable push-rejection -> opens awaitingRecovery, emits offered.
  const recoverable = await orch.openRecoveryFromExecution({
    workflowState: store,
    sessionID: "s-25-exec",
    envelope: {
      ok: false,
      status: "failed",
      action: { kind: "push", operation: "push", correlationId: "corr-exec-push", branchName: "feat/X", remoteName: "origin" },
      code: "push-rejection",
      message: "remote rejected non-fast-forward",
      details: { recoverable: true, suggestedRecoveryKind: "retry-after-sync" },
    },
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    audit,
  });
  assert.equal(recoverable.outcome, "opened");
  assert.equal(recoverable.gate.state, "awaitingRecovery");
  assert.equal(recoverable.gate.actionKind, "push");
  assert.equal(recoverable.gate.recommendedChoice, "retry");
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "git.action.recovery.offered");
  assert.equal(events[0].details.failureCode, "push-rejection");

  // Clear the gate before testing the non-recoverable path.
  orch.clearRecoveryGate(store, "s-25-exec");

  // Non-recoverable execution-unavailable -> opens & immediately blocks.
  events.length = 0;
  const blocked = await orch.openRecoveryFromExecution({
    workflowState: store,
    sessionID: "s-25-exec",
    envelope: {
      ok: false,
      status: "failed",
      action: { kind: "branch", operation: "create", correlationId: "corr-eu-branch" },
      code: "execution-unavailable",
      message: "git not found",
      details: { recoverable: false, suggestedRecoveryKind: "fix-environment" },
    },
    audit,
  });
  // Story 2.5 (LOW review): non-recoverable opens return `outcome: "blocked"`
  // so callers can distinguish them from `_openRecoverableGate`'s `"opened"`,
  // which always denotes a gate still awaiting a user decision.
  assert.equal(blocked.outcome, "blocked");
  assert.equal(blocked.gate.state, "abandoned");
  assert.equal(blocked.gate.recoverable, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "git.action.recovery.blocked");
  assert.equal(events[0].outcome, "deny");
  assert.equal(events[0].details.failureCode, "execution-unavailable");
}

/**
 * Story 2.5: selecting `retry` increments attempt counter, transitions to
 * `planned`, and emits selected + completed.
 */
async function verifySelectRetryIncrementsAttempt() {
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-retry=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-retry=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-retry", { sessionID: "s-25-retry", commandName: "bmad-bmm-quick-dev", phase: "in-progress" });

  await orch.openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-retry",
    approvalOutcome: "deny",
    actionKind: "branch",
    actionId: "action:branch/create:retry",
  });

  const events = [];
  const audit = {
    async info(_name, payload) {
      events.push(payload);
    },
  };
  const result = await orch.selectRecoveryChoice({
    workflowState: store,
    sessionID: "s-25-retry",
    choice: "retry",
    audit,
  });
  assert.equal(result.outcome, "selected");
  assert.equal(result.gate.state, "planned");
  assert.equal(result.gate.attempt, 2);
  assert.equal(typeof result.gate.resolvedAt, "string");

  assert.equal(events.length, 2);
  assert.equal(events[0].event, "git.action.recovery.selected");
  assert.equal(events[0].details.choice, "retry");
  assert.equal(events[0].details.previousState, "awaitingRecovery");
  assert.equal(events[0].details.requiresRecheck, true);
  assert.equal(events[1].event, "git.action.recovery.completed");
  assert.equal(events[1].details.terminalState, "planned");

  // History contains the full progression including retryRequested + planned.
  const states = result.gate.history.map((h) => h.state);
  assert.deepEqual(states, ["awaitingRecovery", "retryRequested", "planned"]);

  // Story 2.5 (HIGH+LOW review): retry must clear the gate from the store so
  // the next planning pass is NOT blocked by the historical recovery state.
  // Without this, `command-execute-before` would call `isActionBlockedByGate`
  // on a stale gate (state: "planned", blockingScope: "git-only",
  // actionKind: "branch") and emit `git.action.recovery.blocked` instead of
  // republishing the approval. Verify both that the gate is absent AND that
  // `isActionBlockedByGate` confirms the same action kind is unblocked.
  const postRetryGate = orch.readRecoveryGate(store, "s-25-retry");
  assert.equal(postRetryGate, null, "retry must clear the recovery gate from the store");
  assert.equal(
    orch.isActionBlockedByGate(postRetryGate, "branch").blocked,
    false,
    "after retry the same action kind must be unblocked for fresh planning",
  );

  // A fresh approval cycle can re-open a gate on the same session immediately
  // after retry — i.e. retry truly closed the previous gate, it did not just
  // mute the gating check.
  const reopen = await orch.openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-retry",
    approvalOutcome: "deny",
    actionKind: "branch",
    actionId: "action:branch/create:retry-2",
  });
  assert.equal(reopen.outcome, "opened");
  assert.equal(reopen.gate.state, "awaitingRecovery");
  assert.notEqual(
    reopen.gate.gateId,
    result.gate.gateId,
    "fresh gate id is required after a retry-cleared gate",
  );
}

/**
 * Story 2.5: continue-without-automation reaches the terminal continuation
 * state and emits selected + completed.
 */
async function verifySelectContinueWithoutAutomation() {
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-cont=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-cont=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-cont", { sessionID: "s-25-cont", commandName: "bmad-bmm-quick-dev", phase: "in-progress" });

  await orch.openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-cont",
    approvalOutcome: "ignore-and-continue",
    actionKind: "branch",
  });

  const events = [];
  const audit = {
    async info(_n, e) {
      events.push(e);
    },
  };
  const result = await orch.selectRecoveryChoice({
    workflowState: store,
    sessionID: "s-25-cont",
    choice: "continue-without-automation",
    audit,
  });
  assert.equal(result.outcome, "selected");
  assert.equal(result.gate.state, "continuedWithoutAutomation");
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "git.action.recovery.selected");
  assert.equal(events[1].event, "git.action.recovery.completed");
  assert.equal(events[1].details.terminalState, "continuedWithoutAutomation");
}

/**
 * Story 2.5: manual-resolution can be deferred (verifyManual=false) leaving
 * the gate in awaitingManualResolution, then later confirmed via
 * confirmManualResolution which transitions to continuedAfterManualResolution.
 */
async function verifyManualResolutionTwoStep() {
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-manual=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-manual=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-manual", { sessionID: "s-25-manual", commandName: "bmad-bmm-quick-dev", phase: "in-progress" });

  await orch.openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-manual",
    approvalOutcome: "deny",
    actionKind: "init",
  });

  const stepOne = await orch.selectRecoveryChoice({
    workflowState: store,
    sessionID: "s-25-manual",
    choice: "manual-resolution",
  });
  assert.equal(stepOne.outcome, "selected");
  assert.equal(stepOne.gate.state, "awaitingManualResolution");
  assert.equal(stepOne.gate.continuationPhase, "selected");

  const stepTwo = await orch.confirmManualResolution({
    workflowState: store,
    sessionID: "s-25-manual",
  });
  assert.equal(stepTwo.outcome, "completed");
  assert.equal(stepTwo.gate.state, "continuedAfterManualResolution");

  // Single-step manual-resolution: verifyManual=true reaches terminal directly.
  const otherStore = createWorkflowStateStore();
  otherStore.set("s-25-manual-2", { sessionID: "s-25-manual-2", commandName: "bmad-bmm-quick-dev", phase: "in-progress" });
  await orch.openRecoveryFromApproval({
    workflowState: otherStore,
    sessionID: "s-25-manual-2",
    approvalOutcome: "deny",
    actionKind: "init",
  });
  const oneShot = await orch.selectRecoveryChoice({
    workflowState: otherStore,
    sessionID: "s-25-manual-2",
    choice: "manual-resolution",
    verifyManual: true,
  });
  assert.equal(oneShot.outcome, "selected");
  assert.equal(oneShot.gate.state, "continuedAfterManualResolution");
}

/**
 * Story 2.5: gate-blocking rules per action kind.
 * - init blocks ALL later Git automation in same session
 * - branch blocks only same-action retry; unrelated kinds proceed
 * - commit blocks workflow finalization (push/commit) but not branch
 * - terminal gate stops blocking
 */
async function verifyGateBlockingRules() {
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-block=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-block=${Date.now()}`),
  ]);

  // init gate.
  const storeInit = createWorkflowStateStore();
  storeInit.set("s-25-init-block", { sessionID: "s-25-init-block", commandName: "bmad-bmm-quick-dev", phase: "start" });
  await orch.openRecoveryFromApproval({
    workflowState: storeInit,
    sessionID: "s-25-init-block",
    approvalOutcome: "deny",
    actionKind: "init",
  });
  const initGate = orch.readRecoveryGate(storeInit, "s-25-init-block");
  assert.equal(orch.isActionBlockedByGate(initGate, "branch").blocked, true);
  assert.equal(orch.isActionBlockedByGate(initGate, "commit").blocked, true);
  assert.equal(orch.isActionBlockedByGate(initGate, "push").blocked, true);

  // branch gate.
  const storeBranch = createWorkflowStateStore();
  storeBranch.set("s-25-branch-block", { sessionID: "s-25-branch-block", commandName: "bmad-bmm-quick-dev", phase: "start" });
  await orch.openRecoveryFromApproval({
    workflowState: storeBranch,
    sessionID: "s-25-branch-block",
    approvalOutcome: "deny",
    actionKind: "branch",
  });
  const branchGate = orch.readRecoveryGate(storeBranch, "s-25-branch-block");
  assert.equal(orch.isActionBlockedByGate(branchGate, "branch").blocked, true);
  // Different action kinds proceed (branch gate scope = git-only).
  assert.equal(orch.isActionBlockedByGate(branchGate, "init").blocked, false);

  // commit gate (workflow-finalization scope).
  const storeCommit = createWorkflowStateStore();
  storeCommit.set("s-25-commit-block", { sessionID: "s-25-commit-block", commandName: "bmad-bmm-quick-dev", phase: "in-progress" });
  await orch.openRecoveryFromApproval({
    workflowState: storeCommit,
    sessionID: "s-25-commit-block",
    approvalOutcome: "deny",
    actionKind: "commit",
  });
  const commitGate = orch.readRecoveryGate(storeCommit, "s-25-commit-block");
  assert.equal(orch.isActionBlockedByGate(commitGate, "commit").blocked, true);
  assert.equal(orch.isActionBlockedByGate(commitGate, "push").blocked, true);
  // Branch progress allowed even with commit gate open.
  assert.equal(orch.isActionBlockedByGate(commitGate, "branch").blocked, false);

  // After the gate is resolved (continue-without-automation), it stops blocking.
  await orch.selectRecoveryChoice({
    workflowState: storeCommit,
    sessionID: "s-25-commit-block",
    choice: "continue-without-automation",
  });
  const closedGate = orch.readRecoveryGate(storeCommit, "s-25-commit-block");
  assert.equal(orch.isActionBlockedByGate(closedGate, "commit").blocked, false);
  assert.equal(orch.isActionBlockedByGate(closedGate, "push").blocked, false);
}

/**
 * Story 2.5: invariant violations (missing action kind, cross-session select)
 * never throw and always emit git.action.recovery.blocked.
 */
async function verifyInvariantViolationsAreBlockedNotThrown() {
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-inv=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-inv=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-inv", { sessionID: "s-25-inv", commandName: "bmad-bmm-quick-dev", phase: "start" });

  const events = [];
  const audit = {
    async info(_n, e) {
      events.push(e);
    },
  };
  const missingKind = await orch.openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-inv",
    approvalOutcome: "deny",
    actionKind: "yolo", // not a recovery action kind
    audit,
  });
  // Story 2.5 (LOW review): controlled-stop opens are tagged "blocked" so
  // callers branching on the result do not assume the gate is still open.
  assert.equal(missingKind.outcome, "blocked");
  assert.equal(missingKind.gate.state, "abandoned");
  assert.equal(missingKind.gate.recoverable, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "git.action.recovery.blocked");

  // Selection on wrong session id is also blocked, not thrown.
  // Open a real gate, then craft a stale gate-payload by hand-tampering the
  // store: set sessionID on the gate to something else.
  const otherStore = createWorkflowStateStore();
  otherStore.set("s-25-other", { sessionID: "s-25-other", commandName: "bmad-bmm-quick-dev", phase: "start" });
  await orch.openRecoveryFromApproval({
    workflowState: otherStore,
    sessionID: "s-25-other",
    approvalOutcome: "deny",
    actionKind: "branch",
  });
  const stored = otherStore.get("s-25-other");
  // Forge: set the gate.sessionID to a different session, then re-store.
  otherStore.set("s-25-other", {
    ...stored,
    recoveryGate: { ...stored.recoveryGate, sessionID: "s-other-stale" },
  });
  events.length = 0;
  const cross = await orch.selectRecoveryChoice({
    workflowState: otherStore,
    sessionID: "s-25-other",
    choice: "retry",
    audit,
  });
  assert.equal(cross.outcome, "skip");
  assert.equal(cross.reason, "session-mismatch");
  // The forged gate has been abandoned and a blocked event emitted.
  const blockedEvents = events.filter((e) => e.event === "git.action.recovery.blocked");
  assert.equal(blockedEvents.length, 1);
}

/**
 * Story 2.5: workflowState mirror — recoveryGate is deep-cloned on get so
 * external mutations cannot leak back into the store, AND session.deleted
 * cleanup (workflowState.clear) wipes the gate alongside other session data.
 */
async function verifyRecoveryGateIsolatedAndCleanedUp() {
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-iso=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-iso=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-iso", { sessionID: "s-25-iso", commandName: "bmad-bmm-quick-dev", phase: "start" });
  await orch.openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-iso",
    approvalOutcome: "deny",
    actionKind: "branch",
  });
  const snap1 = store.get("s-25-iso");
  assert.equal(snap1.recoveryGate.state, "awaitingRecovery");

  // Tamper with the snapshot — must not affect the store.
  snap1.recoveryGate.state = "tampered";
  snap1.recoveryGate.options[0].instructions = "tampered";
  const snap2 = store.get("s-25-iso");
  assert.equal(snap2.recoveryGate.state, "awaitingRecovery");
  assert.notEqual(snap2.recoveryGate.options[0].instructions, "tampered");

  // session.deleted cleanup wipes the entire entry, including the gate.
  store.clear("s-25-iso");
  assert.equal(store.get("s-25-iso"), undefined);
}

/**
 * Story 2.5 — integration: a denied approval must NOT hard-fail the workflow
 * session. The wrapper plugin instance routes through permission-asked, and
 * after the resolver fires the orchestrator opens a recovery gate so future
 * planning passes can release it explicitly.
 */
async function verifyDeniedApprovalDoesNotHardFailWorkflow() {
  const wrapperWorkspace = createTempWorkspace();
  try {
    const wrapperModule = await import(wrapperModuleUrl);
    const { handlers, mock } = await instantiate(
      wrapperModule.DevaiAiddGuardPlugin,
      wrapperWorkspace,
    );

    // First, drive command.execute.before so a branch approval is requested
    // and stored in workflow state.
    await runCommandExecuteBefore(handlers);
    assert.ok(mock.prompts.length >= 1, "wrapper must publish at least one approval prompt");
    const firstPrompt = mock.prompts[0];
    const meta = firstPrompt.parts[0].metadata;
    assert.equal(typeof meta.requestId, "string");

    // Simulate the user denying the approval through permission.asked.
    let permissionThrew = false;
    try {
      await handlers["permission.asked"]({
        sessionID: "session-1",
        outcome: "deny",
        requestId: meta.requestId,
        actionId: meta.actionId,
      });
    } catch {
      permissionThrew = true;
    }
    assert.equal(
      permissionThrew,
      false,
      "denied approval must NOT throw out of the permission.asked hook",
    );

    // After the deny, subsequent tool execution must continue working — the
    // wrapper does not enter a hard-fail state for this session.
    let toolError = null;
    try {
      await handlers["tool.execute.before"]({
        sessionID: "session-1",
        tool: "read",
        args: {},
      }, { args: {} });
    } catch (caught) {
      toolError = caught;
    }
    assert.equal(toolError, null, "post-deny tool.execute.before must not throw");

    // Built artifact also routes the deny without hard-failing.
    const builtModule = await import(`${builtModuleUrl}?t=${Date.now()}-deny`);
    const builtWorkspace = createTempWorkspace();
    try {
      const built = await instantiate(
        builtModule.DevaiAiddGuardPlugin || builtModule.DevaiGitWorkflowPlugin || builtModule.default,
        builtWorkspace,
      );
      await runCommandExecuteBefore(built.handlers);
      const builtMeta = built.mock.prompts[0]?.parts?.[0]?.metadata;
      let builtThrew = false;
      try {
        await built.handlers["permission.asked"]({
          sessionID: "session-1",
          outcome: "deny",
          requestId: builtMeta?.requestId,
          actionId: builtMeta?.actionId,
        });
      } catch {
        builtThrew = true;
      }
      assert.equal(builtThrew, false, "built artifact must mirror wrapper recovery behavior on deny");
    } finally {
      fs.rmSync(builtWorkspace, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(wrapperWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.5 (MEDIUM review): the wrapper must deliver the recovery prompt to
 * the user via `pluginContext.requestRecoveryDecision` after a denied approval
 * opens a recovery gate. Without that delivery, AC1 is only data-shape
 * complete and the gate would stay open forever because the user has nothing
 * to act on.
 */
async function verifyRecoveryPromptDeliveredAfterDeny() {
  const wrapperWorkspace = createTempWorkspace();
  try {
    const wrapperModule = await import(`${wrapperModuleUrl}?recovery-deliver=${Date.now()}`);
    const { handlers, mock } = await instantiate(
      wrapperModule.DevaiAiddGuardPlugin,
      wrapperWorkspace,
    );

    await runCommandExecuteBefore(handlers);
    assert.ok(mock.prompts.length >= 1, "approval prompt must be delivered before recovery");
    const approvalMeta = mock.prompts[0].parts[0].metadata;
    assert.equal(typeof approvalMeta.requestId, "string");

    const promptCountBeforeDeny = mock.prompts.length;
    await handlers["permission.asked"]({
      sessionID: "session-1",
      outcome: "deny",
      requestId: approvalMeta.requestId,
      actionId: approvalMeta.actionId,
    });

    // A recovery prompt MUST have been delivered after the deny resolved.
    assert.ok(
      mock.prompts.length > promptCountBeforeDeny,
      "denied approval must trigger a recovery prompt delivery",
    );

    // The newest prompt is the recovery prompt — its metadata must carry the
    // recoveryGateId so the user's response can be matched back to the gate.
    const recoveryPrompt = mock.prompts[mock.prompts.length - 1];
    const recoveryMeta = recoveryPrompt?.parts?.[0]?.metadata;
    assert.ok(recoveryMeta, "recovery prompt must carry metadata");
    assert.equal(typeof recoveryMeta.recoveryGateId, "string");
    assert.ok(
      recoveryMeta.recoveryGateId.startsWith("recovery:"),
      "recoveryGateId must be the orchestrator-issued id",
    );
    assert.ok(Array.isArray(recoveryMeta.choices) && recoveryMeta.choices.length >= 1);
    assert.ok(
      recoveryMeta.choices.includes("retry"),
      "recovery prompt must offer retry as one of the user choices",
    );
    assert.ok(
      recoveryMeta.choices.includes("continue-without-automation"),
      "recovery prompt must offer continue-without-automation",
    );
    // Prompt body must include actionable guidance, not just data shape.
    const text = recoveryPrompt.parts[0].text;
    assert.equal(typeof text, "string");
    assert.ok(text.length > 0, "recovery prompt body must be non-empty");
    assert.ok(text.includes("retry") || text.includes("Retry"));
  } finally {
    fs.rmSync(wrapperWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.5 (MEDIUM review): when the runtime delivers a recovery choice via
 * `permission.asked`, the hook must dispatch to `selectRecoveryChoice` so the
 * gate is actually resolved. After a `retry` choice, the gate is cleared and
 * a fresh `permission.asked` deny on a new approval can re-open recovery.
 */
async function verifyRecoveryChoiceRoutingThroughPermissionAsked() {
  const wrapperWorkspace = createTempWorkspace();
  try {
    const wrapperModule = await import(`${wrapperModuleUrl}?recovery-route=${Date.now()}`);
    const { handlers, mock } = await instantiate(
      wrapperModule.DevaiAiddGuardPlugin,
      wrapperWorkspace,
    );

    await runCommandExecuteBefore(handlers);
    const approvalMeta = mock.prompts[0].parts[0].metadata;
    await handlers["permission.asked"]({
      sessionID: "session-1",
      outcome: "deny",
      requestId: approvalMeta.requestId,
      actionId: approvalMeta.actionId,
    });

    const recoveryPrompt = mock.prompts[mock.prompts.length - 1];
    const recoveryMeta = recoveryPrompt.parts[0].metadata;
    const gateIdBeforeRetry = recoveryMeta.recoveryGateId;
    assert.equal(typeof gateIdBeforeRetry, "string");

    // Simulate the user responding with `retry` to the recovery prompt.
    let routingThrew = false;
    try {
      await handlers["permission.asked"]({
        sessionID: "session-1",
        outcome: "retry",
        recoveryGateId: gateIdBeforeRetry,
      });
    } catch {
      routingThrew = true;
    }
    assert.equal(routingThrew, false, "recovery routing must not throw out of permission.asked");

    // After retry routes through, the orchestrator must have cleared the gate
    // (HIGH review fix). A second deny must therefore be able to re-open a
    // brand-new recovery gate with a different gate id.
    await runCommandExecuteBefore(handlers);
    const secondApproval = mock.prompts.filter((p) => p?.parts?.[0]?.metadata?.requestId).pop();
    assert.ok(secondApproval, "after retry a fresh approval prompt must be republished");
    const secondApprovalMeta = secondApproval.parts[0].metadata;

    await handlers["permission.asked"]({
      sessionID: "session-1",
      outcome: "deny",
      requestId: secondApprovalMeta.requestId,
      actionId: secondApprovalMeta.actionId,
    });
    const newRecoveryPrompt = mock.prompts[mock.prompts.length - 1];
    const newRecoveryMeta = newRecoveryPrompt.parts[0].metadata;
    assert.equal(typeof newRecoveryMeta.recoveryGateId, "string");
    assert.notEqual(
      newRecoveryMeta.recoveryGateId,
      gateIdBeforeRetry,
      "fresh recovery gate id is required after retry cleared the previous gate",
    );
  } finally {
    fs.rmSync(wrapperWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 2.5 (MEDIUM review): pure prompt-builder contract. Recovery prompts
 * must include the action label, attempt counter, every offered choice with
 * its instructions, and a recommended-choice tag when the orchestrator
 * supplied one.
 */
async function verifyBuildRecoveryPromptContracts() {
  const buildRecoveryPromptModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "services", "approval", "build-recovery-prompt.js"),
  ).href;
  const { buildRecoveryPrompt } = await import(
    `${buildRecoveryPromptModuleUrl}?v25-prompt=${Date.now()}`
  );

  const recoverableGate = {
    gateId: "recovery:test-1",
    actionKind: "branch",
    actionId: "action:branch/create:foo",
    state: "awaitingRecovery",
    recoverable: true,
    reason: "approval-denied",
    attempt: 1,
    recommendedChoice: "continue-without-automation",
    options: [
      {
        choice: "retry",
        label: "Retry",
        instructions: "Retry the branch operation after fixing branch state.",
        nextState: "retryRequested",
        blockingScope: "git-only",
      },
      {
        choice: "continue-without-automation",
        label: "Continue without automation",
        instructions: "Stay on the current branch and continue the workflow.",
        nextState: "continuedWithoutAutomation",
        blockingScope: "git-only",
        recommended: true,
      },
      {
        choice: "manual-resolution",
        label: "Continue after manual resolution",
        instructions: "Manually create the expected branch outside the plugin.",
        nextState: "awaitingManualResolution",
        blockingScope: "git-only",
      },
    ],
  };

  const prompt = buildRecoveryPrompt(recoverableGate);
  assert.equal(typeof prompt.title, "string");
  assert.ok(prompt.title.includes("branch"));
  assert.ok(Array.isArray(prompt.lines));
  assert.ok(prompt.lines.some((line) => line.includes("Retry")));
  assert.ok(prompt.lines.some((line) => line.includes("[recommended]")));
  assert.ok(prompt.lines.some((line) => line.includes("retry")));
  assert.ok(prompt.lines.some((line) => line.includes("continue-without-automation")));
  assert.deepEqual(
    prompt.choices.sort(),
    ["continue-without-automation", "manual-resolution", "retry"].sort(),
  );
  assert.equal(prompt.recommendedChoice, "continue-without-automation");
  assert.equal(prompt.actionKind, "branch");
  assert.equal(prompt.recoveryGateId, "recovery:test-1");

  // Non-recoverable gates collapse to a single `abandon` option and the
  // headline must signal that automation will be closed.
  const blockedGate = {
    gateId: "recovery:test-2",
    actionKind: null,
    state: "abandoned",
    recoverable: false,
    reason: "missing-action-kind",
    attempt: 1,
    options: [
      {
        choice: "abandon",
        label: "Stop automation",
        instructions: "The action kind is not recognised by recovery.",
        nextState: "abandoned",
        blockingScope: "git-only",
        recommended: true,
      },
    ],
  };
  const blockedPrompt = buildRecoveryPrompt(blockedGate);
  assert.equal(blockedPrompt.choices.length, 1);
  assert.equal(blockedPrompt.choices[0], "abandon");
  assert.ok(
    blockedPrompt.lines.some((line) => line.toLowerCase().includes("non-recoverable")),
    "non-recoverable headline must announce automation closure",
  );
}

/**
 * Story 2.5 (HIGH review round 2): selected / completed / blocked recovery
 * audit events must carry workflow + command attribution. Before the round-2
 * fix, `_openRecoverableGate` did not persist workflow/command on the gate,
 * so when `permission-asked` later called `selectRecoveryChoice` it could
 * only pass `gate.workflow ?? null` (always undefined → null) and audit
 * consumers grouping by workflow saw the entire `selected` / `completed`
 * stream as null while `offered` (emitted directly with full params) was
 * correctly attributed. The fix persists workflow/command on the gate AND
 * adds a fallback in `buildEventEnvelope`.
 */
async function verifyRecoveryGatePersistsWorkflowCommandAttribution() {
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${workflowStateModuleUrl}?v25-attr=${Date.now()}`),
    import(`${recoveryOrchestratorModuleUrl}?v25-attr=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-attr", {
    sessionID: "s-25-attr",
    commandName: "bmad-bmm-quick-dev",
    phase: "in-progress",
  });

  // Open a gate WITH workflow/command, then verify both survive on the gate.
  const opened = await orch.openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-attr",
    approvalOutcome: "deny",
    actionKind: "branch",
    actionId: "action:branch/create:attr",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
  });
  assert.equal(opened.outcome, "opened");
  assert.equal(
    opened.gate.workflow,
    "bmad-bmm-quick-dev",
    "gate must persist workflow at open time",
  );
  assert.equal(
    opened.gate.command,
    "bmad-bmm-quick-dev",
    "gate must persist command at open time",
  );

  // Now call selectRecoveryChoice WITHOUT passing workflow/command (mirrors
  // the failure mode the round-2 review caught in permission-asked.js, which
  // sourced workflow/command from gate.workflow / gate.command and got
  // null/null). With the fallback in buildEventEnvelope, the emitted events
  // must still carry the gate's persisted attribution.
  const events = [];
  const audit = {
    async info(_n, e) {
      events.push(e);
    },
  };
  const selected = await orch.selectRecoveryChoice({
    workflowState: store,
    sessionID: "s-25-attr",
    choice: "continue-without-automation",
    audit,
    // intentionally do NOT pass workflow/command
  });
  assert.equal(selected.outcome, "selected");
  assert.equal(events.length, 2, "selected + completed must both emit");
  for (const e of events) {
    assert.equal(
      e.workflow,
      "bmad-bmm-quick-dev",
      `${e.event} must carry workflow from gate fallback when params are null`,
    );
    assert.equal(
      e.command,
      "bmad-bmm-quick-dev",
      `${e.event} must carry command from gate fallback when params are null`,
    );
  }

  // Cross-session abandon path: open a gate on one session with workflow/
  // command, forge a session-mismatch on the gate, then call
  // selectRecoveryChoice without passing workflow/command. The forged
  // `git.action.recovery.blocked` must STILL carry the gate's attribution.
  const otherStore = createWorkflowStateStore();
  otherStore.set("s-25-attr-x", {
    sessionID: "s-25-attr-x",
    commandName: "bmad-bmm-quick-dev",
    phase: "start",
  });
  await orch.openRecoveryFromApproval({
    workflowState: otherStore,
    sessionID: "s-25-attr-x",
    approvalOutcome: "deny",
    actionKind: "branch",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
  });
  const stored = otherStore.get("s-25-attr-x");
  otherStore.set("s-25-attr-x", {
    ...stored,
    recoveryGate: { ...stored.recoveryGate, sessionID: "s-25-attr-x-stale" },
  });
  const blockedEvents = [];
  const blockedAudit = {
    async info(_n, e) {
      blockedEvents.push(e);
    },
  };
  const cross = await orch.selectRecoveryChoice({
    workflowState: otherStore,
    sessionID: "s-25-attr-x",
    choice: "retry",
    audit: blockedAudit,
  });
  assert.equal(cross.outcome, "skip");
  assert.equal(cross.reason, "session-mismatch");
  const blockedFromCross = blockedEvents.find((e) => e.event === "git.action.recovery.blocked");
  assert.ok(blockedFromCross, "session-mismatch must emit a blocked event");
  assert.equal(
    blockedFromCross.workflow,
    "bmad-bmm-quick-dev",
    "blocked event from cross-session abandon must inherit workflow from gate",
  );
  assert.equal(
    blockedFromCross.command,
    "bmad-bmm-quick-dev",
    "blocked event from cross-session abandon must inherit command from gate",
  );
}

/**
 * Story 2.5 (MEDIUM review round 2): the planning hook in
 * `command-execute-before.js` and the orchestrator both emit
 * `git.action.recovery.blocked` under the same event name. After the fix,
 * the hook routes through `buildHookBlockedEvent` which delegates to the
 * shared `buildEventEnvelope`, so both emissions share the canonical
 * minimum `details` keys: failureCode, recoverable, attempt, gateId,
 * blockingScope, source, sessionID, actionKind, actionId.
 */
async function verifyHookBlockedEventMatchesOrchestratorShape() {
  const orch = await import(`${recoveryOrchestratorModuleUrl}?v25-shape=${Date.now()}`);

  // Forge a recoverable gate as if `_openRecoverableGate` had persisted it.
  const gate = {
    gateId: "recovery:hook-shape-1",
    sessionID: "s-shape",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    actionKind: "branch",
    actionId: "action:branch/create:shape",
    correlationId: "corr-shape",
    state: "awaitingRecovery",
    source: "approval",
    recoverable: true,
    reason: "approval-denied",
    blockingScope: "git-only",
    attempt: 3,
    continuationPhase: "open",
  };

  const hookEvent = orch.buildHookBlockedEvent({
    gate,
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    sessionID: "s-shape",
    source: "command.execute.before",
    reason: "same-action-blocked",
    extraDetails: { actionKind: "branch" },
  });

  // Envelope-level fields.
  assert.equal(hookEvent.event, "git.action.recovery.blocked");
  assert.equal(hookEvent.outcome, "skip");
  assert.equal(hookEvent.workflow, "bmad-bmm-quick-dev");
  assert.equal(hookEvent.command, "bmad-bmm-quick-dev");
  assert.equal(typeof hookEvent.timestamp, "string");

  // Minimum details keys from the audit contract (Story 2.5 Task #6).
  const requiredKeys = [
    "actionKind",
    "actionId",
    "failureCode",
    "recoverable",
    "blockingScope",
    "attempt",
    "gateId",
    "sessionID",
    "source",
  ];
  for (const key of requiredKeys) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(hookEvent.details, key),
      `hook-emitted blocked event must include details.${key} (round-2 MEDIUM fix)`,
    );
  }
  assert.equal(hookEvent.details.actionKind, "branch");
  assert.equal(hookEvent.details.actionId, "action:branch/create:shape");
  assert.equal(hookEvent.details.failureCode, "approval-denied");
  assert.equal(hookEvent.details.recoverable, true);
  assert.equal(hookEvent.details.blockingScope, "git-only");
  assert.equal(hookEvent.details.attempt, 3);
  assert.equal(hookEvent.details.gateId, "recovery:hook-shape-1");
  assert.equal(hookEvent.details.sessionID, "s-shape");
  assert.equal(hookEvent.details.source, "command.execute.before");
  assert.equal(hookEvent.details.reason, "same-action-blocked");
}

/**
 * Story 2.5 (LOW review round 2): `isActionBlockedByGate` must honour
 * `gate.continuationPhase === "terminal"` as a release signal. The retry
 * path persists the gate at `state: "planned"` with
 * `continuationPhase: "terminal"` and then awaits two emissions before
 * `clearGate` runs. In that window, any concurrent reader would otherwise
 * see `state === "planned"` (not in `TERMINAL_RECOVERY_STATES`) and emit
 * `git.action.recovery.blocked` even though the retry has finalised. The
 * fix below the round-1 HIGH fix is defense in depth.
 */
async function verifyTerminalContinuationPhaseReleasesGate() {
  const orch = await import(`${recoveryOrchestratorModuleUrl}?v25-term=${Date.now()}`);

  // Hand-craft a gate that mirrors the retry-window state: state is "planned"
  // (NOT a strict-terminal state in the recovery vocabulary) and
  // continuationPhase is "terminal".
  const retryWindowGate = {
    gateId: "recovery:term-1",
    sessionID: "s-term",
    actionKind: "branch",
    state: "planned",
    blockingScope: "git-only",
    continuationPhase: "terminal",
  };
  const result = orch.isActionBlockedByGate(retryWindowGate, "branch");
  assert.equal(
    result.blocked,
    false,
    "gate.continuationPhase === 'terminal' must release the gate even before strict-terminal state",
  );
  assert.equal(
    result.reason,
    "gate-terminal-phase",
    "release reason must signal the terminal-phase release path",
  );

  // Sanity: a gate with the same state but continuationPhase === "open" is
  // still treated as actively blocking the same action kind.
  const openGate = {
    ...retryWindowGate,
    continuationPhase: "open",
    state: "awaitingRecovery",
  };
  const openResult = orch.isActionBlockedByGate(openGate, "branch");
  assert.equal(openResult.blocked, true);
  assert.equal(openResult.reason, "same-action-blocked");
}

/**
 * Story 2.5 (LOW review round 3): the recovery-first routing in
 * `permission-asked.js` is only safe while approval-outcome aliases and
 * recovery-choice aliases stay disjoint. If a key ever appears in both maps,
 * a runtime payload like `outcome: "skip"` could resolve to a different
 * vocabulary depending on whether a recovery gate is active. Lock the
 * invariant down with a regression test sourced from the same module the hook
 * imports, so any future alias addition fails the suite immediately.
 */
async function verifyPermissionAskedAliasDisjointness() {
  const aliasModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "services", "approval", "permission-asked-aliases.js"),
  ).href;
  const { APPROVAL_OUTCOME_ALIASES, RECOVERY_CHOICE_ALIASES } = await import(
    `${aliasModuleUrl}?v25-disjoint=${Date.now()}`
  );
  const approvalKeys = new Set(Object.keys(APPROVAL_OUTCOME_ALIASES));
  const recoveryKeys = new Set(Object.keys(RECOVERY_CHOICE_ALIASES));
  const overlap = [...approvalKeys].filter((k) => recoveryKeys.has(k));
  assert.deepEqual(
    overlap,
    [],
    `approval-outcome and recovery-choice alias keys must remain disjoint, found overlap: ${JSON.stringify(overlap)}`,
  );
  // Both maps must still resolve to the canonical vocabularies on round-trip.
  for (const key of approvalKeys) {
    assert.ok(
      ["accept", "deny", "ignore-and-continue"].includes(APPROVAL_OUTCOME_ALIASES[key]),
      `approval alias '${key}' must map to a canonical approval outcome`,
    );
  }
  for (const key of recoveryKeys) {
    assert.ok(
      ["retry", "continue-without-automation", "manual-resolution", "abandon"].includes(
        RECOVERY_CHOICE_ALIASES[key],
      ),
      `recovery alias '${key}' must map to a canonical recovery choice`,
    );
  }

  // Story 2.5 (LOW review round 3): _openBlockedGate history must contain
  // exactly one entry — the gate's actual lifecycle was a direct open into
  // `abandoned`. A synthetic `awaitingRecovery` precursor would mislead audit
  // consumers reconstructing the timeline from `gate.history`.
  const orchModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "services", "approval", "recovery-orchestrator.js"),
  ).href;
  const wfModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "services", "workflow", "workflow-state.js"),
  ).href;
  const [{ createWorkflowStateStore }, orch] = await Promise.all([
    import(`${wfModuleUrl}?v25-history=${Date.now()}`),
    import(`${orchModuleUrl}?v25-history=${Date.now()}`),
  ]);
  const store = createWorkflowStateStore();
  store.set("s-25-history", {
    sessionID: "s-25-history",
    commandName: "bmad-bmm-quick-dev",
    phase: "in-progress",
  });
  // Drive `_openBlockedGate` via a non-recoverable approval invariant
  // violation (missing actionKind triggers the controlled-stop path).
  const blocked = await orch.openRecoveryFromApproval({
    workflowState: store,
    sessionID: "s-25-history",
    approvalOutcome: "deny",
    actionKind: null, // intentionally invalid → invariant-violation → blocked
  });
  assert.equal(blocked.outcome, "blocked");
  assert.ok(Array.isArray(blocked.gate.history));
  assert.equal(
    blocked.gate.history.length,
    1,
    "non-recoverable open must record exactly one history entry (abandoned)",
  );
  assert.equal(blocked.gate.history[0].state, "abandoned");
  assert.equal(blocked.gate.history[0].choice, "abandon");
}

// ---- Story 3.2 review follow-up tests -------------------------------------

function configureGitIdentity(directory) {
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: directory,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "Test"], {
    cwd: directory,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "commit.gpgsign", "false"], {
    cwd: directory,
    stdio: "pipe",
  });
}

function gitCommitFiles(directory, files, message) {
  execFileSync("git", ["add", "-A", "--", ...files], { cwd: directory, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", message], { cwd: directory, stdio: "pipe" });
}

function listLastCommitFiles(directory) {
  const stdout = execFileSync("git", ["show", "--name-status", "--format=", "HEAD"], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("\t");
      // Rename / copy lines look like "R100\told\tnew" — surface both paths
      // so callers asserting on `paths` can match either endpoint.
      if (parts.length >= 3 && /^[RC]/i.test(parts[0])) {
        return { status: parts[0], path: parts[2], fromPath: parts[1] };
      }
      if (parts.length >= 2) {
        return { status: parts[0], path: parts[1] };
      }
      return { status: parts[0] || line, path: null };
    });
}

async function verifyBuildCommitArgsScopesPathspecToProposal() {
  const { buildCommitArgs } = await import(`${runGitCommandModuleUrl}?build-commit-args=${Date.now()}`);

  const result = buildCommitArgs({
    message: "Finish workflow outputs",
    files: ["src/a.js", "docs/b.md"],
  });

  // git add -A -- <files>: deletions in the proposal scope are staged for removal,
  // additions/modifications are staged normally; files outside the pathspec are untouched.
  assert.deepEqual(result.addArgs, ["add", "-A", "--", "src/a.js", "docs/b.md"]);

  // git commit -m <msg> -- <files>: pathspec-restricted commit so that pre-staged
  // unrelated files cannot be swept into the workflow commit.
  assert.deepEqual(
    result.commitArgs,
    ["commit", "-m", "Finish workflow outputs", "--", "src/a.js", "docs/b.md"],
  );

  // Defensive: paths with whitespace and quote-looking glyphs are forwarded
  // verbatim through --, so the runGitAction pathspec matches the approval
  // metadata exactly (no shell quoting / no path mutation).
  const tricky = buildCommitArgs({
    message: "msg",
    files: ['docs/"quoted name".md', "src/space file.js", "renamed/from->to.txt"],
  });
  assert.deepEqual(tricky.commitArgs, [
    "commit",
    "-m",
    "msg",
    "--",
    'docs/"quoted name".md',
    "src/space file.js",
    "renamed/from->to.txt",
  ]);

  assert.throws(
    () => buildCommitArgs({ message: "msg", files: [] }),
    /Commit actions require at least one file/,
    "empty proposal scope must reject before invoking git",
  );
  assert.throws(
    () => buildCommitArgs(null),
    /A valid commit action is required/,
    "null commit action must throw",
  );
}

async function verifyRunGitActionRejectsStagedFilesOutsideProposal() {
  const { runGitAction } = await import(`${runGitCommandModuleUrl}?pathspec=${Date.now()}`);

  const repo = createGitWorkspace({ initialize: true });
  configureGitIdentity(repo);
  fs.writeFileSync(path.join(repo, "seed.txt"), "seed", "utf8");
  gitCommitFiles(repo, ["seed.txt"], "seed");

  // Approved scope: src/a.js only.
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "a.js"), "console.log('a');\n", "utf8");

  // Unrelated file is pre-staged outside the proposal scope. Without a
  // pathspec on commit, it would be swept into the workflow commit and break
  // the AC1 promise that commit scope == approved files only.
  fs.writeFileSync(path.join(repo, "stray.txt"), "stray\n", "utf8");
  execFileSync("git", ["add", "stray.txt"], { cwd: repo, stdio: "pipe" });

  const envelope = await runGitAction({
    directory: repo,
    action: {
      kind: "commit",
      message: "Finish workflow outputs",
      files: ["src/a.js"],
    },
  });
  assert.equal(typeof envelope.stdout, "string");

  const committed = listLastCommitFiles(repo);
  assert.deepEqual(
    committed.map((entry) => entry.path).sort(),
    ["src/a.js"],
    "commit must contain only the approved proposal scope, not pre-staged stray files",
  );
  assert.equal(
    committed[0].status,
    "A",
    "approved file should be added in this commit",
  );

  // The stray file must remain staged but uncommitted.
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.match(status, /^A\s+stray\.txt/m, "out-of-scope staged file must remain staged");

  fs.rmSync(repo, { recursive: true, force: true });
}

async function verifyRunGitActionStagesAndCommitsDeletedFiles() {
  const { runGitAction } = await import(`${runGitCommandModuleUrl}?deletion=${Date.now()}`);

  const repo = createGitWorkspace({ initialize: true });
  configureGitIdentity(repo);
  fs.writeFileSync(path.join(repo, "old.txt"), "old\n", "utf8");
  gitCommitFiles(repo, ["old.txt"], "seed");

  // Workflow deletes a tracked file. The previous implementation only ran
  // `git add -- <files>` and silently dropped deletions, leaving them
  // unstaged so the commit either had nothing to commit or skipped the
  // intended removal entirely.
  fs.unlinkSync(path.join(repo, "old.txt"));

  const envelope = await runGitAction({
    directory: repo,
    action: {
      kind: "commit",
      message: "Finish workflow outputs",
      files: ["old.txt"],
    },
  });
  assert.equal(typeof envelope.stdout, "string");

  const committed = listLastCommitFiles(repo);
  assert.deepEqual(
    committed,
    [{ status: "D", path: "old.txt" }],
    "deletion must be staged via git add -A and recorded in the commit",
  );

  fs.rmSync(repo, { recursive: true, force: true });
}

async function verifyRunGitActionHandlesWhitespaceAndQuotedPaths() {
  const { runGitAction } = await import(`${runGitCommandModuleUrl}?ws-paths=${Date.now()}`);

  const repo = createGitWorkspace({ initialize: true });
  configureGitIdentity(repo);

  // Set core.quotepath=false so git status / show emit literal UTF-8 instead
  // of C-style \xxx escaped path bytes — both states must be commit-safe.
  execFileSync("git", ["config", "core.quotepath", "false"], { cwd: repo, stdio: "pipe" });

  fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  // Windows reserves `"` `<` `>` `:` `|` `?` `*` `\\` `/` in filenames; we
  // exercise (a) whitespace and (b) non-ASCII (한글), which already produce
  // C-quoted output from `git status` when core.quotepath stays default. The
  // pathspec must round-trip identically through `git add -A -- <files>` and
  // the matching `git commit -- <files>` so approval metadata stays in sync.
  const trickyFiles = [
    "docs/with space.md",
    "docs/한글파일.md",
  ];
  for (const relativePath of trickyFiles) {
    fs.writeFileSync(path.join(repo, relativePath), "x\n", "utf8");
  }

  const envelope = await runGitAction({
    directory: repo,
    action: {
      kind: "commit",
      message: "Finish workflow outputs",
      files: trickyFiles,
    },
  });
  assert.equal(typeof envelope.stdout, "string");

  const committed = listLastCommitFiles(repo);
  assert.deepEqual(
    committed.map((entry) => entry.path).sort(),
    [...trickyFiles].sort(),
    "git add/commit must accept paths with whitespace and non-ASCII verbatim through `--`",
  );

  fs.rmSync(repo, { recursive: true, force: true });
}

async function verifyRunGitActionCommitsRenamedFile() {
  const { runGitAction } = await import(`${runGitCommandModuleUrl}?renames=${Date.now()}`);

  const repo = createGitWorkspace({ initialize: true });
  configureGitIdentity(repo);

  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "old-name.js"), "console.log('x');\n", "utf8");
  gitCommitFiles(repo, ["src/old-name.js"], "seed");

  // Simulate a workflow rename without pre-staging via `git mv` so the
  // pathspec hits both endpoints: src/old-name.js is still tracked in the
  // index (from seed) but missing from the working tree, src/new-name.js is
  // present in the working tree but untracked. `git add -A -- old new` must
  // stage the deletion of old AND the addition of new, then the pathspec-
  // restricted commit must record both — which is the rename invariant.
  fs.renameSync(
    path.join(repo, "src", "old-name.js"),
    path.join(repo, "src", "new-name.js"),
  );

  const envelope = await runGitAction({
    directory: repo,
    action: {
      kind: "commit",
      message: "Finish workflow outputs",
      files: ["src/old-name.js", "src/new-name.js"],
    },
  });
  assert.equal(typeof envelope.stdout, "string");

  const committed = listLastCommitFiles(repo);
  // git records this as a rename detection (R<NN>) when both paths share the
  // same content; we accept either a single R-status or the equivalent A/D
  // pair so the test stays stable across git versions.
  const statuses = committed.map((entry) => (entry.status[0] || "")).sort();
  const paths = committed.map((entry) => entry.path).filter(Boolean).sort();
  assert.ok(
    statuses.every((status) => ["R", "A", "D"].includes(status)),
    `commit statuses must be rename or add+delete pair; got: ${JSON.stringify(committed)}`,
  );
  assert.ok(
    paths.includes("src/new-name.js"),
    "commit must include the new path of the rename",
  );

  fs.rmSync(repo, { recursive: true, force: true });
}

async function verifyCommitProposalCorrelationIdIsUniquePerAttempt() {
  const { buildCommitProposal } = await import(
    `${commitProposalModuleUrl}?correlation=${Date.now()}`
  );

  const baseInput = {
    workflowContext: {
      sessionID: "s-correlation",
      commandName: "bmad-bmm-quick-dev",
      phase: "finish",
    },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "story",
      finalization: "commit-and-push",
    },
    finalizationAssessment: {
      outcome: "allow",
      reason: "finalizable-outputs-detected",
      details: { shouldProposeCommit: true, artifactScope: "implementation" },
    },
    finalizationArtifacts: {
      matchedFiles: [{ path: "src/index.js", kind: "code" }],
    },
  };

  const first = buildCommitProposal(baseInput);
  const second = buildCommitProposal(baseInput);
  assert.ok(first?.correlationId, "first proposal must have a correlationId");
  assert.ok(second?.correlationId, "second proposal must have a correlationId");
  assert.notEqual(
    first.correlationId,
    second.correlationId,
    "retries with the same session and matched-file count must NOT reuse correlationId — audit lines need to separate per attempt",
  );
  assert.match(first.correlationId, /^commit:s-correlation:1:/);
}

async function verifyCommitProposalMessageUsesKoreanTemplate() {
  const { buildCommitProposal } = await import(
    `${commitProposalModuleUrl}?korean=${Date.now()}`
  );

  const proposal = buildCommitProposal({
    workflowContext: {
      sessionID: "s-korean",
      commandName: "bmad-bmm-quick-dev",
      phase: "finish",
    },
    workflowPolicy: {
      category: "implementation",
      finalization: "commit-and-push",
    },
    finalizationAssessment: {
      outcome: "allow",
      reason: "finalizable-outputs-detected",
      details: { shouldProposeCommit: true, artifactScope: "implementation" },
    },
    finalizationArtifacts: {
      matchedFiles: [{ path: "src/index.js", kind: "code" }],
    },
  });

  assert.ok(proposal, "proposal must be produced when finalization is allowed");
  assert.equal(
    proposal.message,
    "워크플로우 완료(bmad-bmm-quick-dev): implementation 산출물 업데이트",
    "commit message must use the Korean template aligned with document_output_language",
  );
}

async function verifyBuildCommitActionWarnsOnNonArrayFiles() {
  const { buildCommitAction } = await import(
    `${commitServiceModuleUrl}?warn-files=${Date.now()}`
  );

  const warnings = [];
  const logger = {
    warn(message, payload) {
      warnings.push({ message, payload });
    },
  };

  const plan = buildCommitAction({ files: "src/index.js", correlationId: "corr-1" }, { logger });
  assert.deepEqual(plan.files, [], "non-array files must be coerced to []");
  assert.equal(warnings.length, 1, "non-array files must emit exactly one warning");
  assert.match(warnings[0].message, /buildCommitAction received non-array files/);
  assert.equal(warnings[0].payload.providedType, "string");
  assert.equal(warnings[0].payload.correlationId, "corr-1");

  warnings.length = 0;
  const planArray = buildCommitAction({ files: ["a.js"], correlationId: "corr-2" }, { logger });
  assert.deepEqual(planArray.files, ["a.js"]);
  assert.equal(warnings.length, 0, "array files must NOT trigger a warning");
}

async function verifyToolExecuteAfterCommitFailureClassifiesAsCommitFailure() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?precommit-fail=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?precommit-fail=${Date.now()}`),
  ]);

  const prompts = [];
  const store = createWorkflowStateStore();
  store.set("s-precommit-fail", {
    sessionID: "s-precommit-fail",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: { isGitRepository: true, branch: "feat/story-3-2", hasRemote: true },
    },
    approvalCurrent: {
      id: "approval:s-precommit-fail:commit:commit",
      actionId: "action:commit:commit",
      sessionID: "s-precommit-fail",
      workflow: "bmad-bmm-quick-dev",
      command: "bmad-bmm-quick-dev",
      phase: "finish",
      actionType: "commit",
      status: "awaitingApproval",
      proposal: {
        kind: "commit",
        action: "commit",
        message: "Finish workflow outputs",
        artifactScope: "implementation",
        changeCountSummary: "1 code file",
        files: ["src/index.js"],
        correlationId: "corr-precommit-fail",
      },
      metadata: { workflow: "bmad-bmm-quick-dev", command: "bmad-bmm-quick-dev" },
    },
    approvalHistory: [],
    pendingActions: [],
  });

  const hook = createPermissionAskedHook(
    { "permission.asked": async () => {} },
    {
      workflowState: store,
      audit: { async info() {} },
      pluginContext: {
        async gitActionRunner() {
          // Simulate pre-commit hook rejection: git exits non-zero with a
          // characteristic stderr fragment. Story 2.5 contract: this stays a
          // recoverable commit-failure rather than escalating to a new code.
          const error = new Error("pre-commit hook rejected commit");
          error.status = 1;
          error.stderr = "pre-commit hook failed (exit code 1)";
          throw error;
        },
        async requestRecoveryDecision(gate) {
          prompts.push(gate);
        },
      },
    },
  );

  await hook({
    sessionID: "s-precommit-fail",
    approvalId: "approval:s-precommit-fail:commit:commit",
    actionId: "action:commit:commit",
    outcome: "accept",
  });

  const state = store.get("s-precommit-fail");
  assert.equal(state.lastGitResult.code, "commit-failure", "pre-commit hook rejection → commit-failure envelope");
  assert.equal(state.lastGitFailure.suggestedRecoveryKind, "fix-and-retry");
  assert.equal(state.recoveryGate?.actionKind, "commit");
  assert.equal(prompts.length, 1, "pre-commit hook rejection must deliver a recovery prompt");
}

async function verifyExecuteApprovedCommitPreflightDriftReportsRepositoryStateMismatch() {
  const [
    { createWorkflowStateStore },
    { executeCommit, buildCommitAction },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?preflight-drift=${Date.now()}`),
    import(`${commitServiceModuleUrl}?preflight-drift=${Date.now()}`),
  ]);

  const store = createWorkflowStateStore();
  store.set("s-preflight-drift", {
    sessionID: "s-preflight-drift",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
  });

  let runnerInvoked = false;
  const plan = buildCommitAction({
    message: "Finish workflow outputs",
    files: ["src/index.js"],
    correlationId: "corr-preflight-drift",
  });

  const envelope = await executeCommit({
    plan,
    approval: { resolvedAt: "2026-05-09T00:00:00.000Z" },
    // Approval was granted against branch "feat/story-3-2" with staged changes,
    // but the observed snapshot at execution time disagrees → preflight drift.
    expectedState: { headBranch: "feat/story-3-2", hasRemote: true, hasStagedChanges: true },
    repositorySnapshot: { headBranch: "main", hasRemote: true, hasStagedChanges: false },
    workflowContext: {
      sessionID: "s-preflight-drift",
      commandName: "bmad-bmm-quick-dev",
      phase: "finish",
    },
    gitRunner: async () => {
      runnerInvoked = true;
      return { stdout: "" };
    },
    audit: { async info() {} },
    workflowState: store,
  });

  assert.equal(runnerInvoked, false, "preflight drift must short-circuit before the runner is invoked");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, "repository-state-mismatch");
  assert.equal(envelope.details.recoverable, true);
  assert.equal(envelope.details.suggestedRecoveryKind, "re-evaluate-after-refresh");

  const state = store.get("s-preflight-drift");
  assert.equal(state.lastGitAction.kind, "commit");
  assert.equal(state.lastGitResult.status, "failed");
  assert.equal(state.lastGitResult.code, "repository-state-mismatch");
  assert.equal(
    state.pendingRecoveryContext?.code,
    "repository-state-mismatch",
    "preflight drift must persist a recoverable pending recovery context for Story 2.5 to consume",
  );
}

async function verifyDocsOnlyFinalizationSummarizesByDocumentKinds() {
  const [{ createWorkflowStateStore }, { createToolExecuteAfterHook }] = await Promise.all([
    import(`${workflowStateModuleUrl}?docs-only=${Date.now()}`),
    import(`${toolExecuteAfterModuleUrl}?docs-only=${Date.now()}`),
  ]);

  const approvals = [];
  const store = createWorkflowStateStore();
  store.set("s-docs-only", {
    sessionID: "s-docs-only",
    commandName: "bmad-bmm-quick-dev",
    arguments: "docs-only finalization",
    detectedAt: "2026-05-09T00:00:00.000Z",
    phase: "in-progress",
    touchedFiles: [
      { path: "_bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md", kind: "technical-doc" },
      { path: "_bmad-output/planning-artifacts/architecture.md", kind: "planning-artifact" },
    ],
  });

  const hook = createToolExecuteAfterHook(
    { "tool.execute.after": async () => {} },
    {
      workflowState: store,
      audit: { async info() {} },
      pluginContext: {
        directory: projectRoot,
        resolvePolicy() {
          return {
            outcome: "allow",
            details: {
              policy: {
                category: "implementation",
                identityStrategy: "story",
                branchRequired: true,
                finalization: "commit-and-push",
              },
            },
          };
        },
        listChangedFiles() {
          return [
            "_bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md",
            "_bmad-output/planning-artifacts/architecture.md",
          ];
        },
        async requestApproval(request) {
          approvals.push(request);
        },
      },
    },
  );

  await hook(
    { sessionID: "s-docs-only", tool: "finish", args: {} },
    {
      changedFiles: [
        "_bmad-output/implementation-artifacts/3-2-prepare-and-execute-workflow-completion-commits.md",
        "_bmad-output/planning-artifacts/architecture.md",
      ],
    },
  );

  assert.equal(approvals.length, 1, "docs-only finalization must still publish a commit approval");
  const proposal = approvals[0].proposal;
  assert.equal(proposal.kind, "commit");
  assert.equal(
    proposal.changeCountSummary,
    "1 technical-doc file, 1 planning-artifact file",
    "docs-only commit summary must aggregate technical-doc + planning-artifact counts",
  );
  assert.deepEqual(
    [...proposal.artifactKinds].sort(),
    ["planning-artifact", "technical-doc"],
    "artifactKinds must enumerate every document kind present in the scope",
  );
}

async function verifyOutOfScopeOnlyFinalizationDoesNotPublishCommit() {
  const [{ createWorkflowStateStore }, { createToolExecuteAfterHook }] = await Promise.all([
    import(`${workflowStateModuleUrl}?ignored-only=${Date.now()}`),
    import(`${toolExecuteAfterModuleUrl}?ignored-only=${Date.now()}`),
  ]);

  const approvals = [];
  const events = [];
  const store = createWorkflowStateStore();
  store.set("s-ignored-only", {
    sessionID: "s-ignored-only",
    commandName: "bmad-bmm-quick-dev",
    arguments: "ignored-only finalization",
    detectedAt: "2026-05-09T00:00:00.000Z",
    phase: "in-progress",
    touchedFiles: [
      { path: ".opencode/state/cache.json", kind: "other" },
      { path: "node_modules/.bin/tool", kind: "other" },
    ],
  });

  const hook = createToolExecuteAfterHook(
    { "tool.execute.after": async () => {} },
    {
      workflowState: store,
      audit: {
        async info(message, payload) {
          events.push({ message, payload });
        },
      },
      pluginContext: {
        directory: projectRoot,
        resolvePolicy() {
          return {
            outcome: "allow",
            details: {
              policy: {
                category: "implementation",
                identityStrategy: "story",
                branchRequired: true,
                finalization: "commit-and-push",
              },
            },
          };
        },
        listChangedFiles() {
          return [".opencode/state/cache.json", "node_modules/.bin/tool"];
        },
        async requestApproval(request) {
          approvals.push(request);
        },
      },
    },
  );

  await hook(
    { sessionID: "s-ignored-only", tool: "finish", args: {} },
    { changedFiles: [".opencode/state/cache.json", "node_modules/.bin/tool"] },
  );

  const snapshot = store.get("s-ignored-only");
  assert.equal(
    snapshot.commitProposal ?? null,
    null,
    "out-of-scope-only changes must not produce a commitProposal",
  );
  assert.equal(
    approvals.length,
    0,
    "out-of-scope-only changes must not request any commit approval — workflow stays non-blocking",
  );
  assert.equal(snapshot.finalizationAssessment.reason, "no-finalizable-outputs");
  assert.ok(
    events.some((entry) => entry.message === "git.finalization.outputs.skipped"),
    "out-of-scope-only changes must emit git.finalization.outputs.skipped",
  );
}

async function verifyToolExecuteAfterFinishSkipsPublishWhenStaleBranchProposalLingers() {
  const [{ createWorkflowStateStore }, { createToolExecuteAfterHook }] = await Promise.all([
    import(`${workflowStateModuleUrl}?finish-no-publish=${Date.now()}`),
    import(`${toolExecuteAfterModuleUrl}?finish-no-publish=${Date.now()}`),
  ]);

  const approvals = [];
  const events = [];
  const store = createWorkflowStateStore();
  // Lingering branchProposal would otherwise be surfaced again by
  // selectNextPlannedAction at finish — Story 3.2 review (MEDIUM) requires
  // the finish hook to gate on commitProposal/allow-outcome.
  store.set("s-finish-no-publish", {
    sessionID: "s-finish-no-publish",
    commandName: "bmad-bmm-quick-dev",
    arguments: "finish hook gating",
    detectedAt: "2026-05-09T00:00:00.000Z",
    phase: "in-progress",
    touchedFiles: [{ path: ".opencode/state/cache.json", kind: "other" }],
    branchProposal: {
      kind: "branch",
      action: "create",
      name: "feat/stale",
    },
  });

  const hook = createToolExecuteAfterHook(
    { "tool.execute.after": async () => {} },
    {
      workflowState: store,
      audit: {
        async info(message, payload) {
          events.push({ message, payload });
        },
      },
      pluginContext: {
        directory: projectRoot,
        resolvePolicy() {
          return {
            outcome: "allow",
            details: {
              policy: {
                category: "implementation",
                identityStrategy: "story",
                branchRequired: true,
                finalization: "commit-and-push",
              },
            },
          };
        },
        listChangedFiles() {
          return [".opencode/state/cache.json"];
        },
        async requestApproval(request) {
          approvals.push(request);
        },
      },
    },
  );

  await hook(
    { sessionID: "s-finish-no-publish", tool: "finish", args: {} },
    { changedFiles: [".opencode/state/cache.json"] },
  );

  assert.equal(
    approvals.length,
    0,
    "finish hook must NOT republish lingering branchProposal as approval when there is no finalization proposal",
  );
  assert.ok(
    !events.some((entry) => entry.message === "approval.requested"),
    "finish hook must NOT emit approval.requested for stale branchProposal at finish",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 3.1 review round 1 follow-ups
// ─────────────────────────────────────────────────────────────────────────────

async function verifyEvaluateWorkflowFinalizationSwallowsAuditFailures() {
  const [
    { createWorkflowStateStore },
    { evaluateWorkflowFinalization },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?audit-throws=${Date.now()}`),
    import(`${evaluateWorkflowFinalizationModuleUrl}?audit-throws=${Date.now()}`),
  ]);

  const store = createWorkflowStateStore();
  store.set("s-audit-throws", {
    sessionID: "s-audit-throws",
    commandName: "bmad-bmm-quick-dev",
    arguments: "",
    detectedAt: "2026-05-10T00:00:00.000Z",
    phase: "in-progress",
    touchedFiles: [{ path: "src/index.js", kind: "code" }],
  });

  const failingAudit = {
    async info() {
      throw new Error("audit sink unavailable");
    },
  };

  let assessment;
  // The throwing audit sink must NOT propagate out of the finish path —
  // assessment is already persisted to workflowState by this point and
  // downstream stories depend on it being available regardless of audit.
  await assert.doesNotReject(async () => {
    assessment = await evaluateWorkflowFinalization({
      workflowState: store,
      sessionID: "s-audit-throws",
      input: { tool: "finish", args: {} },
      output: { changedFiles: ["src/index.js"] },
      audit: failingAudit,
      pluginContext: {
        directory: projectRoot,
        resolvePolicy() {
          return {
            outcome: "allow",
            details: {
              policy: {
                category: "implementation",
                identityStrategy: "story",
                branchRequired: true,
                finalization: "commit-and-push",
              },
            },
          };
        },
      },
    });
  }, "audit sink failure must not surface from evaluateWorkflowFinalization");

  assert.ok(assessment, "assessment must still be returned when audit throws");
  const persisted = store.get("s-audit-throws");
  assert.ok(persisted.finalizationAssessment, "finalizationAssessment must be persisted even when audit throws");
  assert.ok(persisted.commitProposal, "commitProposal must still be generated when audit throws");
}

async function verifySingletonArtifactPolicyIgnoresRepoWideStatusFallback() {
  const [
    { createWorkflowStateStore },
    { evaluateWorkflowFinalization },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?singleton-fallback=${Date.now()}`),
    import(`${evaluateWorkflowFinalizationModuleUrl}?singleton-fallback=${Date.now()}`),
  ]);

  const store = createWorkflowStateStore();
  // Singleton workflow with NO touched files; if the repo-wide fallback
  // were consulted it would pull in unrelated dirty files and the policy
  // would mis-classify the workflow as `artifact-scope-mismatch`.
  store.set("s-singleton", {
    sessionID: "s-singleton",
    commandName: "bmad-bmm-create-prd",
    arguments: "",
    detectedAt: "2026-05-10T00:00:00.000Z",
    phase: "in-progress",
    touchedFiles: [],
  });

  let listChangedFilesCalls = 0;
  await evaluateWorkflowFinalization({
    workflowState: store,
    sessionID: "s-singleton",
    input: { tool: "finish", args: {} },
    output: {},
    audit: { async info() {} },
    pluginContext: {
      directory: projectRoot,
      resolvePolicy() {
        return {
          outcome: "allow",
          details: {
            policy: {
              category: "planning",
              identityStrategy: "artifact-singleton",
              artifactKey: "prd",
              branchRequired: true,
              finalization: "commit-optional-push",
            },
          },
        };
      },
      listChangedFiles() {
        listChangedFilesCalls += 1;
        // What the repo-wide fallback would return — files entirely
        // unrelated to the prd singleton scope.
        return ["src/index.js", "tests/regression.test.js", "node_modules/.bin/x"];
      },
    },
  });

  assert.equal(
    listChangedFilesCalls,
    0,
    "singleton artifact policy must NOT consult listChangedFiles fallback (would import unrelated dirty files)",
  );
}

async function verifyNormalizeTrackedFilePathRejectsOutOfRepoAbsolutePath() {
  const { normalizeTrackedFilePath } = await import(
    `${finalizationArtifactsModuleUrl}?out-of-repo=${Date.now()}`
  );

  const repoRoot = path.join(os.tmpdir(), "fake-repo");
  const outsideAbsolute = path.join(os.tmpdir(), "other-repo", "leak.js");

  assert.equal(
    normalizeTrackedFilePath(outsideAbsolute, repoRoot),
    null,
    "absolute path outside the repository root must NOT be coerced into an in-repo-looking relative",
  );

  // Sanity: a path inside the repo still normalizes correctly.
  const insideAbsolute = path.join(repoRoot, "src", "index.js");
  assert.equal(
    normalizeTrackedFilePath(insideAbsolute, repoRoot),
    "src/index.js",
    "absolute path inside the repository root must still produce the expected relative",
  );

  // Direct `../...` traversal strings are also rejected.
  assert.equal(
    normalizeTrackedFilePath("../../etc/passwd", repoRoot),
    null,
    "explicit traversal-prefixed path must be rejected as out-of-repo",
  );
}

async function verifyParseStatusPorcelainHandlesQuotedRenameAndWhitespace() {
  const { parseStatusPorcelainPaths } = await import(
    `${parseStatusPorcelainModuleUrl}?status-parse=${Date.now()}`
  );

  // A quoted path containing a backslash + double-quote escape decodes
  // back to its literal byte sequence. Git emits this when
  // `core.quotePath=true` (the default) and the path has special chars.
  assert.deepEqual(
    parseStatusPorcelainPaths('?? "weird \\"name\\".js"\n'),
    ['weird "name".js'],
    "C-quoted path with escaped double quotes must decode to its literal form",
  );

  // Rename lines yield BOTH endpoints so Story 3.2's pathspec can stage the
  // deletion (old) and addition (new) atomically.
  assert.deepEqual(
    parseStatusPorcelainPaths("R  src/old.js -> src/new.js\n"),
    ["src/old.js", "src/new.js"],
    "rename line must expand to both old and new paths",
  );

  // Path with embedded whitespace — the previous parser stripped it via
  // `.trim()` on the payload. The corrected parser preserves every byte
  // after the 3-char status prefix verbatim.
  assert.deepEqual(
    parseStatusPorcelainPaths(" M spaced/ leading.js\n"),
    ["spaced/ leading.js"],
    "path with significant embedded whitespace must be preserved (no trim)",
  );

  // C-quoted UTF-8 octal sequence — git encodes non-ASCII bytes as octal
  // when `core.quotePath=true`. The decoder must reassemble UTF-8.
  // "한글" in UTF-8: e9 95 9c eb b6 84? Actually 한 = e6 95 9c (no, 한=ED 95 9C). Let's verify:
  //   "한" is U+D55C; UTF-8 = ED 95 9C → octal: \355\225\234
  //   "글" is U+AE00; UTF-8 = EA B8 80 → octal: \352\270\200
  assert.deepEqual(
    parseStatusPorcelainPaths('?? "\\355\\225\\234\\352\\270\\200.md"\n'),
    ["한글.md"],
    "octal-escaped UTF-8 path must decode back to its original characters",
  );

  // Multi-line, mixed-status output: untracked, staged, modified, rename.
  const stdout = [
    "?? new.js",
    "M  src/index.js",
    " M tests/regression.test.js",
    "R  src/old.js -> src/new.js",
    "",
  ].join("\n");
  assert.deepEqual(
    parseStatusPorcelainPaths(stdout),
    ["new.js", "src/index.js", "tests/regression.test.js", "src/old.js", "src/new.js"],
    "multi-line porcelain output must yield every changed path including rename endpoints",
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
  .then(() => verifyRepositoryReadinessContracts())
  .then(() => verifyRepositoryReadinessIntegration())
  .then(() => verifyInvalidBranchRegexValidation())
  .then(() => verifyConfigValidationFailedAuditPayload())
  // Story 2.1 tests
  .then(() => verifyClassifyGitActionContracts())
  .then(() => verifyBuildApprovalRequestContracts())
  .then(() => verifyApprovalPolicyServiceContracts())
  .then(() => verifyWorkflowStateApprovalIsolation())
  .then(() => verifyApprovalRequestFromBranchProposal())
  .then(() => verifyApprovalRequestFromInitProposal())
  .then(() => verifyApprovalIdempotency())
  .then(() => verifyNoApprovalForNonWorkflowAndPlanning())
  .then(() => verifyApprovalRequestPayloadShape())
  .then(() => verifyApprovalBuiltArtifactParity())
  // Story 2.1 code review fixes (H1, H2, M1)
  .then(() => verifyApprovalPromptDeliveryFailureAudit())
  .then(() => verifyPriorStateCarryOver())
  .then(() => verifyWorkflowStateNestedDeepIsolation())
  .then(() => verifyWorkflowStateFinalizationIsolation())
  // Story 2.1 second review fix (L4)
  .then(() => verifyStaleGitFieldsInvalidatedOnReentry())
  // Story 2.2 tests
  .then(() => verifyApprovalRedactionHelpers())
  .then(() => verifyApprovalExplanationContracts())
  .then(() => verifyBuildApprovalRequestStory22Fields())
  .then(() => verifyApprovalRedactionThroughRequest())
  .then(() => verifyApprovalExplanationHookIntegration())
  .then(() => verifyApprovalExplanationFallback())
  // Story 2.3 tests
  .then(() => verifyApprovalResolutionStateContracts())
  .then(() => verifyBuildApprovalResolutionContracts())
  .then(() => verifyApprovalRequestActionIdContract())
  .then(() => verifyApprovalRequestedAuditIncludesActionId())
  .then(() => verifyConsumeApprovalOutcomeAccept())
  .then(() => verifyConsumeApprovalOutcomeDeny())
  .then(() => verifyConsumeApprovalOutcomeIgnoreAndContinue())
  .then(() => verifyConsumeApprovalOutcomeIdempotent())
  .then(() => verifyConsumeApprovalOutcomeLeavesQueueIntact())
  .then(() => verifyCommandExecuteBeforePromotesQueueHead())
  .then(() => verifyPermissionAskedHookFlow())
  .then(() => verifySessionDeletedClearsAllApprovalState())
  // Story 2.3 post-review fixes
  .then(() => verifyApprovalRequestedAuditDetailsShape())
  .then(() => verifyPromptMetadataIncludesActionId())
  .then(() => verifyPermissionAskedHookEmitsResolutionFailedOnUnknownOutcome())
  .then(() => verifyPermissionAskedHookInjectsReasonCode())
  // Story 2.3 second review fix (LOW)
  .then(() => verifyPermissionAskedHookIgnoresGenericActionField())
  // Story 2.4 — detect and report Git conflicts and execution failures
  .then(() => verifyClassifyGitExecutionFailureContract())
  .then(() => verifyGitExecutorEnvelopeShape())
  .then(() => verifyGitExecutorPreflightShortCircuit())
  .then(() => verifyGitExecutorSubprocessFailureMapping())
  .then(() => verifyGitExecutorPostConditionFailure())
  .then(() => verifyGitExecutorAuditEventPayload())
  .then(() => verifyWorkflowStateExecutionMirror())
  .then(() => verifyCommitAndPushServicesSurfaceEnvelopes())
  // Story 2.5 — recovery paths without failing the workflow
  .then(() => verifyRecoveryStateMachineContracts())
  .then(() => verifyClassifyRecoveryContracts())
  .then(() => verifyRecoveryOptionsContracts())
  .then(() => verifyOpenRecoveryFromApprovalDeny())
  .then(() => verifyOpenRecoveryFromExecution())
  .then(() => verifySelectRetryIncrementsAttempt())
  .then(() => verifySelectContinueWithoutAutomation())
  .then(() => verifyManualResolutionTwoStep())
  .then(() => verifyGateBlockingRules())
  .then(() => verifyInvariantViolationsAreBlockedNotThrown())
  .then(() => verifyRecoveryGateIsolatedAndCleanedUp())
  .then(() => verifyDeniedApprovalDoesNotHardFailWorkflow())
  // Story 2.5 review fixes
  .then(() => verifyBuildRecoveryPromptContracts())
  .then(() => verifyRecoveryPromptDeliveredAfterDeny())
  .then(() => verifyRecoveryChoiceRoutingThroughPermissionAsked())
  // Story 2.5 review round 2 fixes
  .then(() => verifyRecoveryGatePersistsWorkflowCommandAttribution())
  .then(() => verifyHookBlockedEventMatchesOrchestratorShape())
  .then(() => verifyTerminalContinuationPhaseReleasesGate())
  // Story 2.5 review round 3 fixes
  .then(() => verifyPermissionAskedAliasDisjointness())
  // Story 3.1 — detect finalizable workflow outputs
  .then(() => verifyFileEditedTracksTouchedFilesAndSessionCleanup())
  .then(() => verifyDetectFinalizableOutputs())
  .then(() => verifyToolExecuteAfterFinishEvaluatesFinalization())
  // Story 3.2 — prepare and execute workflow completion commits
  .then(() => verifyToolExecuteAfterFinishPublishesCommitApproval())
  .then(() => verifyPermissionAskedAcceptExecutesCommitProposal())
  .then(() => verifyPermissionAskedCommitFailureOpensRecovery())
  // Story 3.2 review follow-up coverage
  .then(() => verifyBuildCommitArgsScopesPathspecToProposal())
  .then(() => verifyRunGitActionRejectsStagedFilesOutsideProposal())
  .then(() => verifyRunGitActionStagesAndCommitsDeletedFiles())
  .then(() => verifyRunGitActionHandlesWhitespaceAndQuotedPaths())
  .then(() => verifyRunGitActionCommitsRenamedFile())
  .then(() => verifyCommitProposalCorrelationIdIsUniquePerAttempt())
  .then(() => verifyCommitProposalMessageUsesKoreanTemplate())
  .then(() => verifyBuildCommitActionWarnsOnNonArrayFiles())
  .then(() => verifyToolExecuteAfterCommitFailureClassifiesAsCommitFailure())
  .then(() => verifyExecuteApprovedCommitPreflightDriftReportsRepositoryStateMismatch())
  .then(() => verifyDocsOnlyFinalizationSummarizesByDocumentKinds())
  .then(() => verifyOutOfScopeOnlyFinalizationDoesNotPublishCommit())
  .then(() => verifyToolExecuteAfterFinishSkipsPublishWhenStaleBranchProposalLingers())
  // Story 3.1 review round 1 follow-ups
  .then(() => verifyEvaluateWorkflowFinalizationSwallowsAuditFailures())
  .then(() => verifySingletonArtifactPolicyIgnoresRepoWideStatusFallback())
  .then(() => verifyNormalizeTrackedFilePathRejectsOutOfRepoAbsolutePath())
  .then(() => verifyParseStatusPorcelainHandlesQuotedRenameAndWhitespace())
  .catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });
