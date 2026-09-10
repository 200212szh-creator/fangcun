import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
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

function isolatedEnv(database: string): NodeJS.ProcessEnv {
  const environment = { ...process.env, DATABASE_URL: database, FANGCUN_MIGRATION_DATABASE: database, FANGCUN_MIGRATION_TARGET: "ISOLATED" };
  delete environment.FANGCUN_DATA_DIR;
  delete environment.FANGCUN_RELEASE_DIR;
  return environment;
}

function run(database: string, script: string, args: string[] = []) {
  return execFileSync(process.execPath, [tsxCli, path.join(root, "scripts", script), ...args], { cwd: root, env: isolatedEnv(database), encoding: "utf8" }).trim();
}

function runJson(database: string, script: string, args: string[] = []) {
  return JSON.parse(run(database, script, args).split(/\r?\n/).at(-1) || "{}") as Record<string, unknown>;
}

function seedLegacy(database: string) {
  const sqlite = new Database(database);
  const editionOne = "contributor-edition-one-" + crypto.randomUUID();
  const editionTwo = "contributor-edition-two-" + crypto.randomUUID();
  const editionThree = "contributor-edition-three-" + crypto.randomUUID();
  const now = new Date().toISOString();
  const insertEdition = sqlite.prepare("INSERT INTO book_editions (id,title,authors,translators,publisher,source,user_override) VALUES (?,?,?,?,?,?,?)");
  insertEdition.run(editionOne, "Contributor Legacy One", JSON.stringify(["Shared Author", "Second Author"]), JSON.stringify(["Translator One"]), "Fixture Press", "test", "{}");
  insertEdition.run(editionTwo, "Contributor Legacy Two", JSON.stringify(["Shared Author"]), JSON.stringify([]), "Fixture Press", "test", "{}");
  insertEdition.run(editionThree, "Contributor Legacy Empty", JSON.stringify([]), JSON.stringify([]), "Fixture Press", "test", "{}");
  const location = "contributor-location-" + crypto.randomUUID();
  sqlite.prepare("INSERT INTO shelf_locations (id,name,parent_id,room,user_id,sort_order,active) VALUES (?,?,?,?,?,?,1)").run(location, "Contributor Shelf", null, null, "local-owner", 0);
  sqlite.prepare("INSERT INTO owned_copies (id,user_id,edition_id,location,reading_status,created_at,updated_at,shelf_location_id) VALUES (?,?,?,?,?,?,?,?)").run("contributor-copy-" + crypto.randomUUID(), "local-owner", editionOne, "Shelf", "unread", now, now, location);
  sqlite.close();
  return { editionOne, editionTwo, editionThree };
}

function capture(database: string) {
  const sqlite = new Database(database, { readonly: true });
  try {
    return {
      editions: sqlite.prepare("SELECT id,title,authors,translators FROM book_editions ORDER BY id").all(),
      core: {
        works: sqlite.prepare("SELECT id FROM works ORDER BY id").all(),
        copies: sqlite.prepare("SELECT id,edition_id FROM owned_copies ORDER BY id").all(),
        locations: sqlite.prepare("SELECT id,name FROM shelf_locations ORDER BY id").all(),
        loans: sqlite.prepare("SELECT id,copy_id FROM loans ORDER BY id").all(),
        annotations: sqlite.prepare("SELECT id,copy_id FROM annotations ORDER BY id").all(),
      },
      history: sqlite.prepare("SELECT id FROM schema_migrations ORDER BY applied_at,id").all(),
    };
  } finally {
    sqlite.close();
  }
}

function removeDirectory(directory: string) {
  fs.rmSync(directory, { recursive: true, force: true });
}

