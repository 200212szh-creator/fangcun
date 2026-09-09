import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

function isolatedEnv(database: string): NodeJS.ProcessEnv {
  const env = { ...process.env, DATABASE_URL: database, FANGCUN_MIGRATION_DATABASE: database, FANGCUN_MIGRATION_TARGET: "ISOLATED", FANGCUN_E2E: "1", NODE_ENV: "test" as const };
  delete env.FANGCUN_DATA_DIR;
  delete env.FANGCUN_RELEASE_DIR;
  return env;
}

function run(script: string, args: string[], env: NodeJS.ProcessEnv) {
  return execFileSync(process.execPath, [tsxCli, path.join(root, script), ...args], { cwd: root, env, encoding: "utf8" }).trim();
}

function runJson(script: string, args: string[], env: NodeJS.ProcessEnv) {
  return JSON.parse(run(script, args, env)) as Record<string, unknown>;
}

async function createBackup(source: string, destination: string) {
  const sourceDatabase = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await sourceDatabase.backup(destination);
  } finally {
    sourceDatabase.close();
  }
  const database = new Database(destination, { readonly: true, fileMustExist: true });
  try {
    const tables = (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name);
    const counts = Object.fromEntries(tables.map((table) => [table, Number((database.prepare("SELECT COUNT(*) AS count FROM " + table).get() as { count: number }).count)]));
    const metadata = { kind: "pre-upgrade", createdAt: new Date().toISOString(), integrity: "ok", counts, sha256: crypto.createHash("sha256").update(fs.readFileSync(destination)).digest("hex") };
    fs.writeFileSync(destination + ".json", JSON.stringify(metadata, null, 2) + "\n", "utf8");
  } finally {
    database.close();
  }
}

function removeDirectory(directory: string) {
  fs.rmSync(directory, { recursive: true, force: true });
}

describe("Task 004 production readiness tools", () => {
  it("keeps bootstrap structural and fails fast before explicit migrations", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-schema-truth-"));
    const database = path.join(directory, "bootstrap.db");
    try {
      const result = runJson("tests/schema-truth-probe.ts", [], isolatedEnv(database));
      expect(result.schemaMigrations).toBe(true);
      expect(result.archiveColumn).toBe(false);
      expect(result.loans).toBe(false);
      expect(result.annotations).toBe(false);
      expect(result.works).toBe(false);
      expect(result.workId).toBe(false);
      expect(result.ensureError && (result.ensureError as { code?: string }).code).toBe("SCHEMA_MIGRATION_REQUIRED");
    } finally {
      removeDirectory(directory);
    }
  });

  it("runs read-only preflight and isolated restore verification", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-readiness-"));
    const database = path.join(directory, "source.db");
    const backup = path.join(directory, "backup.db");
    try {
      run("scripts/migrate.ts", [], isolatedEnv(database));
      run("scripts/migrate-v2.ts", [], isolatedEnv(database));
      await createBackup(database, backup);
      const environment = isolatedEnv(database);
      const preflight = runJson("scripts/migration-preflight.ts", [
        "--target=ISOLATED",
        "--database=" + database,
        "--backup=" + backup,
        "--service=isolated",
        "--max-age-hours=24",
      ], environment);
      expect(preflight.status).toBe("PASS");
      expect(preflight.readyForApproval).toBe(true);
      expect((preflight.checks as Record<string, { status: string }>).pendingWrites.status).toBe("PASS");
      expect((preflight.checks as Record<string, { status: string }>).backupMetadata.status).toBe("PASS");

      const restored = runJson("scripts/verify-backup-restore.ts", ["--target=ISOLATED", "--backup=" + backup], environment);
      expect(restored.status).toBe("PASS");
      expect(restored.formalDatabaseMutation).toBe(false);

      const validation = runJson("scripts/validate-migration.ts", [], { ...environment, FANGCUN_VALIDATION_DATABASE: database, FANGCUN_VALIDATION_TARGET: "ISOLATED" });
      expect(validation.valid).toBe(true);
      expect(validation.formalDatabaseMutation).toBe(false);
    } finally {
      removeDirectory(directory);
    }
  }, 120_000);
});
