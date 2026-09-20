"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const { parseArgs, requestHealth } = require("./fangcun-supervisor");

function absolute(value) {
  return path.resolve(String(value));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function configFromArgs(args) {
  const projectRoot = absolute(args["project-root"] || process.env.FANGCUN_PROJECT_ROOT || process.cwd());
  const dataRoot = absolute(args["data-root"] || process.env.FANGCUN_DATA_DIR || path.join(projectRoot, "data"));
  const runtimeRoot = path.join(projectRoot, "runtime");
  return {
    projectRoot,
    dataRoot,
    runtimeRoot,
    releasePointer: absolute(args["release-pointer"] || path.join(runtimeRoot, "current-release.txt")),
    releaseDir: args["release-dir"] ? absolute(args["release-dir"]) : "",
    stateDir: absolute(args["state-dir"] || path.join(dataRoot, "state")),
    logDir: absolute(args["log-dir"] || path.join(dataRoot, "logs", "supervisor")),
    database: absolute(args.database || process.env.DATABASE_URL || path.join(dataRoot, "data", "library.db")),
    port: Number(args.port || 3000),
    waitMs: Number(args["wait-ms"] || 60_000),
    pollMs: Number(args["poll-ms"] || 500),
    noOpen: Boolean(args["no-open"]),
  };
}

function supervisorArguments(config) {
  const values = [
    "--project-root", config.projectRoot,
    "--data-root", config.dataRoot,
    "--release-pointer", config.releasePointer,
    "--state-dir", config.stateDir,
    "--log-dir", config.logDir,
    "--database", config.database,
    "--port", String(config.port),
  ];
  if (config.releaseDir) values.push("--release-dir", config.releaseDir);
  return values;
}

function openBrowser(url) {
  const browser = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  browser.unref();
}

async function main() {
  const config = configFromArgs(parseArgs(process.argv.slice(2)));
  let health = await requestHealth(config.port, 1500);
  if (!health.ok) {
    const supervisor = spawn(process.execPath, [path.join(config.projectRoot, "runtime", "launcher", "fangcun-supervisor.js"), ...supervisorArguments(config)], {
      cwd: config.projectRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    supervisor.unref();

    const deadline = Date.now() + config.waitMs;
    while (Date.now() < deadline) {
      await delay(config.pollMs);
      health = await requestHealth(config.port, 1500);
      if (health.ok) break;
    }
  }

  if (!health.ok) {
    process.stderr.write("Fangcun supervisor did not become healthy.\n");
    process.exitCode = 1;
    return;
  }
  if (!config.noOpen) openBrowser("http://127.0.0.1:" + config.port + "/");
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write("Fangcun manual launcher failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}

module.exports = { configFromArgs, supervisorArguments };
