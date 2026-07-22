"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { startServer } = require("../server.cjs");

async function availablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function main() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "northstar-production-startup-"),
  );
  const port = await availablePort();
  const env = {
    ...process.env,
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
  let runtime;
  try {
    runtime = startServer({ env, installSignalHandlers: false });
    await runtime.ready;
    const live = await fetch(`http://127.0.0.1:${port}/api/health/live`);
    const ready = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    const authConfig = await fetch(`http://127.0.0.1:${port}/auth-config.js`);
    assert.equal(live.status, 200);
    assert.equal((await live.json()).status, "ok");
    assert.equal(
      ready.status,
      503,
      "A new production database must remain unready until a backup succeeds.",
    );
    assert.equal((await ready.json()).status, "not_ready");
    assert.equal(page.status, 200);
    const pageText = await page.text();
    const authConfigText = await authConfig.text();
    const portalIndexText = fs.readFileSync(
      path.join(__dirname, "..", "dist", "index.html"),
      "utf8",
    );
    assert.match(pageText, /Northstar/i);
    assert.match(portalIndexText, /<script src="\/auth-config\.js"><\/script>/);
    assert.doesNotMatch(portalIndexText, /type="module" src="auth-config\.js"/);
    assert.equal(authConfig.status, 200);
    assert.match(authConfigText, /window\.NORTHSTAR_AUTH=/);
    assert.match(authConfigText, /"demoMode":false/);
    assert.doesNotMatch(authConfigText, /YOUR_ENTRA_/);
    console.log(
      JSON.stringify({
        event: "production_startup_check_passed",
        live: 200,
        ready: 503,
        staticPage: 200,
        runtimeAuthConfig: 200,
      }),
    );
  } finally {
    if (runtime) await runtime.shutdown("production_startup_check", 0);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "production_startup_check_failed",
      error: error.message,
    }),
  );
  process.exitCode = 1;
});
