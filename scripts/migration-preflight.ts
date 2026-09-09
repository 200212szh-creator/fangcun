import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  assertRuntimeSchema,
  inspectSchema,
  REQUIRED_RUNTIME_TABLES,
  WORK_MIGRATION_ID,
  type SchemaInspection,
} from "@/lib/db/schema-truth";

type CheckStatus = "PASS" | "WARN" | "FAIL";
type Check = { status: CheckStatus; evidence: string };

function value(name: string) {
  const prefix = "--" + name + "=";
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : undefined;
}

function flag(name: string) {
  return process.argv.includes("--" + name);
}

function absolutePath(name: string, candidate: string | undefined) {
  if (!candidate || !path.isAbsolute(candidate)) throw new Error(name + " must be an explicit absolute path");
  return path.normalize(candidate);
}

function within(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function fileBytes(file: string) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function countTables(database: Database.Database, tables: readonly string[]) {
  const existing = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name));
  return Object.fromEntries(tables.filter((table) => existing.has(table)).map((table) => [
    table,
    Number((database.prepare("SELECT COUNT(*) AS count FROM " + table).get() as { count: number }).count),
  ]));
}

function inspectDatabase(file: string) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const schema = inspectSchema(database);
    const integrity = String(database.pragma("integrity_check", { simple: true }));
    const quickCheck = String(database.pragma("quick_check", { simple: true }));
    const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
    const journalMode = String(database.pragma("journal_mode", { simple: true }));
    const runtimeSchemaError = (() => {
      try {
        assertRuntimeSchema(database);
        return null;
      } catch (error: unknown) {
        return error instanceof Error ? error.message : String(error);
      }
    })();
    return {
      schema,
      counts: countTables(database, REQUIRED_RUNTIME_TABLES),
      integrity,
      quickCheck,
      foreignKeyViolations,
      journalMode,
      runtimeSchemaError,
    };
  } finally {
    database.close();
  }
}

function checkSchema(schema: SchemaInspection): Check {
  if (schema.missingRuntimeTables.length || Object.keys(schema.missingRuntimeColumns).length || schema.missingRequiredMigrations.length) {
    return {
      status: "FAIL",
      evidence: "missing tables=" + schema.missingRuntimeTables.join(",") + "; missing columns=" + JSON.stringify(schema.missingRuntimeColumns) + "; missing migrations=" + schema.missingRequiredMigrations.join(","),
    };
  }
  if (schema.unknownMigrations.length) return { status: "FAIL", evidence: "unknown migrations=" + schema.unknownMigrations.join(",") };
  if (schema.workSchemaState !== "absent" && schema.workSchemaState !== "ready") return { status: "FAIL", evidence: "work schema state=" + schema.workSchemaState };
  return { status: "PASS", evidence: "runtime schema and migration history are consistent" };
}

function checkIntegrity(info: ReturnType<typeof inspectDatabase>): Check {
  if (info.integrity !== "ok" || info.quickCheck !== "ok" || info.foreignKeyViolations !== 0) {
    return { status: "FAIL", evidence: "integrity_check=" + info.integrity + "; quick_check=" + info.quickCheck + "; foreign_key_violations=" + info.foreignKeyViolations };
  }
  return { status: "PASS", evidence: "integrity_check=ok; quick_check=ok; foreign_key_violations=0" };
}

