import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { inspectSchema, type SchemaInspection } from "@/lib/db/schema-truth";

const migrationId = "0005_contributors";
const expectedHistory = ["0001_archive_fields", "0002_loans_annotations", "0003_works", "0004_location_model"] as const;
const migrationSqlFile = path.resolve(process.cwd(), "migrations", "0005_contributors.up.sql");
const verifiedMigrationSqlSha256 = "693d8aa18563b998bfed57c3b5f49ab0e7f305372db742a43dae2d4b55616b83";
const approvalToken = "EXECUTE_0005_CONTRIBUTORS";
const formalDatabasePath = path.normalize("D:\\方寸数据\\data\\library.db");
const formalBackupRoot = path.normalize("D:\\方寸数据\\backups\\pre-upgrade");
const countTables = { works: "works", editions: "book_editions", copies: "owned_copies", activeCopies: "owned_copies", locations: "shelf_locations", loans: "loans", annotations: "annotations" } as const;
const baselineKeys = Object.keys(countTables) as Array<keyof typeof countTables>;
const contributorRoles = ["author", "translator", "editor", "compiler", "illustrator", "other"] as const;

type Target = "FORMAL" | "ISOLATED";
type Mode = "PRECHECK" | "DRY-RUN" | "EXECUTE";
type Baseline = Record<keyof typeof countTables, number>;
type Check = { status: "PASS" | "FAIL"; evidence: string };
type LegacyRow = Record<string, unknown>;
type BackfillRow = { editionId: string; displayName: string; role: "author" | "translator"; orderIndex: number };
type RunnerArgs = { mode: Mode; target: Target; database: string; backup: string; backupSha256: string; sqlSha256: string; baseline: Baseline; service: "stopped" | "isolated"; approval: string; maxAgeHours: number };
type DatabaseInfo = { schema: SchemaInspection; counts: Baseline; integrity: string; quickCheck: string; foreignKeyViolations: number; core: ReturnType<typeof coreSnapshot>; legacy: ReturnType<typeof legacySnapshot> };

class RunnerRefusal extends Error {}

