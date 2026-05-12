/**
 * E2E: workflow detection + readiness + branch planning happy path.
 *
 * Pipeline under test:
 *   command.execute.before
 *     -> detectWorkflowContext
 *     -> checkRepositoryReadiness (real `git` binary)
 *     -> evaluateBranchStrategy / buildBranchProposal
 *     -> publishNextPlannedAction (approval prompt)
 *
 * Verifies:
 *   - workflow.detected audit event fires once with the expected command
 *   - git.readiness.checked audit reflects a real, initialized repo
 *   - approval.requested audit + approval prompt are emitted for the branch
 *     proposal because the seed branch (`main`) is not the workflow branch
 */

import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  findAuditEvents,
  findFirstAuditEvent,
  runScenario,
} from "./helpers.js";

async function happyPathDetectsWorkflowAndPublishesBranchApproval() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);

    const sessionID = "e2e-workflow-detection";
    const output = { parts: [] };
    await handlers["command.execute.before"](
      {
        command: "/bmad-bmm-quick-dev",
        arguments: "ABC-123 add feature",
        sessionID,
      },
      output,
    );

    const detectedEvents = findAuditEvents(mock.logs, "workflow.detected");
    assert.equal(detectedEvents.length, 1, "exactly one workflow.detected event");
    assert.equal(detectedEvents[0].command, "bmad-bmm-quick-dev");
    assert.equal(detectedEvents[0].sessionID, sessionID);

    const readiness = findFirstAuditEvent(mock.logs, "git.readiness.checked");
    assert.ok(readiness, "git.readiness.checked event present");
    assert.equal(readiness.outcome, "allow", "readiness allows on initialized repo");
    assert.equal(readiness.details.isGitRepository, true);
    assert.equal(readiness.details.branch, "main");

    const startupRequested = findFirstAuditEvent(mock.logs, "startup.chain.requested");
    assert.ok(startupRequested, "startup.chain.requested fired for branch startup step");
    assert.deepEqual(startupRequested.details.questionKeys, ["branch"]);
    assert.equal(startupRequested.sessionID, sessionID);

    assert.equal(mock.prompts.length, 0, "startup prompt must not use promptAsync");
    const startupPart = output.parts.find((part) => part?.metadata?.startupChain === true);
    assert.ok(startupPart, "startup instruction part was emitted");
    assert.deepEqual(startupPart.metadata.questionKeys, ["branch"]);
    assert.match(startupPart.text, /native `question` tool/);
    assert.doesNotMatch(startupPart.text, /devai_git_startup_approval/);
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function nonWorkflowCommandIsIgnored() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);

    await handlers["command.execute.before"](
      { command: "/something-unrelated", arguments: "", sessionID: "e2e-unrelated" },
      { parts: [] },
    );

    assert.equal(
      findAuditEvents(mock.logs, "workflow.detected").length,
      0,
      "workflow.detected must not fire for unrelated commands",
    );
    assert.equal(
      findAuditEvents(mock.logs, "approval.requested").length,
      0,
      "approval.requested must not fire for unrelated commands",
    );
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario(
  "workflow detection: happy path publishes branch approval",
  happyPathDetectsWorkflowAndPublishesBranchApproval,
);
await runScenario(
  "workflow detection: non-workflow command is a no-op",
  nonWorkflowCommandIsIgnored,
);
