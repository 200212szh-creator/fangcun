/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const test = require("node:test");
const Database = require("better-sqlite3");
const { verifyRelease, updatePointer } = require("../runtime/launcher/release-manager");
const { waitForChildClose, requestHealth } = require("../runtime/launcher/fangcun-supervisor");

const root = process.cwd();
const supervisorFile = path.join(root, "runtime", "launcher", "fangcun-supervisor.js");
const controlFile = path.join(root, "runtime", "launcher", "fangcun-supervisor-control.js");
const silentAdapter = path.join(root, "runtime", "launcher", "silent-launch.vbs");
const sourceCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeoutMs = 5000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(intervalMs);
  }
  return false;
}

function fakeServerSource() {
  return [
    "const fs = require('node:fs');",
    "const http = require('node:http');",
    "const port = Number(process.env.PORT);",
    "const marker = process.env.FANGCUN_FAKE_CRASH_MARKER;",
    "const start = Date.now();",
    "let healthy = true;",
    "if (process.env.FANGCUN_FAKE_ALWAYS_UNHEALTHY === '1') healthy = false;",
    "const unhealthyAfter = Number(process.env.FANGCUN_FAKE_UNHEALTHY_AFTER_MS || 0);",
    "const exitAfter = Number(process.env.FANGCUN_FAKE_EXIT_AFTER_MS || 0);",
    "if (marker && fs.existsSync(marker)) { fs.rmSync(marker, { force: true }); setTimeout(() => process.exit(17), Number(process.env.FANGCUN_FAKE_EXIT_DELAY_MS || 250)); }",
    "const server = http.createServer((request, response) => {",
    "  if (request.url !== '/api/health') { response.writeHead(404); response.end(); return; }",
    "  const nowHealthy = healthy && !(unhealthyAfter > 0 && Date.now() - start >= unhealthyAfter);",
    "  const body = { app: 'fangcun-archive', status: nowHealthy ? 'ok' : 'degraded', database: 'ok', release: process.env.FANGCUN_RELEASE_NAME, releaseDir: process.env.FANGCUN_RELEASE_DIR, buildId: process.env.FANGCUN_BUILD_ID, sourceCommit: process.env.FANGCUN_SOURCE_COMMIT || '" + sourceCommit + "', provenanceStatus: 'ok' };",
    "  response.writeHead(nowHealthy ? 200 : 503, { 'content-type': 'application/json' }); response.end(JSON.stringify(body));",
    "});",
    "server.listen(port, '127.0.0.1');",
    "if (exitAfter > 0) setTimeout(() => process.exit(19), exitAfter);",
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join("\n");
}

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-task009-runtime-"));
  const projectRoot = directory;
  const dataRoot = path.join(directory, "data-root");
  const stateDir = path.join(dataRoot, "state");
  const logDir = path.join(dataRoot, "logs", "supervisor");
  const database = path.join(dataRoot, "data", "library.db");
  const releaseRoot = path.join(projectRoot, "runtime", "releases");
  const releaseDir = path.join(releaseRoot, "release-a");
  const pointer = path.join(projectRoot, "runtime", "current-release.txt");
  fs.mkdirSync(path.dirname(database), { recursive: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  const sqlite = new Database(database);
  sqlite.exec("CREATE TABLE runtime_probe (id INTEGER PRIMARY KEY, value TEXT)");
  sqlite.close();
  fs.writeFileSync(path.join(releaseDir, "server.js"), fakeServerSource());
  fs.writeFileSync(path.join(releaseDir, "build-id.txt"), "build-a\n");
  fs.writeFileSync(path.join(releaseDir, "release.json"), JSON.stringify({
    provenanceVersion: 1,
    release: "release-a",
    version: "release-a",
    buildId: "build-a",
    sourceCommit,
    dirty: false,
    buildTimestamp: new Date().toISOString(),
  }));
  fs.writeFileSync(pointer, releaseDir + "\n");
  return { directory, projectRoot, dataRoot, stateDir, logDir, database, releaseRoot, releaseDir, pointer, port: 3317 };
}

function addRelease(fixture, name, buildId) {
  const releaseDir = path.join(fixture.releaseRoot, name);
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.copyFileSync(path.join(fixture.releaseDir, "server.js"), path.join(releaseDir, "server.js"));
  fs.writeFileSync(path.join(releaseDir, "build-id.txt"), buildId + "\n");
  fs.writeFileSync(path.join(releaseDir, "release.json"), JSON.stringify({
    provenanceVersion: 1,
    release: name,
    version: name,
    buildId,
    sourceCommit,
    dirty: false,
    buildTimestamp: new Date().toISOString(),
  }));
  return releaseDir;
}

function argsFor(fixture, extra = []) {
  return [
    "--project-root", fixture.projectRoot,
    "--data-root", fixture.dataRoot,
    "--release-pointer", fixture.pointer,
    "--release-dir", fixture.releaseDir,
    "--state-dir", fixture.stateDir,
    "--log-dir", fixture.logDir,
    "--database", fixture.database,
    "--port", String(fixture.port),
    "--startup-grace-ms", "1600",
    "--poll-interval-ms", "100",
    "--request-timeout-ms", "150",
    "--failure-threshold", "2",
    "--restart-cooldown-ms", "80",
    "--max-restarts", "2",
    "--restart-window-ms", "3000",
    "--shutdown-timeout-ms", "800",
    ...extra,
  ];
}

function spawnSupervisor(fixture, extra = [], env = {}) {
  return spawn(process.execPath, [supervisorFile, ...argsFor(fixture, extra)], {
    cwd: root,
    env: { ...process.env, FANGCUN_DATA_DIR: fixture.dataRoot, DATABASE_URL: fixture.database, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function collect(child) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve({ code: child.exitCode, signal: child.signalCode, stdout: "", stderr: "" });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  return new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr })));
}

function inspectExactProcessWindows(pids) {
  const idList = pids.join(",");
  const command = `$ids=@(${idList}); Get-Process -Id $ids | Select-Object Id,ProcessName,MainWindowHandle,MainWindowTitle | ConvertTo-Json -Compress`;
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" }).trim();
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function logRecords(fixture) {
  const files = fs.existsSync(fixture.logDir) ? fs.readdirSync(fixture.logDir).filter((name) => name.endsWith(".jsonl")) : [];
  return files.flatMap((name) => fs.readFileSync(path.join(fixture.logDir, name), "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)));
}

async function runOnce(fixture, extra = [], env = {}) {
  const child = spawnSupervisor(fixture, ["--once", ...extra], env);
  const result = await collect(child);
  return { result, records: logRecords(fixture) };
}

async function stopRunning(fixture, child) {
  execFileSync(process.execPath, [controlFile, "--action", "shutdown", "--state-dir", fixture.stateDir], { windowsHide: true, stdio: "ignore" });
  return collect(child);
}

function removeFixture(fixture) {
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

test("normal supervisor start and graceful shutdown", async () => {
  const fixture = createFixture();
  try {
    const result = await runOnce(fixture);
    assert.equal(result.result.code, 0);
    assert.ok(result.records.some((item) => item.event === "SUPERVISOR_START"));
    assert.ok(result.records.some((item) => item.event === "RELEASE_VERIFY"));
    assert.ok(result.records.some((item) => item.event === "SERVER_HEALTHY"));
    assert.ok(result.records.some((item) => item.event === "SHUTDOWN_SUCCESS"));
  } finally {
    removeFixture(fixture);
  }
});

test("second supervisor is refused by the ownership lock", async () => {
  const fixture = createFixture();
  try {
    const first = spawnSupervisor(fixture);
    assert.equal(await waitFor(() => requestHealth(fixture.port, 150).then((item) => item.ok)), true);
    const second = spawnSupervisor(fixture, ["--once"]);
    const secondResult = await collect(second);
    assert.equal(secondResult.code, 0);
    assert.ok(logRecords(fixture).some((item) => item.event === "SUPERVISOR_ALREADY_RUNNING"));
    await stopRunning(fixture, first);
  } finally {
    removeFixture(fixture);
  }
});

test("second server attempt is refused when an unowned port is occupied", async () => {
  const fixture = createFixture();
  const foreign = http.createServer((request, response) => { response.writeHead(200); response.end("foreign"); });
  try {
    await new Promise((resolve) => foreign.listen(fixture.port, "127.0.0.1", resolve));
    const result = await runOnce(fixture);
    assert.notEqual(result.result.code, 0);
    assert.ok(result.records.some((item) => item.detail === "PORT_OCCUPIED_UNVERIFIED" || item.reason === "PORT_OCCUPIED_UNVERIFIED"));
  } finally {
    await new Promise((resolve) => foreign.close(resolve));
    removeFixture(fixture);
  }
});

test("invalid provenance refuses to start", async () => {
  const fixture = createFixture();
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(fixture.releaseDir, "release.json"), "utf8"));
    metadata.dirty = true;
    fs.writeFileSync(path.join(fixture.releaseDir, "release.json"), JSON.stringify(metadata));
    const result = await runOnce(fixture);
    assert.notEqual(result.result.code, 0);
    assert.ok(result.records.some((item) => item.event === "RELEASE_REJECT" && item.reason === "PROVENANCE_REJECTED"));
  } finally {
    removeFixture(fixture);
  }
});

test("missing release refuses to start", async () => {
  const fixture = createFixture();
  try {
    fs.rmSync(path.join(fixture.releaseDir, "server.js"), { force: true });
    const result = await runOnce(fixture);
    assert.notEqual(result.result.code, 0);
    assert.ok(result.records.some((item) => item.event === "RELEASE_REJECT"));
  } finally {
    removeFixture(fixture);
  }
});

test("unhealthy server fails closed without starting a parallel server", async () => {
  const fixture = createFixture();
  try {
    const result = await runOnce(fixture, [], { FANGCUN_FAKE_ALWAYS_UNHEALTHY: "1" });
    assert.notEqual(result.result.code, 0);
    assert.equal(result.records.filter((item) => item.event === "SERVER_START").length, 1);
    assert.ok(result.records.some((item) => item.event === "HEALTH_FAILURE"));
  } finally {
    removeFixture(fixture);
  }
});

test("unexpected server crash recovers the exact release", async () => {
  const fixture = createFixture();
  const marker = path.join(fixture.directory, "crash-once.marker");
  fs.writeFileSync(marker, "crash");
  try {
    const child = spawnSupervisor(fixture, [], { FANGCUN_FAKE_CRASH_MARKER: marker });
    assert.equal(await waitFor(() => requestHealth(fixture.port, 150).then((item) => item.ok)), true);
    assert.equal(await waitFor(() => logRecords(fixture).some((item) => item.event === "RECOVERY_SUCCESS"), 5000), true);
    assert.ok(logRecords(fixture).filter((item) => item.event === "SERVER_START").length >= 2);
    assert.ok(logRecords(fixture).every((item) => item.release === "release-a" || item.release === null));
    await stopRunning(fixture, child);
  } finally {
    removeFixture(fixture);
  }
});

test("repeated health failures trigger restart-loop protection", async () => {
  const fixture = createFixture();
  try {
    const child = spawnSupervisor(fixture, [], { FANGCUN_FAKE_UNHEALTHY_AFTER_MS: "250" });
    const result = await collect(child);
    assert.notEqual(result.code, 0);
    assert.ok(logRecords(fixture).some((item) => String(item.reason || item.detail).includes("RESTART_LOOP_PROTECTION")));
  } finally {
    removeFixture(fixture);
  }
});

test("graceful shutdown does not force-kill the child", async () => {
  const fixture = createFixture();
  try {
    const child = spawnSupervisor(fixture);
    assert.equal(await waitFor(() => requestHealth(fixture.port, 150).then((item) => item.ok)), true);
    const result = await stopRunning(fixture, child);
    assert.equal(result.code, 0);
    assert.ok(logRecords(fixture).some((item) => item.event === "SHUTDOWN_SUCCESS"));
    assert.ok(!logRecords(fixture).some((item) => item.event === "FORCE_KILL"));
  } finally {
    removeFixture(fixture);
  }
});

test("failed graceful shutdown reports failure and has no force-kill fallback", async () => {
  const fakeChild = {
    exitCode: null,
    signalCode: null,
    once() { return this; },
  };
  assert.equal(await waitForChildClose(fakeChild, 20), false);
});

test("stale PID/lock state is recoverable when owner is dead", async () => {
  const fixture = createFixture();
  try {
    fs.mkdirSync(path.join(fixture.stateDir, "supervisor.lock"), { recursive: true });
    fs.writeFileSync(path.join(fixture.stateDir, "supervisor.lock", "owner.json"), JSON.stringify({ supervisorPid: 999999, runtimeInstanceId: "stale" }));
    fs.writeFileSync(path.join(fixture.stateDir, "supervisor-state.json"), JSON.stringify({ supervisorPid: 999999, serverPid: 999998 }));
    const result = await runOnce(fixture);
    assert.equal(result.result.code, 0);
    assert.ok(result.records.some((item) => item.event === "SUPERVISOR_START"));
  } finally {
    removeFixture(fixture);
  }
});

test("stale release pointer is rejected", async () => {
  const fixture = createFixture();
  try {
    fs.writeFileSync(fixture.pointer, path.join(fixture.releaseRoot, "does-not-exist") + "\n");
    const result = await runOnce(fixture);
    assert.notEqual(result.result.code, 0);
    assert.ok(result.records.some((item) => item.event === "RELEASE_REJECT"));
  } finally {
    removeFixture(fixture);
  }
});

test("release promotion failure preserves the active pointer", () => {
  const fixture = createFixture();
  try {
    const releaseB = addRelease(fixture, "release-b", "build-b");
    const metadata = JSON.parse(fs.readFileSync(path.join(releaseB, "release.json"), "utf8"));
    metadata.dirty = true;
    fs.writeFileSync(path.join(releaseB, "release.json"), JSON.stringify(metadata));
    assert.throws(() => updatePointer({ projectRoot: fixture.projectRoot, releaseDir: releaseB, pointerFile: fixture.pointer }), /RELEASE_DIRTY/);
    assert.equal(fs.readFileSync(fixture.pointer, "utf8").trim(), fixture.releaseDir);
  } finally {
    removeFixture(fixture);
  }
});

test("release promotion and rollback are reversible in isolation", () => {
  const fixture = createFixture();
  try {
    const releaseB = addRelease(fixture, "release-b", "build-b");
    updatePointer({ projectRoot: fixture.projectRoot, releaseDir: releaseB, pointerFile: fixture.pointer });
    assert.equal(fs.readFileSync(fixture.pointer, "utf8").trim(), releaseB);
    updatePointer({ projectRoot: fixture.projectRoot, releaseDir: fixture.releaseDir, pointerFile: fixture.pointer });
    assert.equal(fs.readFileSync(fixture.pointer, "utf8").trim(), fixture.releaseDir);
    assert.equal(verifyRelease({ projectRoot: fixture.projectRoot, releaseDir: fixture.releaseDir, pointerFile: fixture.pointer }).releaseName, "release-a");
  } finally {
    removeFixture(fixture);
  }
});

test("manual launcher ensures an existing runtime without a second server", async () => {
  const fixture = createFixture();
  try {
    const first = spawnSupervisor(fixture);
    assert.equal(await waitFor(() => requestHealth(fixture.port, 150).then((item) => item.ok)), true);
    const launcher = spawn(process.execPath, [path.join(root, "runtime", "launcher", "fangcun-manual-launcher.js"), "--project-root", fixture.projectRoot, "--data-root", fixture.dataRoot, "--release-pointer", fixture.pointer, "--release-dir", fixture.releaseDir, "--state-dir", fixture.stateDir, "--log-dir", fixture.logDir, "--database", fixture.database, "--port", String(fixture.port), "--no-open"], { cwd: root, windowsHide: true, stdio: "pipe" });
    const result = await collect(launcher);
    assert.equal(result.code, 0);
    assert.equal(logRecords(fixture).filter((item) => item.event === "SERVER_START").length, 1);
    await stopRunning(fixture, first);
  } finally {
    removeFixture(fixture);
  }
});

test("repeated startup requests converge on one supervisor", async () => {
  const fixture = createFixture();
  try {
    const children = [spawnSupervisor(fixture), spawnSupervisor(fixture), spawnSupervisor(fixture)];
    assert.equal(await waitFor(() => requestHealth(fixture.port, 150).then((item) => item.ok)), true);
    const state = JSON.parse(fs.readFileSync(path.join(fixture.stateDir, "supervisor-state.json"), "utf8"));
    const active = children.find((child) => child.pid === state.supervisorPid);
    for (const child of children) {
      if (child !== active && child.exitCode === null) await collect(child);
    }
    assert.equal(logRecords(fixture).filter((item) => item.event === "SERVER_START").length, 1);
    if (active && active.exitCode === null) await stopRunning(fixture, active);
  } finally {
    removeFixture(fixture);
  }
});

test("silent wscript adapter starts the supervisor without PowerShell", async () => {
  const fixture = createFixture();
  try {
    const child = spawn("wscript.exe", [silentAdapter, process.execPath, supervisorFile, ...argsFor(fixture, ["--once"])], {
      cwd: root,
      windowsHide: true,
      stdio: "ignore",
    });
    const adapterResult = collect(child);
    assert.equal(await waitFor(() => requestHealth(fixture.port, 150).then((item) => item.ok), 4000), true);
    await waitFor(() => !fs.existsSync(path.join(fixture.stateDir, "supervisor-state.json")), 4000);
    assert.equal((await adapterResult).code, 0);
    assert.ok(logRecords(fixture).some((item) => item.event === "SERVER_HEALTHY"));
  } finally {
    removeFixture(fixture);
  }
});

test("silent adapter runtime chain has no visible window handles", async () => {
  const fixture = createFixture();
  const child = spawn("wscript.exe", [silentAdapter, process.execPath, supervisorFile, ...argsFor(fixture)], {
    cwd: root,
    windowsHide: true,
    stdio: "ignore",
  });
  try {
    assert.equal(await waitFor(() => requestHealth(fixture.port, 150).then((item) => item.ok), 4000), true);
    const state = JSON.parse(fs.readFileSync(path.join(fixture.stateDir, "supervisor-state.json"), "utf8"));
    assert.ok(state.supervisorPid > 0);
    assert.ok(state.serverPid > 0);
    const processes = inspectExactProcessWindows([state.supervisorPid, state.serverPid]);
    assert.equal(processes.length, 2);
    assert.ok(processes.every((item) => Number(item.MainWindowHandle) === 0 && !item.MainWindowTitle));
  } finally {
    execFileSync(process.execPath, [controlFile, "--action", "shutdown", "--state-dir", fixture.stateDir], { windowsHide: true, stdio: "ignore" });
    await waitFor(() => !fs.existsSync(path.join(fixture.stateDir, "supervisor-state.json")), 4000);
    await collect(child);
    removeFixture(fixture);
  }
});

test("direct Node adapter is testable without PowerShell or cmd", async () => {
  const fixture = createFixture();
  try {
    const result = await runOnce(fixture);
    assert.equal(result.result.code, 0);
    assert.equal(result.records.filter((item) => item.event === "SERVER_START").length, 1);
    assert.ok(result.records.every((item) => item.event !== "POWERSHELL_START" && item.event !== "CMD_START"));
  } finally {
    removeFixture(fixture);
  }
});

test("isolated runtime never uses production port or database", async () => {
  const fixture = createFixture();
  try {
    assert.notEqual(fixture.port, 3000);
    assert.equal(fixture.database.includes("方寸数据"), false);
    const result = await runOnce(fixture);
    assert.equal(result.result.code, 0);
    assert.equal(result.records.find((item) => item.event === "SUPERVISOR_START").port, fixture.port);
  } finally {
    removeFixture(fixture);
  }
});
