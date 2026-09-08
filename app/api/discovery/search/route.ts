import { NextResponse } from "next/server";
import { searchForApi } from "@/lib/discovery/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const type = (params.get("type") ?? "all") as "all" | "book" | "paper";
  if (!q) return NextResponse.json({ items: [], nextCursor: null, offline: false });
  const items = await searchForApi(type, q);
  return NextResponse.json({ items, nextCursor: null, offline: items.length === 0 });
}
