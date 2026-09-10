import { normalizeISBN } from "@/lib/isbn";
import { dedupeEditions } from "@/lib/discovery/merge";
import { getCached, setCached, CACHE_TTL } from "@/lib/discovery/cache";
import { rankCandidates, scoreCandidate } from "@/lib/discovery/matching";
import { listOwnedCopies } from "@/lib/db/repository";
import type { BookCandidate, BookEdition, SearchResult } from "@/lib/types";

const candidateTitles = new Map<string, string>();
let googleCoolingUntil = 0;

async function fetchJson<T>(url: string, { attempts = 1, timeout = 7000, onRateLimit, onResponse }: { attempts?: number; timeout?: number; onRateLimit?: () => void; onResponse?: () => void } = {}): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": `FangcunArchive/1.0 (mailto:${process.env.OPEN_LIBRARY_CONTACT_EMAIL || "local-owner@example.invalid"})` }, cache: "no-store" });
      if (response.status === 429) { onRateLimit?.(); return null; }
      onResponse?.();
      if (response.status >= 500) throw new Error(`upstream-${response.status}`);
      if (!response.ok) return null;
      return await response.json() as T;
    } catch {
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    } finally { clearTimeout(timer); }
  }
  return null;
}

type GoogleVolume = { id: string; volumeInfo?: { title?: string; authors?: string[]; publisher?: string; publishedDate?: string; description?: string; industryIdentifiers?: Array<{ type: string; identifier: string }>; pageCount?: number; printType?: string; categories?: string[]; imageLinks?: { thumbnail?: string }; language?: string } };

function googleEdition(volume: GoogleVolume): BookEdition | null {
  const info = volume.volumeInfo;
  if (!info?.title) return null;
  const ids = info.industryIdentifiers ?? [];
  const isbn13 = ids.find((id) => id.type === "ISBN_13")?.identifier;
  const isbn10 = ids.find((id) => id.type === "ISBN_10")?.identifier;
  return { id: `google-${volume.id}`, title: info.title, authors: info.authors ?? [], publisher: info.publisher, publicationYear: info.publishedDate ? Number(info.publishedDate.slice(0, 4)) : undefined, format: info.printType === "BOOK" ? "Book" : info.printType, language: info.language, isbn10, isbn13: normalizeISBN(isbn13 || isbn10)?.isbn13 || isbn13, pages: info.pageCount, description: info.description, coverUrl: info.imageLinks?.thumbnail, subjects: info.categories, source: "Google Books", externalId: volume.id };
}

async function googleSearch(query: string, status?: { available: boolean }) {
  if (Date.now() < googleCoolingUntil) return [];
  const key = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${encodeURIComponent(process.env.GOOGLE_BOOKS_API_KEY)}` : "";
  const data = await fetchJson<{ items?: GoogleVolume[] }>(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12${key}`, { timeout: 3500, onRateLimit: () => { googleCoolingUntil = Date.now() + 5 * 60_000; }, onResponse: () => { if (status) status.available = true; } });
  return (data?.items ?? []).map(googleEdition).filter((item): item is BookEdition => Boolean(item));
}

