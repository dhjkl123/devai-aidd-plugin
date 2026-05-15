export const FINALIZATION_SENTINEL_HEADER = "__workflow_finalize__";
export const FINALIZATION_SENTINEL_OPTIONS = ["Commit", "Skip"];
export const FINALIZATION_SENTINEL_TITLE_TEMPLATE = "Finalize workflow changes";
export const FINALIZATION_SENTINEL_MESSAGE_PLACEHOLDER = "<suggested-commit-message>";

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
        title: FINALIZATION_SENTINEL_TITLE_TEMPLATE,
        question:
          `Suggested commit message: ${FINALIZATION_SENTINEL_MESSAGE_PLACEHOLDER}. ` +
          "Choose Commit to create the final commit with that exact message. " +
          "Choose Skip to finish without committing and use your own message manually later.",
        options: FINALIZATION_SENTINEL_OPTIONS,
      },
    ],
  });
  const instructionText = [
    `Workflow ${workflowLabel} requires a deterministic finalization signal at the very END of the workflow.`,
    "Only call the sentinel when the workflow has actually produced working-tree changes.",
    "When called, show a natural-language finalization question while keeping the internal sentinel header hidden in the tool args.",
    "",
    "WHEN to call the sentinel:",
    `- ONLY AFTER you have COMPLETED every step of the ${workflowLabel} workflow itself ??reading the spec, gathering context, writing/editing files, running tests, and any review steps the workflow defines.`,
    "- ONLY AFTER the workflow has produced its actual output artifacts (code changes, files written, tests executed, etc.). If you have not yet edited or written any file for this workflow, the workflow is NOT done.",
    "- If there are no working-tree changes left to commit, do NOT call the sentinel question at all. Finish without asking it.",
    "- The sentinel is the FINAL action of the WHOLE workflow, NOT a startup acknowledgement and NOT a substitute for actually doing the work.",
    "",
    "DO NOT call the sentinel:",
    "- Immediately after this instruction is delivered.",
    "- Immediately after the startup approval chain (git init / baseline commit / branch creation) resolves ??those are SETUP steps, not the workflow itself.",
    "- Before you have written any code, run any test, or produced any deliverable that the workflow asks for.",
    "- As a way to \"skip\" or \"shortcut\" the workflow. If you call the sentinel without doing the work, the plugin will reject it as premature and the user will not see a commit approval.",
    "",
    "HOW to call the sentinel (final step only):",
    "- First compute the suggested commit message you would use for this workflow completion.",
    `- Call the native \`question\` tool ONCE with header \`${FINALIZATION_SENTINEL_HEADER}\`, title \`${FINALIZATION_SENTINEL_TITLE_TEMPLATE}\`, and options ${optionsPreview}.`,
    "- Call the native `question` tool ONCE with this exact args shape.",
    "- You MUST include all of these fields in the first question object:",
    "- `header`",
    "- `title`",
    "- `question`",
    "- `options`",
    `- In the question field, show the exact suggested commit message. Replace \`${FINALIZATION_SENTINEL_MESSAGE_PLACEHOLDER}\` with the real message.`,
    "- Do not omit `question`.",
    "- Do not replace the suggested commit message placeholder with an empty string.",
    "- If any of these fields are missing, the call is invalid.",
    "- The internal header is for plugin matching only. The user-facing text should come from the title and question fields, not from the internal header string.",
    "- The two options have distinct meanings:",
    "  - \"Commit\": after the user answers, YOU must perform the final git commit yourself using the exact suggested commit message shown in the question.",
    "  - \"Skip\": end the workflow WITHOUT committing. The working tree is left as-is.",
    "- If the user chooses Commit, run `git status` immediately before the final commit decision.",
    "- If that first re-check shows no working-tree changes, wait briefly and retry `git status` 2 to 3 more times in the same turn.",
    "- Use short waits only (for example a few hundred milliseconds); this is a quick re-check, not a long poll.",
    "- If any re-check shows working-tree changes, you MUST perform the commit in that same turn. Do not ask another approval question and do not skip the commit.",
    "- If every re-check still shows no working-tree changes left, do NOT attempt the commit. Finish normally and explain that there was nothing left to commit.",
    "- The current runtime only guarantees option answers, not editable free-form text input. If the user needs a custom commit message, tell them in the question text to choose Skip and commit manually afterward.",
    "- If the user chooses Commit, do not invent a different commit message, do not ask an extra approval question, and do not perform unrelated git commands beyond the short `git status` re-checks and the final commit path.",
    "- If the user chooses Skip, complete the workflow normally without asking the finalization question again.",
    "- Pass `header` EXACTLY as written above. The plugin matches on that exact internal header string.",
    `- Example tool args shape: ${argsPreview}`,
    "",
    "In short: do the entire workflow first. Only when there is literally nothing left to do for this workflow, call the sentinel as the very last action.",
  ].join("\n");

  return {
    header: FINALIZATION_SENTINEL_HEADER,
    options: FINALIZATION_SENTINEL_OPTIONS,
    titleTemplate: FINALIZATION_SENTINEL_TITLE_TEMPLATE,
    instructionText,
    metadata: {
      source: "devai-git-workflow",
      sentinelKind: "workflow-finalize",
      sessionID: sessionID ?? null,
      commandName: normalizedCommand,
    },
  };
}
