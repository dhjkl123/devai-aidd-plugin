/**
 * Unit tests for opencode-skill-workflow-guard (tech-spec):
 *
 *   - AC1 / AC1-edge: loadWorkflowSkills discovery
 *   - detectWorkflowContext on the unioned Set
 *   - AC3: skill-trigger fires commandExecuteBeforeHandler once
 *   - AC4: dedup on same skill / busy approval / busy startup chain
 *   - AC4-a: Layer order — F1 log → skill-trigger log → Layer 0 throw
 *   - AC4-b: F1 diagnostic log fires for unknown tool name and dedups
 *   - AC4-c: `name` arg key does NOT trigger the skill handler
 *   - AC5: non-skill tools (other than via existing layers) are unaffected
 *   - AC6: fail-open when skillName cannot be resolved
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

const loadConfigModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "config", "load-config.js"),
).href;
const detectWorkflowContextModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "detect-workflow-context.js"),
).href;
const toolExecuteBeforeModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "hooks", "tool-execute-before.js"),
).href;
const workflowStateModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "workflow", "workflow-state.js"),
).href;
const constantsModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "utils", "constants.js"),
).href;

function makeRealFsAdapter() {
  return {
    existsSync: fs.existsSync,
    readdirSync: fs.readdirSync,
  };
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function testLoadWorkflowSkillsDiscovery() {
  const { loadWorkflowSkills } = await import(loadConfigModuleUrl);
  const root = makeTempDir("skill-guard-");
  try {
    const skillsDir = path.join(root, ".opencode", "skills");
    const goodDir = path.join(skillsDir, "bmad-create-story");
    fs.mkdirSync(goodDir, { recursive: true });
    fs.writeFileSync(path.join(goodDir, "SKILL.md"), "skill body");

    const emptyDir = path.join(skillsDir, "empty-dir");
    fs.mkdirSync(emptyDir, { recursive: true });
    // intentionally no SKILL.md inside empty-dir

    const result = loadWorkflowSkills(root, makeRealFsAdapter());
    assert.ok(result instanceof Set, "loadWorkflowSkills returns a Set");
    assert.ok(result.has("bmad-create-story"), "AC1: discovers SKILL.md-bearing dir");
    assert.ok(
      !result.has("empty-dir"),
      "AC1-edge: ignores directories without SKILL.md",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testLoadWorkflowSkillsMissingSkillsDir() {
  const { loadWorkflowSkills } = await import(loadConfigModuleUrl);
  const root = makeTempDir("skill-guard-missing-");
  try {
    const result = loadWorkflowSkills(root, makeRealFsAdapter());
    assert.ok(result instanceof Set, "returns Set even without skills dir");
    assert.equal(result.size, 0, "AC1-edge: empty Set when skills dir missing");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testDetectWorkflowContextWithUnionedSet() {
  const { detectWorkflowContext } = await import(detectWorkflowContextModuleUrl);
  const unioned = new Set(["bmad-bmm-quick-dev", "bmad-create-story"]);
  const ctx = detectWorkflowContext(
    {
      command: "bmad-create-story",
      sessionID: "sess-union",
      arguments: "",
    },
    unioned,
    { detectedAt: "2026-05-13T00:00:00.000Z" },
  );
  assert.ok(ctx, "skill name in unioned Set is detected");
  assert.equal(ctx.commandName, "bmad-create-story");
  assert.equal(ctx.phase, "start");
}

function makeDebugCapture() {
  const calls = [];
  return {
    pluginContext: {
      debug: {
        log: (channel, message, payload) => {
          calls.push({ channel, message, payload });
        },
      },
      directory: "/dev/null/no-such-dir",
    },
    calls,
  };
}

function makeRuntimeConfig({ debugEnabled }) {
  return { config: { debug: { enabled: debugEnabled === true } } };
}

async function testAC3SkillTriggerInvokesHandlerOnce() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  const calls = [];
  const handler = async (input) => {
    calls.push(input);
  };
  const { pluginContext } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: handler,
    workflowNames: new Set(["bmad-create-story"]),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: false }),
  });
  await hook(
    { tool: "skill", sessionID: "ac3-session" },
    { args: { skill: "bmad-create-story" } },
  );
  assert.equal(calls.length, 1, "AC3: handler invoked exactly once");
  assert.equal(calls[0].command, "bmad-create-story");
  assert.equal(calls[0].sessionID, "ac3-session");
}

async function testAC4DedupOnSameSession() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  const calls = [];
  const handler = async (input) => {
    calls.push(input);
    // Simulate what command-execute-before does — set workflow context.
    workflowState.set("ac4-session", {
      commandName: input.command,
      sessionID: input.sessionID,
      arguments: input.arguments,
      detectedAt: "2026-05-13T00:00:00.000Z",
      phase: "start",
    });
  };
  const { pluginContext } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: handler,
    workflowNames: new Set(["bmad-create-story"]),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: false }),
  });
  await hook(
    { tool: "skill", sessionID: "ac4-session" },
    { args: { skill: "bmad-create-story" } },
  );
  await hook(
    { tool: "skill", sessionID: "ac4-session" },
    { args: { skill: "bmad-create-story" } },
  );
  assert.equal(calls.length, 1, "AC4: same skill not re-invoked in same session");
}

async function testAC4DedupOnBusyApproval() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  // Pre-seed an approval-busy session.
  workflowState.set("ac4-busy-session", {
    commandName: "bmad-bmm-quick-dev",
    sessionID: "ac4-busy-session",
    arguments: "",
    detectedAt: "2026-05-13T00:00:00.000Z",
    phase: "in-progress",
    approvalCurrent: {
      id: "appr-1",
      actionType: "init",
      workflow: "bmad-bmm-quick-dev",
    },
  });

  const calls = [];
  const handler = async (input) => {
    calls.push(input);
  };
  const { pluginContext } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: handler,
    workflowNames: new Set(["bmad-create-story"]),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: false }),
  });
  // The hook will throw at Layer 0 because approvalCurrent is non-null.
  // The skill-trigger branch must not invoke the handler before that throw.
  await assert.rejects(
    () =>
      hook(
        { tool: "skill", sessionID: "ac4-busy-session" },
        { args: { skill: "bmad-create-story" } },
      ),
    /Git workflow guard:/,
    "AC4: Layer 0 should throw because approvalCurrent is non-null",
  );
  assert.equal(
    calls.length,
    0,
    "AC4: handler must NOT be invoked when approvalCurrent != null",
  );
}

async function testAC4aLayerOrderViaDebugLogSequence() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  workflowState.set("ac4a-session", {
    commandName: "bmad-bmm-quick-dev",
    sessionID: "ac4a-session",
    arguments: "",
    detectedAt: "2026-05-13T00:00:00.000Z",
    phase: "in-progress",
    approvalCurrent: {
      id: "appr-1",
      actionType: "init",
      workflow: "bmad-bmm-quick-dev",
    },
  });

  const { pluginContext, calls } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: async () => {
      throw new Error("should not be called — workflowNames mismatch");
    },
    workflowNames: new Set(), // empty so handler is never called
    runtimeConfig: makeRuntimeConfig({ debugEnabled: true }),
  });

  await assert.rejects(
    () =>
      hook(
        { tool: "skill", sessionID: "ac4a-session" },
        { args: { skill: "name-not-in-workflowNames" } },
      ),
    /Git workflow guard:/,
    "Layer 0 should still throw",
  );

  const messages = calls.map((c) => c.message);
  const f1Index = messages.indexOf("tool name observed (first time this session)");
  const skillTrigIndex = messages.indexOf("skill tool invocation observed");
  assert.ok(f1Index >= 0, "AC4-a: F1 log must fire");
  assert.ok(skillTrigIndex >= 0, "AC4-a: skill-trigger log must fire");
  assert.ok(f1Index < skillTrigIndex, "AC4-a: F1 log must precede skill-trigger log");
}

async function testAC4bF1Dedup() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  const { pluginContext, calls } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: async () => {},
    workflowNames: new Set(),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: true }),
  });
  await hook(
    { tool: "totally-unknown-token", sessionID: "ac4b-session" },
    { args: { whatever: 1 } },
  );
  await hook(
    { tool: "totally-unknown-token", sessionID: "ac4b-session" },
    { args: { whatever: 1 } },
  );
  const f1Calls = calls.filter(
    (c) => c.message === "tool name observed (first time this session)",
  );
  assert.equal(f1Calls.length, 1, "AC4-b: F1 fires exactly once per session+tool");
  assert.equal(
    f1Calls[0].payload.matchesSkillTokenSet,
    false,
    "AC4-b: payload reports matchesSkillTokenSet=false for unknown token",
  );
}

async function testAC4cNameKeyDoesNotMatch() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  const calls = [];
  const { pluginContext, calls: debugCalls } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: async (input) => {
      calls.push(input);
    },
    workflowNames: new Set(["bmad-create-story"]),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: true }),
  });
  await hook(
    { tool: "skill", sessionID: "ac4c-session" },
    { args: { name: "bmad-create-story" } },
  );
  assert.equal(calls.length, 0, "AC4-c: `name` key alone must NOT trigger handler");
  const skillTrigLog = debugCalls.find(
    (c) => c.message === "skill tool invocation observed",
  );
  assert.ok(skillTrigLog, "AC4-c: skill-trigger diagnostic still logged");
  assert.equal(
    skillTrigLog.payload.resolvedSkillName,
    null,
    "AC4-c: resolvedSkillName must be null",
  );
  assert.equal(
    skillTrigLog.payload.fallbackNameField,
    "bmad-create-story",
    "AC4-c: fallbackNameField records the `name` arg",
  );
}

async function testAC5NonSkillToolUnaffected() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  const calls = [];
  const { pluginContext } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: async (input) => {
      calls.push(input);
    },
    workflowNames: new Set(["bmad-create-story"]),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: false }),
  });
  // tool="read" should never reach skill-trigger branch
  await hook(
    { tool: "read", sessionID: "ac5-session" },
    { args: { filePath: "/tmp/x" } },
  );
  assert.equal(calls.length, 0, "AC5: non-skill tools must not invoke skill handler");
}

async function testAC6FailOpenOnMissingSkillName() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  const calls = [];
  const { pluginContext, calls: debugCalls } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: async (input) => {
      calls.push(input);
    },
    workflowNames: new Set(["bmad-create-story"]),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: true }),
  });
  // skill tool with no skill/skillName/name keys
  await hook(
    { tool: "skill", sessionID: "ac6-session" },
    { args: { foo: "bar" } },
  );
  assert.equal(calls.length, 0, "AC6: handler not invoked when skillName unresolved");
  const skillTrigLog = debugCalls.find(
    (c) => c.message === "skill tool invocation observed",
  );
  assert.ok(skillTrigLog, "AC6: diagnostic log still emitted");
}

async function testSkillTokensConstantExposed() {
  const { SKILL_TOOL_TOKENS, SKILLS_SUBDIR } = await import(constantsModuleUrl);
  assert.ok(SKILL_TOOL_TOKENS instanceof Set);
  assert.ok(SKILL_TOOL_TOKENS.has("skill"));
  assert.equal(SKILLS_SUBDIR, "skills");
}

async function testLayer1AllowsGitForTrackedReadinessSkip() {
  const { createToolExecuteBeforeHook } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  workflowState.set("readiness-skip-session", {
    sessionID: "readiness-skip-session",
    commandName: "policy-light",
    readinessGate: { enabled: false },
  });

  const { pluginContext } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: async () => {},
    workflowNames: new Set(),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: false }),
  });

  await hook(
    { tool: "bash", sessionID: "readiness-skip-session" },
    { args: { command: "git status" } },
  );
}

async function testLayer1BlocksGitForTrackedOverride() {
  const { createToolExecuteBeforeHook, BASH_GIT_BLOCK_MESSAGE } = await import(toolExecuteBeforeModuleUrl);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const workflowState = createWorkflowStateStore();
  workflowState.set("readiness-override-session", {
    sessionID: "readiness-override-session",
    commandName: "repo-backed",
    readinessGate: { enabled: true },
  });

  const { pluginContext } = makeDebugCapture();
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext,
    commandExecuteBeforeHandler: async () => {},
    workflowNames: new Set(),
    runtimeConfig: makeRuntimeConfig({ debugEnabled: false }),
  });

  await assert.rejects(
    () =>
      hook(
        { tool: "bash", sessionID: "readiness-override-session" },
        { args: { command: "git status" } },
      ),
    (error) => error?.message === BASH_GIT_BLOCK_MESSAGE,
    "tracked override-active session must still block git commands in a non-git directory",
  );
}

async function runTests() {
  const tests = [
    ["loadWorkflowSkills discovery + edge cases", testLoadWorkflowSkillsDiscovery],
    ["loadWorkflowSkills no skills dir", testLoadWorkflowSkillsMissingSkillsDir],
    ["detectWorkflowContext on unioned Set", testDetectWorkflowContextWithUnionedSet],
    ["AC3 skill-trigger invokes handler once", testAC3SkillTriggerInvokesHandlerOnce],
    ["AC4 dedup same session", testAC4DedupOnSameSession],
    ["AC4 dedup busy approval", testAC4DedupOnBusyApproval],
    ["AC4-a layer order (debug.log sequence)", testAC4aLayerOrderViaDebugLogSequence],
    ["AC4-b F1 dedup + matchesSkillTokenSet=false", testAC4bF1Dedup],
    ["AC4-c `name` key does not match", testAC4cNameKeyDoesNotMatch],
    ["AC5 non-skill tools unaffected", testAC5NonSkillToolUnaffected],
    ["AC6 fail-open on missing skillName", testAC6FailOpenOnMissingSkillName],
    ["SKILL_TOOL_TOKENS / SKILLS_SUBDIR exposed", testSkillTokensConstantExposed],
    ["Layer 1 allows git for tracked readiness skip", testLayer1AllowsGitForTrackedReadinessSkip],
    ["Layer 1 blocks git for tracked override", testLayer1BlocksGitForTrackedOverride],
  ];
  for (const [name, fn] of tests) {
    await fn();
    process.stdout.write(`  ok  ${name}\n`);
  }
}

runTests().then(
  () => {
    process.stdout.write("opencode-skill-workflow-guard.test.js: PASS\n");
  },
  (err) => {
    process.stderr.write(`opencode-skill-workflow-guard.test.js: FAIL\n${err?.stack || err}\n`);
    process.exit(1);
  },
);
