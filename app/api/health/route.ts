import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";

const requiredTables = [
  "book_editions",
  "owned_copies",
  "shelf_locations",
  "categories",
  "tags",
  "loans",
  "annotations",
];

function buildId() {
  const configured = process.env.FANGCUN_BUILD_ID?.trim();
  if (configured) return configured;
  try {
    return fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const existing = new Set(
      (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name),
    );
    const database = requiredTables.every((table) => existing.has(table)) ? "ok" : "degraded";
    const status = database === "ok" ? "ok" : "degraded";
    return NextResponse.json({ app: "fangcun-archive", status, database, buildId: buildId(), time: new Date().toISOString() }, { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ app: "fangcun-archive", status: "error", database: "error", buildId: buildId(), time: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
