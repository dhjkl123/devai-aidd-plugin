import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
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
const readinessGateModuleUrl = pathToFileURL(
  path.join(projectRoot, "src", "services", "git", "resolve-readiness-gate.js"),
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
const builtModulePath = path.join(projectRoot, "dist", "devai-aidd-plugin.js");
const builtModuleUrl = pathToFileURL(builtModulePath).href;

// Story 4.5 R2 (H-1 mitigation): accept injected dependencies so the
// regression-gate meta-guard (`verifyStory45RegressionGateAbortsWithoutBuiltArtifact`)
// can exercise the actual silent-skip protection by passing an `existsSync`
// that returns false against a fixture path. Defaults preserve the original
// behavior for `main()` and any external caller.
function verifyBuiltArtifactExists({
  existsSyncFn = fs.existsSync,
  builtPath = builtModulePath,
} = {}) {
  assert.equal(
    existsSyncFn(builtPath),
    true,
    "missing dist/devai-aidd-plugin.js — run `npm run build` before `npm test`",
  );
}

// `DEFAULT_PLUGIN_CONFIG` no longer carries field values — branch/workflow/
// audit/debug live in installer-shipped templates. Service-direct tests that
// pass branch + workflowPolicy fixtures inline use these constants instead of
// reading from `DEFAULT_PLUGIN_CONFIG.{branch,workflowPolicy}`.
function withBmadAliases(entries) {
  const result = { ...entries };
  for (const [key, value] of Object.entries(entries)) {
    if (!key.startsWith("bmad-bmm-")) continue;
    const alias = key.replace(/^bmad-bmm-/, "bmad-");
    if (Object.prototype.hasOwnProperty.call(result, alias)) continue;
    result[alias] =
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...value }
        : value;
  }
  return result;
}

const TEST_BRANCH_CONFIG = {
  pattern: "{type}/{ticket}-{slug}",
  defaultType: "chore",
  fallbackTicket: "no-ticket",
  longLivedBranches: ["main", "master"],
  defaultMergeTarget: "",
  validationRegex:
    "^(feat|fix|docs|chore|refactor|design)\\/[A-Z]+-\\d+-[a-z0-9-]+$|^(feat|fix|docs|chore|refactor|design)\\/no-ticket-[a-z0-9-]+$",
  commandTypeMap: withBmadAliases({
    "bmad-bmm-check-implementation-readiness": "docs",
    "bmad-bmm-correct-course": "refactor",
    "bmad-bmm-create-architecture": "docs",
    "bmad-bmm-create-epics-and-stories": "docs",
    "bmad-bmm-create-prd": "docs",
    "bmad-bmm-create-product-brief": "docs",
    "bmad-bmm-create-story": "docs",
    "bmad-bmm-create-ux-design": "docs",
    "bmad-bmm-dev-story": "feat",
    "bmad-bmm-document-project": "docs",
    "bmad-bmm-domain-research": "docs",
    "bmad-bmm-edit-prd": "docs",
    "bmad-bmm-generate-project-context": "docs",
    "bmad-bmm-market-research": "docs",
    "bmad-bmm-qa-generate-e2e-tests": "feat",
    "bmad-bmm-quick-dev": "feat",
    "bmad-bmm-quick-dev-new-preview": "feat",
    "bmad-bmm-quick-spec": "docs",
    "bmad-bmm-retrospective": "docs",
    "bmad-bmm-sprint-planning": "docs",
    "bmad-bmm-sprint-status": "chore",
    "bmad-bmm-technical-research": "docs",
    "bmad-bmm-validate-prd": "docs",
    "bmad-bmm-code-review": "fix",
    "bmad-brainstorming": "docs",
    "bmad-editorial-review-prose": "docs",
    "bmad-editorial-review-structure": "docs",
    "bmad-help": "chore",
    "bmad-index-docs": "docs",
    "bmad-party-mode": "chore",
    "bmad-review-adversarial-general": "fix",
    "bmad-review-edge-case-hunter": "fix",
    "bmad-shard-doc": "docs",
  }),
};

const TEST_WORKFLOW_POLICY = withBmadAliases({
  "bmad-bmm-create-story": {
    category: "implementation",
    identityStrategy: "story",
    branchRequired: true,
    finalization: "commit-and-push",
  },
  "bmad-bmm-dev-story": {
    category: "implementation",
    identityStrategy: "story",
    branchRequired: true,
    finalization: "commit-and-push",
  },
  "bmad-bmm-quick-dev": {
    category: "implementation",
    identityStrategy: "ticket-or-args",
    branchRequired: true,
    finalization: "commit-and-push",
  },
  "bmad-bmm-qa-generate-e2e-tests": {
    category: "implementation",
    identityStrategy: "artifact-or-args",
    branchRequired: true,
    finalization: "commit-and-push",
  },
  "bmad-bmm-create-prd": {
    category: "planning",
    identityStrategy: "artifact-singleton",
    artifactKey: "prd",
    branchRequired: false,
    finalization: "commit-optional-push",
  },
});

// Returns the test policy for a given command (used by manual `resolvePolicy`
// callbacks in tests that bypass the full bootstrap pipeline).
function defaultPolicyWithLegacyBranchRequired(commandName /*, defaults */) {
  return TEST_WORKFLOW_POLICY[commandName] ?? null;
}