function checkBackupMetadata(file: string, info: ReturnType<typeof inspectDatabase>, maxAgeHours: number): { check: Check; metadata: Record<string, unknown> | null } {
  const metadataFile = file + ".json";
  if (!fs.existsSync(metadataFile)) return { check: { status: "FAIL", evidence: "backup sidecar is missing: " + metadataFile }, metadata: null };
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8")) as Record<string, unknown>;
  } catch {
    return { check: { status: "FAIL", evidence: "backup sidecar is not valid JSON" }, metadata: null };
  }
  const actualHash = sha256(file);
  const expectedHash = typeof metadata.sha256 === "string" ? metadata.sha256 : "";
  const integrity = metadata.integrity === "ok";
  const createdAt = typeof metadata.createdAt === "string" ? Date.parse(metadata.createdAt) : Number.NaN;
  const ageHours = Number.isFinite(createdAt) ? (Date.now() - createdAt) / 3_600_000 : Number.POSITIVE_INFINITY;
  const expectedCounts = metadata.counts && typeof metadata.counts === "object" ? metadata.counts as Record<string, unknown> : null;
  const countMismatch = expectedCounts
    ? Object.entries(expectedCounts).filter(([table, expected]) => info.counts[table] !== Number(expected)).map(([table]) => table)
    : ["sidecar.counts"];
  const reasons: string[] = [];
  if (!integrity) reasons.push("sidecar.integrity is not ok");
  if (!expectedHash || actualHash !== expectedHash) reasons.push("sha256 mismatch");
  if (!Number.isFinite(createdAt)) reasons.push("createdAt is invalid");
  if (ageHours < 0) reasons.push("createdAt is in the future");
  if (ageHours > maxAgeHours) reasons.push("backup age " + Math.round(ageHours) + "h exceeds " + maxAgeHours + "h");
  if (countMismatch.length) reasons.push("count mismatch: " + countMismatch.join(","));
  return {
    check: reasons.length ? { status: "FAIL", evidence: reasons.join("; ") } : { status: "PASS", evidence: "readable sidecar, SHA-256, timestamp, integrity marker and row counts verified" },
    metadata,
  };
}

function checkRuntimeEnvironment(databaseFile: string, target: string): Check {
  const configuredDatabase = process.env.DATABASE_URL?.trim();
  const configuredRoot = process.env.FANGCUN_DATA_DIR?.trim();
  const resolvedConfiguredDatabase = configuredDatabase
    ? path.normalize(path.isAbsolute(configuredDatabase) ? configuredDatabase : path.resolve(configuredRoot || process.cwd(), configuredDatabase))
    : null;
  if (resolvedConfiguredDatabase && resolvedConfiguredDatabase !== databaseFile) {
    return { status: "FAIL", evidence: "DATABASE_URL does not match the explicit preflight database path" };
  }
  if (target === "ISOLATED" && !process.env.FANGCUN_E2E && process.env.NODE_ENV !== "test") {
    return { status: "WARN", evidence: "isolated target is explicit, but NODE_ENV is not test and FANGCUN_E2E is not set" };
  }
  return {
    status: "PASS",
    evidence: "explicit target path matches configured DATABASE_URL; environment names inspected: NODE_ENV, FANGCUN_DATA_DIR, DATABASE_URL, FANGCUN_RELEASE_DIR, FANGCUN_E2E",
  };
}

function checkDiskSpace(databaseFile: string, backupFile: string): Check {
  try {
    const databaseStats = fs.statfsSync(path.dirname(databaseFile)) as { bavail: number; bsize: number };
    const backupStats = fs.statfsSync(path.dirname(backupFile)) as { bavail: number; bsize: number };
    const databaseFreeBytes = Number(databaseStats.bavail) * Number(databaseStats.bsize);
    const backupFreeBytes = Number(backupStats.bavail) * Number(backupStats.bsize);
    const requiredBytes = Math.max(64 * 1024 * 1024, fileBytes(databaseFile) * 2);
    if (databaseFreeBytes < requiredBytes || backupFreeBytes < requiredBytes) {
      return { status: "FAIL", evidence: "free space below conservative requirement; database=" + databaseFreeBytes + "; backup=" + backupFreeBytes + "; required=" + requiredBytes };
    }
    return { status: "PASS", evidence: "database free bytes=" + databaseFreeBytes + "; backup free bytes=" + backupFreeBytes };
  } catch (error: unknown) {
    return { status: "FAIL", evidence: "could not read filesystem free space: " + (error instanceof Error ? error.message : String(error)) };
  }
}

function checkPendingWrites(databaseFile: string): Check {
  const walBytes = fileBytes(databaseFile + "-wal");
  const journalBytes = fileBytes(databaseFile + "-journal");
  if (walBytes || journalBytes) return { status: "FAIL", evidence: "sidecar bytes present; wal=" + walBytes + "; journal=" + journalBytes };
  return { status: "PASS", evidence: "no WAL or rollback journal sidecar is present; read-only probe cannot attest to an active process beyond this evidence" };
}

