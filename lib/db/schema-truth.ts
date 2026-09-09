import type Database from "better-sqlite3";

export const LEGACY_MIGRATION_IDS = ["0001_archive_fields", "0002_loans_annotations"] as const;
export const WORK_MIGRATION_ID = "0003_works";
export const LOCATION_MIGRATION_ID = "0004_location_model";
export const KNOWN_MIGRATION_IDS = [...LEGACY_MIGRATION_IDS, WORK_MIGRATION_ID, LOCATION_MIGRATION_ID] as const;
export const LOCATION_MODEL_COLUMNS: Record<string, string[]> = {
  shelf_locations: ["location_type", "display_code"],
  loans: ["original_location_id", "original_location_slot", "original_location_coordinate", "original_location_text", "original_location_sort_order", "original_location_captured"],
};

export const REQUIRED_RUNTIME_TABLES = [
  "schema_migrations", "book_editions", "owned_copies", "categories", "tags", "copy_tags",
  "shelf_locations", "wishlist_items", "research_works", "research_folders", "folder_works",
  "external_references", "search_cache", "loans", "concepts", "annotations", "annotation_concepts",
] as const;

export const REQUIRED_RUNTIME_COLUMNS: Record<string, string[]> = {
  book_editions: [
    "id", "title", "authors", "translators", "publisher", "publication_year", "edition",
    "original_title", "series_name", "edition_statement", "edition_number", "print_run",
    "publication_date", "edition_notes", "original_publisher", "format", "language",
    "isbn10", "isbn13", "pages", "description", "cover_url", "subjects", "source",
    "external_id", "user_override",
  ],
  owned_copies: [
    "id", "user_id", "edition_id", "location", "category_id", "reading_status", "rating",
    "notes", "acquired_at", "created_at", "updated_at", "deleted_at", "acquisition_method",
    "acquisition_source", "acquisition_place", "price_cents", "currency", "condition",
    "inscription", "receipt_note", "shelf_location_id", "shelf_slot", "shelf_coordinate",
    "location_sort_order",
  ],
  shelf_locations: ["id", "name", "parent_id", "room", "user_id", "sort_order", "active"],
  loans: ["id", "copy_id", "borrower_name", "borrower_contact", "lent_at", "due_at", "returned_at", "status", "note"],
  annotations: ["id", "copy_id", "page_label", "body", "created_at", "updated_at"],
};

export const REQUIRED_WORK_COLUMNS = ["id", "title", "original_title", "description", "created_at", "updated_at"];

export class SchemaTruthError extends Error {
  constructor(
    public readonly code: "SCHEMA_MIGRATION_REQUIRED" | "UNKNOWN_MIGRATION" | "INCOMPLETE_WORK_SCHEMA" | "INCOMPLETE_LOCATION_SCHEMA",
    message: string,
  ) {
    super(message);
    this.name = "SchemaTruthError";
  }
}

export type MigrationRecord = { id: string; appliedAt: string };

export type SchemaInspection = {
  tables: string[];
  missingRuntimeTables: string[];
  missingRuntimeColumns: Record<string, string[]>;
  migrations: MigrationRecord[];
  missingRequiredMigrations: string[];
  unknownMigrations: string[];
  currentMigrationId: string | null;
  hasWorkTable: boolean;
  hasWorkIdColumn: boolean;
  workMigrationRecorded: boolean;
  missingWorkColumns: string[];
  workSchemaState: "absent" | "ready" | "partial" | "present-unrecorded" | "recorded-without-schema";
  locationMigrationRecorded: boolean;
  missingLocationColumns: Record<string, string[]>;
  locationSchemaState: "absent" | "ready" | "partial" | "present-unrecorded" | "recorded-without-schema";
};

export function hasTable(database: Database.Database, tableName: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName));
}

export function hasColumn(database: Database.Database, tableName: string, columnName: string) {
  return (database.prepare("PRAGMA table_info(" + tableName + ")").all() as Array<{ name: string }>).some((column) => column.name === columnName);
}

export function readMigrationHistory(database: Database.Database): MigrationRecord[] {
  if (!hasTable(database, "schema_migrations")) return [];
  return (database.prepare("SELECT id, applied_at FROM schema_migrations ORDER BY applied_at, id").all() as Array<{ id: string; applied_at: string }>).map((row) => ({
    id: row.id,
    appliedAt: row.applied_at,
  }));
}

