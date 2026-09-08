import { NextResponse } from "next/server";
import { unifiedSearch } from "@/lib/discovery/providers";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const params = new URL(request.url).searchParams; const kind = params.get("kind") === "paper" ? "paper" : "book"; const id = params.get("id") ?? ""; return NextResponse.json({ items: await unifiedSearch(kind, id) }); }
