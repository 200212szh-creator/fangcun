import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  inspectSchema,
  REQUIRED_RUNTIME_COLUMNS,
  type SchemaInspection,
} from "@/lib/db/schema-truth";

const migrationId = "0003_works";
const migrationSqlFile = path.resolve(process.cwd(), "migrations", "0003_works.up.sql");
const verifiedMigrationSqlSha256 = "294b653605b440e2db8187f218d9c7be169c185b27182007ec181152916ac8b4";
const approvalToken = "EXECUTE_0003_WORKS";
const formalDatabasePath = path.normalize("D:\\方寸数据\\data\\library.db");
const requiredBaselineKeys = ["editions", "copies", "loans", "annotations", "locations"] as const;
const countTables = {
  editions: "book_editions",
  copies: "owned_copies",
  loans: "loans",
  annotations: "annotations",
  locations: "shelf_locations",
} as const;

type Target = "FORMAL" | "ISOLATED";
type Mode = "PRECHECK" | "DRY-RUN" | "EXECUTE";
type BaselineKey = typeof requiredBaselineKeys[number];
type Baseline = Record<BaselineKey, number>;
type Check = { status: "PASS" | "FAIL"; evidence: string };
type LegacyRow = Record<string, unknown>;

type RunnerArgs = {
  mode: Mode;
  target: Target;
  database: string;
  backup: string;
  backupSha256: string;
  sqlSha256?: string;
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
  journalMode: string;
};

class RunnerRefusal extends Error {}

function argument(name: string) {
  const prefix = `--${name}=`;
  const item = process.argv.find((candidate) => candidate.startsWith(prefix));
  return item?.slice(prefix.length);
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
  if (!value) throw new RunnerRefusal("--baseline is required and must list editions,copies,loans,annotations,locations");
  const parsed: Partial<Baseline> = {};
  for (const pair of value.split(",")) {
    const [rawKey, rawValue, ...extra] = pair.split("=");
    const key = rawKey as BaselineKey;
    const count = Number(rawValue);
    if (!requiredBaselineKeys.includes(key) || extra.length > 0 || !Number.isInteger(count) || count < 0) {
      throw new RunnerRefusal(`invalid baseline entry: ${pair}`);
    }
    parsed[key] = count;
  }
  if (requiredBaselineKeys.some((key) => parsed[key] === undefined)) throw new RunnerRefusal("--baseline must include every required count");
  return parsed as Baseline;
}

function parseArgs(): RunnerArgs {
  if (process.argv.length <= 2) throw new RunnerRefusal("REFUSE: explicit --mode, --target, database, backup and baseline are required");
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
  const testHook = process.env.FANGCUN_PRODUCTION_RUNNER_TEST_HOOK;
  if (testHook && process.env.NODE_ENV !== "test") throw new RunnerRefusal("test hooks are only accepted when NODE_ENV=test");
  if (testHook && testHook !== "post-validation-failure") throw new RunnerRefusal(`unknown production runner test hook: ${testHook}`);
  return {
    mode: modeValue as Mode,
    target,
    database,
    backup,
    backupSha256: normalizeHash(argument("backup-sha256"), "--backup-sha256"),
    sqlSha256: argument("sql-sha256") ? normalizeHash(argument("sql-sha256"), "--sql-sha256") : undefined,
    baseline: parseBaseline(argument("baseline")),
    service: expectedService,
    approval,
    maxAgeHours,
  };
}

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function hasTable(database: Database.Database, table: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function countTable(database: Database.Database, table: string) {
  return hasTable(database, table) ? Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count) : -1;
}

function snapshotCounts(database: Database.Database): Baseline {
  return Object.fromEntries(Object.entries(countTables).map(([key, table]) => [key, countTable(database, table)])) as Baseline;
}

function readLegacyRows(database: Database.Database) {
  if (!hasTable(database, "book_editions")) return [];
  return database.prepare("SELECT * FROM book_editions ORDER BY id").all() as LegacyRow[];
}

