import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { inspectSchema } from "@/lib/db/schema-truth";
import { readReleaseProvenance } from "@/lib/runtime/provenance";

const requiredTables = [
  "book_editions",
  "owned_copies",
  "shelf_locations",
  "categories",
  "tags",
  "loans",
  "annotations",
];

function getReleaseDirectory() {
  return path.resolve(process.env.FANGCUN_RELEASE_DIR?.trim() || process.cwd());
}

function getFallbackBuildId() {
  const configured = process.env.FANGCUN_BUILD_ID?.trim();
  if (configured) return configured;
  try { return fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || "unknown"; } catch { return "unknown"; }
}

export const dynamic = "force-dynamic";

export function GET() {
  const release = readReleaseProvenance(getReleaseDirectory());
  try {
    const schema = inspectSchema(sqlite);
    const existing = new Set(schema.tables);
    const databaseReady = requiredTables.every((table) => existing.has(table))
      && schema.missingRuntimeTables.length === 0
      && Object.keys(schema.missingRuntimeColumns).length === 0
      && schema.missingRequiredMigrations.length === 0
      && schema.unknownMigrations.length === 0
      && !["partial", "present-unrecorded", "recorded-without-schema"].includes(schema.workSchemaState);
    const database = databaseReady ? "ok" : "degraded";
    const productionProvenanceReady = !process.env.FANGCUN_RELEASE_DIR || release.complete;
    const status = database === "ok" && productionProvenanceReady ? "ok" : "degraded";
    const payload = {
      app: "fangcun-archive",
      status,
      database,
      release: release.release,
      releaseDir: release.releaseDir,
      buildId: release.buildId === "unknown" ? getFallbackBuildId() : release.buildId,
      sourceCommit: release.sourceCommit,
      dirty: release.dirty,
      buildTimestamp: release.buildTimestamp,
      provenanceStatus: release.complete ? "ok" : "incomplete",
      migrations: schema.migrations.map((migration) => migration.id),
      currentMigration: schema.currentMigrationId,
      schemaMigrationState: schema.workSchemaState,
      migrationState: { current: schema.currentMigrationId, applied: schema.migrations.map((migration) => migration.id), status: schema.workSchemaState },
      time: new Date().toISOString(),
    };
    return NextResponse.json(payload, { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ app: "fangcun-archive", status: "error", database: "error", release: release.release, releaseDir: release.releaseDir, buildId: release.buildId === "unknown" ? getFallbackBuildId() : release.buildId, sourceCommit: release.sourceCommit, dirty: release.dirty, buildTimestamp: release.buildTimestamp, provenanceStatus: release.complete ? "ok" : "incomplete", migrations: [], currentMigration: null, schemaMigrationState: "error", time: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
