import { NextResponse } from "next/server";
import { createOwnedCopy } from "@/lib/db/repository";
import { normalizeISBN } from "@/lib/isbn";
import type { ContributorInput } from "@/lib/catalog/contributors";
export const dynamic = "force-dynamic";
function parseContributors(value: unknown): ContributorInput[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value as ContributorInput[];
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as ContributorInput[] : undefined;
  } catch {
    return undefined;
  }
}

function splitCredits(value: unknown) {
  return typeof value === "string" ? value.split(/[,，、;]/).map((item) => item.trim()).filter(Boolean) : [];
}

export async function POST(request: Request) {
  const body = await request.json() as { rows?: Array<Record<string, unknown>> };
  const created = (body.rows ?? []).map((row) => {
    const contributors = parseContributors(row.contributors);
    const authors = splitCredits(row.authors || row.author);
    const hasStructuredAuthor = contributors?.some((item) => item.role === "author") ?? false;
    return createOwnedCopy({
      edition: {
        id: crypto.randomUUID(),
        title: String(row.title || row.name || "未命名书目"),
        authors: authors.length || hasStructuredAuthor ? authors : ["未知作者"],
        translators: splitCredits(row.translators || row.translator),
        contributors,
        publisher: typeof row.publisher === "string" ? row.publisher : undefined,
        publicationYear: Number(row.year) || undefined,
        isbn13: normalizeISBN(String(row.isbn13 || row.isbn || ""))?.isbn13,
        source: "import",
      },
      location: typeof row.location === "string" ? row.location : undefined,
      shelfLocationId: typeof row.shelfLocationId === "string" ? row.shelfLocationId : typeof row.locationId === "string" ? row.locationId : undefined,
      shelfSlot: typeof row.shelfSlot === "string" ? row.shelfSlot : undefined,
      shelfCoordinate: typeof row.shelfCoordinate === "string" ? row.shelfCoordinate : undefined,
      locationSortOrder: row.locationSortOrder ? Number(row.locationSortOrder) : undefined,
      notes: typeof row.notes === "string" ? row.notes : undefined,
    });
  });
  return NextResponse.json({ imported: created.length });
}
