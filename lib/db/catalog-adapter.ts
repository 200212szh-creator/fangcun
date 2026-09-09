import { ensureDatabase, sqlite } from "@/lib/db";
import { uid } from "@/lib/utils";
import type { BookEdition, OwnedCopy, Work } from "@/lib/types";

export type CatalogSchemaMode = "legacy" | "work";

export type CatalogOwnedCopyInput = {
  edition: BookEdition;
  location?: string;
  shelfLocationId?: string;
  shelfSlot?: string;
  shelfCoordinate?: string;
  locationSortOrder?: number;
  categoryId?: string;
  readingStatus?: string;
  rating?: number;
  notes?: string;
  acquiredAt?: string;
  acquisitionMethod?: OwnedCopy["acquisitionMethod"];
  acquisitionSource?: string;
  acquisitionPlace?: string;
  priceCents?: number;
  currency?: string;
  condition?: string;
  inscription?: string;
  receiptNote?: string;
};

export type CatalogEditionWriteResult = { editionId: string; workId?: string };

export class CatalogCompatibilityError extends Error {
  constructor(
    public readonly code: "INCOMPLETE_WORK_SCHEMA" | "WORK_MIGRATION_UNRECORDED" | "WORK_RELATION_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "CatalogCompatibilityError";
  }
}

type WorkRow = {
  edition_id: string;
  work_id: string | null;
  work_record_id: string | null;
  title: string | null;
  original_title: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function hasTable(tableName: string) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName));
}

function hasColumn(tableName: string, columnName: string) {
  return (sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).some((column) => column.name === columnName);
}

/**
 * Work-aware consumers may only use the new layer when both schema shape and
 * migration history agree. A partially created table/column is an explicit
 * failure, not a legacy fallback, because returning an unlinked book would be
 * silently incorrect.
 */
export function getCatalogSchemaMode(): CatalogSchemaMode {
  ensureDatabase();
  const worksPresent = hasTable("works");
  const workIdPresent = hasColumn("book_editions", "work_id");
  if (worksPresent !== workIdPresent) {
    throw new CatalogCompatibilityError("INCOMPLETE_WORK_SCHEMA", "Work schema is only partially present");
  }
  if (!worksPresent) return "legacy";
  if (!hasTable("schema_migrations") || !sqlite.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get("0003_works")) {
    throw new CatalogCompatibilityError("WORK_MIGRATION_UNRECORDED", "Work schema exists without recorded migration 0003_works");
  }
  return "work";
}