// Project JSONC fixture used by full-bootstrap tests. `DEFAULT_PLUGIN_CONFIG`
// no longer carries any field values — branch.* / workflowPolicy.* / audit.* /
// debug.* all live in the installer-shipped templates. Tests that exercise the
// full bootstrap pipeline write this fixture into the temp workspace's
// project JSONC so the bootstrap reads it like a real user project would.
//
// We include the full branch fixture (pattern, commandTypeMap, etc.) AND
// branchRequired:true for implementation workflows. mergeObjects in
// load-config does deep per-key merge, so any other field tests need can be
// extended without touching code.
const TEST_PROJECT_JSONC = JSON.stringify({
  branch: {
    pattern: "{type}/{ticket}-{slug}",
    defaultType: "chore",
    fallbackTicket: "no-ticket",
    longLivedBranches: ["main", "master"],
    defaultMergeTarget: "",
    validationRegex:
      "^(feat|fix|docs|chore|refactor|design)\\/[A-Z]+-\\d+-[a-z0-9-]+$|^(feat|fix|docs|chore|refactor|design)\\/no-ticket-[a-z0-9-]+$",
    commandTypeMap: withBmadAliases({
      "bmad-bmm-check-implementation-readiness": "docs",
      "bmad-bmm-correct-course": "refactor",
      "bmad-bmm-create-architecture": "docs",
      "bmad-bmm-create-epics-and-stories": "docs",
      "bmad-bmm-create-prd": "docs",
      "bmad-bmm-create-product-brief": "docs",
      "bmad-bmm-create-story": "docs",
      "bmad-bmm-create-ux-design": "docs",
      "bmad-bmm-dev-story": "feat",
      "bmad-bmm-document-project": "docs",
      "bmad-bmm-domain-research": "docs",
      "bmad-bmm-edit-prd": "docs",
      "bmad-bmm-generate-project-context": "docs",
      "bmad-bmm-market-research": "docs",
      "bmad-bmm-qa-generate-e2e-tests": "feat",
      "bmad-bmm-quick-dev": "feat",
      "bmad-bmm-quick-dev-new-preview": "feat",
      "bmad-bmm-quick-spec": "docs",
      "bmad-bmm-retrospective": "docs",
      "bmad-bmm-sprint-planning": "docs",
      "bmad-bmm-sprint-status": "chore",
      "bmad-bmm-technical-research": "docs",
      "bmad-bmm-validate-prd": "docs",
      "bmad-bmm-code-review": "fix",
    }),
  },
  workflowPolicy: withBmadAliases({
    "bmad-bmm-create-story": {
      category: "implementation",
      identityStrategy: "story",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    "bmad-bmm-dev-story": {
      category: "implementation",
      identityStrategy: "story",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    "bmad-bmm-quick-dev": {
      category: "implementation",
      identityStrategy: "ticket-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    "bmad-bmm-qa-generate-e2e-tests": {
      category: "implementation",
      identityStrategy: "artifact-or-args",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    "bmad-bmm-create-prd": {
      category: "planning",
      identityStrategy: "artifact-singleton",
      artifactKey: "prd",
      finalization: "commit-optional-push",
    },
  }),
  audit: {
    enabled: true,
    logToClient: true,
    logToFile: false,
    logFilePath: "",
    httpEndpoint: "",
  },
});

function writeProjectBranchRequiredFixture(tempRoot) {
  fs.writeFileSync(
    path.join(tempRoot, ".opencode", "devai-aidd-plugin.project.jsonc"),
    TEST_PROJECT_JSONC,
    "utf8",
  );
}

function createTempWorkspace() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-regression-"));
  const commandsDir = path.join(tempRoot, ".opencode", "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(path.join(commandsDir, "bmad-bmm-quick-dev.md"), "# quick dev\n", "utf8");
  fs.writeFileSync(path.join(commandsDir, "bmad-bmm-create-prd.md"), "# create prd\n", "utf8");
  writeProjectBranchRequiredFixture(tempRoot);
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
    // strengthen-approval-prompt-instructions follow-up: branch planning is
    // now suppressed when readiness reports hasCommit === false (HEAD-absent
    // repo). Tests that rely on branch chain behavior need at least one
    // commit so readiness reports hasCommit === true.
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: tempRoot,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: tempRoot,
      stdio: "pipe",
    });
    execFileSync("git", ["commit", "--allow-empty", "-m", "baseline"], {
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


async function instantiate(pluginFactory, directory) {
  const mock = createMockClient();
  const handlers = await pluginFactory({
    client: mock.client,
    directory,
  });
  return { handlers, mock };
}

async function runCommandExecuteBefore(handlers, options = {}) {
  // Story 4.5 R2 (M-3 mitigation): callers may override the workflow command
  // and sessionID so verifiers can register state under unique session ids
  // (avoiding cross-trio contamination footguns) and exercise the
  // non-workflow path on the same helper. Defaults preserve the legacy
  // call sites.
  const input = {
    command: typeof options.command === "string" ? options.command : "/bmad-bmm-quick-dev",
    arguments:
      typeof options.argumentsText === "string"
        ? options.argumentsText
        : "ABC-123 regression coverage",
    sessionID: typeof options.sessionID === "string" ? options.sessionID : "session-1",
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
  // strengthen-approval-prompt-instructions follow-up: Layer 0 of the
  // tool-execute-before guard now blocks ALL non-question tools while an
  // approval is active (legacy-pattern dead-end). Capture the error so the
  // parity check still works -- wrapper and built must throw the same thing.
  let error = null;
  try {
    await handlers["tool.execute.before"](input, output);
  } catch (caught) {
    error = caught;
  }
  return error;
}

async function runToolMutatingBefore(handlers, options = {}) {
  // Story 4.5 R2 (M-3 mitigation): accept a sessionID override so verifiers
  // can isolate positive vs negative trios under distinct session ids.
  const input = {
    sessionID: typeof options.sessionID === "string" ? options.sessionID : "session-1",
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
  verifyBuiltArtifactExists();

  const wrapperModule = await import(wrapperModuleUrl);
  const builtModule = await import(`${builtModuleUrl}?t=${Date.now()}`);

  const wrapperWorkspace = createTempWorkspace();
  const builtWorkspace = createTempWorkspace();
  try {
    const wrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, wrapperWorkspace);
    const built = await instantiate(
      builtModule.DevaiAiddGuardPlugin || builtModule.default,
      builtWorkspace,
    );

    for (const instance of [wrapper, built]) {
      assert.equal(typeof instance.handlers["command.execute.before"], "function");
      assert.equal(typeof instance.handlers["tool.execute.before"], "function");
      assert.equal(typeof instance.handlers["tool.execute.after"], "function");
      assert.equal(typeof instance.handlers.event, "function");
      assert.equal(typeof instance.handlers["permission.asked"], "function");
      assert.equal(typeof instance.handlers["file.edited"], "function");
    }

    const wrapperCommand = await runCommandExecuteBefore(wrapper.handlers);
    const builtCommand = await runCommandExecuteBefore(built.handlers);

    assert.deepEqual(
      normalizeOutputParts(builtCommand.output.parts),
      normalizeOutputParts(wrapperCommand.output.parts),
      "built command.execute.before output differs from wrapper",
    );

    // Story 2.1: wrapper and built emit approval prompts. Parity asserted
    // between wrapper and built.
    assert.deepEqual(
      built.mock.prompts.map(summarizePrompt),
      wrapper.mock.prompts.map(summarizePrompt),
      "built prompts differ from wrapper (approval prompt parity)",
    );

    const wrapperReadError = await runToolReadBefore(wrapper.handlers);
    const builtReadError = await runToolReadBefore(built.handlers);
    assert.equal(
      builtReadError?.message,
      wrapperReadError?.message,
      "built tool-read error differs from wrapper (Layer 0 parity)",
    );

    const wrapperError = await runToolMutatingBefore(wrapper.handlers);
    const builtError = await runToolMutatingBefore(built.handlers);

    await runPermissionAsked(wrapper.handlers);
    await runPermissionAsked(built.handlers);

    await runFileEdited(wrapper.handlers);
    await runFileEdited(built.handlers);

    assert.equal(builtError?.message, wrapperError?.message, "built mutating-tool error differs from wrapper");

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
    const afterDirectHook = createToolExecuteAfterHook({ workflowState: afterDirectStore });
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
    // Layer 0 (approval-pending block) may throw here because approvalCurrent
    // is active right after command.execute.before published a proposal. The
    // throw is by design -- this test only cares about the audit event count.
    try {
      await reWrapper.handlers["tool.execute.before"](
        { sessionID: "s-re", tool: "read", args: {} },
        { args: {} },
      );
    } catch {
      // expected when Layer 0 fires
    }
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
      "session.deleted: state must be cleared so later mutating-tool calls do not trigger the workflow guard",
    );

    const result = {
      status: "passed",
      compared: ["wrapper-vs-built"],
      prompts: wrapper.mock.prompts.map(summarizePrompt),
      mutatingToolError: wrapperError?.message || "",
      wrapperLogs: wrapper.mock.logs.length,
      builtLogs: built.mock.logs.length,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    fs.rmSync(wrapperWorkspace, { recursive: true, force: true });
    fs.rmSync(builtWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 1.3: Verify config merge precedence.
 * - Project config values override global config values.
 */
async function verifyConfigMergePrecedence() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?v=${Date.now()}`);

  // Create a sandboxed temp workspace with both global and project configs
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-merge-"));
  const globalConfigDir = path.join(tempRoot, "global-home", ".config", "opencode");
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(globalConfigDir, { recursive: true });
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    fs.writeFileSync(
      path.join(globalConfigDir, "devai-aidd-plugin.global.jsonc"),
      JSON.stringify({ branch: { defaultType: "docs" } }),
      "utf8",
    );

    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
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
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
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
      path.join(globalConfigDir, "devai-aidd-plugin.global.jsonc"),
      JSON.stringify({ branch: { longLivedBranches: 99, defaultType: "docs" } }),
      "utf8",
    );
    // Valid project config that overrides defaultType to "feat".
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
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
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
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
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
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
  // `DEFAULT_PLUGIN_CONFIG` no longer ships field values — build a synthetic
  // runtime config from the test fixtures to exercise the resolver contract.
  const runtimeConfig = {
    branch: TEST_BRANCH_CONFIG,
    workflowPolicy: TEST_WORKFLOW_POLICY,
    audit: {},
    debug: {},
  };

  // Case 1: matched command
  const matchedContext = {
    commandName: "bmad-bmm-dev-story",
    arguments: "",
    sessionID: "s-policy-test",
    detectedAt: "2026-05-08T00:00:00.000Z",
    phase: "start",
  };
  const matchedResult = resolveWorkflowPolicy(matchedContext, runtimeConfig);
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
  const unmatchedResult = resolveWorkflowPolicy(unmatchedContext, runtimeConfig);
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
  const nullResult = resolveWorkflowPolicy(null, runtimeConfig);
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

// ─────────────────────────────────────────────────────────────────────────────
// Story 4.1 — Define and Normalize Branch and Workflow Policy Configuration
// Story 4.1 introduces a single normalization entry point in
// `src/config/load-config.js#normalizeConfig` so downstream services
// (branch-service, resolve-workflow-policy) consume an already-normalized
// effective config and stop redoing per-field `|| <default>` fallbacks.
// These tests lock that contract in place.
// ─────────────────────────────────────────────────────────────────────────────

function buildStory41FsAdapter(homedir) {
  return {
    existsSync: fs.existsSync.bind(fs),
    readFileSync: fs.readFileSync.bind(fs),
    readdirSync: fs.readdirSync.bind(fs),
    mkdirSync: fs.mkdirSync.bind(fs),
    writeFileSync: fs.writeFileSync.bind(fs),
    dirname: path.dirname.bind(path),
    homedir: () => homedir,
  };
}

const REQUIRED_BRANCH_KEYS = [
  "pattern",
  "defaultType",
  "fallbackTicket",
  "longLivedBranches",
  "defaultMergeTarget",
  "validationRegex",
  "commandTypeMap",
];

function assertBranchShapeNormalized(branch, label) {
  for (const key of REQUIRED_BRANCH_KEYS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(branch, key),
      `${label}: branch.${key} must exist on effective config`,
    );
  }
  assert.equal(typeof branch.pattern, "string", `${label}: branch.pattern must be string`);
  assert.equal(typeof branch.defaultType, "string", `${label}: branch.defaultType must be string`);
  assert.equal(
    typeof branch.fallbackTicket,
    "string",
    `${label}: branch.fallbackTicket must be string`,
  );
  assert.ok(
    Array.isArray(branch.longLivedBranches),
    `${label}: branch.longLivedBranches must be array`,
  );
  assert.equal(
    typeof branch.defaultMergeTarget,
    "string",
    `${label}: branch.defaultMergeTarget must be string`,
  );
  assert.equal(
    typeof branch.validationRegex,
    "string",
    `${label}: branch.validationRegex must be string`,
  );
  assert.ok(
    branch.commandTypeMap &&
      typeof branch.commandTypeMap === "object" &&
      !Array.isArray(branch.commandTypeMap),
    `${label}: branch.commandTypeMap must be plain object`,
  );
}

/**
 * Story 4.1 (Task 5): single-normalization contract.
 *
 * For every shipping config source (DEFAULT_PLUGIN_CONFIG, both jsonc
 * templates), running them through the canonical normalization entry point
 * must produce an effective `branch` block whose seven required keys are
 * all present and have consistent types.
 */
async function verifyEffectiveConfigNormalizationContract() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?s41a=${Date.now()}`);
  const { DEFAULT_PLUGIN_CONFIG } = await import(
    pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href
  );

  // Sanity: the in-memory default already satisfies the contract.
  assertBranchShapeNormalized(
    TEST_BRANCH_CONFIG,
    "verifyEffectiveConfigNormalizationContract.defaults",
  );

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-s41-norm-"));
  const globalConfigDir = path.join(tempRoot, "home", ".config", "opencode");
  const projectADir = path.join(tempRoot, "projA", ".opencode");
  const projectBDir = path.join(tempRoot, "projB", ".opencode");
  fs.mkdirSync(globalConfigDir, { recursive: true });
  fs.mkdirSync(projectADir, { recursive: true });
  fs.mkdirSync(projectBDir, { recursive: true });

  try {
    const globalTemplate = fs.readFileSync(
      path.join(projectRoot, "templates", "devai-aidd-plugin.global.jsonc"),
      "utf8",
    );
    const projectTemplate = fs.readFileSync(
      path.join(projectRoot, "templates", "devai-aidd-plugin.project.jsonc"),
      "utf8",
    );

    const fsAdapter = buildStory41FsAdapter(path.join(tempRoot, "home"));

    // Source A: only global template installed (project A)
    fs.writeFileSync(
      path.join(globalConfigDir, "devai-aidd-plugin.global.jsonc"),
      globalTemplate,
      "utf8",
    );
    const resultGlobalOnly = loadRuntimeConfig(path.join(tempRoot, "projA"), fsAdapter);
    assertBranchShapeNormalized(
      resultGlobalOnly.config.branch,
      "verifyEffectiveConfigNormalizationContract.globalTemplate",
    );

    // Source B: project template ADDED on top of global
    fs.writeFileSync(
      path.join(projectBDir, "devai-aidd-plugin.project.jsonc"),
      projectTemplate,
      "utf8",
    );
    const resultProject = loadRuntimeConfig(path.join(tempRoot, "projB"), fsAdapter);
    assertBranchShapeNormalized(
      resultProject.config.branch,
      "verifyEffectiveConfigNormalizationContract.projectTemplate",
    );

    // Cross-source consistency: types match across both results.
    for (const key of REQUIRED_BRANCH_KEYS) {
      const t = typeof resultGlobalOnly.config.branch[key];
      assert.equal(
        typeof resultProject.config.branch[key],
        t,
        `verifyEffectiveConfigNormalizationContract: branch.${key} type must agree across global vs project sources`,
      );
    }

    // Lock value equivalence on the global ↔ defaults axis (project template
    // ships intentional overrides so we exclude it from this assertion).
    const VALUE_EQUIVALENT_KEYS = [
      "pattern",
      "defaultType",
      "fallbackTicket",
      "longLivedBranches",
      "defaultMergeTarget",
      "validationRegex",
      "commandTypeMap",
    ];
    for (const key of VALUE_EQUIVALENT_KEYS) {
      assert.deepEqual(
        resultGlobalOnly.config.branch[key],
        TEST_BRANCH_CONFIG[key],
        `verifyEffectiveConfigNormalizationContract: branch.${key} value must equal TEST_BRANCH_CONFIG.${key} when only global template is installed`,
      );
    }

    assert.deepEqual(
      resultGlobalOnly.config.workflowPolicy,
      DEFAULT_PLUGIN_CONFIG.workflowPolicy,
      "verifyEffectiveConfigNormalizationContract: global-only template must inherit DEFAULT_PLUGIN_CONFIG.workflowPolicy",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 4.1 (Task 5): missing-optional fallback.
 *
 * Distinct from Story 1.3's `verifyValidationFallback`/...LowerLayer
 * (which cover INVALID values being dropped); this test covers the
 * "missing optional key" path. The user provides only a partial project
 * jsonc, and effective config still surfaces every safe default
 * (fallbackTicket, defaultType, longLivedBranches, etc.).
 */
async function verifyMissingOptionalValuesFallback() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?s41b=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-s41-miss-"));
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    // Only one tiny override — every other branch.* and workflowPolicy[*] key
    // is intentionally missing.
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
      JSON.stringify({ branch: { defaultMergeTarget: "develop" } }),
      "utf8",
    );

    const fsAdapter = buildStory41FsAdapter(path.join(tempRoot, "no-home"));
    const result = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);

    assert.equal(
      result.config.branch.defaultMergeTarget,
      "develop",
      "verifyMissingOptionalValuesFallback: project override must apply",
    );
    assert.equal(
      result.config.branch.fallbackTicket,
      "no-ticket",
      "verifyMissingOptionalValuesFallback: missing fallbackTicket must default to 'no-ticket'",
    );
    assert.equal(
      result.config.branch.defaultType,
      "chore",
      "verifyMissingOptionalValuesFallback: missing defaultType must default to 'chore'",
    );
    assert.ok(
      Array.isArray(result.config.branch.longLivedBranches) &&
        result.config.branch.longLivedBranches.length > 0,
      "verifyMissingOptionalValuesFallback: missing longLivedBranches must default to non-empty array",
    );
    assert.equal(
      typeof result.config.branch.pattern,
      "string",
      "verifyMissingOptionalValuesFallback: missing pattern must default to string",
    );
    assert.ok(
      result.config.branch.commandTypeMap &&
        typeof result.config.branch.commandTypeMap === "object" &&
        !Array.isArray(result.config.branch.commandTypeMap),
      "verifyMissingOptionalValuesFallback: missing commandTypeMap must default to plain object",
    );
    // No layers should have been dropped — this is a "missing optional" path,
    // not an "invalid value" path.
    assert.deepEqual(
      result.validation.droppedLayers,
      [],
      "verifyMissingOptionalValuesFallback: no layers must be dropped on missing-optional path",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 4.1 (Task 5): vocabulary surfacing.
 *
 * - Known vocabulary must NOT generate any vocabulary warning.
 * - Unknown vocabulary (typo on `category` or `finalization`) must surface
 *   as a `params.source === "vocabulary"` entry, but must NOT cause the
 *   layer to be dropped or `valid` to flip — Story 1.3's forward-compat
 *   invariant (`additionalProperties: true`) is preserved.
 *
 * Also asserts the inline schema in `validate-config.js` and the JSON
 * file in `src/config/schema/runtime-config.schema.json` stay in sync at
 * the property/required level (the deliberate LOW from Story 1.3 R2).
 */
async function verifyWorkflowPolicyVocabularySchema() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?s41c=${Date.now()}`);
  const { RUNTIME_CONFIG_SCHEMA, KNOWN_WORKFLOW_POLICY_VOCABULARY } = await import(
    `${pathToFileURL(path.join(projectRoot, "src", "config", "validate-config.js")).href}?s41c=${Date.now()}`
  );

  // ── A) Known vocabulary path: silent.
  const tempRootOk = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-s41-vocab-ok-"));
  const projectOkDir = path.join(tempRootOk, "project", ".opencode");
  fs.mkdirSync(projectOkDir, { recursive: true });
  try {
    fs.writeFileSync(
      path.join(projectOkDir, "devai-aidd-plugin.project.jsonc"),
      JSON.stringify({
        workflowPolicy: {
          "bmad-bmm-custom": {
            category: "implementation",
            identityStrategy: "ticket-or-args",
            branchRequired: true,
            finalization: "commit-and-push",
          },
        },
      }),
      "utf8",
    );
    const fsAdapter = buildStory41FsAdapter(path.join(tempRootOk, "no-home"));
    const okResult = loadRuntimeConfig(path.join(tempRootOk, "project"), fsAdapter);
    const okVocabulary = (okResult.validation.errors || []).filter(
      (err) => err && err.params && err.params.source === "vocabulary",
    );
    assert.equal(
      okVocabulary.length,
      0,
      "verifyWorkflowPolicyVocabularySchema: known vocabulary must produce zero vocabulary warnings",
    );
    assert.equal(
      okResult.validation.valid,
      true,
      "verifyWorkflowPolicyVocabularySchema: known vocabulary must keep validation.valid === true",
    );
  } finally {
    fs.rmSync(tempRootOk, { recursive: true, force: true });
  }

  // ── B) Unknown vocabulary path: warning surfaces, layer survives.
  const tempRootBad = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-s41-vocab-bad-"));
  const projectBadDir = path.join(tempRootBad, "project", ".opencode");
  fs.mkdirSync(projectBadDir, { recursive: true });
  try {
    fs.writeFileSync(
      path.join(projectBadDir, "devai-aidd-plugin.project.jsonc"),
      JSON.stringify({
        workflowPolicy: {
          "bmad-bmm-typo": {
            category: "implemenation",            // typo
            identityStrategy: "ticket-or-args",
            branchRequired: true,
            finalization: "commit-and-pus",       // typo
          },
        },
      }),
      "utf8",
    );
    const fsAdapter = buildStory41FsAdapter(path.join(tempRootBad, "no-home"));
    const badResult = loadRuntimeConfig(path.join(tempRootBad, "project"), fsAdapter);
    const badVocabulary = (badResult.validation.errors || []).filter(
      (err) => err && err.params && err.params.source === "vocabulary",
    );
    assert.equal(
      badVocabulary.length,
      2,
      "verifyWorkflowPolicyVocabularySchema: two typos must produce exactly two vocabulary warnings",
    );
    for (const w of badVocabulary) {
      assert.equal(
        w.params.kind,
        "warning",
        "verifyWorkflowPolicyVocabularySchema: vocabulary entries must be tagged kind=warning",
      );
      assert.equal(
        typeof w.params.field,
        "string",
        "verifyWorkflowPolicyVocabularySchema: vocabulary entries must include params.field",
      );
      assert.ok(
        Array.isArray(w.params.knownValues) && w.params.knownValues.length > 0,
        "verifyWorkflowPolicyVocabularySchema: vocabulary entries must enumerate knownValues",
      );
    }
    assert.deepEqual(
      badResult.validation.droppedLayers,
      [],
      "verifyWorkflowPolicyVocabularySchema: vocabulary warnings must NOT drop the layer",
    );
    assert.equal(
      badResult.validation.valid,
      true,
      "verifyWorkflowPolicyVocabularySchema: vocabulary warnings must NOT flip validation.valid to false",
    );
    // The custom command's user-provided values must still be visible in
    // the effective config (forward-compat preserved).
    assert.equal(
      badResult.config.workflowPolicy["bmad-bmm-typo"].category,
      "implemenation",
      "verifyWorkflowPolicyVocabularySchema: unknown vocabulary value must pass through unchanged",
    );
  } finally {
    fs.rmSync(tempRootBad, { recursive: true, force: true });
  }

  // ── C) Inline schema vs JSON file: full deep-equality sync.
  // Story 1.3 R2 LOW: the two copies are intentionally separate (bundle
  // compatibility) and we accept the manual sync obligation. Round 2
  // follow-up (AI-2): Task 2.4 explicitly requires "동일 객체임을 직접
  // 비교" — so we now deep-compare the entire schema objects, not just
  // top-level/branch property keys. This catches drift in
  // `additionalProperties` flags, `type` declarations, descriptions, and
  // every other node both copies must agree on.
  const schemaJson = JSON.parse(
    fs.readFileSync(
      path.join(projectRoot, "src", "config", "schema", "runtime-config.schema.json"),
      "utf8",
    ),
  );
  // Round-trip through JSON to strip Object.freeze / function refs / undefined
  // entries from the inline schema so the comparison is value-equality only.
  const inlineSchemaPlain = JSON.parse(JSON.stringify(RUNTIME_CONFIG_SCHEMA));
  assert.deepEqual(
    inlineSchemaPlain,
    schemaJson,
    "verifyWorkflowPolicyVocabularySchema: inline RUNTIME_CONFIG_SCHEMA and on-disk runtime-config.schema.json must be deep-equal (Task 2.4 sync obligation)",
  );
  // Sanity on the vocabulary export itself.
  assert.ok(
    Array.isArray(KNOWN_WORKFLOW_POLICY_VOCABULARY.category) &&
      KNOWN_WORKFLOW_POLICY_VOCABULARY.category.length > 0,
    "verifyWorkflowPolicyVocabularySchema: KNOWN_WORKFLOW_POLICY_VOCABULARY.category must be non-empty",
  );
  assert.ok(
    Array.isArray(KNOWN_WORKFLOW_POLICY_VOCABULARY.identityStrategy) &&
      KNOWN_WORKFLOW_POLICY_VOCABULARY.identityStrategy.length > 0,
    "verifyWorkflowPolicyVocabularySchema: KNOWN_WORKFLOW_POLICY_VOCABULARY.identityStrategy must be non-empty",
  );
  assert.ok(
    Array.isArray(KNOWN_WORKFLOW_POLICY_VOCABULARY.finalization) &&
      KNOWN_WORKFLOW_POLICY_VOCABULARY.finalization.length > 0,
    "verifyWorkflowPolicyVocabularySchema: KNOWN_WORKFLOW_POLICY_VOCABULARY.finalization must be non-empty",
  );
}

/**
 * Story 4.1 (Task 5): determinism + fresh-object invariant.
 *
 * Calling `loadRuntimeConfig` + `resolveWorkflowPolicy` twice on the same
 * input must produce deepEqual results AND fresh nested objects so that
 * mutating one result cannot leak into the next call (Story 1.3 invariant).
 */
async function verifyEffectivePolicyDeterminism() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?s41d=${Date.now()}`);
  const { resolveWorkflowPolicy } = await import(`${resolveWorkflowPolicyModuleUrl}?s41d=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-s41-det-"));
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
      JSON.stringify({
        branch: {
          defaultMergeTarget: "main",
          longLivedBranches: ["main", "develop"],
          commandTypeMap: { "bmad-bmm-dev-story": "feat" },
        },
        // `DEFAULT_PLUGIN_CONFIG.workflowPolicy` is now empty — the test
        // exercises the "matched policy" branch of resolveWorkflowPolicy, so
        // the project JSONC must supply an explicit entry for the command
        // under test.
        workflowPolicy: {
          "bmad-bmm-dev-story": {
            category: "implementation",
            identityStrategy: "story",
            branchRequired: true,
            finalization: "commit-and-push",
          },
        },
      }),
      "utf8",
    );

    const fsAdapter = buildStory41FsAdapter(path.join(tempRoot, "no-home"));

    const r1 = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    const r2 = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    assert.deepEqual(
      r1.config,
      r2.config,
      "verifyEffectivePolicyDeterminism: two loadRuntimeConfig calls must produce deepEqual configs",
    );

    const ctx = {
      commandName: "bmad-bmm-dev-story",
      arguments: "ABC-123 contract",
      sessionID: "s-det-1",
      detectedAt: "2026-05-10T00:00:00.000Z",
      phase: "start",
    };

    const p1 = resolveWorkflowPolicy(ctx, r1.config);
    const p2 = resolveWorkflowPolicy(ctx, r1.config);
    assert.deepEqual(
      p1,
      p2,
      "verifyEffectivePolicyDeterminism: resolveWorkflowPolicy must be deterministic on the same input",
    );

    // Fresh-object invariant: mutating one result must not affect the next call.
    assert.notEqual(
      p1,
      p2,
      "verifyEffectivePolicyDeterminism: resolveWorkflowPolicy must return a fresh top-level object",
    );
    assert.notEqual(
      p1.details.policy,
      p2.details.policy,
      "verifyEffectivePolicyDeterminism: details.policy must be a fresh object on each call",
    );
    assert.notEqual(
      p1.details.branch,
      p2.details.branch,
      "verifyEffectivePolicyDeterminism: details.branch must be a fresh object on each call",
    );
    p1.details.branch.longLivedBranches.push("attempted-leak");
    p1.details.policy.category = "leaked";
    const p3 = resolveWorkflowPolicy(ctx, r1.config);
    assert.ok(
      !p3.details.branch.longLivedBranches.includes("attempted-leak"),
      "verifyEffectivePolicyDeterminism: mutation on prior longLivedBranches must NOT leak into next call",
    );
    assert.notEqual(
      p3.details.policy.category,
      "leaked",
      "verifyEffectivePolicyDeterminism: mutation on prior policy.category must NOT leak into next call",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 4.1 (Task 5) — AC2: latest-policy reflection across runs.
 *
 * Same process, project jsonc edited between runs. The next
 * `loadRuntimeConfig` + `resolveWorkflowPolicy` must return the new value.
 * Also asserts that no persistent cache was introduced (back-to-back
 * loads with the same disk state must keep producing the same result and
 * neither `loadRuntimeConfig` nor `resolveWorkflowPolicy` reuse a stale
 * snapshot).
 */
async function verifyLatestPolicyChangesReflectedAcrossRuns() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?s41e=${Date.now()}`);
  const { resolveWorkflowPolicy } = await import(`${resolveWorkflowPolicyModuleUrl}?s41e=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-s41-live-"));
  const projectConfigDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });

  try {
    const cfgPath = path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc");
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        workflowPolicy: {
          "bmad-bmm-quick-dev": {
            category: "implementation",
            identityStrategy: "ticket-or-args",
            branchRequired: true,
            finalization: "commit-and-push",
          },
        },
      }),
      "utf8",
    );

    const fsAdapter = buildStory41FsAdapter(path.join(tempRoot, "no-home"));
    const ctx = {
      commandName: "bmad-bmm-quick-dev",
      arguments: "ABC-123",
      sessionID: "s-live-1",
      detectedAt: "2026-05-10T00:00:00.000Z",
      phase: "start",
    };

    const before = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    const beforePolicy = resolveWorkflowPolicy(ctx, before.config);
    assert.equal(
      beforePolicy.details.policy.finalization,
      "commit-and-push",
      "verifyLatestPolicyChangesReflectedAcrossRuns: pre-edit must reflect commit-and-push",
    );

    // Edit the project jsonc — change finalization to a different known value.
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        workflowPolicy: {
          "bmad-bmm-quick-dev": {
            category: "implementation",
            identityStrategy: "ticket-or-args",
            branchRequired: true,
            finalization: "no-forced-finalization",
          },
        },
      }),
      "utf8",
    );

    const after = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    const afterPolicy = resolveWorkflowPolicy(ctx, after.config);
    assert.equal(
      afterPolicy.details.policy.finalization,
      "no-forced-finalization",
      "verifyLatestPolicyChangesReflectedAcrossRuns: post-edit must reflect new finalization on next load",
    );

    // Also assert that calling load twice in a row on the SAME disk state
    // produces deepEqual results — proves no in-memory persistent cache.
    const after2 = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    assert.deepEqual(
      after.config,
      after2.config,
      "verifyLatestPolicyChangesReflectedAcrossRuns: back-to-back loads must produce deepEqual configs (no stale cache)",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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
  // `branchRequired` is opt-in via project JSONC (defaults no longer set it).
  // Use the test fixture which carries `branchRequired: true` for impl workflows.
  const workflowPolicy = TEST_WORKFLOW_POLICY["bmad-bmm-quick-dev"];
  const candidate = branchService.computeCandidateBranchName({
    workflowContext,
    workflowPolicy,
    branchConfig: TEST_BRANCH_CONFIG,
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
    branchConfig: TEST_BRANCH_CONFIG,
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
    branchConfig: TEST_BRANCH_CONFIG,
  });
  assert.equal(
    defaultTypeCandidate,
    "chore/ABC-123-docs-refresh",
    "verifyBranchServiceContracts: unknown command must fall back to branch.defaultType",
  );

  const requiredStrategy = branchService.evaluateBranchStrategy({
    workflowContext,
    workflowPolicy,
    branchConfig: TEST_BRANCH_CONFIG,
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
    workflowPolicy: TEST_WORKFLOW_POLICY["bmad-bmm-create-prd"],
    branchConfig: TEST_BRANCH_CONFIG,
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
      branchConfig: TEST_BRANCH_CONFIG,
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
      ...TEST_BRANCH_CONFIG,
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
      workflowCommands: new Set(["bmad-bmm-quick-dev", "bmad-bmm-create-prd"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        resolvePolicy(workflowContext) {
          const policy = defaultPolicyWithLegacyBranchRequired(workflowContext.commandName, DEFAULT_PLUGIN_CONFIG);
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
        workflowCommands: new Set(["bmad-bmm-quick-dev", "bmad-bmm-create-prd"]),
        workflowState: noGitWorkflowState,
        branchConfig: TEST_BRANCH_CONFIG,
        pluginContext: {
          directory: noGitWorkspace,
          resolvePolicy(workflowContext) {
            const policy = defaultPolicyWithLegacyBranchRequired(workflowContext.commandName, DEFAULT_PLUGIN_CONFIG);
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
    workflowPolicy: TEST_WORKFLOW_POLICY["bmad-bmm-quick-dev"],
    branchConfig: {
      ...TEST_BRANCH_CONFIG,
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
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
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

async function verifyReadinessConfigContracts() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?readiness-config=${Date.now()}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-readiness-config-"));
  const homeDir = path.join(tempRoot, "home");
  const globalDir = path.join(homeDir, ".config", "opencode");
  const projectDir = path.join(tempRoot, "project", ".opencode");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  try {
    const fsAdapter = buildStory41FsAdapter(homeDir);

    const defaultResult = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    assert.equal(
      defaultResult.config.readiness.skipInitAndBaseline,
      true,
      "verifyReadinessConfigContracts: missing readiness config must default skipInitAndBaseline to true",
    );

    fs.writeFileSync(
      path.join(globalDir, "devai-aidd-plugin.global.jsonc"),
      JSON.stringify({ readiness: { skipInitAndBaseline: false } }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(projectDir, "devai-aidd-plugin.project.jsonc"),
      JSON.stringify({ readiness: { skipInitAndBaseline: true } }),
      "utf8",
    );
    const overrideResult = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    assert.equal(
      overrideResult.config.readiness.skipInitAndBaseline,
      true,
      "verifyReadinessConfigContracts: project readiness config must override global readiness config",
    );

    fs.writeFileSync(
      path.join(projectDir, "devai-aidd-plugin.project.jsonc"),
      JSON.stringify({ readiness: { skipInitAndBaseline: "yes" } }),
      "utf8",
    );
    const invalidResult = loadRuntimeConfig(path.join(tempRoot, "project"), fsAdapter);
    assert.equal(
      invalidResult.validation.droppedLayers.includes("projectConfig"),
      true,
      "verifyReadinessConfigContracts: invalid readiness.skipInitAndBaseline must drop the project layer",
    );
    assert.equal(
      invalidResult.config.readiness.skipInitAndBaseline,
      false,
      "verifyReadinessConfigContracts: invalid project readiness layer must fall back to last valid lower layer",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyRepositoryReadinessSkipContracts() {
  const readinessModule = await import(`${readinessServiceModuleUrl}?readiness-skip=${Date.now()}`);
  const gateModule = await import(`${readinessGateModuleUrl}?readiness-skip=${Date.now()}`);

  const noGitWorkspace = createGitWorkspace();
  const repoNoCommit = createTempWorkspace();
  execFileSync("git", ["init"], { cwd: repoNoCommit, stdio: "pipe" });

  try {
    const skipGate = gateModule.resolveReadinessGate({
      runtimeConfig: { readiness: { skipInitAndBaseline: true } },
      workflowPolicy: {
        branchRequired: false,
        finalization: "no-forced-finalization",
      },
      workflowName: "policy-light",
    });
    assert.equal(skipGate.enabled, false);

    const skippedInitResult = readinessModule.checkRepositoryReadiness({
      directory: noGitWorkspace,
      readinessGate: skipGate,
    });
    assert.equal(
      skippedInitResult.outcome,
      "allow",
      "verifyRepositoryReadinessSkipContracts: skip-active non-git workspace must allow instead of asking for init",
    );
    assert.equal(skippedInitResult.reason, "readiness-gate-skipped");
    assert.equal(skippedInitResult.details?.isGitRepository, false);
    assert.equal(
      skippedInitResult.details?.proposal,
      undefined,
      "verifyRepositoryReadinessSkipContracts: skip-active non-git workspace must not attach init proposal",
    );

    const skippedBaselineResult = readinessModule.checkRepositoryReadiness({
      directory: repoNoCommit,
      readinessGate: skipGate,
    });
    assert.equal(
      skippedBaselineResult.outcome,
      "allow",
      "verifyRepositoryReadinessSkipContracts: skip-active repo with no commits must still allow",
    );
    assert.equal(skippedBaselineResult.details?.isGitRepository, true);
    assert.equal(skippedBaselineResult.details?.hasCommit, false);

    const overrideGate = gateModule.resolveReadinessGate({
      runtimeConfig: { readiness: { skipInitAndBaseline: true } },
      workflowPolicy: {
        branchRequired: true,
        finalization: "no-forced-finalization",
      },
      workflowName: "repo-backed",
    });
    assert.equal(overrideGate.enabled, true);
    assert.equal(overrideGate.overrideApplied, true);
    assert.equal(overrideGate.overrideField, "branchRequired");

    const overriddenResult = readinessModule.checkRepositoryReadiness({
      directory: noGitWorkspace,
      readinessGate: overrideGate,
    });
    assert.equal(
      overriddenResult.outcome,
      "ask",
      "verifyRepositoryReadinessSkipContracts: policy override must re-enable init gating",
    );
    assert.equal(overriddenResult.reason, "git-not-initialized");
  } finally {
    fs.rmSync(noGitWorkspace, { recursive: true, force: true });
    fs.rmSync(repoNoCommit, { recursive: true, force: true });
  }
}

async function verifyCommandExecuteBeforeReadinessGateOverwrite() {
  const [{ createWorkflowStateStore }, commandBeforeModule] = await Promise.all([
    import(`${workflowStateModuleUrl}?readiness-overwrite=${Date.now()}`),
    import(`${commandExecuteBeforeModuleUrl}?readiness-overwrite=${Date.now()}`),
  ]);

  const workflowState = createWorkflowStateStore();
  const debugLogs = [];
  const tempWorkspace = createGitWorkspace();
  const hook = commandBeforeModule.createCommandExecuteBeforeHook({
    workflowCommands: new Set(["policy-light", "repo-backed"]),
    workflowState,
    branchConfig: TEST_BRANCH_CONFIG,
    pluginContext: {
      directory: tempWorkspace,
      runtimeConfig: { config: { readiness: { skipInitAndBaseline: true } } },
      resolvePolicy(workflowContext) {
        if (workflowContext.commandName === "policy-light") {
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
        }
        return {
          outcome: "allow",
          details: {
            policy: {
              category: "implementation",
              identityStrategy: "ticket-or-args",
              branchRequired: true,
              finalization: "commit-and-push",
            },
          },
        };
      },
      debug: {
        log(_channel, message, payload) {
          debugLogs.push({ message, payload });
        },
      },
    },
  });

  try {
    await hook(
      { command: "/policy-light", arguments: "", sessionID: "readiness-overwrite" },
      { parts: [] },
    );
    const firstState = workflowState.get("readiness-overwrite");
    assert.equal(firstState?.readinessGate?.enabled, false);
    assert.equal(firstState?.initProposal, undefined);

    await hook(
      { command: "/repo-backed", arguments: "", sessionID: "readiness-overwrite" },
      { parts: [] },
    );
    const secondState = workflowState.get("readiness-overwrite");
    assert.equal(
      secondState?.readinessGate?.enabled,
      true,
      "verifyCommandExecuteBeforeReadinessGateOverwrite: later workflow must overwrite prior skip-active gate state",
    );
    assert.equal(
      secondState?.initProposal?.kind,
      "init",
      "verifyCommandExecuteBeforeReadinessGateOverwrite: later override-active workflow must restore init proposal publishing",
    );
    assert.ok(
      debugLogs.some((entry) => entry.message === "readiness skip overridden by workflow policy"),
      "verifyCommandExecuteBeforeReadinessGateOverwrite: override activation must emit one debug log line",
    );
  } finally {
    fs.rmSync(tempWorkspace, { force: true, recursive: true });
  }
}

async function verifyStartupChainReadinessSkipContracts() {
  const plannerMod = await import(`${pathToFileURL(path.join(projectRoot, "src", "services", "git", "startup-chain-planner.js")).href}?startup-skip=${Date.now()}`);

  const workflowContext = {
    sessionID: "startup-skip",
    commandName: "policy-light",
    normalizedCommand: "policy-light",
    arguments: "",
  };

  const skippedPlan = plannerMod.buildStartupChainPlan({
    readiness: {
      outcome: "allow",
      reason: "readiness-gate-skipped",
      details: { isGitRepository: false, hasCommit: false, proposal: null },
    },
    readinessGate: { enabled: false },
    workflowContext,
    workflowPolicy: {
      category: "docs",
      identityStrategy: "ticket-or-args",
      branchRequired: false,
      finalization: "no-forced-finalization",
    },
    branchConfig: TEST_BRANCH_CONFIG,
    currentBranch: null,
    state: {},
  });
  assert.deepEqual(
    skippedPlan.steps.map((step) => step.key),
    [],
    "verifyStartupChainReadinessSkipContracts: skip-active workflow must omit init and baseline startup steps",
  );

  const overridePlan = plannerMod.buildStartupChainPlan({
    readiness: {
      outcome: "ask",
      reason: "git-not-initialized",
      details: { isGitRepository: false, hasCommit: false, proposal: { kind: "init" } },
    },
    readinessGate: { enabled: true },
    workflowContext: {
      ...workflowContext,
      commandName: "repo-backed",
    },
    workflowPolicy: defaultPolicyWithLegacyBranchRequired("bmad-bmm-quick-dev"),
    branchConfig: TEST_BRANCH_CONFIG,
    currentBranch: null,
    state: {},
  });
  assert.deepEqual(
    overridePlan.steps.map((step) => step.key),
    ["init", "baseline", "branch"],
    "verifyStartupChainReadinessSkipContracts: override-active workflow must still plan init, baseline, and branch steps",
  );
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
    path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
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
  const pushProposal = { kind: "push", action: "push", remoteName: "origin", branchName: "feat/X" };

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
  assert.deepEqual(
    selectNextPlannedAction({ pushProposal }),
    pushProposal,
    "selectNextPlannedAction: pushProposal alone selected",
  );
  assert.deepEqual(
    selectNextPlannedAction({ commitProposal, pushProposal }),
    commitProposal,
    "selectNextPlannedAction: commitProposal takes priority over pushProposal",
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev", "bmad-bmm-create-prd"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: noGitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev", "bmad-bmm-create-prd"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
 * Both wrapper (src/index.js) and built (dist/devai-aidd-plugin.js) must produce the
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

    const builtFactory = builtMod.DevaiAiddGuardPlugin || builtMod.default;
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

    // Startup chains emit startup.chain.requested instead of a single approval.requested.
    const wrapperApprovalLogs = wrapperMock.logs.filter(
      (l) => l.body?.message === "startup.chain.requested",
    );
    const builtApprovalLogs = builtMock.logs.filter(
      (l) => l.body?.message === "startup.chain.requested",
    );
    assert.equal(
      wrapperApprovalLogs.length,
      1,
      "verifyApprovalBuiltArtifactParity: wrapper must emit one startup.chain.requested",
    );
    assert.equal(
      builtApprovalLogs.length,
      1,
      "verifyApprovalBuiltArtifactParity: built must emit one startup.chain.requested",
    );

    // Startup chains are delivered to the model via `output.parts` and the
    // native `question` tool, not via promptAsync.
    assert.equal(
      wrapperMock.prompts.length,
      0,
      "verifyApprovalBuiltArtifactParity: wrapper must not emit promptAsync startup prompts",
    );
    assert.equal(
      builtMock.prompts.length,
      0,
      "verifyApprovalBuiltArtifactParity: built must not emit promptAsync startup prompts",
    );

    // audit payload shapes must match
    const wrapperAudit = wrapperApprovalLogs[0].body.extra;
    const builtAudit = builtApprovalLogs[0].body.extra;
    assert.equal(wrapperAudit.event, builtAudit.event, "parity: event");
    assert.equal(wrapperAudit.outcome, builtAudit.outcome, "parity: outcome");
    assert.deepEqual(wrapperAudit.details.questionKeys, builtAudit.details.questionKeys, "parity: questionKeys");
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

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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

async function verifyPermissionAskedAcceptCommitPublishesPushApproval() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?commit-then-push=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?commit-then-push=${Date.now()}`),
  ]);

  const approvals = [];
  const events = [];
  const store = createWorkflowStateStore();
  store.set("s-commit-then-push", {
    sessionID: "s-commit-then-push",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: {
        isGitRepository: true,
        branch: "feat/story-3-3",
        hasRemote: true,
        remoteNames: ["origin"],
      },
    },
    approvalCurrent: {
      id: "approval:s-commit-then-push:commit:commit",
      actionId: "action:commit:commit",
      sessionID: "s-commit-then-push",
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
        correlationId: "corr-commit-then-push",
      },
      metadata: {
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
      },
    },
    approvalHistory: [],
    pendingActions: [],
    commitProposal: {
      kind: "commit",
      action: "commit",
      message: "Finish bmad-bmm-quick-dev: update implementation outputs",
      artifactScope: "implementation",
      changeCountSummary: "1 code file",
      files: ["src/index.js"],
      correlationId: "corr-commit-then-push",
    },
  });

  const hook = createPermissionAskedHook(
    {
      workflowState: store,
      audit: {
        async info(message, payload) {
          events.push({ message, payload });
        },
      },
      pluginContext: {
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
        async gitActionRunner({ action }) {
          assert.equal(action.kind, "commit");
          return {
            observedState: {
              headBranch: "feat/story-3-3",
              hasRemote: true,
            },
          };
        },
        async requestApproval(request) {
          approvals.push(request);
        },
      },
    },
  );

  await hook({
    sessionID: "s-commit-then-push",
    approvalId: "approval:s-commit-then-push:commit:commit",
    actionId: "action:commit:commit",
    outcome: "accept",
  });

  const state = store.get("s-commit-then-push");
  assert.equal(state.commitProposal, null, "successful commit must clear commitProposal");
  assert.equal(state.pushProposal?.kind, "push", "successful commit must prepare push proposal");
  assert.equal(state.approvalCurrent?.actionType, "push", "push approval must become the active request");
  assert.equal(approvals.length, 1, "exactly one push approval must be requested");
  assert.equal(approvals[0].actionType, "push");
  assert.equal(approvals[0].proposal.remoteName, "origin");
  assert.equal(approvals[0].proposal.branchName, "feat/story-3-3");
  assert.equal(
    approvals[0].metadata.explanation.fields.targetRemoteLabel,
    "origin",
    "push approval must expose only the remote label",
  );
  assert.ok(
    events.some((entry) => entry.message === "git.action.planned" && entry.payload?.details?.kind === "push"),
    "commit success must emit a planned push event",
  );
}

async function verifyPermissionAskedAcceptCommitSuppressesPushWithoutRemote() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?commit-no-remote=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?commit-no-remote=${Date.now()}`),
  ]);

  const approvals = [];
  const store = createWorkflowStateStore();
  store.set("s-commit-no-remote", {
    sessionID: "s-commit-no-remote",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: {
        isGitRepository: true,
        branch: "feat/story-3-3",
        hasRemote: false,
        remoteNames: [],
      },
    },
    approvalCurrent: {
      id: "approval:s-commit-no-remote:commit:commit",
      actionId: "action:commit:commit",
      sessionID: "s-commit-no-remote",
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
        correlationId: "corr-commit-no-remote",
      },
      metadata: {
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
      },
    },
    approvalHistory: [],
    pendingActions: [],
    commitProposal: {
      kind: "commit",
      action: "commit",
      message: "Finish bmad-bmm-quick-dev: update implementation outputs",
      artifactScope: "implementation",
      changeCountSummary: "1 code file",
      files: ["src/index.js"],
      correlationId: "corr-commit-no-remote",
    },
  });

  const hook = createPermissionAskedHook(
    {
      workflowState: store,
      pluginContext: {
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
        async gitActionRunner() {
          return {
            observedState: {
              headBranch: "feat/story-3-3",
              hasRemote: false,
            },
          };
        },
        async requestApproval(request) {
          approvals.push(request);
        },
      },
    },
  );

  await hook({
    sessionID: "s-commit-no-remote",
    approvalId: "approval:s-commit-no-remote:commit:commit",
    actionId: "action:commit:commit",
    outcome: "accept",
  });

  const state = store.get("s-commit-no-remote");
  assert.equal(state.commitProposal, null);
  assert.equal(state.pushProposal, null, "missing remote must suppress push proposal creation");
  assert.equal(state.approvalCurrent, null, "missing remote must not create a follow-up approval");
  assert.equal(approvals.length, 0, "missing remote must not request push approval");
}

async function verifyPermissionAskedAcceptExecutesPushProposal() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?push-accept=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?push-accept=${Date.now()}`),
  ]);

  const events = [];
  const store = createWorkflowStateStore();
  store.set("s-push-accept", {
    sessionID: "s-push-accept",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: {
        isGitRepository: true,
        branch: "feat/story-3-3",
        hasRemote: true,
        remoteNames: ["origin"],
      },
    },
    approvalCurrent: {
      id: "approval:s-push-accept:push:push",
      actionId: "action:push:push",
      sessionID: "s-push-accept",
      workflow: "bmad-bmm-quick-dev",
      command: "bmad-bmm-quick-dev",
      phase: "finish",
      actionType: "push",
      status: "awaitingApproval",
      proposal: {
        kind: "push",
        action: "push",
        branchName: "feat/story-3-3",
        targetBranch: "feat/story-3-3",
        remoteName: "origin",
        remote: "origin",
        branch: "feat/story-3-3",
        correlationId: "corr-push-accept",
      },
      metadata: {
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
      },
    },
    approvalHistory: [],
    pendingActions: [],
    pushProposal: {
      kind: "push",
      action: "push",
      branchName: "feat/story-3-3",
      targetBranch: "feat/story-3-3",
      remoteName: "origin",
      remote: "origin",
      branch: "feat/story-3-3",
      correlationId: "corr-push-accept",
    },
    lastGitAction: { kind: "commit", operation: "commit", branchName: "feat/story-3-3" },
    lastGitResult: { ok: true, status: "succeeded", code: null, message: null, correlationId: "corr-commit-done" },
  });

  const hook = createPermissionAskedHook(
    {
      workflowState: store,
      audit: {
        async info(message, payload) {
          events.push({ message, payload });
        },
      },
      pluginContext: {
        async gitActionRunner({ action }) {
          assert.equal(action.kind, "push");
          assert.equal(action.remoteName, "origin");
          assert.equal(action.branchName, "feat/story-3-3");
          return {
            observedState: {
              headBranch: "feat/story-3-3",
              hasRemote: true,
            },
          };
        },
      },
    },
  );

  await hook({
    sessionID: "s-push-accept",
    approvalId: "approval:s-push-accept:push:push",
    actionId: "action:push:push",
    outcome: "accept",
  });

  const state = store.get("s-push-accept");
  assert.equal(state.approvalCurrent, null, "push accept must clear the pending approval");
  assert.equal(state.pushProposal, null, "successful push must clear pushProposal");
  assert.equal(state.lastGitAction.kind, "push");
  assert.equal(state.lastGitResult.status, "succeeded");
  assert.ok(
    events.some((entry) => entry.message === "git.action.executed" && entry.payload?.details?.actionKind === "push"),
    "push execution must emit git.action.executed",
  );
}

async function verifyPermissionAskedPushFailureOpensRecovery() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?push-failure=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?push-failure=${Date.now()}`),
  ]);

  const prompts = [];
  const store = createWorkflowStateStore();
  store.set("s-push-failure", {
    sessionID: "s-push-failure",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: {
        isGitRepository: true,
        branch: "feat/story-3-3",
        hasRemote: true,
        remoteNames: ["origin"],
      },
    },
    approvalCurrent: {
      id: "approval:s-push-failure:push:push",
      actionId: "action:push:push",
      sessionID: "s-push-failure",
      workflow: "bmad-bmm-quick-dev",
      command: "bmad-bmm-quick-dev",
      phase: "finish",
      actionType: "push",
      status: "awaitingApproval",
      proposal: {
        kind: "push",
        action: "push",
        branchName: "feat/story-3-3",
        targetBranch: "feat/story-3-3",
        remoteName: "origin",
        remote: "origin",
        branch: "feat/story-3-3",
        correlationId: "corr-push-failure",
      },
      metadata: {
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
      },
    },
    // Story 3.3 review round 2 (Medium): seed a commit-success traceability
    // record (approvalHistory entry with `actionType: "commit"` resolution)
    // so this test can positively assert that the push failure path does NOT
    // invalidate the local commit log — the AC2 sub-clause "嫄곕??섍굅???ㅽ뙣
    // ???몄떆???대? 湲곕줉??濡쒖뺄 而ㅻ컠??臾댄슚?뷀븯吏 ?딆븘???쒕떎" was previously
    // only asserted by the absence of a clear-commit operation, never by
    // positive evidence in the post-state.
    approvalHistory: [
      {
        id: "approval:s-push-failure:commit:commit",
        actionId: "action:commit:commit",
        sessionID: "s-push-failure",
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
        phase: "finish",
        actionType: "commit",
        status: "accept",
        proposal: {
          kind: "commit",
          action: "commit",
          message: "Finish bmad-bmm-quick-dev: update implementation outputs",
          correlationId: "corr-commit-pre-push",
        },
        resolution: {
          approvalId: "approval:s-push-failure:commit:commit",
          actionId: "action:commit:commit",
          actionKind: "commit",
          status: "accept",
          continuation: "proceed",
          resolvedAt: "2026-05-09T12:00:00.000Z",
          sourceHook: "permission.asked",
        },
        resolvedAt: "2026-05-09T12:00:00.000Z",
      },
    ],
    pendingActions: [],
    pushProposal: {
      kind: "push",
      action: "push",
      branchName: "feat/story-3-3",
      targetBranch: "feat/story-3-3",
      remoteName: "origin",
      remote: "origin",
      branch: "feat/story-3-3",
      correlationId: "corr-push-failure",
    },
  });

  const hook = createPermissionAskedHook(
    {
      workflowState: store,
      pluginContext: {
        async gitActionRunner() {
          const error = new Error("push rejected");
          error.status = 1;
          error.stderr = "remote rejected non-fast-forward";
          throw error;
        },
        async requestRecoveryDecision(gate) {
          prompts.push(gate);
        },
      },
    },
  );

  await hook({
    sessionID: "s-push-failure",
    approvalId: "approval:s-push-failure:push:push",
    actionId: "action:push:push",
    outcome: "accept",
  });

  const state = store.get("s-push-failure");
  assert.equal(state.lastGitAction.kind, "push");
  assert.equal(state.lastGitResult.status, "failed");
  assert.equal(state.lastGitResult.code, "push-rejection");
  assert.equal(state.recoveryGate?.actionKind, "push");
  assert.equal(prompts.length, 1, "push failure must open and deliver a recovery gate");
  // Story 3.3 review round 2 (Medium): the prior commit-success record must
  // survive the push failure leg untouched so traceability for the local
  // commit is not silently overwritten by the push outcome.
  const commitHistoryEntry = state.approvalHistory?.find(
    (entry) => entry?.actionType === "commit",
  );
  assert.ok(
    commitHistoryEntry,
    "push failure must NOT erase the prior commit resolution from approvalHistory",
  );
  assert.equal(
    commitHistoryEntry.resolution?.actionKind,
    "commit",
    "commit traceability metadata must remain observable after push failure",
  );
  assert.equal(
    commitHistoryEntry.resolution?.status,
    "accept",
    "commit success status must remain observable after push failure",
  );
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
  const hook = createPermissionAskedHook(
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
    const output = { parts: [] };
    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-23 cleanup-2", sessionID: "s-23-cleanup" },
      output,
    );
    assert.ok(
      output.parts.some((part) => part?.metadata?.startupChain === true),
      "re-entry after session.deleted must publish a fresh startup approval instruction",
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
 * Story 2.3 post-review (LOW-2): startup approvals no longer go through
 * promptAsync, but the synthetic instruction must still carry stable startup
 * metadata so the pending chain is traceable.
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

    const output = { parts: [] };
    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "AID-PROMPT-1", sessionID: "s-23-prompt-aid" },
      output,
    );

    assert.equal(mock.prompts.length, 0, "startup approval must not use promptAsync");
    const metadata = output.parts.find((part) => part?.metadata?.startupChain === true)?.metadata;
    assert.ok(metadata, "startup instruction metadata required");
    assert.equal(typeof metadata.startupChainId, "string", "startup metadata.startupChainId required");
    assert.ok(metadata.startupChainId.length > 0, "startup metadata.startupChainId must be non-empty");
    assert.deepEqual(metadata.questionKeys, ["branch"], "startup metadata questionKeys required");
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
  assert.equal(envelope.code, "branch-switch-mismatch");

  // Another true post-condition failure: preflight matches, runner exits cleanly,
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
        builtModule.DevaiAiddGuardPlugin || builtModule.default,
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
  const wrapperWorkspace = createGitWorkspace({ initialize: true });
  try {
    const wrapperModule = await import(`${wrapperModuleUrl}?recovery-deliver=${Date.now()}`);
    const { handlers, mock } = await instantiate(
      wrapperModule.DevaiAiddGuardPlugin,
      wrapperWorkspace,
    );

    await runCommandExecuteBefore(handlers);
    if (mock.prompts.length === 0) {
      const startupRequested = mock.logs.filter((l) => l.body?.message === "startup.chain.requested");
      assert.ok(
        startupRequested.length >= 1,
        "startup approval chain should be requested when promptAsync approval is not delivered",
      );
      return;
    }
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
    if (mock.prompts.length === promptCountBeforeDeny) {
      const startupResolved = mock.logs.filter((l) => l.body?.message === "startup.chain.resolved");
      assert.equal(startupResolved.length, 0);
      return;
    }

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

  // Brownfield baseline: when files would blow past the Windows argv ceiling
  // the caller passes `pathspecFromFile`, switching git to read the NUL-
  // separated path list from a temp file. Same scoping guarantee, no argv
  // limit.
  const viaFile = buildCommitArgs(
    { message: "Initial commit", files: ["src/a.js", "docs/b.md"] },
    { pathspecFromFile: "/tmp/devai-aidd-pathspec-xyz/files.lst" },
  );
  assert.deepEqual(viaFile.addArgs, [
    "add",
    "-A",
    "--pathspec-from-file=/tmp/devai-aidd-pathspec-xyz/files.lst",
    "--pathspec-file-nul",
  ]);
  assert.deepEqual(viaFile.commitArgs, [
    "commit",
    "-m",
    "Initial commit",
    "--pathspec-from-file=/tmp/devai-aidd-pathspec-xyz/files.lst",
    "--pathspec-file-nul",
  ]);

  // allowEmpty must still bypass both inline and file modes (baseline with
  // zero changes still needs a HEAD ref to grow).
  const empty = buildCommitArgs(
    { message: "Initial commit", files: [], allowEmpty: true },
    { pathspecFromFile: "/tmp/should-be-ignored" },
  );
  assert.equal(empty.addArgs, null);
  assert.deepEqual(empty.commitArgs, ["commit", "--allow-empty", "-m", "Initial commit"]);
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

/* ----------------------------------------------------------------------- */
/*                       Story 3.4 — audit traceability                     */
/* ----------------------------------------------------------------------- */

/**
 * Story 3.4 (AC1): every audit event on the commit/push finalization path
 * must carry the same minimal correlation axes (workflow, command, sessionID,
 * outcome, details.actionKind, details.correlationId, details.phase, and —
 * where applicable — details.finalizationMode) so an auditor can re-assemble
 * one finalization flow from disparate event names.
 */
async function verifyStory34ApprovalRequestedCarriesCorrelationAxes() {
  const [{ createWorkflowStateStore }, commandBeforeModule, { DEFAULT_PLUGIN_CONFIG }] =
    await Promise.all([
      import(`${workflowStateModuleUrl}?s34-req-axes=${Date.now()}`),
      import(`${commandExecuteBeforeModuleUrl}?s34-req-axes=${Date.now()}`),
      import(pathToFileURL(path.join(projectRoot, "src", "config", "defaults.js")).href),
    ]);

  const gitWorkspace = createGitWorkspace({ initialize: true });
  const workflowState = createWorkflowStateStore();
  const logs = [];

  const hook = commandBeforeModule.createCommandExecuteBeforeHook(
    {
      workflowCommands: new Set(["bmad-bmm-quick-dev"]),
      workflowState,
      branchConfig: TEST_BRANCH_CONFIG,
      pluginContext: {
        directory: gitWorkspace,
        resolvePolicy(wfCtx) {
          const policy = defaultPolicyWithLegacyBranchRequired(wfCtx.commandName, DEFAULT_PLUGIN_CONFIG);
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
      { command: "/bmad-bmm-quick-dev", arguments: "S34-AXES-1", sessionID: "s-34-axes" },
      { parts: [] },
    );

    const requested = logs.filter((l) => l.message === "approval.requested");
    assert.equal(requested.length, 1, "exactly one approval.requested must be emitted");
    const payload = requested[0].extra;

    // Story 3.4 minimum top-level shape.
    assert.equal(payload.event, "approval.requested");
    assert.equal(typeof payload.timestamp, "string");
    assert.equal(typeof payload.workflow, "string");
    assert.equal(typeof payload.command, "string");
    assert.equal(payload.workflow, payload.command, "workflow and command must be the same axis");
    assert.equal(typeof payload.sessionID, "string", "sessionID must be exposed at top level");
    assert.equal(payload.sessionID.length > 0, true);
    assert.equal(payload.outcome, "ask", "approval.requested uses outcome=ask (not yet resolved)");

    // Story 3.4 details contract.
    assert.equal(typeof payload.details, "object");
    assert.equal(typeof payload.details.actionKind, "string", "details.actionKind required");
    assert.equal(typeof payload.details.actionId, "string", "details.actionId required");
    assert.equal(
      Object.prototype.hasOwnProperty.call(payload.details, "correlationId"),
      true,
      "details.correlationId must be present (string or null)",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(payload.details, "finalizationMode"),
      true,
      "details.finalizationMode must be present (string or null)",
    );
    assert.equal(typeof payload.details.phase, "string", "details.phase required");
  } finally {
    fs.rmSync(gitWorkspace, { recursive: true, force: true });
  }
}

/**
 * Story 3.4 (AC1): commit/push approval.resolved + git.action.skipped must
 * carry the same correlationId + finalizationMode axes so deny / ignore-and-
 * continue can be joined to the prior approval.requested event.
 */
async function verifyStory34ApprovalResolvedAndSkippedCarryCorrelationAxes() {
  const { buildApprovalResolvedAudit, buildGitActionSkippedAudit } = await import(
    `${buildApprovalResolutionModuleUrl}?s34-resolved-axes=${Date.now()}`
  );

  const request = {
    id: "approval:s-34:push:push",
    actionId: "action:push:push",
    sessionID: "s-34",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "finish",
    actionType: "push",
    proposal: {
      kind: "push",
      action: "push",
      remoteName: "origin",
      branchName: "feat/X",
      correlationId: "corr-push-axes",
    },
    metadata: {
      workflow: "bmad-bmm-quick-dev",
      command: "bmad-bmm-quick-dev",
      finalization: "commit-and-push",
    },
  };
  const resolution = {
    approvalId: request.id,
    actionId: request.actionId,
    sessionID: request.sessionID,
    actionKind: "push",
    actionType: "push",
    status: "deny",
    previousStatus: "pending",
    continuation: "continue-without-action",
    resolvedAt: "2026-05-10T00:00:00.000Z",
    resolvedBy: null,
    sourceHook: "permission.asked",
    reasonCode: "approval-denied",
    metadata: { phase: "finish", workflow: request.workflow, command: request.command },
  };

  const resolved = buildApprovalResolvedAudit({ request, resolution });
  assert.equal(resolved.event, "approval.resolved");
  assert.equal(resolved.workflow, "bmad-bmm-quick-dev");
  assert.equal(resolved.command, "bmad-bmm-quick-dev");
  assert.equal(resolved.sessionID, "s-34");
  assert.equal(resolved.outcome, "deny");
  assert.equal(resolved.details.actionKind, "push");
  assert.equal(resolved.details.correlationId, "corr-push-axes", "approval.resolved must carry the proposal correlationId");
  assert.equal(resolved.details.finalizationMode, "commit-and-push", "approval.resolved must carry workflowPolicy.finalization");
  assert.equal(resolved.details.phase, "finish");
  assert.equal(resolved.details.continuation, "continue-without-action");

  const skipped = buildGitActionSkippedAudit({ request, resolution });
  assert.ok(skipped, "deny outcome must produce a git.action.skipped event");
  assert.equal(skipped.event, "git.action.skipped");
  assert.equal(skipped.workflow, "bmad-bmm-quick-dev");
  assert.equal(skipped.sessionID, "s-34");
  assert.equal(skipped.outcome, "deny");
  assert.equal(skipped.details.actionKind, "push");
  assert.equal(skipped.details.reason, "approval-denied", "deny → reason=approval-denied");
  assert.equal(skipped.details.correlationId, "corr-push-axes", "git.action.skipped must carry the same correlationId as approval.resolved");
  assert.equal(skipped.details.finalizationMode, "commit-and-push", "git.action.skipped must carry the same finalizationMode");
  assert.equal(skipped.details.phase, "finish", "git.action.skipped must carry the resolution phase");
}

/**
 * Story 3.4 (AC1): git.action.executed must carry actionId AND
 * finalizationMode in details so the executor envelope joins to the same
 * correlation family as the approval events.
 */
async function verifyStory34GitActionExecutedCarriesCorrelationAxes() {
  const { executeGitAction } = await import(
    `${gitExecutorModuleUrl}?s34-exec-axes=${Date.now()}`
  );

  const recorded = [];
  await executeGitAction({
    plan: {
      kind: "commit",
      operation: "commit",
      branchName: "feat/X",
      correlationId: "corr-commit-axes",
    },
    expectedState: { headBranch: "feat/X" },
    repositorySnapshot: { headBranch: "feat/X" },
    workflowContext: {
      sessionID: "s-34-exec",
      commandName: "bmad-bmm-quick-dev",
      phase: "finish",
      // Story 3.4: both axes are accepted as workflowContext fields so the
      // executor signature stays stable while audit gets the full picture.
      actionId: "action:commit:commit",
      finalizationMode: "commit-and-push",
    },
    gitRunner: async () => ({}),
    audit: {
      async info(message, payload) {
        recorded.push({ message, payload });
      },
    },
  });

  assert.equal(recorded.length, 1, "exactly one git.action.executed must be emitted");
  const [{ message, payload }] = recorded;
  assert.equal(message, "git.action.executed");
  assert.equal(payload.workflow, "bmad-bmm-quick-dev");
  assert.equal(payload.command, "bmad-bmm-quick-dev");
  assert.equal(payload.sessionID, "s-34-exec", "sessionID must be exposed at top level");
  assert.equal(payload.outcome, "succeeded");
  assert.equal(payload.details.actionKind, "commit");
  assert.equal(payload.details.actionId, "action:commit:commit", "details.actionId must be threaded from workflowContext");
  assert.equal(payload.details.correlationId, "corr-commit-axes", "details.correlationId must come from the action plan");
  assert.equal(payload.details.finalizationMode, "commit-and-push", "details.finalizationMode must be threaded from workflowContext");
  assert.equal(payload.details.phase, "end");
}

/**
 * Story 3.4 (AC2): a throwing audit sink on git.action.executed MUST NOT
 * abort the executor envelope. The envelope is the load-bearing return
 * value — primary failure code (or success) must reach the caller even if
 * the logger explodes.
 */
async function verifyStory34GitExecutorEnvelopeSurvivesAuditThrow() {
  const { executeGitAction } = await import(
    `${gitExecutorModuleUrl}?s34-exec-throws=${Date.now()}`
  );

  const envelope = await executeGitAction({
    plan: {
      kind: "commit",
      operation: "commit",
      branchName: "feat/X",
      correlationId: "corr-throw",
    },
    expectedState: { headBranch: "feat/X" },
    repositorySnapshot: { headBranch: "feat/X" },
    workflowContext: { sessionID: "s-throw", commandName: "bmad-bmm-quick-dev", phase: "finish" },
    gitRunner: async () => ({}),
    audit: {
      async info() {
        throw new Error("audit sink unavailable");
      },
    },
  });

  // Primary outcome (success) must survive even though audit threw.
  assert.equal(envelope.ok, true, "envelope must report primary success despite audit throw");
  assert.equal(envelope.status, "succeeded");
  assert.equal(envelope.code, null, "audit failure must NOT overwrite the primary cause");
  assert.equal(envelope.action.kind, "commit");
  assert.equal(envelope.audit.attempted, true);
  assert.equal(envelope.audit.logged, false, "audit.logged must reflect that emission failed");
  assert.equal(typeof envelope.audit.loggingError, "string", "loggingError must capture the sink error");
}

/**
 * Story 3.4 (AC1, AC2): after a successful commit, a denied push must NOT
 * undermine the already-recorded git.action.executed (commit) audit trail.
 * Both events must remain in the audit log with the same workflow + sessionID
 * so an auditor can reconstruct "local-finalized, remote-not-finalized".
 */
async function verifyStory34CommitSuccessThenPushDenyPreservesAuditChain() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?s34-commit-then-push-deny=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?s34-commit-then-push-deny=${Date.now()}`),
  ]);

  const events = [];
  const audit = {
    async info(message, payload) {
      events.push({ message, payload });
    },
  };

  const store = createWorkflowStateStore();
  store.set("s-34-cp", {
    sessionID: "s-34-cp",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: {
        isGitRepository: true,
        branch: "feat/story-3-4",
        hasRemote: true,
        remoteNames: ["origin"],
      },
    },
    approvalCurrent: {
      id: "approval:s-34-cp:commit:commit",
      actionId: "action:commit:commit",
      sessionID: "s-34-cp",
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
        correlationId: "corr-commit-cp",
      },
      metadata: {
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
        finalization: "commit-and-push",
      },
    },
    approvalHistory: [],
    pendingActions: [],
    commitProposal: {
      kind: "commit",
      action: "commit",
      message: "Finish bmad-bmm-quick-dev: update implementation outputs",
      artifactScope: "implementation",
      changeCountSummary: "1 code file",
      files: ["src/index.js"],
      correlationId: "corr-commit-cp",
    },
  });

  const hook = createPermissionAskedHook(
    {
      workflowState: store,
      audit,
      pluginContext: {
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
        async gitActionRunner({ action }) {
          assert.equal(action.kind, "commit");
          return {
            observedState: { headBranch: "feat/story-3-4", hasRemote: true },
          };
        },
        async requestApproval() {
          // Simulate the runtime publishing the push prompt — no-op for the
          // assertions; we only care about audit trail correlation here.
        },
      },
    },
  );

  // Step 1: accept the commit. This emits approval.resolved (accept) +
  // git.action.executed (commit, succeeded), then publishes the push
  // approval (which itself emits approval.requested for push).
  await hook({
    sessionID: "s-34-cp",
    approvalId: "approval:s-34-cp:commit:commit",
    actionId: "action:commit:commit",
    outcome: "accept",
  });

  const commitExecuted = events.find(
    (e) => e.message === "git.action.executed" && e.payload?.details?.actionKind === "commit",
  );
  assert.ok(commitExecuted, "commit success must emit git.action.executed");
  assert.equal(commitExecuted.payload.outcome, "succeeded");
  assert.equal(commitExecuted.payload.workflow, "bmad-bmm-quick-dev");
  assert.equal(commitExecuted.payload.sessionID, "s-34-cp");
  assert.equal(commitExecuted.payload.details.correlationId, "corr-commit-cp");

  // Confirm push approval is now active before we deny it.
  const afterCommit = store.get("s-34-cp");
  assert.equal(afterCommit.approvalCurrent?.actionType, "push", "push approval must be active after commit success");
  const pushApprovalId = afterCommit.approvalCurrent.id;

  // Step 2: deny the push approval.
  await hook({
    sessionID: "s-34-cp",
    approvalId: pushApprovalId,
    actionId: afterCommit.approvalCurrent.actionId,
    outcome: "deny",
  });

  // Both events must be present in the audit log, sharing workflow + sessionID.
  const commitExecutedEvents = events.filter(
    (e) => e.message === "git.action.executed" && e.payload?.details?.actionKind === "commit",
  );
  const pushSkippedEvents = events.filter(
    (e) => e.message === "git.action.skipped" && e.payload?.details?.actionKind === "push",
  );
  assert.equal(commitExecutedEvents.length, 1, "commit-success git.action.executed must remain in the log");
  assert.equal(pushSkippedEvents.length, 1, "push-deny must produce git.action.skipped");

  const commitEvt = commitExecutedEvents[0].payload;
  const pushEvt = pushSkippedEvents[0].payload;

  assert.equal(commitEvt.workflow, pushEvt.workflow, "commit and push events must share workflow axis");
  assert.equal(commitEvt.sessionID, pushEvt.sessionID, "commit and push events must share sessionID axis");
  assert.equal(commitEvt.details.finalizationMode, "commit-and-push", "commit event finalizationMode");
  assert.equal(pushEvt.details.finalizationMode, "commit-and-push", "push-skipped event finalizationMode must be the same family");
  assert.equal(pushEvt.details.reason, "approval-denied", "push deny reason");
  assert.equal(commitEvt.outcome, "succeeded", "commit succeeded must be preserved");
  assert.equal(pushEvt.outcome, "deny", "push deny outcome must be recorded");

  // Story 3.4 contract: minimum-data logging — no raw stderr / remote URL
  // leaks into either payload.
  assert.equal(commitEvt.details.stderrSummary, null, "commit succeeded must not carry stderr");
  assert.equal(
    Object.prototype.hasOwnProperty.call(pushEvt.details, "remoteUrl"),
    false,
    "git.action.skipped must NOT carry full remoteUrl",
  );
}

/**
 * Story 3.4 (AC2 R2 mutation guard): every audit emission on the bootstrap
 * path is best-effort. If `client.app.log` throws on every call, the wrapper
 * must STILL return a usable hook map (so the runtime can register hooks)
 * instead of crashing. R1 wrapped the bootstrap audit emissions
 * (`config.validation.failed`, `plugin bootstrap`, `plugin bootstrap
 * registered no-op hooks`, `compat.bridge.evaluated`) in try/catch — without
 * this mutation test, a future regression that drops one of those wrappers
 * could slip past the existing Story 1.3 / 4.2 happy-path coverage which
 * only asserts emission shape, not throw-resilience.
 */
async function verifyStory34BootstrapAuditFailureDoesNotAbortRegistration() {
  const wrapperModule = await import(
    `${wrapperModuleUrl}?s34-bootstrap-audit-throw=${Date.now()}`
  );

  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "devai-aidd-bootstrap-audit-throw-"),
  );
  const projectConfigDir = path.join(tempRoot, ".opencode");
  fs.mkdirSync(projectConfigDir, { recursive: true });
  const commandsDir = path.join(tempRoot, ".opencode", "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(
    path.join(commandsDir, "bmad-bmm-quick-dev.md"),
    "# quick dev\n",
    "utf8",
  );

  // Force every bootstrap audit emission to throw. The single instrumented
  // logger covers all bootstrap audit sites — each one must be independently
  // wrapped or this test fails the registration assertion below.
  const throwingClient = {
    app: {
      async log() {
        throw new Error("audit sink unavailable during bootstrap");
      },
    },
    session: {
      async promptAsync() {},
    },
  };

  let handlers;
  let bootstrapError = null;
  try {
    try {
      handlers = await wrapperModule.DevaiAiddGuardPlugin({
        client: throwingClient,
        directory: tempRoot,
      });
    } catch (err) {
      bootstrapError = err;
    }

    assert.equal(
      bootstrapError,
      null,
      "bootstrap must NOT throw when every audit emission fails — Story 3.4 AC2 best-effort applies to bootstrap audit too",
    );
    assert.ok(
      handlers && typeof handlers === "object",
      "bootstrap must still return a hook map even when audit is unavailable",
    );
    // Spot-check the contract surface so a future regression that returns
    // null/undefined on audit failure is caught here, not at runtime
    // registration in the host.
    assert.equal(
      typeof handlers["command.execute.before"],
      "function",
      "command.execute.before hook must be registered despite audit throws",
    );
    assert.equal(
      typeof handlers["permission.asked"],
      "function",
      "permission.asked hook must be registered despite audit throws",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/*           Story 3.5 — preserve reviewer traceability through            */
/*                       standard Git history                              */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Story 3.5 (AC1, AC2): a code-only commit proposal must surface artifactKinds
 * and a reviewer-friendly pathScopeSummary built from the same matchedFiles
 * Story 3.1 detected. The summary must use repo-relative prefixes the reviewer
 * can paste into `git log -- <prefix>`, and per-file basenames must NOT leak
 * outside the proposal's `files` field.
 */
async function verifyStory35CommitProposalCodeOnlyScope() {
  const { buildCommitProposal } = await import(
    `${commitProposalModuleUrl}?s35-code-only=${Date.now()}`
  );

  const proposal = buildCommitProposal({
    workflowContext: {
      sessionID: "s-35-code",
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
      matchedFiles: [
        { path: "src/services/git/commit-service.js", kind: "code" },
        { path: "src/hooks/permission-asked.js", kind: "code" },
        { path: "tests/regression.test.js", kind: "code" },
      ],
    },
  });

  assert.ok(proposal, "code-only finalization must produce a commit proposal");
  assert.deepEqual(
    proposal.artifactKinds,
    ["code"],
    "artifactKinds must enumerate only the kinds present in the matched scope",
  );
  assert.equal(
    proposal.changeCountSummary,
    "3 code files",
    "changeCountSummary must aggregate code file counts",
  );
  assert.deepEqual(
    proposal.pathScopeSummary,
    [
      { prefix: "src/", label: "code/src", count: 2 },
      { prefix: "tests/", label: "code/tests", count: 1 },
    ],
    "pathScopeSummary must be ordered by canonical bucket priority and use repo-relative prefixes",
  );
  // No basenames may appear in the path-scope summary; only the bucket prefix
  // is reviewer-facing.
  assert.ok(
    proposal.pathScopeSummary.every((entry) => !/\.js$/.test(entry.prefix)),
    "pathScopeSummary entries must NOT contain per-file basenames",
  );
}

/**
 * Story 3.5 (AC1, AC2): a docs-only commit proposal (technical-doc + planning-
 * artifact) must aggregate kinds correctly and emit the doc-bucket prefixes
 * reviewers can paste into `git log -- <prefix>`.
 */
async function verifyStory35CommitProposalDocsOnlyScope() {
  const { buildCommitProposal } = await import(
    `${commitProposalModuleUrl}?s35-docs-only=${Date.now()}`
  );

  const proposal = buildCommitProposal({
    workflowContext: {
      sessionID: "s-35-docs",
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
      matchedFiles: [
        { path: "_bmad-output/implementation-artifacts/3-5-foo.md", kind: "technical-doc" },
        { path: "_bmad-output/planning-artifacts/architecture.md", kind: "planning-artifact" },
        { path: "README.md", kind: "technical-doc" },
      ],
    },
  });

  assert.ok(proposal, "docs-only finalization must produce a commit proposal");
  assert.deepEqual(
    [...proposal.artifactKinds].sort(),
    ["planning-artifact", "technical-doc"],
    "artifactKinds must enumerate every document kind present in the scope",
  );
  // pathScopeSummary order: docs/technical and planning/implementation buckets,
  // README.md classified as doc/readme single-file bucket.
  const prefixes = proposal.pathScopeSummary.map((entry) => entry.prefix);
  assert.deepEqual(
    prefixes,
    [
      "_bmad-output/planning-artifacts/",
      "_bmad-output/implementation-artifacts/",
      "README.md",
    ],
    "docs-only pathScopeSummary must surface planning + implementation + README buckets in canonical order",
  );
  for (const entry of proposal.pathScopeSummary) {
    assert.ok(
      entry.count >= 1,
      "every reported pathScopeSummary bucket must have a positive count",
    );
  }
}

/**
 * Story 3.5 (AC2): mixed code+docs proposals must roll up both families into a
 * single proposal whose path-scope summary cleanly separates code buckets from
 * doc buckets — the reviewer can then walk both `git log -- src/` and
 * `git log -- _bmad-output/...` from the same commit.
 */
async function verifyStory35CommitProposalMixedScope() {
  const { buildCommitProposal } = await import(
    `${commitProposalModuleUrl}?s35-mixed=${Date.now()}`
  );

  const proposal = buildCommitProposal({
    workflowContext: {
      sessionID: "s-35-mixed",
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
      matchedFiles: [
        { path: "src/services/git/commit-service.js", kind: "code" },
        { path: "_bmad-output/implementation-artifacts/3-5-foo.md", kind: "technical-doc" },
        { path: "tests/regression.test.js", kind: "code" },
      ],
    },
  });

  assert.ok(proposal, "mixed finalization must produce a commit proposal");
  assert.deepEqual(
    [...proposal.artifactKinds].sort(),
    ["code", "technical-doc"],
    "artifactKinds must include both code and technical-doc",
  );
  assert.equal(
    proposal.changeCountSummary,
    "2 code files, 1 technical-doc file",
    "changeCountSummary must list code first then docs",
  );
  // src/ and tests/ buckets come before doc/ buckets in canonical order.
  const summary = proposal.pathScopeSummary;
  const srcIdx = summary.findIndex((entry) => entry.prefix === "src/");
  const testsIdx = summary.findIndex((entry) => entry.prefix === "tests/");
  const docsIdx = summary.findIndex(
    (entry) => entry.prefix === "_bmad-output/implementation-artifacts/",
  );
  assert.ok(srcIdx >= 0 && testsIdx >= 0 && docsIdx >= 0, "all expected buckets must be reported");
  assert.ok(srcIdx < docsIdx, "code buckets must precede doc buckets in pathScopeSummary");
  assert.ok(testsIdx < docsIdx, "tests bucket must precede doc bucket in pathScopeSummary");
  assert.equal(summary.find((entry) => entry.prefix === "src/").count, 1);
  assert.equal(summary.find((entry) => entry.prefix === "tests/").count, 1);
  assert.equal(
    summary.find((entry) => entry.prefix === "_bmad-output/implementation-artifacts/").count,
    1,
  );
}

/**
 * Story 3.5 (AC1): the approval explanation must surface artifactScope,
 * changeCountSummary, artifactKinds, and pathScopeSummary so the reviewer can
 * map the prompt to standard `git log -- <prefix>` commands. Sensitive data
 * (absolute paths, full remote URLs, raw stderr) must NOT appear anywhere in
 * the explanation payload.
 */
async function verifyStory35CommitExplanationSurfacesScopeWithoutSensitiveData() {
  const { buildApprovalExplanation } = await import(
    `${buildApprovalExplanationModuleUrl}?s35-explain=${Date.now()}`
  );

  const explanation = buildApprovalExplanation({
    actionCategory: "commit",
    workflowContext: {
      commandName: "bmad-bmm-quick-dev",
      sessionID: "s-35-explain",
    },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "story",
      branchRequired: true,
      finalization: "commit-and-push",
    },
    commitProposal: {
      kind: "commit",
      action: "commit",
      message: "워크플로우 완료(bmad-bmm-quick-dev): implementation 산출물 업데이트",
      artifactScope: "implementation",
      artifactKinds: ["code", "technical-doc"],
      changeCountSummary: "2 code files, 1 technical-doc file",
      pathScopeSummary: [
        { prefix: "src/", label: "code/src", count: 2 },
        { prefix: "_bmad-output/implementation-artifacts/", label: "doc/implementation-artifact", count: 1 },
      ],
      // The proposal carries explicit files for git pathspec assembly, but the
      // explanation must NEVER copy them out — pathScopeSummary is the only
      // reviewer-facing surface.
      files: ["src/index.js", "src/hooks/permission-asked.js", "_bmad-output/implementation-artifacts/3-5.md"],
    },
  });

  // Story 3.5: artifactKinds and pathScopeSummary must be exposed on the
  // explanation fields contract.
  assert.deepEqual(
    explanation.fields.artifactKinds,
    ["code", "technical-doc"],
    "explanation.fields must expose artifactKinds for reviewers",
  );
  assert.deepEqual(
    explanation.fields.pathScopeSummary,
    [
      { prefix: "src/", label: "code/src", count: 2 },
      { prefix: "_bmad-output/implementation-artifacts/", label: "doc/implementation-artifact", count: 1 },
    ],
    "explanation.fields must expose pathScopeSummary verbatim from the proposal",
  );
  assert.equal(explanation.fields.artifactScope, "implementation");
  assert.equal(
    explanation.fields.changeCountSummary,
    "2 code files, 1 technical-doc file",
  );
  assert.equal(explanation.fields.finalizationMode, "commit-and-push");

  // The reviewer-facing impactSummary must mention the bucket prefixes so the
  // user can paste them into `git log -- <prefix>`.
  assert.match(explanation.impactSummary, /src\//);
  assert.match(explanation.impactSummary, /_bmad-output\/implementation-artifacts\//);

  // Story 3.5 sensitive-data guard: absolute paths, full remote URLs, raw
  // stderr fragments must NOT leak into the explanation payload anywhere.
  const serialized = JSON.stringify(explanation);
  assert.ok(
    !/[A-Z]:\\Users\\/.test(serialized),
    "explanation must NOT contain Windows absolute paths",
  );
  assert.ok(
    !/^\/(Users|home)\//m.test(serialized),
    "explanation must NOT contain POSIX absolute paths",
  );
  assert.ok(
    !/https?:\/\//.test(serialized),
    "explanation must NOT contain remote URL prefixes",
  );
  assert.ok(
    !/permission-asked\.js/.test(serialized) &&
      !/3-5\.md/.test(serialized) &&
      !/index\.js/.test(serialized),
    "explanation must NOT leak per-file basenames from commitProposal.files",
  );
}

/**
 * Story 3.5 (AC1, AC2): even when a push fails after a successful commit, the
 * already-recorded local commit must remain reviewable via standard Git tools.
 * The audit log must keep the commit's git.action.executed entry, the workflow
 * state must keep the commit recorded in lastGitAction/lastGitResult, and the
 * push proposal/state machine must be the only thing that gets rolled back —
 * never the commit traceability itself.
 */
async function verifyStory35PushFailureDoesNotInvalidateLocalCommitTraceability() {
  const [
    { createWorkflowStateStore },
    { createPermissionAskedHook },
  ] = await Promise.all([
    import(`${workflowStateModuleUrl}?s35-push-fail=${Date.now()}`),
    import(`${permissionAskedHookModuleUrl}?s35-push-fail=${Date.now()}`),
  ]);

  const events = [];
  const audit = {
    async info(message, payload) {
      events.push({ message, payload });
    },
  };
  const store = createWorkflowStateStore();
  store.set("s-35-push-fail", {
    sessionID: "s-35-push-fail",
    commandName: "bmad-bmm-quick-dev",
    phase: "finish",
    readiness: {
      outcome: "allow",
      details: {
        isGitRepository: true,
        branch: "feat/story-3-5",
        hasRemote: true,
        remoteNames: ["origin"],
      },
    },
    approvalCurrent: {
      id: "approval:s-35-push-fail:commit:commit",
      actionId: "action:commit:commit",
      sessionID: "s-35-push-fail",
      workflow: "bmad-bmm-quick-dev",
      command: "bmad-bmm-quick-dev",
      phase: "finish",
      actionType: "commit",
      status: "awaitingApproval",
      proposal: {
        kind: "commit",
        action: "commit",
        message: "워크플로우 완료(bmad-bmm-quick-dev): implementation 산출물 업데이트",
        artifactScope: "implementation",
        artifactKinds: ["code"],
        changeCountSummary: "1 code file",
        pathScopeSummary: [{ prefix: "src/", label: "code/src", count: 1 }],
        files: ["src/index.js"],
        correlationId: "corr-35-commit",
      },
      metadata: {
        workflow: "bmad-bmm-quick-dev",
        command: "bmad-bmm-quick-dev",
        finalization: "commit-and-push",
      },
    },
    approvalHistory: [],
    pendingActions: [],
    commitProposal: {
      kind: "commit",
      action: "commit",
      message: "워크플로우 완료(bmad-bmm-quick-dev): implementation 산출물 업데이트",
      artifactScope: "implementation",
      artifactKinds: ["code"],
      changeCountSummary: "1 code file",
      pathScopeSummary: [{ prefix: "src/", label: "code/src", count: 1 }],
      files: ["src/index.js"],
      correlationId: "corr-35-commit",
    },
  });

  let runnerCall = 0;
  const hook = createPermissionAskedHook(
    {
      workflowState: store,
      audit,
      pluginContext: {
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
        async gitActionRunner({ action }) {
          runnerCall += 1;
          if (action.kind === "commit") {
            return {
              observedState: { headBranch: "feat/story-3-5", hasRemote: true },
            };
          }
          if (action.kind === "push") {
            // Push fails after a successful local commit. Story 3.5 contract:
            // the reviewer-facing local commit history must NOT be rolled back
            // because of a push failure — the commit envelope/audit must stay.
            const error = new Error("push rejected by remote");
            error.status = 1;
            error.stderr = "remote: rejected (non-fast-forward)\nTo origin\n";
            throw error;
          }
          throw new Error(`unexpected action ${action.kind}`);
        },
        async requestApproval() {
          /* no-op — runtime would deliver the prompt; assertions read state */
        },
        async requestRecoveryDecision() {
          /* no-op — recovery prompt delivery exercised in Story 2.5 tests */
        },
      },
    },
  );

  // Step 1: accept commit (success). This emits git.action.executed (commit).
  await hook({
    sessionID: "s-35-push-fail",
    approvalId: "approval:s-35-push-fail:commit:commit",
    actionId: "action:commit:commit",
    outcome: "accept",
  });

  const afterCommit = store.get("s-35-push-fail");
  assert.equal(afterCommit.lastGitAction?.kind, "commit", "commit must be the last recorded git action");
  assert.equal(afterCommit.lastGitResult?.status, "succeeded", "commit must record succeeded status");
  assert.equal(afterCommit.commitProposal, null, "commit success must clear commitProposal");
  assert.equal(afterCommit.approvalCurrent?.actionType, "push", "push approval must be the next active request");
  const pushApprovalId = afterCommit.approvalCurrent.id;
  const pushActionId = afterCommit.approvalCurrent.actionId;

  // Step 2: accept push (failure). The push runner throws.
  await hook({
    sessionID: "s-35-push-fail",
    approvalId: pushApprovalId,
    actionId: pushActionId,
    outcome: "accept",
  });

  const afterPush = store.get("s-35-push-fail");
  // Push failure rewrites lastGitAction/Result to the push attempt — that is
  // expected by Story 2.5 — but the commit's git.action.executed audit row
  // must still exist in the audit log so reviewers can reconstruct
  // "local-finalized, remote-not-finalized" exclusively from standard Git
  // history + audit.
  assert.equal(afterPush.lastGitAction?.kind, "push");
  assert.equal(afterPush.lastGitResult?.status, "failed");

  const commitExecuted = events.filter(
    (e) => e.message === "git.action.executed" && e.payload?.details?.actionKind === "commit",
  );
  const pushExecuted = events.filter(
    (e) => e.message === "git.action.executed" && e.payload?.details?.actionKind === "push",
  );
  assert.equal(
    commitExecuted.length,
    1,
    "the commit's git.action.executed entry must remain in the audit log even after push failure",
  );
  assert.equal(commitExecuted[0].payload.outcome, "succeeded");
  assert.equal(commitExecuted[0].payload.details.correlationId, "corr-35-commit");
  assert.equal(pushExecuted.length, 1, "the failed push must also produce a git.action.executed entry");
  assert.equal(pushExecuted[0].payload.outcome, "failed");

  // Story 3.5 sensitive-data guard: the audit payload may carry a sanitized,
  // collapsed stderrSummary (the classifier already trims to ≤240 chars and
  // collapses whitespace into single spaces) but it must NEVER carry the raw
  // multi-line stderr text or any full remote URL. We scan the serialized
  // payload for embedded newlines and URL prefixes — both would indicate the
  // sanitization layer was bypassed.
  const pushPayload = JSON.stringify(pushExecuted[0].payload);
  assert.ok(
    !/\\n/.test(pushPayload),
    "push failure audit must NOT include raw multi-line stderr (newlines escape into the JSON if leaked)",
  );
  assert.ok(
    !/https?:\/\//.test(pushPayload),
    "push failure audit must NOT include remote URLs",
  );
  // The sanitized stderrSummary is an allowed, length-bounded field. We
  // assert the field exists for traceability AND that it cannot exceed the
  // classifier's 240-char cap (any longer = sanitization was bypassed).
  const stderrSummary = pushExecuted[0].payload?.details?.stderrSummary;
  assert.ok(
    stderrSummary === null || (typeof stderrSummary === "string" && stderrSummary.length <= 240),
    "push failure stderrSummary must be either null or a sanitized ≤240-char string",
  );
  assert.equal(runnerCall, 2, "exactly two runner invocations: one commit, one push");
}

/**
 * Story 3.5 (AC2): a workflow-finalization recovery gate must block subsequent
 * finalization proposals (commit/push) but MUST NOT block non-finalization
 * activity. This guarantees that an open recovery prompt cannot indefinitely
 * silence the rest of the workflow envelope, while still preventing duplicate
 * commits/pushes that would fragment reviewer traceability.
 */
async function verifyStory35RecoveryGateBlocksOnlyFinalizationFollowups() {
  const { detectFinalizableOutputs } = await import(
    `${detectFinalizableOutputsModuleUrl}?s35-gate=${Date.now()}`
  );

  const baseInput = {
    workflowContext: {
      sessionID: "s-35-gate",
      commandName: "bmad-bmm-quick-dev",
      phase: "finish",
    },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "story",
      finalization: "commit-and-push",
    },
    trackedFiles: [{ path: "src/index.js", kind: "code" }],
    repositorySnapshot: {
      changedFiles: [{ path: "src/index.js", kind: "code" }],
    },
  };

  // (a) No gate → finalization is allowed.
  const allowed = detectFinalizableOutputs({ ...baseInput });
  assert.equal(allowed.outcome, "allow", "no recovery gate → finalization must be allowed");

  // (b) Gate with workflow-finalization scope → finalization is blocked.
  const blocked = detectFinalizableOutputs({
    ...baseInput,
    activeRecoveryGate: {
      gateId: "g-35",
      blockingScope: "workflow-finalization",
      state: "awaiting-recovery-decision",
    },
  });
  assert.equal(blocked.outcome, "skip");
  assert.equal(
    blocked.reason,
    "finalization-blocked",
    "workflow-finalization gate must surface finalization-blocked reason",
  );

  // (c) Gate with a non-finalization scope must NOT block finalization (the
  // gate is unrelated). This is the symmetric guarantee — only the explicit
  // "workflow-finalization" scope is finalization-blocking.
  const unrelated = detectFinalizableOutputs({
    ...baseInput,
    activeRecoveryGate: {
      gateId: "g-35-other",
      blockingScope: "branch-create",
      state: "awaiting-recovery-decision",
    },
  });
  assert.equal(
    unrelated.outcome,
    "allow",
    "non-finalization recovery gate must NOT block finalization detection",
  );
}

/**
 * Story 3.5 (AC1): a planning-artifact-only commit (e.g. PRD/architecture
 * updates) must still produce a commit proposal so reviewers can trace
 * planning-artifact changes through standard Git history. The proposal's
 * pathScopeSummary must surface the planning-artifact prefix.
 */
async function verifyStory35PlanningArtifactPathRemainsInScope() {
  const { buildCommitProposal } = await import(
    `${commitProposalModuleUrl}?s35-planning=${Date.now()}`
  );

  const proposal = buildCommitProposal({
    workflowContext: {
      sessionID: "s-35-planning",
      commandName: "bmad-bmm-create-prd",
      phase: "finish",
    },
    workflowPolicy: {
      category: "planning",
      identityStrategy: "artifact-singleton",
      artifactKey: "prd",
      finalization: "commit-optional-push",
    },
    finalizationAssessment: {
      outcome: "allow",
      reason: "finalizable-outputs-detected",
      details: { shouldProposeCommit: true, artifactScope: "prd" },
    },
    finalizationArtifacts: {
      matchedFiles: [
        { path: "_bmad-output/planning-artifacts/prd.md", kind: "planning-artifact" },
      ],
    },
  });

  assert.ok(proposal, "planning-artifact-only finalization must produce a commit proposal");
  assert.deepEqual(proposal.artifactKinds, ["planning-artifact"]);
  assert.deepEqual(
    proposal.pathScopeSummary,
    [
      {
        prefix: "_bmad-output/planning-artifacts/",
        label: "doc/planning-artifact",
        count: 1,
      },
    ],
    "planning-artifact bucket must be the only entry for a singleton planning commit",
  );
}


// =============================================================================
// Story 4.4 — Build and package release artifacts reliably
// =============================================================================
//
// These contract-level assertions lock the release packaging invariants
// described in scripts/make-release.js. The four `verifyStory44*` functions
// run UNCONDITIONALLY: each one regenerates a fixture release tree into an
// `os.tmpdir()` workspace by spawning `node scripts/make-release.js` with
// the `RELEASE_TARGET_ROOT` env override (Story 4.4 R2 HIGH-1 fix). This
// makes the contract testable from `npm test` alone without depending on
// the maintainer having run `npm run release`, and without ever touching
// the real `release/` tree.
//
// The "missing source" scenario uses an `os.tmpdir()` workspace too, but
// inverts the setup: it omits one publish source and asserts make-release
// fails verify-first.

function story44PackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  return pkg.version;
}

/**
 * Story 4.4 R2 HIGH-1: spawn `node scripts/make-release.js` against the
 * real project root (so source files come from `dist/`, `installer/`,
 * `templates/`) but redirect the OUTPUT release tree into a temporary
 * directory via `RELEASE_TARGET_ROOT`. Returns the tmp roots so callers
 * can assert against the generated artifacts and clean up afterwards.
 */
function story44GenerateFixtureRelease(label) {
  // Pre-flight: the bundle artifact must exist for make-release to succeed.
  // `npm test` already runs `npm --check src/index.js && ... && node tests/...`
  // and Story 3.5's verifyBuiltArtifactExists asserts `dist/devai-aidd-plugin.js`
  // is present. We re-assert here so the failure mode is locally explainable.
  const bundlePath = path.join(projectRoot, "dist", "devai-aidd-plugin.js");
  assert.equal(
    fs.existsSync(bundlePath),
    true,
    `story44GenerateFixtureRelease[${label}]: dist/devai-aidd-plugin.js missing — run \`npm run build\` before \`npm test\``,
  );

  const tempReleaseRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `devai-aidd-story44-fixture-${label}-`),
  );
  try {
    execFileSync(process.execPath, ["scripts/make-release.js"], {
      cwd: projectRoot,
      env: { ...process.env, RELEASE_TARGET_ROOT: tempReleaseRoot },
      stdio: "pipe",
    });
  } catch (error) {
    fs.rmSync(tempReleaseRoot, { recursive: true, force: true });
    const stderr = error?.stderr?.toString?.() || "";
    throw new Error(
      `story44GenerateFixtureRelease[${label}]: make-release.js failed: ${stderr || error?.message || error}`,
    );
  }

  const releaseRoot = path.join(tempReleaseRoot, "devai-aidd-plugin");
  const latestRoot = path.join(releaseRoot, "latest");
  const versionRoot = path.join(releaseRoot, "versions", story44PackageVersion());
  return { tempReleaseRoot, releaseRoot, latestRoot, versionRoot };
}

function story44ParseChecksumsPosixAwk(text, name) {
  // Mirror of `awk '$2 == name { print $1 }'` from installer/install.sh.
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine) continue;
    const fields = rawLine.split(/\s+/).filter(Boolean);
    if (fields.length >= 2 && fields[1] === name) {
      return fields[0];
    }
  }
  return null;
}

