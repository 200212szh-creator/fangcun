import { NextResponse } from "next/server";
import { createShelf, listShelves } from "@/lib/db/repository";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ items: listShelves(true) }); }
export async function POST(request: Request) { const body = await request.json() as { name?: string; parentId?: string; room?: string }; if (!body.name?.trim()) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 }); return NextResponse.json(createShelf({ name: body.name.trim(), parentId: body.parentId, room: body.room }), { status: 201 }); }
