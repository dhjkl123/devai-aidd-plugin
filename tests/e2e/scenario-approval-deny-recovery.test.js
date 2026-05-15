import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  findAuditEvents,
  runScenario,
} from "./helpers.js";

async function startupBranchStayResolvesWithoutRecovery() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-startup-ignore";

    await handlers.event({
      event: {
        type: "command.executed",
        properties: { sessionID, name: "/bmad-bmm-quick-dev", arguments: "ABC-123 ignore" },
      },
    });

    assert.equal(mock.prompts.length, 0, "startup branch prompt must use native question tool");

    const startupChainId = `startup-chain:${sessionID}:bmad-bmm-quick-dev`;
    await handlers.event({
      event: {
        type: "question.asked",
        properties: {
          sessionID,
          questions: [
            {
              id: `${startupChainId}:branch`,
              header: "Create Branch `feat/ABC-123-ignore`",
              options: [
                "Create New Branch (Recommended)",
                "Stay On Current Branch",
                "Skip",
              ],
            },
          ],
        },
      },
    });

    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          answers: [["Stay On Current Branch"]],
        },
      },
    });

    const resolved = findAuditEvents(mock.logs, "startup.chain.resolved");
    assert.equal(resolved.length, 1);
    assert.equal(findAuditEvents(mock.logs, "git.action.recovery.offered").length, 0);
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario(
  "startup branch stay resolves without recovery",
  startupBranchStayResolvesWithoutRecovery,
);
