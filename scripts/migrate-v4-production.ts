import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { inspectSchema, REQUIRED_RUNTIME_COLUMNS, type SchemaInspection } from "@/lib/db/schema-truth";

const migrationId = "0004_location_model";
const priorMigrationIds = ["0001_archive_fields", "0002_loans_annotations", "0003_works"] as const;
const expectedHistory = [...priorMigrationIds];
const migrationSqlFile = path.resolve(process.cwd(), "migrations", "0004_location_model.up.sql");
const verifiedMigrationSqlSha256 = "63cb13d5fbde39b6010866ad28d078c6661fe45d780e1a378f7ccd829c789dcb";
const approvalToken = "EXECUTE_0004_LOCATION_MODEL";
const formalDatabasePath = path.normalize("D:\\方寸数据\\data\\library.db");
const formalBackupRoot = path.normalize("D:\\方寸数据\\backups\\pre-upgrade");
const countTables = {
  works: "works",
  editions: "book_editions",
  copies: "owned_copies",
  activeCopies: "owned_copies",
  locations: "shelf_locations",
  loans: "loans",
  annotations: "annotations",
} as const;
const baselineKeys = Object.keys(countTables) as Array<keyof typeof countTables>;

type Target = "FORMAL" | "ISOLATED";
type Mode = "PRECHECK" | "DRY-RUN" | "EXECUTE";
type Baseline = Record<keyof typeof countTables, number>;
type Check = { status: "PASS" | "FAIL"; evidence: string };
type LegacyRow = Record<string, unknown>;

type RunnerArgs = {
  mode: Mode;
  target: Target;
  database: string;
  backup: string;
  backupSha256: string;
  sqlSha256: string;
  baseline: Baseline;
  service: "stopped" | "isolated";
  approval?: string;
  maxAgeHours: number;
};

type DatabaseInfo = {
  schema: SchemaInspection;
  counts: Baseline;
  integrity: string;
  quickCheck: string;
  foreignKeyViolations: number;
  locations: LegacyRow[];
  copies: LegacyRow[];
  editions: LegacyRow[];
};

class RunnerRefusal extends Error {}

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((candidate) => candidate.startsWith(prefix))?.slice(prefix.length);
}

function normalizeHash(value: string | undefined, name: string) {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new RunnerRefusal(`${name} must be a 64-character SHA-256 value`);
  return value.toLowerCase();
}

function absolutePath(name: string, value: string | undefined) {
  if (!value || !path.isAbsolute(value)) throw new RunnerRefusal(`${name} must be an explicit absolute path`);
  return path.normalize(value);
}

