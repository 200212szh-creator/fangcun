import { NextResponse } from "next/server";
import { listCategories, listLocations, listShelves, listTags } from "@/lib/db/repository";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ categories: listCategories(), shelves: listShelves(true), locations: listLocations(true), tags: listTags() }); }
