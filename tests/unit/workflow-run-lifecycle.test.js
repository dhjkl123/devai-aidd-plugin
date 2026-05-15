import assert from "node:assert/strict";

import {
  buildWorkflowRunKey,
  createWorkflowRunRecord,
  describeStartupChainSkip,
  isExplicitWorkflowRestartIntent,
  resolveWorkflowRunTransition,
  updateWorkflowRunFinalization,
  updateWorkflowRunStartup,
} from "../../src/services/workflow/workflow-run-lifecycle.js";

const workflowContext = {
  sessionID: "unit-run",
  commandName: "bmad-bmm-quick-dev",
  arguments: "ABC-123 startup replay",
  phase: "start",
};

assert.equal(
  buildWorkflowRunKey(workflowContext),
  "bmad-bmm-quick-dev::abc-123 startup replay",
);

assert.equal(isExplicitWorkflowRestartIntent("다시 시작"), true);
assert.equal(isExplicitWorkflowRestartIntent("please restart workflow"), true);
assert.equal(isExplicitWorkflowRestartIntent("normal follow-up"), false);

const initialRun = createWorkflowRunRecord({ workflowContext, now: "2026-05-15T00:00:00.000Z" });
assert.equal(initialRun.startup.status, "not-started");
assert.equal(initialRun.finalization.status, "not-finalized");

const resolvedStartupRun = updateWorkflowRunStartup(initialRun, {
  status: "resolved",
  reason: "startup-chain-complete",
  terminal: true,
  resolvedAt: "2026-05-15T00:01:00.000Z",
});
assert.equal(
  describeStartupChainSkip({ workflowRun: resolvedStartupRun, state: {} }).reason,
  "startup-already-resolved",
);

const finalizedRun = updateWorkflowRunFinalization(resolvedStartupRun, {
  outcome: "skip",
  reason: "user-skipped",
  resolvedAt: "2026-05-15T00:02:00.000Z",
});
assert.equal(
  describeStartupChainSkip({ workflowRun: finalizedRun, state: {} }).reason,
  "workflow-run-finalized",
);

const reusedTransition = resolveWorkflowRunTransition({
  priorState: { workflowRunCurrent: resolvedStartupRun },
  workflowContext,
});
assert.equal(reusedTransition.reused, true);
assert.equal(reusedTransition.workflowRun.runId, resolvedStartupRun.runId);

const restartedTransition = resolveWorkflowRunTransition({
  priorState: { workflowRunCurrent: resolvedStartupRun },
  workflowContext: { ...workflowContext, arguments: "ABC-123 startup replay 다시 시작" },
});
assert.equal(restartedTransition.reused, false);
assert.notEqual(restartedTransition.workflowRun.runId, resolvedStartupRun.runId);
assert.equal(restartedTransition.explicitRestart, true);

console.log("workflow-run-lifecycle OK");
