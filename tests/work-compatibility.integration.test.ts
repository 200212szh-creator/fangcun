import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const probe = path.join(repoRoot, "tests", "work-compatibility-probe.ts");

function isolatedEnv(database: string) {
  const environment = { ...process.env, DATABASE_URL: database, FANGCUN_MIGRATION_DATABASE: database, FANGCUN_MIGRATION_TARGET: "ISOLATED" };
  delete environment.FANGCUN_DATA_DIR;
  delete environment.FANGCUN_RELEASE_DIR;
  return environment;
}

function runCommand(database: string, script: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [tsxCli, script, ...args], { cwd: repoRoot, env: isolatedEnv(database), encoding: "utf8" });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  return result;
}

function runJson(database: string, script: string, args: string[] = []) {
  const result = runCommand(database, script, args);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1) || "{}") as Record<string, unknown>;
}

function removeDatabase(database: string) {
  for (const file of [database, `${database}-wal`, `${database}-shm`, `${database}-journal`]) fs.rmSync(file, { force: true });
}

describe("Work compatibility adapter", () => {
  it("keeps core consumers stable on the migrated schema and uses one write boundary", () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-task003-"));
    const database = path.join(tempDirectory, "compatibility.db");
    try {
      runCommand(database, path.join(repoRoot, "scripts", "migrate.ts"));
      runCommand(database, path.join(repoRoot, "scripts", "migrate-v2.ts"));
      const seeded = runJson(database, probe, ["seed"]);
      runCommand(database, path.join(repoRoot, "scripts", "migrate-v3.ts"));
      const result = runJson(database, probe, ["regression", String(seeded.copyId)]);
      expect(result.status).toBe("pass");
      expect(result.workCount).toBe(result.editionCount);
    } finally {
      removeDatabase(database);
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  }, 120_000);

  it("refuses a Work schema that has no recorded migration", () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-task003-guard-"));
    const database = path.join(tempDirectory, "guard.db");
    try {
      runCommand(database, path.join(repoRoot, "scripts", "migrate.ts"));
      runCommand(database, path.join(repoRoot, "scripts", "migrate-v2.ts"));
      const result = runJson(database, probe, ["guard"]);
      expect(result.guard).toBe("WORK_MIGRATION_UNRECORDED");
    } finally {
      removeDatabase(database);
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  }, 60_000);
});