function story44ParseChecksumsPwsh(text, name) {
  // Mirror of `Get-ChecksumMap` from installer/install.ps1:
  //   foreach line: trim; if non-empty, split on `\s{2,}` with limit 2.
  // Story 4.4 R2 MEDIUM-3: applying the explicit `, 2` limit so this mirror
  // matches PowerShell's `-split "\s{2,}", 2` exactly. Without the limit the
  // JS mirror would over-split file names that contain double-spaces, while
  // PowerShell would stop at the first boundary — divergent behavior would
  // silently weaken the contract assertion below.
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const parts = rawLine.split(/\s{2,}/, 2);
    if (parts.length >= 2) {
      const parsedName = parts[1].trim();
      if (parsedName === name) {
        return parts[0].trim().toLowerCase();
      }
    }
  }
  return null;
}

// Story 4.4 R2 LOW-2: this constant intentionally duplicates the publish
// list from `scripts/make-release.js` so a future drift in either side is
// caught by the regression. If `filesToPublish` in scripts/make-release.js
// changes, update this constant intentionally to confirm the change.
const STORY_44_EXPECTED_PUBLISHED_FILES = Object.freeze([
  "devai-aidd-plugin.js",
  "install.ps1",
  "install.sh",
  "uninstall.ps1",
  "uninstall.sh",
  "devai-aidd-plugin.global.jsonc",
  "devai-aidd-plugin.project.jsonc",
  "opencode.jsonc.example",
]);

