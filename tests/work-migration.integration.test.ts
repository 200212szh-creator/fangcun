import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const representativeSource = process.env.FANGCUN_REPRESENTATIVE_DB;

type WorkValidation = { workCount: number; missingWorkId: number; orphanWorks: number; orphanEditions: number; duplicateWorkIds: number; unexpectedNullWorkFields: number; foreignKeyViolations: number };
type MigrationOutput = { status?: string; createdWorkCount?: number; counts?: Record<string, number>; validation?: WorkValidation };

function isolatedEnv(databaseFile: string) {
  const env = { ...process.env, DATABASE_URL: databaseFile, FANGCUN_MIGRATION_DATABASE: databaseFile, FANGCUN_MIGRATION_TARGET: "ISOLATED" };
  delete env.FANGCUN_DATA_DIR;
  delete env.FANGCUN_RELEASE_DIR;
  return env;
}

function runScript(script: string, databaseFile: string) {
  return execFileSync(process.execPath, [tsxCli, path.join(root, "scripts", script)], { cwd: root, env: isolatedEnv(databaseFile), encoding: "utf8" }).trim();
}

function runJson(script: string, databaseFile: string) {
  return JSON.parse(runScript(script, databaseFile)) as MigrationOutput;
}

function applyExistingMigrations(databaseFile: string) {
  runScript("migrate.ts", databaseFile);
  runScript("migrate-v2.ts", databaseFile);
}

function seedRepresentativeRows(databaseFile: string) {
  const sqlite = new Database(databaseFile);
  const editionId = `fixture-edition-${crypto.randomUUID()}`;
  const copyId = `fixture-copy-${crypto.randomUUID()}`;
  const shelfId = `fixture-shelf-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO shelf_locations (id,name,room,user_id,sort_order,active) VALUES (?,?,?,?,?,1)").run(shelfId, "Dry Run Shelf", "Study", "local-owner", 0);
  sqlite.prepare("INSERT INTO book_editions (id,title,authors,translators,publisher,isbn13,original_title,description,source,user_override) VALUES (?,?,?,?,?,?,?,?,?,?)").run(editionId, "Dry Run Edition", JSON.stringify(["Legacy Author"]), JSON.stringify(["Legacy Translator"]), "Local Press", "9780000000001", "Original Dry Run Title", "Preserve this description", "test", "{}");
  sqlite.prepare("INSERT INTO owned_copies (id,user_id,edition_id,reading_status,created_at,updated_at,shelf_location_id) VALUES (?,?,?,?,?,?,?)").run(copyId, "local-owner", editionId, "reading", now, now, shelfId);
  sqlite.prepare("INSERT INTO loans (id,copy_id,borrower_name,lent_at,status) VALUES (?,?,?,?,?)").run(`loan-${crypto.randomUUID()}`, copyId, "Dry Run Reader", now, "active");
  sqlite.prepare("INSERT INTO annotations (id,copy_id,body,created_at,updated_at) VALUES (?,?,?,?,?)").run(`annotation-${crypto.randomUUID()}`, copyId, "Legacy annotation", now, now);
  sqlite.close();
}

function captureLegacyState(databaseFile: string) {
  const sqlite = new Database(databaseFile, { readonly: true });
  const rows = sqlite.prepare("SELECT id,title,authors,translators,publisher,isbn13,original_title,description FROM book_editions ORDER BY id").all();
  const counts: Record<string, number> = Object.fromEntries(["book_editions", "owned_copies", "loans", "annotations", "shelf_locations"].map((table) => [table, Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count)]));
  sqlite.close();
  return { rows, counts };
}

function captureRollbackState(databaseFile: string) {
  const sqlite = new Database(databaseFile, { readonly: true });
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='works'").all();
  const columns = sqlite.prepare("PRAGMA table_info(book_editions)").all() as Array<{ name: string }>;
  const migrations = sqlite.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
  sqlite.close();
  return { hasWorksTable: tables.length > 0, hasWorkId: columns.some((column) => column.name === "work_id"), migrations };
}

describe("Work migration 0003", () => {
  it("runs a fresh isolated ADD/BACKFILL, is idempotent, validates and rolls back", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-work-fresh-"));
    const databaseFile = path.join(directory, "fresh.db");
    try {
      applyExistingMigrations(databaseFile);
      seedRepresentativeRows(databaseFile);
      const before = captureLegacyState(databaseFile);
      const first = runJson("migrate-v3.ts", databaseFile);
      const validated = runJson("validate-work-migration.ts", databaseFile);
      const second = runJson("migrate-v3.ts", databaseFile);
      expect(first.status).toBe("applied");
      expect(first.createdWorkCount).toBe(1);
      expect(validated.validation!.missingWorkId).toBe(0);
      expect(validated.validation!.orphanWorks).toBe(0);
      expect(validated.validation!.unexpectedNullWorkFields).toBe(0);
      expect(validated.counts).toMatchObject(before.counts);
      expect(second.status).toBe("already_applied");
      expect(second.createdWorkCount).toBe(0);
      expect(validated.validation!.workCount).toBe(before.counts.book_editions);
      expect(runJson("rollback-work-migration.ts", databaseFile).status).toBe("rolled_back");
      expect(captureRollbackState(databaseFile)).toEqual({ hasWorksTable: false, hasWorkId: false, migrations: [{ id: "0001_archive_fields" }, { id: "0002_loans_annotations" }] });
      expect(captureLegacyState(databaseFile)).toEqual(before);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  const representativeTest = representativeSource ? it : it.skip;
  representativeTest("runs against a copied representative backup and preserves legacy metadata", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-work-representative-"));
    const databaseFile = path.join(directory, "representative.db");
    try {
      fs.copyFileSync(representativeSource!, databaseFile);
      const before = captureLegacyState(databaseFile);
      const first = runJson("migrate-v3.ts", databaseFile);
      const validated = runJson("validate-work-migration.ts", databaseFile);
      const second = runJson("migrate-v3.ts", databaseFile);
      expect(first.status).toBe("applied");
      expect(first.createdWorkCount).toBe(before.counts.book_editions);
      expect(validated.validation!.workCount).toBe(before.counts.book_editions);
      expect(validated.validation!.missingWorkId).toBe(0);
      expect(validated.validation!.orphanWorks).toBe(0);
      expect(validated.validation!.unexpectedNullWorkFields).toBe(0);
      expect(validated.counts).toMatchObject(before.counts);
      expect(second.status).toBe("already_applied");
      expect(second.createdWorkCount).toBe(0);
      expect(runJson("rollback-work-migration.ts", databaseFile).status).toBe("rolled_back");
      expect(captureRollbackState(databaseFile)).toEqual({ hasWorksTable: false, hasWorkId: false, migrations: [{ id: "0001_archive_fields" }, { id: "0002_loans_annotations" }] });
      expect(captureLegacyState(databaseFile)).toEqual(before);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
