import assert from "node:assert/strict";

import {
  buildActionId,
  buildApprovalRequest,
} from "../../src/services/approval/build-approval-request.js";

{
  const proposalA = {
    kind: "branch",
    action: "create",
    name: "feat/abc-123-guard",
    current: "main",
  };
  const proposalB = {
    ...proposalA,
    current: "release/1.0",
  };

  assert.equal(
    buildActionId("branch/create", proposalA),
    "action:branch/create:branch:create:feat/abc-123-guard:from:main",
  );
  assert.notEqual(
    buildActionId("branch/create", proposalA),
    buildActionId("branch/create", proposalB),
  );
}

{
  const request = buildApprovalRequest({
    sessionID: "session-init",
    workflow: "bmad-bmm-create-prd",
    command: "bmad-bmm-create-prd",
    phase: "startup",
    actionType: "init",
    proposal: {
      kind: "init",
      action: "git-init",
      directory: "C:/Users/User/Desktop/secret-project",
    },
    workflowContext: {
      commandName: "bmad-bmm-create-prd",
      normalizedCommand: "bmad-bmm-create-prd",
    },
    workflowPolicy: {
      category: "planning",
      identityStrategy: "artifact-singleton",
      branchRequired: true,
      finalization: "commit-optional-push",
    },
    readiness: {
      reason: "git-not-initialized",
    },
    createdAt: "2026-05-18T00:00:00.000Z",
  });

  assert.equal(request.status, "awaitingApproval");
  assert.equal(request.createdAt, "2026-05-18T00:00:00.000Z");
  assert.equal(request.id, "approval:session-init:init:init:git-init:C:/Users/User/Desktop/secret-project");
  assert.equal(request.actionId, "action:init:init:git-init:C:/Users/User/Desktop/secret-project");
  assert.equal(request.prompt.title, "Approval Required");
  assert.equal(request.prompt.summary, request.metadata.explanation.intentSummary);
  assert.equal(request.prompt.lines.length, 4);
  assert.equal(request.metadata.event, "approval.requested");
  assert.equal(request.metadata.actionCategory, "init");
  assert.equal(request.metadata.policyCategory, "planning");
  assert.equal(request.metadata.identityStrategy, "artifact-singleton");
  assert.equal(request.metadata.finalization, "commit-optional-push");
  assert.equal(request.metadata.explanation.fallback, false);

  const serialized = JSON.stringify({
    prompt: request.prompt,
    metadata: request.metadata,
  });
  assert.match(serialized, /current working directory/);
  assert.doesNotMatch(serialized, /secret-project/);
}

{
  const request = buildApprovalRequest({
    sessionID: "session-push",
    workflow: "bmad-bmm-quick-dev",
    command: "bmad-bmm-quick-dev",
    phase: "finalize",
    actionType: "push",
    proposal: {
      kind: "push",
      action: "push",
      remoteName: "https://token@example.com/private.git",
      branchName: "feat/abc-123-guard",
      correlationId: "push-123",
    },
    workflowContext: {
      normalizedCommand: "bmad-bmm-quick-dev",
    },
    workflowPolicy: {
      category: "implementation",
      identityStrategy: "ticket-or-args",
      finalization: "commit-and-push",
    },
  });

  assert.equal(request.metadata.explanation.fields.targetRemoteLabel, null);
  assert.equal(request.metadata.explanation.fields.targetBranchLabel, "feat/abc-123-guard");
  assert.equal(request.metadata.explanation.fields.finalizationMode, "commit-and-push");
}

console.log("build-approval-request OK");
