/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-playwright-"));
const database = path.join(root, "library.db");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const migrationCommand = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : npmCommand;
const migrationArgs = process.platform === "win32" ? ["/d", "/s", "/c", `${npmCommand} run db:migrate:isolated`] : ["run", "db:migrate:isolated"];
const env = {
  ...process.env,
  DATABASE_URL: database,
  FANGCUN_DATA_DIR: root,
  FANGCUN_MIGRATION_DATABASE: database,
  FANGCUN_MIGRATION_TARGET: "ISOLATED",
  FANGCUN_E2E: "1",
  NODE_ENV: "test",
};

let server;
let cleaned = false;

function isOwnedRoot(target) {
  return path.dirname(target) === os.tmpdir() && path.basename(target).startsWith("fangcun-playwright-");
}

function cleanup() {
  if (cleaned || !isOwnedRoot(root)) return;
  cleaned = true;
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 250 });
  } catch (error) {
    process.stderr.write(`Unable to clean isolated E2E root ${root}: ${error.message}\n`);
  }
}

function stop(code = 0) {
  if (!server || server.exitCode !== null) {
    cleanup();
    process.exit(code);
  }
  server.once("close", () => {
    cleanup();
    process.exit(code);
  });
  server.kill();
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));
process.on("exit", cleanup);

try {
  execFileSync(migrationCommand, migrationArgs, { cwd: repoRoot, env, stdio: "inherit" });
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3017"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  server.on("error", () => stop(1));
  server.on("close", (code) => {
    cleanup();
    process.exit(code ?? 1);
  });
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  cleanup();
  process.exit(error.status || 1);
}
