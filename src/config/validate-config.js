import Ajv2020 from "ajv/dist/2020.js";

// RUNTIME_CONFIG_SCHEMA_VERSION: single source of truth for schema version
export const RUNTIME_CONFIG_SCHEMA_VERSION = 1;

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
  title: "DevAI AIDD Guard Runtime Configuration",
  description: "Full effective configuration shape for the devai-aidd-guard plugin.",
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
            description: "Policy category (e.g. implementation, planning, research, docs, review).",
          },
          identityStrategy: {
            type: "string",
            description: "Identity resolution strategy for the workflow.",
          },
          branchRequired: {
            type: "boolean",
            description: "Whether a branch is required for this workflow.",
          },
          finalization: {
            type: "string",
            description:
              "Finalization behavior (e.g. commit-and-push, commit-optional-push, no-forced-finalization).",
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
  },
  // Top-level stays strict: any unknown top-level key is almost certainly a typo.
  additionalProperties: false,
};

// Compile the schema once with strict mode and allErrors (Draft 2020-12)
// Ajv2020 supports JSON Schema Draft 2020-12 per architecture decision
const ajv = new Ajv2020({ strict: true, allErrors: true });
const _validate = ajv.compile(RUNTIME_CONFIG_SCHEMA);

/**
 * Validates a runtime configuration object against the JSON Schema.
 * Does not throw — the caller decides how to handle failures.
 *
 * @param {object} config - The configuration object to validate.
 * @returns {{ valid: boolean, errors: import("ajv").ErrorObject[] }}
 */
export function validateRuntimeConfig(config) {
  const valid = _validate(config);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (_validate.errors || []).slice(),
  };
}
