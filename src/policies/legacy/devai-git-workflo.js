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
