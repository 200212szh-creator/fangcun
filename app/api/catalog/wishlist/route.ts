import { NextResponse } from "next/server";
import { addWishlist, listWishlist, removeWishlist } from "@/lib/db/repository";
import type { BookEdition } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ items: listWishlist() }); }
export async function POST(request: Request) { const body = await request.json() as { edition?: BookEdition; note?: string }; if (!body.edition?.title) return NextResponse.json({ error: "EDITION_REQUIRED" }, { status: 400 }); return NextResponse.json(addWishlist(body.edition, body.note), { status: 201 }); }
export async function DELETE(request: Request) { const id = new URL(request.url).searchParams.get("id"); if (id) removeWishlist(id); return NextResponse.json({ ok: true }); }
