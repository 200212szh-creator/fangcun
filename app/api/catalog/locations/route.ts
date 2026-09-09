import { NextResponse } from "next/server";
import { createLocation, listLocations } from "@/lib/db/repository";
import { LOCATION_NODE_TYPES } from "@/lib/location/model";
import { LocationDomainError } from "@/lib/db/location-repository";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof LocationDomainError) {
    const status = error.code === "LOCATION_NOT_FOUND" || error.code === "PARENT_NOT_FOUND" ? 404 : error.code === "LOCATION_IN_USE" || error.code === "LOCATION_CODE_CONFLICT" ? 409 : 400;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  return NextResponse.json({ error: "LOCATION_WRITE_FAILED" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({ items: listLocations(true) });
}

export async function POST(request: Request) {
  const body = await request.json() as { name?: string; type?: string; parentId?: string | null; room?: string; displayCode?: string | null };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  const type = body.type ?? "shelf";
  if (!(LOCATION_NODE_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: "INVALID_LOCATION_TYPE" }, { status: 400 });
  try {
    return NextResponse.json(createLocation({ name, type: type as typeof LOCATION_NODE_TYPES[number], parentId: body.parentId, room: body.room?.trim(), displayCode: body.displayCode?.trim() || null }), { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
