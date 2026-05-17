import assert from "node:assert/strict";

import {
  buildApprovalResolution,
  buildApprovalResolvedAudit,
  buildGitActionSkippedAudit,
  deriveActionKind,
} from "../../src/services/approval/build-approval-resolution.js";

assert.equal(deriveActionKind("branch/create"), "branch");
assert.equal(deriveActionKind("push"), "push");
assert.equal(deriveActionKind(""), null);
assert.equal(deriveActionKind(null), null);

const request = {
  id: "approval-1",
  actionId: "action-1",
  sessionID: "session-1",
  actionType: "branch/create",
  phase: "startup",
  workflow: "bmad-bmm-quick-dev",
  command: "bmad-bmm-quick-dev",
  proposal: {
    kind: "branch",
    action: "create",
    correlationId: "corr-123",
  },
  metadata: {
    finalization: "commit-and-push",
  },
};

{
  const resolution = buildApprovalResolution({
    request,
    outcome: "accept",
    resolvedAt: "2026-05-18T00:10:00.000Z",
    resolvedBy: "question.replied",
  });

  assert.equal(resolution.approvalId, "approval-1");
  assert.equal(resolution.actionId, "action-1");
  assert.equal(resolution.actionKind, "branch");
  assert.equal(resolution.status, "accept");
  assert.equal(resolution.previousStatus, "pending");
  assert.equal(resolution.continuation, "execute-now");
  assert.equal(resolution.metadata.phase, "startup");

  const audit = buildApprovalResolvedAudit({
    request,
    resolution,
    hadActiveApproval: true,
  });
  assert.equal(audit.event, "approval.resolved");
  assert.equal(audit.actionId, "action-1");
  assert.equal(audit.outcome, "accept");
  assert.equal(audit.details.correlationId, "corr-123");
  assert.equal(audit.details.finalizationMode, "commit-and-push");
  assert.equal(audit.details.hadActiveApproval, true);

  assert.equal(buildGitActionSkippedAudit({ request, resolution }), null);
}

{
  const resolution = buildApprovalResolution({
    request,
    outcome: "deny",
    resolvedAt: "2026-05-18T00:11:00.000Z",
    reasonCode: "user-denied",
  });

  assert.equal(resolution.continuation, "continue-without-action");
  assert.equal(resolution.reasonCode, "user-denied");

  const skipped = buildGitActionSkippedAudit({
    request,
    resolution,
  });
  assert.equal(skipped.event, "git.action.skipped");
  assert.equal(skipped.details.reason, "approval-denied");
  assert.equal(skipped.details.correlationId, "corr-123");
  assert.equal(skipped.details.finalizationMode, "commit-and-push");
}

{
  const resolution = buildApprovalResolution({
    request,
    outcome: "ignore-and-continue",
    resolvedAt: "2026-05-18T00:12:00.000Z",
  });

  const skipped = buildGitActionSkippedAudit({
    request,
    resolution,
  });
  assert.equal(skipped.details.reason, "approval-ignored");
  assert.equal(skipped.details.continuation, "continue-without-action");
}

console.log("build-approval-resolution OK");