function within(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function parseBaseline(value: string | undefined): Baseline {
  if (!value) throw new RunnerRefusal("--baseline is required and must list works,editions,copies,activeCopies,locations,loans,annotations");
  const parsed: Partial<Baseline> = {};
  for (const pair of value.split(",")) {
    const [rawKey, rawValue, ...extra] = pair.split("=");
    const key = rawKey as keyof typeof countTables;
    const count = Number(rawValue);
    if (!baselineKeys.includes(key) || extra.length > 0 || !Number.isInteger(count) || count < 0) {
      throw new RunnerRefusal(`invalid baseline entry: ${pair}`);
    }
    parsed[key] = count;
  }
  if (baselineKeys.some((key) => parsed[key] === undefined)) throw new RunnerRefusal("--baseline must include every required count");
  return parsed as Baseline;
}

function parseArgs(): RunnerArgs {
  if (process.argv.length <= 2) throw new RunnerRefusal("REFUSE: explicit --mode, --target, database, backup, hashes and baseline are required");
  const modeValue = argument("mode")?.toUpperCase();
  if (modeValue !== "PRECHECK" && modeValue !== "DRY-RUN" && modeValue !== "EXECUTE") throw new RunnerRefusal("--mode must be PRECHECK, DRY-RUN or EXECUTE");
  const targetValue = argument("target")?.toUpperCase();
  if (targetValue !== "FORMAL" && targetValue !== "ISOLATED") throw new RunnerRefusal("--target must be explicit FORMAL or ISOLATED");
  const target = targetValue as Target;
  const database = absolutePath("database", argument("database"));
  const backup = absolutePath("backup", argument("backup"));
  if (database === backup) throw new RunnerRefusal("database and backup must be different files");
  if (!fs.existsSync(database)) throw new RunnerRefusal(`database does not exist: ${database}`);
  if (!fs.existsSync(backup)) throw new RunnerRefusal(`backup does not exist: ${backup}`);
  if (target === "FORMAL" && database !== formalDatabasePath) throw new RunnerRefusal(`FORMAL database path must be exactly ${formalDatabasePath}`);
  if (target === "FORMAL" && !within(formalBackupRoot, backup)) throw new RunnerRefusal(`FORMAL backup must be inside ${formalBackupRoot}`);
  if (target === "FORMAL" && within(os.tmpdir(), database)) throw new RunnerRefusal("FORMAL database cannot be inside the temporary directory");
  if (target === "ISOLATED" && (!within(os.tmpdir(), database) || !within(os.tmpdir(), backup))) {
    throw new RunnerRefusal("ISOLATED database and backup must both be inside the temporary directory");
  }
  const serviceValue = argument("service")?.toLowerCase();
  const expectedService = target === "FORMAL" ? "stopped" : "isolated";
  if (serviceValue !== expectedService) throw new RunnerRefusal(`service attestation must be --service=${expectedService}`);
  const approval = argument("approval");
  if (modeValue === "EXECUTE" && approval !== approvalToken) throw new RunnerRefusal(`EXECUTE requires --approval=${approvalToken}`);
  const maxAgeHours = Number(argument("max-age-hours") || "168");
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new RunnerRefusal("--max-age-hours must be a positive number");
  const testHook = process.env.FANGCUN_LOCATION_RUNNER_TEST_HOOK;
  if (testHook && process.env.NODE_ENV !== "test") throw new RunnerRefusal("test hooks are only accepted when NODE_ENV=test");
  if (testHook && testHook !== "post-validation-failure") throw new RunnerRefusal(`unknown location runner test hook: ${testHook}`);
  return {
    mode: modeValue as Mode,
    target,
    database,
    backup,
    backupSha256: normalizeHash(argument("backup-sha256"), "--backup-sha256"),
    sqlSha256: normalizeHash(argument("sql-sha256"), "--sql-sha256"),
    baseline: parseBaseline(argument("baseline")),
    service: expectedService,
    approval,
    maxAgeHours,
  };
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
  return Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}${predicate}`).get() as { count: number }).count);
}

function snapshotCounts(database: Database.Database): Baseline {
  return {
    works: count(database, countTables.works),
    editions: count(database, countTables.editions),
    copies: count(database, countTables.copies),
    activeCopies: count(database, countTables.activeCopies, " WHERE deleted_at IS NULL"),
    locations: count(database, countTables.locations),
    loans: count(database, countTables.loans),
    annotations: count(database, countTables.annotations),
  };
}

function readLegacyRows(database: Database.Database) {
  const locations = hasTable(database, "shelf_locations")
    ? database.prepare("SELECT id,name,parent_id,room,user_id,sort_order,active FROM shelf_locations ORDER BY id").all() as LegacyRow[]
    : [];
  const copies = hasTable(database, "owned_copies")
    ? database.prepare("SELECT id,user_id,edition_id,location,shelf_location_id,shelf_slot,shelf_coordinate,location_sort_order,deleted_at FROM owned_copies ORDER BY id").all() as LegacyRow[]
    : [];
  const editions = hasTable(database, "book_editions")
    ? database.prepare("SELECT id,title,authors,translators,publisher,isbn13,original_title,description,source,user_override FROM book_editions ORDER BY id").all() as LegacyRow[]
    : [];
  return { locations, copies, editions };
}

function inspectDatabase(file: string, readonly = true): DatabaseInfo {
  const database = new Database(file, { readonly, fileMustExist: true });
  try {
    const legacy = readLegacyRows(database);
    return {
      schema: inspectSchema(database),
      counts: snapshotCounts(database),
      integrity: String(database.pragma("integrity_check", { simple: true })),
      quickCheck: String(database.pragma("quick_check", { simple: true })),
      foreignKeyViolations: database.prepare("PRAGMA foreign_key_check").all().length,
      ...legacy,
    };
  } finally {
    database.close();
  }
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function checkCounts(actual: Baseline, expected: Baseline, label: string): Check {
  const mismatches = baselineKeys
    .filter((key) => actual[key] !== expected[key])
    .map((key) => `${key}=${actual[key]} expected=${expected[key]}`);
  return mismatches.length
    ? { status: "FAIL", evidence: `${label} count drift: ${mismatches.join(", ")}` }
    : { status: "PASS", evidence: `${label} counts match baseline` };
}

function checkIntegrity(info: DatabaseInfo, label: string): Check {
  return info.integrity === "ok" && info.quickCheck === "ok" && info.foreignKeyViolations === 0
    ? { status: "PASS", evidence: `${label} integrity_check=ok; quick_check=ok; foreign_key_violations=0` }
    : { status: "FAIL", evidence: `${label} integrity_check=${info.integrity}; quick_check=${info.quickCheck}; foreign_key_violations=${info.foreignKeyViolations}` };
}

function checkRuntimeSchema(info: DatabaseInfo, label: string): Check {
  const missingColumns = Object.entries(info.schema.missingRuntimeColumns)
    .filter(([table]) => Object.prototype.hasOwnProperty.call(REQUIRED_RUNTIME_COLUMNS, table));
  return info.schema.missingRuntimeTables.length === 0
    && missingColumns.length === 0
    && info.schema.missingRequiredMigrations.length === 0
    && info.schema.unknownMigrations.length === 0
    && info.schema.workSchemaState === "ready"
    ? { status: "PASS", evidence: `${label} runtime tables, columns and 0001-0003 work schema are ready` }
    : { status: "FAIL", evidence: `${label} runtime schema is not ready: missingTables=${info.schema.missingRuntimeTables.join(",")}; missingColumns=${JSON.stringify(missingColumns)}; missingMigrations=${info.schema.missingRequiredMigrations.join(",")}; unknown=${info.schema.unknownMigrations.join(",")}; workState=${info.schema.workSchemaState}` };
}

function checkPre0004State(info: DatabaseInfo, label: string): Check {
  const history = info.schema.migrations.map((migration) => migration.id);
  const historyMatches = history.length === expectedHistory.length && expectedHistory.every((id, index) => history[index] === id);
  return historyMatches && info.schema.locationSchemaState === "absent" && !info.schema.locationMigrationRecorded
    ? { status: "PASS", evidence: `${label} is pre-0004 with history ${history.join(",")}` }
    : { status: "FAIL", evidence: `${label} must be pre-0004: history=${history.join(",")}; locationState=${info.schema.locationSchemaState}; recorded=${info.schema.locationMigrationRecorded}` };
}

function checkLocationReferences(info: DatabaseInfo, label: string): Check {
  const locationKeys = new Set(info.locations.map((row) => `${String(row.id)}|${String(row.user_id)}`));
  const orphaned = info.copies.filter((copy) => copy.shelf_location_id != null && !locationKeys.has(`${String(copy.shelf_location_id)}|${String(copy.user_id)}`));
  return orphaned.length === 0
    ? { status: "PASS", evidence: `${label} shelf_location_id references are valid` }
    : { status: "FAIL", evidence: `${label} has ${orphaned.length} orphaned shelf_location_id reference(s)` };
}

function checkPendingWrites(database: string): Check {
  const wal = fs.existsSync(`${database}-wal`) ? fs.statSync(`${database}-wal`).size : 0;
  const journal = fs.existsSync(`${database}-journal`) ? fs.statSync(`${database}-journal`).size : 0;
  return wal === 0 && journal === 0
    ? { status: "PASS", evidence: "no WAL or rollback journal sidecar is present" }
    : { status: "FAIL", evidence: `pending SQLite sidecars: wal=${wal}; journal=${journal}` };
}

function backupCount(sidecarCounts: Record<string, unknown> | null, key: keyof typeof countTables, baseline: Baseline) {
  if (!sidecarCounts) return false;
  const tableName = countTables[key];
  const value = sidecarCounts[tableName];
  if (key === "activeCopies") {
    return Number(value) === baseline[key] || Number(sidecarCounts.activeCopies) === baseline[key];
  }
  return Number(value) === baseline[key];
}

function checkBackupMetadata(file: string, info: DatabaseInfo, expectedHash: string, baseline: Baseline, maxAgeHours: number): Check {
  const sidecarFile = `${file}.json`;
  if (!fs.existsSync(sidecarFile)) return { status: "FAIL", evidence: `backup sidecar is missing: ${sidecarFile}` };
  let sidecar: Record<string, unknown>;
  try {
    sidecar = JSON.parse(fs.readFileSync(sidecarFile, "utf8")) as Record<string, unknown>;
  } catch {
    return { status: "FAIL", evidence: "backup sidecar is not valid JSON" };
  }
  const actualHash = sha256(file);
  const sidecarHash = typeof sidecar.sha256 === "string" ? sidecar.sha256.toLowerCase() : "";
  const createdAt = typeof sidecar.createdAt === "string" ? Date.parse(sidecar.createdAt) : Number.NaN;
  const ageHours = Number.isFinite(createdAt) ? (Date.now() - createdAt) / 3_600_000 : Number.POSITIVE_INFINITY;
  const sidecarCounts = sidecar.counts && typeof sidecar.counts === "object" ? sidecar.counts as Record<string, unknown> : null;
  const countMismatches = baselineKeys.filter((key) => !backupCount(sidecarCounts, key, baseline));
  const reasons: string[] = [];
  if (actualHash !== expectedHash) reasons.push(`actual SHA-256 ${actualHash} does not match supplied ${expectedHash}`);
  if (sidecarHash !== expectedHash) reasons.push("backup sidecar SHA-256 does not match supplied hash");
  if (sidecar.integrity !== "ok") reasons.push("backup sidecar integrity marker is not ok");
  if (!Number.isFinite(createdAt)) reasons.push("backup sidecar createdAt is invalid");
  if (ageHours < 0) reasons.push("backup sidecar createdAt is in the future");
  if (ageHours > maxAgeHours) reasons.push(`backup age ${Math.round(ageHours)}h exceeds ${maxAgeHours}h`);
  if (countMismatches.length) reasons.push(`backup sidecar counts do not match baseline: ${countMismatches.join(",")}`);
  const schemaCheck = checkPre0004State(info, "backup");
  if (schemaCheck.status === "FAIL") reasons.push(schemaCheck.evidence);
  return reasons.length
    ? { status: "FAIL", evidence: reasons.join("; ") }
    : { status: "PASS", evidence: "backup sidecar, SHA-256, integrity marker, timestamp, pre-0004 state and baseline counts match" };
}

function listFangcunWriters() {
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
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new RunnerRefusal(`${host}:${port} did not respond with a definitive refusal`));
    }, 1_500);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve(false);
      else reject(new RunnerRefusal(`could not verify ${host}:${port}: ${error.code || error.message}`));
    });
  });
}

function restoreRehearsal(backup: string, baseline: Baseline) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-location-restore-"));
  const restoredCopy = path.join(temporaryRoot, "restored.db");
  try {
    fs.copyFileSync(backup, restoredCopy, fs.constants.COPYFILE_EXCL);
    const info = inspectDatabase(restoredCopy);
    const checks = [
      checkRuntimeSchema(info, "restored backup"),
      checkPre0004State(info, "restored backup"),
      checkIntegrity(info, "restored backup"),
      checkCounts(info.counts, baseline, "restored backup"),
      checkLocationReferences(info, "restored backup"),
    ];
    const failure = checks.find((check) => check.status === "FAIL");
    if (failure) throw new RunnerRefusal(`backup restore rehearsal failed: ${failure.evidence}`);
    return { status: "PASS" as const, schema: info.schema, counts: info.counts, integrity: info.integrity, quickCheck: info.quickCheck, foreignKeyViolations: info.foreignKeyViolations };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function readMigrationSql(suppliedHash: string) {
  if (!fs.existsSync(migrationSqlFile)) throw new RunnerRefusal(`verified migration SQL is missing: ${migrationSqlFile}`);
  const sql = canonicalSql(migrationSqlFile);
  const actualHash = sha256Text(sql);
  if (actualHash !== verifiedMigrationSqlSha256) throw new RunnerRefusal(`SQL hash gate failed: checked-in SQL is ${actualHash}, verified Task 007 SQL is ${verifiedMigrationSqlSha256}`);
  if (suppliedHash !== actualHash) throw new RunnerRefusal(`SQL hash gate failed: supplied SQL hash is ${suppliedHash}, actual is ${actualHash}`);
  return { sql, sha256: actualHash };
}

function preflightDatabase(info: DatabaseInfo, args: RunnerArgs, label: string) {
  const checks: Record<string, Check> = {};
  checks.runtimeSchema = checkRuntimeSchema(info, label);
  checks.pre0004State = checkPre0004State(info, label);
  checks.integrity = checkIntegrity(info, label);
  checks.counts = checkCounts(info.counts, args.baseline, label);
  checks.locationReferences = checkLocationReferences(info, label);
  return checks;
}

async function preflight(args: RunnerArgs, sqlSha256: string) {
  const targetInfo = inspectDatabase(args.database);
  const backupInfo = inspectDatabase(args.backup);
  const checks = preflightDatabase(targetInfo, args, "target");
  checks.targetPath = { status: "PASS", evidence: `${args.target} target path is explicit and policy-compliant: ${args.database}` };
  checks.targetPendingWrites = checkPendingWrites(args.database);
  checks.backupRuntimeSchema = checkRuntimeSchema(backupInfo, "backup");
  checks.backupState = checkPre0004State(backupInfo, "backup");
  checks.backupIntegrity = checkIntegrity(backupInfo, "backup");
  checks.backupCounts = checkCounts(backupInfo.counts, args.baseline, "backup");
  checks.backupReferences = checkLocationReferences(backupInfo, "backup");
  checks.backupHash = checkBackupMetadata(args.backup, backupInfo, args.backupSha256, args.baseline, args.maxAgeHours);
  checks.backupMatchesTarget = sameJson(targetInfo.locations, backupInfo.locations)
    && sameJson(targetInfo.copies, backupInfo.copies)
    && sameJson(targetInfo.editions, backupInfo.editions)
    ? { status: "PASS", evidence: "target and backup legacy location, copy and edition rows match" }
    : { status: "FAIL", evidence: "target and backup legacy rows differ" };
  checks.sqlHash = { status: sqlSha256 === verifiedMigrationSqlSha256 ? "PASS" : "FAIL", evidence: `0004 SQL SHA-256=${sqlSha256}; verified=${verifiedMigrationSqlSha256}` };
  checks.serviceState = { status: "PASS", evidence: `explicit service attestation=${args.service}` };
  checks.port3000 = { status: "PASS", evidence: "not applicable for ISOLATED target; formal port 127.0.0.1:3000 is not reused" };
  checks.fangcunWriters = { status: "PASS", evidence: "not applicable for ISOLATED target; formal Fangcun writers are outside the disposable runtime" };
  if (args.target === "FORMAL") {
    checks.port3000 = (await portIsListening("127.0.0.1", 3000))
      ? { status: "FAIL", evidence: "127.0.0.1:3000 is listening" }
      : { status: "PASS", evidence: "127.0.0.1:3000 is not listening" };
    const writers = listFangcunWriters();
    checks.fangcunWriters = writers.length
      ? { status: "FAIL", evidence: `${writers.length} Fangcun writer process(es) detected: ${writers.map((writer) => `${writer.ProcessId} ${writer.CommandLine}`).join(" | ")}` }
      : { status: "PASS", evidence: "no Fangcun service-host or release server process detected" };
  }
  checks.backupRestoreRehearsal = { status: "PASS", evidence: "pending isolated restore rehearsal" };
  const rehearsal = restoreRehearsal(args.backup, args.baseline);
  checks.backupRestoreRehearsal = { status: "PASS", evidence: "backup copied to an isolated temporary file and passed schema, integrity, quick-check, foreign-key, reference and baseline validation" };
  const failures = Object.entries(checks).filter(([, check]) => check.status === "FAIL");
  if (failures.length) throw new RunnerRefusal(`Preflight NO-GO: ${failures.map(([name, check]) => `${name}: ${check.evidence}`).join("; ")}`);
  return { status: "PASS" as const, checks, target: targetInfo, backup: backupInfo, restoreRehearsal: rehearsal, expectedChanges: { addLocationColumns: 2, addLoanLocationColumns: 6, addIndexes: 3, recordMigration: true } };
}

function indexExists(database: Database.Database, name: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name));
}

function validatePostMigration(database: Database.Database, before: DatabaseInfo, baseline: Baseline) {
  const after = inspectDatabaseFromOpenConnection(database);
  const expectedAfterHistory = [...expectedHistory, migrationId];
  const history = after.schema.migrations.map((migration) => migration.id);
  const locationDefaults = Number((database.prepare("SELECT COUNT(*) AS count FROM shelf_locations WHERE location_type <> 'legacy' OR display_code IS NOT NULL").get() as { count: number }).count);
  const loanDefaults = Number((database.prepare("SELECT COUNT(*) AS count FROM loans WHERE original_location_captured <> 0 OR original_location_id IS NOT NULL OR original_location_slot IS NOT NULL OR original_location_coordinate IS NOT NULL OR original_location_text IS NOT NULL OR original_location_sort_order IS NOT NULL").get() as { count: number }).count);
  const missingIndexes = ["idx_shelf_locations_parent_order", "idx_owned_copies_location_owner", "idx_loans_original_location"].filter((name) => !indexExists(database, name));
  const checks = [
    checkRuntimeSchema(after, "post-migration target"),
    checkIntegrity(after, "post-migration target"),
    checkCounts(after.counts, baseline, "post-migration target"),
    checkLocationReferences(after, "post-migration target"),
    history.length === expectedAfterHistory.length && expectedAfterHistory.every((id, index) => history[index] === id)
      ? { status: "PASS" as const, evidence: `post-migration history is ${history.join(",")}` }
      : { status: "FAIL" as const, evidence: `post-migration history is ${history.join(",")}` },
    locationDefaults === 0 ? { status: "PASS" as const, evidence: "legacy location defaults are preserved" } : { status: "FAIL" as const, evidence: `${locationDefaults} location default row(s) changed` },
    loanDefaults === 0 ? { status: "PASS" as const, evidence: "loan original-location defaults are empty" } : { status: "FAIL" as const, evidence: `${loanDefaults} loan original-location row(s) unexpectedly populated` },
    missingIndexes.length === 0 ? { status: "PASS" as const, evidence: "all 0004 indexes exist" } : { status: "FAIL" as const, evidence: `missing indexes: ${missingIndexes.join(",")}` },
    sameJson(after.locations, before.locations) ? { status: "PASS" as const, evidence: "legacy shelf rows are unchanged" } : { status: "FAIL" as const, evidence: "legacy shelf rows changed" },
    sameJson(after.copies, before.copies) ? { status: "PASS" as const, evidence: "owned copy location rows are unchanged" } : { status: "FAIL" as const, evidence: "owned copy location rows changed" },
    sameJson(after.editions, before.editions) ? { status: "PASS" as const, evidence: "edition rows are unchanged" } : { status: "FAIL" as const, evidence: "edition rows changed" },
  ];
  const failure = checks.find((check) => check.status === "FAIL");
  if (failure) throw new RunnerRefusal(`post-migration validation failed: ${failure.evidence}`);
  return { status: "PASS" as const, checks, after };
}

function inspectDatabaseFromOpenConnection(database: Database.Database): DatabaseInfo {
  const legacy = readLegacyRows(database);
  return {
    schema: inspectSchema(database),
    counts: snapshotCounts(database),
    integrity: String(database.pragma("integrity_check", { simple: true })),
    quickCheck: String(database.pragma("quick_check", { simple: true })),
    foreignKeyViolations: database.prepare("PRAGMA foreign_key_check").all().length,
    ...legacy,
  };
}

function applyMigration(args: RunnerArgs, migrationSql: string, preflightResult: Awaited<ReturnType<typeof preflight>>) {
  const database = new Database(args.database, { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    const before = inspectDatabaseFromOpenConnection(database);
    const beforeChecks = preflightDatabase(before, args, "write target");
    const beforeFailure = Object.values(beforeChecks).find((check) => check.status === "FAIL");
    if (beforeFailure) throw new RunnerRefusal(`write-time target recheck failed: ${beforeFailure.evidence}`);
    const apply = database.transaction(() => {
      database.exec(migrationSql);
      database.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, new Date().toISOString());
      const validation = validatePostMigration(database, before, args.baseline);
      if (process.env.FANGCUN_LOCATION_RUNNER_TEST_HOOK === "post-validation-failure") {
        throw new RunnerRefusal("simulated post-validation failure; transaction must remain the only recovery action");
      }
      return validation;
    });
    const validation = apply();
    const after = inspectDatabase(args.database);
    return { status: "applied" as const, migrationStatus: "applied" as const, preflight: preflightResult, before: { counts: before.counts }, after: { counts: after.counts, history: after.schema.migrations.map((item) => item.id), locationSchemaState: after.schema.locationSchemaState }, validation };
  } finally {
    database.close();
  }
}

async function main() {
  const args = parseArgs();
  const migration = readMigrationSql(args.sqlSha256);
  const preflightResult = await preflight(args, migration.sha256);
  if (args.mode !== "EXECUTE") {
    console.log(JSON.stringify({
      status: "PASS",
      mode: args.mode,
      databaseTarget: args.target,
      databasePath: args.database,
      migrationId,
      dryRun: args.mode === "DRY-RUN",
      sqlSha256: migration.sha256,
      baseline: args.baseline,
      approvalRequiredForExecute: approvalToken,
      preflight: preflightResult,
      goNoGo: "GO",
      formalDatabaseMutation: false,
    }, null, 2));
    return;
  }
  const applied = applyMigration(args, migration.sql, preflightResult);
  console.log(JSON.stringify({
    ...applied,
    mode: args.mode,
    databaseTarget: args.target,
    databasePath: args.database,
    migrationId,
    approval: approvalToken,
    sqlSha256: migration.sha256,
    baseline: args.baseline,
    status: "PASS",
    goNoGo: "GO",
    formalDatabaseMutation: args.target === "FORMAL",
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
