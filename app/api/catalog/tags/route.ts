import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, ensureDatabase } from "@/lib/db";
import { uid } from "@/lib/utils";

const USER_ID = "local-owner";

export async function POST(request: Request) {
  const body = await request.json() as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  ensureDatabase();
  const id = uid();
  db.run(sql`INSERT OR IGNORE INTO tags (id,name,user_id) VALUES (${id},${name},${USER_ID})`);
  return NextResponse.json({ id, name }, { status: 201 });
}
