import { NextResponse } from "next/server";
import { createShelf, listShelves } from "@/lib/db/repository";
import { LocationDomainError } from "@/lib/db/location-repository";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ items: listShelves(true) }); }
export async function POST(request: Request) { const body = await request.json() as { name?: string; parentId?: string; room?: string }; if (!body.name?.trim()) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 }); try { return NextResponse.json(createShelf({ name: body.name.trim(), parentId: body.parentId, room: body.room }), { status: 201 }); } catch (error: unknown) { if (error instanceof LocationDomainError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "PARENT_NOT_FOUND" ? 404 : 400 }); return NextResponse.json({ error: "SHELF_WRITE_FAILED" }, { status: 400 }); } }
