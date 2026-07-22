"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { loadConfig } = require("../server/config.cjs");
const { createLogger } = require("../server/logger.cjs");
const { recordOperationalEvent } = require("../server/operations.cjs");
const { startServer } = require("../server.cjs");

const root = path.join(__dirname, "..");

async function availablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) =>
    probe.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function productionEnvironment(directory, port) {
  return {
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    LOG_LEVEL: "silent",
    SIGNATURE_ONLY: "true",
    DEMO_MODE: "false",
    SEED_DEMO_DATA: "false",
    SIGNATURE_ALLOW_DEFAULT_ADMIN: "false",
    DATABASE_PATH: path.join(directory, "data", "northstar.db"),
    BACKUP_DIRECTORY: path.join(directory, "backups"),
    NORTHSTAR_BACKUP_KEY: crypto.randomBytes(32).toString("base64"),
    PUBLIC_URL: "https://portal.example.com",
    ENTRA_REDIRECT_URI: "https://portal.example.com",
  };
}

test("runtime authentication configuration remains external to the Vite bundle", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, /<script src="\/auth-config\.js"><\/script>/);
  assert.doesNotMatch(index, /type="module" src="auth-config\.js"/);
});

test("production configuration rejects unsafe release settings", () => {
  assert.throws(
    () => loadConfig({ PORT: "70000" }, root),
    /PORT must be an integer/,
  );
  assert.throws(
    () => loadConfig({ TRUST_PROXY: "sometimes" }, root),
    /TRUST_PROXY must be true or false/,
  );
  assert.throws(
    () =>
      loadConfig(
        { NODE_ENV: "production", SIGNATURE_ONLY: "true", DEMO_MODE: "true" },
        root,
      ),
    /DEMO_MODE cannot/,
  );
  assert.throws(
    () =>
      loadConfig(
        {
          NODE_ENV: "production",
          SIGNATURE_ONLY: "true",
          SEED_DEMO_DATA: "true",
        },
        root,
      ),
    /SEED_DEMO_DATA cannot/,
  );
  assert.throws(
    () =>
      loadConfig(
        {
          NODE_ENV: "production",
          SIGNATURE_ONLY: "true",
          DATABASE_PATH: "relative.db",
          BACKUP_DIRECTORY: path.join(os.tmpdir(), "northstar-backups"),
          NORTHSTAR_BACKUP_KEY: crypto.randomBytes(32).toString("base64"),
          PUBLIC_URL: "https://portal.example.com",
        },
        root,
      ),
    /DATABASE_PATH must be/,
  );
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-config-"));
  try {
    const missingPublicUrl = productionEnvironment(directory, 4173);
    delete missingPublicUrl.PUBLIC_URL;
    assert.throws(
      () => loadConfig(missingPublicUrl, root),
      /PUBLIC_URL is required/,
    );
    const incompleteEntra = {
      ...productionEnvironment(directory, 4173),
      SIGNATURE_ONLY: "false",
      ENTRA_CLIENT_ID: crypto.randomUUID(),
      ENTRA_TENANT_ID: crypto.randomUUID(),
    };
    assert.throws(
      () => loadConfig(incompleteEntra, root),
      /ENTRA_API_AUDIENCE/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("structured logger emits machine-readable lifecycle records", () => {
  const records = [];
  const output = {
    log: (value) => records.push(value),
    warn: (value) => records.push(value),
    error: (value) => records.push(value),
  };
  const logger = createLogger({ level: "debug", output });
  logger.info("release_check", { requestId: "req-1", status: "ok" });
  const record = JSON.parse(records[0]);
  assert.equal(record.level, "info");
  assert.equal(record.event, "release_check");
  assert.equal(record.requestId, "req-1");
  assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("invalid production startup exits nonzero with a structured fatal event", () => {
  const child = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "start-production.cjs")],
    {
      cwd: root,
      env: { ...process.env, PORT: "invalid", LOG_LEVEL: "info" },
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 1);
  const record = JSON.parse(child.stderr.trim().split(/\r?\n/).at(-1));
  assert.equal(record.level, "fatal");
  assert.equal(record.event, "startup_failed");
  assert.match(record.error, /PORT must be an integer/);
});

test("production readiness remains unavailable until a backup succeeds", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "northstar-readiness-"),
  );
  const port = await availablePort();
  const runtime = startServer({
    env: productionEnvironment(directory, port),
    installSignalHandlers: false,
  });
  try {
    await runtime.ready;
    let response = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, "not_ready");
    recordOperationalEvent(runtime.db, "backup", "succeeded", { test: true });
    response = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ready");
  } finally {
    await runtime.shutdown("test", 0);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("graceful shutdown is idempotent and releases the database lease", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "northstar-shutdown-"),
  );
  const port = await availablePort();
  const databasePath = path.join(directory, "northstar.db");
  const runtime = startServer({
    env: {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      DATABASE_PATH: databasePath,
      LOG_LEVEL: "silent",
    },
    installSignalHandlers: false,
  });
  try {
    await runtime.ready;
    await Promise.all([
      runtime.shutdown("test", 0),
      runtime.shutdown("duplicate", 0),
    ]);
    assert.equal(fs.existsSync(`${databasePath}.running.json`), false);
  } finally {
    if (runtime.server.listening) await runtime.shutdown("cleanup", 0);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
