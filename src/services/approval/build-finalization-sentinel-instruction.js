export const FINALIZATION_SENTINEL_HEADER = "__workflow_finalize__";
export const FINALIZATION_SENTINEL_OPTIONS = ["Commit", "Skip"];

export function buildFinalizationSentinelInstruction({ sessionID, commandName } = {}) {
  const normalizedCommand =
    typeof commandName === "string" && commandName.length > 0
      ? commandName.replace(/^\/+/, "")
      : null;
  const workflowLabel = normalizedCommand ? `/${normalizedCommand}` : "this workflow";
  const optionsPreview = JSON.stringify(FINALIZATION_SENTINEL_OPTIONS);
  const argsPreview = JSON.stringify({
    questions: [
      {
        header: FINALIZATION_SENTINEL_HEADER,
        options: FINALIZATION_SENTINEL_OPTIONS,
      },
    ],
  });
  const instructionText = [
    `Workflow ${workflowLabel} requires a deterministic finalization signal at the very END of the workflow.`,
    `When called, the user picks between Commit (plugin auto-commits the workflow's outputs) and Skip (end the workflow without committing).`,
    "",
    "WHEN to call the sentinel:",
    `- ONLY AFTER you have COMPLETED every step of the ${workflowLabel} workflow itself — reading the spec, gathering context, writing/editing files, running tests, and any review steps the workflow defines.`,
    "- ONLY AFTER the workflow has produced its actual output artifacts (code changes, files written, tests executed, etc.). If you have not yet edited or written any file for this workflow, the workflow is NOT done.",
    "- The sentinel is the FINAL action of the WHOLE workflow, NOT a startup acknowledgement and NOT a substitute for actually doing the work.",
    "",
    "DO NOT call the sentinel:",
    "- Immediately after this instruction is delivered.",
    "- Immediately after the startup approval chain (git init / baseline commit / branch creation) resolves — those are SETUP steps, not the workflow itself.",
    "- Before you have written any code, run any test, or produced any deliverable that the workflow asks for.",
    "- As a way to \"skip\" or \"shortcut\" the workflow. If you call the sentinel without doing the work, the plugin will reject it as premature and the user will not see a commit approval.",
    "",
    "HOW to call the sentinel (final step only):",
    `- Call the native \`question\` tool ONCE with header \`${FINALIZATION_SENTINEL_HEADER}\` and options ${optionsPreview}.`,
    "- The two options have distinct meanings:",
    "  - \"Commit\": the plugin will commit the workflow's changes on the user's behalf (no separate approval prompt).",
    "  - \"Skip\": end the workflow WITHOUT committing. The working tree is left as-is.",
    "- After this single call, do NOT call any other tool and do NOT emit any further plain-text response, regardless of which option the user picks. The plugin takes over from there.",
    "- Pass `header` and `options` EXACTLY as written above. The plugin matches on the exact header string.",
    `- Example tool args shape: ${argsPreview}`,
    "",
    "In short: do the entire workflow first. Only when there is literally nothing left to do for this workflow, call the sentinel as the very last action.",
  ].join("\n");

  return {
    header: FINALIZATION_SENTINEL_HEADER,
    options: FINALIZATION_SENTINEL_OPTIONS,
    instructionText,
    metadata: {
      source: "devai-git-workflow",
      sentinelKind: "workflow-finalize",
      sessionID: sessionID ?? null,
      commandName: normalizedCommand,
    },
  };
}