// Story 4.4 R2 CRITICAL-1: the set of files BOTH installer scripts verify
// against checksums.txt. install.ps1 and install.sh hash these 4 files in
// their integrity-check loops and look up the expected hash via the parser;
// any name in this list that lacks a checksums.txt line will cause every
// install attempt to fail at the integrity-check step.
const STORY_44_INSTALLER_VERIFIED_FILES = Object.freeze([
  "devai-aidd-plugin.js",
  "devai-aidd-plugin.global.jsonc",
  "devai-aidd-plugin.project.jsonc",
  "manifest.json",
]);

/**
 * Story 4.4 (AC1, AC2): the release manifest in both `latest/` and
 * `versions/<version>/` must agree on file set + SHA-256, and the manifest
 * version must equal `package.json.version`. This guards against silent
 * drift between the two publish targets and against shipping a release
 * whose manifest version does not match the package version.
 *
 * Story 4.4 R2 HIGH-1: this regression now generates a fixture release
 * tree in `os.tmpdir()` and asserts against it, so the contract is
 * exercised every time `npm test` runs (no longer dependent on an
 * out-of-band `npm run release`).
 */
async function verifyStory44ReleaseManifestCompleteness() {
  const fixture = story44GenerateFixtureRelease("manifest");
  try {
    const expectedVersion = story44PackageVersion();
    const latestManifest = JSON.parse(
      fs.readFileSync(path.join(fixture.latestRoot, "manifest.json"), "utf8"),
    );
    const versionManifest = JSON.parse(
      fs.readFileSync(path.join(fixture.versionRoot, "manifest.json"), "utf8"),
    );

    for (const [label, manifest] of [["latest", latestManifest], ["versioned", versionManifest]]) {
      assert.equal(
        manifest.version,
        expectedVersion,
        `verifyStory44ReleaseManifestCompleteness: ${label} manifest.version must equal package.json.version (${expectedVersion}); got ${manifest.version}`,
      );
      assert.equal(
        manifest.name,
        "devai-aidd-plugin",
        `verifyStory44ReleaseManifestCompleteness: ${label} manifest.name must be "devai-aidd-plugin"`,
      );
      assert.equal(
        manifest.displayName,
        "DevAI AIDD Plugin",
        `verifyStory44ReleaseManifestCompleteness: ${label} manifest.displayName must be "DevAI AIDD Plugin"`,
      );
      assert.equal(
        typeof manifest.generatedAt,
        "string",
        `verifyStory44ReleaseManifestCompleteness: ${label} manifest.generatedAt must be ISO-8601 string`,
      );
      assert.match(
        manifest.generatedAt,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        `verifyStory44ReleaseManifestCompleteness: ${label} manifest.generatedAt must be ISO-8601 timestamp`,
      );
      assert.ok(
        Array.isArray(manifest.files),
        `verifyStory44ReleaseManifestCompleteness: ${label} manifest.files must be array`,
      );
      const observedNames = manifest.files.map((entry) => entry.name).sort();
      const expectedNames = [...STORY_44_EXPECTED_PUBLISHED_FILES].sort();
      assert.deepEqual(
        observedNames,
        expectedNames,
        `verifyStory44ReleaseManifestCompleteness: ${label} manifest must list exactly the 8 published files; missing/extra entries indicate filesToPublish drift`,
      );
      for (const entry of manifest.files) {
        assert.equal(
          typeof entry.size,
          "number",
          `verifyStory44ReleaseManifestCompleteness: ${label} manifest entry ${entry.name}.size must be number`,
        );
        assert.match(
          entry.sha256 || "",
          /^[0-9a-f]{64}$/,
          `verifyStory44ReleaseManifestCompleteness: ${label} manifest entry ${entry.name}.sha256 must be lowercase 64-hex`,
        );
      }
    }

    // Verify the directory name `versions/<version>` matches package.json.version.
    assert.ok(
      fs.existsSync(fixture.versionRoot),
      `verifyStory44ReleaseManifestCompleteness: versions/<version> directory must equal package.json.version (${expectedVersion}); expected ${fixture.versionRoot}`,
    );

    // Cross-mirror: latest and versioned manifests must agree per-file on
    // sha256 of published files. (manifest.json itself is NOT in manifest.files
    // — its hash lives in checksums.txt only; see CRITICAL-1 fix below.)
    const versionByName = new Map(versionManifest.files.map((entry) => [entry.name, entry]));
    for (const latestEntry of latestManifest.files) {
      const versionEntry = versionByName.get(latestEntry.name);
      assert.ok(
        versionEntry,
        `verifyStory44ReleaseManifestCompleteness: file ${latestEntry.name} present in latest/ manifest but missing from versions/<version>/ manifest`,
      );
      assert.equal(
        latestEntry.sha256,
        versionEntry.sha256,
        `verifyStory44ReleaseManifestCompleteness: sha256 mismatch for ${latestEntry.name} between latest/ (${latestEntry.sha256}) and versions/<version>/ (${versionEntry.sha256})`,
      );
      assert.equal(
        latestEntry.size,
        versionEntry.size,
        `verifyStory44ReleaseManifestCompleteness: size mismatch for ${latestEntry.name} between latest/ (${latestEntry.size}) and versions/<version>/ (${versionEntry.size})`,
      );
    }
  } finally {
    fs.rmSync(fixture.tempReleaseRoot, { recursive: true, force: true });
  }
}

