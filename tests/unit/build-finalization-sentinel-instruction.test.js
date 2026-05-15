import assert from "node:assert/strict";

import {
  FINALIZATION_SENTINEL_HEADER,
  FINALIZATION_SENTINEL_MESSAGE_PLACEHOLDER,
  FINALIZATION_SENTINEL_OPTIONS,
  FINALIZATION_SENTINEL_TITLE_TEMPLATE,
  buildFinalizationSentinelInstruction,
} from "../../src/services/approval/build-finalization-sentinel-instruction.js";

// 1. header / options exact values
{
  const result = buildFinalizationSentinelInstruction({
    sessionID: "s1",
    commandName: "bmad-bmm-quick-dev",
  });
  assert.equal(result.header, "__workflow_finalize__");
  assert.equal(FINALIZATION_SENTINEL_HEADER, "__workflow_finalize__");
  assert.deepEqual(result.options, ["Commit", "Skip"]);
  assert.deepEqual(FINALIZATION_SENTINEL_OPTIONS, ["Commit", "Skip"]);
  assert.equal(result.titleTemplate, FINALIZATION_SENTINEL_TITLE_TEMPLATE);
}

// 2. metadata echo, commandName slash-stripped
{
  const result = buildFinalizationSentinelInstruction({
    sessionID: "session-abc",
    commandName: "/bmad-bmm-quick-dev",
  });
  assert.equal(result.metadata.sentinelKind, "workflow-finalize");
  assert.equal(result.metadata.source, "devai-git-workflow");
  assert.equal(result.metadata.sessionID, "session-abc");
  assert.equal(result.metadata.commandName, "bmad-bmm-quick-dev");
}

// 3. instructionText covers header constant, title/question template, and delegated commit semantics
{
  const result = buildFinalizationSentinelInstruction({
    sessionID: "s1",
    commandName: "bmad-bmm-quick-dev",
  });
  assert.ok(
    result.instructionText.includes("__workflow_finalize__"),
    "instructionText must reference sentinel header constant",
  );
  assert.ok(
    result.instructionText.includes("Commit"),
    "instructionText must reference Commit option semantics",
  );
  assert.ok(
    result.instructionText.includes("Skip"),
    "instructionText must reference Skip option semantics",
  );
  assert.ok(
    result.instructionText.includes(FINALIZATION_SENTINEL_TITLE_TEMPLATE),
    "instructionText must reference the natural-language title template",
  );
  assert.ok(
    result.instructionText.includes(FINALIZATION_SENTINEL_MESSAGE_PLACEHOLDER),
    "instructionText must include the suggested commit message placeholder",
  );
  assert.ok(
    /Call the native `question` tool ONCE with this exact args shape\./.test(result.instructionText),
    "instructionText must require the exact args shape",
  );
  assert.ok(
    /You MUST include all of these fields in the first question object:/.test(result.instructionText),
    "instructionText must enumerate required question fields",
  );
  assert.ok(
    /Do not omit `question`\./.test(result.instructionText),
    "instructionText must forbid omitting question",
  );
  assert.ok(
    /If any of these fields are missing, the call is invalid\./.test(result.instructionText),
    "instructionText must mark missing fields as invalid",
  );
  // argsPreview JSON must enumerate both options literally for the model
  assert.ok(
    result.instructionText.includes('"Commit"') &&
      result.instructionText.includes('"Skip"'),
    "instructionText argsPreview must include both option labels in JSON form",
  );
  assert.ok(
    /Skip and commit manually/i.test(result.instructionText),
    "instructionText must document the no-freeform-input fallback",
  );
  assert.ok(
    /YOU must perform the final git commit yourself/i.test(result.instructionText),
    "instructionText must delegate final commit execution to the model",
  );
  assert.ok(
    /run `git status` one more time immediately before the final commit decision/i.test(result.instructionText),
    "instructionText must require a final git status re-check before commit",
  );
  assert.ok(
    /If that final re-check still shows working-tree changes, you MUST perform the commit/i.test(result.instructionText),
    "instructionText must force commit when changes remain after re-check",
  );
  assert.ok(
    /If that final re-check shows no working-tree changes left, do NOT attempt the commit/i.test(result.instructionText),
    "instructionText must allow normal completion without commit when no changes remain",
  );
  assert.ok(
    result.instructionText.includes('"question":"Suggested commit message: <suggested-commit-message>.'),
    "instructionText argsPreview must use the question field for the suggested commit message",
  );
}

// 4. Missing sessionID / commandName — no throw, safe placeholder
{
  const result = buildFinalizationSentinelInstruction({});
  assert.equal(result.header, "__workflow_finalize__");
  assert.equal(result.metadata.sessionID, null);
  assert.equal(result.metadata.commandName, null);
  assert.ok(result.instructionText.length > 0);
  assert.ok(/this workflow/i.test(result.instructionText));
}

// 4b. Undefined arg — no throw
{
  const result = buildFinalizationSentinelInstruction();
  assert.equal(result.header, "__workflow_finalize__");
  assert.ok(result.instructionText.length > 0);
}

console.log("build-finalization-sentinel-instruction.test.js: PASS");
