import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const migrationId = "0005_contributors";
const priorMigrationIds = ["0001_archive_fields", "0002_loans_annotations", "0003_works", "0004_location_model"];
const migrationSqlFile = path.resolve(process.cwd(), "migrations", "0005_contributors.up.sql");
const requiredContributorColumns = {
  contributors: ["id", "display_name", "sort_name", "normalized_name", "active", "created_at", "updated_at"],
  edition_contributors: ["edition_id", "contributor_id", "role", "order_index", "credited_as"],
};

class MigrationRefusal extends Error {}

type LegacyEdition = { id: string; authors: unknown; translators: unknown };
type BackfillRow = { editionId: string; displayName: string; role: "author" | "translator"; orderIndex: number };

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

function migrationHistory(database: Database.Database) {
  return (database.prepare("SELECT id FROM schema_migrations ORDER BY applied_at,id").all() as Array<{ id: string }>).map((row) => row.id);
}

function parseLegacyCredits(value: unknown, editionId: string, field: string) {
  if (value === null || value === undefined || value === "") return [] as string[];
  let parsed: unknown;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch { throw new MigrationRefusal("Cannot parse " + field + " for Edition " + editionId); }
  if (!Array.isArray(parsed)) throw new MigrationRefusal(field + " for Edition " + editionId + " is not an array");
  const values: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string" || !item.trim()) throw new MigrationRefusal(field + " for Edition " + editionId + " contains an invalid credit");
    values.push(item);
  }
  return values;
}

function backfillPlan(database: Database.Database) {
  const editions = database.prepare("SELECT id,authors,translators FROM book_editions ORDER BY id").all() as LegacyEdition[];
  const plan: BackfillRow[] = [];
  for (const edition of editions) {
    let orderIndex = 0;
    parseLegacyCredits(edition.authors, edition.id, "authors").forEach((displayName) => plan.push({ editionId: edition.id, displayName, role: "author", orderIndex: orderIndex++ }));
    parseLegacyCredits(edition.translators, edition.id, "translators").forEach((displayName) => plan.push({ editionId: edition.id, displayName, role: "translator", orderIndex: orderIndex++ }));
  }
  return plan;
}

