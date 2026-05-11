/**
 * debug-logger.js
 *
 * Diagnostic logger gated by `config.debug.enabled`. Appends a line per
 * event to a file so an operator can reconstruct exactly where the
 * git-init prompt flow broke when the model appears to ignore the
 * question-tool instruction.
 *
 * Why a separate logger (not just the audit channel):
 *   - audit is structured, opt-in, and consumed by ops dashboards.
 *   - debug is a one-shot human-readable trace meant to be tail'd, copied
 *     into a bug report, and cleared.
 *   - debug fires from sites where audit emission would be excessive noise
 *     (e.g. every `tool.execute.before` decision).
 *
 * Best-effort semantics:
 *   - When disabled, every method is a no-op zero-cost stub.
 *   - When enabled, file writes are wrapped in try/catch — a failing write
 *     never propagates out of the logger and never affects plugin behavior.
 *   - Uses synchronous `appendFileSync` so the log order matches the actual
 *     event order even when called from async paths.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

const DEFAULT_LOG_FILENAME = "devai-aidd-debug.log";

function resolveLogPath(directory, configuredPath) {
  if (typeof configuredPath === "string" && configuredPath.length > 0) {
    return isAbsolute(configuredPath) ? configuredPath : join(directory, configuredPath);
  }
  return join(directory, ".opencode", DEFAULT_LOG_FILENAME);
}

function formatLine(scope, message, payload) {
  const ts = new Date().toISOString();
  const head = `[${ts}] [${scope}] ${message}`;
  if (payload === undefined || payload === null) {
    return `${head}\n`;
  }
  try {
    return `${head} ${JSON.stringify(payload)}\n`;
  } catch {
    return `${head} <unserializable payload>\n`;
  }
}

/**
 * @param {{
 *   enabled?: boolean,
 *   logFilePath?: string,
 *   directory?: string,
 * }} options
 */
export function createDebugLogger({ enabled = false, logFilePath = "", directory = "" } = {}) {
  if (enabled !== true) {
    return {
      enabled: false,
      log() {},
    };
  }

  const resolvedPath = resolveLogPath(directory, logFilePath);
  // Ensure parent directory exists; if mkdir fails, swallow and let the
  // first append throw (which we will also catch).
  try {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  } catch {
    // best-effort
  }

  // Emit a header line so multiple runs are visually separable.
  try {
    appendFileSync(
      resolvedPath,
      formatLine("debug", "logger initialized", { directory, logFilePath: resolvedPath }),
      "utf8",
    );
  } catch {
    // best-effort
  }

  return {
    enabled: true,
    logFilePath: resolvedPath,
    log(scope, message, payload) {
      try {
        appendFileSync(resolvedPath, formatLine(scope, message, payload), "utf8");
      } catch {
        // best-effort — never propagate
      }
    },
  };
}
