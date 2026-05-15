/**
 * build-question-instruction.js
 *
 * Pure builder for the strong instruction text that the `requestApproval`
 * adapter prepends to the promptAsync prompt. The opencode native plugin
 * runtime has no UI dialog API, so the plugin instructs the model to call the
 * native `question` tool. Weak instructions ("Ask the user with the question
 * tool. Header: 'X'.") lead the model to defer or skip the call -- this
 * builder produces multi-line, scenario-specific instructions modelled on the
 * legacy `docs/legacy/devai-git-workflow.js` builders.
 *
 * Per-scenario contract (priority order):
 *   1. actionType === "init"                                 -> "Initialize Git"
 *   2. actionType === "commit" && proposal.action === "baseline-commit"
 *                                                            -> "Create Baseline Commit"
 *   3. actionType === "commit" (any other proposal.action)   -> "Finalize Changes"
 *   4. actionType === "branch/create"                        -> "Create Branch"
 *   5. actionType === "branch/switch"                        -> "Switch Branch"
 *   6. actionType === "push"                                 -> "Push Changes"
 *   7. unknown actionType                                    -> "Approval Required" fallback
 *
 * actionType values mirror `classify-git-action.js:26-32`
 * (`branch/create`, `branch/switch`, `init`, `commit`, `push`) -- branch
 * is slash-segmented.
 *
 * @param {{
 *   commandName: string | null | undefined,
 *   actionType: string,
 *   proposal: { kind?: string, action?: string, name?: string } | null
 * }} params
 * @returns {{ header: string, options: string[], instructionText: string }}
 */