function coreSnapshot(database: Database.Database) {
  const ids = (table: string) => (database.prepare("SELECT id FROM " + table + " ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id);
  const count = (table: string) => Number((database.prepare("SELECT COUNT(*) AS count FROM " + table).get() as { count: number }).count);
  return {
    works: ids("works"),
    editions: ids("book_editions"),
    copies: ids("owned_copies"),
    locations: ids("shelf_locations"),
    loans: ids("loans"),
    annotations: ids("annotations"),
    counts: { works: count("works"), editions: count("book_editions"), copies: count("owned_copies"), locations: count("shelf_locations"), loans: count("loans"), annotations: count("annotations") },
  };
}

function contributorSchemaComplete(database: Database.Database) {
  return Object.entries(requiredContributorColumns).every(([table, columns]) => hasTable(database, table) && columns.every((column) => hasColumn(database, table, column)));
}

function relationRows(database: Database.Database) {
  return database.prepare("SELECT ec.edition_id,c.display_name,ec.role,ec.order_index,ec.credited_as FROM edition_contributors ec JOIN contributors c ON c.id=ec.contributor_id ORDER BY ec.edition_id,ec.order_index,ec.role,ec.contributor_id").all() as Array<Record<string, unknown>>;
}

function validateApplied(database: Database.Database, expectedPlan?: BackfillRow[], beforeCore?: ReturnType<typeof coreSnapshot>) {
  if (!contributorSchemaComplete(database)) throw new MigrationRefusal("Contributor schema is incomplete");
  const invalidRoles = Number((database.prepare("SELECT COUNT(*) AS count FROM edition_contributors WHERE role NOT IN ('author','translator','editor','compiler','illustrator','other')").get() as { count: number }).count);
  const invalidOrder = Number((database.prepare("SELECT COUNT(*) AS count FROM edition_contributors WHERE order_index < 0").get() as { count: number }).count);
  const orphanEditions = Number((database.prepare("SELECT COUNT(*) AS count FROM edition_contributors ec LEFT JOIN book_editions e ON e.id=ec.edition_id WHERE e.id IS NULL").get() as { count: number }).count);
  const orphanContributors = Number((database.prepare("SELECT COUNT(*) AS count FROM edition_contributors ec LEFT JOIN contributors c ON c.id=ec.contributor_id WHERE c.id IS NULL").get() as { count: number }).count);
  const unreferencedContributors = Number((database.prepare("SELECT COUNT(*) AS count FROM contributors c LEFT JOIN edition_contributors ec ON ec.contributor_id=c.id WHERE ec.contributor_id IS NULL").get() as { count: number }).count);
  const integrity = String(database.pragma("integrity_check", { simple: true }));
  const quickCheck = String(database.pragma("quick_check", { simple: true }));
  const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
  const history = migrationHistory(database);
  if (invalidRoles || invalidOrder || orphanEditions || orphanContributors || integrity !== "ok" || quickCheck !== "ok" || foreignKeyViolations !== 0 || !history.includes(migrationId)) {
    throw new MigrationRefusal("Contributor validation failed: invalidRoles=" + invalidRoles + "; invalidOrder=" + invalidOrder + "; orphanEditions=" + orphanEditions + "; orphanContributors=" + orphanContributors + "; integrity=" + integrity + "; quickCheck=" + quickCheck + "; foreignKeyViolations=" + foreignKeyViolations + "; history=" + history.join(","));
  }
  if (expectedPlan) {
    const actual = relationRows(database).map((row) => ({ editionId: String(row.edition_id), displayName: String(row.display_name), role: String(row.role), orderIndex: Number(row.order_index), creditedAs: row.credited_as ?? null }));
    const expected = expectedPlan.map((row) => ({ editionId: row.editionId, displayName: row.displayName, role: row.role, orderIndex: row.orderIndex, creditedAs: null }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new MigrationRefusal("Contributor backfill does not match the conservative legacy plan");
    if (unreferencedContributors !== 0 || actual.length !== expected.length) throw new MigrationRefusal("Contributor backfill left unexpected entities or relations");
  }
  if (beforeCore && JSON.stringify(coreSnapshot(database)) !== JSON.stringify(beforeCore)) throw new MigrationRefusal("Contributor migration changed Work/Edition/Copy/Location/Loan/Annotation identities or counts");
  return { integrity, quickCheck, foreignKeyViolations, history, invalidRoles, invalidOrder, orphanEditions, orphanContributors, unreferencedContributors, contributors: Number((database.prepare("SELECT COUNT(*) AS count FROM contributors").get() as { count: number }).count), relations: Number((database.prepare("SELECT COUNT(*) AS count FROM edition_contributors").get() as { count: number }).count) };
}

function main() {
  const file = databasePath();
  const dryRun = process.argv.includes("--dry-run");
  const database = new Database(file, { fileMustExist: true, readonly: dryRun });
  try {
    database.pragma("foreign_keys = ON");
    for (const table of ["schema_migrations", "works", "book_editions", "owned_copies", "shelf_locations", "loans", "annotations"]) {
      if (!hasTable(database, table)) throw new MigrationRefusal("0005 prerequisite table is missing: " + table);
    }
    const history = migrationHistory(database);
    for (const prior of priorMigrationIds) if (!history.includes(prior)) throw new MigrationRefusal("0005 requires migration " + prior);
    const alreadyApplied = history.includes(migrationId);
    const sqlSha256 = crypto.createHash("sha256").update(fs.readFileSync(migrationSqlFile)).digest("hex");
    if (alreadyApplied) {
      const validation = validateApplied(database);
      console.log(JSON.stringify({ status: "already_applied", migrationId, databaseTarget: "ISOLATED", sqlSha256, validation, formalDatabaseMutation: false }));
      return;
    }
    const contributorTables = Object.keys(requiredContributorColumns);
    if (contributorTables.some((table) => hasTable(database, table) || requiredContributorColumns[table as keyof typeof requiredContributorColumns].some((column) => hasColumn(database, table, column)))) {
      throw new MigrationRefusal("Refusing 0005: partial Contributor schema exists without recorded migration");
    }
    const beforeCore = coreSnapshot(database);
    const plan = backfillPlan(database);
    const beforeIntegrity = String(database.pragma("integrity_check", { simple: true }));
    const beforeQuickCheck = String(database.pragma("quick_check", { simple: true }));
    const beforeForeignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
    if (beforeIntegrity !== "ok" || beforeQuickCheck !== "ok" || beforeForeignKeyViolations !== 0) throw new MigrationRefusal("0005 dry-run/apply precondition integrity failed");
    if (dryRun) {
      console.log(JSON.stringify({ status: "dry_run", migrationId, databaseTarget: "ISOLATED", sqlSha256, beforeCore, expectedChanges: { contributors: plan.length, editionContributors: plan.length, indexes: 2, recordMigration: true }, integrity: beforeIntegrity, quickCheck: beforeQuickCheck, foreignKeyViolations: beforeForeignKeyViolations, formalDatabaseMutation: false }));
      return;
    }
    const timestamp = new Date().toISOString();
    const apply = database.transaction(() => {
      database.exec("CREATE TABLE contributors (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, sort_name TEXT, normalized_name TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
      database.exec("CREATE TABLE edition_contributors (edition_id TEXT NOT NULL REFERENCES book_editions(id) ON DELETE CASCADE, contributor_id TEXT NOT NULL REFERENCES contributors(id) ON DELETE RESTRICT, role TEXT NOT NULL CHECK (role IN ('author', 'translator', 'editor', 'compiler', 'illustrator', 'other')), order_index INTEGER NOT NULL CHECK (order_index >= 0), credited_as TEXT, PRIMARY KEY (edition_id, contributor_id, role, order_index))");
      database.exec("CREATE INDEX idx_edition_contributors_edition_order ON edition_contributors(edition_id, order_index, role, contributor_id)");
      database.exec("CREATE INDEX idx_edition_contributors_contributor ON edition_contributors(contributor_id, role)");
      const insertContributor = database.prepare("INSERT INTO contributors (id,display_name,sort_name,normalized_name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)");
      const insertRelation = database.prepare("INSERT INTO edition_contributors (edition_id,contributor_id,role,order_index,credited_as) VALUES (?,?,?,?,?)");
      for (const row of plan) {
        const contributorId = crypto.randomUUID();
        insertContributor.run(contributorId, row.displayName, null, null, 1, timestamp, timestamp);
        insertRelation.run(row.editionId, contributorId, row.role, row.orderIndex, null);
      }
      database.prepare("INSERT INTO schema_migrations (id,applied_at) VALUES (?,?)").run(migrationId, timestamp);
      return validateApplied(database, plan, beforeCore);
    });
    const validation = apply();
    console.log(JSON.stringify({ status: "applied", migrationId, databaseTarget: "ISOLATED", sqlSha256, beforeCore, expectedBackfillRows: plan.length, after: validation, formalDatabaseMutation: false }));
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
