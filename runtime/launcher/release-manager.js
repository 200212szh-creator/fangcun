"use strict";

const fs = require("node:fs");
const path = require("node:path");

function absolute(value) {
  return path.resolve(String(value));
}

function isWithin(root, candidate) {
  const relative = path.relative(absolute(root), absolute(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readPointer(pointerFile, projectRoot) {
  const raw = fs.readFileSync(pointerFile, "utf8").trim();
  if (!raw) throw new Error("RELEASE_POINTER_EMPTY");
  return absolute(path.isAbsolute(raw) ? raw : path.join(projectRoot, raw));
}

function metadataFor(releaseDir) {
  const releaseJson = path.join(releaseDir, "release.json");
  const buildIdFile = path.join(releaseDir, "build-id.txt");
  if (!fs.existsSync(path.join(releaseDir, "server.js"))) throw new Error("RELEASE_SERVER_MISSING");
  if (!fs.existsSync(releaseJson)) throw new Error("RELEASE_METADATA_MISSING");
  if (!fs.existsSync(buildIdFile)) throw new Error("RELEASE_BUILD_ID_MISSING");

  let metadata;
  try {
    metadata = readJson(releaseJson);
  } catch {
    throw new Error("RELEASE_METADATA_INVALID_JSON");
  }

  const releaseName = path.basename(releaseDir);
  const buildId = fs.readFileSync(buildIdFile, "utf8").trim();
  if (metadata.release !== releaseName || metadata.version !== releaseName) throw new Error("RELEASE_NAME_MISMATCH");
  if (metadata.dirty !== false) throw new Error("RELEASE_DIRTY");
  if (typeof metadata.buildId !== "string" || metadata.buildId.length === 0 || metadata.buildId === "unknown") throw new Error("RELEASE_BUILD_ID_INVALID");
  if (metadata.buildId !== buildId) throw new Error("RELEASE_BUILD_ID_MISMATCH");
  if (typeof metadata.sourceCommit !== "string" || !/^[0-9a-f]{40}$/i.test(metadata.sourceCommit)) throw new Error("RELEASE_SOURCE_COMMIT_INVALID");
  if (typeof metadata.buildTimestamp !== "string" || metadata.buildTimestamp.length === 0) throw new Error("RELEASE_BUILD_TIMESTAMP_MISSING");

  return {
    releaseDir,
    releaseName,
    serverFile: path.join(releaseDir, "server.js"),
    buildId,
    sourceCommit: metadata.sourceCommit,
    dirty: metadata.dirty,
    buildTimestamp: metadata.buildTimestamp,
    metadata,
  };
}

function verifyRelease({ projectRoot, releaseDir, pointerFile, expectedBuildId, expectedSourceCommit }) {
  const root = absolute(projectRoot);
  const releaseRoot = absolute(path.join(root, "runtime", "releases"));
  const candidate = absolute(releaseDir);
  if (!isWithin(releaseRoot, candidate) || candidate === releaseRoot) throw new Error("RELEASE_PATH_OUTSIDE_RUNTIME_ROOT");

  if (pointerFile) {
    const pointer = readPointer(absolute(pointerFile), root);
    if (pointer !== candidate) throw new Error("RELEASE_POINTER_MISMATCH");
  }

  const metadata = metadataFor(candidate);
  if (expectedBuildId && metadata.buildId !== expectedBuildId) throw new Error("RELEASE_EXPECTED_BUILD_ID_MISMATCH");
  if (expectedSourceCommit && metadata.sourceCommit !== expectedSourceCommit) throw new Error("RELEASE_EXPECTED_SOURCE_COMMIT_MISMATCH");
  return metadata;
}

function writeTextAtomically(file, value) {
  const target = absolute(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = target + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(temporary, value, "utf8");
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

function updatePointer({ projectRoot, releaseDir, pointerFile, expectedBuildId, expectedSourceCommit }) {
  const metadata = verifyRelease({ projectRoot, releaseDir, expectedBuildId, expectedSourceCommit });
  const root = absolute(projectRoot);
  const pointer = absolute(pointerFile || path.join(root, "runtime", "current-release.txt"));
  if (!isWithin(path.join(root, "runtime"), pointer)) throw new Error("POINTER_PATH_OUTSIDE_RUNTIME_ROOT");
  writeTextAtomically(pointer, metadata.releaseDir + "\n");
  return { pointer, ...metadata };
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

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const projectRoot = args["project-root"];
    const releaseDir = args["release-dir"];
    const pointerFile = args.pointer || args["pointer-file"];
    if (!projectRoot || !releaseDir) throw new Error("PROJECT_ROOT_AND_RELEASE_DIR_REQUIRED");

    if (args.command === "verify" || !args.command) {
      const metadata = verifyRelease({ projectRoot, releaseDir, pointerFile, expectedBuildId: args["expected-build-id"], expectedSourceCommit: args["expected-source-commit"] });
      process.stdout.write(JSON.stringify({ ok: true, operation: "verify", ...metadata }) + "\n");
    } else if (args.command === "promote" || args.command === "rollback") {
      const result = updatePointer({ projectRoot, releaseDir, pointerFile, expectedBuildId: args["expected-build-id"], expectedSourceCommit: args["expected-source-commit"] });
      process.stdout.write(JSON.stringify({ ok: true, operation: args.command, ...result }) + "\n");
    } else {
      throw new Error("UNKNOWN_RELEASE_OPERATION");
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  isWithin,
  metadataFor,
  parseArgs,
  readPointer,
  updatePointer,
  verifyRelease,
  writeTextAtomically,
};