describe("Contributor migration 0005", () => {
  it("dry-runs, backfills conservatively, is idempotent, and rehearses rollback", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-contributor-migration-"));
    const database = path.join(directory, "contributors.db");
    try {
      run(database, "migrate.ts");
      run(database, "migrate-v2.ts");
      const seeded = seedLegacy(database);
      run(database, "migrate-v3.ts");
      run(database, "migrate-v4.ts");
      const before = capture(database);
      const dryRun = runJson(database, "migrate-v5.ts", ["--dry-run"]);
      expect(dryRun.status).toBe("dry_run");
      expect(capture(database)).toEqual(before);

      const first = runJson(database, "migrate-v5.ts");
      const second = runJson(database, "migrate-v5.ts");
      expect(first.status).toBe("applied");
      expect(second.status).toBe("already_applied");

      const sqlite = new Database(database, { readonly: true });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM contributors").get()).toEqual({ count: 4 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM edition_contributors").get()).toEqual({ count: 4 });
      const shared = sqlite.prepare("SELECT c.id FROM contributors c JOIN edition_contributors ec ON ec.contributor_id=c.id WHERE c.display_name=? ORDER BY c.id").all("Shared Author") as Array<{ id: string }>;
      expect(shared).toHaveLength(2);
      expect(new Set(shared.map((row) => row.id)).size).toBe(2);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM edition_contributors ec LEFT JOIN book_editions e ON e.id=ec.edition_id WHERE e.id IS NULL").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM edition_contributors ec LEFT JOIN contributors c ON c.id=ec.contributor_id WHERE c.id IS NULL").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM contributors c LEFT JOIN edition_contributors ec ON ec.contributor_id=c.id WHERE ec.contributor_id IS NULL").get()).toEqual({ count: 0 });
      sqlite.close();

      const afterMigration = capture(database);
      expect(afterMigration.editions).toEqual(before.editions);
      expect(afterMigration.core).toEqual(before.core);
      expect(afterMigration.history).toEqual([
        { id: "0001_archive_fields" },
        { id: "0002_loans_annotations" },
        { id: "0003_works" },
        { id: "0004_location_model" },
        { id: "0005_contributors" },
      ]);
      expect(seeded.editionThree).toMatch(/^contributor-edition-three-/);

      const rollback = runJson(database, "rollback-contributor-migration.ts");
      expect(rollback.status).toBe("rolled_back");
      const afterRollback = capture(database);
      expect(afterRollback.editions).toEqual(before.editions);
      expect(afterRollback.core).toEqual(before.core);
      expect(afterRollback.history).toEqual([
        { id: "0001_archive_fields" },
        { id: "0002_loans_annotations" },
        { id: "0003_works" },
        { id: "0004_location_model" },
      ]);
    } finally {
      removeDirectory(directory);
    }
  }, 120_000);

  it("refuses rollback after a new Contributor relation is added", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-contributor-rollback-"));
    const database = path.join(directory, "contributors.db");
    try {
      run(database, "migrate.ts");
      run(database, "migrate-v2.ts");
      seedLegacy(database);
      run(database, "migrate-v3.ts");
      run(database, "migrate-v4.ts");
      run(database, "migrate-v5.ts");
      const sqlite = new Database(database);
      const edition = sqlite.prepare("SELECT id FROM book_editions ORDER BY id LIMIT 1").get() as { id: string };
      const contributorId = crypto.randomUUID();
      sqlite.prepare("INSERT INTO contributors (id,display_name,active,created_at,updated_at) VALUES (?,?,?,?,?)").run(contributorId, "Post migration contributor", 1, new Date().toISOString(), new Date().toISOString());
      sqlite.prepare("INSERT INTO edition_contributors (edition_id,contributor_id,role,order_index) VALUES (?,?,?,?)").run(edition.id, contributorId, "editor", 99);
      sqlite.close();
      const rollback = spawnSync(process.execPath, [tsxCli, path.join(root, "scripts", "rollback-contributor-migration.ts")], { cwd: root, env: isolatedEnv(database), encoding: "utf8" });
      expect(rollback.status).not.toBe(0);
      expect(rollback.stderr + rollback.stdout).toContain("Refusing rollback");
    } finally {
      removeDirectory(directory);
    }
  }, 120_000);
});
