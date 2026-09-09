import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isCommitSha, readReleaseProvenance } from "@/lib/runtime/provenance";

const temporaryDirectories: string[] = [];

function makeRelease(metadataFor: (release: string) => Record<string, unknown>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-release-provenance-"));
  temporaryDirectories.push(directory);
  const release = path.basename(directory);
  fs.writeFileSync(path.join(directory, "release.json"), JSON.stringify(metadataFor(release)), "utf8");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("release provenance", () => {
  it("accepts a complete release record with a source commit", () => {
    const directory = makeRelease((release) => ({
      provenanceVersion: 1,
      release,
      version: release,
      buildId: "build-006e",
      sourceCommit: "0123456789abcdef0123456789abcdef01234567",
      dirty: true,
      buildTimestamp: "2026-09-09T00:00:00.000Z",
    }));
    const provenance = readReleaseProvenance(directory);
    expect(provenance).toMatchObject({ buildId: "build-006e", sourceCommit: "0123456789abcdef0123456789abcdef01234567", dirty: true, complete: true });
    expect(isCommitSha(provenance.sourceCommit)).toBe(true);
  });

  it("marks legacy or incomplete releases as unsafe", () => {
    const directory = makeRelease(() => ({ version: "legacy", buildId: "legacy" }));
    const provenance = readReleaseProvenance(directory);
    expect(provenance.complete).toBe(false);
    expect(provenance.sourceCommit).toBe("unknown");
    expect(isCommitSha(provenance.sourceCommit)).toBe(false);
  });
});
