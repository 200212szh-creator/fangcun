import { NextResponse } from "next/server";
import { createOwnedCopy, listOwnedCopies } from "@/lib/db/repository";
import { bookInputSchema } from "@/lib/validations";
import { normalizeISBN } from "@/lib/isbn";

export const dynamic = "force-dynamic";

export async function GET() { const items = listOwnedCopies(); return NextResponse.json({ items, total: items.length }); }

export async function POST(request: Request) {
  const parsed = bookInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BOOK", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const isbn = normalizeISBN(input.isbn13 || input.isbn10);
  const edition = { id: crypto.randomUUID(), title: input.title, authors: input.authors.split(/[,，、]/).map((item) => item.trim()).filter(Boolean), translators: input.translators?.split(/[,，、]/).map((item) => item.trim()).filter(Boolean), contributors: input.contributors, publisher: input.publisher || undefined, publicationYear: typeof input.publicationYear === "number" ? input.publicationYear : undefined, publicationDate: input.publicationDate || undefined, isbn10: isbn?.isbn10, isbn13: isbn?.isbn13, language: input.language || undefined, format: input.format || undefined, pages: typeof input.pages === "number" ? input.pages : undefined, originalTitle: input.originalTitle || undefined, seriesName: input.seriesName || undefined, editionStatement: input.editionStatement || undefined, editionNumber: typeof input.editionNumber === "number" ? input.editionNumber : undefined, printRun: typeof input.printRun === "number" ? input.printRun : undefined, editionNotes: input.editionNotes || undefined, originalPublisher: input.originalPublisher || undefined, description: input.description || undefined, source: "manual" };
  const result = createOwnedCopy({ edition, location: input.location, shelfLocationId: input.shelfLocationId, shelfSlot: input.shelfSlot, shelfCoordinate: input.shelfCoordinate, locationSortOrder: typeof input.locationSortOrder === "number" ? input.locationSortOrder : undefined, categoryId: input.categoryId, readingStatus: input.readingStatus, notes: input.notes, acquiredAt: input.acquiredAt || undefined, acquisitionMethod: input.acquisitionMethod, acquisitionSource: input.acquisitionSource, acquisitionPlace: input.acquisitionPlace, priceCents: typeof input.priceCents === "number" ? input.priceCents : undefined, currency: input.currency?.toUpperCase(), condition: input.condition, inscription: input.inscription, receiptNote: input.receiptNote });
  return NextResponse.json(result, { status: 201 });
}
