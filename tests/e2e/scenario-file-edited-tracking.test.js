/**
 * E2E: file.edited records touched files and dedupes by normalized path.
 *
 * Pipeline under test:
 *   command.execute.before  (registers session + workflow context)
 *     -> file.edited (relative path)            "src/foo.js"
 *     -> file.edited (absolute path under root) "<directory>/src/bar.js"
 *     -> file.edited (duplicate of #1)          "src/foo.js"
 *     -> tool.execute.after (finish)            triggers finalization
 *
 * Verifies — observable through the public audit channel:
 *   - workflow.finalization.evaluated fires with exactly 2 finalizable file
 *     entries (matched + ignored deduped from the 3 file.edited inputs)
 *   - file.edited never throws on missing/empty session or empty filePath
 */

import path from "node:path";

import {
  assert,
  bootstrapPlugin,
  cleanupTempWorkspace,
  createTempWorkspace,
  findFirstAuditEvent,
  runScenario,
} from "./helpers.js";

async function fileEditedDeduplicatesAndFinalizationSeesUniquePaths() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers, mock } = await bootstrapPlugin(directory);
    const sessionID = "e2e-file-edited";

    await handlers["command.execute.before"](
      { command: "/bmad-bmm-quick-dev", arguments: "ABC-1 demo", sessionID },
      { parts: [] },
    );

    await handlers["file.edited"]({ sessionID, filePath: "src/foo.js" });
    await handlers["file.edited"]({
      sessionID,
      filePath: path.join(directory, "src", "bar.js"),
    });
    await handlers["file.edited"]({ sessionID, filePath: "src/foo.js" });

    await handlers["tool.execute.after"](
      { sessionID, tool: "finish" },
      { changedFiles: [] },
    );

    const evaluated = findFirstAuditEvent(mock.logs, "workflow.finalization.evaluated");
    assert.ok(evaluated, "workflow.finalization.evaluated audit event present");
    assert.equal(evaluated.details?.sessionID, sessionID);

    const matched = Array.isArray(evaluated.details?.matchedFiles)
      ? evaluated.details.matchedFiles
      : [];
    const ignored = Array.isArray(evaluated.details?.ignoredFiles)
      ? evaluated.details.ignoredFiles
      : [];

    const allEntries = [...matched, ...ignored];
    const allPaths = allEntries.map((entry) => entry?.path);
    const fooCount = allPaths.filter((p) => p === "src/foo.js").length;
    const barCount = allPaths.filter((p) => p === "src/bar.js").length;
    assert.equal(
      fooCount,
      1,
      "duplicate src/foo.js file.edited events were deduped (appears exactly once)",
    );
    assert.equal(
      barCount,
      1,
      "absolute-path src/bar.js was normalized to a relative path (appears exactly once)",
    );
    assert.equal(
      new Set(allPaths).size,
      allPaths.length,
      "no path appears more than once in the finalization payload",
    );
  } finally {
    cleanupTempWorkspace(directory);
  }
}

async function fileEditedHandlesEdgeInputsWithoutThrowing() {
  const directory = createTempWorkspace({ initializeGit: true, withInitialCommit: true });
  try {
    const { handlers } = await bootstrapPlugin(directory);

    let threw = null;
    try {
      await handlers["file.edited"]({ sessionID: "missing-session", filePath: "src/x.js" });
      await handlers["file.edited"]({ sessionID: "", filePath: "src/x.js" });
      await handlers["file.edited"]({ sessionID: "S", filePath: "" });
      await handlers["file.edited"]({ sessionID: "S" });
      await handlers["file.edited"]();
    } catch (error) {
      threw = error;
    }
    assert.equal(threw, null, "file.edited must never throw on edge inputs");
  } finally {
    cleanupTempWorkspace(directory);
  }
}

await runScenario(
  "file.edited: dedupes paths and finalization sees the unique set",
  fileEditedDeduplicatesAndFinalizationSeesUniquePaths,
);
await runScenario(
  "file.edited: edge inputs never throw",
  fileEditedHandlesEdgeInputsWithoutThrowing,
);