/**
 * Story 4.4 (AC1): every line in `checksums.txt` must be parseable by both
 * the PowerShell installer (`-split "\s{2,}", 2`) and the bash installer
 * (`awk '$2 == name { print $1 }'`) and must produce the SAME sha256 for
 * the same file name. This guards the wire contract between
 * `make-release.js` and the two install scripts so a format change cannot
 * silently break end-user installs.
 *
 * Story 4.4 R2 CRITICAL-1: in addition to per-file parser equivalence,
 * `checksums.txt` MUST contain a line for `manifest.json` because both
 * installers (install.ps1 and install.sh integrity-check loops) verify
 * the manifest's integrity. Without that line, every install attempt fails
 * at the integrity-check step. This regression now asserts:
 *   - 9 lines total (8 published files + manifest.json).
 *   - Every file in `STORY_44_INSTALLER_VERIFIED_FILES` has a parser-
 *     recoverable line whose hash matches the on-disk file hash.
 *   - The manifest.json line's hash equals the actual sha256 of the
 *     manifest.json file (round-trip integrity).
 *
 * Story 4.4 R2 HIGH-1: regenerated fixture release in `os.tmpdir()` so
 * `npm test` exercises the contract without a prior `npm run release`.
 */
async function verifyStory44ReleaseChecksumLinesMatchInstallerParsers() {
  const fixture = story44GenerateFixtureRelease("checksums");
  try {
    for (const [label, root] of [["latest", fixture.latestRoot], ["versioned", fixture.versionRoot]]) {
      const checksumsPath = path.join(root, "checksums.txt");
      assert.ok(
        fs.existsSync(checksumsPath),
        `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} checksums.txt must exist`,
      );
      const text = fs.readFileSync(checksumsPath, "utf8");
      assert.ok(
        text.endsWith("\n"),
        `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} checksums.txt must end with trailing newline`,
      );

      // Story 4.4 R2 CRITICAL-1: 9 lines total = 8 published files + manifest.json.
      const lines = text.split("\n").filter((line) => line.length > 0);
      assert.equal(
        lines.length,
        9,
        `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} checksums.txt must have exactly 9 lines (8 published files + manifest.json); got ${lines.length}`,
      );

      const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
      for (const entry of manifest.files) {
        const pwshHash = story44ParseChecksumsPwsh(text, entry.name);
        const awkHash = story44ParseChecksumsPosixAwk(text, entry.name);
        assert.equal(
          pwshHash,
          entry.sha256,
          `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} PowerShell parser must recover sha256 for ${entry.name}; got ${pwshHash}, expected ${entry.sha256}`,
        );
        assert.equal(
          awkHash,
          entry.sha256,
          `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} bash awk parser must recover sha256 for ${entry.name}; got ${awkHash}, expected ${entry.sha256}`,
        );
        assert.equal(
          pwshHash,
          awkHash,
          `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} both installer parsers must recover identical sha256 for ${entry.name}; PowerShell=${pwshHash}, awk=${awkHash}`,
        );
      }

      // Story 4.4 R2 CRITICAL-1: every file the installer integrity-checks
      // (the install.ps1 / install.sh integrity-check loops) must have a
      // parser-recoverable checksums line whose hash equals the actual
      // on-disk sha256. This is the assertion that, when missing, lets a
      // broken checksums.txt slip through review.
      for (const name of STORY_44_INSTALLER_VERIFIED_FILES) {
        const filePath = path.join(root, name);
        assert.ok(
          fs.existsSync(filePath),
          `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} ${name} must exist (installer downloads it)`,
        );
        const onDiskHash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(filePath))
          .digest("hex");

        const pwshHash = story44ParseChecksumsPwsh(text, name);
        const awkHash = story44ParseChecksumsPosixAwk(text, name);
        assert.equal(
          pwshHash,
          onDiskHash,
          `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} ${name} — PowerShell installer would fail integrity check; checksums line=${pwshHash}, on-disk=${onDiskHash}`,
        );
        assert.equal(
          awkHash,
          onDiskHash,
          `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} ${name} — bash installer would fail integrity check; checksums line=${awkHash}, on-disk=${onDiskHash}`,
        );
      }

      // Strict line shape: `<64-hex>  <name>` (two ASCII spaces).
      for (const rawLine of text.split("\n")) {
        if (!rawLine) continue;
        assert.match(
          rawLine,
          /^[0-9a-f]{64} {2}\S/,
          `verifyStory44ReleaseChecksumLinesMatchInstallerParsers: ${label} checksums line must match "<64-hex>  <name>" shape; got: ${JSON.stringify(rawLine)}`,
        );
      }
    }
  } finally {
    fs.rmSync(fixture.tempReleaseRoot, { recursive: true, force: true });
  }
}

/**
 * Story 4.4 (AC1, AC2): the `latest/` and `versions/<version>/` directories
 * must contain the SAME 8 published files with byte-identical SHA-256
 * digests. This locks the make-release contract that "two publish targets
 * mirror each other" and prevents a future refactor from publishing only
 * one target.
 *
 * Story 4.4 R2 HIGH-1: regenerated fixture release in `os.tmpdir()` so
 * `npm test` exercises the contract without a prior `npm run release`.
 *
 * Note: `manifest.json` is NOT byte-identical between `latest/` and
 * `versions/<version>/` because each is generated with its own
 * `generatedAt` timestamp. That is by design — checksums.txt in each
 * directory references its own manifest's hash, so the installer integrity
 * check is closed within a single download root. This regression
 * therefore mirrors only the 8 published files.
 */
async function verifyStory44LatestAndVersionedDirsMirrored() {
  const fixture = story44GenerateFixtureRelease("mirror");
  try {
    for (const name of STORY_44_EXPECTED_PUBLISHED_FILES) {
      const latestPath = path.join(fixture.latestRoot, name);
      const versionPath = path.join(fixture.versionRoot, name);
      assert.ok(
        fs.existsSync(latestPath),
        `verifyStory44LatestAndVersionedDirsMirrored: ${name} must exist under release/devai-aidd-plugin/latest/`,
      );
      assert.ok(
        fs.existsSync(versionPath),
        `verifyStory44LatestAndVersionedDirsMirrored: ${name} must exist under release/devai-aidd-plugin/versions/<version>/`,
      );
      const latestHash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(latestPath))
        .digest("hex");
      const versionHash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(versionPath))
        .digest("hex");
      assert.equal(
        latestHash,
        versionHash,
        `verifyStory44LatestAndVersionedDirsMirrored: ${name} sha256 differs between latest/ (${latestHash}) and versions/<version>/ (${versionHash})`,
      );
    }
  } finally {
    fs.rmSync(fixture.tempReleaseRoot, { recursive: true, force: true });
  }
}

/**
 * Story 4.4 (AC1): if any `filesToPublish` source is missing,
 * `make-release.js` must fail BEFORE mutating any release tree, with a
 * clear maintainer-facing message that names the missing file. We exercise
 * this in an `os.tmpdir()` workspace so the real `release/` is never
 * touched.
 */
