import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const migrationId = "0004_location_model";
const priorMigrationIds = ["0001_archive_fields", "0002_loans_annotations", "0003_works"];
const locationColumns = ["location_type", "display_code"];
const loanLocationColumns = ["original_location_id", "original_location_slot", "original_location_coordinate", "original_location_text", "original_location_sort_order", "original_location_captured"];
const sqlFile = path.resolve(process.cwd(), "migrations", "0004_location_model.up.sql");

class MigrationRefusal extends Error {}

function databasePath() {
  if (process.env.FANGCUN_MIGRATION_TARGET !== "ISOLATED") throw new MigrationRefusal("Refusing migration: FANGCUN_MIGRATION_TARGET must be ISOLATED");
  const value = process.env.FANGCUN_MIGRATION_DATABASE;
  if (!value || !path.isAbsolute(value)) throw new MigrationRefusal("Refusing migration: FANGCUN_MIGRATION_DATABASE must be an explicit absolute path");
  const normalized = path.normalize(value);
  const relative = path.relative(path.resolve(os.tmpdir()), normalized);
  if (relative === "" || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new MigrationRefusal("Refusing migration: isolated database must be inside the temporary directory");
  if (!fs.existsSync(normalized)) throw new MigrationRefusal("Refusing migration: isolated database does not exist: " + normalized);
  return normalized;
}

function hasTable(database: Database.Database, table: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function hasColumn(database: Database.Database, table: string, column: string) {
  return (database.prepare("PRAGMA table_info(" + table + ")").all() as Array<{ name: string }>).some((item) => item.name === column);
}

function allColumns() {
  return [...locationColumns.map((column) => ["shelf_locations", column] as const), ...loanLocationColumns.map((column) => ["loans", column] as const)];
}

function count(database: Database.Database, table: string) {
  return Number((database.prepare("SELECT COUNT(*) AS count FROM " + table).get() as { count: number }).count);
}

function counts(database: Database.Database) {
  return {
    works: count(database, "works"),
    editions: count(database, "book_editions"),
    copies: count(database, "owned_copies"),
    activeCopies: Number((database.prepare("SELECT COUNT(*) AS count FROM owned_copies WHERE deleted_at IS NULL").get() as { count: number }).count),
    locations: count(database, "shelf_locations"),
    loans: count(database, "loans"),
    annotations: count(database, "annotations"),
  };
}

function legacyRows(database: Database.Database) {
  return database.prepare("SELECT id,name,parent_id,room,user_id,sort_order,active FROM shelf_locations ORDER BY id").all();
}

function copyRows(database: Database.Database) {
  return database.prepare("SELECT id,edition_id,location,shelf_location_id,shelf_slot,shelf_coordinate,location_sort_order,deleted_at FROM owned_copies ORDER BY id").all();
}

function migrationHistory(database: Database.Database) {
  return (database.prepare("SELECT id FROM schema_migrations ORDER BY applied_at,id").all() as Array<{ id: string }>).map((row) => row.id);
}

function validateDatabase(database: Database.Database, beforeCounts?: ReturnType<typeof counts>, beforeLocations?: unknown[], beforeCopies?: unknown[]) {
  for (const [table, column] of allColumns()) if (!hasColumn(database, table, column)) throw new MigrationRefusal("Location schema is incomplete: " + table + "." + column);
  const invalidTypes = Number((database.prepare("SELECT COUNT(*) AS count FROM shelf_locations WHERE location_type IS NULL OR location_type NOT IN ('legacy','room','zone','shelf','level','slot')").get() as { count: number }).count);
  const orphanParents = Number((database.prepare("SELECT COUNT(*) AS count FROM shelf_locations child LEFT JOIN shelf_locations parent ON parent.id=child.parent_id AND parent.user_id=child.user_id WHERE child.parent_id IS NOT NULL AND parent.id IS NULL").get() as { count: number }).count);
  const orphanCopies = Number((database.prepare("SELECT COUNT(*) AS count FROM owned_copies copy LEFT JOIN shelf_locations location ON location.id=copy.shelf_location_id AND location.user_id=copy.user_id WHERE copy.shelf_location_id IS NOT NULL AND location.id IS NULL").get() as { count: number }).count);
  const integrity = String(database.pragma("integrity_check", { simple: true }));
  const quickCheck = String(database.pragma("quick_check", { simple: true }));
  const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
  const history = migrationHistory(database);
  const actualCounts = counts(database);
  if (invalidTypes !== 0 || orphanParents !== 0 || orphanCopies !== 0 || integrity !== "ok" || quickCheck !== "ok" || foreignKeyViolations !== 0 || !history.includes(migrationId)) {
    throw new MigrationRefusal("Location validation failed: invalidTypes=" + invalidTypes + "; orphanParents=" + orphanParents + "; orphanCopies=" + orphanCopies + "; integrity=" + integrity + "; quickCheck=" + quickCheck + "; foreignKeyViolations=" + foreignKeyViolations + "; history=" + history.join(","));
  }
  if (beforeCounts && JSON.stringify(actualCounts) !== JSON.stringify(beforeCounts)) throw new MigrationRefusal("Location migration changed legacy table counts");
  if (beforeLocations && JSON.stringify(legacyRows(database)) !== JSON.stringify(beforeLocations)) throw new MigrationRefusal("Location migration changed legacy shelf rows");
  if (beforeCopies && JSON.stringify(copyRows(database)) !== JSON.stringify(beforeCopies)) throw new MigrationRefusal("Location migration changed owned copy location rows");
  return { counts: actualCounts, integrity, quickCheck, foreignKeyViolations, history, invalidTypes, orphanParents, orphanCopies };
}

function main() {
  const file = databasePath();
  const database = new Database(file, { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    for (const table of ["schema_migrations", "works", "book_editions", "owned_copies", "shelf_locations", "loans", "annotations"]) {
      if (!hasTable(database, table)) throw new MigrationRefusal("0004 prerequisite table is missing: " + table);
    }
    const history = migrationHistory(database);
    for (const prior of priorMigrationIds) if (!history.includes(prior)) throw new MigrationRefusal("0004 requires migration " + prior);
    const alreadyApplied = history.includes(migrationId);
    const present = allColumns().filter(([table, column]) => hasColumn(database, table, column));
    if (alreadyApplied) {
      if (present.length !== allColumns().length) throw new MigrationRefusal("0004 is recorded but its schema is incomplete");
      const validation = validateDatabase(database);
      console.log(JSON.stringify({ status: "already_applied", migrationId, databaseTarget: "ISOLATED", sqlSha256: crypto.createHash("sha256").update(fs.readFileSync(sqlFile)).digest("hex"), validation }));
      return;
    }
    if (present.length !== 0) throw new MigrationRefusal("Refusing 0004: partial location schema exists without recorded migration");
    const beforeCounts = counts(database);
    const beforeLocations = legacyRows(database);
    const beforeCopies = copyRows(database);
    const sqlSha256 = crypto.createHash("sha256").update(fs.readFileSync(sqlFile)).digest("hex");
    if (process.argv.includes("--dry-run")) {
      const integrity = String(database.pragma("integrity_check", { simple: true }));
      const quickCheck = String(database.pragma("quick_check", { simple: true }));
      const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
      if (integrity !== "ok" || quickCheck !== "ok" || foreignKeyViolations !== 0) {
        throw new MigrationRefusal("0004 dry-run validation failed: integrity=" + integrity + "; quickCheck=" + quickCheck + "; foreignKeyViolations=" + foreignKeyViolations);
      }
      console.log(JSON.stringify({ status: "dry_run", migrationId, databaseTarget: "ISOLATED", sqlSha256, before: { counts: beforeCounts, locations: beforeLocations.length, copies: beforeCopies.length }, expectedChanges: { addLocationColumns: locationColumns.length, addLoanLocationColumns: loanLocationColumns.length, addIndexes: 3, recordMigration: true }, integrity, quickCheck, foreignKeyViolations, formalDatabaseMutation: false }));
      return;
    }
    const apply = database.transaction(() => {
      database.exec("ALTER TABLE shelf_locations ADD COLUMN location_type TEXT NOT NULL DEFAULT 'legacy'");
      database.exec("ALTER TABLE shelf_locations ADD COLUMN display_code TEXT");
      database.exec("ALTER TABLE loans ADD COLUMN original_location_id TEXT");
      database.exec("ALTER TABLE loans ADD COLUMN original_location_slot TEXT");
      database.exec("ALTER TABLE loans ADD COLUMN original_location_coordinate TEXT");
      database.exec("ALTER TABLE loans ADD COLUMN original_location_text TEXT");
      database.exec("ALTER TABLE loans ADD COLUMN original_location_sort_order INTEGER");
      database.exec("ALTER TABLE loans ADD COLUMN original_location_captured INTEGER NOT NULL DEFAULT 0");
      database.exec("CREATE INDEX IF NOT EXISTS idx_shelf_locations_parent_order ON shelf_locations(user_id,parent_id,active,sort_order,name,id)");
      database.exec("CREATE INDEX IF NOT EXISTS idx_owned_copies_location_owner ON owned_copies(shelf_location_id,user_id,deleted_at)");
      database.exec("CREATE INDEX IF NOT EXISTS idx_loans_original_location ON loans(original_location_id)");
      database.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, new Date().toISOString());
      return validateDatabase(database, beforeCounts, beforeLocations, beforeCopies);
    });
    const validation = apply();
    console.log(JSON.stringify({ status: "applied", migrationId, databaseTarget: "ISOLATED", sqlSha256, before: { counts: beforeCounts, locations: beforeLocations.length, copies: beforeCopies.length }, after: validation, formalDatabaseMutation: false }));
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
