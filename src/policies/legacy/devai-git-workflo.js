/**
 * src/policies/legacy/devai-git-workflo.js
 *
 * Story 4.3 — FROZEN BASELINE for the BMAD command compatibility contract.
 *
 * This module is the "previous plugin contract baseline" restored in Story 1.1
 * and intentionally KEPT MINIMAL. It implements 4 of the 6 hook keys from
 * `SUPPORTED_HOOK_KEYS` (`src/utils/constants.js`):
 *
 *   - `command.execute.before` — pushes the start-instruction text built by
 *     `buildStartInstruction`. Wrapper MUST forward this push verbatim
 *     (Story 4.5 normalises `output.parts` and asserts wrapper === legacy).
 *   - `tool.execute.before`    — throws the mutating-tool guard message
 *     `"Git workflow guard: create or switch to branch \`workflow\` before
 *     editing files for /<command>."`. Wrapper MUST propagate the same
 *     message string; renaming or rewording it is a contract break.
 *   - `tool.execute.after`     — flips lifecycle to `mutating` for tracked
 *     sessions. Wrapper-side phase advancement runs first; this hook stays
 *     the last delegate so legacy state mirrors wrapper state.
 *   - `event`                  — clears `states.delete(sessionID)` on
 *     `session.deleted`. Wrapper-side `workflowState.clear(sessionID)` runs
 *     first; legacy then independently cleans the SAME sessionID.
 *
 * This module deliberately does NOT implement `permission.asked` or
 * `file.edited` — those are wrapper-only hooks (`WRAPPER_ONLY_HOOK_KEYS`).
 * The 4-vs-6 asymmetry is part of the compatibility definition, not a gap.
 *
 * Story 4.3 GUARDRAILS (do not change in this story or any future story
 * without a sprint-change-proposal):
 *   1. Do NOT add a 5th/6th hook to this file (drift from the frozen baseline).
 *   2. Do NOT change the strings produced by `buildStartInstruction` or the
 *      mutating-tool throw message — Story 4.5 regression compares them
 *      byte-for-byte against the wrapper outputs.
 *   3. Do NOT add new behavior, side effects, or smarter logic here. Any
 *      "smarter" workflow behavior belongs in `src/services/*` and is glued
 *      in by the wrapper hook factories, not by this baseline.
 *   4. Do NOT delete, rename, or move this file. `package.json`'s `test`
 *      script enforces `node --check src/policies/legacy/devai-git-workflo.js`
 *      as an import-ability invariant on every CI run.
 */

import fs from "node:fs";
import path from "node:path";
import { normalizeCommandName } from "../../services/workflow/detect-workflow-context.js";

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

function loadWorkflowCommands(projectDirectory) {
  const commandsDirectory = path.join(projectDirectory, ".opencode", "commands");

  if (!fs.existsSync(commandsDirectory)) {
    return new Set();
  }

  return new Set(
    fs
      .readdirSync(commandsDirectory)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => entry.replace(/\.md$/i, "")),
  );
}

function buildStartInstruction(commandName) {
  return [
    `Git workflow guard is active for /${commandName}.`,
    "Bootstrap compatibility mode is preserving the legacy BMAD hook contract.",
  ].join(" ");
}

async function safeLog(client, payload) {
  try {
    if (client?.app?.log) {
      await client.app.log(payload);
    }
  } catch {
    // Legacy logging is best-effort only.
  }
}

export async function DevaiGitWorkflowPlugin({ client, directory, workflowCommands: providedCommands } = {}) {
  const workflowCommands = providedCommands instanceof Set ? providedCommands : loadWorkflowCommands(directory);
  const states = new Map();

  await safeLog(client, {
    body: {
      service: "devai-git-workflow",
      level: "info",
      message: "plugin initialized",
      extra: {
        workflowCommandCount: workflowCommands.size,
        stateDirectory: path.join(directory, ".opencode", "state", "devai-git-workflow"),
      },
    },
  });

  return {
    "command.execute.before": async (input, output) => {
      const commandName = normalizeCommandName(input?.command);
      if (!workflowCommands.has(commandName)) {
        return;
      }

      states.set(input.sessionID, {
        commandName,
        lifecycle: "active",
      });

      if (!Array.isArray(output.parts)) {
        output.parts = [];
      }

      output.parts.push({
        type: "text",
        text: buildStartInstruction(commandName),
        synthetic: true,
        metadata: {
          source: "devai-git-workflow",
          phase: "start",
        },
      });
    },

    "tool.execute.before": async (input) => {
      const state = states.get(input?.sessionID);
      if (!state) {
        return;
      }

      if (input.tool === "question" || SAFE_READ_TOOLS.has(input.tool)) {
        return;
      }

      if (MUTATING_TOOLS.has(input.tool)) {
        throw new Error(
          `Git workflow guard: create or switch to branch \`workflow\` before editing files for /${state.commandName}.`,
        );
      }
    },

    "tool.execute.after": async (input) => {
      const state = states.get(input?.sessionID);
      if (!state) {
        return;
      }

      if (MUTATING_TOOLS.has(input.tool)) {
        state.lifecycle = "mutating";
      }
    },

    event: async ({ event }) => {
      const sessionID = event?.properties?.sessionID;
      if (event?.type === "session.deleted" && sessionID) {
        states.delete(sessionID);
      }
    },
  };
}

export default DevaiGitWorkflowPlugin;
