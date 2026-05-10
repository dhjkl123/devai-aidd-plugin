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

await runScenario(
  "readiness: uninitialized workspace proposes init and skips branch planning",
  uninitializedRepositoryProposesInit,
);
