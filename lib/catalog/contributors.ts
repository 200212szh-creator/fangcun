import { sqlite } from "@/lib/db";
import { uid } from "@/lib/utils";
import type { BookEdition } from "@/lib/types";

export const CONTRIBUTOR_ROLES = ["author", "translator", "editor", "compiler", "illustrator", "other"] as const;
export type ContributorRole = typeof CONTRIBUTOR_ROLES[number];

export type ContributorDto = {
  id: string;
  displayName: string;
  sortName?: string;
  normalizedName?: string;
  active: boolean;
};

export type EditionContributorDto = {
  contributor: ContributorDto;
  role: ContributorRole;
  orderIndex: number;
  creditedAs?: string;
};

export type ContributorInput = {
  id?: string;
  displayName: string;
  sortName?: string | null;
  normalizedName?: string | null;
  role: ContributorRole;
  orderIndex?: number;
  creditedAs?: string | null;
};

export type ContributorPayload = ContributorInput | EditionContributorDto;

export type ContributorModelState = "absent" | "ready" | "partial" | "present-unrecorded" | "recorded-without-schema";

const contributorColumns: Record<string, string[]> = {
  contributors: ["id", "display_name", "sort_name", "normalized_name", "active", "created_at", "updated_at"],
  edition_contributors: ["edition_id", "contributor_id", "role", "order_index", "credited_as"],
};

export class ContributorCompatibilityError extends Error {
  constructor(
    public readonly code: "INCOMPLETE_CONTRIBUTOR_SCHEMA" | "CONTRIBUTOR_MODEL_NOT_APPLIED" | "CONTRIBUTOR_NOT_FOUND" | "INVALID_CONTRIBUTOR",
    message: string,
  ) {
    super(message);
    this.name = "ContributorCompatibilityError";
  }
}

function hasTable(tableName: string) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName));
}

function hasColumn(tableName: string, columnName: string) {
  return (sqlite.prepare("PRAGMA table_info(" + tableName + ")").all() as Array<{ name: string }>).some((column) => column.name === columnName);
}

export function getContributorModelState(): ContributorModelState {
  const tableNames = Object.keys(contributorColumns);
  const present = tableNames.filter((table) => hasTable(table));
  const presentColumns = present.flatMap((table) => contributorColumns[table].filter((column) => hasColumn(table, column)));
  const expectedColumns = Object.values(contributorColumns).flat().length;
  const allTables = present.length === tableNames.length;
  const allColumns = presentColumns.length === expectedColumns;
  const migrationRecorded = Boolean(sqlite.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get("0005_contributors"));

  if (present.length === 0 && !migrationRecorded) return "absent";
  if (!allTables || !allColumns) return "partial";
  if (!migrationRecorded) return "present-unrecorded";
  return "ready";
}

function assertContributorModelReady() {
  const state = getContributorModelState();
  if (state === "absent") throw new ContributorCompatibilityError("CONTRIBUTOR_MODEL_NOT_APPLIED", "Contributor migration 0005_contributors is not applied");
  if (state !== "ready") throw new ContributorCompatibilityError("INCOMPLETE_CONTRIBUTOR_SCHEMA", "Contributor schema state is " + state);
}

export function hasContributorModel() {
  const state = getContributorModelState();
  if (state === "absent") return false;
  if (state !== "ready") throw new ContributorCompatibilityError("INCOMPLETE_CONTRIBUTOR_SCHEMA", "Contributor schema state is " + state);
  return true;
}

export function parseLegacyCredits(value: unknown): string[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function legacyContributorInputs(edition: Pick<BookEdition, "authors" | "translators">): ContributorInput[] {
  const inputs: ContributorInput[] = [];
  parseLegacyCredits(edition.authors).forEach((displayName) => inputs.push({ displayName, role: "author", orderIndex: inputs.length }));
  parseLegacyCredits(edition.translators).forEach((displayName) => inputs.push({ displayName, role: "translator", orderIndex: inputs.length }));
  return inputs;
}

export function normalizeEditionForContributorStorage(edition: BookEdition): BookEdition {
  if (edition.contributors === undefined) return edition;
  const inputs = edition.contributors.map(toContributorInput);
  const authorNames = inputs.filter((item) => item.role === "author").map((item) => item.creditedAs?.trim() || item.displayName.trim()).filter(Boolean);
  const translatorNames = inputs.filter((item) => item.role === "translator").map((item) => item.creditedAs?.trim() || item.displayName.trim()).filter(Boolean);
  return {
    ...edition,
    authors: edition.authors?.length ? edition.authors : authorNames,
    translators: edition.translators?.length ? edition.translators : translatorNames,
  };
}

function toContributorInput(item: ContributorPayload): ContributorInput {
  if ("contributor" in item) {
    return {
      id: item.contributor.id,
      displayName: item.contributor.displayName,
      sortName: item.contributor.sortName,
      normalizedName: item.contributor.normalizedName,
      role: item.role,
      orderIndex: item.orderIndex,
      creditedAs: item.creditedAs,
    };
  }
  return item;
}

export function toContributorInputs(items: ContributorPayload[]): ContributorInput[] {
  return items.map(toContributorInput);
}

function normalizeInput(input: ContributorInput, fallbackOrderIndex: number): Required<Pick<ContributorInput, "displayName" | "role" | "orderIndex">> & Omit<ContributorInput, "displayName" | "role" | "orderIndex"> {
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 240) throw new ContributorCompatibilityError("INVALID_CONTRIBUTOR", "Contributor displayName must be 1-240 characters");
  if (!CONTRIBUTOR_ROLES.includes(input.role)) throw new ContributorCompatibilityError("INVALID_CONTRIBUTOR", "Unsupported contributor role: " + String(input.role));
  const orderIndex = input.orderIndex ?? fallbackOrderIndex;
  if (!Number.isInteger(orderIndex) || orderIndex < 0) throw new ContributorCompatibilityError("INVALID_CONTRIBUTOR", "Contributor orderIndex must be a non-negative integer");
  return {
    ...input,
    displayName,
    role: input.role,
    orderIndex,
    sortName: input.sortName?.trim() || null,
    normalizedName: input.normalizedName?.trim() || null,
    creditedAs: input.creditedAs?.trim() || null,
  };
}

