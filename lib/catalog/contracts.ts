import type { AcquisitionMethod, BookEdition, OwnedCopy, ReadingStatus, Work } from "@/lib/types";

/**
 * Stable domain-facing Work shape. Database column names and migration-only
 * fields must not escape through this contract.
 */
export type WorkDto = Pick<Work, "id" | "title" | "originalTitle" | "description" | "createdAt" | "updatedAt">;

/**
 * Edition keeps the legacy metadata needed for lossless compatibility. The
 * service boundary owns this shape; raw SQLite rows do not.
 */
export type EditionDto = BookEdition;

export type CopyDto = Omit<OwnedCopy, "edition" | "work">;

export type CatalogBookServiceDto = {
  work?: WorkDto;
  edition: EditionDto;
  copy: CopyDto;
};

/**
 * Existing API consumers continue to receive OwnedCopy-shaped data. This is
 * an explicit compatibility DTO, not the long-term internal domain shape.
 */
export type CatalogBookCompatibilityDto = OwnedCopy;

export type CreateCatalogCopyDto = {
  location?: string;
  shelfLocationId?: string;
  shelfSlot?: string;
  shelfCoordinate?: string;
  locationSortOrder?: number;
  categoryId?: string;
  readingStatus?: ReadingStatus;
  rating?: number;
  notes?: string;
  acquiredAt?: string;
  acquisitionMethod?: AcquisitionMethod;
  acquisitionSource?: string;
  acquisitionPlace?: string;
  priceCents?: number;
  currency?: string;
  condition?: string;
  inscription?: string;
  receiptNote?: string;
};

export type CreateCatalogBookDto = {
  edition: EditionDto;
  copy: CreateCatalogCopyDto;
};

export type UpdateCatalogEditionDto = Partial<Omit<EditionDto, "id" | "source" | "workId">>;

export type UpdateCatalogCopyDto = Partial<Pick<
  CopyDto,
  | "location"
  | "shelfLocationId"
  | "shelfSlot"
  | "shelfCoordinate"
  | "locationSortOrder"
  | "category"
  | "readingStatus"
  | "rating"
  | "notes"
  | "acquiredAt"
  | "acquisitionMethod"
  | "acquisitionSource"
  | "acquisitionPlace"
  | "priceCents"
  | "currency"
  | "condition"
  | "inscription"
  | "receiptNote"
>>;

export type UpdateCatalogBookDto = {
  edition?: UpdateCatalogEditionDto;
  copy?: UpdateCatalogCopyDto;
};

export type CatalogBookWriteResult = { id: string; duplicateId: string | null };

export interface CatalogWriteBoundary {
  createBook(input: CreateCatalogBookDto): CatalogBookWriteResult;
  updateBook(copyId: string, input: UpdateCatalogBookDto): CatalogBookServiceDto | null;
  moveCopy(copyId: string, input: Pick<CreateCatalogCopyDto, "shelfLocationId" | "shelfSlot" | "shelfCoordinate" | "locationSortOrder">): CatalogBookServiceDto | null;
  loanCopy(copyId: string, input: { borrowerName: string; borrowerContact?: string; dueAt?: string; note?: string }): unknown;
}

export function toCatalogBookCompatibility(view: CatalogBookServiceDto): CatalogBookCompatibilityDto {
  return { ...view.copy, edition: view.edition, ...(view.work ? { work: view.work } : {}) };
}

export function toCatalogBookService(value: CatalogBookCompatibilityDto): CatalogBookServiceDto {
  const { edition, work, ...copy } = value;
  return { copy, edition, ...(work ? { work } : {}) };
}
