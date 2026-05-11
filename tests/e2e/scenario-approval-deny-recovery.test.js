/**
 * E2E: approval-denied → recovery gate opens → recovery prompt delivered.
 *
 * Pipeline under test:
 *   command.execute.before          (publishes branch approval)
 *     -> permission.asked (deny)    (consumeApprovalOutcome -> deny)
 *        -> openRecoveryFromApproval
 *        -> requestRecoveryDecision (recovery prompt)
 *
 * Verifies:
 *   - approval.requested fires for branch proposal
 *   - approval.resolved fires with outcome=deny after permission.asked
 *   - a recovery gate is opened (recovery.gate.opened audit)
 *   - the recovery prompt is delivered to the runtime in addition to the
 *     original approval prompt
 *   - hook never throws (a permission.asked throw would be misread by the
 *     runtime as a permission failure)
 */

import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  findAuditEvents,
  findApprovalPrompt,
  readApprovalIdentifiers,
  runScenario,
} from "./helpers.js";

async function denyOpensRecoveryGateAndDeliversRecoveryPrompt() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);

    const sessionID = "e2e-approval-deny";

    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "", sessionID },
      { parts: [] },
    );

    const approvalPrompt = findApprovalPrompt(mock.prompts);
    assert.ok(approvalPrompt, "approval prompt was delivered before deny");
    const { requestId, actionId } = readApprovalIdentifiers(approvalPrompt);
    assert.ok(requestId, "approval prompt carried a requestId echo");
    assert.ok(actionId, "approval prompt carried an actionId echo");

    const promptCountBeforeDeny = mock.prompts.length;

    await handlers["permission.asked"]({
      sessionID,
      tool: "bash",
      requestId,
      actionId,
      outcome: "deny",
    });

    const resolved = findAuditEvents(mock.logs, "approval.resolved");
    assert.equal(resolved.length, 1, "approval.resolved fired exactly once");
    assert.equal(resolved[0].outcome, "deny");
    assert.equal(resolved[0].sessionID, sessionID);

    const gateOffered = findAuditEvents(mock.logs, "git.action.recovery.offered");
    assert.ok(
      gateOffered.length >= 1,
      "git.action.recovery.offered fired after deny (gate opened)",
    );
    assert.equal(
      gateOffered[0].details?.sessionID,
      sessionID,
      "recovery gate is scoped to the denying session",
    );
    assert.ok(
      gateOffered[0].details?.gateId,
      "recovery gate carries a gateId",
    );

    assert.ok(
      mock.prompts.length > promptCountBeforeDeny,
      "a recovery prompt was delivered after the deny",
    );

    const recoveryPrompt = mock.prompts[mock.prompts.length - 1];
    const md = recoveryPrompt?.parts?.[0]?.metadata ?? {};
    assert.ok(md.recoveryGateId, "recovery prompt metadata carries a gate id");
    assert.equal(recoveryPrompt.sessionID, sessionID);
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function permissionAskedNeverThrowsOnUnknownPayload() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers } = await bootstrapPlugin(directory);

    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "", sessionID: "e2e-unknown" },
      { parts: [] },
    );

    let threw = null;
    try {
      await handlers["permission.asked"]({
        sessionID: "e2e-unknown",
        tool: "bash",
        outcome: "garbage-not-a-real-outcome",
      });
    } catch (error) {
      threw = error;
    }
    assert.equal(
      threw,
      null,
      "permission.asked must never throw — runtime would misread it as a permission failure",
    );
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function nativeQuestionRepliedDenyOpensRecovery() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-native-deny";

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

    const approvalPrompt = findApprovalPrompt(mock.prompts);
    assert.ok(approvalPrompt, "native command.executed must deliver approval prompt");
    const { requestId } = readApprovalIdentifiers(approvalPrompt);
    assert.ok(requestId, "approval prompt carries requestId");

    const questionID = "native-deny-q";
    await handlers.event({
      event: {
        type: "question.asked",
        properties: {
          sessionID,
          id: questionID,
          header: approvalPrompt.parts[0].metadata.questionHeader,
        },
      },
    });

    const promptsBeforeDeny = mock.prompts.length;
    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          requestID: questionID,
          answers: [["Deny"]],
        },
      },
    });

    const resolved = findAuditEvents(mock.logs, "approval.resolved");
    assert.equal(resolved.length, 1, "approval.resolved fired exactly once");
    assert.equal(resolved[0].outcome, "deny");

    const gateOffered = findAuditEvents(mock.logs, "git.action.recovery.offered");
    assert.ok(
      gateOffered.length >= 1,
      "native deny must open a recovery gate",
    );

    assert.ok(
      mock.prompts.length > promptsBeforeDeny,
      "native deny must deliver a recovery prompt",
    );
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function nativeQuestionRejectedTreatsAsDeny() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-native-rejected";

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

    const approvalPrompt = findApprovalPrompt(mock.prompts);
    assert.ok(approvalPrompt, "native command.executed must deliver approval prompt");

    const questionID = "native-rejected-q";
    await handlers.event({
      event: {
        type: "question.asked",
        properties: {
          sessionID,
          id: questionID,
          header: approvalPrompt.parts[0].metadata.questionHeader,
        },
      },
    });

    await handlers.event({
      event: {
        type: "question.rejected",
        properties: {
          sessionID,
          requestID: questionID,
        },
      },
    });

    const resolved = findAuditEvents(mock.logs, "approval.resolved");
    assert.equal(resolved.length, 1, "question.rejected must produce exactly one approval.resolved");
    assert.equal(resolved[0].outcome, "deny");
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario(
  "approval deny: opens recovery gate and delivers recovery prompt",
  denyOpensRecoveryGateAndDeliversRecoveryPrompt,
);
await runScenario(
  "permission.asked never throws on unknown payload",
  permissionAskedNeverThrowsOnUnknownPayload,
);
await runScenario(
  "native: question.replied deny opens recovery gate",
  nativeQuestionRepliedDenyOpensRecovery,
);
await runScenario(
  "native: question.rejected is treated as controlled deny",
  nativeQuestionRejectedTreatsAsDeny,
);