function contributorDto(row: Record<string, unknown>): ContributorDto {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    sortName: row.sort_name ? String(row.sort_name) : undefined,
    normalizedName: row.normalized_name ? String(row.normalized_name) : undefined,
    active: Number(row.active) === 1,
  };
}

export function loadEditionContributors(editionIds: string[]) {
  const result = new Map<string, EditionContributorDto[]>();
  if (!editionIds.length || !hasContributorModel()) return result;
  const uniqueIds = [...new Set(editionIds)];
  uniqueIds.forEach((editionId) => result.set(editionId, []));
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = sqlite.prepare("SELECT ec.edition_id,ec.role,ec.order_index,ec.credited_as,c.id,c.display_name,c.sort_name,c.normalized_name,c.active FROM edition_contributors ec JOIN contributors c ON c.id=ec.contributor_id WHERE ec.edition_id IN (" + placeholders + ") ORDER BY ec.edition_id,ec.order_index,ec.role,ec.contributor_id").all(...uniqueIds) as Array<Record<string, unknown>>;
  for (const row of rows) {
    const contributors = result.get(String(row.edition_id)) ?? [];
    contributors.push({ contributor: contributorDto(row), role: String(row.role) as ContributorRole, orderIndex: Number(row.order_index), creditedAs: row.credited_as ? String(row.credited_as) : undefined });
    result.set(String(row.edition_id), contributors);
  }
  return result;
}

function resolveContributor(input: ReturnType<typeof normalizeInput>, now: string) {
  if (input.id) {
    const existing = sqlite.prepare("SELECT id FROM contributors WHERE id=?").get(input.id) as { id: string } | undefined;
    if (!existing) throw new ContributorCompatibilityError("CONTRIBUTOR_NOT_FOUND", "Contributor " + input.id + " does not exist");
    return existing.id;
  }
  const id = uid();
  sqlite.prepare("INSERT INTO contributors (id,display_name,sort_name,normalized_name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(id, input.displayName, input.sortName, input.normalizedName, 1, now, now);
  return id;
}

export function insertEditionContributorsInTransaction(editionId: string, inputs: ContributorPayload[] | undefined) {
  if (inputs === undefined) return;
  assertContributorModelReady();
  const normalized = inputs.map((input, index) => normalizeInput(toContributorInput(input), index));
  const now = new Date().toISOString();
  const insertRelation = sqlite.prepare("INSERT INTO edition_contributors (edition_id,contributor_id,role,order_index,credited_as) VALUES (?,?,?,?,?)");
  for (const input of normalized) {
    const contributorId = resolveContributor(input, now);
    insertRelation.run(editionId, contributorId, input.role, input.orderIndex, input.creditedAs);
  }
}

export function replaceEditionContributorsInTransaction(editionId: string, inputs: ContributorPayload[]) {
  assertContributorModelReady();
  const normalized = inputs.map((input, index) => normalizeInput(toContributorInput(input), index));
  sqlite.prepare("DELETE FROM edition_contributors WHERE edition_id=?").run(editionId);
  const now = new Date().toISOString();
  const insertRelation = sqlite.prepare("INSERT INTO edition_contributors (edition_id,contributor_id,role,order_index,credited_as) VALUES (?,?,?,?,?)");
  for (const input of normalized) {
    const contributorId = resolveContributor(input, now);
    insertRelation.run(editionId, contributorId, input.role, input.orderIndex, input.creditedAs);
  }
}

export function replaceEditionContributors(editionId: string, inputs: ContributorPayload[]) {
  const write = sqlite.transaction(() => replaceEditionContributorsInTransaction(editionId, inputs));
  write();
}
