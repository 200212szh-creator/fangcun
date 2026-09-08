import type { BookEdition } from "@/lib/types";

export function mergeEdition(primary: BookEdition, fallback?: Partial<BookEdition>) {
  if (!fallback) return primary;
  return {
    ...primary,
    translators: primary.translators?.length ? primary.translators : fallback.translators,
    publisher: primary.publisher || fallback.publisher,
    publicationYear: primary.publicationYear || fallback.publicationYear,
    edition: primary.edition || fallback.edition,
    format: primary.format || fallback.format,
    language: primary.language || fallback.language,
    isbn10: primary.isbn10 || fallback.isbn10,
    isbn13: primary.isbn13 || fallback.isbn13,
    pages: primary.pages || fallback.pages,
    description: primary.description || fallback.description,
    coverUrl: primary.coverUrl || fallback.coverUrl,
    subjects: primary.subjects?.length ? primary.subjects : fallback.subjects,
  };
}

export function dedupeEditions(editions: BookEdition[]) {
  const seen = new Set<string>();
  return editions.filter((edition) => {
    const key = edition.isbn13 || `${edition.title.toLowerCase()}-${edition.publisher ?? ""}-${edition.publicationYear ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
