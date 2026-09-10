import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const runner = path.join(root, "scripts", "migrate-v5-production.ts");
const migrationSha256 = "693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83";
const baseline = "works=2,editions=2,copies=2,activeCopies=2,locations=2,loans=0,annotations=0";
const approval = "--approval=EXECUTE_0005_CONTRIBUTORS";

function environment(database: string, extra: Record<string, string> = {}) {
  const value = { ...process.env, NODE_ENV: "test", DATABASE_URL: database, FANGCUN_MIGRATION_DATABASE: database, FANGCUN_MIGRATION_TARGET: "ISOLATED", ...extra };
  delete value.FANGCUN_DATA_DIR;
  delete value.FANGCUN_RELEASE_DIR;
  return value as NodeJS.ProcessEnv;
}

function runScript(database: string, script: string, args: string[] = [], extra: Record<string, string> = {}) {
  return execFileSync(process.execPath, [tsxCli, path.join(root, "scripts", script), ...args], { cwd: root, env: environment(database, extra), encoding: "utf8" }).trim();
}

function runFile(database: string, file: string, args: string[] = [], extra: Record<string, string> = {}) {
  return execFileSync(process.execPath, [tsxCli, path.join(root, file), ...args], { cwd: root, env: environment(database, extra), encoding: "utf8" }).trim();
}

function runRunner(database: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, [tsxCli, runner, ...args], { cwd: root, env: environment(database, extra), encoding: "utf8" });
}

