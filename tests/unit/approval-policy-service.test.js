import assert from "node:assert/strict";

import {
  evaluateRequestGate,
  getPendingApproval,
  selectNextPlannedAction,
} from "../../src/services/approval/approval-policy-service.js";

assert.equal(getPendingApproval(null), null);
assert.equal(getPendingApproval({}), null);
assert.deepEqual(
  getPendingApproval({ approvalCurrent: { id: "approval-1", status: "pending" } }),
  { id: "approval-1", status: "pending" },
);

{
  const proposal = { kind: "branch", action: "create", name: "feat/test" };
  const state = {
    pendingActions: [{ proposal }],
    initProposal: { kind: "init", action: "git-init" },
    branchProposal: { kind: "branch", action: "switch", name: "feat/other" },
    commitProposal: { kind: "commit", action: "commit" },
    pushProposal: { kind: "push", action: "push" },
  };
  assert.deepEqual(selectNextPlannedAction(state), proposal);
}

assert.deepEqual(
  selectNextPlannedAction({
    initProposal: { kind: "init", action: "git-init" },
    branchProposal: { kind: "branch", action: "create", name: "feat/test" },
  }),
  { kind: "init", action: "git-init" },
);

assert.deepEqual(
  selectNextPlannedAction({
    branchProposal: { kind: "branch", action: "create", name: "feat/test" },
    commitProposal: { kind: "commit", action: "commit" },
  }),
  { kind: "branch", action: "create", name: "feat/test" },
);

assert.deepEqual(
  selectNextPlannedAction({
    commitProposal: { kind: "commit", action: "commit" },
    pushProposal: { kind: "push", action: "push" },
  }),
  { kind: "commit", action: "commit" },
);

assert.deepEqual(
  selectNextPlannedAction({
    pushProposal: { kind: "push", action: "push" },
  }),
  { kind: "push", action: "push" },
);

assert.equal(selectNextPlannedAction({ pendingActions: [{ proposal: null }] }), null);
assert.equal(selectNextPlannedAction({}), null);

assert.deepEqual(
  evaluateRequestGate({
    approvalCurrent: { id: "approval-1", status: "pending" },
    initProposal: { kind: "init", action: "git-init" },
  }),
  { outcome: "skip", reason: "approval-already-pending" },
);

assert.deepEqual(evaluateRequestGate({}), {
  outcome: "skip",
  reason: "no-planned-git-action",
});

assert.deepEqual(
  evaluateRequestGate({
    pendingActions: [{ proposal: { kind: "commit", action: "commit" } }],
  }),
  { outcome: "allow", reason: "ready-to-publish" },
);

console.log("approval-policy-service OK");