function withoutWorkId(rows: LegacyRow[]) {
  return rows.map((row) => {
    const legacy = { ...row };
    delete legacy.work_id;
    return legacy;
  });
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inspectDatabase(file: string, readonly = true): DatabaseInfo & { legacyRows: LegacyRow[] } {
  const database = new Database(file, { readonly, fileMustExist: true });
  try {
    const schema = inspectSchema(database);
    return {
      schema,
      counts: snapshotCounts(database),
      integrity: String(database.pragma("integrity_check", { simple: true })),
      quickCheck: String(database.pragma("quick_check", { simple: true })),
      foreignKeyViolations: database.prepare("PRAGMA foreign_key_check").all().length,
      journalMode: String(database.pragma("journal_mode", { simple: true })),
      legacyRows: readLegacyRows(database),
    };
  } finally {
    database.close();
  }
}

function checkCounts(actual: Baseline, expected: Baseline, label: string): Check {
  const mismatches = requiredBaselineKeys.filter((key) => actual[key] !== expected[key]).map((key) => `${key}=${actual[key]} expected=${expected[key]}`);
  return mismatches.length ? { status: "FAIL", evidence: `${label} count drift: ${mismatches.join(", ")}` } : { status: "PASS", evidence: `${label} counts match baseline` };
}

function checkLegacySchema(info: DatabaseInfo, label: string, expectedWorkState: "absent" | "ready"): Check {
  const missingTables = info.schema.missingRuntimeTables;
  const missingColumns = Object.entries(info.schema.missingRuntimeColumns).filter(([table]) => Object.prototype.hasOwnProperty.call(REQUIRED_RUNTIME_COLUMNS, table));
  const migrationIds = info.schema.migrations.map((migration) => migration.id);
  const expectedMigrations = expectedWorkState === "absent" ? ["0001_archive_fields", "0002_loans_annotations"] : ["0001_archive_fields", "0002_loans_annotations", migrationId];
  if (missingTables.length || missingColumns.length || info.schema.unknownMigrations.length || migrationIds.length !== expectedMigrations.length || expectedMigrations.some((id) => !migrationIds.includes(id))) {
    return { status: "FAIL", evidence: `${label} schema/history mismatch: state=${info.schema.workSchemaState}; migrations=${migrationIds.join(",")}; missingTables=${missingTables.join(",")}; missingColumns=${JSON.stringify(missingColumns)}; unknown=${info.schema.unknownMigrations.join(",")}` };
  }
  if (info.schema.workSchemaState !== expectedWorkState) return { status: "FAIL", evidence: `${label} work schema state=${info.schema.workSchemaState}, expected=${expectedWorkState}` };
  return { status: "PASS", evidence: `${label} runtime schema and migration history are ${expectedWorkState}` };
}

function checkIntegrity(info: DatabaseInfo, label: string): Check {
  if (info.integrity !== "ok" || info.quickCheck !== "ok" || info.foreignKeyViolations !== 0) {
    return { status: "FAIL", evidence: `${label} integrity_check=${info.integrity}; quick_check=${info.quickCheck}; foreign_key_violations=${info.foreignKeyViolations}` };
  }
  return { status: "PASS", evidence: `${label} integrity_check=ok; quick_check=ok; foreign_key_violations=0` };
}

function checkPendingWrites(database: string): Check {
  const wal = fs.existsSync(`${database}-wal`) ? fs.statSync(`${database}-wal`).size : 0;
  const journal = fs.existsSync(`${database}-journal`) ? fs.statSync(`${database}-journal`).size : 0;
  if (wal || journal) return { status: "FAIL", evidence: `pending SQLite sidecars: wal=${wal}; journal=${journal}` };
  return { status: "PASS", evidence: "no WAL or rollback journal sidecar is present" };
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
  const countMismatches = requiredBaselineKeys.filter((key) => {
    const table = countTables[key];
    return !sidecarCounts || Number(sidecarCounts[table]) !== baseline[key];
  });
  const reasons: string[] = [];
  if (actualHash !== expectedHash) reasons.push(`actual SHA-256 ${actualHash} does not match supplied ${expectedHash}`);
  if (sidecarHash !== expectedHash) reasons.push("backup sidecar SHA-256 does not match supplied hash");
  if (sidecar.integrity !== "ok") reasons.push("backup sidecar integrity marker is not ok");
  if (!Number.isFinite(createdAt)) reasons.push("backup sidecar createdAt is invalid");
  if (ageHours < 0) reasons.push("backup sidecar createdAt is in the future");
  if (ageHours > maxAgeHours) reasons.push(`backup age ${Math.round(ageHours)}h exceeds ${maxAgeHours}h`);
  if (countMismatches.length) reasons.push(`backup sidecar counts do not match baseline: ${countMismatches.join(",")}`);
  if (info.schema.workSchemaState !== "absent") reasons.push(`backup is not a pre-0003 copy: work state=${info.schema.workSchemaState}`);
  return reasons.length ? { status: "FAIL", evidence: reasons.join("; ") } : { status: "PASS", evidence: "backup sidecar, SHA-256, integrity marker, timestamp and baseline counts match" };
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
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-production-restore-"));
  const restoredCopy = path.join(temporaryRoot, "restored.db");
  try {
    fs.copyFileSync(backup, restoredCopy, fs.constants.COPYFILE_EXCL);
    const info = inspectDatabase(restoredCopy);
    const schemaCheck = checkLegacySchema(info, "restored backup", "absent");
    const integrityCheck = checkIntegrity(info, "restored backup");
    const countCheck = checkCounts(info.counts, baseline, "restored backup");
    if ([schemaCheck, integrityCheck, countCheck].some((check) => check.status === "FAIL")) {
      throw new RunnerRefusal(`backup restore rehearsal failed: ${[schemaCheck, integrityCheck, countCheck].map((check) => check.evidence).join("; ")}`);
    }
    return { status: "PASS" as const, restoredCopyRemovedAfterValidation: true, schema: info.schema, counts: info.counts, integrity: info.integrity, quickCheck: info.quickCheck, foreignKeyViolations: info.foreignKeyViolations };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function readMigrationSql(sqlHashArgument: string | undefined) {
  if (!fs.existsSync(migrationSqlFile)) throw new RunnerRefusal(`verified migration SQL is missing: ${migrationSqlFile}`);
  const actualHash = sha256(migrationSqlFile);
  if (actualHash !== verifiedMigrationSqlSha256) throw new RunnerRefusal(`SQL hash gate failed: checked-in SQL is ${actualHash}, verified Task 002 SQL is ${verifiedMigrationSqlSha256}`);
  if (sqlHashArgument && sqlHashArgument !== actualHash) throw new RunnerRefusal(`SQL hash gate failed: supplied SQL hash is ${sqlHashArgument}, actual is ${actualHash}`);
  return { sql: fs.readFileSync(migrationSqlFile, "utf8"), sha256: actualHash };
}

async function preflight(args: RunnerArgs, sqlSha256: string) {
  const targetInfo = inspectDatabase(args.database);
  const backupInfo = inspectDatabase(args.backup);
  const checks: Record<string, Check> = {};
  checks.targetPath = { status: "PASS", evidence: `${args.target} target path is explicit and policy-compliant: ${args.database}` };
  checks.targetSchema = checkLegacySchema(targetInfo, "target", "absent");
  checks.targetIntegrity = checkIntegrity(targetInfo, "target");
  checks.targetCounts = checkCounts(targetInfo.counts, args.baseline, "target");
  checks.targetPendingWrites = checkPendingWrites(args.database);
  checks.backupSchema = checkLegacySchema(backupInfo, "backup", "absent");
  checks.backupIntegrity = checkIntegrity(backupInfo, "backup");
  checks.backupCounts = checkCounts(backupInfo.counts, args.baseline, "backup");
  checks.backupHash = checkBackupMetadata(args.backup, backupInfo, args.backupSha256, args.baseline, args.maxAgeHours);
  checks.backupRestoreRehearsal = { status: "PASS", evidence: "pending isolated restore rehearsal" };
  const rehearsal = restoreRehearsal(args.backup, args.baseline);
  checks.backupRestoreRehearsal = { status: "PASS", evidence: "backup copied to an isolated temporary file and passed schema, integrity, quick-check, foreign-key and baseline validation" };
  checks.sqlHash = { status: sqlSha256 === verifiedMigrationSqlSha256 ? "PASS" : "FAIL", evidence: `0003 SQL SHA-256=${sqlSha256}; verified=${verifiedMigrationSqlSha256}` };
  checks.serviceState = { status: "PASS", evidence: `explicit service attestation=${args.service}` };
  if (args.target === "FORMAL") {
    const portListening = await portIsListening("127.0.0.1", 3000);
    checks.port3000 = portListening ? { status: "FAIL", evidence: "127.0.0.1:3000 is listening" } : { status: "PASS", evidence: "127.0.0.1:3000 is not listening" };
    const writers = listFangcunWriters();
    checks.fangcunWriters = writers.length ? { status: "FAIL", evidence: `${writers.length} Fangcun writer process(es) detected` } : { status: "PASS", evidence: "no Fangcun service-host or release server process detected" };
  } else {
    checks.port3000 = { status: "PASS", evidence: "not applicable for ISOLATED target; formal port 127.0.0.1:3000 is not reused" };
    checks.fangcunWriters = { status: "PASS", evidence: "not applicable for ISOLATED target; formal Fangcun writers are outside the disposable runtime" };
  }
  const failures = Object.entries(checks).filter(([, check]) => check.status === "FAIL");
  if (failures.length) throw new RunnerRefusal(`Preflight NO-GO: ${failures.map(([name, check]) => `${name}: ${check.evidence}`).join("; ")}`);
  return { status: "PASS" as const, checks, target: targetInfo, backup: backupInfo, restoreRehearsal: rehearsal, expectedChanges: { createWorks: args.baseline.editions, addWorksTable: true, addEditionWorkId: true, addWorkIndex: true, recordMigration: true } };
}

function validatePostMigration(database: Database.Database, beforeCounts: Baseline, beforeLegacyRows: LegacyRow[], baseline: Baseline) {
  const schema = inspectSchema(database);
  const counts = snapshotCounts(database);
  const workCount = countTable(database, "works");
  const missingWorkId = Number((database.prepare("SELECT COUNT(*) AS count FROM book_editions WHERE work_id IS NULL").get() as { count: number }).count);
  const orphanWorks = Number((database.prepare("SELECT COUNT(*) AS count FROM works w LEFT JOIN book_editions e ON e.work_id=w.id WHERE e.id IS NULL").get() as { count: number }).count);
  const orphanEditions = Number((database.prepare("SELECT COUNT(*) AS count FROM book_editions e LEFT JOIN works w ON w.id=e.work_id WHERE e.work_id IS NOT NULL AND w.id IS NULL").get() as { count: number }).count);
  const duplicateWorkIds = Number((database.prepare("SELECT COUNT(*) AS count FROM (SELECT id FROM works GROUP BY id HAVING COUNT(*) > 1)").get() as { count: number }).count);
  const unexpectedNullWorkFields = Number((database.prepare("SELECT COUNT(*) AS count FROM works WHERE title IS NULL OR created_at IS NULL OR updated_at IS NULL").get() as { count: number }).count);
  const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
  const integrity = String(database.pragma("integrity_check", { simple: true }));
  const quickCheck = String(database.pragma("quick_check", { simple: true }));
  const migrations = schema.migrations.map((migration) => migration.id);
  const legacyRowsAfter = readLegacyRows(database);
  const countsUnchanged = checkCounts(counts, beforeCounts, "post-migration legacy");
  const baselineUnchanged = checkCounts(counts, baseline, "post-migration baseline");
  if (schema.workSchemaState !== "ready" || !schema.workMigrationRecorded || migrations.length !== 3 || !migrations.includes(migrationId)) throw new RunnerRefusal(`post-migration schema/history validation failed: state=${schema.workSchemaState}; migrations=${migrations.join(",")}`);
  if (workCount !== counts.editions || missingWorkId !== 0 || orphanWorks !== 0 || orphanEditions !== 0 || duplicateWorkIds !== 0 || unexpectedNullWorkFields !== 0 || foreignKeyViolations !== 0 || integrity !== "ok" || quickCheck !== "ok" || countsUnchanged.status === "FAIL" || baselineUnchanged.status === "FAIL") {
    throw new RunnerRefusal(`post-migration validation failed: works=${workCount}; editions=${counts.editions}; missingWorkId=${missingWorkId}; orphanWorks=${orphanWorks}; orphanEditions=${orphanEditions}; duplicateWorkIds=${duplicateWorkIds}; unexpectedNullWorkFields=${unexpectedNullWorkFields}; foreignKeyViolations=${foreignKeyViolations}; integrity=${integrity}; quickCheck=${quickCheck}; countCheck=${countsUnchanged.evidence}; legacyRowsUnchanged=${sameJson(withoutWorkId(legacyRowsAfter), beforeLegacyRows)}`);
  }
  if (!sameJson(withoutWorkId(legacyRowsAfter), beforeLegacyRows)) throw new RunnerRefusal("post-migration validation failed: legacy Edition fields changed");
  return { workCount, editionCount: counts.editions, missingWorkId, orphanWorks, orphanEditions, duplicateWorkIds, unexpectedNullWorkFields, foreignKeyViolations, integrity, quickCheck, counts, migrations };
}

function applyMigration(args: RunnerArgs, migrationSql: string) {
  const database = new Database(args.database, { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    const beforeInfo = inspectDatabase(args.database, false);
    const beforeCounts = beforeInfo.counts;
    const beforeLegacyRows = beforeInfo.legacyRows;
    const targetSchemaCheck = checkLegacySchema(beforeInfo, "write target", "absent");
    const targetCountCheck = checkCounts(beforeCounts, args.baseline, "write target");
    if (targetSchemaCheck.status === "FAIL" || targetCountCheck.status === "FAIL") throw new RunnerRefusal(`write-time target recheck failed: ${targetSchemaCheck.evidence}; ${targetCountCheck.evidence}`);
    let createdWorkCount = 0;
    const transaction = database.transaction(() => {
      database.exec(migrationSql);
      const timestamp = new Date().toISOString();
      const editions = database.prepare("SELECT id,title,original_title,description FROM book_editions WHERE work_id IS NULL ORDER BY id").all() as Array<{ id: string; title: string; original_title: string | null; description: string | null }>;
      const insertWork = database.prepare("INSERT INTO works (id,title,original_title,description,created_at,updated_at) VALUES (?,?,?,?,?,?)");
      const linkEdition = database.prepare("UPDATE book_editions SET work_id=? WHERE id=? AND work_id IS NULL");
      for (const edition of editions) {
        const workId = crypto.randomUUID();
        insertWork.run(workId, edition.title, edition.original_title, edition.description, timestamp, timestamp);
        if (linkEdition.run(workId, edition.id).changes !== 1) throw new RunnerRefusal(`could not link Edition ${edition.id}`);
        createdWorkCount += 1;
      }
      database.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, timestamp);
      validatePostMigration(database, beforeCounts, beforeLegacyRows, args.baseline);
      if (process.env.FANGCUN_PRODUCTION_RUNNER_TEST_HOOK === "post-validation-failure") throw new RunnerRefusal("simulated post-validation failure; transaction must remain the only recovery action");
    });
    transaction();
    const afterInfo = inspectDatabase(args.database);
    const postValidation = (() => {
      const checkDatabase = new Database(args.database, { readonly: true, fileMustExist: true });
      try {
        return validatePostMigration(checkDatabase, beforeCounts, beforeLegacyRows, args.baseline);
      } finally {
        checkDatabase.close();
      }
    })();
    return { status: "applied" as const, createdWorkCount, before: { counts: beforeCounts, legacyRows: beforeLegacyRows }, after: { counts: afterInfo.counts, schema: afterInfo.schema, validation: postValidation } };
  } finally {
    database.close();
  }
}

async function main() {
  const args = parseArgs();
  const migration = readMigrationSql(args.sqlSha256);
  const preflightResult = await preflight(args, migration.sha256);
  if (args.mode !== "EXECUTE") {
    console.log(JSON.stringify({ status: "PASS", mode: args.mode, databaseTarget: args.target, databasePath: args.database, migrationId, dryRun: args.mode === "DRY-RUN", preflight: preflightResult, sqlSha256: migration.sha256, baseline: args.baseline, goNoGo: "GO", formalDatabaseMutation: false }, null, 2));
    return;
  }
  const { status: migrationStatus, ...applied } = applyMigration(args, migration.sql);
  console.log(JSON.stringify({ mode: args.mode, databaseTarget: args.target, databasePath: args.database, migrationId, approval: "accepted", sqlSha256: migration.sha256, baseline: args.baseline, preflight: preflightResult, ...applied, migrationStatus, status: "PASS", formalDatabaseMutation: args.target === "FORMAL", goNoGo: "GO" }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