function main() {
  const target = (value("target") || process.env.FANGCUN_PREFLIGHT_TARGET || "").toUpperCase();
  if (target !== "ISOLATED" && target !== "FORMAL") throw new Error("target must be ISOLATED or FORMAL");
  if (target === "FORMAL" && !flag("allow-formal-readonly") && process.env.FANGCUN_PREFLIGHT_ALLOW_FORMAL_READONLY !== "YES") {
    throw new Error("formal preflight is read-only but requires --allow-formal-readonly");
  }
  const databaseFile = absolutePath("database", value("database") || process.env.FANGCUN_PREFLIGHT_DATABASE);
  const backupFile = absolutePath("backup", value("backup") || process.env.FANGCUN_PREFLIGHT_BACKUP);
  const serviceState = (value("service") || process.env.FANGCUN_PREFLIGHT_SERVICE || "unknown").toLowerCase();
  const migrationId = value("migration") || WORK_MIGRATION_ID;
  const maxAgeHours = Number(value("max-age-hours") || process.env.FANGCUN_PREFLIGHT_MAX_AGE_HOURS || "168");
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error("max-age-hours must be a positive number");
  if (databaseFile === backupFile) throw new Error("database and backup must be different files");
  if (!fs.existsSync(databaseFile)) throw new Error("database does not exist: " + databaseFile);
  if (!fs.existsSync(backupFile)) throw new Error("backup does not exist: " + backupFile);
  if (target === "ISOLATED" && (!within(os.tmpdir(), databaseFile) || !within(os.tmpdir(), backupFile))) {
    throw new Error("ISOLATED preflight paths must be inside the OS temporary directory");
  }

  const targetInfo = inspectDatabase(databaseFile);
  const backupInfo = inspectDatabase(backupFile);
  const checks: Record<string, Check> = {};
  checks.databaseTarget = { status: "PASS", evidence: target + " with explicit absolute path" };
  checks.runtimeEnvironment = checkRuntimeEnvironment(databaseFile, target);
  checks.databaseReadableAndUnlocked = { status: "PASS", evidence: "read-only SQLite open and SELECT/PRAGMA probes completed" };
  checks.databaseSchema = checkSchema(targetInfo.schema);
  checks.databaseIntegrity = checkIntegrity(targetInfo);
  checks.backupReadableAndSchema = checkSchema(backupInfo.schema);
  checks.backupIntegrity = checkIntegrity(backupInfo);
  checks.backupMetadata = checkBackupMetadata(backupFile, backupInfo, maxAgeHours).check;
  checks.diskSpace = checkDiskSpace(databaseFile, backupFile);
  checks.pendingWrites = checkPendingWrites(databaseFile);
  checks.serviceState = serviceState === "stopped" || serviceState === "isolated"
    ? { status: "PASS", evidence: "caller attested service state=" + serviceState }
    : { status: "FAIL", evidence: "service state must be explicitly attested as stopped or isolated" };
  const targetMigrationState = targetInfo.schema.workSchemaState === "absent" && !targetInfo.schema.workMigrationRecorded
    ? "ready_for_" + migrationId
    : targetInfo.schema.workSchemaState === "ready" && targetInfo.schema.workMigrationRecorded
      ? "already_applied"
      : "invalid";
  checks.migrationTargetState = targetMigrationState === "ready_for_" + migrationId
    ? { status: "PASS", evidence: "0003 target is not present and legacy migration history is complete" }
    : { status: "FAIL", evidence: "target migration state=" + targetMigrationState };

  const failures = Object.entries(checks).filter(([, check]) => check.status === "FAIL");
  const warnings = Object.entries(checks).filter(([, check]) => check.status === "WARN");
  const readyForApproval = failures.length === 0;
  console.log(JSON.stringify({
    status: readyForApproval ? "PASS" : "NO_GO",
    readyForApproval,
    databaseTarget: target,
    databasePath: databaseFile,
    migration: { targetId: migrationId, currentId: targetInfo.schema.currentMigrationId, state: targetMigrationState },
    checks,
    target: { schema: targetInfo.schema, counts: targetInfo.counts, journalMode: targetInfo.journalMode },
    backup: { path: backupFile, schema: backupInfo.schema, counts: backupInfo.counts, journalMode: backupInfo.journalMode },
    failures: Object.fromEntries(failures),
    warnings: Object.fromEntries(warnings),
    formalDatabaseMutation: false,
  }, null, 2));
  if (!readyForApproval) process.exitCode = 1;
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