export function inspectSchema(database: Database.Database): SchemaInspection {
  const tables = (database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
  const tableSet = new Set(tables);
  const migrations = readMigrationHistory(database);
  const migrationIds = new Set(migrations.map((migration) => migration.id));
  const missingRuntimeTables = REQUIRED_RUNTIME_TABLES.filter((table) => !tableSet.has(table));
  const missingRuntimeColumns = Object.fromEntries(
    Object.entries(REQUIRED_RUNTIME_COLUMNS)
      .map(([table, columns]) => [table, columns.filter((column) => !hasColumn(database, table, column))])
      .filter(([, missing]) => missing.length > 0),
  );
  const missingRequiredMigrations = LEGACY_MIGRATION_IDS.filter((id) => !migrationIds.has(id));
  const unknownMigrations = migrations.map((migration) => migration.id).filter((id) => !(KNOWN_MIGRATION_IDS as readonly string[]).includes(id));
  const currentMigrationId = [...KNOWN_MIGRATION_IDS].reverse().find((id) => migrationIds.has(id)) ?? null;
  const hasWorkTable = tableSet.has("works");
  const hasWorkIdColumn = hasColumn(database, "book_editions", "work_id");
  const workMigrationRecorded = migrationIds.has(WORK_MIGRATION_ID);
  const missingWorkColumns = hasWorkTable ? REQUIRED_WORK_COLUMNS.filter((column) => !hasColumn(database, "works", column)) : [];

  let workSchemaState: SchemaInspection["workSchemaState"] = "absent";
  if (hasWorkTable !== hasWorkIdColumn || (hasWorkTable && missingWorkColumns.length > 0)) {
    workSchemaState = "partial";
  } else if (hasWorkTable && hasWorkIdColumn && !workMigrationRecorded) {
    workSchemaState = "present-unrecorded";
  } else if (!hasWorkTable && !hasWorkIdColumn && workMigrationRecorded) {
    workSchemaState = "recorded-without-schema";
  } else if (hasWorkTable && hasWorkIdColumn) {
    workSchemaState = "ready";
  }
  const missingLocationColumns = Object.fromEntries(
    Object.entries(LOCATION_MODEL_COLUMNS)
      .map(([table, columns]) => [table, columns.filter((column) => !hasColumn(database, table, column))])
      .filter(([, missing]) => missing.length > 0),
  );
  const locationMigrationRecorded = migrationIds.has(LOCATION_MIGRATION_ID);
  const locationColumnCount = Object.values(LOCATION_MODEL_COLUMNS).flat().length;
  const locationPresentCount = locationColumnCount - Object.values(missingLocationColumns).flat().length;
  let locationSchemaState: SchemaInspection["locationSchemaState"] = "absent";
  if (locationPresentCount > 0 && locationPresentCount < locationColumnCount) {
    locationSchemaState = "partial";
  } else if (locationPresentCount === locationColumnCount && !locationMigrationRecorded) {
    locationSchemaState = "present-unrecorded";
  } else if (locationPresentCount === 0 && locationMigrationRecorded) {
    locationSchemaState = "recorded-without-schema";
  } else if (locationPresentCount === locationColumnCount) {
    locationSchemaState = "ready";
  }

  return {
    tables,
    missingRuntimeTables,
    missingRuntimeColumns,
    migrations,
    missingRequiredMigrations,
    unknownMigrations,
    currentMigrationId,
    hasWorkTable,
    hasWorkIdColumn,
    workMigrationRecorded,
    missingWorkColumns,
    workSchemaState,
    locationMigrationRecorded,
    missingLocationColumns,
    locationSchemaState,
  };
}

export function assertRuntimeSchema(database: Database.Database) {
  const inspection = inspectSchema(database);
  if (inspection.missingRuntimeTables.length || Object.keys(inspection.missingRuntimeColumns).length || inspection.missingRequiredMigrations.length) {
    throw new SchemaTruthError(
      "SCHEMA_MIGRATION_REQUIRED",
      "Database schema is not ready; missing tables=" + (inspection.missingRuntimeTables.join(",") || "none") + ", missing migrations=" + (inspection.missingRequiredMigrations.join(",") || "none"),
    );
  }
  if (inspection.unknownMigrations.length) {
    throw new SchemaTruthError("UNKNOWN_MIGRATION", "Database contains unknown migration history: " + inspection.unknownMigrations.join(","));
  }
  if (inspection.workSchemaState === "partial" || inspection.workSchemaState === "present-unrecorded" || inspection.workSchemaState === "recorded-without-schema") {
    throw new SchemaTruthError("INCOMPLETE_WORK_SCHEMA", "Work schema state is " + inspection.workSchemaState);
  }
  if (inspection.locationSchemaState === "partial" || inspection.locationSchemaState === "present-unrecorded" || inspection.locationSchemaState === "recorded-without-schema") {
    throw new SchemaTruthError("INCOMPLETE_LOCATION_SCHEMA", "Location schema state is " + inspection.locationSchemaState);
  }
  return inspection;
}

export function assertMigrationRecorded(database: Database.Database, migrationId: string) {
  if (!readMigrationHistory(database).some((migration) => migration.id === migrationId)) {
    throw new SchemaTruthError("SCHEMA_MIGRATION_REQUIRED", "Required migration is not recorded: " + migrationId);
  }
}
