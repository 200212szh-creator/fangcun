"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const releaseManager = require("./release-manager");

const DEFAULTS = Object.freeze({
  port: 3000,
  startupGraceMs: 60_000,
  pollIntervalMs: 30_000,
  requestTimeoutMs: 3_000,
  failureThreshold: 3,
  restartCooldownMs: 2_000,
  maxRestarts: 6,
  restartWindowMs: 60 * 60 * 1000,
  shutdownTimeoutMs: 15_000,
  logMaxBytes: 5 * 1024 * 1024,
  logMaxAgeMs: 14 * 24 * 60 * 60 * 1000,
  logMaxTotalBytes: 100 * 1024 * 1024,
});

function parseInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === "") return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new Error("INVALID_RUNTIME_NUMBER");
  return result;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const equal = item.indexOf("=");
    if (equal > 2) {
      result[item.slice(2, equal)] = item.slice(equal + 1);
    } else {
      const key = item.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        index += 1;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

function absolute(value) {
  return path.resolve(String(value));
}

function isWithin(root, candidate) {
  const relative = path.relative(absolute(root), absolute(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function sanitize(value) {
  return String(value)
    .replace(/(api[_-]?key|token|secret|authorization|password)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/(borrower[_-]?contact|annotation|body|notes?)[:=]\s*[^,}\n]+/gi, "$1=[redacted]");
}

function writeJsonAtomically(file, value) {
  const target = absolute(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = target + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    if (!["EEXIST", "EPERM", "ENOTEMPTY"].includes(error?.code)) {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      throw error;
    }
    const previous = target + ".previous-" + process.pid + "-" + Date.now();
    fs.renameSync(target, previous);
    try {
      fs.renameSync(temporary, target);
    } finally {
      try { fs.rmSync(previous, { force: true }); } catch {}
    }
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function probePort(port, timeoutMs = 300) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (occupied) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(occupied);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function waitForChildClose(child, timeoutMs) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (closed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(closed);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("close", () => finish(true));
  });
}

function requestHealth(port, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/health",
      method: "GET",
      timeout: timeoutMs,
      headers: { Accept: "application/json" },
    }, (response) => {
      let bodyText = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { bodyText += chunk; });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        let body = null;
        try { body = JSON.parse(bodyText); } catch {}
        resolve({ ok: response.statusCode === 200, statusCode: response.statusCode || 0, body, reason: response.statusCode === 200 ? "health_payload_invalid" : "health_http_" + response.statusCode, durationMs: Date.now() - startedAt });
      });
    });
    const fail = (reason) => {
      if (settled) return;
      settled = true;
      request.destroy();
      resolve({ ok: false, statusCode: 0, body: null, reason, durationMs: Date.now() - startedAt });
    };
    request.on("timeout", () => fail("health_timeout"));
    request.on("error", () => fail("health_unreachable"));
    request.end();
  });
}

class JsonlLogger {
  constructor(directory, context, options = {}) {
    this.directory = absolute(directory);
    this.context = context;
    this.maxBytes = options.maxBytes || DEFAULTS.logMaxBytes;
    this.maxAgeMs = options.maxAgeMs || DEFAULTS.logMaxAgeMs;
    this.maxTotalBytes = options.maxTotalBytes || DEFAULTS.logMaxTotalBytes;
    fs.mkdirSync(this.directory, { recursive: true });
  }

  currentFile() {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
    return path.join(this.directory, "supervisor-" + day + ".jsonl");
  }

  rotateIfNeeded(file, bytesToAdd) {
    let size = 0;
    try { size = fs.statSync(file).size; } catch {}
    if (size + bytesToAdd <= this.maxBytes) return;
    const rotated = file + "." + new Date().toISOString().replace(/[:.]/g, "-");
    try { fs.renameSync(file, rotated); } catch {}
  }

