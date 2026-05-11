import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const MUTATING_TOOLS = new Set(["edit", "write", "patch", "multiedit"]);
const SAFE_READ_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "list",
  "lsp",
  "webfetch",
  "websearch",
  "codesearch",
  "skill",
  "todoread",
]);

const DEFAULT_WORKFLOW_POLICY = {
  category: "general",
  identityStrategy: "artifact-or-args",
  branchRequired: true,
  finalization: "commit-and-push",
};

const DEFAULT_CONFIG = {
  branch: {
    pattern: "{type}/{ticket}-{slug}",
    defaultType: "chore",
    fallbackTicket: "no-ticket",
    longLivedBranches: ["main", "master"],
    defaultMergeTarget: "",
    validationRegex:
      "^(feat|fix|docs|chore|refactor|design)\\/[A-Z]+-\\d+-[a-z0-9-]+$|^(feat|fix|docs|chore|refactor|design)\\/no-ticket-[a-z0-9-]+$",
    commandTypeMap: {
      "bmad-bmm-create-architecture": "design",
      "bmad-bmm-create-prd": "docs",
      "bmad-bmm-create-product-brief": "docs",
      "bmad-bmm-create-story": "feat",
      "bmad-bmm-create-ux-design": "design",
      "bmad-bmm-quick-dev": "feat",
      "bmad-bmm-dev-story": "feat",
      "bmad-bmm-code-review": "fix",
    },
  },
  workflowPolicy: {},
};

function loadWorkflowCommands(projectDirectory) {
  const commandsDirectory = path.join(projectDirectory, ".opencode", "commands");

  if (!existsSync(commandsDirectory)) {
    return new Set();
  }

  return new Set(
    readdirSync(commandsDirectory)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => entry.replace(/\.md$/i, "")),
  );
}

