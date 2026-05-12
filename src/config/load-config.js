import path from "node:path";
import { DEFAULT_PLUGIN_CONFIG } from "./defaults.js";
import {
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_FILE_NAME,
  PROJECT_CONFIG_DIR,
  PROJECT_CONFIG_FILE_NAME,
} from "../utils/constants.js";
import {
  collectWorkflowPolicyVocabularyWarnings,
  validateRuntimeConfig,
} from "./validate-config.js";

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

// Story 4.1: Single normalization entry point for the effective configuration.
//
// All branch.* fields downstream consumers depend on are filled with safe
// defaults HERE so neither `src/services/git/branch-service.js` nor
// `src/services/workflow/resolve-workflow-policy.js` need to repeat per-field
// `|| <default>` fallbacks. After Story 4.1, those services receive an
// already-normalized effective config and act as thin pass-throughs.
// Minimal code-side safety nets used when neither the merged config nor any
// template supplied a value. These exist purely so the plugin does not crash
// or behave nonsensically when run without any JSONC at all — they are NOT
// "defaults" in the user-facing sense (those live in
// `templates/devai-aidd-plugin.global.jsonc`).
const SAFE_BRANCH_DEFAULTS = {
  pattern: "{type}/{ticket}-{slug}",
  defaultType: "chore",
  fallbackTicket: "no-ticket",
  validationRegex: "",
  longLivedBranches: ["main", "master"],
};

function normalizeConfig(config) {
  const merged = mergeObjects(cloneDefaultConfig(), config);

  if (!merged.branch || typeof merged.branch !== "object" || Array.isArray(merged.branch)) {
    merged.branch = {};
  }

  // longLivedBranches: dedupe, lowercase, trim, drop empty. If the merged
  // config has none, fall back to the code-side safety net so a fresh install
  // without any JSONC still treats main/master as protected.
  const configuredLongLivedBranches = Array.isArray(merged.branch.longLivedBranches)
    ? merged.branch.longLivedBranches
    : [];

  const normalizedLongLived = Array.from(
    new Set(
      configuredLongLivedBranches
        .map((branchName) => String(branchName || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  merged.branch.longLivedBranches =
    normalizedLongLived.length > 0
      ? normalizedLongLived
      : [...SAFE_BRANCH_DEFAULTS.longLivedBranches];

  // defaultMergeTarget: trim only (empty string is a valid "no merge target" signal).
  merged.branch.defaultMergeTarget = String(merged.branch.defaultMergeTarget || "").trim();

  // pattern / defaultType / fallbackTicket: safe-default fallback.
  for (const key of ["pattern", "defaultType", "fallbackTicket"]) {
    const value = merged.branch[key];
    if (typeof value !== "string" || value.length === 0) {
      merged.branch[key] = SAFE_BRANCH_DEFAULTS[key];
    }
  }

  // validationRegex: empty string is meaningful ("no regex enforced"),
  // so only normalize the non-string case (defensive — schema rejects this).
  if (typeof merged.branch.validationRegex !== "string") {
    merged.branch.validationRegex = SAFE_BRANCH_DEFAULTS.validationRegex;
  }

  // commandTypeMap: must be a plain object. Coerce non-objects to {}.
  if (
    !merged.branch.commandTypeMap ||
    typeof merged.branch.commandTypeMap !== "object" ||
    Array.isArray(merged.branch.commandTypeMap)
  ) {
    merged.branch.commandTypeMap = {};
  }

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
 * Validate-and-recover merge pipeline.
 *
 * Walks the layers from lowest to highest priority. For each layer, builds
 * a candidate config by merging it on top of the running accumulator and
 * validates the candidate against the runtime schema. If the candidate is
 * valid, the layer is kept; otherwise the layer is dropped (its errors are
 * tagged with the layer name for audit) and the accumulator stays at the
 * last-known-good state.
 *
 * Validation is performed BEFORE normalization so that invalid raw values
 * are caught by the schema rather than silently corrected by `normalizeConfig`.
 *
 * Properties guaranteed by this algorithm:
 *   - A valid upper layer is never dropped because of an invalid lower layer.
 *   - Each layer is validated at most once.
 *   - When every layer fails, the result is the normalized DEFAULT_PLUGIN_CONFIG.
 *
 * Precedence order (lowest to highest priority):
 *   DEFAULT_PLUGIN_CONFIG → globalConfig → projectConfig
 *
 * @returns {{ mergedConfig: object, droppedLayers: string[], errors: import("ajv").ErrorObject[] }}
 */
function validateAndRecover(globalConfig, projectConfig) {
  const orderedLayers = [
    { name: "globalConfig", value: globalConfig },
    { name: "projectConfig", value: projectConfig },
  ];

  let acceptedConfig = cloneDefaultConfig();
  const droppedLayers = [];
  const errors = [];

  for (const layer of orderedLayers) {
    if (!layer.value || typeof layer.value !== "object" || Array.isArray(layer.value)) {
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

  return {
    globalConfigPath,
    projectConfigPath,
  };
}

/**
 * Load and merge runtime configuration from all sources using a deterministic
 * precedence pipeline (lowest to highest priority):
 *   DEFAULT_PLUGIN_CONFIG → globalConfig → projectConfig
 *
 * Returns an object with:
 *   - `config`: the normalized effective configuration
 *   - `paths`: resolved file paths
 *   - `sources`: boolean flags `{ hasGlobalConfig, hasProjectConfig }`
 *   - `validation`:
 *       - `valid`: final mergedConfig passes schema/parse checks (vocabulary
 *         warnings do NOT flip this to false)
 *       - `recovered`: at least one layer was dropped (recovered from failure)
 *       - `droppedLayers`: layer names dropped during validation
 *       - `errors`: parse failures + schema failures + vocabulary warnings
 *
 * Does NOT throw. Validation failures and vocabulary warnings are surfaced
 * in `validation` and the caller is responsible for emitting
 * `config.validation.failed` audit events when `errors.length > 0`.
 */
export function loadRuntimeConfig(directory, fsAdapter) {
  const paths = resolveConfigPaths(directory, fsAdapter);

  const parseErrors = [];

  const globalConfigRaw = readConfigFile(
    fsAdapter,
    paths.globalConfigPath,
    "globalConfig",
    parseErrors,
  );
  const globalConfig = globalConfigRaw || {};
  const projectConfig = readConfigFile(
    fsAdapter,
    paths.projectConfigPath,
    "projectConfig",
    parseErrors,
  );

  const { mergedConfig, droppedLayers, errors: schemaErrors } = validateAndRecover(
    globalConfig,
    projectConfig,
  );

  const vocabularyWarnings = collectWorkflowPolicyVocabularyWarnings(mergedConfig);

  const errors = [...parseErrors, ...schemaErrors, ...vocabularyWarnings];
  const recovered = droppedLayers.length > 0 || parseErrors.length > 0;
  const hardErrorCount = parseErrors.length + schemaErrors.length;

  return {
    config: mergedConfig,
    paths,
    sources: {
      hasGlobalConfig: globalConfigRaw !== null,
      hasProjectConfig: projectConfig !== null,
    },
    validation: {
      valid: hardErrorCount === 0,
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
