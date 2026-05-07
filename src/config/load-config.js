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
import { validateRuntimeConfig } from "./validate-config.js";

function stripJsonComments(text) {
  return String(text || "")
    .replace(/^﻿/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Parse a JSONC text. Returns a tagged result so callers can surface
 * parse failures through the validation pipeline instead of silently
 * dropping the file content.
 *
 * @returns {{ ok: true, value: unknown } | { ok: false, error: Error }}
 */
function parseJsoncResult(text) {
  try {
    return { ok: true, value: JSON.parse(stripJsonComments(text)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_PLUGIN_CONFIG));
}

/**
 * Deep-merge `override` on top of `base`.
 * Arrays in override fully replace the corresponding array in base.
 */
export function mergeObjects(base, override) {
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

/**
 * Merge an ordered array of config layer objects (lowest to highest priority).
 * Starting point is a clone of DEFAULT_PLUGIN_CONFIG.
 */
export function mergeConfigs(layers) {
  let result = cloneDefaultConfig();
  for (const layer of layers) {
    if (layer && typeof layer === "object" && !Array.isArray(layer)) {
      result = mergeObjects(result, layer);
    }
  }
  return result;
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

/**
 * Read a JSONC config file. Returns:
 *   - `null` when the file does not exist (treated as absent layer)
 *   - the parsed object on success
 *   - an empty object on parse failure, AND pushes a normalized error entry
 *     into `parseErrors` so the caller can surface it via audit.
 */
function readConfigFile(fsAdapter, filePath, layerName, parseErrors) {
  if (!fsAdapter.existsSync(filePath)) {
    return null;
  }

  const text = fsAdapter.readFileSync(filePath, "utf8");
  const result = parseJsoncResult(text);
  if (result.ok) {
    return result.value;
  }

  parseErrors.push({
    instancePath: filePath,
    message: `JSON parse error in ${layerName}: ${result.error.message}`,
    params: { source: "parseJsonc", layer: layerName },
  });
  return {};
}

/**
 * Named helper: read global config layer. Missing files become `{}` so the
 * empty layer participates as a no-op merge, matching prior semantics.
 */
function readGlobalConfig(fsAdapter, paths, parseErrors) {
  return readConfigFile(fsAdapter, paths.globalConfigPath, "globalConfig", parseErrors) || {};
}

/**
 * Named helper: read project config layer.
 */
function readProjectConfig(fsAdapter, paths, parseErrors) {
  return readConfigFile(fsAdapter, paths.projectConfigPath, "projectConfig", parseErrors);
}

/**
 * Named helper: read legacy config layers.
 */
function readLegacyConfigs(fsAdapter, paths, parseErrors) {
  return {
    legacyProjectConfig: readConfigFile(
      fsAdapter,
      paths.legacyProjectConfigPath,
      "legacyProjectConfig",
      parseErrors,
    ),
    legacyWorkflowProjectConfig: readConfigFile(
      fsAdapter,
      paths.legacyWorkflowProjectConfigPath,
      "legacyWorkflowProjectConfig",
      parseErrors,
    ),
  };
}

/**
 * Tag each layer error with its source so audit consumers can attribute
 * the failure to a specific config layer.
 */
function tagErrorsWithLayer(errors, layerName) {
  return errors.map((err) => ({
    ...err,
    params: {
      ...(err && err.params ? err.params : {}),
      layer: layerName,
    },
  }));
}

/**
 * Validate-and-recover merge pipeline (v2 — incremental, per-layer).
 *
 * Walks the layers from lowest to highest priority. For each layer, builds
 * a candidate config by merging it on top of the running accumulator and
 * validates the candidate against the runtime schema. If the candidate is
 * valid, the layer is kept; otherwise the layer is dropped (its errors are
 * tagged with the layer name for audit) and the accumulator stays at the
 * last-known-good state.
 *
 * Validation is performed BEFORE normalization so that invalid raw values
 * (for example `branch.longLivedBranches: 42`) are caught by the schema
 * rather than silently corrected by `normalizeConfig`.
 *
 * Properties guaranteed by this algorithm:
 *   - A valid upper layer is never dropped because of an invalid lower layer.
 *     (Rejecting AI-1: prior algorithm dropped from highest down on every
 *     failure, which destroyed valid `projectConfig` when `globalConfig` was
 *     malformed.)
 *   - Each layer is validated at most once, so audit `details.errors` does
 *     not contain duplicate entries for the same layer (AI-7).
 *   - When every layer fails, the result is the normalized DEFAULT_PLUGIN_CONFIG.
 *
 * Precedence order (lowest to highest priority):
 *   DEFAULT_PLUGIN_CONFIG → globalConfig → legacyProjectConfig
 *   → legacyWorkflowProjectConfig → projectConfig
 *
 * @returns {{ mergedConfig: object, droppedLayers: string[], errors: import("ajv").ErrorObject[] }}
 */
function validateAndRecover(globalConfig, legacyProjectConfig, legacyWorkflowProjectConfig, projectConfig) {
  const orderedLayers = [
    { name: "globalConfig", value: globalConfig },
    { name: "legacyProjectConfig", value: legacyProjectConfig },
    { name: "legacyWorkflowProjectConfig", value: legacyWorkflowProjectConfig },
    { name: "projectConfig", value: projectConfig },
  ];

  let acceptedConfig = cloneDefaultConfig();
  const droppedLayers = [];
  const errors = [];

  for (const layer of orderedLayers) {
    if (!layer.value || typeof layer.value !== "object" || Array.isArray(layer.value)) {
      // Absent layers (null) and non-object layers are no-ops — skip without recording.
      continue;
    }

    const candidate = mergeObjects(acceptedConfig, layer.value);
    const { valid, errors: layerErrors } = validateRuntimeConfig(candidate);

    if (valid) {
      acceptedConfig = candidate;
    } else {
      droppedLayers.push(layer.name);
      errors.push(...tagErrorsWithLayer(layerErrors, layer.name));
    }
  }

  return {
    mergedConfig: normalizeConfig(acceptedConfig),
    droppedLayers,
    errors,
  };
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

/**
 * Load and merge runtime configuration from all sources using a deterministic
 * precedence pipeline (lowest to highest priority):
 *   DEFAULT_PLUGIN_CONFIG → globalConfig → legacyProjectConfig
 *   → legacyWorkflowProjectConfig → projectConfig
 *
 * Returns an object with:
 *   - `config`: the normalized effective configuration
 *   - `paths`: resolved file paths
 *   - `sources`: boolean flags for which sources were found
 *   - `validation`:
 *       - `valid`: final mergedConfig passes schema validation
 *       - `recovered`: at least one layer was dropped (recovered from failure)
 *       - `droppedLayers`: layer names dropped during validation
 *       - `errors`: normalized error entries (parse failures + schema failures)
 *
 * Does NOT throw. Validation failures are surfaced in `validation` and the
 * caller is responsible for emitting `config.validation.failed` audit events.
 */
export function loadRuntimeConfig(directory, fsAdapter) {
  const paths = resolveConfigPaths(directory, fsAdapter);

  // parseErrors collects JSONC parse failures so they are surfaced through
  // the validation pipeline instead of being silently swallowed (AI-2).
  const parseErrors = [];

  const globalConfigRaw = readConfigFile(
    fsAdapter,
    paths.globalConfigPath,
    "globalConfig",
    parseErrors,
  );
  const globalConfig = globalConfigRaw || {};
  const projectConfig = readProjectConfig(fsAdapter, paths, parseErrors);
  const { legacyProjectConfig, legacyWorkflowProjectConfig } = readLegacyConfigs(
    fsAdapter,
    paths,
    parseErrors,
  );

  const { mergedConfig, droppedLayers, errors: schemaErrors } = validateAndRecover(
    globalConfig,
    legacyProjectConfig,
    legacyWorkflowProjectConfig,
    projectConfig,
  );

  const errors = [...parseErrors, ...schemaErrors];
  const recovered = droppedLayers.length > 0 || parseErrors.length > 0;

  return {
    config: mergedConfig,
    paths,
    sources: {
      hasGlobalConfig: globalConfigRaw !== null,
      hasProjectConfig: Boolean(projectConfig),
      hasLegacyWorkflowProjectConfig: Boolean(legacyWorkflowProjectConfig),
      hasLegacyProjectConfig: Boolean(legacyProjectConfig),
    },
    validation: {
      valid: errors.length === 0,
      recovered,
      droppedLayers,
      errors,
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
