/**
 * E2E: repository readiness when the workspace is NOT a git repo.
 *
 * Pipeline under test:
 *   command.execute.before
 *     -> checkRepositoryReadiness  (real `git` binary in non-repo dir)
 *     -> emits readiness=ask, init proposal
 *     -> branch planning is skipped (shouldSkipBranchPlanning)
 *     -> publishNextPlannedAction publishes the init approval
 *
 * Verifies:
 *   - git.readiness.checked outcome is "ask" with isGitRepository=false
 *   - git.action.planned with kind="init" fires (init proposal queued)
 *   - no branch planning audit fires
 *   - approval prompt for init is delivered
 */

import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  findAuditEvents,
  findFirstAuditEvent,
  findApprovalPrompt,
  runScenario,
} from "./helpers.js";

async function uninitializedRepositoryProposesInit() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);

    const sessionID = "e2e-readiness-noninit";
    await handlers["command.execute.before"](
      {
        command: "/bmad-bmm-create-prd",
        arguments: "",
        sessionID,
      },
      { parts: [] },
    );

    const readiness = findFirstAuditEvent(mock.logs, "git.readiness.checked");
    assert.ok(readiness, "git.readiness.checked event present");
    assert.equal(readiness.outcome, "ask", "non-repo readiness must be ask");
    assert.equal(readiness.details.isGitRepository, false);

    const planned = findAuditEvents(mock.logs, "git.action.planned");
    const initPlanned = planned.find((event) => event.details?.kind === "init");
    assert.ok(initPlanned, "init action planned for non-repo workspace");
    assert.equal(initPlanned.details.requiresApproval, true);

    const branchPlanned = planned.find((event) => event.details?.kind === "branch");
    assert.equal(
      branchPlanned,
      undefined,
      "branch planning must be skipped when readiness=ask/git-not-initialized",
    );

    const approvalRequested = findFirstAuditEvent(mock.logs, "approval.requested");
    assert.ok(approvalRequested, "approval.requested fired for the init proposal");
    assert.equal(approvalRequested.details.actionKind, "init");

    const prompt = findApprovalPrompt(mock.prompts);
    assert.ok(prompt, "init approval prompt delivered to runtime");
    assert.equal(prompt.parts[0].metadata.actionType, "init");
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function nativeEventGitInitApprovalFlow() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-native-init";

    // Native command.executed drives workflow detection + init proposal +
    // approval publish — no legacy command.execute.before call.
    await handlers.event({
      event: {
        type: "command.executed",
        properties: {
          sessionID,
          name: "/bmad-bmm-create-prd",
          arguments: "",
        },
      },
    });

    const approvalRequested = findFirstAuditEvent(mock.logs, "approval.requested");
    assert.ok(
      approvalRequested,
      "native command.executed must publish approval.requested",
    );
    assert.equal(approvalRequested.details.actionKind, "init");

    const prompt = findApprovalPrompt(mock.prompts);
    assert.ok(prompt, "native command.executed must deliver approval prompt");
    assert.equal(
      prompt.directory,
      directory,
      "init approval prompt must carry the workflow directory",
    );
    const md = prompt.parts[0].metadata;
    assert.equal(md.actionType, "init");
    assert.equal(md.questionHeader, "Initialize Git");

    // Simulate the native question.asked → question.replied chain.
    const questionID = "native-init-question";
    await handlers.event({
      event: {
        type: "question.asked",
        properties: {
          sessionID,
          id: questionID,
          header: "Initialize Git",
        },
      },
    });

    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          requestID: questionID,
          answers: [["Initialize Git (Recommended)"]],
        },
      },
    });

    // The approve answer triggers executeApprovedAction for init? Actually
    // init is not commit/push so the shared resolver only emits the audit
    // chain. Verify approval.resolved present with accept outcome.
    const resolved = findAuditEvents(mock.logs, "approval.resolved");
    assert.equal(
      resolved.length,
      1,
      `native question.replied must produce exactly one approval.resolved; got ${resolved.length}`,
    );
    assert.equal(resolved[0].outcome, "accept");
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario(
  "readiness: uninitialized workspace proposes init and skips branch planning",
  uninitializedRepositoryProposesInit,
);
await runScenario(
  "native: git init approval flow via command.executed → question.asked → question.replied",
  nativeEventGitInitApprovalFlow,
);