function argument(name: string) {
  const prefix = "--" + name + "=";
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

function samePath(left: string, right: string) {
  return path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase();
}

function within(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function absolutePath(name: string, value: string | undefined) {
  if (!value || !path.isAbsolute(value)) throw new RunnerRefusal(name + " must be an explicit absolute path");
  return path.normalize(value);
}

function normalizeHash(value: string | undefined, name: string) {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new RunnerRefusal(name + " must be a 64-character SHA-256 value");
  return value.toLowerCase();
}

function parseBaseline(value: string | undefined): Baseline {
  if (!value) throw new RunnerRefusal("--baseline is required and must list works,editions,copies,activeCopies,locations,loans,annotations");
  const parsed: Partial<Baseline> = {};
  for (const item of value.split(",")) {
    const [rawKey, rawValue, ...extra] = item.split("=");
    const key = rawKey as keyof typeof countTables;
    const count = Number(rawValue);
    if (!baselineKeys.includes(key) || extra.length > 0 || !Number.isInteger(count) || count < 0) throw new RunnerRefusal("invalid baseline entry: " + item);
    parsed[key] = count;
  }
  if (baselineKeys.some((key) => parsed[key] === undefined)) throw new RunnerRefusal("--baseline must include every required count");
  return parsed as Baseline;
}

function parseArgs(): RunnerArgs {
  if (process.argv.length <= 2) throw new RunnerRefusal("REFUSE: explicit --mode, --target, database, backup, hashes, baseline, service and approval are required");
  const modeValue = argument("mode")?.toUpperCase();
  if (modeValue !== "PRECHECK" && modeValue !== "DRY-RUN" && modeValue !== "EXECUTE") throw new RunnerRefusal("--mode must be PRECHECK, DRY-RUN or EXECUTE");
  const targetValue = argument("target")?.toUpperCase();
  if (targetValue !== "FORMAL" && targetValue !== "ISOLATED") throw new RunnerRefusal("--target must be explicit FORMAL or ISOLATED");
  const target = targetValue as Target;
  const database = absolutePath("--database", argument("database"));
  const backup = absolutePath("--backup", argument("backup"));
  if (samePath(database, backup)) throw new RunnerRefusal("database and backup must be different files");
  if (!fs.existsSync(database)) throw new RunnerRefusal("database does not exist: " + database);
  if (!fs.existsSync(backup)) throw new RunnerRefusal("backup does not exist: " + backup);
  if (target === "FORMAL") {
    if (!samePath(database, formalDatabasePath)) throw new RunnerRefusal("FORMAL database path must be exactly " + formalDatabasePath);
    if (!within(formalBackupRoot, backup)) throw new RunnerRefusal("FORMAL backup must be inside " + formalBackupRoot);
    if (within(os.tmpdir(), database)) throw new RunnerRefusal("FORMAL database cannot be inside the temporary directory");
  }
  if (target === "ISOLATED" && (!within(os.tmpdir(), database) || !within(os.tmpdir(), backup))) throw new RunnerRefusal("ISOLATED database and backup must both be inside the temporary directory");
  const serviceValue = argument("service")?.toLowerCase();
  const expectedService = target === "FORMAL" ? "stopped" : "isolated";
  if (serviceValue !== expectedService) throw new RunnerRefusal("service attestation must be --service=" + expectedService);
  const approval = argument("approval");
  if (approval !== approvalToken) throw new RunnerRefusal("approval must be --approval=" + approvalToken);
  const maxAgeHours = Number(argument("max-age-hours") || "168");
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new RunnerRefusal("--max-age-hours must be a positive number");
  const testHook = process.env.FANGCUN_CONTRIBUTOR_RUNNER_TEST_HOOK;
  if (testHook && process.env.NODE_ENV !== "test") throw new RunnerRefusal("test hooks are only accepted when NODE_ENV=test");
  if (testHook && testHook !== "active-writer" && testHook !== "post-validation-failure") throw new RunnerRefusal("unknown contributor runner test hook: " + testHook);
  return { mode: modeValue as Mode, target, database, backup, backupSha256: normalizeHash(argument("backup-sha256"), "--backup-sha256"), sqlSha256: normalizeHash(argument("sql-sha256"), "--sql-sha256"), baseline: parseBaseline(argument("baseline")), service: expectedService, approval: approval as string, maxAgeHours };
}

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function canonicalSql(file: string) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256Text(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hasTable(database: Database.Database, table: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function count(database: Database.Database, table: string, predicate = "") {
  if (!hasTable(database, table)) return -1;
  return Number((database.prepare("SELECT COUNT(*) AS count FROM " + table + predicate).get() as { count: number }).count);
}

function snapshotCounts(database: Database.Database): Baseline {
  return { works: count(database, countTables.works), editions: count(database, countTables.editions), copies: count(database, countTables.copies), activeCopies: count(database, countTables.activeCopies, " WHERE deleted_at IS NULL"), locations: count(database, countTables.locations), loans: count(database, countTables.loans), annotations: count(database, countTables.annotations) };
}

function coreSnapshot(database: Database.Database) {
  const ids = (table: string) => (database.prepare("SELECT id FROM " + table + " ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id);
  return { ids: { works: ids("works"), editions: ids("book_editions"), copies: ids("owned_copies"), locations: ids("shelf_locations"), loans: ids("loans"), annotations: ids("annotations") }, counts: snapshotCounts(database) };
}

function legacySnapshot(database: Database.Database) {
  return {
    editions: database.prepare("SELECT id,authors,translators FROM book_editions ORDER BY id").all() as LegacyRow[],
    copies: database.prepare("SELECT id,edition_id,location,shelf_location_id,shelf_slot,shelf_coordinate,location_sort_order,deleted_at FROM owned_copies ORDER BY id").all() as LegacyRow[],
    locations: database.prepare("SELECT id,name,parent_id,room,user_id,sort_order,active FROM shelf_locations ORDER BY id").all() as LegacyRow[],
  };
}

function inspectOpenDatabase(database: Database.Database): DatabaseInfo {
  return { schema: inspectSchema(database), counts: snapshotCounts(database), integrity: String(database.pragma("integrity_check", { simple: true })), quickCheck: String(database.pragma("quick_check", { simple: true })), foreignKeyViolations: database.prepare("PRAGMA foreign_key_check").all().length, core: coreSnapshot(database), legacy: legacySnapshot(database) };
}

function inspectDatabase(file: string, readonly = true): DatabaseInfo {
  const database = new Database(file, { readonly, fileMustExist: true });
  try { return inspectOpenDatabase(database); } finally { database.close(); }
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function checkCounts(actual: Baseline, expected: Baseline, label: string): Check {
  const drift = baselineKeys.filter((key) => actual[key] !== expected[key]).map((key) => key + "=" + actual[key] + " expected=" + expected[key]);
  return drift.length ? { status: "FAIL", evidence: label + " baseline drift: " + drift.join(", ") } : { status: "PASS", evidence: label + " counts match baseline" };
}

function checkIntegrity(info: DatabaseInfo, label: string): Check {
  return info.integrity === "ok" && info.quickCheck === "ok" && info.foreignKeyViolations === 0
    ? { status: "PASS", evidence: label + " integrity_check=ok; quick_check=ok; foreign_key_violations=0" }
    : { status: "FAIL", evidence: label + " integrity_check=" + info.integrity + "; quick_check=" + info.quickCheck + "; foreign_key_violations=" + info.foreignKeyViolations };
}

function checkPre0005(info: DatabaseInfo, label: string): Check {
  const history = info.schema.migrations.map((item) => item.id);
  const historyMatches = history.length === expectedHistory.length && expectedHistory.every((id, index) => history[index] === id);
  const valid = historyMatches && info.schema.workSchemaState === "ready" && info.schema.locationSchemaState === "ready" && info.schema.contributorSchemaState === "absent" && !info.schema.contributorMigrationRecorded;
  return valid
    ? { status: "PASS", evidence: label + " has exact pre-0005 history " + history.join(",") + "; contributor schema absent" }
    : { status: "FAIL", evidence: label + " pre-0005 state invalid: history=" + history.join(",") + "; work=" + info.schema.workSchemaState + "; location=" + info.schema.locationSchemaState + "; contributor=" + info.schema.contributorSchemaState + "; recorded=" + info.schema.contributorMigrationRecorded };
}

function checkPendingWrites(file: string): Check {
  const wal = fs.existsSync(file + "-wal") ? fs.statSync(file + "-wal").size : 0;
  const journal = fs.existsSync(file + "-journal") ? fs.statSync(file + "-journal").size : 0;
  return wal === 0 && journal === 0 ? { status: "PASS", evidence: "no WAL or rollback journal sidecar is present" } : { status: "FAIL", evidence: "pending SQLite sidecars: wal=" + wal + "; journal=" + journal };
}

function backupCount(sidecarCounts: Record<string, unknown> | null, key: keyof typeof countTables, baseline: Baseline) {
  if (!sidecarCounts) return false;
  const field = countTables[key];
  const hasField = Object.prototype.hasOwnProperty.call(sidecarCounts, field);
  const hasActiveCopies = key === "activeCopies" && Object.prototype.hasOwnProperty.call(sidecarCounts, "activeCopies");
  if (!hasField && !hasActiveCopies) return true;
  const value = sidecarCounts[field];
  if (key === "activeCopies") return Number(value) === baseline[key] || Number(sidecarCounts.activeCopies) === baseline[key];
  return Number(value) === baseline[key];
}

function checkBackup(file: string, info: DatabaseInfo, expectedHash: string, baseline: Baseline, maxAgeHours: number): Check {
  const sidecarFile = file + ".json";
  if (!fs.existsSync(sidecarFile)) return { status: "FAIL", evidence: "backup sidecar is missing: " + sidecarFile };
  let sidecar: Record<string, unknown>;
  try { sidecar = JSON.parse(fs.readFileSync(sidecarFile, "utf8")) as Record<string, unknown>; } catch { return { status: "FAIL", evidence: "backup sidecar is not valid JSON" }; }
  const createdAt = typeof sidecar.createdAt === "string" ? Date.parse(sidecar.createdAt) : Number.NaN;
  const ageHours = Number.isFinite(createdAt) ? (Date.now() - createdAt) / 3600000 : Number.POSITIVE_INFINITY;
  const counts = sidecar.counts && typeof sidecar.counts === "object" ? sidecar.counts as Record<string, unknown> : null;
  const reasons: string[] = [];
  if (sha256(file) !== expectedHash || String(sidecar.sha256 || "").toLowerCase() !== expectedHash) reasons.push("backup SHA-256 does not match supplied hash");
  if (sidecar.integrity !== "ok") reasons.push("backup sidecar integrity marker is not ok");
  if (!Number.isFinite(createdAt) || ageHours < 0 || ageHours > maxAgeHours) reasons.push("backup timestamp is invalid or stale");
  if (baselineKeys.some((key) => !backupCount(counts, key, baseline))) reasons.push("backup sidecar counts do not match baseline");
  const state = checkPre0005(info, "backup");
  if (state.status === "FAIL") reasons.push(state.evidence);
  return reasons.length ? { status: "FAIL", evidence: reasons.join("; ") } : { status: "PASS", evidence: "fresh backup sidecar metadata, hash, timestamp, integrity, exact pre-0005 state and complete database counts verified" };
}

function listFangcunWriters() {
  const hook = process.env.FANGCUN_CONTRIBUTOR_RUNNER_TEST_HOOK;
  if (hook === "active-writer") return [{ ProcessId: 99999, CommandLine: "simulated Fangcun writer" }];
  if (process.platform !== "win32") throw new RunnerRefusal("writer scan is unavailable on this platform; refusing to continue");
  const script = "$pattern='(?i)(service-host\\.(?:js|cjs|ts)|runtime[\\\\/]+releases[\\\\/].+server\\.(?:js|cjs|ts))'; $items=Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','node') -and $_.CommandLine -and $_.CommandLine -match $pattern } | Select-Object ProcessId,CommandLine; if($null -eq $items){'[]'} else {@($items) | ConvertTo-Json -Compress}";
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim();
  if (!output) return [];
  const parsed = JSON.parse(output) as Array<{ ProcessId: number; CommandLine: string }> | { ProcessId: number; CommandLine: string };
  return Array.isArray(parsed) ? parsed : [parsed];
}

function portIsListening(host: string, port: number) {
  return new Promise<boolean>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => { socket.destroy(); reject(new RunnerRefusal(host + ":" + port + " did not respond with a definitive refusal")); }, 1500);
    socket.once("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.once("error", (error: NodeJS.ErrnoException) => { clearTimeout(timer); socket.destroy(); if (error.code === "ECONNREFUSED") resolve(false); else reject(new RunnerRefusal("could not verify " + host + ":" + port + ": " + (error.code || error.message))); });
  });
}

function backfillPlan(database: Database.Database) {
  const editions = database.prepare("SELECT id,authors,translators FROM book_editions ORDER BY id").all() as Array<{ id: string; authors: unknown; translators: unknown }>;
  const plan: BackfillRow[] = [];
  for (const edition of editions) {
    let orderIndex = 0;
    for (const [value, role] of [[edition.authors, "author"], [edition.translators, "translator"]] as Array<[unknown, "author" | "translator"]>) {
      if (value === null || value === undefined || value === "") continue;
      let parsed: unknown;
      try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch { throw new RunnerRefusal("cannot parse " + role + " credits for Edition " + edition.id); }
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item.trim())) throw new RunnerRefusal("unexpected legacy " + role + " state for Edition " + edition.id);
      for (const displayName of parsed as string[]) plan.push({ editionId: edition.id, displayName, role, orderIndex: orderIndex++ });
    }
  }
  return plan;
}

function restoreRehearsal(file: string, baseline: Baseline) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-contributor-restore-"));
  const restored = path.join(directory, "library.db");
  try {
    fs.copyFileSync(file, restored, fs.constants.COPYFILE_EXCL);
    const info = inspectDatabase(restored);
    const checks = [checkPre0005(info, "restored backup"), checkIntegrity(info, "restored backup"), checkCounts(info.counts, baseline, "restored backup")];
    const failure = checks.find((check) => check.status === "FAIL");
    if (failure) throw new RunnerRefusal("backup restore rehearsal failed: " + failure.evidence);
    return { status: "PASS" as const, history: info.schema.migrations.map((item) => item.id), counts: info.counts, integrity: info.integrity, quickCheck: info.quickCheck, foreignKeyViolations: info.foreignKeyViolations };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function readMigrationSql(suppliedHash: string) {
  if (!fs.existsSync(migrationSqlFile)) throw new RunnerRefusal("verified migration SQL is missing: " + migrationSqlFile);
  const sql = canonicalSql(migrationSqlFile);
  const actualHash = sha256Text(sql);
  if (actualHash !== verifiedMigrationSqlSha256) throw new RunnerRefusal("SQL hash gate failed: checked-in SQL is " + actualHash + "; verified is " + verifiedMigrationSqlSha256);
  if (suppliedHash !== actualHash) throw new RunnerRefusal("SQL hash gate failed: supplied SQL is " + suppliedHash + "; actual is " + actualHash);
  return { sql, sha256: actualHash };
}

async function preflight(args: RunnerArgs, migrationSha256: string) {
  const target = inspectDatabase(args.database);
  const backup = inspectDatabase(args.backup);
  const checks: Record<string, Check> = {
    targetPath: { status: "PASS", evidence: args.target + " target path is explicit and policy-compliant: " + args.database },
    targetState: checkPre0005(target, "target"),
    targetIntegrity: checkIntegrity(target, "target"),
    targetCounts: checkCounts(target.counts, args.baseline, "target"),
    targetPendingWrites: checkPendingWrites(args.database),
    backupState: checkPre0005(backup, "backup"),
    backupIntegrity: checkIntegrity(backup, "backup"),
    backupCounts: checkCounts(backup.counts, args.baseline, "backup"),
    backupHash: checkBackup(args.backup, backup, args.backupSha256, args.baseline, args.maxAgeHours),
    targetBackupMatch: sameJson(target.core, backup.core) && sameJson(target.legacy, backup.legacy) ? { status: "PASS", evidence: "target and fresh backup core identities, counts and legacy rows match" } : { status: "FAIL", evidence: "target and fresh backup rows differ" },
    sqlHash: migrationSha256 === verifiedMigrationSqlSha256 ? { status: "PASS", evidence: "0005 SQL SHA-256=" + migrationSha256 } : { status: "FAIL", evidence: "0005 SQL SHA-256 mismatch" },
    serviceState: { status: "PASS", evidence: "explicit service attestation=" + args.service },
    backupRestoreRehearsal: { status: "PASS", evidence: "pending isolated restore rehearsal" },
  };
  checks.backupRestoreRehearsal = restoreRehearsal(args.backup, args.baseline).status === "PASS" ? { status: "PASS", evidence: "fresh backup copied to a temporary file and restored read-only with schema, integrity and count checks" } : { status: "FAIL", evidence: "backup restore rehearsal failed" };
  if (args.target === "FORMAL" || process.env.FANGCUN_CONTRIBUTOR_RUNNER_TEST_HOOK === "active-writer") {
    checks.port3000 = (await portIsListening("127.0.0.1", 3000)) ? { status: "FAIL", evidence: "127.0.0.1:3000 is listening" } : { status: "PASS", evidence: "127.0.0.1:3000 is not listening" };
    const writers = listFangcunWriters();
    checks.fangcunWriters = writers.length ? { status: "FAIL", evidence: writers.length + " Fangcun writer process(es) detected: " + writers.map((writer) => writer.ProcessId + " " + writer.CommandLine).join(" | ") } : { status: "PASS", evidence: "no Fangcun service-host or release server process detected" };
  } else {
    checks.port3000 = { status: "PASS", evidence: "not applicable for ISOLATED target" };
    checks.fangcunWriters = { status: "PASS", evidence: "not applicable for ISOLATED target" };
  }
  const failures = Object.entries(checks).filter(([, check]) => check.status === "FAIL");
  if (failures.length) throw new RunnerRefusal("Preflight NO-GO: " + failures.map(([name, check]) => name + ": " + check.evidence).join("; "));
  const database = new Database(args.database, { readonly: true, fileMustExist: true });
  try {
    const plan = backfillPlan(database);
    return { status: "PASS" as const, checks, target, backup, expectedChanges: { contributors: plan.length, editionContributors: plan.length, indexes: 2, schemaMigration: migrationId } };
  } finally { database.close(); }
}

function relationSnapshot(database: Database.Database) {
  return database.prepare("SELECT ec.edition_id,c.display_name,ec.role,ec.order_index,ec.credited_as FROM edition_contributors ec JOIN contributors c ON c.id=ec.contributor_id ORDER BY ec.edition_id,ec.order_index,ec.role,ec.contributor_id").all().map((row) => {
    const value = row as Record<string, unknown>;
    return { editionId: String(value.edition_id), displayName: String(value.display_name), role: String(value.role), orderIndex: Number(value.order_index), creditedAs: value.credited_as ?? null };
  });
}

function validateAfter(database: Database.Database, before: DatabaseInfo, plan: BackfillRow[], baseline: Baseline) {
  const after = inspectOpenDatabase(database);
  const history = after.schema.migrations.map((item) => item.id);
  const expectedRelations = plan.map((row) => ({ editionId: row.editionId, displayName: row.displayName, role: row.role, orderIndex: row.orderIndex, creditedAs: null }));
  const actualRelations = relationSnapshot(database);
  const invalidRoles = actualRelations.filter((row) => !(contributorRoles as readonly string[]).includes(row.role)).length;
  const checks: Check[] = [
    history.length === expectedHistory.length + 1 && [...expectedHistory, migrationId].every((id, index) => history[index] === id) ? { status: "PASS", evidence: "migration history is 0001 through 0005 in order" } : { status: "FAIL", evidence: "unexpected post-migration history: " + history.join(",") },
    after.schema.contributorSchemaState === "ready" ? { status: "PASS", evidence: "Contributor schema is complete" } : { status: "FAIL", evidence: "Contributor schema is not complete" },
    checkIntegrity(after, "post-migration target"),
    checkCounts(after.counts, baseline, "post-migration target"),
    sameJson(after.core, before.core) ? { status: "PASS", evidence: "Work, Edition, Copy, Location, Loan and Annotation identities/counts are unchanged" } : { status: "FAIL", evidence: "core identities or counts changed" },
    sameJson(after.legacy, before.legacy) ? { status: "PASS", evidence: "legacy author, translator and location rows are unchanged" } : { status: "FAIL", evidence: "legacy rows changed" },
    invalidRoles === 0 ? { status: "PASS", evidence: "all relation role codes are canonical" } : { status: "FAIL", evidence: invalidRoles + " invalid contributor role(s)" },
    sameJson(actualRelations, expectedRelations) ? { status: "PASS", evidence: "conservative legacy backfill relations match exactly" } : { status: "FAIL", evidence: "backfill relations differ from legacy plan" },
    Number((database.prepare("SELECT COUNT(*) AS count FROM contributors").get() as { count: number }).count) === plan.length ? { status: "PASS", evidence: "Contributor entity count matches legacy credit rows; no deduplication occurred" } : { status: "FAIL", evidence: "Contributor entity count does not match legacy credit rows" },
  ];
  const failure = checks.find((check) => check.status === "FAIL");
  if (failure) throw new RunnerRefusal("post-migration validation failed: " + failure.evidence);
  return { status: "PASS" as const, checks, after };
}

function applyMigration(args: RunnerArgs, migrationSql: string, preflightResult: Awaited<ReturnType<typeof preflight>>) {
  const database = new Database(args.database, { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    const before = inspectOpenDatabase(database);
    const plan = backfillPlan(database);
    const apply = database.transaction(() => {
      database.exec(migrationSql);
      const timestamp = new Date().toISOString();
      const insertContributor = database.prepare("INSERT INTO contributors (id,display_name,sort_name,normalized_name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)");
      const insertRelation = database.prepare("INSERT INTO edition_contributors (edition_id,contributor_id,role,order_index,credited_as) VALUES (?,?,?,?,?)");
      for (const row of plan) {
        const contributorId = crypto.randomUUID();
        insertContributor.run(contributorId, row.displayName, null, null, 1, timestamp, timestamp);
        insertRelation.run(row.editionId, contributorId, row.role, row.orderIndex, null);
      }
      database.prepare("INSERT INTO schema_migrations (id,applied_at) VALUES (?,?)").run(migrationId, timestamp);
      const validation = validateAfter(database, before, plan, args.baseline);
      if (process.env.FANGCUN_CONTRIBUTOR_RUNNER_TEST_HOOK === "post-validation-failure") throw new RunnerRefusal("simulated post-validation failure; transaction must remain the only recovery action");
      return validation;
    });
    const validation = apply();
    const after = inspectOpenDatabase(database);
    return { status: "applied" as const, migrationStatus: "applied" as const, preflight: preflightResult, before: { counts: before.counts }, after: { counts: after.counts, history: after.schema.migrations.map((item) => item.id), contributorSchemaState: after.schema.contributorSchemaState }, validation };
  } finally { database.close(); }
}

async function main() {
  const args = parseArgs();
  const migration = readMigrationSql(args.sqlSha256);
  const preflightResult = await preflight(args, migration.sha256);
  if (args.mode !== "EXECUTE") {
    const database = new Database(args.database, { readonly: true, fileMustExist: true });
    try {
      const plan = backfillPlan(database);
      console.log(JSON.stringify({ status: "PASS", mode: args.mode, databaseTarget: args.target, databasePath: args.database, migrationId, currentMigrations: preflightResult.target.schema.migrations.map((item) => item.id), expectedMigration: migrationId, sqlSha256: migration.sha256, backup: { path: args.backup, sha256: args.backupSha256, state: "verified" }, editionCount: preflightResult.target.counts.editions, legacyAuthorCount: plan.filter((row) => row.role === "author").length, legacyTranslatorCount: plan.filter((row) => row.role === "translator").length, expectedContributorRows: plan.length, expectedRelationRows: plan.length, expectedSchemaChanges: preflightResult.expectedChanges, approvalRequiredForExecute: approvalToken, goNoGo: "GO", formalDatabaseMutation: false }, null, 2));
    } finally { database.close(); }
    return;
  }
  const applied = applyMigration(args, migration.sql, preflightResult);
  console.log(JSON.stringify({ ...applied, mode: args.mode, databaseTarget: args.target, databasePath: args.database, migrationId, approval: approvalToken, sqlSha256: migration.sha256, status: "PASS", goNoGo: "GO", formalDatabaseMutation: args.target === "FORMAL" }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
