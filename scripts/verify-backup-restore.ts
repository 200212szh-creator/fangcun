import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { inspectSchema, REQUIRED_RUNTIME_TABLES } from "@/lib/db/schema-truth";

function value(name: string) {
  const prefix = "--" + name + "=";
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : undefined;
}

function absolutePath(name: string, candidate: string | undefined) {
  if (!candidate || !path.isAbsolute(candidate)) throw new Error(name + " must be an explicit absolute path");
  return path.normalize(candidate);
}

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function countTables(database: Database.Database) {
  const existing = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name));
  return Object.fromEntries(REQUIRED_RUNTIME_TABLES.filter((table) => existing.has(table)).map((table) => [
    table,
    Number((database.prepare("SELECT COUNT(*) AS count FROM " + table).get() as { count: number }).count),
  ]));
}

function validateRestoredCopy(file: string) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const schema = inspectSchema(database);
    const integrity = String(database.pragma("integrity_check", { simple: true }));
    const quickCheck = String(database.pragma("quick_check", { simple: true }));
    const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
    const missingTables = REQUIRED_RUNTIME_TABLES.filter((table) => !schema.tables.includes(table));
    if (missingTables.length || integrity !== "ok" || quickCheck !== "ok" || foreignKeyViolations !== 0) {
      throw new Error("restore validation failed: missing tables=" + missingTables.join(",") + "; integrity_check=" + integrity + "; quick_check=" + quickCheck + "; foreign_key_violations=" + foreignKeyViolations);
    }
    return { schema, counts: countTables(database), integrity, quickCheck, foreignKeyViolations };
  } finally {
    database.close();
  }
}

function main() {
  const target = (value("target") || "ISOLATED").toUpperCase();
  if (target !== "ISOLATED") throw new Error("restore verification only accepts target=ISOLATED; it never writes a formal target");
  const source = absolutePath("backup", value("backup"));
  if (!fs.existsSync(source)) throw new Error("backup does not exist: " + source);
  const metadataFile = source + ".json";
  if (!fs.existsSync(metadataFile)) throw new Error("backup sidecar is missing: " + metadataFile);
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8")) as Record<string, unknown>;
  const expectedHash = typeof metadata.sha256 === "string" ? metadata.sha256 : "";
  if (!expectedHash || sha256(source) !== expectedHash) throw new Error("backup SHA-256 does not match its sidecar");
  if (metadata.integrity !== "ok") throw new Error("backup sidecar integrity marker is not ok");

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fangcun-restore-verify-"));
  const restoredCopy = path.join(temporaryRoot, "restored.db");
  try {
    fs.copyFileSync(source, restoredCopy, fs.constants.COPYFILE_EXCL);
    const validation = validateRestoredCopy(restoredCopy);
    console.log(JSON.stringify({
      status: "PASS",
      databaseTarget: "ISOLATED",
      sourceBackup: source,
      isolatedRestoreCopy: restoredCopy,
      restoredCopyRemovedAfterValidation: true,
      sha256: expectedHash,
      validation,
      formalDatabaseMutation: false,
    }, null, 2));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