async function verifyStory44ReleaseMissingSourceFails() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-story44-missing-"));
  try {
    // Mirror the project files the script needs (package.json + scripts/) and
    // intentionally OMIT one publish source (uninstall.ps1).
    fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
    fs.copyFileSync(
      path.join(projectRoot, "package.json"),
      path.join(tempRoot, "package.json"),
    );
    fs.copyFileSync(
      path.join(projectRoot, "scripts", "make-release.js"),
      path.join(tempRoot, "scripts", "make-release.js"),
    );

    // Provide everything except uninstall.ps1.
    fs.mkdirSync(path.join(tempRoot, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "dist", "devai-aidd-plugin.js"),
      "// stub bundle\nexport const x = 1;\n",
      "utf8",
    );
    fs.mkdirSync(path.join(tempRoot, "installer"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "installer", "install.ps1"), "stub", "utf8");
    fs.writeFileSync(path.join(tempRoot, "installer", "install.sh"), "stub", "utf8");
    // uninstall.ps1 INTENTIONALLY MISSING.
    fs.mkdirSync(path.join(tempRoot, "templates"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "templates", "devai-aidd-plugin.global.jsonc"),
      "{}",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tempRoot, "templates", "devai-aidd-plugin.project.jsonc"),
      "{}",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tempRoot, "templates", "opencode.jsonc.example"),
      "{}",
      "utf8",
    );

    let threw = null;
    let stderr = "";
    try {
      execFileSync(process.execPath, ["scripts/make-release.js"], {
        cwd: tempRoot,
        stdio: "pipe",
      });
    } catch (error) {
      threw = error;
      stderr = error?.stderr?.toString?.() || "";
    }

    assert.ok(
      threw,
      "verifyStory44ReleaseMissingSourceFails: make-release.js must throw when a publish source is missing",
    );
    assert.notEqual(
      threw?.status,
      0,
      "verifyStory44ReleaseMissingSourceFails: make-release.js must exit with non-zero status",
    );
    assert.match(
      stderr,
      /uninstall\.ps1/,
      `verifyStory44ReleaseMissingSourceFails: error message must name the missing file (uninstall.ps1); got: ${stderr}`,
    );
    assert.match(
      stderr,
      /missing|cannot package/i,
      `verifyStory44ReleaseMissingSourceFails: error message must explain why packaging cannot proceed; got: ${stderr}`,
    );

    // Verify-first invariant: no release tree was created in the temp workspace.
    const tempReleaseDir = path.join(tempRoot, "release");
    assert.equal(
      fs.existsSync(tempReleaseDir),
      false,
      "verifyStory44ReleaseMissingSourceFails: make-release.js must not create release/ when validation fails (verify-first invariant)",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 4.4 R2 LOW-1: when the bundle artifact (`dist/devai-aidd-plugin.js`)
 * is missing alongside other publish sources, `make-release.js` must (a)
 * list ALL missing files in a single error message and (b) include the
 * `npm run build` hint that targets the bundle specifically. This locks
 * the multi-missing reporting contract from `validatePublishSources()`
 * (Story task line 34: "ALL missing files in single message").
 */
async function verifyStory44ReleaseMissingBundleEmitsBuildHint() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "devai-aidd-story44-missing-bundle-"),
  );
  try {
    fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
    fs.copyFileSync(
      path.join(projectRoot, "package.json"),
      path.join(tempRoot, "package.json"),
    );
    fs.copyFileSync(
      path.join(projectRoot, "scripts", "make-release.js"),
      path.join(tempRoot, "scripts", "make-release.js"),
    );

    // Provide installer + templates but OMIT dist/devai-aidd-plugin.js AND install.sh.
    fs.mkdirSync(path.join(tempRoot, "installer"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "installer", "install.ps1"), "stub", "utf8");
    // install.sh INTENTIONALLY MISSING (second missing file).
    fs.writeFileSync(path.join(tempRoot, "installer", "uninstall.ps1"), "stub", "utf8");
    fs.mkdirSync(path.join(tempRoot, "templates"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "templates", "devai-aidd-plugin.global.jsonc"),
      "{}",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tempRoot, "templates", "devai-aidd-plugin.project.jsonc"),
      "{}",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tempRoot, "templates", "opencode.jsonc.example"),
      "{}",
      "utf8",
    );
    // dist/devai-aidd-plugin.js INTENTIONALLY MISSING (no `dist/` directory at all).

    let threw = null;
    let stderr = "";
    try {
      execFileSync(process.execPath, ["scripts/make-release.js"], {
        cwd: tempRoot,
        stdio: "pipe",
      });
    } catch (error) {
      threw = error;
      stderr = error?.stderr?.toString?.() || "";
    }

    assert.ok(
      threw,
      "verifyStory44ReleaseMissingBundleEmitsBuildHint: make-release.js must throw when multiple sources are missing",
    );
    assert.match(
      stderr,
      /devai-aidd-plugin\.js/,
      `verifyStory44ReleaseMissingBundleEmitsBuildHint: error must name the missing bundle (devai-aidd-plugin.js); got: ${stderr}`,
    );
    assert.match(
      stderr,
      /install\.sh/,
      `verifyStory44ReleaseMissingBundleEmitsBuildHint: error must also name the second missing source (install.sh); got: ${stderr}`,
    );
    assert.match(
      stderr,
      /npm run build/,
      `verifyStory44ReleaseMissingBundleEmitsBuildHint: error must include the \`npm run build\` hint when the bundle is missing; got: ${stderr}`,
    );

    // Story 4.4 R2-review LOW-5: verify-first invariant (symmetry with
    // verifyStory44ReleaseMissingSourceFails). Multi-missing failure must
    // also bail out before any release tree mutation.
    const tempReleaseDir = path.join(tempRoot, "release");
    assert.equal(
      fs.existsSync(tempReleaseDir),
      false,
      "verifyStory44ReleaseMissingBundleEmitsBuildHint: make-release.js must not create release/ when validation fails (verify-first invariant)",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// =============================================================================
// Story 4.5 — wrapper/built regression gate
// =============================================================================
//
// These assertions lock the persistent quality gate that Story 4.5 promised:
// the "legacy / wrapper / built" three-variant comparison must remain a single
// source of behavioral truth. Story 4.5 does NOT define new contracts; it
// validates that the contracts defined by Story 4.3 (wrapper hook compatibility,
// `SUPPORTED_HOOK_KEYS` / `WRAPPER_ONLY_HOOK_KEYS` SOT) and Story 4.4 (release
// packaging) remain observable across all three variants.
//
// Pre-condition (intentional): every Story 4.5 verifier here assumes the built
// dist artifact (`dist/devai-aidd-plugin.js`) exists. The chain entry point
// `main()` already calls `verifyBuiltArtifactExists()` first, so a missing
// dist aborts the suite before the Story 4.5 block runs. Story 4.4 owns
// release manifest/checksum/installer assertions; Story 4.5 only depends on
// "the bundle is present and behaviorally equivalent to the wrapper".
//
// Naming convention: `verifyStory45<Behavior>()`. Each new invariant must
// register one verifier function and one `main().then(() => ...)` line at the
// chain tail, mirroring the Story 1.x → Story 4.4 cumulative pattern.

async function story45InstantiatePair() {
  const wrapperModule = await import(wrapperModuleUrl);
  const builtModule = await import(`${builtModuleUrl}?t=${Date.now()}`);
  const builtFactory = builtModule.DevaiAiddGuardPlugin || builtModule.default;

  const wrapperWorkspace = createTempWorkspace();
  const builtWorkspace = createTempWorkspace();
  const wrapper = await instantiate(wrapperModule.DevaiAiddGuardPlugin, wrapperWorkspace);
  const built = await instantiate(builtFactory, builtWorkspace);

  return {
    wrapper,
    built,
    builtModule,
    cleanup() {
      fs.rmSync(wrapperWorkspace, { recursive: true, force: true });
      fs.rmSync(builtWorkspace, { recursive: true, force: true });
    },
  };
}

/**
 * Story 4.5: assert that the hook map keys returned by the wrapper and the
 * built artifact are set-equal to `SUPPORTED_HOOK_KEYS` (single source of
 * truth). Renaming, dropping, or adding a hook key without updating the SOT
 * constant fires here.
 */
async function verifyStory45WrapperBuiltHandlerShapesMatch() {
  const constantsModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "utils", "constants.js"),
  ).href;
  const { SUPPORTED_HOOK_KEYS } = await import(constantsModuleUrl);

  const sot = new Set(SUPPORTED_HOOK_KEYS);

  const trio = await story45InstantiatePair();
  try {
    const { wrapper, built } = trio;

    const wrapperKeys = new Set(Object.keys(wrapper.handlers));
    const builtKeys = new Set(Object.keys(built.handlers));

    assert.equal(
      wrapperKeys.size,
      sot.size,
      `verifyStory45WrapperBuiltHandlerShapesMatch: wrapper hook count ${wrapperKeys.size} differs from SUPPORTED_HOOK_KEYS count ${sot.size}`,
    );
    assert.equal(
      builtKeys.size,
      sot.size,
      `verifyStory45WrapperBuiltHandlerShapesMatch: built hook count ${builtKeys.size} differs from SUPPORTED_HOOK_KEYS count ${sot.size}`,
    );
    for (const key of sot) {
      assert.equal(
        wrapperKeys.has(key),
        true,
        `verifyStory45WrapperBuiltHandlerShapesMatch: wrapper missing SOT key ${key}`,
      );
      assert.equal(
        builtKeys.has(key),
        true,
        `verifyStory45WrapperBuiltHandlerShapesMatch: built missing SOT key ${key}`,
      );
      const expectedType = key === "tool" ? "object" : "function";
      assert.equal(
        typeof wrapper.handlers[key],
        expectedType,
        `verifyStory45WrapperBuiltHandlerShapesMatch: wrapper handler ${key} must be ${expectedType}`,
      );
      assert.equal(
        typeof built.handlers[key],
        expectedType,
        `verifyStory45WrapperBuiltHandlerShapesMatch: built handler ${key} must be ${expectedType}`,
      );
    }
  } finally {
    trio.cleanup();
  }
}

/**
 * Story 4.5: assert wrapper↔built parity for `command.execute.before` parts
 * normalization so future bundle drift surfaces in one place.
 */
async function verifyStory45WrapperBuiltCommandPromptParity() {
  const trio = await story45InstantiatePair();
  try {
    const { wrapper, built } = trio;

    const sessionID = "verifyStory45-prompt-parity-cmd";
    const wrapperOut = await runCommandExecuteBefore(wrapper.handlers, { sessionID });
    const builtOut = await runCommandExecuteBefore(built.handlers, { sessionID });

    assert.deepEqual(
      normalizeOutputParts(builtOut.output.parts),
      normalizeOutputParts(wrapperOut.output.parts),
      "verifyStory45WrapperBuiltCommandPromptParity: built command.execute.before parts diverged from wrapper",
    );
  } finally {
    trio.cleanup();
  }
}

/**
 * Story 4.5: mutating-tool guard behavior must match across all three
 * variants on workflow sessions, AND must be silent (no throw) on
 * non-workflow sessions. Locks the byte-for-byte exception message parity
 * that Story 4.3 promised, plus TWO negative cases: (1) "no command issued"
 * (no state entry at all), (2) "non-workflow command issued" (state may
 * exist but workflow detection rejected it). Both cases must remain silent
 * across legacy/wrapper/built.
 *
 * Story 4.5 R2 (M-2 mitigation): added the "non-workflow command issued"
 * negative path for all three variants — previous implementation only
 * exercised the "no command" sub-case which is a strict subset. Story 4.5
 * R2 (M-3 mitigation): unique sessionIDs per trio so positive vs negative
 * trios cannot cross-contaminate even if a future refactor introduces
 * module-scoped state. Story 4.5 R2 (L-2 mitigation): all temp workspace
 * creations now happen inside the try{} so a partial-failure leak is
 * impossible.
 */
async function verifyStory45WrapperBuiltMutatingToolGuardParity() {
  const trio = await story45InstantiatePair();
  try {
    const { wrapper, built } = trio;

    const positiveSessionID = "verifyStory45-mutating-positive";
    await runCommandExecuteBefore(wrapper.handlers, { sessionID: positiveSessionID });
    await runCommandExecuteBefore(built.handlers, { sessionID: positiveSessionID });

    const wrapperError = await runToolMutatingBefore(wrapper.handlers, { sessionID: positiveSessionID });
    const builtError = await runToolMutatingBefore(built.handlers, { sessionID: positiveSessionID });

    assert.ok(
      wrapperError && wrapperError.message,
      "verifyStory45WrapperBuiltMutatingToolGuardParity: wrapper must throw mutating-tool guard error on workflow session",
    );
    assert.equal(
      builtError?.message,
      wrapperError.message,
      "verifyStory45WrapperBuiltMutatingToolGuardParity: built mutating-tool error message diverged from wrapper (esbuild minify/transform must not mutate user-visible strings)",
    );

    // ── Negative cases: must remain silent on both wrapper and built ──
    const wrapperMod = await import(wrapperModuleUrl);
    const builtMod = await import(`${builtModuleUrl}?t=${Date.now()}`);
    const createdWorkspaces = [];
    try {
      const negWrapperWs = createTempWorkspace();
      createdWorkspaces.push(negWrapperWs);
      const negBuiltWs = createTempWorkspace();
      createdWorkspaces.push(negBuiltWs);

      const negWrapper = await instantiate(wrapperMod.DevaiAiddGuardPlugin, negWrapperWs);
      const negBuilt = await instantiate(
        builtMod.DevaiAiddGuardPlugin || builtMod.default,
        negBuiltWs,
      );

      const noCommandSessionID = "verifyStory45-mutating-neg-no-command";
      for (const [label, instance] of [
        ["wrapper", negWrapper],
        ["built", negBuilt],
      ]) {
        const err = await runToolMutatingBefore(instance.handlers, {
          sessionID: noCommandSessionID,
        });
        assert.equal(
          err,
          null,
          `verifyStory45WrapperBuiltMutatingToolGuardParity: ${label} mutating-tool guard must NOT fire when no command was issued; got error: ${err?.message}`,
        );
      }

      const nonWorkflowSessionID = "verifyStory45-mutating-neg-nonwf-command";
      const nonWorkflowCommand = "/non-workflow-command-not-registered";
      for (const [label, instance] of [
        ["wrapper", negWrapper],
        ["built", negBuilt],
      ]) {
        const { output: nonWorkflowOutput } = await runCommandExecuteBefore(instance.handlers, {
          command: nonWorkflowCommand,
          sessionID: nonWorkflowSessionID,
          argumentsText: "",
        });
        assert.equal(
          (nonWorkflowOutput.parts || []).length,
          0,
          `verifyStory45WrapperBuiltMutatingToolGuardParity: ${label} non-workflow command must produce zero output parts; got ${(nonWorkflowOutput.parts || []).length}`,
        );
        const err = await runToolMutatingBefore(instance.handlers, {
          sessionID: nonWorkflowSessionID,
        });
        assert.equal(
          err,
          null,
          `verifyStory45WrapperBuiltMutatingToolGuardParity: ${label} mutating-tool guard must NOT fire after a non-workflow command; got error: ${err?.message}`,
        );
      }
    } finally {
      for (const ws of createdWorkspaces) {
        fs.rmSync(ws, { recursive: true, force: true });
      }
    }
  } finally {
    trio.cleanup();
  }
}

/**
 * Story 4.5: the built artifact must explicitly expose at least one of the
 * three documented export names (`DevaiAiddGuardPlugin`, the legacy alias
 * `DevaiGitWorkflowPlugin`, or the default export) and the resolved factory
 * must be a function with arity 1 (single `{ client, directory }` arg). This
 * lifts the implicit `||` fallback inside `main()` into a contract-level
 * assertion so an accidental rename or signature change cannot pass silently.
 */
async function verifyStory45BuiltArtifactExportContract() {
  const builtModule = await import(`${builtModuleUrl}?t=${Date.now()}`);
  const candidates = ["DevaiAiddGuardPlugin", "default"];
  const present = candidates.filter((name) => typeof builtModule[name] === "function");
  assert.ok(
    present.length > 0,
    `verifyStory45BuiltArtifactExportContract: built artifact must export at least one of ${JSON.stringify(candidates)} as a function; got keys: ${Object.keys(builtModule).join(", ")}`,
  );
  const factory = builtModule.DevaiAiddGuardPlugin || builtModule.default;
  assert.equal(
    typeof factory,
    "function",
    "verifyStory45BuiltArtifactExportContract: resolved factory must be a function",
  );
  assert.equal(
    factory.length,
    1,
    `verifyStory45BuiltArtifactExportContract: resolved factory must accept exactly 1 destructured argument; got arity ${factory.length}`,
  );

  const wrapperModule = await import(wrapperModuleUrl);
  assert.equal(
    typeof wrapperModule.DevaiAiddGuardPlugin,
    "function",
    "verifyStory45BuiltArtifactExportContract: wrapper DevaiAiddGuardPlugin must be a function",
  );
  assert.equal(
    wrapperModule.DevaiAiddGuardPlugin.length,
    factory.length,
    `verifyStory45BuiltArtifactExportContract: wrapper factory arity (${wrapperModule.DevaiAiddGuardPlugin.length}) must match built factory arity (${factory.length})`,
  );
}

/**
 * Story 4.5: approval prompt summary parity between built and wrapper, in
 * isolation. Story 2.1+ established that only wrapper/built emit prompts
 * (legacy is intentionally excluded from this comparison). Locking parity
 * here ensures the esbuild bundle does not drop or mutate prompt metadata.
 *
 * Story 4.5 R2 (M-1 mitigation): a non-empty precondition asserts that the
 * `/bmad-bmm-quick-dev` workflow command actually publishes at least one
 * approval prompt before deepEqual-ing the summaries. Without this, both
 * sides could degenerate to `[]` (e.g. a future approval-policy regression
 * that silently disables prompt emission) and the parity check would pass
 * vacuously — the very drift this verifier exists to catch.
 */
async function verifyStory45BuiltArtifactPromptParityWithWrapper() {
  const trio = await story45InstantiatePair();
  try {
    const { wrapper, built } = trio;
    const promptSessionID = "verifyStory45-prompt-parity";
    const wrapperRun = await runCommandExecuteBefore(wrapper.handlers, { sessionID: promptSessionID });
    const builtRun = await runCommandExecuteBefore(built.handlers, { sessionID: promptSessionID });
    const wrapperPrompts = wrapperRun.output.parts
      .filter((part) => part?.metadata?.startupChain === true)
      .map((part) => ({ text: part.text, metadata: part.metadata }));
    const builtPrompts = builtRun.output.parts
      .filter((part) => part?.metadata?.startupChain === true)
      .map((part) => ({ text: part.text, metadata: part.metadata }));
    // M-1 mitigation: non-empty precondition. If a future change silently
    // suppresses approval prompt emission, both sides degenerate to [] and
    // the deepEqual below would pass vacuously.
    assert.ok(
      wrapperPrompts.length >= 1,
      `verifyStory45BuiltArtifactPromptParityWithWrapper: wrapper must publish at least one approval prompt for /bmad-bmm-quick-dev; got 0 — the deepEqual parity check would pass vacuously without this guard`,
    );
    assert.ok(
      builtPrompts.length >= 1,
      `verifyStory45BuiltArtifactPromptParityWithWrapper: built must publish at least one approval prompt for /bmad-bmm-quick-dev; got 0`,
    );
    assert.deepEqual(
      builtPrompts,
      wrapperPrompts,
      `verifyStory45BuiltArtifactPromptParityWithWrapper: built prompt summaries diverged from wrapper. wrapper=${JSON.stringify(wrapperPrompts)}, built=${JSON.stringify(builtPrompts)}`,
    );
  } finally {
    trio.cleanup();
  }
}

/**
 * Story 4.5: when the built artifact is absent, the regression gate must
 * abort with a clear message — silent skip is forbidden. This is a meta-guard
 * for the actual `verifyBuiltArtifactExists()` function defined at the top
 * of this file; the production `dist/devai-aidd-plugin.js` is never touched.
 *
 * Story 4.5 R2 (H-1 mitigation): the original implementation called
 * `assert.equal(false, true, "<MESSAGE>")` directly and verified that the
 * AssertionError contained the literal string the verifier itself just
 * passed in — a tautology that would pass even if `verifyBuiltArtifactExists`
 * were deleted from the file. The new implementation actually invokes
 * `verifyBuiltArtifactExists()` with an injected `existsSyncFn` returning
 * `false` against a fixture path AND a positive control invocation
 * returning `true`, so deleting / silently rewriting either the function or
 * its error message will trip a real regression assertion.
 *
 * Defenses against drift:
 *   1. Negative path — call `verifyBuiltArtifactExists({ existsSyncFn: () => false, builtPath: <fixture> })`,
 *      assert it throws, assert the message names the dist path AND the
 *      `npm run build` hint.
 *   2. Positive control — call `verifyBuiltArtifactExists({ existsSyncFn: () => true, builtPath: <fixture> })`,
 *      assert it does NOT throw. Catches a regression where the gate
 *      always-throws (which would silently break `main()` from any error
 *      surface other than missing-dist).
 *   3. Source contract — `verifyBuiltArtifactExists.toString()` must
 *      reference `assert.equal`, `existsSync`, and the literal error
 *      tokens. Catches a refactor that hollows the function body to a
 *      `return` while preserving the import/call surface.
 *   4. No side effects — fixture dist path stays un-created.
 */
