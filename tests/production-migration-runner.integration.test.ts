import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const runner = path.join(root, "scripts", "migrate-v3-production.ts");
const baseline = { editions: 2, copies: 2, loans: 0, annotations: 0, locations: 2 } as const;
const baselineArgument = "editions=2,copies=2,loans=0,annotations=0,locations=2";

type Fixture = { directory: string; database: string; backup: string; backupSha256: string };
type RunnerResult = { status: number | null; stdout: string; stderr: string };

function isolatedEnv(database: string, hook?: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: database, NODE_ENV: "test", FANGCUN_E2E: "1" };
  delete environment.FANGCUN_DATA_DIR;
  delete environment.FANGCUN_RELEASE_DIR;
  delete environment.FANGCUN_MIGRATION_DATABASE;
  delete environment.FANGCUN_MIGRATION_TARGET;
  if (hook) environment.FANGCUN_PRODUCTION_RUNNER_TEST_HOOK = hook;
  else delete environment.FANGCUN_PRODUCTION_RUNNER_TEST_HOOK;
  return environment;
}

function runExistingMigration(script: string, database: string) {
  execFileSync(process.execPath, [tsxCli, path.join(root, "scripts", script)], { cwd: root, env: isolatedEnv(database), encoding: "utf8" });
}

function hash(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function createFixture(): Fixture {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-production-runner-test-"));
  const database = path.join(directory, "target.db");
  const backup = path.join(directory, "backup.db");
  try {
    runExistingMigration("migrate.ts", database);
    runExistingMigration("migrate-v2.ts", database);
    const sqlite = new Database(database);
    const now = new Date().toISOString();
    try {
      const insertShelf = sqlite.prepare("INSERT INTO shelf_locations (id,name,room,user_id,sort_order,active) VALUES (?,?,?,?,?,1)");
      const insertEdition = sqlite.prepare("INSERT INTO book_editions (id,title,authors,translators,publisher,isbn13,original_title,description,source,user_override) VALUES (?,?,?,?,?,?,?,?,?,?)");
      const insertCopy = sqlite.prepare("INSERT INTO owned_copies (id,user_id,edition_id,reading_status,created_at,updated_at,shelf_location_id) VALUES (?,?,?,?,?,?,?)");
      for (let index = 1; index <= 2; index += 1) {
        const shelfId = `fixture-shelf-${crypto.randomUUID()}`;
        const editionId = `fixture-edition-${crypto.randomUUID()}`;
        insertShelf.run(shelfId, `Production Runner Shelf ${index}`, "Study", "local-owner", index - 1);
        insertEdition.run(editionId, `Production Runner Edition ${index}`, JSON.stringify(["Legacy Author"]), JSON.stringify([]), "Local Press", `97800000000${index}`, `Original Title ${index}`, `Preserve description ${index}`, "test", "{}");
        insertCopy.run(`fixture-copy-${crypto.randomUUID()}`, "local-owner", editionId, "unread", now, now, shelfId);
      }
    } finally {
      sqlite.close();
    }
    fs.copyFileSync(database, backup, fs.constants.COPYFILE_EXCL);
    const backupSha256 = hash(backup);
    fs.writeFileSync(`${backup}.json`, JSON.stringify({ kind: "pre-upgrade", createdAt: new Date().toISOString(), integrity: "ok", counts: { book_editions: baseline.editions, owned_copies: baseline.copies, loans: baseline.loans, annotations: baseline.annotations, shelf_locations: baseline.locations }, sha256: backupSha256 }, null, 2) + "\n", "utf8");
    return { directory, database, backup, backupSha256 };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function runnerArgs(fixture: Fixture, mode: "PRECHECK" | "DRY-RUN" | "EXECUTE", extra: string[] = []) {
  const serviceOverride = extra.some((argument) => argument.startsWith("--service="));
  const backupHashOverride = extra.some((argument) => argument.startsWith("--backup-sha256="));
  return [
    runner,
    `--mode=${mode}`,
    "--target=ISOLATED",
    `--database=${fixture.database}`,
    `--backup=${fixture.backup}`,
    ...(backupHashOverride ? [] : [`--backup-sha256=${fixture.backupSha256}`]),
    ...(serviceOverride ? [] : ["--service=isolated"]),
    `--baseline=${baselineArgument}`,
    ...extra,
  ];
}

function runRunner(fixture: Fixture, mode: "PRECHECK" | "DRY-RUN" | "EXECUTE", extra: string[] = [], hook?: string): RunnerResult {
  const result = spawnSync(process.execPath, [tsxCli, ...runnerArgs(fixture, mode, extra)], { cwd: root, env: isolatedEnv(fixture.database, hook), encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function combinedOutput(result: RunnerResult) {
  return `${result.stdout}\n${result.stderr}`;
}

function expectRefused(result: RunnerResult, expectedText: string | RegExp) {
  expect(result.status).not.toBe(0);
  expect(combinedOutput(result)).toMatch(expectedText);
}

function inspectFixture(database: string) {
  const sqlite = new Database(database, { readonly: true, fileMustExist: true });
  try {
    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name);
    const columns = sqlite.prepare("PRAGMA table_info(book_editions)").all() as Array<{ name: string }>;
    const migrations = sqlite.prepare("SELECT id FROM schema_migrations ORDER BY id").all() as Array<{ id: string }>;
    const count = (table: string) => Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    return {
      hasWorks: tables.includes("works"),
      hasWorkId: columns.some((column) => column.name === "work_id"),
      migrations: migrations.map((migration) => migration.id),
      editions: count("book_editions"),
      copies: count("owned_copies"),
      loans: count("loans"),
      annotations: count("annotations"),
      locations: count("shelf_locations"),
      works: tables.includes("works") ? count("works") : 0,
      integrity: sqlite.pragma("integrity_check", { simple: true }),
      foreignKeyViolations: sqlite.prepare("PRAGMA foreign_key_check").all().length,
    };
  } finally {
    sqlite.close();
  }
}

function withFixture(callback: (fixture: Fixture) => void) {
  const fixture = createFixture();
  try {
    callback(fixture);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
}

describe.sequential("Task 005A production-safe migration runner", () => {
  it("refuses by default without an explicit mode and target", () => {
    const result = spawnSync(process.execPath, [tsxCli, runner], { cwd: root, env: isolatedEnv(path.join(os.tmpdir(), "not-used.db")), encoding: "utf8" });
    expectRefused({ status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }, /explicit --mode/);
  });

  it("covers approval, service, history, backup and SQL fail-closed gates", () => {
    withFixture((fixture) => {
      expectRefused(runRunner(fixture, "EXECUTE"), /EXECUTE requires --approval=EXECUTE_0003_WORKS/);
      expectRefused(runRunner(fixture, "EXECUTE", ["--approval=WRONG_TOKEN"]), /EXECUTE requires --approval=EXECUTE_0003_WORKS/);
      expectRefused(runRunner(fixture, "EXECUTE", ["--approval=EXECUTE_0003_WORKS", "--service=running"]), /service attestation must be --service=isolated/);

      const sqlite = new Database(fixture.database);
      sqlite.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("9999_unexpected", new Date().toISOString());
      sqlite.close();
      expectRefused(runRunner(fixture, "DRY-RUN"), /schema\/history mismatch/);
    });

    withFixture((fixture) => {
      expectRefused(runRunner(fixture, "DRY-RUN", ["--backup-sha256=0000000000000000000000000000000000000000000000000000000000000000"]), /SHA-256/);
    });

    withFixture((fixture) => {
      expectRefused(runRunner(fixture, "DRY-RUN", ["--sql-sha256=0000000000000000000000000000000000000000000000000000000000000000"]), /SQL hash gate/);
    });
  }, 30_000);

  it("passes correct dry-run gates without modifying the isolated copy", () => {
    withFixture((fixture) => {
      const before = inspectFixture(fixture.database);
      const result = runRunner(fixture, "DRY-RUN");
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout) as { status: string; dryRun: boolean; formalDatabaseMutation: boolean; preflight: { expectedChanges: { createWorks: number } } };
      expect(output.status).toBe("PASS");
      expect(output.dryRun).toBe(true);
      expect(output.formalDatabaseMutation).toBe(false);
      expect(output.preflight.expectedChanges.createWorks).toBe(2);
      expect(inspectFixture(fixture.database)).toEqual(before);
    });
  });

  it("applies only with explicit approval, preserves legacy data, and refuses a second execution", () => {
    withFixture((fixture) => {
      const result = runRunner(fixture, "EXECUTE", ["--approval=EXECUTE_0003_WORKS"]);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout) as { status: string; createdWorkCount: number; formalDatabaseMutation: boolean };
      expect(output.status).toBe("PASS");
      expect(output.createdWorkCount).toBe(2);
      expect(output.formalDatabaseMutation).toBe(false);
      expect(inspectFixture(fixture.database)).toMatchObject({ hasWorks: true, hasWorkId: true, migrations: ["0001_archive_fields", "0002_loans_annotations", "0003_works"], editions: 2, copies: 2, loans: 0, annotations: 0, locations: 2, works: 2, integrity: "ok", foreignKeyViolations: 0 });
      expectRefused(runRunner(fixture, "EXECUTE", ["--approval=EXECUTE_0003_WORKS"]), /schema\/history mismatch|work schema state=ready/);
    });
  });

  it("returns non-zero on a simulated post-validation failure and does not restore or down-migrate", () => {
    withFixture((fixture) => {
      const before = inspectFixture(fixture.database);
      const result = runRunner(fixture, "EXECUTE", ["--approval=EXECUTE_0003_WORKS"], "post-validation-failure");
      expectRefused(result, /simulated post-validation failure/);
      expect(inspectFixture(fixture.database)).toEqual(before);
      expect(hash(fixture.backup)).toBe(fixture.backupSha256);
    });
  });
});
