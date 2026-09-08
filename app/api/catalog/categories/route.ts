import { NextResponse } from "next/server";
import { createCategory, listCategories } from "@/lib/db/repository";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ items: listCategories() }); }
export async function POST(request: Request) { const body = await request.json() as { name?: string; description?: string; color?: string }; if (!body.name?.trim()) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 }); return NextResponse.json(createCategory({ name: body.name.trim(), description: body.description, color: body.color }), { status: 201 }); }
