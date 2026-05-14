import assert from "node:assert/strict";

import {
  FINALIZATION_SENTINEL_HEADER,
  FINALIZATION_SENTINEL_OPTIONS,
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

// 3. instructionText covers header constant, both labels, "no other tool" directive
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
    /do not call any other tool/i.test(result.instructionText),
    "instructionText must instruct model to call no other tools after sentinel",
  );
  assert.ok(
    result.instructionText.includes("Commit"),
    "instructionText must reference Commit option semantics",
  );
  assert.ok(
    result.instructionText.includes("Skip"),
    "instructionText must reference Skip option semantics",
  );
  // argsPreview JSON must enumerate both options literally for the model
  assert.ok(
    result.instructionText.includes('"Commit"') &&
      result.instructionText.includes('"Skip"'),
    "instructionText argsPreview must include both option labels in JSON form",
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
