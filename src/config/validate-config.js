import Ajv2020 from "ajv/dist/2020.js";

// RUNTIME_CONFIG_SCHEMA_VERSION: single source of truth for schema version
export const RUNTIME_CONFIG_SCHEMA_VERSION = 1;

/**
 * Story 4.1 — Known workflow policy vocabulary.
 *
 * These are the values that ship with `DEFAULT_PLUGIN_CONFIG` and are
 * actively interpreted by services. They are the "recommended" vocabulary.
 *
 * Forward-compat policy (decision recorded in Story 4.1 Dev Notes):
 *   - We did NOT enforce these as a JSON-schema `enum` because Story 1.3
 *     deliberately accepted `additionalProperties: true` on
 *     `workflowPolicy[*]` to keep older hosts forward-compatible with newer
 *     plugin versions.
 *   - Surfacing pipeline (Round 2 follow-up AI-3 — corrected attribution):
 *     1. `collectWorkflowPolicyVocabularyWarnings(config)` (this file, below)
 *        produces audit-warning entries tagged `params.source === "vocabulary"`
 *        and `params.kind === "warning"`. Neither `validateRuntimeConfig`
 *        nor `validateAndRecover` is involved in surfacing vocabulary.
 *     2. `loadRuntimeConfig` in `src/config/load-config.js` calls that
 *        collector AFTER `validateAndRecover` has chosen which layers to
 *        accept, then appends the warnings to `validation.errors` (alongside
 *        parse + schema errors). Vocabulary warnings never trigger a layer
 *        drop and never flip `validation.valid` to false.
 *     3. `src/index.js` bootstrap (the audit trigger block) emits the
 *        existing `config.validation.failed` event whenever
 *        `validation.errors.length > 0`, so vocabulary warnings reach the
 *        same audit channel as hard failures without a new event type.
 *   - Behaviour summary: known vocabulary → silent. Unknown vocabulary →
 *     audit warning entry + the value passes through unchanged so newer
 *     vocabularies can be introduced ahead of host upgrades.
 */
export const KNOWN_WORKFLOW_POLICY_VOCABULARY = Object.freeze({
  category: Object.freeze([
    "implementation",
    "planning",
    "research",
    "docs",
    "review",
  ]),
  identityStrategy: Object.freeze([
    "story",
    "ticket-or-args",
    "artifact-singleton",
    "artifact-or-args",
  ]),
  finalization: Object.freeze([
    "commit-and-push",
    "commit-optional-push",
    "no-forced-finalization",
  ]),
});

/**
 * Runtime configuration JSON Schema (Draft 2020-12).
 * Inlined here so the validator works both in source and in the esbuild bundle
 * (which cannot resolve __dirname-relative readFileSync paths at runtime).
 *
 * Forward-compat policy (AI-3):
 *   - Top-level keeps `additionalProperties: false` so that typos in section
 *     names (e.g. `brach` instead of `branch`) are caught early.
 *   - Extension-prone sections (`branch`, `workflowPolicy[command]`, `audit`)
 *     allow additional properties so that newer plugin versions can add fields
 *     without forcing every downstream config file to be migrated immediately.
 *
 * Schema version policy (AI-5):
 *   - `schemaVersion` is constrained to `const: RUNTIME_CONFIG_SCHEMA_VERSION`.
 *   - Bumping the version requires updating both this constant and adding
 *     migration logic to `validateAndRecover` in `load-config.js`.
 */
export const RUNTIME_CONFIG_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "runtime-config.schema.json",
  title: "DevAI AIDD Plugin Runtime Configuration",
  description: "Full effective configuration shape for the devai-aidd-plugin.",
  type: "object",
  properties: {
    schemaVersion: {
      type: "integer",
      const: RUNTIME_CONFIG_SCHEMA_VERSION,
      default: RUNTIME_CONFIG_SCHEMA_VERSION,
      description:
        "Schema version identifier. Bumping this constant requires a corresponding migration step.",
    },
    branch: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Branch name pattern template.",
        },
        defaultType: {
          type: "string",
          description: "Default branch type (e.g. feat, fix, chore).",
        },
        fallbackTicket: {
          type: "string",
          description: "Fallback ticket identifier when none is detected.",
        },
        longLivedBranches: {
          type: "array",
          items: { type: "string" },
          description: "List of long-lived branch names (e.g. main, master).",
        },
        defaultMergeTarget: {
          type: "string",
          description: "Default merge target branch.",
        },
        validationRegex: {
          type: "string",
          description: "Regex pattern for branch name validation.",
        },
        commandTypeMap: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Mapping of command names to branch type slugs.",
        },
      },
      // Allow forward-compatible extension keys (e.g. future branch.* fields)
      // so a newer plugin's config does not fail validation on an older host.
      additionalProperties: true,
    },
    workflowPolicy: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Policy category. Known vocabulary: implementation, planning, research, docs, review. " +
              "Unknown values are accepted (forward-compat) but raise a vocabulary audit warning.",
          },
          identityStrategy: {
            type: "string",
            description:
              "Identity resolution strategy. Known vocabulary: story, ticket-or-args, artifact-singleton, artifact-or-args. " +
              "Unknown values are accepted (forward-compat) but raise a vocabulary audit warning.",
          },
          branchRequired: {
            type: "boolean",
            description: "Whether a branch is required for this workflow.",
          },
          finalization: {
            type: "string",
            description:
              "Finalization behavior. Known vocabulary: commit-and-push, commit-optional-push, no-forced-finalization. " +
              "Unknown values are accepted (forward-compat) but raise a vocabulary audit warning.",
          },
          artifactKey: {
            type: "string",
            description: "Optional artifact key for singleton artifact strategies.",
          },
        },
        required: ["category", "identityStrategy", "branchRequired", "finalization"],
        // Allow forward-compatible per-command extension keys (e.g. future
        // priority/requiresApproval fields) without breaking older hosts.
        additionalProperties: true,
      },
      description: "Per-command workflow policy mappings.",
    },
    audit: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        logToClient: { type: "boolean" },
        logToFile: { type: "boolean" },
        logFilePath: { type: "string" },
        httpEndpoint: { type: "string" },
      },
      // Allow forward-compatible audit transport keys.
      additionalProperties: true,
    },
    debug: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        logFilePath: { type: "string" },
      },
      // Forward-compat: future debug knobs (verbosity, scopes) can be added
      // by callers without a schema bump.
      additionalProperties: true,
    },
  },
  // Top-level stays strict: any unknown top-level key is almost certainly a typo.
  additionalProperties: false,
};

