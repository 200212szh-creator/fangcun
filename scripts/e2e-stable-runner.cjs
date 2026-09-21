/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const port = Number.parseInt(process.env.E2E_STABLE_PORT || "3017", 10);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error(`INVALID_E2E_STABLE_PORT ${process.env.E2E_STABLE_PORT}`);
}
const baseURL = `http://127.0.0.1:${port}`;
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
const artifactRoot = path.join(repoRoot, "artifacts", "e2e-stable", runId);
const playwrightCli = require.resolve("@playwright/test/cli");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const migrationCommand = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : npmCommand;
const migrationArgs = process.platform === "win32" ? ["/d", "/s", "/c", `${npmCommand} run db:migrate:isolated`] : ["run", "db:migrate:isolated"];

fs.mkdirSync(artifactRoot, { recursive: true });

let activeServer = null;
let activePlaywright = null;
let serverExit = null;
let shuttingDown = false;
const summary = {
  runnerPid: process.pid,
  port,
  startedAt: new Date().toISOString(),
  artifactRoot,
  gates: [],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: response.statusCode || 0, json, body });
      });
    });
    request.setTimeout(1500, () => request.destroy(new Error("request timeout")));
    request.on("error", reject);
  });
}

async function waitForPortFree(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await requestJson(`${baseURL}/api/e2e/state`);
    } catch (error) {
      if (error?.code === "ECONNREFUSED") return;
      throw new Error(`PORT_PROBE_FAILED ${port}: ${error.message}`);
    }
    await sleep(100);
  }
  throw new Error(`PORT_NOT_RELEASED ${port}`);
}

function capture(stream, file, label) {
  const output = fs.createWriteStream(file, { flags: "a" });
  stream.on("data", (chunk) => {
    output.write(chunk);
    process.stdout.write(`[${label}] ${chunk.toString()}`);
  });
  stream.on("end", () => output.end());
}

function spawnLogged(command, args, options, stdoutFile, stderrFile, label) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  capture(child.stdout, stdoutFile, `${label}:stdout`);
  capture(child.stderr, stderrFile, `${label}:stderr`);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code: code ?? 1, signal, pid: child.pid }));
  });
}

async function waitForReady(server, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || serverExit) {
      throw new Error(`SERVER_EXIT during startup: ${JSON.stringify(serverExit)}`);
    }
    try {
      const response = await requestJson(`${baseURL}/api/e2e/state`);
      if (response.status === 200 && response.json?.databaseTarget === "ISOLATED" && response.json.integrity === "ok" && response.json.quickCheck === "ok" && response.json.foreignKeyViolations === 0) {
        return response.json;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error(`SERVER_READY_TIMEOUT ${timeoutMs}ms`);
}

async function startServer(gateName) {
  await waitForPortFree();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-playwright-stable-"));
  const database = path.join(root, "library.db");
  const gateRoot = path.join(artifactRoot, gateName);
  fs.mkdirSync(gateRoot, { recursive: true });
  const lifecycleFile = path.join(gateRoot, "lifecycle.json");
  const migrationStdout = path.join(gateRoot, "migration.stdout.log");
  const migrationStderr = path.join(gateRoot, "migration.stderr.log");
  const serverStdout = path.join(gateRoot, "server.stdout.log");
  const serverStderr = path.join(gateRoot, "server.stderr.log");
  const env = {
    ...process.env,
    DATABASE_URL: database,
    FANGCUN_DATA_DIR: root,
    FANGCUN_MIGRATION_DATABASE: database,
    FANGCUN_MIGRATION_TARGET: "ISOLATED",
    FANGCUN_E2E: "1",
    NODE_ENV: "test",
  };
  fs.writeFileSync(lifecycleFile, JSON.stringify({ runnerPid: process.pid, port, root, database, state: "migrating", startedAt: new Date().toISOString() }, null, 2));
  let migration;
  try {
    migration = await spawnLogged(migrationCommand, migrationArgs, { cwd: repoRoot, env, windowsHide: true }, migrationStdout, migrationStderr, `${gateName}:migration`);
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  if (migration.code !== 0) {
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error(`MIGRATION_FAILED exit=${migration.code}`);
  }
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  activeServer = server;
  serverExit = null;
  capture(server.stdout, serverStdout, `${gateName}:server:stdout`);
  capture(server.stderr, serverStderr, `${gateName}:server:stderr`);
  const lifecycle = {
    runnerPid: process.pid,
    serverPid: server.pid,
    port,
    root,
    database,
    migrationPid: migration.pid,
    startedAt: new Date().toISOString(),
    state: "starting",
    stdout: serverStdout,
    stderr: serverStderr,
  };
  fs.writeFileSync(lifecycleFile, JSON.stringify(lifecycle, null, 2));
  server.on("error", (error) => { serverExit = { type: "SERVER_ERROR", message: error.message, pid: server.pid }; });
  server.on("close", (code, signal) => {
    serverExit = { type: "SERVER_EXIT", code, signal, pid: server.pid };
    lifecycle.state = shuttingDown ? "stopped" : "exited";
    lifecycle.exitCode = code ?? 1;
    lifecycle.signal = signal;
    fs.writeFileSync(lifecycleFile, JSON.stringify(lifecycle, null, 2));
    if (activePlaywright && !shuttingDown) activePlaywright.kill("SIGTERM");
  });
  const state = await waitForReady(server);
  lifecycle.state = "ready";
  lifecycle.readyAt = new Date().toISOString();
  fs.writeFileSync(lifecycleFile, JSON.stringify({ ...lifecycle, state }, null, 2));
  return { server, root, gateRoot, lifecycleFile, stdoutFile: serverStdout, stderrFile: serverStderr, state };
}

function runPlaywright(args, gateRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, "test", "--config=playwright.stable.config.ts", ...args], {
      cwd: repoRoot,
      env: { ...process.env, FANGCUN_E2E: "1", NODE_ENV: "test", PLAYWRIGHT_TEST_BASE_URL: baseURL, PLAYWRIGHT_OUTPUT_DIR: path.join(gateRoot, "test-results") },
      stdio: "inherit",
      windowsHide: true,
    });
    activePlaywright = child;
    child.once("error", reject);
    child.once("close", (code, signal) => {
      activePlaywright = null;
      if (serverExit && !shuttingDown) {
        reject(new Error(`${serverExit.type}: ${JSON.stringify(serverExit)}`));
        return;
      }
      resolve({ code: code ?? 1, signal });
    });
  });
}

