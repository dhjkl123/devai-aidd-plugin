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

// strengthen-git-init-proposal — bash+git block scenarios (Task 12)
async function bashGitBlockedWhileInitPending() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const { handlers } = await bootstrapPlugin(directory);
    const sessionID = "e2e-bash-block";

    // Trigger workflow → init proposal lands in state.
    await handlers["command.execute.before"](
      { command: "/bmad-bmm-create-prd", arguments: "", sessionID },
      { parts: [] },
    );

    let thrown = null;
    try {
      await handlers["tool.execute.before"]({
        sessionID,
        tool: "bash",
        args: { command: "git status" },
      });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, "bash+git must throw while init proposal is pending");
    assert.match(
      thrown.message,
      /git repository must be initialized before running git commands/,
      `bash+git throw message must match canonical; got ${JSON.stringify(thrown.message)}`,
    );

    // Non-git bash command must pass through.
    await handlers["tool.execute.before"]({
      sessionID,
      tool: "bash",
      args: { command: "ls" },
    });
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function initAcceptCreatesGitDir() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { handlers } = await bootstrapPlugin(directory);
    const sessionID = "e2e-init-accept-creates-git";

    await handlers.event({
      event: {
        type: "command.executed",
        properties: { sessionID, name: "/bmad-bmm-create-prd", arguments: "" },
      },
    });

    const questionID = "init-q-1";
    await handlers.event({
      event: { type: "question.asked", properties: { sessionID, id: questionID, header: "Initialize Git" } },
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

    // Verify real .git directory exists post-accept.
    assert.equal(
      fs.existsSync(path.join(directory, ".git")),
      true,
      "git init must create .git directory after accept",
    );
    // .gitignore must exist with the DEFAULT_GITIGNORE_LINES contents.
    const gitignorePath = path.join(directory, ".gitignore");
    assert.equal(fs.existsSync(gitignorePath), true, ".gitignore must be auto-written");
    const gitignoreBody = fs.readFileSync(gitignorePath, "utf8");
    for (const line of ["node_modules/", "dist/", ".env", "_bmad-output/", ".claude/"]) {
      assert.ok(
        gitignoreBody.includes(line),
        `default .gitignore must include ${line}; got: ${gitignoreBody}`,
      );
    }
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function initAcceptPublishesBaselineCommit() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-init-accept-publishes-commit";

    await handlers.event({
      event: {
        type: "command.executed",
        properties: { sessionID, name: "/bmad-bmm-create-prd", arguments: "" },
      },
    });
    const questionID = "init-q-2";
    await handlers.event({
      event: { type: "question.asked", properties: { sessionID, id: questionID, header: "Initialize Git" } },
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

    // After init accept, a baseline commit `git.action.planned` event must
    // have fired (load-bearing assertion — TD #11/AC11).
    const planned = findAuditEvents(mock.logs, "git.action.planned");
    const baselinePlanned = planned.find(
      (e) => e.details?.kind === "commit" && e.details?.action === "baseline-commit",
    );
    assert.ok(
      baselinePlanned,
      `baseline commit must be planned after init accept; got planned events: ${JSON.stringify(planned.map((p) => p.details))}`,
    );

    // A second approval prompt (the baseline commit) must have been delivered.
    const commitPrompt = mock.prompts.find(
      (p) => p?.parts?.[0]?.metadata?.actionType === "commit",
    );
    assert.ok(
      commitPrompt,
      "baseline commit approval prompt must be delivered after init accept",
    );
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
await runScenario(
  "block: bash+git is blocked while init proposal pending; non-git bash passes",
  bashGitBlockedWhileInitPending,
);
await runScenario(
  "init: accept executes git init + writes .gitignore",
  initAcceptCreatesGitDir,
);
await runScenario(
  "init: accept publishes baseline commit prompt via post-init chain",
  initAcceptPublishesBaselineCommit,
);
