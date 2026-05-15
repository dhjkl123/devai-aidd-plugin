import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  findAuditEvents,
  runScenario,
} from "./helpers.js";

async function startupRunReentry() {
  const directory = createTempWorkspace({ initializeGit: false });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "startup-run-reentry";

    const firstOutput = { parts: [] };
    await handlers["command.execute.before"](
      {
        sessionID,
        command: "/bmad-bmm-quick-dev",
        arguments: "ABC-123 replay",
      },
      firstOutput,
    );

    const startupPart = firstOutput.parts.find((part) => part?.metadata?.startupChain === true);
    assert.ok(startupPart, "first pass must stage a startup chain");

    await handlers.event({
      event: {
        type: "question.asked",
        properties: {
          sessionID,
          questions: startupPart.metadata.questionHeaders.map((header, index) => ({
            id: startupPart.metadata.questionIds[index],
            header,
            options: startupPart.metadata.questionOptions[index],
          })),
          metadata: { startupChain: true },
        },
      },
    });

    await handlers.event({
      event: {
        type: "question.replied",
        properties: {
          sessionID,
          requestID: startupPart.metadata.questionIds[0],
          answers: [
            ["Initialize Git (Recommended)"],
            ["Skip"],
            ["Skip"],
          ],
        },
      },
    });

    const replayOutput = { parts: [] };
    await handlers["command.execute.before"](
      {
        sessionID,
        command: "/bmad-bmm-quick-dev",
        arguments: "ABC-123 replay",
      },
      replayOutput,
    );

    assert.equal(
      replayOutput.parts.some((part) => part?.metadata?.startupChain === true),
      false,
      "resolved startup run must not reopen startup chain on same-session replay",
    );

    const skipped = findAuditEvents(mock.logs, "startup.chain.skipped");
    assert.ok(
      skipped.some((event) => event?.details?.reason === "startup-already-resolved"),
      "same-session replay must emit startup.chain.skipped with startup-already-resolved",
    );
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario("startup run reentry", startupRunReentry);