async function stopServer(serverInfo) {
  shuttingDown = true;
  if (serverInfo.server.exitCode === null) {
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`SERVER_GRACEFUL_STOP_TIMEOUT pid=${serverInfo.server.pid}`)), 15000);
      serverInfo.server.once("close", (...args) => { clearTimeout(timer); resolve(args); });
    });
    serverInfo.server.kill("SIGTERM");
    await closed;
  }
  await waitForPortFree();
  fs.rmSync(serverInfo.root, { recursive: true, force: true });
  activeServer = null;
  shuttingDown = false;
}

async function runGate(gate) {
  console.log(`\n=== ${gate.name} ===`);
  const record = { name: gate.name, startedAt: new Date().toISOString(), args: gate.args, runnerPid: process.pid };
  let serverInfo;
  try {
    serverInfo = await startServer(gate.name);
    record.serverPid = serverInfo.server.pid;
    record.lifecycleFile = serverInfo.lifecycleFile;
    record.stdoutFile = serverInfo.stdoutFile;
    record.stderrFile = serverInfo.stderrFile;
    record.serverState = serverInfo.state;
    const result = await runPlaywright(gate.args, serverInfo.gateRoot);
    record.exitCode = result.code;
    if (result.code !== 0) throw new Error(`TEST_ASSERTION_OR_PLAYWRIGHT_FAILURE exit=${result.code}`);
    record.status = "PASS";
  } catch (error) {
    record.status = "FAIL";
    record.error = error.stack || String(error);
    throw error;
  } finally {
    if (serverInfo) {
      try { await stopServer(serverInfo); } catch (error) {
        record.shutdownError = error.stack || String(error);
        if (!record.error) record.error = record.shutdownError;
        record.status = "FAIL";
      }
    }
    record.finishedAt = new Date().toISOString();
    summary.gates.push(record);
    fs.writeFileSync(path.join(artifactRoot, "summary.json"), JSON.stringify(summary, null, 2));
  }
}

async function main() {
  const common = ["--retries=0", "--reporter=line"];
  const gates = [
    { name: "fast-input-10", args: ["tests/e2e/motion.spec.ts", "--project=mobile", "--grep", "fast input cancels stale add results and search loading is delayed", "--repeat-each=10", ...common] },
    { name: "reduced-motion-5", args: ["tests/e2e/motion.spec.ts", "--project=mobile", "--grep", "reduced motion disables movement and keeps drawer immediate", "--repeat-each=5", ...common] },
    { name: "motion-spec", args: ["tests/e2e/motion.spec.ts", ...common] },
    { name: "full-e2e-run-1", args: common },
    { name: "full-e2e-run-2", args: common },
    { name: "full-e2e-run-3", args: common },
  ];
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  const selected = only ? gates.filter((gate) => gate.name === only) : gates;
  if (selected.length === 0) throw new Error(`UNKNOWN_GATE ${only}`);
  try {
    for (const gate of selected) await runGate(gate);
    summary.status = "PASS";
  } catch (error) {
    summary.status = "FAIL";
    summary.error = error.stack || String(error);
    console.error(`STABLE_E2E_RUNNER_FAILED: ${summary.error}`);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(artifactRoot, "summary.json"), JSON.stringify(summary, null, 2));
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shuttingDown = true;
    if (activePlaywright) activePlaywright.kill(signal);
    if (activeServer && activeServer.exitCode === null) activeServer.kill(signal);
  });
}

main().catch((error) => {
  summary.status = "FAIL";
  summary.error = error.stack || String(error);
  fs.writeFileSync(path.join(artifactRoot, "summary.json"), JSON.stringify(summary, null, 2));
  console.error(`STABLE_E2E_RUNNER_FAILED: ${summary.error}`);
  process.exitCode = 1;
});
