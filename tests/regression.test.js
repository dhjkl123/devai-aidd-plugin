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
