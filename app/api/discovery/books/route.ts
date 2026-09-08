import { NextResponse } from "next/server";
import { getLastBookSearchOffline, searchBookCandidates } from "@/lib/discovery/providers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ items: [], nextCursor: null, offline: false });
  const items = await searchBookCandidates(q, params.get("author") ?? undefined, params.get("language") ?? undefined);
  const offline = getLastBookSearchOffline();
  return NextResponse.json({ items, nextCursor: null, offline, service: offline ? "unavailable" : "online" });
}
