import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tsxCandidates = [
  path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
  path.join(root, "..", "..", "node_modules", "tsx", "dist", "cli.mjs"),
];
const tsxCli = tsxCandidates.find((candidate) => fs.existsSync(candidate)) ?? tsxCandidates[0];
const runner = path.join(root, "scripts", "migrate-v4-production.ts");
const sqlSha256 = "63cb13d5fbde39b6010866ad28d078c6661fe45d780e1a378f7ccd829c789dcb";
const baseline = "works=2,editions=2,copies=2,activeCopies=2,locations=2,loans=0,annotations=0";

function isolatedEnv(database: string, extra: Record<string, string> = {}) {
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: database,
    FANGCUN_MIGRATION_DATABASE: database,
    FANGCUN_MIGRATION_TARGET: "ISOLATED",
    ...extra,
  };
  delete environment.FANGCUN_DATA_DIR;
  delete environment.FANGCUN_RELEASE_DIR;
  return environment as NodeJS.ProcessEnv;
}

function runScript(database: string, script: string, args: string[] = [], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, [tsxCli, path.join(root, "scripts", script), ...args], {
    cwd: root,
    env: isolatedEnv(database, extra),
    encoding: "utf8",
  });
}

function runMigration(database: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, [tsxCli, runner, ...args], {
    cwd: root,
    env: isolatedEnv(database, extra),
    encoding: "utf8",
  });
}

function hash(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function baseArgs(database: string, backup: string, backupSha256: string, mode: "PRECHECK" | "DRY-RUN" | "EXECUTE" = "DRY-RUN") {
  return [
    "--mode=" + mode,
    "--target=ISOLATED",
    "--database=" + database,
    "--backup=" + backup,
    "--backup-sha256=" + backupSha256,
    "--sql-sha256=" + sqlSha256,
    "--baseline=" + baseline,
    "--service=isolated",
  ];
}

function applyBase(database: string) {
  expect(runScript(database, "migrate.ts").status).toBe(0);
  expect(runScript(database, "migrate-v2.ts").status).toBe(0);
}

function seedAndMigrateTo0003(database: string) {
  applyBase(database);
  const sqlite = new Database(database);
  const now = new Date().toISOString();
  const locations = [
    ["location-one", "卧室书橱一层", 0],
    ["location-two", "卧室书橱二层", 1],
  ];
  const editions = [
    ["edition-one", "Location Runner One", "9780000000001"],
    ["edition-two", "Location Runner Two", "9780000000002"],
  ];
  for (const [id, name, sortOrder] of locations) {
    sqlite.prepare("INSERT INTO shelf_locations (id,name,parent_id,room,user_id,sort_order,active) VALUES (?,?,?,?,?,?,1)").run(id, name, null, null, "local-owner", sortOrder);
  }
  const insertEdition = sqlite.prepare("INSERT INTO book_editions (id,title,authors,translators,publisher,isbn13,description,source,user_override) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const [id, title, isbn13] of editions) {
    insertEdition.run(id, title, JSON.stringify(["Runner Tester"]), JSON.stringify([]), "Fixture Press", isbn13, "Preserved", "test", "{}");
  }
  const insertCopy = sqlite.prepare("INSERT INTO owned_copies (id,user_id,edition_id,location,reading_status,created_at,updated_at,shelf_location_id,shelf_slot,shelf_coordinate) VALUES (?,?,?,?,?,?,?,?,?,?)");
  insertCopy.run("copy-one", "local-owner", "edition-one", "Legacy text", "reading", now, now, "location-one", "2", "卧室书橱一层-2");
  insertCopy.run("copy-two", "local-owner", "edition-two", "", "unread", now, now, "location-two", "1", null);
  sqlite.close();
  expect(runScript(database, "migrate-v3.ts").status).toBe(0);
}

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-location-production-runner-"));
  const database = path.join(directory, "library.db");
  const backup = path.join(directory, "pre-upgrade.db");
  seedAndMigrateTo0003(database);
  fs.copyFileSync(database, backup);
  const backupSha256 = hash(backup);
  fs.writeFileSync(backup + ".json", JSON.stringify({
    source: database,
    sha256: backupSha256,
    integrity: "ok",
    createdAt: new Date().toISOString(),
    counts: {
      works: 2,
      book_editions: 2,
      owned_copies: 2,
      activeCopies: 2,
      shelf_locations: 2,
      loans: 0,
      annotations: 0,
    },
  }));
  return { directory, database, backup, backupSha256 };
}