async function googleVolume(id: string) {
  if (Date.now() < googleCoolingUntil) return [];
  const data = await fetchJson<GoogleVolume>(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`, { timeout: 3500, onRateLimit: () => { googleCoolingUntil = Date.now() + 5 * 60_000; } });
  const edition = data ? googleEdition(data) : null;
  return edition ? [edition] : [];
}

type OpenLibraryDocument = { key: string; title?: string; author_name?: string[]; first_publish_year?: number; publisher?: string[]; isbn?: string[]; number_of_pages_median?: number; cover_i?: number; subject?: string[] };
const openLibraryFields = "key,title,author_name,first_publish_year,publisher,isbn,number_of_pages_median,cover_i,subject";

function toOpenLibraryEdition(doc: OpenLibraryDocument): BookEdition | null {
  if (!doc.title) return null;
  const isbn = doc.isbn?.find((item) => normalizeISBN(item)?.isbn13);
  return { id: `open-${doc.key.replace(/\//g, "-")}`, title: doc.title, authors: doc.author_name ?? [], publisher: doc.publisher?.[0], publicationYear: doc.first_publish_year, isbn13: normalizeISBN(isbn)?.isbn13, pages: doc.number_of_pages_median, coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined, subjects: doc.subject?.slice(0, 5), source: "Open Library" };
}

async function openLibrarySearch(query: string, status?: { available: boolean }) {
  const params = new URLSearchParams({ title: query, limit: "12", fields: openLibraryFields });
  const exact = await fetchJson<{ docs?: OpenLibraryDocument[] }>(`https://openlibrary.org/search.json?${params.toString()}`, { timeout: 5000, onResponse: () => { if (status) status.available = true; } });
  const editions = (exact?.docs ?? []).map(toOpenLibraryEdition).filter((item): item is BookEdition => Boolean(item));
  if (editions.length || !exact) return editions;
  const fallbackParams = new URLSearchParams({ q: query, limit: "12", fields: openLibraryFields });
  const fallback = await fetchJson<{ docs?: OpenLibraryDocument[] }>(`https://openlibrary.org/search.json?${fallbackParams.toString()}`, { timeout: 5000, onResponse: () => { if (status) status.available = true; } });
  return (fallback?.docs ?? []).map(toOpenLibraryEdition).filter((item): item is BookEdition => Boolean(item));
}

const candidateFromEdition = (edition: BookEdition, editionCount: number): BookCandidate => ({ id: edition.id, title: edition.title, authors: edition.authors, description: edition.description, coverUrl: edition.coverUrl, publisher: edition.publisher, publicationYear: edition.publicationYear, format: edition.format, language: edition.language, isbn13: edition.isbn13, score: 0.8, editionCount, source: edition.source });
const localEditions = new Map<string, BookEdition>();

function localBookCandidates(query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [] as BookCandidate[];
  return listOwnedCopies().map((copy) => copy.edition).filter((edition) => {
    const contributorNames = (edition.contributors ?? []).flatMap((item) => "contributor" in item ? [item.contributor.displayName, item.creditedAs ?? ""] : [item.displayName, item.creditedAs ?? ""]);
    const haystack = [edition.title, edition.authors.join(" "), edition.translators?.join(" ") ?? "", contributorNames.join(" "), edition.isbn13 ?? ""].join(" ").toLocaleLowerCase();
    return haystack.includes(needle) || edition.title.toLocaleLowerCase().includes(needle);
  }).map((edition) => {
    const candidate = candidateFromEdition({ ...edition, source: "本地藏书" }, 1);
    localEditions.set(candidate.id, edition);
    return candidate;
  });
}

export function searchLocalBookCandidates(query: string) {
  return localBookCandidates(query);
}

let lastBookSearchOffline = false;
export function getLastBookSearchOffline() { return lastBookSearchOffline; }

export async function searchBookCandidates(query: string, author?: string, language?: string) {
  const cacheKey = `book-candidates:${query}:${author ?? ""}:${language ?? ""}`;
  const cached = getCached<BookCandidate[]>(cacheKey);
  if (cached?.length) { cached.forEach((candidate) => candidateTitles.set(candidate.id, candidate.title)); return cached; }
  const search = `${query}${author ? ` ${author}` : ""}`;
  const status = { available: false };
  const [google, open] = await Promise.all([googleSearch(search, status), openLibrarySearch(search, status)]);
  lastBookSearchOffline = !status.available;
  const grouped = new Map<string, { edition: BookEdition; count: number }>();
  [...google, ...open].forEach((edition) => {
    const key = `${edition.title.toLocaleLowerCase()}-${edition.authors.join(",").toLocaleLowerCase()}`;
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { edition, count: 1 });
  });
  const candidates = [...grouped.values()].map(({ edition, count }) => candidateFromEdition(edition, count));
  const ranked = rankCandidates(query, candidates).filter((candidate) => scoreCandidate(query, candidate) >= 0.55).slice(0, 8);
  const local = localBookCandidates(query);
  const results = [...local, ...ranked.filter((candidate) => !local.some((item) => item.id === candidate.id))].slice(0, 8);
  results.forEach((candidate) => candidateTitles.set(candidate.id, candidate.title));
  return results.length ? setCached(cacheKey, results, CACHE_TTL.search) : [];
}

export async function getBookEditions(candidateId: string, titleOverride?: string) {
  const cacheKey = `editions:${candidateId}`;
  const cached = getCached<BookEdition[]>(cacheKey);
  if (cached?.length) return cached;
  const local = localEditions.get(candidateId) ?? listOwnedCopies().map((copy) => copy.edition).find((edition) => edition.id === candidateId);
  if (local) return [local];
  const title = titleOverride?.trim() || candidateTitles.get(candidateId);
  const directGoogle = candidateId.startsWith("google-") ? await googleVolume(candidateId.replace(/^google-/, "")) : [];
  if (!title && !directGoogle.length) return setCached(cacheKey, [], CACHE_TTL.search);
  const [google, open] = title ? await Promise.all([googleSearch(title), openLibrarySearch(title)]) : [[], []];
  return setCached(cacheKey, dedupeEditions([...directGoogle, ...google, ...open]).slice(0, 8), CACHE_TTL.search);
}

export async function getBookByISBN(isbn: string) {
  const normalized = normalizeISBN(isbn);
  if (!normalized) return [];
  const cacheKey = `isbn:${normalized.isbn13}`;
  const cached = getCached<BookEdition[]>(cacheKey);
  if (cached?.length) return cached;
  const [google, open] = await Promise.all([googleSearch(`isbn:${normalized.isbn13}`), openLibrarySearch(`isbn:${normalized.isbn13}`)]);
  return setCached(cacheKey, dedupeEditions([...google, ...open]), CACHE_TTL.exact);
}

type CrossrefItem = { DOI?: string; title?: string[]; author?: Array<{ given?: string; family?: string }>; abstract?: string; published?: { [key: string]: number[][] | undefined }; [key: string]: unknown };

export async function unifiedSearch(type: "all" | "book" | "paper", query: string): Promise<SearchResult[]> {
  const cacheKey = `unified:${type}:${query}`;
  const cached = getCached<SearchResult[]>(cacheKey);
  if (cached?.length) return cached;
  const booksPromise = type !== "paper" ? searchBookCandidates(query) : Promise.resolve([] as BookCandidate[]);
  const papersPromise = type !== "book" ? fetchJson<{ message?: { items?: CrossrefItem[] } }>(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=8&mailto=${encodeURIComponent(process.env.CROSSREF_MAILTO || "local-owner@example.invalid")}`, { timeout: 5000 }) : Promise.resolve(null);
  const [books, data] = await Promise.all([booksPromise, papersPromise]);
  const output: SearchResult[] = books.map((book) => ({ kind: "book", id: book.id, title: book.title, authors: book.authors, publisher: book.publisher, year: book.publicationYear, coverUrl: book.coverUrl, source: book.source, edition: { id: book.id, title: book.title, authors: book.authors, publisher: book.publisher, publicationYear: book.publicationYear, format: book.format, language: book.language, isbn13: book.isbn13, description: book.description, coverUrl: book.coverUrl, source: book.source } }));
  (data?.message?.items ?? []).forEach((item, index) => {
    const year = item.published?.["date-parts"]?.[0]?.[0];
    const links = Array.isArray(item.link) ? item.link as Array<{ URL?: string; "content-type"?: string }> : [];
    output.push({ kind: "paper", id: item.DOI || `crossref-${index}`, title: item.title?.[0] || "Untitled paper", authors: (item.author ?? []).map((author) => [author.given, author.family].filter(Boolean).join(" ")), abstract: item.abstract?.replace(/<[^>]+>/g, ""), journal: Array.isArray(item["container-title"]) ? (item["container-title"] as string[])[0] : undefined, year, doi: item.DOI, openAccessUrl: links.find((link) => link["content-type"] === "application/pdf")?.URL, source: "Crossref" });
  });
  return setCached(cacheKey, output.slice(0, 16), CACHE_TTL.search);
}