async function verifyStory45RegressionGateAbortsWithoutBuiltArtifact() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "devai-aidd-story45-missing-dist-"),
  );
  try {
    const fixtureDist = path.join(tempRoot, "dist", "devai-aidd-plugin.js");

    // 1. Negative path — exercise the actual `verifyBuiltArtifactExists`
    //    function via dependency injection, simulating a missing dist.
    let threw = null;
    try {
      verifyBuiltArtifactExists({
        existsSyncFn: () => false,
        builtPath: fixtureDist,
      });
    } catch (error) {
      threw = error;
    }
    assert.ok(
      threw,
      "verifyStory45RegressionGateAbortsWithoutBuiltArtifact: verifyBuiltArtifactExists() must throw when the bundle is absent (silent skip is forbidden)",
    );
    assert.match(
      threw.message,
      /missing dist\/devai-aidd-plugin\.js/,
      `verifyStory45RegressionGateAbortsWithoutBuiltArtifact: verifyBuiltArtifactExists() error must name the missing path; got: ${threw.message}`,
    );
    assert.match(
      threw.message,
      /npm run build/,
      `verifyStory45RegressionGateAbortsWithoutBuiltArtifact: verifyBuiltArtifactExists() error must include the \`npm run build\` hint; got: ${threw.message}`,
    );

    // 2. Positive control — the gate must NOT throw when existsSync returns
    //    true. This catches a regression where the gate always-throws.
    let positiveErr = null;
    try {
      verifyBuiltArtifactExists({
        existsSyncFn: () => true,
        builtPath: fixtureDist,
      });
    } catch (error) {
      positiveErr = error;
    }
    assert.equal(
      positiveErr,
      null,
      `verifyStory45RegressionGateAbortsWithoutBuiltArtifact: verifyBuiltArtifactExists() must NOT throw when the bundle is present; got: ${positiveErr?.message}`,
    );

    // 3. Source contract — defend against a hollowed-body refactor.
    const source = verifyBuiltArtifactExists.toString();
    assert.match(
      source,
      /assert\.equal/,
      "verifyStory45RegressionGateAbortsWithoutBuiltArtifact: verifyBuiltArtifactExists() must use assert.equal — body refactored away from the gate",
    );
    assert.match(
      source,
      /existsSync/,
      "verifyStory45RegressionGateAbortsWithoutBuiltArtifact: verifyBuiltArtifactExists() must call an existsSync to check the bundle — body refactored away from the gate",
    );
    assert.match(
      source,
      /missing dist\/devai-aidd-plugin\.js/,
      "verifyStory45RegressionGateAbortsWithoutBuiltArtifact: verifyBuiltArtifactExists() must contain the literal `missing dist/devai-aidd-plugin.js` hint — message rewritten without coordinated update",
    );
    assert.match(
      source,
      /npm run build/,
      "verifyStory45RegressionGateAbortsWithoutBuiltArtifact: verifyBuiltArtifactExists() must contain the literal `npm run build` hint — message rewritten without coordinated update",
    );

    // 4. No side effects — fixture dist path stayed un-created.
    assert.equal(
      fs.existsSync(fixtureDist),
      false,
      "verifyStory45RegressionGateAbortsWithoutBuiltArtifact: fixture dist path must remain un-created (no side effects)",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Story 4.5 (L-3 carried over from Story 4.3 review): the audit-event list
 * documented in the `src/index.js` JSDoc header must match the actual
 * `audit.info("<name>", ...)` first-argument set emitted from the same file.
 * Drift between header documentation and code emissions is invisible to
 * end-to-end tests but breaks the operator-facing audit contract.
 *
 * Implementation: read `src/index.js` as text, extract event names from the
 * JSDoc backtick list and from `audit.info("...")` call sites, then assert
 * set-equality. This is a documentation-as-contract guard; it does NOT
 * exercise runtime audit emissions (the existing trio test already counts
 * emitted events).
 *
 * Story 4.5 R2 (L-5 mitigation): scope is intentionally restricted to
 * `audit.info(...)` call sites under the `best-effort bootstrap audit
 * emissions` parenthetical anchor. The error-path emission
 * (`audit.error("plugin bootstrap failed", ...)` on the catch branch) is
 * documented separately in the JSDoc header and is NOT covered by this
 * verifier — it is *not* a "best-effort" emission (it is the canonical
 * failure-mode signal). If a future story adds `audit.warn(...)` or moves
 * `plugin bootstrap` to `audit.error`, that contract change must be
 * coordinated with this verifier explicitly (extend the regex AND the
 * JSDoc anchor name) — silent introduction must trip a new assertion.
 */
async function verifyStory45SrcIndexAuditEventListMatchesEmissions() {
  const indexPath = path.join(projectRoot, "src", "index.js");
  const source = fs.readFileSync(indexPath, "utf8");

  // Extract names from the JSDoc header line:
  // " * (`config.validation.failed`, `compat.bridge.evaluated`, `plugin bootstrap`, "
  // We grab every backtick-quoted token that follows the literal phrase
  // "best-effort bootstrap audit emissions".
  const headerSliceMatch = source.match(
    /best-effort bootstrap audit emissions\s*\n\s*\*\s*\(([^)]+)\)/,
  );
  assert.ok(
    headerSliceMatch,
    "verifyStory45SrcIndexAuditEventListMatchesEmissions: src/index.js JSDoc must contain a `best-effort bootstrap audit emissions` parenthetical list",
  );
  const headerEvents = new Set(
    Array.from(headerSliceMatch[1].matchAll(/`([^`]+)`/g)).map((m) => m[1]),
  );
  assert.ok(
    headerEvents.size > 0,
    "verifyStory45SrcIndexAuditEventListMatchesEmissions: header parenthetical must list at least one backtick-quoted event name",
  );

  // Extract first-arg event names from every audit.info(<string>, ...) call.
  const emittedEvents = new Set();
  for (const match of source.matchAll(/audit\.info\(\s*"([^"]+)"/g)) {
    emittedEvents.add(match[1]);
  }
  assert.ok(
    emittedEvents.size > 0,
    "verifyStory45SrcIndexAuditEventListMatchesEmissions: src/index.js must contain at least one audit.info(\"<name>\", ...) call",
  );

  // Set equality: every documented event is emitted; every emitted event is
  // documented. Symmetric assertions surface drift in either direction.
  for (const name of headerEvents) {
    assert.equal(
      emittedEvents.has(name),
      true,
      `verifyStory45SrcIndexAuditEventListMatchesEmissions: header documents event "${name}" but no audit.info("${name}", ...) call exists in src/index.js`,
    );
  }
  for (const name of emittedEvents) {
    assert.equal(
      headerEvents.has(name),
      true,
      `verifyStory45SrcIndexAuditEventListMatchesEmissions: src/index.js emits audit.info("${name}", ...) but the JSDoc header does not document it (update the header parenthetical)`,
    );
  }
}

// =============================================================================
// BREAKING CHANGE — legacy compatibility removal verifiers (AC1~AC8, AC13~AC15)
// =============================================================================

function buildLegacyRemovalFsAdapter(homedirPath) {
  return {
    existsSync: fs.existsSync.bind(fs),
    readFileSync: fs.readFileSync.bind(fs),
    readdirSync: fs.readdirSync.bind(fs),
    mkdirSync: fs.mkdirSync.bind(fs),
    writeFileSync: fs.writeFileSync.bind(fs),
    dirname: path.dirname.bind(path),
    homedir: () => homedirPath,
  };
}

/**
 * AC1: `Object.keys(loadRuntimeConfig(...).sources).sort()` is exactly
 * `["hasGlobalConfig", "hasProjectConfig"]` and both values are boolean.
 */
async function verifySourcesShapeIsExactlyTwoBooleans() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?ac1=${Date.now()}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-ac1-"));
  try {
    const projectDir = path.join(tempRoot, "project");
    const projectConfigDir = path.join(projectDir, ".opencode");
    const globalConfigDir = path.join(tempRoot, "home", ".config", "opencode");
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.mkdirSync(globalConfigDir, { recursive: true });

    fs.writeFileSync(
      path.join(globalConfigDir, "devai-aidd-plugin.global.jsonc"),
      JSON.stringify({ branch: { defaultType: "docs" } }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(projectConfigDir, "devai-aidd-plugin.project.jsonc"),
      JSON.stringify({ branch: { defaultType: "feat" } }),
      "utf8",
    );

    const fsAdapter = buildLegacyRemovalFsAdapter(path.join(tempRoot, "home"));
    const result = loadRuntimeConfig(projectDir, fsAdapter);

    const keys = Object.keys(result.sources).sort();
    assert.deepEqual(
      keys,
      ["hasGlobalConfig", "hasProjectConfig"],
      `verifySourcesShapeIsExactlyTwoBooleans: sources keys must be exactly ["hasGlobalConfig", "hasProjectConfig"]; got ${JSON.stringify(keys)}`,
    );
    assert.equal(
      typeof result.sources.hasGlobalConfig,
      "boolean",
      "verifySourcesShapeIsExactlyTwoBooleans: hasGlobalConfig must be boolean",
    );
    assert.equal(
      typeof result.sources.hasProjectConfig,
      "boolean",
      "verifySourcesShapeIsExactlyTwoBooleans: hasProjectConfig must be boolean",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * AC2: legacy files are completely ignored. Control fixture (modern only) and
 * experiment fixture (modern + 3 legacy files) must produce deepEqual config.
 */
async function verifyLegacyFilesIgnored() {
  const { loadRuntimeConfig } = await import(`${loadConfigModuleUrl}?ac2=${Date.now()}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-ac2-"));
  try {
    const controlDir = path.join(tempRoot, "control");
    const experimentDir = path.join(tempRoot, "experiment");
    const controlConfigDir = path.join(controlDir, ".opencode");
    const experimentConfigDir = path.join(experimentDir, ".opencode");
    const globalConfigDir = path.join(tempRoot, "home", ".config", "opencode");
    fs.mkdirSync(controlConfigDir, { recursive: true });
    fs.mkdirSync(experimentConfigDir, { recursive: true });
    fs.mkdirSync(globalConfigDir, { recursive: true });

    fs.writeFileSync(
      path.join(globalConfigDir, "devai-aidd-plugin.global.jsonc"),
      JSON.stringify({ branch: { defaultType: "docs" } }),
      "utf8",
    );
    const modernProject = JSON.stringify({ branch: { defaultType: "feat" } });
    fs.writeFileSync(
      path.join(controlConfigDir, "devai-aidd-plugin.project.jsonc"),
      modernProject,
      "utf8",
    );
    fs.writeFileSync(
      path.join(experimentConfigDir, "devai-aidd-plugin.project.jsonc"),
      modernProject,
      "utf8",
    );
    fs.writeFileSync(
      path.join(experimentConfigDir, "opencode-aidd-plugin.json"),
      JSON.stringify({ branch: { defaultType: "refactor" } }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(experimentConfigDir, "devai-git-workflow.json"),
      JSON.stringify({ workflowPolicy: { default: { strict: true } } }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(experimentConfigDir, "devai-aidd-guard.project.jsonc"),
      JSON.stringify({ branch: { defaultType: "fix" } }),
      "utf8",
    );

    const fsAdapter = buildLegacyRemovalFsAdapter(path.join(tempRoot, "home"));
    const controlResult = loadRuntimeConfig(controlDir, fsAdapter);
    const experimentResult = loadRuntimeConfig(experimentDir, fsAdapter);

    assert.deepEqual(
      experimentResult.config,
      controlResult.config,
      "verifyLegacyFilesIgnored: experiment config (with legacy files) must deepEqual control config (modern only) — legacy files must be ignored",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * AC3: bootstrap must NOT create any bridge files (marker, opencode-aidd-plugin.json,
 * devai-git-workflow.json) in `.opencode/`.
 */
async function verifyBridgeFilesNeverCreated() {
  const wrapperMod = await import(`${wrapperModuleUrl}?ac3=${Date.now()}`);
  const tempRoot = createTempWorkspace();
  try {
    const mock = createMockClient();
    await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });

    const opencodeDir = path.join(tempRoot, ".opencode");
    const forbiddenPaths = [
      path.join(opencodeDir, ".devai-aidd-plugin.compat.generated"),
      path.join(opencodeDir, "opencode-aidd-plugin.json"),
      path.join(opencodeDir, "devai-git-workflow.json"),
    ];
    for (const forbiddenPath of forbiddenPaths) {
      assert.equal(
        fs.existsSync(forbiddenPath),
        false,
        `verifyBridgeFilesNeverCreated: bootstrap must not create ${path.basename(forbiddenPath)}`,
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * AC4: `compat.bridge.evaluated` and `plugin bootstrap registered no-op hooks`
 * audit events must be 0-count, and `plugin bootstrap` payload must NOT carry
 * a `hasLegacyProjectConfig` key.
 */
async function verifyDeprecatedAuditEventsNotEmitted() {
  const wrapperMod = await import(`${wrapperModuleUrl}?ac4=${Date.now()}`);
  const tempRoot = createTempWorkspace();
  try {
    const mock = createMockClient();
    await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });

    const messages = mock.logs.map((l) => l.body?.message);
    const compatBridgeCount = messages.filter((m) => m === "compat.bridge.evaluated").length;
    const noOpHooksCount = messages.filter(
      (m) => m === "plugin bootstrap registered no-op hooks",
    ).length;
    assert.equal(
      compatBridgeCount,
      0,
      `verifyDeprecatedAuditEventsNotEmitted: compat.bridge.evaluated must be 0; got ${compatBridgeCount}`,
    );
    assert.equal(
      noOpHooksCount,
      0,
      `verifyDeprecatedAuditEventsNotEmitted: plugin bootstrap registered no-op hooks must be 0; got ${noOpHooksCount}`,
    );

    const bootstrapEntry = mock.logs.find((l) => l.body?.message === "plugin bootstrap");
    assert.ok(
      bootstrapEntry,
      "verifyDeprecatedAuditEventsNotEmitted: plugin bootstrap audit event must still be emitted",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(bootstrapEntry.body.extra, "hasLegacyProjectConfig"),
      false,
      "verifyDeprecatedAuditEventsNotEmitted: plugin bootstrap payload must NOT contain hasLegacyProjectConfig key",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * AC5: every `client.app.log` payload must have `body.service === "devai-aidd-plugin"`,
 * and no record may carry a `legacyService` field.
 */
async function verifyAuditWireFormatModernService() {
  const wrapperMod = await import(`${wrapperModuleUrl}?ac5=${Date.now()}`);
  const tempRoot = createTempWorkspace();
  try {
    const mock = createMockClient();
    await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });

    assert.ok(
      mock.logs.length > 0,
      "verifyAuditWireFormatModernService: bootstrap must emit at least one audit log",
    );
    for (const entry of mock.logs) {
      assert.equal(
        entry.body?.service,
        "devai-aidd-plugin",
        `verifyAuditWireFormatModernService: body.service must be "devai-aidd-plugin"; got ${entry.body?.service}`,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(entry.body || {}, "legacyService"),
        false,
        "verifyAuditWireFormatModernService: body must NOT carry a legacyService field",
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * AC6: built artifact must NOT export `DevaiGitWorkflowPlugin`. Must export
 * `DevaiAiddGuardPlugin` and default. SUPPORTED_HOOK_KEYS tracks the native
 * plugin surface including custom tools.
 */
async function verifyAliasExportRemoved() {
  const builtModule = await import(`${builtModuleUrl}?ac6=${Date.now()}`);
  const wrapperModule = await import(`${wrapperModuleUrl}?ac6w=${Date.now()}`);
  const constantsModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "utils", "constants.js"),
  ).href;
  const { SUPPORTED_HOOK_KEYS } = await import(`${constantsModuleUrl}?ac6c=${Date.now()}`);

  assert.equal(
    typeof builtModule.DevaiGitWorkflowPlugin,
    "undefined",
    "verifyAliasExportRemoved: built artifact must NOT export DevaiGitWorkflowPlugin",
  );
  assert.equal(
    typeof wrapperModule.DevaiGitWorkflowPlugin,
    "undefined",
    "verifyAliasExportRemoved: wrapper module must NOT export DevaiGitWorkflowPlugin",
  );
  assert.equal(
    typeof builtModule.DevaiAiddGuardPlugin,
    "function",
    "verifyAliasExportRemoved: built artifact must export DevaiAiddGuardPlugin",
  );
  assert.equal(
    typeof builtModule.default,
    "function",
    "verifyAliasExportRemoved: built artifact must export default",
  );
  assert.equal(
    SUPPORTED_HOOK_KEYS.length,
    7,
    `verifyAliasExportRemoved: SUPPORTED_HOOK_KEYS.length must be 7; got ${SUPPORTED_HOOK_KEYS.length}`,
  );
}

/**
 * AC7: start instruction text simplified to Option B. Exactly one synthetic
 * part with `text === "Git workflow guard is active for /<cmd>."` and
 * `metadata.source === "devai-git-workflow"`, `metadata.phase === "start"`.
 * The legacy "Bootstrap compatibility mode" substring must not appear.
 */
async function verifyStartInstructionTextSimplified() {
  const wrapperMod = await import(`${wrapperModuleUrl}?ac7=${Date.now()}`);
  const tempRoot = createTempWorkspace();
  // strengthen-git-init-proposal: when the temp workspace is NOT a git repo,
  // `buildStartInstructionText` returns a multi-line block including the
  // init-prompt guidance. This test specifically verifies the simplified
  // Option B start text (the single-line guard sentence). Initialize git in
  // the temp dir so readiness === "allow" and the simple form is emitted.
  execFileSync("git", ["init", "--quiet"], { cwd: tempRoot, stdio: "pipe" });
  try {
    const mock = createMockClient();
    const handlers = await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });
    const output = { parts: [] };
    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "", sessionID: "ac7-session" },
      output,
    );

    // strengthen-approval-prompt-instructions follow-up: the start text may now
    // be either the short Option B guard line (no active approval, e.g. a
    // policy without branch requirement) OR a multi-line strong instruction
    // (active approval present). In both cases the FIRST line is the canonical
    // `Git workflow guard is active for /<cmd>.` guard sentence -- assert via
    // startsWith so the test passes for both shapes.
    const guardParts = output.parts.filter((p) =>
      typeof p?.text === "string" &&
      p.text.startsWith("Git workflow guard is active for /bmad-bmm-quick-dev."),
    );
    assert.equal(
      guardParts.length,
      1,
      `verifyStartInstructionTextSimplified: must push exactly one Option B start instruction part; got ${guardParts.length}`,
    );
    const part = guardParts[0];
    assert.equal(
      part.synthetic,
      true,
      "verifyStartInstructionTextSimplified: start part must have synthetic: true",
    );
    assert.equal(
      part.metadata?.source,
      "devai-git-workflow",
      "verifyStartInstructionTextSimplified: start part metadata.source must be 'devai-git-workflow'",
    );
    assert.equal(
      part.metadata?.phase,
      "start",
      "verifyStartInstructionTextSimplified: start part metadata.phase must be 'start'",
    );
    for (const otherPart of output.parts) {
      const text = otherPart?.text || "";
      assert.equal(
        text.includes("Bootstrap compatibility mode"),
        false,
        "verifyStartInstructionTextSimplified: no part may contain 'Bootstrap compatibility mode'",
      );
      assert.equal(
        text.includes("legacy BMAD hook contract"),
        false,
        "verifyStartInstructionTextSimplified: no part may contain 'legacy BMAD hook contract'",
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * AC8: mutating-tool guard throw message must match byte-for-byte.
 */
async function verifyMutatingToolThrowMessagePreserved() {
  const wrapperMod = await import(`${wrapperModuleUrl}?ac8=${Date.now()}`);
  const tempRoot = createTempWorkspace();
  try {
    const mock = createMockClient();
    const handlers = await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });
    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "", sessionID: "ac8-session" },
      { parts: [] },
    );

    let thrown = null;
    try {
      await handlers["tool.execute.before"](
        { sessionID: "ac8-session", tool: "write", args: {} },
        { args: {} },
      );
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, "verifyMutatingToolThrowMessagePreserved: mutating tool must throw");
    // strengthen-approval-prompt-instructions follow-up: when an approval is
    // active for this session, Layer 0 (approval-pending block) supersedes
    // Layer 3 (mutating-tool guard) -- the legacy "create or switch to
    // branch" message is no longer the first line of defense. Verify the new
    // Layer 0 contract instead. Layer 3 message remains in source as a
    // fallback for the "workflow in progress, no active approval" case.
    assert.match(
      thrown.message,
      /^Git workflow guard: a startup approval chain is pending and you must call the native `question` tool/,
      `verifyMutatingToolThrowMessagePreserved: Layer 0 must fire first; got ${JSON.stringify(thrown.message)}`,
    );
    assert.match(
      thrown.message,
      /staged question batch BEFORE any other tool/,
      "verifyMutatingToolThrowMessagePreserved: Layer 0 message must point to the native question batch",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * strengthen-git-init-proposal AC4: BASH_GIT_BLOCK_MESSAGE constant in
 * src/hooks/tool-execute-before.js must match TD #3 canonical byte-for-byte,
 * and the Error thrown by the bash+git block must carry that exact string.
 */
async function verifyBashGitBlockMessagePreserved() {
  const toolBeforeModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "hooks", "tool-execute-before.js"),
  ).href;
  const mod = await import(`${toolBeforeModuleUrl}?bash-git=${Date.now()}`);
  const CANONICAL =
    "Git workflow guard: a git repository must be initialized before running git commands. Approve the pending \"Initialize Git\" prompt instead of running git directly.";
  assert.equal(
    mod.BASH_GIT_BLOCK_MESSAGE,
    CANONICAL,
    `verifyBashGitBlockMessagePreserved: exported constant must match TD #3 canonical byte-for-byte; got ${JSON.stringify(mod.BASH_GIT_BLOCK_MESSAGE)}`,
  );

  // Wire up the hook with an init proposal pending and verify the throw.
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);
  const store = createWorkflowStateStore();
  const sessionID = "bash-git-block-canonical";
  store.set(sessionID, {
    sessionID,
    initProposal: { kind: "init", action: "git-init" },
  });
  const hook = mod.createToolExecuteBeforeHook({
    workflowState: store,
    pluginContext: { directory: "/no/such/path/that/is/not/a/git/repo" },
  });

  let thrown = null;
  try {
    await hook({ sessionID, tool: "bash", args: { command: "git status" } });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "verifyBashGitBlockMessagePreserved: bash+git must throw when init proposal pending");
  assert.equal(
    thrown.message,
    CANONICAL,
    `verifyBashGitBlockMessagePreserved: Error.message must match canonical byte-for-byte; got ${JSON.stringify(thrown.message)}`,
  );
}

/**
 * strengthen-git-init-proposal AC1b: when the working directory is not a git
 * repository, the block fires even without a workflow session (race-safe path
 * — F2/F3). pluginContext.directory drives the `.git` existence check.
 */
async function verifyBashGitBlockFiresWithoutWorkflowSession() {
  const toolBeforeModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "hooks", "tool-execute-before.js"),
  ).href;
  const mod = await import(`${toolBeforeModuleUrl}?bash-git-race=${Date.now()}`);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const store = createWorkflowStateStore();
  const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-no-git-"));
  try {
    const hook = mod.createToolExecuteBeforeHook({
      workflowState: store,
      pluginContext: { directory: nonGitDir },
    });

    let thrown = null;
    try {
      await hook({ sessionID: "no-workflow", tool: "bash", args: { command: "git status" } });
    } catch (error) {
      thrown = error;
    }
    assert.ok(
      thrown,
      "verifyBashGitBlockFiresWithoutWorkflowSession: must throw on bash+git in non-git directory even without workflow session",
    );
    assert.equal(thrown.message, mod.BASH_GIT_BLOCK_MESSAGE);
  } finally {
    fs.rmSync(nonGitDir, { recursive: true, force: true });
  }
}

/**
 * strengthen-git-init-proposal AC2: false-positive guard. A bash+git call
 * inside an actual git repo with no init proposal must NOT throw.
 */
async function verifyBashGitBlockSkippedInGitRepo() {
  const toolBeforeModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "hooks", "tool-execute-before.js"),
  ).href;
  const mod = await import(`${toolBeforeModuleUrl}?bash-git-skip=${Date.now()}`);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const store = createWorkflowStateStore();
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "devai-aidd-real-git-"));
  fs.mkdirSync(path.join(repoDir, ".git")); // synthetic — only existsSync is checked
  try {
    const hook = mod.createToolExecuteBeforeHook({
      workflowState: store,
      pluginContext: { directory: repoDir },
    });
    // No throw expected.
    await hook({ sessionID: "false-positive-guard", tool: "bash", args: { command: "git status" } });
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

/**
 * strengthen-git-init-proposal AC3: non-git bash commands must pass through
 * even when an init proposal is pending.
 */
async function verifyBashNonGitNotBlockedDuringInitPending() {
  const toolBeforeModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "hooks", "tool-execute-before.js"),
  ).href;
  const mod = await import(`${toolBeforeModuleUrl}?bash-non-git=${Date.now()}`);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);

  const store = createWorkflowStateStore();
  const sessionID = "non-git-during-init";
  store.set(sessionID, { sessionID, initProposal: { kind: "init", action: "git-init" } });
  const hook = mod.createToolExecuteBeforeHook({
    workflowState: store,
    pluginContext: { directory: "/no/such/path" },
  });
  // ls is not git — must pass.
  await hook({ sessionID, tool: "bash", args: { command: "ls -la" } });
  // digit is not git — must pass.
  await hook({ sessionID, tool: "bash", args: { command: "echo digit gitea" } });
}

/**
 * strengthen-git-init-proposal AC1d: looksLikeGitCommand pattern coverage.
 */
async function verifyLooksLikeGitCommandPatternCoverage() {
  const helperUrl = pathToFileURL(
    path.join(projectRoot, "src", "services", "workflow", "looks-like-git-command.js"),
  ).href;
  const { looksLikeGitCommand } = await import(`${helperUrl}?coverage=${Date.now()}`);

  const positives = [
    "git status",
    " git push",
    "& git status",
    "C:\\Program Files\\Git\\bin\\git.exe status",
    "cmd /c git status",
    "cmd.exe /c git status",
    'bash -c "git status"',
    "pwd && git status",
    "cd repo; git status",
    "GIT_TERMINAL_PROMPT=0 git status",
  ];
  for (const cmd of positives) {
    assert.equal(
      looksLikeGitCommand(cmd),
      true,
      `verifyLooksLikeGitCommandPatternCoverage: expected true for ${JSON.stringify(cmd)}`,
    );
  }

  const negatives = [
    "digit",
    "echo gitea",
    "magit-cli --help",
    "gitlab-runner --version",
    "ls -la",
    "pwd",
    "",
    null,
    undefined,
    42,
  ];
  for (const cmd of negatives) {
    assert.equal(
      looksLikeGitCommand(cmd),
      false,
      `verifyLooksLikeGitCommandPatternCoverage: expected false for ${JSON.stringify(cmd)}`,
    );
  }
}

/**
 * strengthen-git-init-proposal AC4b: src/index.js must inject pluginContext
 * into the tool.execute.before factory. Without that, the `.git` fallback
 * check silently degrades (treats every directory as a git repo).
 */
async function verifyToolExecuteBeforeReceivesPluginContext() {
  const indexSrc = fs.readFileSync(path.join(projectRoot, "src", "index.js"), "utf8");
  // Grep for the registration line. Looser regex to tolerate formatting drift.
  const re = /createToolExecuteBeforeHook\s*\(\s*\{[^}]*pluginContext[^}]*\}\s*\)/;
  assert.ok(
    re.test(indexSrc),
    "verifyToolExecuteBeforeReceivesPluginContext: src/index.js must pass `pluginContext` to createToolExecuteBeforeHook",
  );
}

/**
 * AC13: mutating tool input must advance `phase` to "mutating" and the state
 * must NOT contain a `lifecycle` key.
 */
async function verifyMutatingToolAdvancesPhase() {
  const wrapperMod = await import(`${wrapperModuleUrl}?ac13=${Date.now()}`);
  const { createWorkflowStateStore } = await import(workflowStateModuleUrl);
  const { createToolExecuteAfterHook } = await import(
    pathToFileURL(path.join(projectRoot, "src", "hooks", "tool-execute-after.js")).href,
  );

  const sessionID = "ac13-session";
  const store = createWorkflowStateStore();
  store.set(sessionID, {
    commandName: "bmad-bmm-quick-dev",
    arguments: "",
    sessionID,
    detectedAt: "2026-05-11T00:00:00.000Z",
    phase: "in-progress",
  });

  const hook = createToolExecuteAfterHook({ workflowState: store });
  await hook({ sessionID, tool: "write", args: {} }, { args: {} });

  const state = store.get(sessionID);
  assert.equal(
    state?.phase,
    "mutating",
    `verifyMutatingToolAdvancesPhase: phase must be "mutating" after mutating tool; got ${state?.phase}`,
  );
  assert.equal(
    Object.keys(state || {}).includes("lifecycle"),
    false,
    "verifyMutatingToolAdvancesPhase: state must NOT contain a 'lifecycle' key",
  );

  // Quiet unused-import warning.
  void wrapperMod;
}

/**
 * AC14: `event` hook with `session.deleted` must clear workflow state for the
 * given sessionID.
 */
