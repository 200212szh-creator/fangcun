/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_LOG_AGE_DAYS = 14;
const MAX_LOG_TOTAL_BYTES = 100 * 1024 * 1024;

function day() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function sanitize(value) {
  return String(value)
    .replace(/(api[_-]?key|token|secret|authorization|password)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/(borrower[_-]?contact|annotation|body|notes?)[:=]\s*[^,}\n]+/gi, "$1=[redacted]");
}

class RollingLog {
  constructor(directory, prefix) {
    this.directory = directory;
    this.prefix = prefix;
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, `${prefix}-${day()}.log`);
    this.cleanup();
  }

  write(value) {
    const text = sanitize(value);
    let size = 0;
    try { size = fs.statSync(this.file).size; } catch {}
    if (size + Buffer.byteLength(text) > MAX_LOG_BYTES) {
      const rotated = `${this.file}.${new Date().toISOString().replace(/[:.]/g, "-")}`;
      try { fs.renameSync(this.file, rotated); } catch {}
    }
    fs.appendFileSync(this.file, text, "utf8");
    this.cleanup();
  }

  cleanup() {
    const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 86400000;
    const files = fs.readdirSync(this.directory)
      .map((name) => {
        const file = path.join(this.directory, name);
        try { const stat = fs.statSync(file); return { file, size: stat.size, mtime: stat.mtimeMs }; } catch { return null; }
      })
      .filter(Boolean)
      .filter((entry) => entry.mtime >= cutoff)
      .sort((a, b) => b.mtime - a.mtime);
    let total = 0;
    for (const entry of files) {
      total += entry.size;
      if (total > MAX_LOG_TOTAL_BYTES) {
        try { fs.rmSync(entry.file, { force: true }); } catch {}
      }
    }
    for (const entry of fs.readdirSync(this.directory)) {
      const file = path.join(this.directory, entry);
      try { if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true }); } catch {}
    }
  }
}

const releaseDirValue = process.env.FANGCUN_RELEASE_DIR;
const dataRoot = process.env.FANGCUN_DATA_DIR;
const stateDir = process.env.FANGCUN_STATE_DIR;
const logDir = process.env.FANGCUN_SERVICE_LOG_DIR;
const releasePointer = process.env.FANGCUN_RELEASE_POINTER;
if (!releaseDirValue || !dataRoot || !stateDir || !logDir || !releasePointer) {
  console.error("Fangcun service host is missing required runtime configuration.");
  process.exit(2);
}

const releaseDir = path.resolve(releaseDirValue);
const serverFile = path.join(releaseDir, "server.js");
if (!fs.existsSync(serverFile)) {
  console.error("Fangcun release server is missing.");
  process.exit(2);
}

function readPointer() {
  try { return path.resolve(fs.readFileSync(releasePointer, "utf8").trim()); } catch { return null; }
}

let releaseMetadata;
try { releaseMetadata = JSON.parse(fs.readFileSync(path.join(releaseDir, "release.json"), "utf8")); } catch { releaseMetadata = null; }
const releaseName = path.basename(releaseDir);
const validSourceCommit = typeof releaseMetadata?.sourceCommit === "string" && /^[0-9a-f]{40}$/i.test(releaseMetadata.sourceCommit);
const validProvenance = releaseMetadata
  && releaseMetadata.release === releaseName
  && releaseMetadata.version === releaseName
  && typeof releaseMetadata.buildId === "string"
  && releaseMetadata.buildId !== "unknown"
  && validSourceCommit
  && typeof releaseMetadata.buildTimestamp === "string"
  && releaseMetadata.buildTimestamp.length > 0
  && typeof releaseMetadata.dirty === "boolean";
if (readPointer() !== releaseDir || !validProvenance || (process.env.FANGCUN_BUILD_ID && process.env.FANGCUN_BUILD_ID !== releaseMetadata.buildId)) {
  console.error("Fangcun release activation guard failed: expected release does not match the active release provenance.");
  process.exit(2);
}

fs.mkdirSync(stateDir, { recursive: true });
const log = new RollingLog(logDir, "service");
const stateFile = path.join(stateDir, "service.pid");
const server = spawn(process.execPath, [serverFile], {
  cwd: path.dirname(serverFile),
  windowsHide: true,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: process.env.FANGCUN_PORT || "3000",
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${process.env.FANGCUN_PORT || "3000"}`,
    FANGCUN_DATA_DIR: dataRoot,
    DATABASE_URL: process.env.DATABASE_URL,
    FANGCUN_BUILD_ID: releaseMetadata.buildId,
    FANGCUN_RELEASE_DIR: releaseDir,
    FANGCUN_RELEASE_NAME: releaseName,
  },
});

const state = { hostPid: process.pid, serverPid: server.pid, releaseDir, release: releaseName, buildId: releaseMetadata.buildId, sourceCommit: releaseMetadata.sourceCommit, dirty: releaseMetadata.dirty, serverFile, port: Number(process.env.FANGCUN_PORT || 3000), startedAt: new Date().toISOString() };
fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
log.write(`${new Date().toISOString()} service-start release=${state.releaseDir} port=${state.port}\n`);

server.stdout.on("data", (chunk) => log.write(chunk));
server.stderr.on("data", (chunk) => log.write(chunk));
server.on("error", (error) => { log.write(`${new Date().toISOString()} service-error ${error.message}\n`); });

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  log.write(`${new Date().toISOString()} service-stop signal=${signal}\n`);
  try { server.kill(); } catch {}
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

server.on("close", (code, signal) => {
  log.write(`${new Date().toISOString()} service-exit code=${code ?? "null"} signal=${signal ?? "none"}\n`);
  try {
    const current = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (current.hostPid === process.pid) fs.rmSync(stateFile, { force: true });
  } catch {}
  process.exit(typeof code === "number" ? code : 1);
});
