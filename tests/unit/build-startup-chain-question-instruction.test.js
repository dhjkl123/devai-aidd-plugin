import assert from "node:assert/strict";

import {
  buildStartupChainQuestionInstruction,
  buildStartupChainQuestionText,
  buildStartupChainToolQuestions,
} from "../../src/services/approval/build-startup-chain-question-instruction.js";
import { buildStartupChainPlan } from "../../src/services/git/startup-chain-planner.js";

const workflowContext = {
  sessionID: "unit-session",
  commandName: "bmad-bmm-quick-dev",
  normalizedCommand: "bmad-bmm-quick-dev",
  arguments: "ABC-123 startup matrix",
};
const workflowPolicy = {
  category: "implementation",
  identityStrategy: "ticket-or-args",
  branchRequired: true,
  finalization: "commit-and-push",
};
const branchConfig = {
  pattern: "{type}/{ticket}-{slug}",
  defaultType: "feat",
  fallbackTicket: "no-ticket",
  longLivedBranches: ["main", "master"],
  validationRegex: "^(feat)\\/[A-Z]+-\\d+-[a-z0-9-]+$",
  commandTypeMap: { "bmad-bmm-quick-dev": "feat" },
};

function plan(readiness, currentBranch = null) {
  return buildStartupChainPlan({
    readiness,
    workflowContext,
    workflowPolicy,
    branchConfig,
    currentBranch,
    state: {},
  });
}

{
  const result = buildStartupChainQuestionInstruction({
    ...plan({
      outcome: "ask",
      reason: "git-not-initialized",
      details: { isGitRepository: false, hasCommit: false, proposal: { kind: "init" } },
    }),
    startupChainId: "chain-1",
    sessionID: "unit-session",
    commandName: "bmad-bmm-quick-dev",
  });
  assert.deepEqual(result.questions.map((q) => q.key), ["init", "baseline", "branch"]);
  assert.deepEqual(result.metadata.questionIds, ["chain-1:init", "chain-1:baseline", "chain-1:branch"]);
  assert.match(result.instructionText, /Do not omit `question`\./);
  assert.match(result.instructionText, /"question":"Initialize Git for this workspace before the workflow continues\?"/);
}

{
  const result = buildStartupChainQuestionInstruction({
    ...plan({
      outcome: "allow",
      details: { isGitRepository: true, hasCommit: false, branch: "main" },
    }, "main"),
    startupChainId: "chain-2",
    sessionID: "unit-session",
    commandName: "bmad-bmm-quick-dev",
  });
  assert.deepEqual(result.questions.map((q) => q.key), ["baseline", "branch"]);
}

{
  const result = buildStartupChainQuestionInstruction({
    ...plan({
      outcome: "allow",
      details: { isGitRepository: true, hasCommit: true, branch: "main" },
    }, "main"),
    startupChainId: "chain-3",
    sessionID: "unit-session",
    commandName: "bmad-bmm-quick-dev",
  });
  assert.deepEqual(result.questions.map((q) => q.key), ["branch"]);
}

{
  const ready = plan({
    outcome: "allow",
    details: {
      isGitRepository: true,
      hasCommit: true,
      branch: "feat/ABC-123-startup-matrix",
    },
  }, "feat/ABC-123-startup-matrix");
  assert.equal(ready.shouldAsk, false);
  assert.deepEqual(ready.steps.map((q) => q.key), []);
}

{
  const branchDecision = buildStartupChainQuestionInstruction({
    shouldAsk: true,
    reason: "repository-ready",
    steps: [
      {
        key: "branch",
        action: "stay",
        proposal: { name: "feat/ABC-123-startup-matrix" },
      },
    ],
    startupChainId: "chain-4",
    sessionID: "unit-session",
    commandName: "bmad-bmm-quick-dev",
  });
  assert.deepEqual(branchDecision.questions[0].options, ["Proceed On Current Branch (Recommended)", "Skip"]);
  assert.equal(branchDecision.questions[0].header, "Branch Decision");
  assert.equal(
    buildStartupChainQuestionText(branchDecision.questions[0]),
    "Proceed on feat/ABC-123-startup-matrix before editing files?",
  );
}

{
  const result = buildStartupChainToolQuestions({
    ...plan({
      outcome: "ask",
      reason: "git-not-initialized",
      details: { isGitRepository: false, hasCommit: false, proposal: { kind: "init" } },
    }),
    startupChainId: "chain-5",
    sessionID: "unit-session",
    commandName: "bmad-bmm-quick-dev",
  });
  assert.equal(result[0].question, "Initialize Git for this workspace before the workflow continues?");
  assert.equal(result[1].question, "Create a baseline commit before starting workflow changes?");
}

{
  const unavailable = plan({
    outcome: "skip",
    reason: "readiness-check-unavailable",
    details: {
      isGitRepository: false,
      hasCommit: false,
      branch: null,
      failedProbe: "rev-parse-inside-work-tree",
    },
  });
  assert.equal(unavailable.shouldAsk, false);
  assert.deepEqual(unavailable.steps.map((q) => q.key), []);
}

console.log("build-startup-chain-question-instruction OK");