function toWork(row: WorkRow): Work {
  if (!row.work_id || !row.work_record_id || row.title === null || row.created_at === null || row.updated_at === null) {
    throw new CatalogCompatibilityError("WORK_RELATION_MISSING", `Edition ${row.edition_id} has no valid Work relation`);
  }
  return {
    id: row.work_record_id,
    title: row.title,
    originalTitle: row.original_title ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function loadWorksForEditions(editionIds: string[]) {
  const mode = getCatalogSchemaMode();
  const result = new Map<string, Work>();
  if (mode === "legacy" || editionIds.length === 0) return result;

  const rows = sqlite.prepare("SELECT e.id AS edition_id, e.work_id, w.id AS work_record_id, w.title, w.original_title, w.description, w.created_at, w.updated_at FROM book_editions e LEFT JOIN works w ON w.id=e.work_id").all() as WorkRow[];
  const rowsByEdition = new Map(rows.map((row) => [row.edition_id, row]));
  for (const editionId of new Set(editionIds)) {
    const row = rowsByEdition.get(editionId);
    if (!row) throw new CatalogCompatibilityError("WORK_RELATION_MISSING", `Edition ${editionId} cannot be loaded`);
    result.set(editionId, toWork(row));
  }
  return result;
}

export function assertEditionWorkRelation(editionId: string) {
  if (getCatalogSchemaMode() === "legacy") return;
  const row = sqlite.prepare("SELECT e.id AS edition_id, e.work_id, w.id AS work_record_id, w.title, w.original_title, w.description, w.created_at, w.updated_at FROM book_editions e LEFT JOIN works w ON w.id=e.work_id WHERE e.id=?").get(editionId) as WorkRow | undefined;
  if (!row) throw new CatalogCompatibilityError("WORK_RELATION_MISSING", `Edition ${editionId} cannot be loaded`);
  toWork(row);
}

function insertEdition(editionId: string, edition: BookEdition, workId?: string) {
  const values = [
    editionId,
    edition.title,
    JSON.stringify(edition.authors),
    JSON.stringify(edition.translators ?? []),
    edition.publisher ?? null,
    edition.publicationYear ?? null,
    edition.edition ?? null,
    edition.originalTitle ?? null,
    edition.seriesName ?? null,
    edition.editionStatement ?? null,
    edition.editionNumber ?? null,
    edition.printRun ?? null,
    edition.publicationDate ?? null,
    edition.editionNotes ?? null,
    edition.originalPublisher ?? null,
    edition.format ?? null,
    edition.language ?? null,
    edition.isbn10 ?? null,
    edition.isbn13 ?? null,
    edition.pages ?? null,
    edition.description ?? null,
    edition.coverUrl ?? null,
    JSON.stringify(edition.subjects ?? []),
    edition.source,
    edition.externalId ?? null,
    "{}",
  ];
  const placeholders = values.map(() => "?").join(",");
  if (workId) {
    sqlite.prepare(`INSERT INTO book_editions (id,title,authors,translators,publisher,publication_year,edition,original_title,series_name,edition_statement,edition_number,print_run,publication_date,edition_notes,original_publisher,format,language,isbn10,isbn13,pages,description,cover_url,subjects,source,external_id,user_override,work_id) VALUES (${placeholders},?)`).run(...values, workId);
    return;
  }
  sqlite.prepare(`INSERT INTO book_editions (id,title,authors,translators,publisher,publication_year,edition,original_title,series_name,edition_statement,edition_number,print_run,publication_date,edition_notes,original_publisher,format,language,isbn10,isbn13,pages,description,cover_url,subjects,source,external_id,user_override) VALUES (${placeholders})`).run(...values);
}

function ensureEditionInTransaction(mode: CatalogSchemaMode, edition: BookEdition): CatalogEditionWriteResult {
  const editionId = edition.id || uid();
  if (mode === "work") {
    const existing = sqlite.prepare("SELECT id, work_id FROM book_editions WHERE id=?").get(editionId) as { id: string; work_id: string | null } | undefined;
    if (existing) {
      if (!existing.work_id) throw new CatalogCompatibilityError("WORK_RELATION_MISSING", `Edition ${editionId} has no Work relation`);
      return { editionId, workId: existing.work_id };
    }
  } else {
    const existing = sqlite.prepare("SELECT id FROM book_editions WHERE id=?").get(editionId) as { id: string } | undefined;
    if (existing) return { editionId };
  }

  if (mode === "legacy") {
    insertEdition(editionId, edition);
    return { editionId };
  }

  const now = new Date().toISOString();
  const workId = uid();
  sqlite.prepare("INSERT INTO works (id,title,original_title,description,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(workId, edition.title, edition.originalTitle ?? null, edition.description ?? null, now, now);
  insertEdition(editionId, edition, workId);
  return { editionId, workId };
}

export function createCatalogEdition(edition: BookEdition) {
  const mode = getCatalogSchemaMode();
  const write = sqlite.transaction(() => ensureEditionInTransaction(mode, edition));
  return write();
}

export function createCatalogOwnedCopy(input: CatalogOwnedCopyInput) {
  const mode = getCatalogSchemaMode();
  const write = sqlite.transaction(() => {
    const edition = ensureEditionInTransaction(mode, input.edition);
    const duplicate = input.edition.isbn13
      ? sqlite.prepare("SELECT c.id FROM owned_copies c JOIN book_editions e ON e.id=c.edition_id WHERE e.isbn13=? AND c.user_id=? AND c.deleted_at IS NULL LIMIT 1").get(input.edition.isbn13, "local-owner") as { id: string } | undefined
      : undefined;
    const now = new Date().toISOString();
    const id = uid();
    sqlite.prepare("INSERT INTO owned_copies (id,user_id,edition_id,location,category_id,reading_status,rating,notes,acquired_at,created_at,updated_at,acquisition_method,acquisition_source,acquisition_place,price_cents,currency,condition,inscription,receipt_note,shelf_location_id,shelf_slot,shelf_coordinate,location_sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, "local-owner", edition.editionId, input.location ?? null, input.categoryId ?? null, input.readingStatus ?? "unread", input.rating ?? null, input.notes ?? null, input.acquiredAt ?? now.slice(0, 10), now, now, input.acquisitionMethod ?? null, input.acquisitionSource ?? null, input.acquisitionPlace ?? null, input.priceCents ?? null, input.currency ?? null, input.condition ?? null, input.inscription ?? null, input.receiptNote ?? null, input.shelfLocationId ?? null, input.shelfSlot ?? null, input.shelfCoordinate ?? null, input.locationSortOrder ?? null);
    return { id, duplicateId: duplicate?.id ?? null };
  });
  return write();
}
