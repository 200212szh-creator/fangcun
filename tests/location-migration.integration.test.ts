import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tsxCandidates = [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "..", "..", "node_modules", "tsx", "dist", "cli.mjs")];
const tsxCli = tsxCandidates.find((candidate) => fs.existsSync(candidate)) ?? tsxCandidates[0];

function isolatedEnv(database: string) {
  const environment = { ...process.env, DATABASE_URL: database, FANGCUN_MIGRATION_DATABASE: database, FANGCUN_MIGRATION_TARGET: "ISOLATED" };
  delete environment.FANGCUN_DATA_DIR;
  delete environment.FANGCUN_RELEASE_DIR;
  return environment;
}

function run(database: string, script: string) {
  return execFileSync(process.execPath, [tsxCli, path.join(root, "scripts", script)], { cwd: root, env: isolatedEnv(database), encoding: "utf8" }).trim();
}

function runFile(database: string, script: string, args: string[] = []) {
  return execFileSync(process.execPath, [tsxCli, path.join(root, script), ...args], { cwd: root, env: isolatedEnv(database), encoding: "utf8" }).trim();
}

function runJson(database: string, script: string) {
  return JSON.parse(run(database, script).split(/\r?\n/).at(-1) || "{}") as Record<string, unknown>;
}

function applyBase(database: string) {
  run(database, "migrate.ts");
  run(database, "migrate-v2.ts");
}

function seedLegacy(database: string) {
  const sqlite = new Database(database);
  const firstLocation = "legacy-location-" + crypto.randomUUID();
  const secondLocation = "legacy-location-" + crypto.randomUUID();
  const firstEdition = "legacy-edition-" + crypto.randomUUID();
  const secondEdition = "legacy-edition-" + crypto.randomUUID();
  const firstCopy = "legacy-copy-" + crypto.randomUUID();
  const secondCopy = "legacy-copy-" + crypto.randomUUID();
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO shelf_locations (id,name,parent_id,room,user_id,sort_order,active) VALUES (?,?,?,?,?,?,1)").run(firstLocation, "卧室书橱一层", null, null, "local-owner", 0);
  sqlite.prepare("INSERT INTO shelf_locations (id,name,parent_id,room,user_id,sort_order,active) VALUES (?,?,?,?,?,?,1)").run(secondLocation, "卧室书橱二层", null, "", "local-owner", 1);
  const edition = sqlite.prepare("INSERT INTO book_editions (id,title,authors,translators,publisher,isbn13,description,source,user_override) VALUES (?,?,?,?,?,?,?,?,?)");
  edition.run(firstEdition, "Legacy Location One", JSON.stringify(["Tester"]), JSON.stringify([]), "Fixture Press", "9780000000001", "Keep this edition", "test", "{}");
  edition.run(secondEdition, "Legacy Location Two", JSON.stringify(["Tester"]), JSON.stringify([]), "Fixture Press", "9780000000002", "Keep this edition", "test", "{}");
  const copy = sqlite.prepare("INSERT INTO owned_copies (id,user_id,edition_id,location,reading_status,created_at,updated_at,shelf_location_id,shelf_slot,shelf_coordinate) VALUES (?,?,?,?,?,?,?,?,?,?)");
  copy.run(firstCopy, "local-owner", firstEdition, "Legacy text", "reading", now, now, firstLocation, "2", "卧室书橱一层-2");
  copy.run(secondCopy, "local-owner", secondEdition, "", "unread", now, now, secondLocation, "1", null);
  sqlite.close();
  return { firstLocation, secondLocation, firstCopy, secondCopy };
}

function captureLegacy(database: string) {
  const sqlite = new Database(database, { readonly: true });
  const locations = sqlite.prepare("SELECT id,name,parent_id,room,user_id,sort_order,active FROM shelf_locations ORDER BY id").all();
  const copies = sqlite.prepare("SELECT id,edition_id,location,shelf_location_id,shelf_slot,shelf_coordinate,location_sort_order,deleted_at FROM owned_copies ORDER BY id").all();
  const history = sqlite.prepare("SELECT id FROM schema_migrations ORDER BY applied_at,id").all();
  sqlite.close();
  return { locations, copies, history };
}

function removeDatabase(directory: string) {
  fs.rmSync(directory, { recursive: true, force: true });
}

describe("Location migration 0004", () => {
  it("preserves legacy rows, supports normalized hierarchy and is idempotent", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-location-migration-"));
    const database = path.join(directory, "location.db");
    try {
      applyBase(database);
      const seeded = seedLegacy(database);
      run(database, "migrate-v3.ts");
      const before = captureLegacy(database);
      const dryRun = JSON.parse(runFile(database, path.join("scripts", "migrate-v4.ts"), ["--dry-run"]).split(/\r?\n/).at(-1) || "{}") as Record<string, unknown>;
      expect(dryRun.status).toBe("dry_run");
      expect(captureLegacy(database)).toEqual(before);
      const first = runJson(database, "migrate-v4.ts");
      const second = runJson(database, "migrate-v4.ts");
      expect(first.status).toBe("applied");
      expect(second.status).toBe("already_applied");
      const after = captureLegacy(database);
      expect(after.locations).toEqual(before.locations);
      expect(after.copies).toEqual(before.copies);
      expect(after.history).toEqual([{ id: "0001_archive_fields" }, { id: "0002_loans_annotations" }, { id: "0003_works" }, { id: "0004_location_model" }]);
      const probe = JSON.parse(runFile(database, path.join("tests", "location-probe.ts"), [seeded.firstCopy]).split(/\r?\n/).at(-1) || "{}") as Record<string, unknown>;
      expect(probe.status).toBe("pass");
      const rollbackAttempt = spawnSync(process.execPath, [tsxCli, path.join(root, "scripts", "rollback-location-migration.ts")], { cwd: root, env: isolatedEnv(database), encoding: "utf8" });
      expect(rollbackAttempt.status).not.toBe(0);
      expect((rollbackAttempt.stderr + rollbackAttempt.stdout)).toContain("Refusing rollback");
      expect(seeded.secondCopy).toMatch(/^legacy-copy-/);
    } finally {
      removeDatabase(directory);
    }
  }, 120_000);

  it("rehearses a clean rollback without changing legacy rows", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-location-rollback-"));
    const database = path.join(directory, "location.db");
    try {
      applyBase(database);
      seedLegacy(database);
      run(database, "migrate-v3.ts");
      const before = captureLegacy(database);
      expect(runJson(database, "migrate-v4.ts").status).toBe("applied");
      const rollback = runJson(database, "rollback-location-migration.ts");
      expect(rollback.status).toBe("rolled_back");
      const after = captureLegacy(database);
      expect(after.locations).toEqual(before.locations);
      expect(after.copies).toEqual(before.copies);
      expect(after.history).toEqual([{ id: "0001_archive_fields" }, { id: "0002_loans_annotations" }, { id: "0003_works" }]);
      const sqlite = new Database(database, { readonly: true });
      expect((sqlite.prepare("PRAGMA table_info(shelf_locations)").all() as Array<{ name: string }>).some((column) => column.name === "location_type")).toBe(false);
      expect((sqlite.prepare("PRAGMA table_info(loans)").all() as Array<{ name: string }>).some((column) => column.name === "original_location_id")).toBe(false);
      sqlite.close();
    } finally {
      removeDatabase(directory);
    }
  }, 120_000);
});
