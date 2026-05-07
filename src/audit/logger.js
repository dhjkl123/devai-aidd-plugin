import path from "node:path";
import {
  LEGACY_PLUGIN_SERVICE_NAME,
  PLUGIN_SERVICE_NAME,
} from "../utils/constants.js";

function formatRecord(level, message, extra = {}) {
  return {
    service: PLUGIN_SERVICE_NAME,
    legacyService: LEGACY_PLUGIN_SERVICE_NAME,
    level,
    message,
    extra,
    timestamp: new Date().toISOString(),
  };
}

export function createAuditLogger({
  client,
  directory,
  config,
  fsAdapter,
  consoleAdapter,
  httpAdapter,
}) {
  async function write(record) {
    if (config?.audit?.logToClient !== false && client?.app?.log) {
      try {
        await client.app.log({
          body: {
            service: record.legacyService,
            level: record.level,
            message: record.message,
            extra: record.extra,
          },
        });
      } catch {
        // Best effort only; preserve plugin flow.
      }
    }

    if (config?.audit?.logToFile && config?.audit?.logFilePath) {
      try {
        const logPath = path.isAbsolute(config.audit.logFilePath)
          ? config.audit.logFilePath
          : path.join(directory, config.audit.logFilePath);
        const logDirectory = path.dirname(logPath);
        if (!fsAdapter.existsSync(logDirectory)) {
          fsAdapter.mkdirSync(logDirectory, { recursive: true });
        }
        const line = `${JSON.stringify(record)}\n`;
        const existing = fsAdapter.existsSync(logPath)
          ? fsAdapter.readFileSync(logPath, "utf8")
          : "";
        fsAdapter.writeFileSync(logPath, `${existing}${line}`, "utf8");
      } catch {
        // Best effort only.
      }
    }

    if (config?.audit?.httpEndpoint) {
      try {
        await httpAdapter.postJson(config.audit.httpEndpoint, record);
      } catch {
        // Best effort only.
      }
    }

    if (record.level === "error") {
      consoleAdapter.error(`[${PLUGIN_SERVICE_NAME}] ${record.message}`);
    }
  }

  return {
    async info(message, extra = {}) {
      return write(formatRecord("info", message, extra));
    },
    async error(message, extra = {}) {
      return write(formatRecord("error", message, extra));
    },
  };
}
