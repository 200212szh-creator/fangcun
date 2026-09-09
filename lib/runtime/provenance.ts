import fs from "node:fs";
import path from "node:path";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export type ReleaseProvenance = {
  release: string;
  releaseDir: string;
  buildId: string;
  sourceCommit: string;
  dirty: boolean;
  buildTimestamp: string;
  complete: boolean;
};

function unknownProvenance(releaseDir: string): ReleaseProvenance {
  return {
    release: path.basename(releaseDir),
    releaseDir,
    buildId: "unknown",
    sourceCommit: "unknown",
    dirty: false,
    buildTimestamp: "unknown",
    complete: false,
  };
}

export function readReleaseProvenance(releaseDirectory: string): ReleaseProvenance {
  const releaseDir = path.resolve(releaseDirectory);
  const fallback = unknownProvenance(releaseDir);
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(releaseDir, "release.json"), "utf8")) as Record<string, unknown>;
    const release = String(raw.release ?? raw.version ?? fallback.release).trim() || fallback.release;
    const buildId = String(raw.buildId ?? "unknown").trim() || "unknown";
    const sourceCommit = String(raw.sourceCommit ?? "unknown").trim() || "unknown";
    const buildTimestamp = String(raw.buildTimestamp ?? raw.createdAt ?? "unknown").trim() || "unknown";
    const dirty = typeof raw.dirty === "boolean" ? raw.dirty : false;
    const complete = release === path.basename(releaseDir)
      && buildId !== "unknown"
      && COMMIT_SHA_PATTERN.test(sourceCommit)
      && buildTimestamp !== "unknown"
      && typeof raw.dirty === "boolean";
    return { release, releaseDir, buildId, sourceCommit, dirty, buildTimestamp, complete };
  } catch {
    return fallback;
  }
}

export function isCommitSha(value: string) {
  return COMMIT_SHA_PATTERN.test(value);
}