export function buildQuestionInstruction({ commandName, actionType, proposal } = {}) {
  const normalizedCommand = String(commandName == null ? "" : commandName)
    .trim()
    .replace(/^\/+/, "");
  const safeName = sanitizeBranchName(proposal && proposal.name);

  const guardLine = normalizedCommand
    ? "Git workflow guard is active for /" + normalizedCommand + "."
    : null;

  if (actionType === "init") {
    return finalize({
      header: "Initialize Git",
      options: ["Initialize Git (Recommended)", "Skip"],
      lines: [
        guardLine,
        normalizedCommand
          ? "This workflow cannot continue yet because /" + normalizedCommand + " is running in a directory that is not a git repository."
          : "This workflow cannot continue yet because it is running in a directory that is not a git repository.",
        "Ask the user the `Initialize Git` question with these exact options:",
        "1. `Initialize Git (Recommended)`",
        "2. `Skip`",
        "If the user chooses Initialize Git, run `git init` only after that approval.",
        "If the user chooses Skip, do not run `git init`. The workflow will continue, but git automation (baseline commit, branch creation, push) will be disabled for this session.",
        "Do not ask for a branch name or continue implementation before the git-init decision is made.",
      ],
    });
  }

  if (actionType === "commit" && proposal && proposal.action === "baseline-commit") {
    const sensitiveFiles = Array.isArray(proposal.sensitiveFiles) ? proposal.sensitiveFiles : [];
    const sensitiveRules = Array.isArray(proposal.sensitiveRules) ? proposal.sensitiveRules : [];

    // Unified 3-option set for ALL baseline-commit prompts (sensitive or not).
    // The "Setup .gitignore and Commit" option triggers the executor branch
    // that writes the default ignore template (+ any sensitive rules) before
    // commit. "Commit Without .gitignore" commits whatever git status shows.
    // "Skip" sets workflowState.baselineSkipped so the workflow continues
    // without baseline commit AND without branch automation.
    const options = [
      "Setup .gitignore and Commit (Recommended)",
      "Commit Without .gitignore",
      "Skip",
    ];
    const setupExplanation = sensitiveRules.length > 0
      ? "Create or update `.gitignore` with the default template plus the matched patterns above (" +
        sensitiveRules.map((r) => "`" + r + "`").join(", ") +
        "), then commit the remaining files as the initial commit."
      : "Create `.gitignore` with the default template (node_modules/, dist/, .env*, *.pem, *.key, secrets/, credentials/, etc.), then commit the remaining files as the initial commit.";
    const commitOnlyExplanation = sensitiveFiles.length > 0
      ? "Commit the files as-is WITHOUT modifying .gitignore (this may publish secrets -- only do this if the user explicitly accepts the risk)."
      : "Commit the files as-is without creating .gitignore.";
    const skipExplanation =
      "Do not create the initial commit. The workflow will continue, but git branch automation will be disabled for this session. Inform the user that branches cannot be created automatically without a baseline commit.";

    if (sensitiveFiles.length > 0) {
      const previewCount = 10;
      const previewFiles = sensitiveFiles.slice(0, previewCount);
      const remaining = sensitiveFiles.length - previewFiles.length;
      const fileListLines = previewFiles.map((f) => "  - `" + f + "`");
      if (remaining > 0) {
        fileListLines.push("  - ...and " + remaining + " more");
      }
      return finalize({
        header: "Sensitive Files Detected",
        options,
        lines: [
          guardLine,
          "The baseline commit would include files that look sensitive (env files, private keys, credentials, local databases, etc.):",
          ...fileListLines,
          "Ask the user the `Sensitive Files Detected` question with these exact options:",
          "1. `Setup .gitignore and Commit (Recommended)`",
          "2. `Commit Without .gitignore`",
          "3. `Skip`",
          "If the user chooses Setup .gitignore and Commit, " + setupExplanation,
          "If the user chooses Commit Without .gitignore, " + commitOnlyExplanation,
          "If the user chooses Skip, " + skipExplanation,
          "Do not continue the workflow or run other tools before the user answers this question.",
        ],
      });
    }

    return finalize({
      header: "Create Baseline Commit",
      options,
      lines: [
        guardLine,
        normalizedCommand
          ? "This workflow cannot continue yet because /" + normalizedCommand + " is in a git repository without an initial commit."
          : "This workflow cannot continue yet because the git repository has no initial commit.",
        "Ask the user the `Create Baseline Commit` question with these exact options:",
        "1. `Setup .gitignore and Commit (Recommended)`",
        "2. `Commit Without .gitignore`",
        "3. `Skip`",
        "If the user chooses Setup .gitignore and Commit, " + setupExplanation,
        "If the user chooses Commit Without .gitignore, " + commitOnlyExplanation,
        "If the user chooses Skip, " + skipExplanation,
        "Do not continue the workflow or run other tools before the user answers this question.",
      ],
    });
  }

  if (actionType === "commit") {
    return finalize({
      header: "Finalize Changes",
      options: ["Approve (Recommended)", "Ignore and continue"],
      lines: [
        guardLine,
        "The workflow has produced changes that need a commit before finishing.",
        "Ask the user the `Finalize Changes` question with these exact options:",
        "1. `Approve (Recommended)`",
        "2. `Ignore and continue`",
        "If the user chooses Approve, commit the staged changes only after that approval.",
        "If the user chooses Ignore and continue, proceed with the workflow without committing.",
        "Do not run git or modify files before the user answers this question.",
      ],
    });
  }

  if (actionType === "branch/create") {
    return finalize({
      header: "Create Branch",
      options: [
        "Create New Branch (Recommended)",
        "Stay On Current Branch",
        "Skip",
      ],
      lines: [
        guardLine,
        "This workflow should not continue on the current branch without an explicit branch decision.",
        "Ask the user the `Create Branch` question with these exact options:",
        "1. `Create New Branch (Recommended)`",
        "2. `Stay On Current Branch`",
        "3. `Skip`",
        "Suggested branch name: `" + safeName + "`.",
        "Explain to the user that the branch recommendation is based on the current workflow context and repository branch state.",
        "If the user chooses Create New Branch, create the branch with the suggested name only after that approval.",
        "If the user chooses Stay On Current Branch, continue the workflow on the current branch without creating a new branch.",
        "If the user chooses Skip, continue the workflow without any automatic branch change and without reopening this branch question in the same run.",
        "Do not run git or modify files before the user answers this question.",
      ],
    });
  }

  if (actionType === "branch/stay") {
    return finalize({
      header: "Branch Decision",
      options: ["Proceed On Current Branch (Recommended)", "Skip"],
      lines: [
        guardLine,
        "The current branch already matches the recommended workflow context.",
        "Ask the user the `Branch Decision` question with these exact options:",
        "1. `Proceed On Current Branch (Recommended)`",
        "2. `Skip`",
        "Current branch: `" + safeName + "`.",
        "Explain to the user that the branch recommendation is based on the current workflow context and repository branch state.",
        "If the user chooses Proceed On Current Branch, continue the workflow on the current branch without switching or creating a branch.",
        "If the user chooses Skip, continue the workflow without any automatic branch change and without reopening this branch question in the same run.",
        "Do not run git or modify files before the user answers this question.",
      ],
    });
  }

  if (actionType === "branch/switch") {
    return finalize({
      header: "Switch Branch",
      options: [
        "Switch Branch (Recommended)",
        "Stay On Current Branch",
        "Skip",
      ],
      lines: [
        guardLine,
        "This workflow likely belongs on a different existing branch than the current one.",
        "Ask the user the `Switch Branch` question with these exact options:",
        "1. `Switch Branch (Recommended)`",
        "2. `Stay On Current Branch`",
        "3. `Skip`",
        "Target branch: `" + safeName + "`.",
        "Explain to the user that the branch recommendation is based on the current workflow context and repository branch state.",
        "If the user chooses Switch Branch, switch to the target branch only after that approval.",
        "If the user chooses Stay On Current Branch, continue the workflow on the current branch without switching.",
        "If the user chooses Skip, continue the workflow without any automatic branch change and without reopening this branch question in the same run.",
        "Do not run git or modify files before the user answers this question.",
      ],
    });
  }

  if (actionType === "push") {
    return finalize({
      header: "Push Changes",
      options: ["Approve (Recommended)", "Ignore and continue"],
      lines: [
        guardLine,
        "The committed changes are ready to push to the remote.",
        "Ask the user the `Push Changes` question with these exact options:",
        "1. `Approve (Recommended)`",
        "2. `Ignore and continue`",
        "If the user chooses Approve, push the current branch and set the upstream if needed.",
        "If the user chooses Ignore and continue, proceed with the workflow without pushing.",
        "Do not run git or continue the workflow before the user answers this question.",
      ],
    });
  }

  return {
    header: "Approval Required",
    options: ["Approve (Recommended)", "Ignore and continue"],
    instructionText:
      'Ask the user with the question tool. Header: "Approval Required". Options: "Approve (Recommended)", "Ignore and continue".',
  };
}

function finalize({ header, options, lines }) {
  const instructionText = lines
    .filter((line) => typeof line === "string" && line.length > 0)
    .join("\n");
  return { header, options, instructionText };
}

function sanitizeBranchName(rawName) {
  if (typeof rawName !== "string" || rawName.length === 0) {
    return "workflow";
  }
  // Reject characters that would break the Markdown-style backtick wrapping
  // in the instruction template (R7 / adversarial F14): backticks themselves,
  // line breaks, and ASCII control characters (0x00-0x1f, 0x7f).
  if (rawName.indexOf("`") !== -1) return "workflow";
  if (rawName.indexOf("\n") !== -1) return "workflow";
  if (rawName.indexOf("\r") !== -1) return "workflow";
  for (let i = 0; i < rawName.length; i += 1) {
    const code = rawName.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return "workflow";
  }
  return rawName;
}