function history(database: string) {
  const sqlite = new Database(database, { readonly: true });
  const result = (sqlite.prepare("SELECT id FROM schema_migrations ORDER BY applied_at,id").all() as Array<{ id: string }>).map((row) => row.id);
  sqlite.close();
  return result;
}

function legacyRows(database: string) {
  const sqlite = new Database(database, { readonly: true });
  const result = {
    locations: sqlite.prepare("SELECT id,name,parent_id,room,user_id,sort_order,active FROM shelf_locations ORDER BY id").all(),
    copies: sqlite.prepare("SELECT id,edition_id,location,shelf_location_id,shelf_slot,shelf_coordinate,location_sort_order,deleted_at FROM owned_copies ORDER BY id").all(),
  };
  sqlite.close();
  return result;
}

function removeFixture(directory: string) {
  fs.rmSync(directory, { recursive: true, force: true });
}

describe("production-safe location migration runner", () => {
  it("refuses unsafe invocation, performs a no-write dry run, then executes only in isolation", () => {
    const missingApproval = createFixture();
    try {
      const result = runMigration(missingApproval.database, baseArgs(missingApproval.database, missingApproval.backup, missingApproval.backupSha256, "EXECUTE"));
      expect(result.status).not.toBe(0);
      expect((result.stdout || "") + (result.stderr || "")).toContain("EXECUTE requires --approval=EXECUTE_0004_LOCATION_MODEL");
    } finally {
      removeFixture(missingApproval.directory);
    }

    const wrongApproval = createFixture();
    try {
      const result = runMigration(wrongApproval.database, baseArgs(wrongApproval.database, wrongApproval.backup, wrongApproval.backupSha256, "EXECUTE").concat(["--approval=EXECUTE_0003_WORKS"]));
      expect(result.status).not.toBe(0);
      expect((result.stdout || "") + (result.stderr || "")).toContain("EXECUTE requires --approval=EXECUTE_0004_LOCATION_MODEL");
    } finally {
      removeFixture(wrongApproval.directory);
    }

    const runningService = createFixture();
    try {
      const args = baseArgs(runningService.database, runningService.backup, runningService.backupSha256).map((item) => item === "--service=isolated" ? "--service=running" : item);
      const result = runMigration(runningService.database, args);
      expect(result.status).not.toBe(0);
      expect((result.stdout || "") + (result.stderr || "")).toContain("service attestation must be --service=isolated");
    } finally {
      removeFixture(runningService.directory);
    }

    const wrongBackupHash = createFixture();
    try {
      const before = hash(wrongBackupHash.database);
      const result = runMigration(wrongBackupHash.database, baseArgs(wrongBackupHash.database, wrongBackupHash.backup, "0".repeat(64)));
      expect(result.status).not.toBe(0);
      expect((result.stdout || "") + (result.stderr || "")).toContain("SHA-256");
      expect(hash(wrongBackupHash.database)).toBe(before);
    } finally {
      removeFixture(wrongBackupHash.directory);
    }

    const wrongSqlHash = createFixture();
    try {
      const args = baseArgs(wrongSqlHash.database, wrongSqlHash.backup, wrongSqlHash.backupSha256).map((item) => item.startsWith("--sql-sha256=") ? "--sql-sha256=" + "0".repeat(64) : item);
      const result = runMigration(wrongSqlHash.database, args);
      expect(result.status).not.toBe(0);
      expect((result.stdout || "") + (result.stderr || "")).toContain("SQL hash gate failed");
    } finally {
      removeFixture(wrongSqlHash.directory);
    }

    const partialSchema = createFixture();
    try {
      const sqlite = new Database(partialSchema.database);
      sqlite.exec("ALTER TABLE shelf_locations ADD COLUMN location_type TEXT NOT NULL DEFAULT 'legacy'");
      sqlite.close();
      const result = runMigration(partialSchema.database, baseArgs(partialSchema.database, partialSchema.backup, partialSchema.backupSha256));
      expect(result.status).not.toBe(0);
      expect((result.stdout || "") + (result.stderr || "")).toContain("pre-0004");
    } finally {
      removeFixture(partialSchema.directory);
    }

    const dryRun = createFixture();
    try {
      const beforeHash = hash(dryRun.database);
      const beforeHistory = history(dryRun.database);
      const precheck = runMigration(dryRun.database, baseArgs(dryRun.database, dryRun.backup, dryRun.backupSha256, "PRECHECK"));
      expect(precheck.status).toBe(0);
      expect(JSON.parse(precheck.stdout).status).toBe("PASS");
      expect(hash(dryRun.database)).toBe(beforeHash);
      expect(history(dryRun.database)).toEqual(beforeHistory);
      const dryRunResult = runMigration(dryRun.database, baseArgs(dryRun.database, dryRun.backup, dryRun.backupSha256, "DRY-RUN"));
      expect(dryRunResult.status).toBe(0);
      expect(JSON.parse(dryRunResult.stdout).goNoGo).toBe("GO");
      expect(hash(dryRun.database)).toBe(beforeHash);
    } finally {
      removeFixture(dryRun.directory);
    }
  }, 180_000);

  it("rolls back the isolated transaction on post-validation failure and preserves legacy rows", () => {
    const fixture = createFixture();
    try {
      const beforeHash = hash(fixture.database);
      const beforeHistory = history(fixture.database);
      const result = runMigration(fixture.database, baseArgs(fixture.database, fixture.backup, fixture.backupSha256, "EXECUTE").concat(["--approval=EXECUTE_0004_LOCATION_MODEL"]), {
        FANGCUN_LOCATION_RUNNER_TEST_HOOK: "post-validation-failure",
      });
      expect(result.status).not.toBe(0);
      expect((result.stdout || "") + (result.stderr || "")).toContain("simulated post-validation failure");
      expect(hash(fixture.database)).toBe(beforeHash);
      expect(history(fixture.database)).toEqual(beforeHistory);
    } finally {
      removeFixture(fixture.directory);
    }
  }, 120_000);

  it("applies 0004 once in an isolated copy and rehearses the existing rollback", () => {
    const fixture = createFixture();
    try {
      const beforeRows = legacyRows(fixture.database);
      const execute = runMigration(fixture.database, baseArgs(fixture.database, fixture.backup, fixture.backupSha256, "EXECUTE").concat(["--approval=EXECUTE_0004_LOCATION_MODEL"]));
      expect(execute.status).toBe(0);
      expect(JSON.parse(execute.stdout).status).toBe("PASS");
      expect(history(fixture.database)).toEqual(["0001_archive_fields", "0002_loans_annotations", "0003_works", "0004_location_model"]);
      expect(legacyRows(fixture.database)).toEqual(beforeRows);

      const secondExecute = runMigration(fixture.database, baseArgs(fixture.database, fixture.backup, fixture.backupSha256, "EXECUTE").concat(["--approval=EXECUTE_0004_LOCATION_MODEL"]));
      expect(secondExecute.status).not.toBe(0);
      expect((secondExecute.stdout || "") + (secondExecute.stderr || "")).toContain("pre-0004");

      const rollback = runScript(fixture.database, "rollback-location-migration.ts");
      expect(rollback.status).toBe(0);
      expect(JSON.parse(rollback.stdout).status).toBe("rolled_back");
      expect(history(fixture.database)).toEqual(["0001_archive_fields", "0002_loans_annotations", "0003_works"]);
      expect(legacyRows(fixture.database)).toEqual(beforeRows);
    } finally {
      removeFixture(fixture.directory);
    }
  }, 180_000);
});
