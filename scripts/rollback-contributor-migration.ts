import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const migrationId = "0005_contributors";
const roles = new Set(["author", "translator", "editor", "compiler", "illustrator", "other"]);

class RollbackRefusal extends Error {}

function databasePath() {
  if (process.env.FANGCUN_MIGRATION_TARGET !== "ISOLATED") throw new RollbackRefusal("Refusing rollback: FANGCUN_MIGRATION_TARGET must be ISOLATED");
  const value = process.env.FANGCUN_MIGRATION_DATABASE;
  if (!value || !path.isAbsolute(value)) throw new RollbackRefusal("Refusing rollback: FANGCUN_MIGRATION_DATABASE must be an explicit absolute path");
  const normalized = path.normalize(value);
  const relative = path.relative(path.resolve(os.tmpdir()), normalized);
  if (relative === "" || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new RollbackRefusal("Refusing rollback: isolated database must be inside the temporary directory");
  if (!fs.existsSync(normalized)) throw new RollbackRefusal("Refusing rollback: database does not exist: " + normalized);
  return normalized;
}

function hasTable(database: Database.Database, table: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function parseCredits(value: unknown, editionId: string, field: string) {
  if (value === null || value === undefined || value === "") return [] as string[];
  let parsed: unknown;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch { throw new RollbackRefusal("Cannot parse " + field + " for Edition " + editionId); }
  if (!Array.isArray(parsed)) throw new RollbackRefusal(field + " for Edition " + editionId + " is not an array");
  if (parsed.some((item) => typeof item !== "string" || !item.trim())) throw new RollbackRefusal(field + " for Edition " + editionId + " contains an invalid credit");
  return parsed as string[];
}

function expectedRows(database: Database.Database) {
  const rows = database.prepare("SELECT id,authors,translators FROM book_editions ORDER BY id").all() as Array<{ id: string; authors: unknown; translators: unknown }>;
  const expected: Array<{ editionId: string; displayName: string; role: string; orderIndex: number; creditedAs: null }> = [];
  for (const row of rows) {
    let orderIndex = 0;
    parseCredits(row.authors, row.id, "authors").forEach((displayName) => expected.push({ editionId: row.id, displayName, role: "author", orderIndex: orderIndex++, creditedAs: null }));
    parseCredits(row.translators, row.id, "translators").forEach((displayName) => expected.push({ editionId: row.id, displayName, role: "translator", orderIndex: orderIndex++, creditedAs: null }));
  }
  return expected;
}

function coreSnapshot(database: Database.Database) {
  const ids = (table: string) => (database.prepare("SELECT id FROM " + table + " ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id);
  return { works: ids("works"), editions: ids("book_editions"), copies: ids("owned_copies"), locations: ids("shelf_locations"), loans: ids("loans"), annotations: ids("annotations") };
}

function main() {
  const file = databasePath();
  const database = new Database(file, { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    if (!hasTable(database, "contributors") || !hasTable(database, "edition_contributors")) throw new RollbackRefusal("Contributor schema is missing");
    if (!database.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get(migrationId)) throw new RollbackRefusal("0005 is not recorded");
    const beforeCore = coreSnapshot(database);
    const expected = expectedRows(database);
    const actual = database.prepare("SELECT ec.edition_id,c.display_name,ec.role,ec.order_index,ec.credited_as FROM edition_contributors ec JOIN contributors c ON c.id=ec.contributor_id ORDER BY ec.edition_id,ec.order_index,ec.role,ec.contributor_id").all().map((row) => {
      const value = row as Record<string, unknown>;
      return { editionId: String(value.edition_id), displayName: String(value.display_name), role: String(value.role), orderIndex: Number(value.order_index), creditedAs: value.credited_as ?? null };
    });
    const relationCount = Number((database.prepare("SELECT COUNT(*) AS count FROM edition_contributors").get() as { count: number }).count);
    const contributorCount = Number((database.prepare("SELECT COUNT(*) AS count FROM contributors").get() as { count: number }).count);
    const unreferenced = Number((database.prepare("SELECT COUNT(*) AS count FROM contributors c LEFT JOIN edition_contributors ec ON ec.contributor_id=c.id WHERE ec.contributor_id IS NULL").get() as { count: number }).count);
    if (![...actual.map((row) => row.role)].every((role) => roles.has(role))) throw new RollbackRefusal("Refusing rollback: unsupported role found");
    if (JSON.stringify(actual) !== JSON.stringify(expected) || relationCount !== contributorCount || unreferenced !== 0) throw new RollbackRefusal("Refusing rollback: Contributor data contains edits or additions beyond the legacy backfill");
    const rollback = database.transaction(() => {
      database.exec("DROP INDEX IF EXISTS idx_edition_contributors_contributor");
      database.exec("DROP INDEX IF EXISTS idx_edition_contributors_edition_order");
      database.exec("DROP TABLE edition_contributors");
      database.exec("DROP TABLE contributors");
      database.prepare("DELETE FROM schema_migrations WHERE id=?").run(migrationId);
    });
    rollback();
    if (hasTable(database, "contributors") || hasTable(database, "edition_contributors") || database.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get(migrationId)) throw new RollbackRefusal("Rollback left Contributor schema behind");
    if (JSON.stringify(coreSnapshot(database)) !== JSON.stringify(beforeCore)) throw new RollbackRefusal("Rollback changed core identities");
    const integrity = String(database.pragma("integrity_check", { simple: true }));
    const quickCheck = String(database.pragma("quick_check", { simple: true }));
    const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
    if (integrity !== "ok" || quickCheck !== "ok" || foreignKeyViolations !== 0) throw new RollbackRefusal("Rollback validation failed");
    console.log(JSON.stringify({ status: "rolled_back", migrationId, databaseTarget: "ISOLATED", preservedCore: beforeCore, integrity, quickCheck, foreignKeyViolations, formalDatabaseMutation: false }));
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