// Compile the schema once with strict mode and allErrors (Draft 2020-12)
// Ajv2020 supports JSON Schema Draft 2020-12 per architecture decision
const ajv = new Ajv2020({ strict: true, allErrors: true });
const _validate = ajv.compile(RUNTIME_CONFIG_SCHEMA);

function validateBranchRegexSemantics(config) {
  const validationRegex = config?.branch?.validationRegex;
  if (typeof validationRegex !== "string" || validationRegex.length === 0) {
    return [];
  }

  try {
    new RegExp(validationRegex);
    return [];
  } catch (error) {
    return [
      {
        instancePath: "/branch/validationRegex",
        schemaPath: "#/properties/branch/properties/validationRegex",
        keyword: "format",
        params: {
          reason: "invalid-regex",
          error: error instanceof Error ? error.message : String(error),
        },
        message: "must be a valid regular expression",
      },
    ];
  }
}

/**
 * Validates a runtime configuration object against the JSON Schema.
 * Does not throw — the caller decides how to handle failures.
 *
 * @param {object} config - The configuration object to validate.
 * @returns {{ valid: boolean, errors: import("ajv").ErrorObject[] }}
 */
export function validateRuntimeConfig(config) {
  const valid = _validate(config);
  const schemaErrors = valid ? [] : (_validate.errors || []).slice();
  const semanticErrors = validateBranchRegexSemantics(config);

  return {
    valid: Boolean(valid) && semanticErrors.length === 0,
    errors: [...schemaErrors, ...semanticErrors],
  };
}

/**
 * Story 4.1 — Vocabulary audit warnings.
 *
 * Surfaces typos / unknown vocabulary on `workflowPolicy[*].category`,
 * `identityStrategy`, and `finalization` WITHOUT failing JSON schema
 * validation (so the forward-compat policy from Story 1.3 — older hosts
 * accepting newer vocabularies — stays intact).
 *
 * Returns entries shaped like the rest of the validation pipeline so audit
 * consumers can treat them uniformly. The `params.source === "vocabulary"`
 * tag distinguishes them from schema and parse failures, and
 * `params.kind === "warning"` marks the entry as advisory (forward-compat
 * allow-through) — it is currently the only kind this collector emits, so
 * downstream code can rely on the literal value to filter vocabulary
 * warnings out of any "hard error" check.
 *
 * @param {object} config - The fully-merged effective configuration.
 * @returns {Array<object>} Audit-warning entries (may be empty).
 */
export function collectWorkflowPolicyVocabularyWarnings(config) {
  const warnings = [];
  const workflowPolicy = config && typeof config === "object" ? config.workflowPolicy : null;
  if (!workflowPolicy || typeof workflowPolicy !== "object" || Array.isArray(workflowPolicy)) {
    return warnings;
  }

  for (const [commandName, entry] of Object.entries(workflowPolicy)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    for (const field of ["category", "identityStrategy", "finalization"]) {
      const value = entry[field];
      if (typeof value !== "string" || value.length === 0) continue;

      const allowed = KNOWN_WORKFLOW_POLICY_VOCABULARY[field];
      if (!allowed.includes(value)) {
        warnings.push({
          instancePath: `/workflowPolicy/${commandName}/${field}`,
          schemaPath: `#/properties/workflowPolicy/additionalProperties/properties/${field}`,
          keyword: "vocabulary",
          params: {
            source: "vocabulary",
            kind: "warning",
            field,
            commandName,
            value,
            knownValues: [...allowed],
          },
          message: `Unknown ${field} value "${value}" for ${commandName}; known values: ${allowed.join(", ")}`,
        });
      }
    }
  }

  return warnings;
}
