import path from "node:path";
import {
  DEFAULT_PLUGIN_CONFIG,
} from "./defaults.js";
import {
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_FILE_NAME,
  LEGACY_COMPAT_MARKER_FILE_NAME,
  LEGACY_PROJECT_CONFIG_FILE_NAME,
  LEGACY_WORKFLOW_PROJECT_CONFIG_FILE_NAME,
  PROJECT_CONFIG_DIR,
  PROJECT_CONFIG_FILE_NAME,
} from "../utils/constants.js";

function stripJsonComments(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function parseJsonc(text, fallback = {}) {
  try {
    return JSON.parse(stripJsonComments(text));
  } catch {
    return fallback;
  }
}

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_PLUGIN_CONFIG));
}

function mergeObjects(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }

  const next = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      next[key] = [...value];
      continue;
    }

    if (value && typeof value === "object") {
      const current =
        next[key] && typeof next[key] === "object" && !Array.isArray(next[key])
          ? next[key]
          : {};
      next[key] = mergeObjects(current, value);
      continue;
    }

    next[key] = value;
  }

  return next;
}

function normalizeConfig(config) {
  const merged = mergeObjects(cloneDefaultConfig(), config);
  const configuredLongLivedBranches = Array.isArray(merged?.branch?.longLivedBranches)
    ? merged.branch.longLivedBranches
    : [];

  merged.branch.longLivedBranches = Array.from(
    new Set(
      configuredLongLivedBranches
        .map((branchName) => String(branchName || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  merged.branch.defaultMergeTarget = String(merged?.branch?.defaultMergeTarget || "").trim();
  return merged;
}

function readConfigFile(fsAdapter, filePath) {
  if (!fsAdapter.existsSync(filePath)) {
    return null;
  }

  return parseJsonc(fsAdapter.readFileSync(filePath, "utf8"), null);
}

export function resolveConfigPaths(directory, fsAdapter) {
  const globalConfigPath = path.join(
    fsAdapter.homedir(),
    GLOBAL_CONFIG_DIR,
    GLOBAL_CONFIG_FILE_NAME,
  );
  const projectConfigPath = path.join(directory, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE_NAME);
  const legacyProjectConfigPath = path.join(
    directory,
    PROJECT_CONFIG_DIR,
    LEGACY_PROJECT_CONFIG_FILE_NAME,
  );
  const legacyWorkflowProjectConfigPath = path.join(
    directory,
    PROJECT_CONFIG_DIR,
    LEGACY_WORKFLOW_PROJECT_CONFIG_FILE_NAME,
  );
  const legacyCompatMarkerPath = path.join(
    directory,
    PROJECT_CONFIG_DIR,
    LEGACY_COMPAT_MARKER_FILE_NAME,
  );

  return {
    globalConfigPath,
    projectConfigPath,
    legacyProjectConfigPath,
    legacyWorkflowProjectConfigPath,
    legacyCompatMarkerPath,
  };
}

export function loadRuntimeConfig(directory, fsAdapter) {
  const paths = resolveConfigPaths(directory, fsAdapter);
  const globalConfig = readConfigFile(fsAdapter, paths.globalConfigPath) || {};
  const projectConfig = readConfigFile(fsAdapter, paths.projectConfigPath);
  const legacyProjectConfig = readConfigFile(fsAdapter, paths.legacyProjectConfigPath);
  const legacyWorkflowProjectConfig = readConfigFile(
    fsAdapter,
    paths.legacyWorkflowProjectConfigPath,
  );

  const sourceConfig =
    projectConfig ||
    legacyWorkflowProjectConfig ||
    legacyProjectConfig ||
    {};
  const mergedConfig = normalizeConfig(mergeObjects(globalConfig, sourceConfig));

  return {
    config: mergedConfig,
    paths,
    sources: {
      hasGlobalConfig: Boolean(readConfigFile(fsAdapter, paths.globalConfigPath)),
      hasProjectConfig: Boolean(projectConfig),
      hasLegacyWorkflowProjectConfig: Boolean(legacyWorkflowProjectConfig),
      hasLegacyProjectConfig: Boolean(legacyProjectConfig),
    },
  };
}

export function loadWorkflowCommands(directory, fsAdapter) {
  const commandsDirectory = path.join(directory, PROJECT_CONFIG_DIR, "commands");

  if (!fsAdapter.existsSync(commandsDirectory)) {
    return new Set();
  }

  return new Set(
    fsAdapter
      .readdirSync(commandsDirectory)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => entry.replace(/\.md$/i, "")),
  );
}

export function ensureLegacyProjectConfigCompatibility(directory, fsAdapter, runtimeConfig) {
  const {
    config,
    paths,
    sources,
  } = runtimeConfig;

  if (sources.hasLegacyProjectConfig && !fsAdapter.existsSync(paths.legacyCompatMarkerPath)) {
    return false;
  }

  if (
    !sources.hasProjectConfig &&
    !sources.hasGlobalConfig &&
    !sources.hasLegacyProjectConfig &&
    !sources.hasLegacyWorkflowProjectConfig
  ) {
    return false;
  }

  const targetDirectory = fsAdapter.dirname(paths.legacyWorkflowProjectConfigPath);
  if (!fsAdapter.existsSync(targetDirectory)) {
    fsAdapter.mkdirSync(targetDirectory, { recursive: true });
  }

  fsAdapter.writeFileSync(
    paths.legacyWorkflowProjectConfigPath,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
  fsAdapter.writeFileSync(
    paths.legacyProjectConfigPath,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
  fsAdapter.writeFileSync(
    paths.legacyCompatMarkerPath,
    "generated by devai-aidd-guard to bridge legacy opencode runtime loading\n",
    "utf8",
  );
  return true;
}