  cleanup() {
    const cutoff = Date.now() - this.maxAgeMs;
    const files = fs.readdirSync(this.directory)
      .map((name) => {
        const file = path.join(this.directory, name);
        try {
          const stat = fs.statSync(file);
          return { file, size: stat.size, mtime: stat.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.mtime >= cutoff)
      .sort((left, right) => right.mtime - left.mtime);
    let total = 0;
    for (const entry of files) {
      total += entry.size;
      if (total > this.maxTotalBytes) {
        try { fs.rmSync(entry.file, { force: true }); } catch {}
      }
    }
    for (const name of fs.readdirSync(this.directory)) {
      const file = path.join(this.directory, name);
      try {
        if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
      } catch {}
    }
  }

  emit(event, fields = {}) {
    const record = {
      timestamp: new Date().toISOString(),
      ...this.context(),
      event,
      ...fields,
    };
    const line = JSON.stringify(record) + "\n";
    const file = this.currentFile();
    this.rotateIfNeeded(file, Buffer.byteLength(line));
    fs.appendFileSync(file, line, "utf8");
    this.cleanup();
  }
}

class Supervisor {
  constructor(args = {}) {
    const projectRoot = absolute(args["project-root"] || process.env.FANGCUN_PROJECT_ROOT || process.cwd());
    const dataRoot = absolute(args["data-root"] || process.env.FANGCUN_DATA_DIR || path.join(projectRoot, "data"));
    const stateDir = absolute(args["state-dir"] || path.join(dataRoot, "state"));
    const logDir = absolute(args["log-dir"] || path.join(dataRoot, "logs", "supervisor"));
    const runtimeRoot = absolute(path.join(projectRoot, "runtime"));
    const releasePointer = absolute(args["release-pointer"] || path.join(runtimeRoot, "current-release.txt"));
    const releaseDir = args["release-dir"] ? absolute(args["release-dir"]) : null;
    const database = absolute(args.database || process.env.DATABASE_URL || path.join(dataRoot, "data", "library.db"));
    if (!isWithin(dataRoot, stateDir) || !isWithin(dataRoot, logDir) || !isWithin(dataRoot, database)) throw new Error("RUNTIME_PATH_OUTSIDE_DATA_ROOT");
    if (!isWithin(runtimeRoot, releasePointer)) throw new Error("RUNTIME_POINTER_OUTSIDE_RUNTIME_ROOT");

    this.config = {
      projectRoot,
      dataRoot,
      stateDir,
      logDir,
      runtimeRoot,
      releasePointer,
      releaseDir,
      database,
      port: parseInteger(args.port, DEFAULTS.port, 1, 65535),
      startupGraceMs: parseInteger(args["startup-grace-ms"], DEFAULTS.startupGraceMs, 100, 10 * 60 * 1000),
      pollIntervalMs: parseInteger(args["poll-interval-ms"], DEFAULTS.pollIntervalMs, 50, 10 * 60 * 1000),
      requestTimeoutMs: parseInteger(args["request-timeout-ms"], DEFAULTS.requestTimeoutMs, 50, 60 * 1000),
      failureThreshold: parseInteger(args["failure-threshold"], DEFAULTS.failureThreshold, 1, 100),
      restartCooldownMs: parseInteger(args["restart-cooldown-ms"], DEFAULTS.restartCooldownMs, 0, 10 * 60 * 1000),
      maxRestarts: parseInteger(args["max-restarts"], DEFAULTS.maxRestarts, 0, 100),
      restartWindowMs: parseInteger(args["restart-window-ms"], DEFAULTS.restartWindowMs, 1000, 24 * 60 * 60 * 1000),
      shutdownTimeoutMs: parseInteger(args["shutdown-timeout-ms"], DEFAULTS.shutdownTimeoutMs, 100, 10 * 60 * 1000),
      expectedBuildId: args["expected-build-id"] || process.env.FANGCUN_BUILD_ID || "",
      expectedSourceCommit: args["expected-source-commit"] || process.env.FANGCUN_SOURCE_COMMIT || "",
      once: Boolean(args.once),
    };
    this.runtimeInstanceId = crypto.randomUUID();
    this.lockDir = path.join(stateDir, "supervisor.lock");
    this.ownerFile = path.join(this.lockDir, "owner.json");
    this.stateFile = path.join(stateDir, "supervisor-state.json");
    this.controlFile = path.join(stateDir, "supervisor-control.json");
    this.release = null;
    this.child = null;
    this.childExit = null;
    this.stopping = false;
    this.shutdownFailed = false;
    this.shutdownPromise = null;
    this.restartTimes = [];
    this.failureCount = 0;
    this.lastHealthState = "unknown";
    this.logger = new JsonlLogger(logDir, () => ({
      runtimeInstanceId: this.runtimeInstanceId,
      supervisorPid: process.pid,
      serverPid: this.child?.pid || null,
      release: this.release?.releaseName || null,
      buildId: this.release?.buildId || null,
      sourceCommit: this.release?.sourceCommit || null,
    }));
    this.signalHandlers = new Map();
  }

  emit(event, fields = {}) {
    try { this.logger.emit(event, fields); } catch {}
  }

  updateState(status, fields = {}) {
    try {
      writeJsonAtomically(this.stateFile, {
        runtimeInstanceId: this.runtimeInstanceId,
        supervisorPid: process.pid,
        serverPid: this.child?.pid || null,
        releaseDir: this.release?.releaseDir || null,
        release: this.release?.releaseName || null,
        buildId: this.release?.buildId || null,
        sourceCommit: this.release?.sourceCommit || null,
        dirty: this.release?.dirty ?? null,
        port: this.config.port,
        status,
        updatedAt: new Date().toISOString(),
        ...fields,
      });
    } catch (error) {
      this.emit("STATE_WRITE_FAILED", { reason: error instanceof Error ? error.message : String(error) });
    }
  }

  checkControlRequest() {
    if (!fs.existsSync(this.controlFile)) return;
    try {
      const request = JSON.parse(fs.readFileSync(this.controlFile, "utf8"));
      if (request.action === "shutdown" && (!request.runtimeInstanceId || request.runtimeInstanceId === this.runtimeInstanceId)) {
        fs.rmSync(this.controlFile, { force: true });
        void this.shutdown("control_request");
      }
    } catch (error) {
      this.emit("CONTROL_REQUEST_INVALID", { reason: error instanceof Error ? error.message : String(error) });
      try { fs.rmSync(this.controlFile, { force: true }); } catch {}
    }
  }

  async acquireLock() {
    fs.mkdirSync(this.config.stateDir, { recursive: true });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        fs.mkdirSync(this.lockDir);
        writeJsonAtomically(this.ownerFile, {
          runtimeInstanceId: this.runtimeInstanceId,
          supervisorPid: process.pid,
          acquiredAt: new Date().toISOString(),
        });
        return true;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        let owner = null;
        try { owner = JSON.parse(fs.readFileSync(this.ownerFile, "utf8")); } catch {}
        if (owner && isProcessAlive(Number(owner.supervisorPid))) {
          this.emit("SUPERVISOR_ALREADY_RUNNING", { ownerSupervisorPid: Number(owner.supervisorPid), ownerRuntimeInstanceId: owner.runtimeInstanceId || null });
          return false;
        }
        if (!owner) {
          await delay(25);
          continue;
        }
        fs.rmSync(this.lockDir, { recursive: true, force: true });
      }
    }
    throw new Error("SUPERVISOR_LOCK_BUSY_UNRESOLVED");
  }

  releaseLock() {
    try {
      const owner = JSON.parse(fs.readFileSync(this.ownerFile, "utf8"));
      if (owner.runtimeInstanceId !== this.runtimeInstanceId) return;
    } catch {
      return;
    }
    try { fs.rmSync(this.stateFile, { force: true }); } catch {}
    try { fs.rmSync(this.lockDir, { recursive: true, force: true }); } catch {}
  }

  verifyIntendedRelease() {
    let releaseDir = this.config.releaseDir;
    try {
      if (!releaseDir) releaseDir = releaseManager.readPointer(this.config.releasePointer, this.config.projectRoot);
      this.release = releaseManager.verifyRelease({
        projectRoot: this.config.projectRoot,
        releaseDir,
        pointerFile: this.config.releasePointer,
        expectedBuildId: this.config.expectedBuildId || undefined,
        expectedSourceCommit: this.config.expectedSourceCommit || undefined,
      });
      this.emit("RELEASE_VERIFY", { releasePath: this.release.releaseDir, dirty: this.release.dirty });
      return this.release;
    } catch (error) {
      this.emit("RELEASE_REJECT", { reason: "PROVENANCE_REJECTED", detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async ensurePortFree() {
    if (await probePort(this.config.port)) throw new Error("PORT_OCCUPIED_UNVERIFIED");
  }

  healthMatches(body) {
    return Boolean(
      body
      && body.app === "fangcun-archive"
      && body.status === "ok"
      && body.database === "ok"
      && body.provenanceStatus === "ok"
      && body.release === this.release.releaseName
      && body.buildId === this.release.buildId
      && body.sourceCommit === this.release.sourceCommit
      && (!body.releaseDir || absolute(body.releaseDir) === this.release.releaseDir),
    );
  }

  async getHealth() {
    const result = await requestHealth(this.config.port, this.config.requestTimeoutMs);
    if (!result.ok) return result;
    if (!this.healthMatches(result.body)) return { ...result, ok: false, reason: "health_provenance_mismatch" };
    return { ...result, ok: true, reason: "healthy" };
  }

  startServer() {
    if (this.child && !this.childExit) throw new Error("SECOND_SERVER_REJECTED");
    const environment = {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(this.config.port),
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:" + this.config.port,
      FANGCUN_PROJECT_ROOT: this.config.projectRoot,
      FANGCUN_DATA_DIR: this.config.dataRoot,
      DATABASE_URL: this.config.database,
      FANGCUN_RELEASE_DIR: this.release.releaseDir,
      FANGCUN_RELEASE_NAME: this.release.releaseName,
      FANGCUN_BUILD_ID: this.release.buildId,
    };
    const child = spawn(process.execPath, [this.release.serverFile], {
      cwd: this.release.releaseDir,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    this.childExit = null;
    this.updateState("starting", { serverPid: child.pid });
    this.emit("SERVER_START", { attempt: this.restartTimes.length + 1 });
    child.stdout?.on("data", (chunk) => this.emit("SERVER_OUTPUT", { stream: "stdout", message: sanitize(chunk.toString()).slice(0, 4000) }));
    child.stderr?.on("data", (chunk) => this.emit("SERVER_OUTPUT", { stream: "stderr", message: sanitize(chunk.toString()).slice(0, 4000) }));
    child.once("error", (error) => this.emit("SERVER_PROCESS_ERROR", { reason: sanitize(error.message) }));
    child.once("close", (code, signal) => {
      this.childExit = { code, signal, at: new Date().toISOString() };
      this.updateState(this.stopping ? "stopping" : "server_exited", { exitCode: code, exitSignal: signal || null });
      this.emit("SERVER_EXIT", { exitCode: code, signal: signal || null });
    });
    return child;
  }

  async waitForHealthy(reason = "startup") {
    const deadline = Date.now() + this.config.startupGraceMs;
    let attempt = 0;
    while (!this.stopping && Date.now() < deadline) {
      this.checkControlRequest();
      if (this.childExit) return false;
      attempt += 1;
      const health = await this.getHealth();
      if (health.ok) {
        this.failureCount = 0;
        if (this.lastHealthState !== "healthy") this.emit("SERVER_HEALTHY", { healthState: "healthy", durationMs: health.durationMs, reason });
        this.lastHealthState = "healthy";
        this.updateState("healthy", { healthState: "healthy" });
        return true;
      }
      this.lastHealthState = "starting";
      this.emit("HEALTH_FAILURE", { healthState: "starting", reason: health.reason, attempt, durationMs: health.durationMs });
      await delay(this.config.pollIntervalMs);
    }
    return false;
  }

  async waitForPortFree() {
    const deadline = Date.now() + this.config.shutdownTimeoutMs;
    while (Date.now() < deadline) {
      if (!(await probePort(this.config.port))) return true;
      await delay(Math.min(100, this.config.pollIntervalMs));
    }
    return false;
  }

  async stopChildGracefully(reason) {
    const child = this.child;
    if (!child) return true;
    if (!this.childExit) {
      try {
        child.kill("SIGTERM");
      } catch (error) {
        this.emit("SHUTDOWN_FAILED", { reason: error instanceof Error ? error.message : String(error), detail: "signal_failed" });
        return false;
      }
      if (!(await waitForChildClose(child, this.config.shutdownTimeoutMs))) {
        this.emit("SHUTDOWN_FAILED", { reason: "graceful_timeout", detail: "force_kill_not_attempted", childPid: child.pid });
        this.updateState("shutdown_failed", { reason: "graceful_timeout" });
        return false;
      }
    }
    if (!(await this.waitForPortFree())) {
      this.emit("SHUTDOWN_FAILED", { reason: "port_not_released", detail: "force_kill_not_attempted", childPid: child.pid });
      this.updateState("shutdown_failed", { reason: "port_not_released" });
      return false;
    }
    this.child = null;
    this.childExit = null;
    this.emit("SHUTDOWN_SUCCESS", { reason: reason || "child_stop", childPid: child.pid });
    return true;
  }

  canRestart() {
    const cutoff = Date.now() - this.config.restartWindowMs;
    this.restartTimes = this.restartTimes.filter((timestamp) => timestamp >= cutoff);
    return this.restartTimes.length < this.config.maxRestarts;
  }

  async recover(reason) {
    if (!this.canRestart()) throw new Error("RESTART_LOOP_PROTECTION");
    this.restartTimes.push(Date.now());
    const attempt = this.restartTimes.length;
    this.emit("RECOVERY_ATTEMPT", { reason, attempt });
    if (this.config.restartCooldownMs > 0) await delay(this.config.restartCooldownMs);
    if (!(await this.stopChildGracefully("recovery"))) throw new Error("GRACEFUL_STOP_FAILED");
    this.verifyIntendedRelease();
    await this.ensurePortFree();
    this.startServer();
    if (!(await this.waitForHealthy("recovery"))) {
      await this.stopChildGracefully("recovery_health_failed");
      throw new Error("RECOVERY_HEALTH_TIMEOUT");
    }
    this.emit("RECOVERY_SUCCESS", { reason, attempt });
  }

  async monitor() {
    while (!this.stopping) {
      this.checkControlRequest();
      if (this.stopping) break;
      if (this.childExit || !this.child) {
        try {
          await this.recover(this.childExit ? "server_exit" : "server_missing");
          continue;
        } catch (error) {
          this.emit("HEALTH_FAILURE", { healthState: "recovery_failed", reason: error instanceof Error ? error.message : String(error) });
          if (!this.canRestart()) throw error;
          await delay(this.config.restartCooldownMs);
          continue;
        }
      }

      await delay(this.config.pollIntervalMs);
      this.checkControlRequest();
      if (this.stopping) break;
      const health = await this.getHealth();
      if (health.ok) {
        this.failureCount = 0;
        this.lastHealthState = "healthy";
        this.updateState("healthy", { healthState: "healthy" });
        continue;
      }

      this.failureCount += 1;
      this.lastHealthState = "degraded";
      this.emit("HEALTH_FAILURE", { healthState: "degraded", reason: health.reason, attempt: this.failureCount, durationMs: health.durationMs });
      this.updateState("degraded", { healthState: "degraded", failureCount: this.failureCount, reason: health.reason });
      if (this.failureCount < this.config.failureThreshold) continue;
      this.failureCount = 0;
      try {
        await this.recover("health_failure");
      } catch (error) {
        this.emit("HEALTH_FAILURE", { healthState: "recovery_failed", reason: error instanceof Error ? error.message : String(error) });
        if (!this.canRestart()) throw error;
      }
    }
  }

  async shutdown(reason) {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = (async () => {
      this.stopping = true;
      this.emit("SHUTDOWN_REQUEST", { reason });
      this.updateState("stopping", { reason });
      const stopped = await this.stopChildGracefully(reason);
      if (!stopped) {
        this.shutdownFailed = true;
        return false;
      }
      this.updateState("stopped", { reason });
      return true;
    })();
    return this.shutdownPromise;
  }

  installSignals() {
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => { void this.shutdown(signal); };
      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  }

  removeSignals() {
    for (const [signal, handler] of this.signalHandlers) process.off(signal, handler);
    this.signalHandlers.clear();
  }

  async run() {
    this.installSignals();
    let exitCode = 0;
    let acquired = false;
    try {
      acquired = await this.acquireLock();
      if (!acquired) return 0;
      this.emit("SUPERVISOR_START", { attempt: 0, port: this.config.port });
      this.updateState("starting");
      this.verifyIntendedRelease();
      await this.ensurePortFree();
      this.startServer();
      if (!(await this.waitForHealthy("startup"))) throw new Error("STARTUP_HEALTH_TIMEOUT");
      if (this.stopping) {
        if (!(await this.shutdownPromise)) exitCode = 1;
      } else if (this.config.once) {
        if (!(await this.shutdown("once"))) exitCode = 1;
      } else {
        await this.monitor();
        if (this.shutdownFailed) exitCode = 1;
      }
    } catch (error) {
      exitCode = 1;
      this.emit("SUPERVISOR_EXIT", { reason: error instanceof Error ? error.message : String(error), failed: true });
      this.updateState("failed", { reason: error instanceof Error ? error.message : String(error) });
      if (!this.stopping) await this.shutdown("failure");
    } finally {
      if (!this.shutdownFailed) this.emit("SUPERVISOR_EXIT", { reason: exitCode === 0 ? "normal" : "failed", exitCode });
      this.removeSignals();
      if (acquired && !this.shutdownFailed) this.releaseLock();
    }
    return exitCode;
  }
}

async function main() {
  const supervisor = new Supervisor(parseArgs(process.argv.slice(2)));
  const exitCode = await supervisor.run();
  process.exitCode = exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write("Fangcun supervisor failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULTS,
  JsonlLogger,
  Supervisor,
  isProcessAlive,
  parseArgs,
  probePort,
  requestHealth,
  waitForChildClose,
};
