import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const migrationId = "0004_location_model";
const locationColumns = ["location_type", "display_code"];
const loanLocationColumns = ["original_location_id", "original_location_slot", "original_location_coordinate", "original_location_text", "original_location_sort_order", "original_location_captured"];

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

function hasColumn(database: Database.Database, table: string, column: string) {
  return (database.prepare("PRAGMA table_info(" + table + ")").all() as Array<{ name: string }>).some((item) => item.name === column);
}

function count(database: Database.Database, table: string) {
  return Number((database.prepare("SELECT COUNT(*) AS count FROM " + table).get() as { count: number }).count);
}

function locations(database: Database.Database) {
  return database.prepare("SELECT id,name,parent_id,room,user_id,sort_order,active FROM shelf_locations ORDER BY id").all();
}

function copies(database: Database.Database) {
  return database.prepare("SELECT id,edition_id,location,shelf_location_id,shelf_slot,shelf_coordinate,location_sort_order,deleted_at FROM owned_copies ORDER BY id").all();
}

function main() {
  const file = databasePath();
  const database = new Database(file, { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    const history = (database.prepare("SELECT id FROM schema_migrations ORDER BY applied_at,id").all() as Array<{ id: string }>).map((row) => row.id);
    if (!history.includes(migrationId)) throw new RollbackRefusal("0004 is not recorded");
    for (const column of locationColumns) if (!hasColumn(database, "shelf_locations", column)) throw new RollbackRefusal("Location schema is incomplete");
    for (const column of loanLocationColumns) if (!hasColumn(database, "loans", column)) throw new RollbackRefusal("Loan location schema is incomplete");
    const populatedLocations = Number((database.prepare("SELECT COUNT(*) AS count FROM shelf_locations WHERE location_type IS NULL OR location_type <> 'legacy' OR display_code IS NOT NULL").get() as { count: number }).count);
    const populatedLoans = Number((database.prepare("SELECT COUNT(*) AS count FROM loans WHERE original_location_id IS NOT NULL OR original_location_slot IS NOT NULL OR original_location_coordinate IS NOT NULL OR original_location_text IS NOT NULL OR original_location_sort_order IS NOT NULL").get() as { count: number }).count);
    if (populatedLocations !== 0 || populatedLoans !== 0) throw new RollbackRefusal("Refusing rollback: new location types, display codes or loan original-location snapshots contain data");
    const beforeLocations = locations(database);
    const beforeCopies = copies(database);
    const beforeCounts = { locations: count(database, "shelf_locations"), copies: count(database, "owned_copies"), loans: count(database, "loans") };
    const rollback = database.transaction(() => {
      database.exec("DROP INDEX IF EXISTS idx_loans_original_location");
      database.exec("DROP INDEX IF EXISTS idx_owned_copies_location_owner");
      database.exec("DROP INDEX IF EXISTS idx_shelf_locations_parent_order");
    database.exec("ALTER TABLE loans DROP COLUMN original_location_sort_order");
      database.exec("ALTER TABLE loans DROP COLUMN original_location_captured");
      database.exec("ALTER TABLE loans DROP COLUMN original_location_text");
      database.exec("ALTER TABLE loans DROP COLUMN original_location_coordinate");
      database.exec("ALTER TABLE loans DROP COLUMN original_location_slot");
      database.exec("ALTER TABLE loans DROP COLUMN original_location_id");
      database.exec("ALTER TABLE shelf_locations DROP COLUMN display_code");
      database.exec("ALTER TABLE shelf_locations DROP COLUMN location_type");
      database.prepare("DELETE FROM schema_migrations WHERE id=?").run(migrationId);
    });
    rollback();
    const afterLocations = locations(database);
    const afterCopies = copies(database);
    const remainingColumns = [...locationColumns.map((column) => ["shelf_locations", column] as const), ...loanLocationColumns.map((column) => ["loans", column] as const)].filter(([table, column]) => hasColumn(database, table, column));
    const afterCounts = { locations: count(database, "shelf_locations"), copies: count(database, "owned_copies"), loans: count(database, "loans") };
    const integrity = String(database.pragma("integrity_check", { simple: true }));
    const quickCheck = String(database.pragma("quick_check", { simple: true }));
    if (remainingColumns.length || JSON.stringify(beforeLocations) !== JSON.stringify(afterLocations) || JSON.stringify(beforeCopies) !== JSON.stringify(afterCopies) || JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts) || integrity !== "ok" || quickCheck !== "ok") {
      throw new RollbackRefusal("Rollback validation failed");
    }
    console.log(JSON.stringify({ status: "rolled_back", migrationId, databaseTarget: "ISOLATED", preserved: { locations: afterLocations.length, copies: afterCopies.length }, integrity, quickCheck, formalDatabaseMutation: false }));
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
