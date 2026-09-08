import { NextResponse } from "next/server";
import { listCategories, listShelves, listTags } from "@/lib/db/repository";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ categories: listCategories(), shelves: listShelves(true), tags: listTags() }); }
