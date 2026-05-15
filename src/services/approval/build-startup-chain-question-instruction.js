export const STARTUP_CHAIN_TOOL_ID = "devai_git_startup_approval";

export function buildStartupChainQuestionInstruction(chainPlan = {}) {
  const startupChainId =
    typeof chainPlan.startupChainId === "string" && chainPlan.startupChainId.length > 0
      ? chainPlan.startupChainId
      : `startup-chain:${chainPlan.sessionID ?? "no-session"}:${Date.now().toString(36)}`;
  const commandName =
    typeof chainPlan.commandName === "string" && chainPlan.commandName.length > 0
      ? chainPlan.commandName.replace(/^\/+/, "")
      : null;
  const steps = Array.isArray(chainPlan.steps) ? chainPlan.steps : [];
  const questions = steps.map((step) => buildQuestion({ step, startupChainId }));
  const header = "Prepare Git Workflow";
  const questionLines = questions.flatMap((question, index) => [
    `${index + 1}. header: \`${question.header}\``,
    `   options: ${question.options.map((option) => `\`${option}\``).join(", ")}`,
  ]);
  const questionsArgPreview = JSON.stringify(
    questions.map((question) => ({
      header: question.header,
      options: question.options,
    })),
  );
  const instructionText = [
    commandName ? `Git workflow guard is active for /${commandName}.` : "Git workflow guard is active.",
    "Call the native `question` tool now with ALL of the following questions in a single batch (one tool call, one `questions` array).",
    "Pass `header` and `options` EXACTLY as listed below for each question, in the same order. Do not translate, paraphrase, or reorder anything. The plugin matches answers positionally by header.",
    "Do not call any other tool, read or modify files, or respond with plain text until the user answers the questions.",
    "After the user answers, the plugin will run only the approved Git actions in order: init, baseline commit, then branch.",
    `Example tool args shape: { questions: ${questionsArgPreview} }`,
    "Questions:",
    ...questionLines,
  ].join("\n");

  return {
    startupChainId,
    header,
    questions,
    instructionText,
    metadata: {
      startupChain: true,
      startupChainId,
      questionKeys: questions.map((question) => question.key),
      questionIds: questions.map((question) => question.id),
      questionHeaders: questions.map((question) => question.header),
      questionOptions: questions.map((question) => question.options),
    },
  };
}

export function buildStartupChainToolQuestions(chainPlan = {}) {
  const instruction = buildStartupChainQuestionInstruction(chainPlan);
  return instruction.questions.map((question) => ({
    question: buildQuestionText(question),
    header: question.header,
    options: question.options.map((label) => ({
      label,
      description: describeOption(question.key, label),
    })),
    custom: false,
  }));
}

function buildQuestionText(question) {
  if (question.key === "init") {
    return "Initialize Git for this workspace before the workflow continues?";
  }
  if (question.key === "baseline") {
    return "Create a baseline commit before starting workflow changes?";
  }
  if (question.key === "branch") {
    const branchName =
      typeof question.branchName === "string" && question.branchName.length > 0
        ? question.branchName
        : "the workflow branch";
    if (question.action === "stay") {
      return `Proceed on ${branchName} before editing files?`;
    }
    return question.header.startsWith("Switch Branch")
      ? `Switch to ${branchName} before editing files, or stay on the current branch?`
      : `Create and check out ${branchName} before editing files, or stay on the current branch?`;
  }
  return question.header;
}

function describeOption(key, label) {
  const normalized = label.toLowerCase();
  if (key === "init") {
    return normalized.startsWith("initialize")
      ? "Run git init in this workspace."
      : "Continue this session without Git automation.";
  }
  if (key === "baseline") {
    if (normalized.startsWith("setup")) {
      return "Create or update .gitignore, stage eligible files, and commit.";
    }
    if (normalized.startsWith("commit without")) {
      return "Commit eligible files without changing .gitignore.";
    }
    return "Skip the baseline commit and disable later startup Git automation.";
  }
  if (key === "branch") {
    if (normalized.startsWith("proceed on current branch")) {
      return "Proceed on the current branch without changing branches.";
    }
    if (normalized.startsWith("create new branch")) {
      return "Create the proposed workflow branch and continue there.";
    }
    if (normalized.startsWith("switch branch")) {
      return "Switch to the proposed existing branch and continue there.";
    }
    if (normalized.startsWith("stay on current branch")) {
      return "Continue on the current branch without changing branches.";
    }
    return "Skip automatic branch change and continue the workflow as-is.";
  }
  return label;
}

function buildQuestion({ step, startupChainId }) {
  const key = step.key;
  if (key === "init") {
    return {
      key,
      id: `${startupChainId}:init`,
      header: "Initialize Git",
      options: ["Initialize Git (Recommended)", "Skip"],
    };
  }
  if (key === "baseline") {
    return {
      key,
      id: `${startupChainId}:baseline`,
      header: "Create Baseline Commit",
      options: [
        "Setup .gitignore and Commit (Recommended)",
        "Commit Without .gitignore",
        "Skip",
      ],
    };
  }
  const branchName =
    typeof step.proposal?.name === "string" && step.proposal.name.length > 0
      ? step.proposal.name
      : "workflow";
  const action =
    step.action === "switch" ? "Switch" : step.action === "stay" ? "Branch Decision" : "Create";
  const header = `${action} Branch \`${branchName}\``;
  return {
    key,
    id: `${startupChainId}:branch`,
    header: step.action === "stay" ? "Branch Decision" : header,
    options:
      step.action === "switch"
        ? ["Switch Branch (Recommended)", "Stay On Current Branch", "Skip"]
        : step.action === "stay"
          ? ["Proceed On Current Branch (Recommended)", "Skip"]
          : ["Create New Branch (Recommended)", "Stay On Current Branch", "Skip"],
    branchName,
    action: step.action,
  };
}
