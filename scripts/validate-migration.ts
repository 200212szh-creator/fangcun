import Database from "better-sqlite3";
import { assertRuntimeSchema, inspectSchema, REQUIRED_RUNTIME_TABLES } from "@/lib/db/schema-truth";
import { runtimePaths } from "@/lib/runtime/paths";

function countTables(database: Database.Database) {
  const existing = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name));
  return Object.fromEntries(REQUIRED_RUNTIME_TABLES.filter((table) => existing.has(table)).map((table) => [
    table,
    Number((database.prepare("SELECT COUNT(*) AS count FROM " + table).get() as { count: number }).count),
  ]));
}

const databaseFile = process.env.FANGCUN_VALIDATION_DATABASE?.trim() || runtimePaths.databaseFile;
let database: Database.Database | undefined;
try {
  database = new Database(databaseFile, { readonly: true, fileMustExist: true });
  const schema = inspectSchema(database);
  const integrity = String(database.pragma("integrity_check", { simple: true }));
  const quickCheck = String(database.pragma("quick_check", { simple: true }));
  const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
  assertRuntimeSchema(database);
  if (integrity !== "ok" || quickCheck !== "ok" || foreignKeyViolations !== 0) {
    throw new Error("database integrity failed: integrity_check=" + integrity + "; quick_check=" + quickCheck + "; foreign_key_violations=" + foreignKeyViolations);
  }
  const counts = countTables(database);
  console.log(JSON.stringify({
    valid: true,
    databaseTarget: process.env.FANGCUN_VALIDATION_TARGET || "UNSPECIFIED_READ_ONLY",
    databaseFile,
    counts: {
      editions: counts.book_editions ?? 0,
      copies: counts.owned_copies ?? 0,
      shelves: counts.shelf_locations ?? 0,
    },
    schema: {
      currentMigrationId: schema.currentMigrationId,
      migrations: schema.migrations,
      workSchemaState: schema.workSchemaState,
    },
    integrity,
    quickCheck,
    foreignKeyViolations,
    formalDatabaseMutation: false,
  }, null, 2));
} catch (error: unknown) {
  console.error(JSON.stringify({
    valid: false,
    databaseFile,
    error: error instanceof Error ? error.message : String(error),
    formalDatabaseMutation: false,
  }, null, 2));
  process.exitCode = 1;
} finally {
  database?.close();
}