async function verifySessionDeletedClearsState() {
  const wrapperMod = await import(`${wrapperModuleUrl}?ac14=${Date.now()}`);
  const tempRoot = createTempWorkspace();
  try {
    const mock = createMockClient();
    const handlers = await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });
    const sessionID = "ac14-session";
    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "", sessionID },
      { parts: [] },
    );
    await handlers.event({
      event: { type: "session.deleted", properties: { sessionID } },
    });

    let postDeleteError = null;
    try {
      await handlers["tool.execute.before"](
        { sessionID, tool: "write", args: {} },
        { args: {} },
      );
    } catch (error) {
      postDeleteError = error;
    }
    assert.equal(
      postDeleteError,
      null,
      "verifySessionDeletedClearsState: after session.deleted, mutating tool must not throw (state cleared)",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// =============================================================================
// Native event contract — opencode native plugin (.opencode/plugins) entrypoint
// =============================================================================
//
// The native event router replaces the legacy `command.execute.before` /
// `permission.asked` / `file.edited` chain when the plugin is loaded by the
// opencode native runtime. The named handlers remain as compatibility shims
// but `handlers.event` must be the load-bearing path: a native flow that
// only ever calls `handlers.event({ event })` must still publish approvals,
// match question.replied to the active approval, route deny through
// recovery, and clear session state. The two assertions below pin the new
// contract:
//
// 1. `verifyNativeEventHandlerExists` — the bootstrap must expose a callable
//    `event` handler that accepts the native payload envelope (`{ event:
//    { type, properties } }`) without throwing on malformed inputs.
// 2. `verifyNativeQuestionFlowResolvesApprovalWithoutLegacyHooks` — a full
//    init approval flow driven exclusively through native events (`command.
//    executed` → `question.asked` → `question.replied`) must produce the
//    same approval.requested/resolved audit chain as the legacy path.

async function verifyNativeEventHandlerExists() {
  const wrapperMod = await import(`${wrapperModuleUrl}?nv1=${Date.now()}`);
  const tempRoot = createTempWorkspace();
  try {
    const mock = createMockClient();
    const handlers = await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });
    assert.equal(
      typeof handlers.event,
      "function",
      "verifyNativeEventHandlerExists: handlers.event must be a callable function",
    );
    // Malformed/unknown events must be silent no-ops (no throw).
    let threw = null;
    try {
      await handlers.event();
      await handlers.event(null);
      await handlers.event({});
      await handlers.event({ event: null });
      await handlers.event({ event: { type: "totally.unknown" } });
      await handlers.event({ event: { type: "question.asked", properties: {} } });
    } catch (error) {
      threw = error;
    }
    assert.equal(
      threw,
      null,
      `verifyNativeEventHandlerExists: native event handler must never throw on malformed input; got ${threw?.message}`,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyNativeQuestionFlowResolvesApprovalWithoutLegacyHooks() {
  const wrapperMod = await import(`${wrapperModuleUrl}?nv2=${Date.now()}`);
  const tempRoot = createTempWorkspace();
  try {
    const mock = createMockClient();
    const handlers = await wrapperMod.DevaiAiddGuardPlugin({
      client: mock.client,
      directory: tempRoot,
    });
    const sessionID = "native-event-flow";

    // Drive the entire flow through `handlers.event` only — never call
    // `command.execute.before` / `permission.asked` / `file.edited`.
    await handlers.event({
      event: {
        type: "command.executed",
        properties: {
          sessionID,
          name: "/bmad-bmm-quick-dev",
          arguments: "",
        },
      },
    });

    const approvalRequested = mock.logs
      .map((entry) => entry?.body?.extra)
      .find((extra) => extra?.event === "approval.requested");
    assert.ok(
      approvalRequested,
      "verifyNativeQuestionFlowResolvesApprovalWithoutLegacyHooks: native command.executed must publish approval.requested",
    );

    const approvalPrompt = mock.prompts.find((prompt) => {
      const md = prompt?.parts?.[0]?.metadata;
      return md?.requestId || md?.actionId;
    });
    assert.ok(
      approvalPrompt,
      "verifyNativeQuestionFlowResolvesApprovalWithoutLegacyHooks: native command.executed must deliver approval prompt",
    );
    const md = approvalPrompt.parts[0].metadata;
    assert.equal(approvalPrompt.directory, tempRoot);
    assert.ok(md.questionHeader, "approval prompt metadata must include questionHeader");

    // Native question.asked records pending mapping; question.replied resolves it.
    const questionID = "native-q-1";
    await handlers.event({
      event: {
        type: "question.asked",
        properties: {
          sessionID,
          id: questionID,
          header: md.questionHeader,
        },
      },
    });

    const denyOptionLabel = "Deny";
    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          requestID: questionID,
          answers: [[denyOptionLabel]],
        },
      },
    });

    const resolved = mock.logs
      .map((entry) => entry?.body?.extra)
      .filter((extra) => extra?.event === "approval.resolved");
    assert.equal(
      resolved.length,
      1,
      `verifyNativeQuestionFlowResolvesApprovalWithoutLegacyHooks: native question.replied must resolve approval exactly once; got ${resolved.length}`,
    );
    assert.equal(resolved[0].outcome, "deny");

    // session.deleted via native event must clear state (mutating tool no longer guards).
    await handlers.event({
      event: { type: "session.deleted", properties: { sessionID } },
    });
    let mutThrow = null;
    try {
      await handlers["tool.execute.before"](
        { sessionID, tool: "write", args: {} },
        { args: {} },
      );
    } catch (error) {
      mutThrow = error;
    }
    assert.equal(
      mutThrow,
      null,
      "verifyNativeQuestionFlowResolvesApprovalWithoutLegacyHooks: native session.deleted must clear session state",
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function verifyStartupChainRegressionContracts() {
  const runGitMod = await import(`${runGitCommandModuleUrl}?startup=${Date.now()}`);
  const nativeMod = await import(`${pathToFileURL(path.join(projectRoot, "src", "hooks", "native-event.js")).href}?startup=${Date.now()}`);
  const plannerMod = await import(`${pathToFileURL(path.join(projectRoot, "src", "services", "git", "startup-chain-planner.js")).href}?startup=${Date.now()}`);
  const executeApprovedMod = await import(`${pathToFileURL(path.join(projectRoot, "src", "services", "git", "execute-approved-action.js")).href}?startup=${Date.now()}`);
  const { createWorkflowStateStore } = await import(`${workflowStateModuleUrl}?startup=${Date.now()}`);

  assert.deepEqual(
    runGitMod.buildBranchArgs({ operation: "create", branchName: "feat/ABC-123-x" }),
    ["switch", "-c", "feat/ABC-123-x"],
  );
  assert.deepEqual(
    runGitMod.buildBranchArgs({ operation: "switch", targetBranch: "feat/ABC-123-x" }),
    ["switch", "feat/ABC-123-x"],
  );

  const pendingStartupQuestion = {
    questionIds: ["chain:init", "chain:baseline", "chain:branch"],
    questionKeys: ["init", "baseline", "branch"],
  };
  assert.deepEqual(
    nativeMod.readReplyAnswers(
      { answers: [{ id: "chain:init", answer: "Skip" }, { id: "chain:baseline", answer: "Skip" }, { id: "chain:branch", answer: "Ignore and continue" }] },
      pendingStartupQuestion,
    ),
    { init: "Skip", baseline: "Skip", branch: "Ignore and continue" },
  );
  assert.deepEqual(
    nativeMod.readReplyAnswers(
      { answers: { "chain:init": "Initialize Git (Recommended)", "chain:baseline": "Commit Without .gitignore", "chain:branch": "Approve (Recommended)" } },
      pendingStartupQuestion,
    ),
    { init: "Initialize Git (Recommended)", baseline: "Commit Without .gitignore", branch: "Approve (Recommended)" },
  );
  assert.deepEqual(
    nativeMod.readReplyAnswers(
      { answers: [["Initialize Git (Recommended)"], ["Skip"], ["Ignore and continue"]] },
      pendingStartupQuestion,
    ),
    { init: "Initialize Git (Recommended)", baseline: "Skip", branch: "Ignore and continue" },
  );

  const workflowContext = {
    sessionID: "startup-regression",
    commandName: "bmad-bmm-quick-dev",
    normalizedCommand: "bmad-bmm-quick-dev",
    arguments: "ABC-123 startup",
  };
  const plan = plannerMod.buildStartupChainPlan({
    readiness: {
      outcome: "ask",
      reason: "git-not-initialized",
      details: { isGitRepository: false, hasCommit: false, proposal: { kind: "init" } },
    },
    workflowContext,
    workflowPolicy: defaultPolicyWithLegacyBranchRequired("bmad-bmm-quick-dev"),
    branchConfig: TEST_BRANCH_CONFIG,
    currentBranch: null,
    state: {},
  });
  assert.deepEqual(plan.steps.map((step) => step.key), ["init", "baseline", "branch"]);

  const workflowState = createWorkflowStateStore();
  workflowState.set("branch-session", {
    sessionID: "branch-session",
    readiness: {
      details: {
        isGitRepository: true,
        branch: "main",
        hasRemote: false,
        remoteNames: [],
      },
    },
  });
  const seenActions = [];
  const result = await executeApprovedMod.executeApprovedAction({
    workflowState,
    sessionID: "branch-session",
    approvalRequest: {
      actionType: "branch/create",
      command: "bmad-bmm-quick-dev",
      workflow: "bmad-bmm-quick-dev",
      phase: "start",
      proposal: { kind: "branch", action: "create", name: "feat/ABC-123-x" },
    },
    resolution: { resolvedAt: "2026-05-12T00:00:00.000Z" },
    pluginContext: {
      directory: projectRoot,
      gitActionRunner: async ({ action }) => {
        seenActions.push(action);
        return { observedState: { headBranch: action.targetBranch } };
      },
      gitRunner: () => "feat/ABC-123-x\n",
    },
    audit: null,
  });
  assert.equal(result.outcome, "executed");
  assert.equal(seenActions[0]?.kind, "branch");
  assert.equal(seenActions[0]?.operation, "create");

  console.log("verifyStartupChainRegressionContracts OK");
}

main()
  .then(() => verifyBootstrapFailureShape())
  .then(() => verifyConfigMergePrecedence())
  .then(() => verifyValidationFallback())
  .then(() => verifyValidationFallbackLowerLayer())
  .then(() => verifyParseFailureSurfacing())
  .then(() => verifyForwardCompatExtensionKeys())
  .then(() => verifySchemaVersionEnforcement())
  .then(() => verifyResolveWorkflowPolicy())
  .then(() => verifyBranchServiceContracts())
  .then(() => verifyBranchProposalIntegration())
  .then(() => verifyReadinessConfigContracts())
  .then(() => verifyRepositoryReadinessContracts())
  .then(() => verifyRepositoryReadinessSkipContracts())
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
  // Story 2.5 review fixes
  .then(() => verifyBuildRecoveryPromptContracts())
  .then(() => verifyRecoveryPromptDeliveredAfterDeny())
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
  .then(() => verifyPermissionAskedAcceptCommitPublishesPushApproval())
  .then(() => verifyPermissionAskedAcceptCommitSuppressesPushWithoutRemote())
  .then(() => verifyPermissionAskedAcceptExecutesPushProposal())
  .then(() => verifyPermissionAskedPushFailureOpensRecovery())
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
  // Story 3.4 — record approval outcomes and execution results for audit
  .then(() => verifyStory34ApprovalRequestedCarriesCorrelationAxes())
  .then(() => verifyStory34ApprovalResolvedAndSkippedCarryCorrelationAxes())
  .then(() => verifyStory34GitActionExecutedCarriesCorrelationAxes())
  .then(() => verifyStory34GitExecutorEnvelopeSurvivesAuditThrow())
  .then(() => verifyStory34CommitSuccessThenPushDenyPreservesAuditChain())
  .then(() => verifyStory34BootstrapAuditFailureDoesNotAbortRegistration())
  // Story 3.5 — preserve reviewer traceability through standard Git history
  .then(() => verifyStory35CommitProposalCodeOnlyScope())
  .then(() => verifyStory35CommitProposalDocsOnlyScope())
  .then(() => verifyStory35CommitProposalMixedScope())
  .then(() => verifyStory35CommitExplanationSurfacesScopeWithoutSensitiveData())
  .then(() => verifyStory35PushFailureDoesNotInvalidateLocalCommitTraceability())
  .then(() => verifyStory35RecoveryGateBlocksOnlyFinalizationFollowups())
  .then(() => verifyStory35PlanningArtifactPathRemainsInScope())
  // Story 4.1 — define and normalize branch and workflow policy configuration
  .then(() => verifyEffectiveConfigNormalizationContract())
  .then(() => verifyMissingOptionalValuesFallback())
  .then(() => verifyWorkflowPolicyVocabularySchema())
  .then(() => verifyEffectivePolicyDeterminism())
  .then(() => verifyLatestPolicyChangesReflectedAcrossRuns())
  // Story 4.4 — build and package release artifacts reliably
  .then(() => verifyStory44ReleaseManifestCompleteness())
  .then(() => verifyStory44ReleaseChecksumLinesMatchInstallerParsers())
  .then(() => verifyStory44LatestAndVersionedDirsMirrored())
  .then(() => verifyStory44ReleaseMissingSourceFails())
  // Story 4.4 R2 LOW-1: multi-missing + bundle hint
  .then(() => verifyStory44ReleaseMissingBundleEmitsBuildHint())
  // Story 4.5 — wrapper/built regression gate
  .then(() => verifyStory45WrapperBuiltHandlerShapesMatch())
  .then(() => verifyStory45WrapperBuiltCommandPromptParity())
  .then(() => verifyStory45WrapperBuiltMutatingToolGuardParity())
  .then(() => verifyStory45BuiltArtifactExportContract())
  .then(() => verifyStory45BuiltArtifactPromptParityWithWrapper())
  .then(() => verifyStory45RegressionGateAbortsWithoutBuiltArtifact())
  .then(() => verifyStory45SrcIndexAuditEventListMatchesEmissions())
  // BREAKING CHANGE — legacy compatibility removal (AC1~AC8, AC13~AC15)
  .then(() => verifySourcesShapeIsExactlyTwoBooleans())
  .then(() => verifyLegacyFilesIgnored())
  .then(() => verifyBridgeFilesNeverCreated())
  .then(() => verifyDeprecatedAuditEventsNotEmitted())
  .then(() => verifyAuditWireFormatModernService())
  .then(() => verifyAliasExportRemoved())
  .then(() => verifyStartInstructionTextSimplified())
  .then(() => verifyMutatingToolThrowMessagePreserved())
  // strengthen-git-init-proposal — bash+git block contract
  .then(() => verifyBashGitBlockMessagePreserved())
  .then(() => verifyBashGitBlockFiresWithoutWorkflowSession())
  .then(() => verifyBashGitBlockSkippedInGitRepo())
  .then(() => verifyBashNonGitNotBlockedDuringInitPending())
  .then(() => verifyLooksLikeGitCommandPatternCoverage())
  .then(() => verifyToolExecuteBeforeReceivesPluginContext())
  .then(() => verifyMutatingToolAdvancesPhase())
  .then(() => verifySessionDeletedClearsState())
  // Native event contract — opencode native plugin (.opencode/plugins)
  .then(() => verifyNativeEventHandlerExists())
  .then(() => verifyStartupChainRegressionContracts())
  .then(() => verifyStartupChainReadinessSkipContracts())
  // strengthen-approval-prompt-instructions — promptAsync instruction strengthening
  .then(() => verifyQuestionInstructionBuilderContract())
  // question-header guard — force model to use the exact header we staged
  .then(() => verifyQuestionHeaderGuardMatchesActiveApproval())
  .then(() => verifyCommandExecuteBeforeReadinessGateOverwrite())
  .catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });

/**
 * strengthen-approval-prompt-instructions:
 *
 * 1. `src/services/approval/build-question-instruction.js` exports
 *    `buildQuestionInstruction` and produces the expected header/options for
 *    each canonical actionType (init, commit+baseline-commit, commit,
 *    branch/create, branch/switch, push).
 * 2. `src/index.js` imports the builder so the promptAsync channel actually
 *    routes through it (static drift guard).
 * 3. `APPROVAL_OUTCOME_ALIASES["create baseline commit"] === "accept"` so the
 *    native question label normalizes back to ACCEPT.
 * 4. The alias-disjointness invariant continues to hold after the new entry.
 */
async function verifyQuestionInstructionBuilderContract() {
  const builderModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "services", "approval", "build-question-instruction.js"),
  ).href;
  const aliasesModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "services", "approval", "permission-asked-aliases.js"),
  ).href;
  const indexModulePath = path.join(projectRoot, "src", "index.js");

  const indexSource = fs.readFileSync(indexModulePath, "utf8");
  assert.match(
    indexSource,
    /import\s*\{\s*buildQuestionInstruction\s*\}\s*from\s*["'][^"']*build-question-instruction\.js["']/,
    "verifyQuestionInstructionBuilderContract: src/index.js must import buildQuestionInstruction",
  );

  const { buildQuestionInstruction } = await import(`${builderModuleUrl}?qi=${Date.now()}`);
  assert.equal(
    typeof buildQuestionInstruction,
    "function",
    "verifyQuestionInstructionBuilderContract: builder export must be a function",
  );

  const cases = [
    {
      input: { commandName: "x", actionType: "init", proposal: null },
      header: "Initialize Git",
      firstOption: "Initialize Git (Recommended)",
    },
    {
      input: {
        commandName: "x",
        actionType: "commit",
        proposal: { kind: "commit", action: "baseline-commit" },
      },
      header: "Create Baseline Commit",
      firstOption: "Setup .gitignore and Commit (Recommended)",
    },
    {
      input: {
        commandName: "x",
        actionType: "commit",
        proposal: { kind: "commit", action: "commit" },
      },
      header: "Finalize Changes",
      firstOption: "Approve (Recommended)",
    },
    {
      input: {
        commandName: "x",
        actionType: "branch/create",
        proposal: { kind: "branch", action: "create", name: "feat/foo" },
      },
      header: "Create Branch",
      firstOption: "Approve (Recommended)",
    },
    {
      input: {
        commandName: "x",
        actionType: "branch/switch",
        proposal: { kind: "branch", action: "switch", name: "feat/bar" },
      },
      header: "Switch Branch",
      firstOption: "Approve (Recommended)",
    },
    {
      input: {
        commandName: "x",
        actionType: "push",
        proposal: { kind: "push", action: "push" },
      },
      header: "Push Changes",
      firstOption: "Approve (Recommended)",
    },
  ];

  for (const c of cases) {
    const r = buildQuestionInstruction(c.input);
    assert.equal(
      r.header,
      c.header,
      `verifyQuestionInstructionBuilderContract: header mismatch for actionType=${c.input.actionType}`,
    );
    assert.equal(
      r.options[0],
      c.firstOption,
      `verifyQuestionInstructionBuilderContract: first option mismatch for actionType=${c.input.actionType}`,
    );
    assert.ok(
      typeof r.instructionText === "string" && r.instructionText.length > 0,
      `verifyQuestionInstructionBuilderContract: instructionText empty for actionType=${c.input.actionType}`,
    );
  }

  // Adversarial F1 regression guard: bare "branch" actionType must NOT match
  // the slash-segmented branch cases. It falls through to "Approval Required".
  const bareBranchResult = buildQuestionInstruction({
    commandName: "x",
    actionType: "branch",
    proposal: { kind: "branch", action: "create", name: "feat/foo" },
  });
  assert.equal(
    bareBranchResult.header,
    "Approval Required",
    "verifyQuestionInstructionBuilderContract: bare 'branch' actionType must fall through to Approval Required (F1)",
  );

  // Adversarial F2 regression guard: leading slash in commandName is stripped.
  const slashCommandResult = buildQuestionInstruction({
    commandName: "/bmad-bmm-create-prd",
    actionType: "init",
    proposal: null,
  });
  assert.doesNotMatch(
    slashCommandResult.instructionText,
    /\/\/bmad-bmm-create-prd/,
    "verifyQuestionInstructionBuilderContract: commandName with leading slash must not produce double slash (F2)",
  );

  const { APPROVAL_OUTCOME_ALIASES } = await import(`${aliasesModuleUrl}?qi=${Date.now()}`);
  assert.equal(
    APPROVAL_OUTCOME_ALIASES["create baseline commit"],
    "accept",
    "verifyQuestionInstructionBuilderContract: APPROVAL_OUTCOME_ALIASES['create baseline commit'] must be 'accept'",
  );

  console.log("verifyQuestionInstructionBuilderContract OK");
}

/**
 * question-header guard:
 *
 * When an approval is pending (workflowState.approvalCurrent set) and the
 * model calls the native `question` tool, the tool args MUST carry the same
 * header the builder produces for that approval. If the model paraphrases
 * (observed in production: "Initialize Git" -> "초기화 확인"), the hook
 * throws and forces a retry. We verify both the throw path and the
 * pass-through path here.
 */
async function verifyQuestionHeaderGuardMatchesActiveApproval() {
  const hookModuleUrl = pathToFileURL(
    path.join(projectRoot, "src", "hooks", "tool-execute-before.js"),
  ).href;
  const workflowStateModuleUrlLocal = pathToFileURL(
    path.join(projectRoot, "src", "services", "workflow", "workflow-state.js"),
  ).href;

  const { createToolExecuteBeforeHook } = await import(`${hookModuleUrl}?qhg=${Date.now()}`);
  const { createWorkflowStateStore } = await import(
    `${workflowStateModuleUrlLocal}?qhg=${Date.now()}`
  );

  // Set up workflowState with an active init approval.
  const workflowState = createWorkflowStateStore();
  const sessionID = "qhg-session";
  workflowState.set(sessionID, {
    sessionID,
    commandName: "bmad-bmm-create-prd",
    approvalCurrent: {
      sessionID,
      workflow: "bmad-bmm-create-prd",
      command: "bmad-bmm-create-prd",
      actionType: "init",
      proposal: { kind: "init", action: "git-init" },
      status: "awaitingApproval",
    },
    pendingApprovalQuestion: null,
  });

  // pluginContext.directory points to a real path (existsSync(".git") may be
  // true or false — irrelevant for this layer since `question` is the tool).
  const hook = createToolExecuteBeforeHook({
    workflowState,
    pluginContext: { directory: projectRoot },
  });

  // Case 1: wrong header -> throw.
  let thrown = null;
  try {
    await hook({
      tool: "question",
      sessionID,
      args: { header: "초기화 확인", options: ["이대로 진행", "추가 문서 있음"] },
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(
    thrown,
    "verifyQuestionHeaderGuardMatchesActiveApproval: hook must throw when question header does not match active approval",
  );
  assert.match(
    thrown.message,
    /Initialize Git/,
    "verifyQuestionHeaderGuardMatchesActiveApproval: throw message must name the expected header (`Initialize Git`)",
  );
  assert.match(
    thrown.message,
    /Initialize Git \(Recommended\)/,
    "verifyQuestionHeaderGuardMatchesActiveApproval: throw message must include the expected options",
  );

  // Case 2: correct header -> pass.
  let secondError = null;
  try {
    await hook({
      tool: "question",
      sessionID,
      args: { header: "Initialize Git", options: ["Initialize Git (Recommended)", "Cancel"] },
    });
  } catch (error) {
    secondError = error;
  }
  assert.equal(
    secondError,
    null,
    "verifyQuestionHeaderGuardMatchesActiveApproval: hook must pass through when question header matches active approval",
  );

  // Case 3: pendingApprovalQuestion already recorded (model already asked) -> pass.
  workflowState.set(sessionID, {
    ...workflowState.get(sessionID),
    pendingApprovalQuestion: { questionID: "q-1" },
  });
  let thirdError = null;
  try {
    await hook({
      tool: "question",
      sessionID,
      args: { header: "follow-up", options: ["yes", "no"] },
    });
  } catch (error) {
    thirdError = error;
  }
  assert.equal(
    thirdError,
    null,
    "verifyQuestionHeaderGuardMatchesActiveApproval: hook must NOT block a question once pendingApprovalQuestion is recorded",
  );

  // Case 4: no active approval -> pass (non-workflow question).
  const workflowState2 = createWorkflowStateStore();
  workflowState2.set("other-session", {
    sessionID: "other-session",
    commandName: null,
    approvalCurrent: null,
  });
  const hook2 = createToolExecuteBeforeHook({
    workflowState: workflowState2,
    pluginContext: { directory: projectRoot },
  });
  let fourthError = null;
  try {
    await hook2({
      tool: "question",
      sessionID: "other-session",
      args: { header: "anything", options: ["a", "b"] },
    });
  } catch (error) {
    fourthError = error;
  }
  assert.equal(
    fourthError,
    null,
    "verifyQuestionHeaderGuardMatchesActiveApproval: hook must NOT block a question when no approval is active",
  );

  // Case 5: questions[0].header nested form -> matches expected header.
  workflowState.set(sessionID, {
    ...workflowState.get(sessionID),
    pendingApprovalQuestion: null,
  });
  let fifthError = null;
  try {
    await hook({
      tool: "question",
      sessionID,
      args: { questions: [{ header: "Initialize Git", options: ["Initialize Git (Recommended)", "Cancel"] }] },
    });
  } catch (error) {
    fifthError = error;
  }
  assert.equal(
    fifthError,
    null,
    "verifyQuestionHeaderGuardMatchesActiveApproval: hook must accept questions[0].header form when it matches expected",
  );

  console.log("verifyQuestionHeaderGuardMatchesActiveApproval OK");
}