function loadPluginConfig(projectDirectory) {
  const configPath = path.join(projectDirectory, ".opencode", "devai-git-workflow.json");

  if (!existsSync(configPath)) {
    return {
      ...DEFAULT_CONFIG,
      branch: {
        ...DEFAULT_CONFIG.branch,
        longLivedBranches: [...DEFAULT_CONFIG.branch.longLivedBranches],
        commandTypeMap: { ...DEFAULT_CONFIG.branch.commandTypeMap },
      },
      workflowPolicy: {},
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    const configuredLongLivedBranches = Array.isArray(parsed?.branch?.longLivedBranches)
      ? parsed.branch.longLivedBranches
      : [];
    const longLivedBranches = Array.from(
      new Set(
        [...DEFAULT_CONFIG.branch.longLivedBranches, ...configuredLongLivedBranches]
          .map((branchName) => String(branchName || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      branch: {
        ...DEFAULT_CONFIG.branch,
        ...(parsed?.branch || {}),
        longLivedBranches,
        defaultMergeTarget: String(parsed?.branch?.defaultMergeTarget || "").trim(),
        commandTypeMap: {
          ...DEFAULT_CONFIG.branch.commandTypeMap,
          ...(parsed?.branch?.commandTypeMap || {}),
          "bmad-bmm-create-story": "feat",
        },
      },
      workflowPolicy:
        parsed?.workflowPolicy && typeof parsed.workflowPolicy === "object" && !Array.isArray(parsed.workflowPolicy)
          ? { ...parsed.workflowPolicy }
          : {},
    };
  } catch {
    return {
      ...DEFAULT_CONFIG,
      branch: {
        ...DEFAULT_CONFIG.branch,
        longLivedBranches: [...DEFAULT_CONFIG.branch.longLivedBranches],
        defaultMergeTarget: DEFAULT_CONFIG.branch.defaultMergeTarget,
        commandTypeMap: { ...DEFAULT_CONFIG.branch.commandTypeMap },
      },
      workflowPolicy: {},
    };
  }
}

function getWorkflowPolicy(commandName, pluginConfig) {
  const configuredPolicy = pluginConfig?.workflowPolicy?.[commandName];

  if (!configuredPolicy || typeof configuredPolicy !== "object" || Array.isArray(configuredPolicy)) {
    return DEFAULT_WORKFLOW_POLICY;
  }

  return {
    ...DEFAULT_WORKFLOW_POLICY,
    ...configuredPolicy,
  };
}

function normalizeCommandName(command) {
  return String(command || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\.md$/i, "");
}

function normalizeArguments(argumentsText) {
  return String(argumentsText || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeWorkflowKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function sanitizeBranchSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractTicket(argumentsText) {
  const match = String(argumentsText || "").match(/\b[A-Z][A-Z0-9]+-\d+\b/);
  return match ? match[0] : "";
}

function extractStoryId(argumentsText) {
  const text = String(argumentsText || "");

  const patterns = [
    /\bstory[-\s]+(\d+(?:[.-]\d+)+)\b/i,
    /\bstory[-\s]+([A-Za-z0-9/_-]+)\b/i,
    /\b(\d+(?:[.-]\d+)+)\b/,
    /\b([A-Za-z0-9]+\/[A-Za-z0-9./_-]+)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const value = match[1] || "";
    if (!value) {
      continue;
    }

    if (/^\d+(?:[-.]\d+)+$/.test(value)) {
      return value.replace(/-/g, ".");
    }

    return value.replace(/\s+/g, "");
  }

  return "";
}

function buildSlug(commandName, argumentsText) {
  const argsText = normalizeArguments(argumentsText);
  const source = argsText || humanizeCommandName(commandName);

  return sanitizeBranchSegment(source).slice(0, 48) || "workflow";
}

function humanizeCommandName(commandName) {
  return String(commandName || "")
    .replace(/^bmad-bmm-/, "")
    .replace(/^bmad-/, "")
    .replace(/^[a-z]+-story$/, "story")
    .replace(/-/g, " ");
}

function createBranchName(commandName, argumentsText, config) {
  const branchConfig = config.branch || DEFAULT_CONFIG.branch;
  const type = branchConfig.commandTypeMap?.[commandName] || branchConfig.defaultType || "chore";
  const ticket = extractTicket(argumentsText) || branchConfig.fallbackTicket || "no-ticket";
  const storyId = extractStoryId(argumentsText);
  const slug = buildSlug(commandName, argumentsText);
  const storySlug = storyId ? sanitizeBranchSegment(`story-${storyId}`) : "";
  const pattern = branchConfig.pattern || "{type}/{ticket}-{slug}";
  const branchName = pattern
    .replaceAll("{type}", sanitizeBranchSegment(type))
    .replaceAll("{ticket}", ticket)
    .replaceAll("{slug}", storySlug ? `${storySlug}-${slug}` : slug)
    .replaceAll("{command}", sanitizeBranchSegment(commandName));

  const validationRegex = branchConfig.validationRegex;
  if (validationRegex && !new RegExp(validationRegex).test(branchName)) {
    throw new Error(
      `Git workflow guard: generated branch name \`${branchName}\` does not match validationRegex \`${validationRegex}\`. Update .opencode/devai-git-workflow.json or provide arguments that include a valid ticket/slug.`,
    );
  }

  return branchName;
}

function validateBranchName(branchName, config) {
  const validationRegex = config?.branch?.validationRegex;

  if (!validationRegex) {
    return true;
  }

  return new RegExp(validationRegex).test(branchName);
}

function resolveGitDir(directory) {
  const gitPath = path.join(directory, ".git");

  if (!existsSync(gitPath)) {
    return "";
  }

  const gitStat = statSync(gitPath);
  if (gitStat.isDirectory()) {
    return gitPath;
  }

  if (!gitStat.isFile()) {
    return "";
  }

  const content = readFileSync(gitPath, "utf8");
  const match = content.match(/^gitdir:\s*(.+)$/im);

  if (!match) {
    return "";
  }

  const resolved = path.isAbsolute(match[1].trim())
    ? match[1].trim()
    : path.resolve(directory, match[1].trim());

  return existsSync(resolved) ? resolved : "";
}

function readCurrentBranch(gitDir) {
  if (!gitDir) {
    return "";
  }

  const headPath = path.join(gitDir, "HEAD");

  if (!existsSync(headPath)) {
    return "";
  }

  const content = readFileSync(headPath, "utf8").trim();

  if (!content) {
    return "";
  }

  if (content.startsWith("ref: ")) {
    const ref = content.slice(5).trim();
    return ref.replace(/^refs\/heads\//, "");
  }

  return "detached-head";
}

function collectBranchesFromRefs(dir, prefix = "") {
  const entries = [];

  if (!existsSync(dir)) {
    return entries;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      entries.push(...collectBranchesFromRefs(path.join(dir, entry.name), nextPrefix));
      continue;
    }

    if (entry.isFile()) {
      entries.push(nextPrefix);
    }
  }

  return entries;
}

function readPackedRefs(gitDir) {
  const packedRefsPath = path.join(gitDir, "packed-refs");

  if (!existsSync(packedRefsPath)) {
    return [];
  }

  const branches = [];
  const lines = readFileSync(packedRefsPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.startsWith("#") || line.startsWith("^")) {
      continue;
    }

    const match = line.match(/^[0-9a-f]+\s+refs\/heads\/(.+)$/);
    if (match) {
      branches.push(match[1].trim());
    }
  }

  return branches;
}

function listLocalBranches(gitDir) {
  if (!gitDir) {
    return [];
  }

  const branches = new Set();
  const headsDir = path.join(gitDir, "refs", "heads");

  for (const branch of collectBranchesFromRefs(headsDir)) {
    branches.add(branch);
  }

  for (const branch of readPackedRefs(gitDir)) {
    branches.add(branch);
  }

  return Array.from(branches).sort((a, b) => a.localeCompare(b));
}

function hasHeadCommit(directory) {
  try {
    const output = execFileSync("git", ["-C", directory, "rev-parse", "--verify", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return Boolean(String(output || "").trim());
  } catch {
    return false;
  }
}

function loadGitContext(directory) {
  const gitDir = resolveGitDir(directory);
  const currentBranch = readCurrentBranch(gitDir);
  const branches = listLocalBranches(gitDir);
  const hasCommit = Boolean(gitDir) && hasHeadCommit(directory);

  return {
    gitDir,
    isRepo: Boolean(gitDir),
    hasCommit,
    currentBranch,
    branches,
  };
}

function isLongLivedBranch(branchName, config = DEFAULT_CONFIG) {
  const longLivedBranches = config?.branch?.longLivedBranches || DEFAULT_CONFIG.branch.longLivedBranches;
  const normalized = new Set(
    longLivedBranches.map((name) => String(name || "").trim().toLowerCase()).filter(Boolean),
  );

  return normalized.has(String(branchName || "").trim().toLowerCase());
}

function resolveMergeTargetBranch(gitContext, pluginConfig, currentBranch) {
  const explicitTarget = String(pluginConfig?.branch?.defaultMergeTarget || "").trim();

  if (explicitTarget) {
    return explicitTarget;
  }

  const normalizedCurrentBranch = String(currentBranch || gitContext?.currentBranch || "")
    .trim()
    .toLowerCase();
  const localBranches = Array.isArray(gitContext?.branches) ? gitContext.branches : [];
  const configuredBranches = Array.isArray(pluginConfig?.branch?.longLivedBranches)
    ? pluginConfig.branch.longLivedBranches
    : DEFAULT_CONFIG.branch.longLivedBranches;
  const candidates = [];

  for (const branchName of ["main", "master", ...configuredBranches]) {
    const candidate = String(branchName || "").trim();
    if (!candidate) {
      continue;
    }

    if (candidates.some((existing) => existing.toLowerCase() === candidate.toLowerCase())) {
      continue;
    }

    candidates.push(candidate);
  }

  for (const candidate of candidates) {
    if (candidate.toLowerCase() === normalizedCurrentBranch) {
      continue;
    }

    const match = localBranches.find(
      (branchName) => String(branchName || "").trim().toLowerCase() === candidate.toLowerCase(),
    );

    if (match) {
      return match;
    }
  }

  return "";
}

function readGitStatusPorcelain(directory) {
  try {
    const output = execFileSync(
      "git",
      ["-C", directory, "status", "--porcelain=v1", "--untracked-files=all"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );

    return String(output || "")
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function detectWorkingTreeSignals(directory, identity) {
  const artifactPath = identity?.artifactPath ? path.join(directory, identity.artifactPath) : "";
  const hasExistingArtifacts = Boolean(artifactPath && existsSync(artifactPath));
  const statusLines = readGitStatusPorcelain(directory);
  const hasWorkingTreeChanges = statusLines.length > 0;
  const hasTrackedChanges = statusLines.some((line) => !line.startsWith("??"));
  const hasUntrackedChanges = statusLines.some((line) => line.startsWith("??"));

  return {
    hasExistingArtifacts,
    hasWorkingTreeChanges,
    hasTrackedChanges,
    hasUntrackedChanges,
  };
}

function detectUserIntent(argumentsText) {
  const normalized = normalizeArguments(argumentsText).toLowerCase();

  return {
    finalizationRequested:
      /\b(finali[sz]e|finalization|commit|merge|push|complete|finish|wrap up|close)\b/.test(normalized),
  };
}

function readBranchMetadata(directory, branchName) {
  const gitDir = resolveGitDir(directory);

  if (!gitDir || !branchName) {
    return {
      branchName,
      values: {},
    };
  }

  const configPath = path.join(gitDir, "config");
  if (!existsSync(configPath)) {
    return {
      branchName,
      values: {},
    };
  }

  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  const values = {};
  let inBranchSection = false;

  for (const line of lines) {
    const sectionMatch = line.match(/^\s*\[([^\s"]+)\s+"([^"]+)"\]\s*$/);
    if (sectionMatch) {
      inBranchSection = sectionMatch[1] === "branch" && sectionMatch[2] === branchName;
      continue;
    }

    if (!inBranchSection) {
      continue;
    }

    const kvMatch = line.match(/^\s*([^=]+?)\s*=\s*(.*)$/);
    if (!kvMatch) {
      continue;
    }

    values[kvMatch[1].trim()] = kvMatch[2].trim();
  }

  return {
    branchName,
    values,
  };
}

function isStrongWorkflowMatch(branchMetadata, savedState, identity, currentBranch) {
  const savedBranchName = String(savedState?.branch?.name || "").trim();
  const branchName = String(currentBranch || branchMetadata?.branchName || savedBranchName || "").trim();

  if (!branchName) {
    return false;
  }

  if (savedBranchName && branchName === savedBranchName) {
    return true;
  }

  const metadataKey =
    branchMetadata?.values?.devaiWorkflowKey ||
    branchMetadata?.values?.devaiworkflowkey ||
    "";

  if (metadataKey && metadataKey === savedState?.workflowKey) {
    return true;
  }

  const lowerBranch = branchName.toLowerCase();
  const tokens = [
    identity?.ticket,
    identity?.storyId,
    identity?.artifactKey,
    identity?.identityKey,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return tokens.some((token) => token && lowerBranch.includes(token));
}

function findCandidateBranches(branches, identity, policy) {
  const searchTerms = [
    identity?.ticket,
    identity?.storyId,
    identity?.artifactKey,
    identity?.identityKey,
    identity?.normalizedArgs,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9]+/g))
    .filter(Boolean);

  const uniqueTerms = Array.from(new Set(searchTerms));
  const scored = [];

  for (const branchName of branches || []) {
    const lowerBranch = String(branchName).toLowerCase();
    let score = 0;

    for (const term of uniqueTerms) {
      if (lowerBranch.includes(term)) {
        score += 1;
      }
    }

    if (score > 0) {
      scored.push({ branchName, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.branchName.localeCompare(b.branchName));

  return scored.slice(0, policy?.branchRequired ? 3 : 1).map((entry) => entry.branchName);
}

function extractArtifactIdentity(commandName, directory, argumentsText, policy) {
  const normalizedArgs = normalizeArguments(argumentsText);
  const ticket = extractTicket(normalizedArgs);
  const storyId = extractStoryId(normalizedArgs);
  const artifactKey = policy?.artifactKey || sanitizeWorkflowKeyPart(commandName);

  if (policy?.identityStrategy === "story") {
    return {
      ticket,
      storyId,
      artifactKey: storyId || ticket || artifactKey,
      artifactPath: path.join(
        ".bmad-master",
        "_bmad-output",
        "implementation-artifacts",
        `${storyId ? `story-${storyId}` : sanitizeWorkflowKeyPart(ticket || normalizedArgs || commandName) || "story"}.md`,
      ),
      normalizedArgs,
      identityKey: storyId || ticket || normalizedArgs || artifactKey,
    };
  }

  if (policy?.identityStrategy === "artifact-singleton") {
    return {
      ticket,
      storyId,
      artifactKey,
      artifactPath: path.join(".bmad-master", "_bmad-output", `${artifactKey}.md`),
      normalizedArgs,
      identityKey: artifactKey,
    };
  }

  if (policy?.identityStrategy === "ticket-or-args") {
    return {
      ticket,
      storyId,
      artifactKey: ticket || sanitizeWorkflowKeyPart(normalizedArgs || commandName),
      artifactPath: ticket
        ? path.join(".bmad-master", "_bmad-output", `${ticket.toLowerCase()}.md`)
        : "",
      normalizedArgs,
      identityKey: ticket || normalizedArgs || sanitizeWorkflowKeyPart(commandName),
    };
  }

  if (policy?.identityStrategy === "artifact-or-args") {
    return {
      ticket,
      storyId,
      artifactKey: artifactKey || ticket || sanitizeWorkflowKeyPart(normalizedArgs || commandName),
      artifactPath: path.join(
        ".bmad-master",
        "_bmad-output",
        `${sanitizeWorkflowKeyPart(commandName) || "workflow"}.md`,
      ),
      normalizedArgs,
      identityKey: ticket || storyId || normalizedArgs || artifactKey,
    };
  }

  return {
    ticket,
    storyId,
    artifactKey: ticket || storyId || artifactKey,
    artifactPath: "",
    normalizedArgs,
    identityKey: ticket || storyId || normalizedArgs || artifactKey,
  };
}

function extractWorkflowIdentity(commandName, argumentsText, directory, policy) {
  return extractArtifactIdentity(commandName, directory, argumentsText, policy);
}

function buildWorkflowKey(commandName, identity, policy) {
  const stablePart = sanitizeWorkflowKeyPart(
    identity?.identityKey ||
      identity?.artifactKey ||
      identity?.ticket ||
      identity?.storyId ||
      identity?.normalizedArgs ||
      policy?.artifactKey ||
      "default",
  );

  return `${commandName}::${stablePart || "default"}`;
}

function ensureStateDirectory(directory) {
  const stateDirectory = path.join(directory, ".opencode", "state", "devai-git-workflow");

  if (!existsSync(stateDirectory)) {
    mkdirSync(stateDirectory, { recursive: true });
  }

  return stateDirectory;
}

function buildWorkflowStatePath(directory, workflowKey) {
  const stateDirectory = ensureStateDirectory(directory);
  const fileName = `${String(workflowKey || "")
    .replace(/::/g, "__")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")}.json`;
  return path.join(stateDirectory, fileName);
}

function loadWorkflowState(directory, workflowKey) {
  const statePath = buildWorkflowStatePath(directory, workflowKey);

  if (!existsSync(statePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function saveWorkflowState(directory, state) {
  if (!state?.workflowKey) {
    return;
  }

  const statePath = buildWorkflowStatePath(directory, state.workflowKey);
  const payload = JSON.stringify(state, null, 2);
  writeFileSync(statePath, `${payload}\n`, "utf8");
}

function listWorkflowStates(directory) {
  const stateDirectory = ensureStateDirectory(directory);

  if (!existsSync(stateDirectory)) {
    return [];
  }

  const states = [];
  for (const entry of readdirSync(stateDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(stateDirectory, entry.name);
    try {
      states.push(JSON.parse(readFileSync(filePath, "utf8")));
    } catch {
      continue;
    }
  }

  return states;
}

function mergeState(base, patch) {
  if (!patch || typeof patch !== "object") {
    return base;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
      base[key] = mergeState({ ...base[key] }, value);
      continue;
    }

    base[key] = value;
  }

  return base;
}

function updateWorkflowState(directory, workflowKey, patch) {
  const existing = loadWorkflowState(directory, workflowKey) || { workflowKey };
  const nextState = mergeState({ ...existing }, patch);
  nextState.workflowKey = workflowKey;
  nextState.session = {
    ...(existing.session || {}),
    ...(nextState.session || {}),
    lastUpdatedAt: new Date().toISOString(),
  };
  saveWorkflowState(directory, nextState);
  return nextState;
}

function createInitialState({
  commandName,
  workflowKey,
  workflowCategory,
  identity,
  branchName,
  branchRequired,
  branchCreatedByPlugin,
  adoptionMode = "fresh",
  diagnostics = {},
  lifecycleStatus = "active",
  progressPhase = "created",
  sessionID,
}) {
  const now = new Date().toISOString();

  return {
    version: 1,
    workflowKey,
    commandName,
    workflowCategory,
    identity,
    branch: {
      name: branchName || "",
      createdByPlugin: Boolean(branchCreatedByPlugin),
      status: branchRequired ? "proposed" : "not-required",
    },
    session: {
      lastSessionID: sessionID,
      startedAt: now,
      lastUpdatedAt: now,
    },
    progress: {
      phase: progressPhase,
      hasMutatedFiles: false,
      cleanExit: false,
      finalizationQueued: false,
      commitDone: false,
      pushDone: false,
    },
    initApproved: false,
    lifecycle: {
      status: lifecycleStatus,
    },
    adoptionMode,
    diagnostics,
    mergeTargetBranch: "",
    pendingResumeQuestionID: "",
    pendingAdoptQuestionID: "",
    pendingAdoptExistingQuestionID: "",
    pendingBranchNameQuestionID: "",
    pendingBranchCreateQuestionID: "",
    pendingExistingBranchQuestionID: "",
    pendingLongLivedBranchQuestionID: "",
    pendingInitQuestionID: "",
    pendingBaselineQuestionID: "",
    pendingFinalizeQuestionID: "",
    pendingMergeQuestionID: "",
    baselineApproved: false,
    finalizeApproved: false,
    mergeApproved: false,
  };
}

function finalizationSatisfied(state, policy) {
  if (policy.finalization === "commit-and-push") {
    return Boolean(state.progress?.commitDone && state.progress?.pushDone);
  }

  if (policy.finalization === "commit-optional-push") {
    return Boolean(state.progress?.commitDone);
  }

  return true;
}

function completeWorkflow(state) {
  state.progress.phase = "completed";
  state.progress.finalizationQueued = false;
  state.lifecycle.status = "completed";
  return state;
}

function markStateUpdated(state, sessionID) {
  state.session = {
    ...(state.session || {}),
    lastSessionID: sessionID,
    lastUpdatedAt: new Date().toISOString(),
  };
  return state;
}

function buildMergeBranchQuestionInstruction(state) {
  const mergeTargetBranch = String(state?.mergeTargetBranch || "").trim();
  const mergeTargetLabel = mergeTargetBranch || "Long-Lived Branch";

  return [
    "Ask the user the `Merge Branch` question with these exact options:",
    `1. \`Merge Into ${mergeTargetLabel}\``,
    "2. `Skip Merge For Now`",
    mergeTargetBranch
      ? `If the user chooses Merge Into ${mergeTargetLabel}, merge the current branch into \`${mergeTargetBranch}\` and then mark the workflow complete.`
      : "If the user chooses Merge Into Long-Lived Branch, merge the current branch into the repository's long-lived branch and then mark the workflow complete.",
  ].join("\n");
}

function buildMergeApprovedInstruction(state) {
  const mergeTargetBranch = String(state?.mergeTargetBranch || "").trim();

  return [
    mergeTargetBranch
      ? `Merge the current branch into \`${mergeTargetBranch}\` now.`
      : "Merge the current branch into the repository's long-lived branch now.",
    "Use the repository's standard git merge flow and finish the workflow after the merge succeeds.",
  ].join("\n");
}

function needsGitInitApproval(state, policy) {
  return Boolean(policy?.branchRequired && state?.diagnostics?.isRepo === false && !state?.initApproved);
}

function needsBaselineCommitApproval(state, policy) {
  return Boolean(
    policy?.branchRequired &&
      state?.diagnostics?.isRepo === true &&
      state?.diagnostics?.hasCommit === false &&
      !state?.baselineApproved,
  );
}

function baselineCommitPending(state, policy) {
  return Boolean(
    policy?.branchRequired &&
      state?.diagnostics?.isRepo === true &&
      state?.diagnostics?.hasCommit === false,
  );
}

function buildInitializeGitQuestionInstruction(commandName) {
  return [
    `This workflow cannot continue yet because /${commandName} is running in a directory that is not a git repository.`,
    "Ask the user the `Initialize Git` question with these exact options:",
    "1. `Initialize Git (Recommended)`",
    "2. `Cancel Workflow`",
    "If the user chooses Initialize Git, run `git init` only after that approval.",
    "Do not ask for a branch name or continue implementation before the git-init decision is made.",
  ].join("\n");
}

function buildBaselineCommitQuestionInstruction(commandName) {
  return [
    `This workflow cannot continue yet because /${commandName} is in a git repository without an initial commit.`,
    "Ask the user the `Create Baseline Commit` question with these exact options:",
    "1. `Create Baseline Commit (Recommended)`",
    "2. `Cancel Workflow`",
    "If the user chooses Create Baseline Commit, create the initial commit before asking for a branch name or starting implementation.",
    "Use the repository's current files as the baseline snapshot and do not continue branch setup until the commit succeeds.",
  ].join("\n");
}

function buildWorkflowStartInstruction({ commandName, workflowKey, decision, state, policy }) {
  const identitySummary = [];

  if (state.identity?.ticket) {
    identitySummary.push(`ticket=${state.identity.ticket}`);
  }

  if (state.identity?.storyId) {
    identitySummary.push(`story=${state.identity.storyId}`);
  }

  if (state.identity?.artifactKey) {
    identitySummary.push(`artifact=${state.identity.artifactKey}`);
  }

  const header = `Git workflow guard is active for /${commandName} (${workflowKey}).`;
  const summary = identitySummary.length > 0 ? `Identity: ${identitySummary.join(", ")}.` : "Identity: none.";

  if (needsGitInitApproval(state, policy)) {
    return [
      header,
      summary,
      buildInitializeGitQuestionInstruction(commandName),
    ].join("\n");
  }

  if (needsBaselineCommitApproval(state, policy)) {
    return [
      header,
      summary,
      buildBaselineCommitQuestionInstruction(commandName),
    ].join("\n");
  }

  if (!policy.branchRequired && decision.action === "create-fresh") {
    return [
      header,
      summary,
      "This workflow does not require a dedicated branch. Continue with the workflow and keep persisted state updated as progress changes.",
    ].join("\n");
  }

  switch (decision.action) {
    case "resume-managed":
      return [
        header,
        summary,
        "Resume the existing workflow on the current branch.",
        `Use the saved state on \`${state.branch.name || "the current branch"}\` and continue from phase \`${state.progress.phase}\`.`,
        "Do not ask for a new branch unless the workflow state is unusable.",
      ].join("\n");
    case "adopt-existing-branch":
      return [
        header,
        summary,
        `A similar existing branch was found: \`${state.branch.name || "workflow"}\`.`,
        "Ask the user the `Existing Branch` question with these exact options:",
        "1. `Checkout Existing Branch (Recommended)`",
        "2. `Create Managed Branch Instead`",
        "3. `Choose Different Branch`",
      ].join("\n");
    case "warn-long-lived-branch":
      return [
        header,
        summary,
        "A long-lived branch already has unmanaged work on it.",
        "Ask the user the `Long-Lived Branch Warning` question with these exact options:",
        "1. `Create Managed Branch (Recommended)`",
        "2. `Finalize On Current Branch`",
        "3. `Cancel`",
      ].join("\n");
    case "adopt-finalize-only":
      return [
        header,
        summary,
        "The current branch already contains unmanaged work and looks ready for finalization.",
        "Ask the user the `Adopt Existing Work` question with these exact options:",
        "1. `Finalize On Current Branch (Recommended)`",
        "2. `Adopt Current Branch For Workflow`",
        "3. `Create Managed Branch Instead`",
        "4. `Cancel`",
        "If the user chooses finalization, keep the current branch and move directly into the normal finalization flow without re-requesting branch or init setup.",
      ].join("\n");
    case "adopt-in-progress":
      return [
        header,
        summary,
        "The current branch already contains unmanaged work.",
        "Ask the user the `Adopt Existing Work` question with these exact options:",
        "1. `Finalize On Current Branch (Recommended)`",
        "2. `Adopt Current Branch For Workflow`",
        "3. `Create Managed Branch Instead`",
        "4. `Cancel`",
      ].join("\n");
    case "create-fresh":
    default:
      return [
        header,
        summary,
        "No saved workflow state or strong branch match was found.",
        "Ask the user for a branch name and create a new branch if they approve it.",
        `Suggested branch: \`${state.branch.name || "workflow"}\`.`,
      ].join("\n");
  }
}

function buildWorkflowFinishInstruction(state, policy) {
  if (policy.finalization === "no-forced-finalization") {
    return [
      `The /${state.commandName} workflow has finished.`,
      "No forced git finalization is required for this workflow.",
      "If the work should be committed, do so only if the user wants that outcome.",
      "Otherwise, mark the workflow complete and stop.",
    ].join("\n");
  }

  if (policy.finalization === "commit-optional-push") {
    return [
      `The /${state.commandName} workflow has finished.`,
      "Ask the user the `Finalize Changes` question with these exact options:",
      "1. `Commit Now (Recommended)`",
      "2. `Skip Commit For Now`",
      `If the user chooses Commit Now, commit the changes with the default message \`chore(devai): complete ${state.commandName}\` unless they provide a better one.`,
      buildMergeBranchQuestionInstruction(state),
      "If the user skips either step, complete the workflow cleanly.",
    ].join("\n");
  }

  const pushLine =
    policy.finalization === "commit-optional-push"
      ? "Push is optional if the user or repo setup does not require it."
      : "Push the branch after the commit and set the upstream if needed.";

  return [
    `The /${state.commandName} workflow has finished. Finalize git now.`,
    "1. Run `git status --short`.",
    "2. If there are no changes, state that there is nothing to commit and stop.",
    `3. Ensure branch \`${state.branch.name || "current"}\` is active.`,
    "4. Stage the relevant changes and commit them.",
    `5. Use the default commit message \`chore(devai): complete ${state.commandName}\` unless the user gave a better one.`,
    `6. ${pushLine}`,
    "Remember that branch and commit actions still require approval in this project.",
  ].join("\n");
}

function maybeCompleteWorkflow(state, policy) {
  if (policy.finalization === "commit-optional-push") {
    if (state.progress?.cleanExit && (state.progress?.finalizationQueued || state.progress?.phase === "finalizing")) {
      return completeWorkflow(state);
    }

    return state;
  }

  if (state.progress?.cleanExit && (state.progress?.finalizationQueued || state.progress?.phase === "finalizing")) {
    return completeWorkflow(state);
  }

  if (!state.progress?.finalizationQueued) {
    return state;
  }

  if (!finalizationSatisfied(state, policy)) {
    return state;
  }

  return completeWorkflow(state);
}

function decideWorkflowAdoption({
  policy,
  identity,
  workflowKey,
  savedState,
  gitContext,
  branchMetadata,
  workingTreeSignals,
  userIntent,
  pluginConfig,
}) {
  const currentBranch = gitContext.currentBranch || "";
  const savedBranchName = String(savedState?.branch?.name || "").trim();
  const savedStatus = String(savedState?.lifecycle?.status || "").trim();
  const hasSavedState = Boolean(savedState);
  const strongMatch = isStrongWorkflowMatch(
    branchMetadata,
    savedState,
    identity,
    currentBranch,
  );
  const diagnostics = {
    hasExistingArtifacts: Boolean(workingTreeSignals?.hasExistingArtifacts),
    hasWorkingTreeChanges: Boolean(workingTreeSignals?.hasWorkingTreeChanges),
    isLongLivedBranch: isLongLivedBranch(currentBranch, pluginConfig),
    isRepo: Boolean(gitContext?.isRepo),
    hasCommit: Boolean(gitContext?.hasCommit),
    hasSavedState,
  };
  const candidateBranches = findCandidateBranches(gitContext.branches, identity, policy).filter(
    (branchName) => branchName && branchName !== currentBranch,
  );
  const preferredCandidateBranch = candidateBranches[0] || "";
  diagnostics.candidateBranches = candidateBranches;

  if (hasSavedState && (savedStatus === "active" || savedStatus === "paused")) {
    if (savedBranchName && savedBranchName === currentBranch) {
      return {
        action: "resume-managed",
        branchName: savedBranchName,
        reason: "saved-state-match",
        confidence: "high",
        diagnostics,
      };
    }

    if (savedBranchName && gitContext.branches.includes(savedBranchName)) {
      return {
        action: "resume-managed",
        branchName: savedBranchName,
        reason: "saved-branch-exists",
        confidence: "high",
        diagnostics,
      };
    }

    return {
      action: "resume-managed",
      branchName: savedBranchName || currentBranch || "",
      reason: "saved-branch-missing",
      confidence: "medium",
      diagnostics,
    };
  }

  if (preferredCandidateBranch) {
    return {
      action: "adopt-existing-branch",
      branchName: preferredCandidateBranch,
      reason: "existing-candidate-branch",
      confidence: "medium",
      diagnostics,
    };
  }

  if (diagnostics.isLongLivedBranch && (diagnostics.hasExistingArtifacts || diagnostics.hasWorkingTreeChanges)) {
    return {
      action: "warn-long-lived-branch",
      branchName: currentBranch || savedBranchName || "",
      reason: "long-lived-branch-with-existing-work",
      confidence: "high",
      diagnostics,
    };
  }

  if (strongMatch && (diagnostics.hasExistingArtifacts || diagnostics.hasWorkingTreeChanges)) {
    return {
      action:
        userIntent?.finalizationRequested &&
        (diagnostics.hasExistingArtifacts || diagnostics.hasWorkingTreeChanges)
          ? "adopt-finalize-only"
          : "adopt-in-progress",
      branchName: currentBranch,
      reason:
        userIntent?.finalizationRequested &&
        (diagnostics.hasExistingArtifacts || diagnostics.hasWorkingTreeChanges)
          ? "existing-work-and-finalization-intent"
          : "existing-work-and-current-branch-match",
      confidence: "high",
      diagnostics,
    };
  }

  if (policy.branchRequired === false) {
    return {
      action: "create-fresh",
      branchName: currentBranch || savedBranchName || "",
      reason: "branch-not-required",
      confidence: "high",
      diagnostics,
    };
  }

  return {
    action: "create-fresh",
    branchName: createBranchName(
      workflowKey.split("::")[0],
      identity?.normalizedArgs || identity?.identityKey || "",
      pluginConfig,
    ),
    reason: "no-match",
    confidence: "high",
    diagnostics,
  };
}

async function queueFinalization(client, directory, sessionID, state, policy) {
  await client.session.promptAsync({
    sessionID,
    directory,
    parts: [
      {
        type: "text",
        text: buildWorkflowFinishInstruction(state, policy),
        synthetic: true,
        metadata: {
          source: "devai-git-workflow",
          phase: "finalize",
        },
      },
    ],
  });
}

async function queueInstruction(client, directory, sessionID, text, phase) {
  await client.session.promptAsync({
    sessionID,
    directory,
    parts: [
      {
        type: "text",
        text,
        synthetic: true,
        metadata: {
          source: "devai-git-workflow",
          phase,
        },
      },
    ],
  });
}

async function ensureBaselineQuestionQueued(client, directory, sessionID, state) {
  if (state?.pendingBaselineQuestionID) {
    return;
  }

  await queueInstruction(
    client,
    directory,
    sessionID,
    buildBaselineCommitQuestionInstruction(state.commandName),
    "baseline-commit",
  );
}

function getCommandText(args) {
  return typeof args?.command === "string" ? args.command.trim() : "";
}

function extractGitCommand(commandText) {
  const text = String(commandText || "").trim();

  if (!text) {
    return "";
  }

  const segments = text
    .split(/;|&&|\|\|/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (/^git(?:\s|$)/.test(segment)) {
      return segment;
    }
  }

  const gitIndex = text.search(/\bgit\b/);
  return gitIndex >= 0 ? text.slice(gitIndex).trim() : text;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function tokenizeCommand(command) {
  const matches = String(command || "").match(/"[^"]*"|'[^']*'|\S+/g);
  return (matches || []).map((token) => stripWrappingQuotes(token));
}

function isBranchCommand(command, branchName) {
  const tokens = tokenizeCommand(command);

  if (tokens[0] !== "git") {
    return false;
  }

  if (tokens[1] === "switch" && tokens[2] === "-c" && tokens[3] === branchName) {
    return true;
  }

  if (tokens[1] === "checkout" && tokens[2] === "-b" && tokens[3] === branchName) {
    return true;
  }

  if (tokens[1] === "switch" && tokens[2] === branchName) {
    return true;
  }

  if (tokens[1] === "checkout" && tokens[2] === branchName) {
    return true;
  }

  return false;
}

function isAllowedPreflightGitCommand(command, branchName) {
  if (
    [
      /^git\s+status(\s|$)/,
      /^git\s+rev-parse(\s|$)/,
      /^git\s+branch(\s|$)/,
      /^git\s+for-each-ref(\s|$)/,
      /^git\s+show-ref(\s|$)/,
      /^git\s+symbolic-ref(\s|$)/,
      /^git\s+remote(\s|$)/,
      /^git\s+init(\s|$)/,
    ].some((pattern) => pattern.test(command))
  ) {
    return true;
  }

  return isBranchCommand(command, branchName);
}

function isAllowedBaselineGitCommand(command) {
  return [
    /^git\s+status(\s|$)/,
    /^git\s+rev-parse(\s|$)/,
    /^git\s+add(\s|$)/,
    /^git\s+commit(\s|$)/,
  ].some((pattern) => pattern.test(command));
}

function isAllowedReadyStateGitCommand(command) {
  return [
    /^git\s+diff(\s|$)/,
    /^git\s+diff\s+--staged(\s|$)/,
    /^git\s+log(\s|$)/,
    /^git\s+merge-base(\s|$)/,
    /^git\s+show(\s|$)/,
    /^git\s+rev-parse(?:\s+--abbrev-ref)?\s+@\{upstream\}(\s|$)/,
  ].some((pattern) => pattern.test(command));
}

export const DevaiGitWorkflowPlugin = async ({ client, directory }) => {
  const workflowCommands = loadWorkflowCommands(directory);
  const pluginConfig = loadPluginConfig(directory);
  const states = new Map();

  await client.app.log({
    body: {
      service: "devai-git-workflow",
      level: "info",
      message: "plugin initialized",
      extra: {
        workflowCommandCount: workflowCommands.size,
        branchPattern: pluginConfig.branch.pattern,
        stateDirectory: path.join(directory, ".opencode", "state", "devai-git-workflow"),
      },
    },
  });

  return {
    "command.execute.before": async (input, output) => {
      const commandName = normalizeCommandName(input.command);

      if (!workflowCommands.has(commandName)) {
        return;
      }

      const policy = getWorkflowPolicy(commandName, pluginConfig);
      const identity = extractWorkflowIdentity(commandName, input.arguments, directory, policy);
      const workflowKey = buildWorkflowKey(commandName, identity, policy);
      const gitContext = loadGitContext(directory);
      const savedState = loadWorkflowState(directory, workflowKey);
      const reusableSavedState =
        savedState && String(savedState.lifecycle?.status || "") !== "completed"
          ? savedState
          : null;
      const branchMetadata = readBranchMetadata(directory, gitContext.currentBranch);
      const workingTreeSignals = detectWorkingTreeSignals(directory, identity);
      const userIntent = detectUserIntent(input.arguments);
      const decision = decideWorkflowAdoption({
        policy,
        identity,
        workflowKey,
        savedState,
        gitContext,
        branchMetadata,
        workingTreeSignals,
        userIntent,
        pluginConfig,
      });
      const adoptionModeByAction = {
        "resume-managed": "managed",
        "adopt-existing-branch": "fresh",
        "adopt-in-progress": "adopted-in-progress",
        "adopt-finalize-only": "adopted-finalize-only",
        "warn-long-lived-branch": "fresh",
        "create-fresh": "fresh",
      };

      let state = reusableSavedState
        ? {
            ...reusableSavedState,
            identity,
            commandName,
            workflowCategory: policy.category,
          }
        : createInitialState({
            commandName,
            workflowKey,
            workflowCategory: policy.category,
            identity,
            branchName: decision.branchName || gitContext.currentBranch || "",
            branchRequired: policy.branchRequired,
            branchCreatedByPlugin: decision.action === "create-fresh",
            adoptionMode: adoptionModeByAction[decision.action] || "fresh",
            diagnostics: decision.diagnostics || {
              hasExistingArtifacts: false,
              hasWorkingTreeChanges: false,
              isLongLivedBranch: false,
              hasSavedState: false,
            },
            progressPhase:
              decision.action === "adopt-finalize-only"
                ? "finalizing"
                : decision.action === "adopt-in-progress"
                  ? "in-progress"
                  : "created",
            sessionID: input.sessionID,
          });

      state.workflowKey = workflowKey;
      state.commandName = commandName;
      state.workflowCategory = policy.category;
      state.identity = identity;
      state.branch = {
        ...(state.branch || {}),
        name: decision.branchName || state.branch?.name || gitContext.currentBranch || "",
        createdByPlugin:
          decision.action === "create-fresh" ||
          Boolean(state.branch?.createdByPlugin),
        status: policy.branchRequired
          ? decision.action === "resume-managed"
            ? "ready"
            : "proposed"
          : "not-required",
      };
      state.session = {
        ...(state.session || {}),
        lastSessionID: input.sessionID,
        startedAt: state.session?.startedAt || new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      };
      state.progress = {
        phase:
          decision.action === "resume-managed" && state.progress?.phase === "paused"
            ? "in-progress"
            : state.progress?.phase || "created",
        hasMutatedFiles:
          Boolean(state.progress?.hasMutatedFiles) || Boolean(decision.diagnostics?.hasWorkingTreeChanges),
        cleanExit:
          Boolean(state.progress?.cleanExit) && !Boolean(decision.diagnostics?.hasWorkingTreeChanges),
        finalizationQueued: Boolean(state.progress?.finalizationQueued),
        commitDone: Boolean(state.progress?.commitDone),
        pushDone: Boolean(state.progress?.pushDone),
      };
      state.initApproved = Boolean(state.initApproved);
      state.lifecycle = {
        status:
          decision.action === "resume-managed" &&
          String(reusableSavedState?.lifecycle?.status || "") === "paused"
            ? "active"
            : state.lifecycle?.status || "active",
      };
      if (decision.action === "adopt-in-progress" || decision.action === "adopt-finalize-only") {
        state.initApproved = true;
      }
      state.adoptionMode = adoptionModeByAction[decision.action] || state.adoptionMode || "fresh";
      state.mergeTargetBranch =
        state.mergeTargetBranch ||
        resolveMergeTargetBranch(gitContext, pluginConfig, gitContext.currentBranch);
      state.diagnostics = {
        ...(state.diagnostics || {}),
        ...(decision.diagnostics || {}),
      };
      state.pendingResumeQuestionID = state.pendingResumeQuestionID || "";
      state.pendingAdoptQuestionID = state.pendingAdoptQuestionID || "";
      state.pendingAdoptExistingQuestionID = state.pendingAdoptExistingQuestionID || "";
      state.pendingBranchNameQuestionID = state.pendingBranchNameQuestionID || "";
      state.pendingBranchCreateQuestionID = state.pendingBranchCreateQuestionID || "";
      state.pendingExistingBranchQuestionID = state.pendingExistingBranchQuestionID || "";
      state.pendingLongLivedBranchQuestionID = state.pendingLongLivedBranchQuestionID || "";
      state.pendingInitQuestionID = state.pendingInitQuestionID || "";
      state.pendingBaselineQuestionID = state.pendingBaselineQuestionID || "";
      state.pendingFinalizeQuestionID = state.pendingFinalizeQuestionID || "";
      state.pendingMergeQuestionID = state.pendingMergeQuestionID || "";
      state.baselineApproved = Boolean(state.baselineApproved);
      state.finalizeApproved = Boolean(state.finalizeApproved);
      state.mergeApproved = Boolean(state.mergeApproved);
      state.decision = decision;
      markStateUpdated(state, input.sessionID);

      states.set(input.sessionID, state);
      saveWorkflowState(directory, state);

      output.parts.push({
        type: "text",
        text: buildWorkflowStartInstruction({
          commandName,
          workflowKey,
          decision,
          state,
          policy,
        }),
        synthetic: true,
        metadata: {
          source: "devai-git-workflow",
          phase: "start",
        },
      });

      if (needsGitInitApproval(state, policy)) {
        await queueInstruction(
          client,
          directory,
          input.sessionID,
          buildInitializeGitQuestionInstruction(commandName),
          "initialize-git",
        );
      } else if (needsBaselineCommitApproval(state, policy)) {
        await queueInstruction(
          client,
          directory,
          input.sessionID,
          buildBaselineCommitQuestionInstruction(commandName),
          "baseline-commit",
        );
      }
    },

    "tool.execute.before": async (input, output) => {
      const state = states.get(input.sessionID);

      if (!state || state.lifecycle?.status === "completed") {
        return;
      }

      if (input.tool === "question") {
        return;
      }

      const policy = getWorkflowPolicy(state.commandName, pluginConfig);
      const baselinePending = baselineCommitPending(state, policy);

      if (SAFE_READ_TOOLS.has(input.tool)) {
        if (baselinePending) {
          if (!state.pendingBaselineQuestionID) {
            try {
              await ensureBaselineQuestionQueued(client, directory, input.sessionID, state);
            } catch {
              // Best effort only; the guard still blocks further progress.
            }
          }

          throw new Error(
            `Git workflow guard: answer the baseline commit question before continuing /${state.commandName}.`,
          );
        }

        return;
      }

      if (needsBaselineCommitApproval(state, policy) && MUTATING_TOOLS.has(input.tool)) {
        if (!state.pendingBaselineQuestionID) {
          try {
            await ensureBaselineQuestionQueued(client, directory, input.sessionID, state);
          } catch {
            // Best effort only; the guard still blocks the edit path.
          }
        }

        throw new Error(
          `Git workflow guard: create the baseline commit before editing files for /${state.commandName}.`,
        );
      }

      if (MUTATING_TOOLS.has(input.tool) && policy.branchRequired && state.branch?.status !== "ready") {
        throw new Error(
          `Git workflow guard: create or switch to branch \`${state.branch?.name || "workflow"}\` before editing files for /${state.commandName}.`,
        );
      }

      if (input.tool === "bash") {
        const command = extractGitCommand(getCommandText(input.args || output.args));

        if (
          baselinePending &&
          !state.baselineApproved &&
          !isAllowedBaselineGitCommand(command)
        ) {
          if (!state.pendingBaselineQuestionID) {
            try {
              await ensureBaselineQuestionQueued(client, directory, input.sessionID, state);
            } catch {
              // Best effort only; the guard still blocks the command.
            }
          }

          throw new Error(
            "Git workflow guard: ask the user via the question tool whether creating the baseline commit is allowed, then create the initial commit before running other git commands.",
          );
        }

        if (
          baselinePending &&
          state.baselineApproved &&
          !isAllowedBaselineGitCommand(command)
        ) {
          if (!state.pendingBaselineQuestionID) {
            try {
              await ensureBaselineQuestionQueued(client, directory, input.sessionID, state);
            } catch {
              // Best effort only; the guard still blocks the command.
            }
          }

          throw new Error(
            "Git workflow guard: complete the approved baseline commit before continuing with branch setup or other git commands.",
          );
        }

        if (baselinePending && isBranchCommand(command, state.branch?.name || "")) {
          throw new Error(
            "Git workflow guard: create the baseline commit before creating or switching to the workflow branch.",
          );
        }

        if (/^git\s+init(\s|$)/.test(command) && policy.branchRequired && !state.initApproved) {
          throw new Error(
            "Git workflow guard: ask the user via the question tool whether git initialization is allowed before running `git init`.",
          );
        }

        if (
          !baselinePending &&
          policy.branchRequired &&
          isBranchCommand(command, state.branch?.name || "") &&
          !["approved", "ready"].includes(String(state.branch?.status || ""))
        ) {
          throw new Error(
            `Git workflow guard: ask the user via the question tool whether branch creation/switch to \`${state.branch?.name || "workflow"}\` is allowed before running \`${command}\`.`,
          );
        }

        if (!baselinePending && policy.branchRequired && !isAllowedPreflightGitCommand(command, state.branch?.name || "")) {
          const readyState =
            state.branch?.status === "ready" ||
            state.progress?.phase === "finalizing" ||
            state.progress?.finalizationQueued;

          if (readyState && isAllowedReadyStateGitCommand(command)) {
            return;
          }

          if (state.progress?.phase === "finalizing" && (state.finalizeApproved || state.mergeApproved)) {
            return;
          }

          throw new Error(
            `Git workflow guard: finish repository initialization and branch creation (\`${state.branch?.name || "workflow"}\`) before running \`${command || "bash"}\`.`,
          );
        }
      }
    },

    "tool.execute.after": async (input, output) => {
      const state = states.get(input.sessionID);

      if (!state) {
        return;
      }

      const policy = getWorkflowPolicy(state.commandName, pluginConfig);

      if (MUTATING_TOOLS.has(input.tool)) {
        state.progress.hasMutatedFiles = true;
        state.progress.cleanExit = false;
        if (policy.branchRequired) {
          state.progress.phase = "in-progress";
        }
      }

      if (input.tool !== "bash") {
        markStateUpdated(state, input.sessionID);
        saveWorkflowState(directory, state);
        return;
      }

      const command = extractGitCommand(getCommandText(input.args));
      const commandOutput = typeof output.output === "string" ? output.output.trim() : "";

      if (/^git\s+init(\s|$)/.test(command)) {
        state.initApproved = false;
        state.diagnostics = {
          ...(state.diagnostics || {}),
          isRepo: true,
          hasCommit: false,
        };
        state.progress.phase = state.progress.phase === "created" ? "in-progress" : state.progress.phase;

        if (needsBaselineCommitApproval(state, policy) && !state.pendingBaselineQuestionID) {
          try {
            await ensureBaselineQuestionQueued(client, directory, input.sessionID, state);
          } catch {
            // Best effort only; saved state still reflects that a baseline commit is required.
          }
        }

        if (Array.isArray(output.parts)) {
          output.parts.push({
            type: "text",
            text: buildBaselineCommitQuestionInstruction(state.commandName),
            synthetic: true,
            metadata: {
              source: "devai-git-workflow",
              phase: "baseline-commit",
            },
          });
        }
      }

      if (isBranchCommand(command, state.branch?.name || "")) {
        state.branch = {
          ...(state.branch || {}),
          status: "ready",
          createdByPlugin: true,
        };
        state.progress.phase = "branch-ready";
      }

      if (/^git\s+status(\s|$)/.test(command)) {
        state.progress.cleanExit =
          commandOutput.length === 0 &&
          (state.progress.finalizationQueued || state.progress.phase === "finalizing");
        if (state.progress.cleanExit) {
          state.progress.finalizationQueued = false;
        }
      }

      if (/^git\s+commit(\s|$)/.test(command)) {
        const wasBaselineCommit = policy.branchRequired && state.diagnostics?.hasCommit === false;
        const refreshedGitContext = loadGitContext(directory);
        if (wasBaselineCommit && refreshedGitContext.hasCommit) {
          state.baselineApproved = false;
          state.diagnostics = {
            ...(state.diagnostics || {}),
            isRepo: Boolean(refreshedGitContext.isRepo),
            hasCommit: true,
          };
          state.progress.phase = "created";
          state.progress.cleanExit = false;

          if (!["approved", "ready"].includes(String(state.branch?.status || "")) && !state.pendingBranchNameQuestionID) {
            try {
              await queueInstruction(
                client,
                directory,
                input.sessionID,
                `Ask a question with header \`Branch Name\` and let the user provide a branch name. Suggested branch: \`${state.branch?.name || "workflow"}\`.`,
                "branch-name-after-baseline",
              );
            } catch {
              // Best effort only; state now indicates that baseline setup is complete.
            }
          }

          markStateUpdated(state, input.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (refreshedGitContext.hasCommit) {
          state.diagnostics = {
            ...(state.diagnostics || {}),
            isRepo: Boolean(refreshedGitContext.isRepo),
            hasCommit: true,
          };
        }

        state.progress.commitDone = true;
        state.progress.phase = "finalizing";
        state.progress.cleanExit = false;

        if (
          policy.finalization === "commit-optional-push" &&
          state.finalizeApproved &&
          !state.mergeApproved &&
          !state.pendingMergeQuestionID
        ) {
          try {
            await queueInstruction(
              client,
              directory,
              input.sessionID,
              [
                `The commit for /${state.commandName} succeeded.`,
                buildMergeBranchQuestionInstruction(state),
              ].join("\n"),
              "merge-branch",
            );
          } catch {
            // Best effort only; the workflow still advances through saved state.
          }

          markStateUpdated(state, input.sessionID);
          saveWorkflowState(directory, state);
          return;
        }
      }

      if (/^git\s+push(\s|$)/.test(command)) {
        state.progress.pushDone = true;
      }

      if (/^git\s+merge(\s|$)/.test(command) && policy.finalization === "commit-optional-push" && state.mergeApproved) {
        completeWorkflow(state);
      }

      maybeCompleteWorkflow(state, policy);
      markStateUpdated(state, input.sessionID);
      saveWorkflowState(directory, state);
    },

    event: async ({ event }) => {
      if (event.type === "question.asked") {
        const state = states.get(event.properties.sessionID);

        if (!state) {
          return;
        }

        const questions = event.properties.questions || [];
        const hasResumeHeader = questions.some((question) => question.header === "Resume Workflow");
        const hasAdoptHeader = questions.some((question) => question.header === "Adopt Current Branch");
        const hasAdoptExistingHeader = questions.some((question) => question.header === "Adopt Existing Work");
        const hasBranchHeader = questions.some((question) => question.header === "Branch Name");
        const hasBranchExecutionHeader = questions.some((question) => question.header === "Create Branch");
        const hasBranchNameInputHeader = questions.some((question) => question.header === "Branch Name Input");
        const hasInitGitHeader = questions.some((question) => question.header === "Initialize Git");
        const hasBaselineCommitHeader = questions.some((question) => question.header === "Create Baseline Commit");
        const hasExistingBranchHeader = questions.some(
          (question) => question.header === "Existing Branch" || question.header === "Similar Branch",
        );
        const hasLongLivedBranchHeader = questions.some(
          (question) => question.header === "Long-Lived Branch Warning",
        );
        const hasFinalizeChangesHeader = questions.some((question) => question.header === "Finalize Changes");
        const hasMergeBranchHeader = questions.some((question) => question.header === "Merge Branch");

        if (hasResumeHeader) {
          state.pendingResumeQuestionID = event.properties.id;
        }

        if (hasAdoptHeader) {
          state.pendingAdoptQuestionID = event.properties.id;
        }

        if (hasAdoptExistingHeader) {
          state.pendingAdoptExistingQuestionID = event.properties.id;
        }

        if (hasBranchHeader) {
          state.pendingBranchNameQuestionID = event.properties.id;
        }

        if (hasBranchExecutionHeader) {
          state.pendingBranchCreateQuestionID = event.properties.id;
        }

        if (hasBranchNameInputHeader) {
          state.pendingBranchNameQuestionID = event.properties.id;
        }

        if (hasInitGitHeader) {
          state.pendingInitQuestionID = event.properties.id;
        }

        if (hasBaselineCommitHeader) {
          state.pendingBaselineQuestionID = event.properties.id;
        }

        if (hasExistingBranchHeader) {
          state.pendingExistingBranchQuestionID = event.properties.id;
        }

        if (hasLongLivedBranchHeader) {
          state.pendingLongLivedBranchQuestionID = event.properties.id;
        }

        if (hasFinalizeChangesHeader) {
          state.pendingFinalizeQuestionID = event.properties.id;
        }

        if (hasMergeBranchHeader) {
          state.pendingMergeQuestionID = event.properties.id;
        }

        markStateUpdated(state, event.properties.sessionID);
        saveWorkflowState(directory, state);
        return;
      }

      if (event.type === "question.replied") {
        const state = states.get(event.properties.sessionID);

        if (!state) {
          return;
        }

        const policy = getWorkflowPolicy(state.commandName, pluginConfig);
        const firstAnswer = event.properties.answers?.[0]?.[0]?.trim?.() || "";
        const normalizedAnswer = firstAnswer.toLowerCase();

        if (event.properties.requestID === state.pendingResumeQuestionID) {
          state.pendingResumeQuestionID = "";

          if (normalizedAnswer.includes("checkout saved") || normalizedAnswer.includes("checkout")) {
            state.branch.name = state.decision?.branchName || state.branch.name;
            state.branch.status = "approved";
            state.lifecycle.status = "active";
            state.progress.phase = "in-progress";
          } else if (normalizedAnswer.includes("current")) {
            state.branch.name = state.branch.name || state.decision?.branchName || "";
            state.branch.status = "ready";
            state.lifecycle.status = "active";
            state.progress.phase = "in-progress";
          } else if (normalizedAnswer.includes("create")) {
            await queueInstruction(
              client,
              directory,
              event.properties.sessionID,
              `Ask a new question with header \`Branch Name\` and let the user choose or enter a new branch name. Suggested branch: \`${state.branch.name || "workflow"}\`.`,
              "resume-create-branch",
            );
            state.pendingBranchNameQuestionID = event.properties.id;
          }

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingAdoptQuestionID) {
          state.pendingAdoptQuestionID = "";

          if (normalizedAnswer.includes("current")) {
            state.adoptionMode = "adopted-in-progress";
            state.branch.name = state.branch.name || state.decision?.branchName || "";
            state.branch.status = "ready";
            state.initApproved = true;
            state.lifecycle.status = "active";
            state.progress.phase = "in-progress";
          } else if (normalizedAnswer.includes("create")) {
            state.adoptionMode = "fresh";
            state.branch.createdByPlugin = true;
            state.branch.status = "proposed";
            state.initApproved = false;
            state.progress.phase = "created";
            await queueInstruction(
              client,
              directory,
              event.properties.sessionID,
              `Ask a question with header \`Branch Name\` and let the user provide a new branch name. Suggested branch: \`${state.branch.name || "workflow"}\`.`,
              "adopt-create-branch",
            );
            state.pendingBranchNameQuestionID = event.properties.id;
          }

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingAdoptExistingQuestionID) {
          state.pendingAdoptExistingQuestionID = "";

          if (normalizedAnswer.includes("finalize")) {
            state.adoptionMode = "adopted-finalize-only";
            state.branch.status = "ready";
            state.initApproved = true;
            state.progress.phase = "finalizing";
          } else if (normalizedAnswer.includes("adopt")) {
            state.adoptionMode = "adopted-in-progress";
            state.branch.status = "ready";
            state.initApproved = true;
            state.progress.phase = "in-progress";
          } else if (normalizedAnswer.includes("create")) {
            state.adoptionMode = "fresh";
            state.branch.createdByPlugin = true;
            state.branch.status = "proposed";
            state.initApproved = false;
            state.progress.phase = "created";
            await queueInstruction(
              client,
              directory,
              event.properties.sessionID,
              `Ask a question with header \`Branch Name\` and let the user provide a new managed branch name. Suggested branch: \`${state.branch.name || "workflow"}\`.`,
              "adopt-create-branch",
            );
            state.pendingBranchNameQuestionID = event.properties.id;
          } else if (normalizedAnswer.includes("cancel")) {
            state.lifecycle.status = "paused";
          }

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingLongLivedBranchQuestionID) {
          state.pendingLongLivedBranchQuestionID = "";

          if (normalizedAnswer.includes("finalize")) {
            state.adoptionMode = "adopted-finalize-only";
            state.branch.status = "ready";
            state.initApproved = true;
            state.progress.phase = "finalizing";
          } else if (normalizedAnswer.includes("create")) {
            state.adoptionMode = "fresh";
            state.branch.createdByPlugin = true;
            state.branch.status = "proposed";
            state.initApproved = false;
            state.progress.phase = "created";
            await queueInstruction(
              client,
              directory,
              event.properties.sessionID,
              `Ask a question with header \`Branch Name\` and let the user create a managed branch. Suggested branch: \`${state.branch.name || "workflow"}\`.`,
              "long-lived-create-branch",
            );
            state.pendingBranchNameQuestionID = event.properties.id;
          } else if (normalizedAnswer.includes("cancel")) {
            state.lifecycle.status = "paused";
          }

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingBranchNameQuestionID) {
          state.pendingBranchNameQuestionID = "";

          if (!firstAnswer || firstAnswer === state.decision?.branchName) {
            state.branch.name = state.decision?.branchName || state.branch.name;
          } else if (validateBranchName(firstAnswer, pluginConfig)) {
            state.branch.name = firstAnswer;
          } else {
            await queueInstruction(
              client,
              directory,
              event.properties.sessionID,
              `The user-provided branch name \`${firstAnswer}\` is invalid. Ask again with the question tool. The branch name must match \`${pluginConfig.branch.validationRegex}\`.`,
              "branch-name-retry",
            );
            markStateUpdated(state, event.properties.sessionID);
            saveWorkflowState(directory, state);
            return;
          }

          state.branch.status = "approved";
          state.lifecycle.status = "active";
          state.progress.phase = "branch-ready";
          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingInitQuestionID) {
          const first = firstAnswer.toLowerCase();
          state.pendingInitQuestionID = "";

          if (first.includes("initialize") || first.includes("approve") || first.includes("yes")) {
            state.initApproved = true;
          }

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingBaselineQuestionID) {
          const first = firstAnswer.toLowerCase();
          state.pendingBaselineQuestionID = "";

          if (
            first.includes("baseline") ||
            first.includes("create") ||
            first.includes("approve") ||
            first.includes("yes")
          ) {
            state.baselineApproved = true;
          } else {
            state.lifecycle.status = "paused";
          }

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingFinalizeQuestionID) {
          state.pendingFinalizeQuestionID = "";

          if (normalizedAnswer.includes("skip")) {
            completeWorkflow(state);
            markStateUpdated(state, event.properties.sessionID);
            saveWorkflowState(directory, state);
            states.delete(event.properties.sessionID);
            return;
          }

          state.finalizeApproved = true;
          state.progress.phase = "finalizing";

          await queueInstruction(
            client,
            directory,
            event.properties.sessionID,
            [
              "Proceed with the commit now.",
              `Use the default commit message \`chore(devai): complete ${state.commandName}\` unless the user gave a better one.`,
              "After the commit succeeds, wait for the merge decision.",
            ].join("\n"),
            "finalize-commit",
          );

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingMergeQuestionID) {
          state.pendingMergeQuestionID = "";

          if (normalizedAnswer.includes("skip")) {
            completeWorkflow(state);
            markStateUpdated(state, event.properties.sessionID);
            saveWorkflowState(directory, state);
            states.delete(event.properties.sessionID);
            return;
          }

          state.mergeApproved = true;

          await queueInstruction(
            client,
            directory,
            event.properties.sessionID,
            buildMergeApprovedInstruction(state),
            "merge-approved",
          );

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingExistingBranchQuestionID) {
          state.pendingExistingBranchQuestionID = "";

          if (normalizedAnswer.includes("checkout")) {
            state.adoptionMode = "adopted-in-progress";
            state.branch.name = state.decision?.branchName || state.branch.name;
            state.branch.status = "approved";
            state.initApproved = true;
            state.lifecycle.status = "active";
            state.progress.phase = "in-progress";
          } else if (normalizedAnswer.includes("create")) {
            state.adoptionMode = "fresh";
            state.branch.createdByPlugin = true;
            state.branch.status = "proposed";
            state.initApproved = false;
            state.progress.phase = "created";
            await queueInstruction(
              client,
              directory,
              event.properties.sessionID,
              `Ask a question with header \`Branch Name\` and create a new branch if the user approves it. Suggested branch: \`${state.branch.name || "workflow"}\`.`,
              "existing-create-branch",
            );
            state.pendingBranchNameQuestionID = event.properties.id;
          } else if (normalizedAnswer.includes("choose")) {
            await queueInstruction(
              client,
              directory,
              event.properties.sessionID,
              "Ask a new question with header `Branch Name Input` and let the user type the exact branch name they want to use or create.",
              "existing-branch-choose",
            );
            state.pendingBranchNameQuestionID = event.properties.id;
          }

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID === state.pendingBranchCreateQuestionID) {
          const normalized = firstAnswer.toLowerCase();
          state.pendingBranchCreateQuestionID = "";

          if (
            normalized.includes("approve") ||
            normalized.includes("yes") ||
            normalized.includes("allow") ||
            normalized.includes("proceed")
          ) {
            state.branch.status = "approved";
            state.progress.phase = "branch-ready";
          }

          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          return;
        }

        if (event.properties.requestID !== state.pendingExistingBranchQuestionID) {
          return;
        }

        markStateUpdated(state, event.properties.sessionID);
        saveWorkflowState(directory, state);
        return;
      }

      if (event.type === "question.rejected") {
        const state = states.get(event.properties.sessionID);

        if (!state) {
          return;
        }

        if (event.properties.requestID === state.pendingResumeQuestionID) {
          state.pendingResumeQuestionID = "";
        }

        if (event.properties.requestID === state.pendingAdoptQuestionID) {
          state.pendingAdoptQuestionID = "";
        }

        if (event.properties.requestID === state.pendingAdoptExistingQuestionID) {
          state.pendingAdoptExistingQuestionID = "";
        }

        if (event.properties.requestID === state.pendingBranchNameQuestionID) {
          state.pendingBranchNameQuestionID = "";
        }

        if (event.properties.requestID === state.pendingBranchCreateQuestionID) {
          state.pendingBranchCreateQuestionID = "";
        }

        if (event.properties.requestID === state.pendingExistingBranchQuestionID) {
          state.pendingExistingBranchQuestionID = "";
        }

        if (event.properties.requestID === state.pendingLongLivedBranchQuestionID) {
          state.pendingLongLivedBranchQuestionID = "";
        }

        if (event.properties.requestID === state.pendingInitQuestionID) {
          state.pendingInitQuestionID = "";
        }

        if (event.properties.requestID === state.pendingBaselineQuestionID) {
          state.pendingBaselineQuestionID = "";
        }

        if (event.properties.requestID === state.pendingFinalizeQuestionID) {
          state.pendingFinalizeQuestionID = "";
        }

        if (event.properties.requestID === state.pendingMergeQuestionID) {
          state.pendingMergeQuestionID = "";
        }

        state.lifecycle.status = state.lifecycle.status === "completed" ? "completed" : "paused";
        markStateUpdated(state, event.properties.sessionID);
        saveWorkflowState(directory, state);
        return;
      }

      if (event.type === "command.executed") {
        const state = states.get(event.properties.sessionID);

        if (!state) {
          return;
        }

        if (normalizeCommandName(event.properties.name) !== state.commandName) {
          return;
        }

        const policy = getWorkflowPolicy(state.commandName, pluginConfig);

        if (policy.finalization === "no-forced-finalization") {
          state.progress.phase = "completed";
          state.lifecycle.status = "completed";
          markStateUpdated(state, event.properties.sessionID);
          saveWorkflowState(directory, state);
          states.delete(event.properties.sessionID);
          return;
        }

        state.progress.phase = "finalizing";
        state.progress.finalizationQueued = true;
        state.lifecycle.status = "active";
        markStateUpdated(state, event.properties.sessionID);
        saveWorkflowState(directory, state);

        try {
          await queueFinalization(client, directory, event.properties.sessionID, state, policy);
        } catch (error) {
          await client.app.log({
            body: {
              service: "devai-git-workflow",
              level: "error",
              message: "failed to queue git finalization prompt",
              extra: {
                sessionID: event.properties.sessionID,
                commandName: state.commandName,
                error: error instanceof Error ? error.message : String(error),
              },
            },
          });
        }

        return;
      }

      if (event.type === "session.idle") {
        const state = states.get(event.properties.sessionID);

        if (!state) {
          return;
        }

        const policy = getWorkflowPolicy(state.commandName, pluginConfig);

        maybeCompleteWorkflow(state, policy);

        if (state.lifecycle.status !== "completed") {
          state.lifecycle.status = "paused";
        }

        markStateUpdated(state, event.properties.sessionID);
        saveWorkflowState(directory, state);

        if (state.lifecycle.status === "completed") {
          states.delete(event.properties.sessionID);
        }

        return;
      }

      if (event.type === "session.deleted") {
        const state = states.get(event.properties.sessionID);

        if (!state) {
          return;
        }

        const policy = getWorkflowPolicy(state.commandName, pluginConfig);

        maybeCompleteWorkflow(state, policy);

        if (state.lifecycle.status !== "completed") {
          state.lifecycle.status = "paused";
        }

        markStateUpdated(state, event.properties.sessionID);
        saveWorkflowState(directory, state);
        states.delete(event.properties.sessionID);
      }
    },
  };
};
