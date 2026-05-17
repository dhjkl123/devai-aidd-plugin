import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createAuditLogger } from "../../src/audit/logger.js";

function createFsAdapter() {
  return {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
  };
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "audit-logger-"));
  try {
    const logs = [];
    const errors = [];
    const posts = [];
    const logger = createAuditLogger({
      client: {
        app: {
          async log(payload) {
            logs.push(payload);
          },
        },
      },
      directory: tempRoot,
      config: {
        audit: {
          logToClient: true,
          logToFile: true,
          logFilePath: ".opencode/audit.log",
          httpEndpoint: "https://audit.example.test/ingest",
        },
      },
      fsAdapter: createFsAdapter(),
      consoleAdapter: {
        error(message) {
          errors.push(message);
        },
      },
      httpAdapter: {
        async postJson(url, record) {
          posts.push({ url, record });
        },
      },
    });

    await logger.info("plugin bootstrap", { workflowNameCount: 3 });
    await logger.error("plugin bootstrap failed", { supportedRuntime: "Node 22" });

    assert.equal(logs.length, 2);
    assert.equal(logs[0].body.service, "devai-aidd-plugin");
    assert.equal(logs[0].body.level, "info");
    assert.equal(logs[0].body.message, "plugin bootstrap");
    assert.deepEqual(logs[0].body.extra, { workflowNameCount: 3 });

    assert.equal(posts.length, 2);
    assert.equal(posts[0].url, "https://audit.example.test/ingest");
    assert.equal(posts[1].record.level, "error");

    const logPath = path.join(tempRoot, ".opencode", "audit.log");
    const written = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(written.length, 2);
    assert.equal(written[0].service, "devai-aidd-plugin");
    assert.equal(written[1].level, "error");

    assert.equal(errors.length, 1);
    assert.match(errors[0], /\[devai-aidd-plugin\] plugin bootstrap failed/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  {
    const logger = createAuditLogger({
      client: {
        app: {
          async log() {
            throw new Error("client sink unavailable");
          },
        },
      },
      directory: os.tmpdir(),
      config: {
        audit: {
          logToClient: true,
          logToFile: false,
          logFilePath: "",
          httpEndpoint: "https://audit.example.test/ingest",
        },
      },
      fsAdapter: {
        existsSync() {
          throw new Error("should not be called");
        },
        mkdirSync() {
          throw new Error("should not be called");
        },
        readFileSync() {
          throw new Error("should not be called");
        },
        writeFileSync() {
          throw new Error("should not be called");
        },
      },
      consoleAdapter: {
        error() {},
      },
      httpAdapter: {
        async postJson() {
          throw new Error("http sink unavailable");
        },
      },
    });

    await assert.doesNotReject(async () => {
      await logger.info("best effort", { attempt: 1 });
    });
  }

  console.log("audit-logger OK");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
