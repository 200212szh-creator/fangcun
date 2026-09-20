"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("./fangcun-supervisor");

function writeJsonAtomically(file, value) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = target + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(temporary, JSON.stringify(value) + "\n", "utf8");
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

function requestShutdown(stateDir) {
  const stateFile = path.join(path.resolve(stateDir), "supervisor-state.json");
  if (!fs.existsSync(stateFile)) throw new Error("SUPERVISOR_STATE_MISSING");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (!state.runtimeInstanceId || !state.supervisorPid) throw new Error("SUPERVISOR_STATE_INVALID");
  const controlFile = path.join(path.resolve(stateDir), "supervisor-control.json");
  writeJsonAtomically(controlFile, {
    action: "shutdown",
    runtimeInstanceId: state.runtimeInstanceId,
    requestedAt: new Date().toISOString(),
  });
  return { controlFile, runtimeInstanceId: state.runtimeInstanceId, supervisorPid: state.supervisorPid };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.action !== "shutdown" || !args["state-dir"]) throw new Error("SHUTDOWN_ACTION_AND_STATE_DIR_REQUIRED");
    process.stdout.write(JSON.stringify({ ok: true, ...requestShutdown(args["state-dir"]) }) + "\n");
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
}

module.exports = { requestShutdown };