function hash(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function baseArgs(database: string, backup: string, backupHash: string, mode: "PRECHECK" | "DRY-RUN" | "EXECUTE" = "DRY-RUN") {
  return [
    "--mode=" + mode,
    "--target=ISOLATED",
    "--database=" + database,
    "--backup=" + backup,
    "--backup-sha256=" + backupHash,
    "--sql-sha256=" + migrationSha256,
    "--baseline=" + baseline,
    "--service=isolated",
    approval,
  ];
}

function seedAndMigrate(database: string) {
  runScript(database, "migrate.ts");
  runScript(database, "migrate-v2.ts");
  const sqlite = new Database(database);
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO shelf_locations (id,name,parent_id,room,user_id,sort_order,active) VALUES (?,?,?,?,?,?,1)").run("location-one", "Contributor Shelf One", null, null, "local-owner", 0);
  sqlite.prepare("INSERT INTO shelf_locations (id,name,parent_id,room,user_id,sort_order,active) VALUES (?,?,?,?,?,?,1)").run("location-two", "Contributor Shelf Two", null, null, "local-owner", 1);
  const insertEdition = sqlite.prepare("INSERT INTO book_editions (id,title,authors,translators,publisher,isbn13,source,user_override) VALUES (?,?,?,?,?,?,?,?)");
  insertEdition.run("edition-one", "Runner Contributor One", JSON.stringify(["Shared Author"]), JSON.stringify(["Translator One"]), "Fixture Press", "9780000000001", "test", "{}");
  insertEdition.run("edition-two", "Runner Contributor Two", JSON.stringify(["Shared Author"]), JSON.stringify([]), "Fixture Press", "9780000000002", "test", "{}");
  const insertCopy = sqlite.prepare("INSERT INTO owned_copies (id,user_id,edition_id,location,reading_status,created_at,updated_at,shelf_location_id) VALUES (?,?,?,?,?,?,?,?)");
  insertCopy.run("copy-one", "local-owner", "edition-one", "Legacy Shelf", "unread", now, now, "location-one");
  insertCopy.run("copy-two", "local-owner", "edition-two", "Legacy Shelf", "reading", now, now, "location-two");
  sqlite.close();
  runScript(database, "migrate-v3.ts");
  runScript(database, "migrate-v4.ts");
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-contributor-production-"));
  const database = path.join(directory, "library.db");
  const backup = path.join(directory, "pre-upgrade.db");
  seedAndMigrate(database);
  fs.copyFileSync(database, backup);
  const backupHash = hash(backup);
  fs.writeFileSync(backup + ".json", JSON.stringify({
    kind: "pre-upgrade",
    createdAt: new Date().toISOString(),
    integrity: "ok",
    sha256: backupHash,
    counts: { book_editions: 2, owned_copies: 2, activeCopies: 2, shelf_locations: 2, loans: 0, annotations: 0, works: 2, editions: 2, copies: 2, locations: 2 },
  }));
  return { directory, database, backup, backupHash };
}

function snapshot(database: string) {
  const sqlite = new Database(database, { readonly: true });
  try {
    return {
      hash: hash(database),
      history: (sqlite.prepare("SELECT id FROM schema_migrations ORDER BY applied_at,id").all() as Array<{ id: string }>).map((row) => row.id),
      editions: sqlite.prepare("SELECT id,authors,translators FROM book_editions ORDER BY id").all(),
      core: {
        works: sqlite.prepare("SELECT id FROM works ORDER BY id").all(),
        copies: sqlite.prepare("SELECT id,edition_id,shelf_location_id FROM owned_copies ORDER BY id").all(),
        locations: sqlite.prepare("SELECT id,name FROM shelf_locations ORDER BY id").all(),
        loans: sqlite.prepare("SELECT id FROM loans ORDER BY id").all(),
        annotations: sqlite.prepare("SELECT id FROM annotations ORDER BY id").all(),
      },
    };
  } finally {
    sqlite.close();
  }
}

function remove(directory: string) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function semantic(item: ReturnType<typeof snapshot>) {
  const { hash: ignoredHash, ...rest } = item;
  void ignoredHash;
  return rest;
}

function message(result: ReturnType<typeof runRunner>) {
  return (result.stdout || "") + (result.stderr || "");
}

describe("production-safe Contributor migration runner", () => {
  it("covers A-H: refuses missing approval, writer, history, backup, SQL and partial-schema gates; dry-run is read-only", () => {
    const cases: Array<{ name: string; mutate?: (item: ReturnType<typeof fixture>) => void; args?: (item: ReturnType<typeof fixture>) => string[]; extra?: Record<string, string>; expected: string }> = [
      { name: "A", args: (item) => baseArgs(item.database, item.backup, item.backupHash).filter((value) => value !== approval), expected: "approval must be" },
      { name: "B", args: (item) => baseArgs(item.database, item.backup, item.backupHash).map((value) => value === approval ? "--approval=EXECUTE_0004_LOCATION_MODEL" : value), expected: "approval must be" },
      { name: "C", extra: { FANGCUN_CONTRIBUTOR_RUNNER_TEST_HOOK: "active-writer" }, expected: "Fangcun writer" },
      { name: "D", mutate: (item) => { const sqlite = new Database(item.database); sqlite.prepare("INSERT INTO schema_migrations (id,applied_at) VALUES (?,?)").run("unexpected_migration", new Date().toISOString()); sqlite.close(); }, expected: "pre-0005 state invalid" },
      { name: "E", args: (item) => baseArgs(item.database, item.backup, "0".repeat(64)), expected: "SHA-256" },
      { name: "F", args: (item) => baseArgs(item.database, item.backup, item.backupHash).map((value) => value.startsWith("--sql-sha256=") ? "--sql-sha256=" + "0".repeat(64) : value), expected: "SQL hash gate failed" },
      { name: "G", mutate: (item) => { const sqlite = new Database(item.database); sqlite.exec("CREATE TABLE contributors (id TEXT PRIMARY KEY)"); sqlite.close(); }, expected: "pre-0005 state invalid" },
    ];
    for (const item of cases) {
      const current = fixture();
      try {
        item.mutate?.(current);
        const result = runRunner(current.database, item.args?.(current) ?? baseArgs(current.database, current.backup, current.backupHash), item.extra);
        expect(result.status, item.name).not.toBe(0);
        expect(message(result), item.name).toContain(item.expected);
      } finally {
        remove(current.directory);
      }
    }
    const dry = fixture();
    try {
      const before = snapshot(dry.database);
      const result = runRunner(dry.database, baseArgs(dry.database, dry.backup, dry.backupHash, "DRY-RUN"));
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).goNoGo).toBe("GO");
      expect(snapshot(dry.database)).toEqual(before);
    } finally {
      remove(dry.directory);
    }
  }, 180_000);

  it("covers I-N and P: executes once, preserves legacy fields, creates distinct identities, and rolls back cleanly", () => {
    const current = fixture();
    try {
      const before = snapshot(current.database);
      const execute = runRunner(current.database, baseArgs(current.database, current.backup, current.backupHash, "EXECUTE"));
      expect(execute.status).toBe(0);
      const after = snapshot(current.database);
      expect(after.editions).toEqual(before.editions);
      expect(after.core).toEqual(before.core);
      expect(after.history).toEqual([...before.history, "0005_contributors"]);
      const sqlite = new Database(current.database, { readonly: true });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM contributors").get()).toEqual({ count: 3 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM edition_contributors").get()).toEqual({ count: 3 });
      const shared = sqlite.prepare("SELECT c.id FROM contributors c WHERE c.display_name=? ORDER BY c.id").all("Shared Author") as Array<{ id: string }>;
      expect(shared).toHaveLength(2);
      expect(new Set(shared.map((row) => row.id)).size).toBe(2);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM edition_contributors WHERE role='author'").get()).toEqual({ count: 2 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM edition_contributors WHERE role='translator'").get()).toEqual({ count: 1 });
      sqlite.close();

      const second = runRunner(current.database, baseArgs(current.database, current.backup, current.backupHash, "EXECUTE"));
      expect(second.status).not.toBe(0);
      expect(message(second)).toContain("pre-0005 state invalid");

      const rollback = runScript(current.database, "rollback-contributor-migration.ts");
      expect(JSON.parse(rollback).status).toBe("rolled_back");
      expect(semantic(snapshot(current.database))).toEqual(semantic(before));
    } finally {
      remove(current.directory);
    }
  }, 180_000);

  it("covers O and transaction rollback: existing contributor search/import/export compatibility passes and failed validation leaves no schema", () => {
    const current = fixture();
    try {
      const execute = runRunner(current.database, baseArgs(current.database, current.backup, current.backupHash, "EXECUTE"));
      expect(execute.status).toBe(0);
      const probe = runFile(current.database, "tests/contributor-probe.ts");
      expect(JSON.parse(probe).status).toBe("pass");
    } finally {
      remove(current.directory);
    }

    const failed = fixture();
    try {
      const before = snapshot(failed.database);
      const result = runRunner(failed.database, baseArgs(failed.database, failed.backup, failed.backupHash, "EXECUTE"), { FANGCUN_CONTRIBUTOR_RUNNER_TEST_HOOK: "post-validation-failure" });
      expect(result.status).not.toBe(0);
      expect(message(result)).toContain("simulated post-validation failure");
      expect(semantic(snapshot(failed.database))).toEqual(semantic(before));
    } finally {
      remove(failed.directory);
    }
  }, 240_000);
});
