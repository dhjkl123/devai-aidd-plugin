import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const legacyModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "policies", "legacy", "devai-git-workflo.js"),
).href;
const wrapperModuleUrl = pathToFileURL(path.join(projectRoot, "src", "index.js")).href;
const builtModuleUrl = pathToFileURL(path.join(projectRoot, "dist", "devai-aidd-guard.js")).href;

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

    assert.equal(wrapperError?.message, legacyError?.message, "wrapper mutating-tool error differs");
    assert.equal(builtError?.message, legacyError?.message, "built mutating-tool error differs");

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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
