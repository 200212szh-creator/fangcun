import { ensureDatabase, sqlite } from "@/lib/db";
import { allowedParentTypes, buildLocationDtos, makeLocationReference } from "@/lib/location/model";
import type { LocationDto, LocationNodeType, LocationReferenceDto, ShelfLocation } from "@/lib/types";
import { uid } from "@/lib/utils";

const USER_ID = "local-owner";
const LOCATION_COLUMNS = ["location_type", "display_code"] as const;
const LOAN_LOCATION_COLUMNS = ["original_location_id", "original_location_slot", "original_location_coordinate", "original_location_text", "original_location_sort_order", "original_location_captured"] as const;

export class LocationDomainError extends Error {
  constructor(public readonly code: "PARENT_NOT_FOUND" | "PARENT_TYPE_INVALID" | "PARENT_CYCLE" | "LOCATION_NOT_FOUND" | "LOCATION_IN_USE" | "LOCATION_CODE_CONFLICT", message: string) {
    super(message);
    this.name = "LocationDomainError";
  }
}

function hasColumn(table: string, column: string) {
  return (sqlite.prepare("PRAGMA table_info(" + table + ")").all() as Array<{ name: string }>).some((item) => item.name === column);
}

export function hasLocationModel() {
  return LOCATION_COLUMNS.every((column) => hasColumn("shelf_locations", column)) && LOAN_LOCATION_COLUMNS.every((column) => hasColumn("loans", column));
}

function rows(includeInactive: boolean) {
  const activeFilter = includeInactive ? "" : " AND active=1";
  const select = hasLocationModel() ? "id,name,parent_id AS parentId,room,sort_order AS sortOrder,active,location_type AS type,display_code AS displayCode" : "id,name,parent_id AS parentId,room,sort_order AS sortOrder,active";
  return sqlite.prepare("SELECT " + select + " FROM shelf_locations WHERE user_id=?" + activeFilter + " ORDER BY parent_id,sort_order,name,id").all(USER_ID) as Array<Record<string, unknown>>;
}

function locationRecords(includeInactive: boolean) {
  return rows(includeInactive).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    parentId: row.parentId ? String(row.parentId) : null,
    room: row.room ? String(row.room) : null,
    sortOrder: Number(row.sortOrder ?? 0),
    active: Boolean(row.active),
    type: row.type ? String(row.type) : "legacy",
    displayCode: row.displayCode ? String(row.displayCode) : null,
  }));
}

export function listLocations(includeInactive = false): LocationDto[] {
  ensureDatabase();
  return buildLocationDtos(locationRecords(includeInactive));
}

export function listShelfCompatibility(includeInactive = false): ShelfLocation[] {
  return listLocations(includeInactive).map((location) => ({
    id: location.id,
    name: location.name,
    parentId: location.parentId,
    room: location.room,
    sortOrder: location.sortOrder,
    active: location.active,
    type: location.type,
    displayCode: location.displayCode,
    breadcrumb: location.breadcrumb,
    status: location.status,
    available: location.available,
  }));
}

function locationRow(id: string) {
  const select = hasLocationModel() ? "id,name,parent_id AS parentId,room,sort_order AS sortOrder,active,location_type AS type,display_code AS displayCode" : "id,name,parent_id AS parentId,room,sort_order AS sortOrder,active";
  return sqlite.prepare("SELECT " + select + " FROM shelf_locations WHERE id=? AND user_id=?").get(id, USER_ID) as Record<string, unknown> | undefined;
}

function validateParent(id: string | undefined, parentId: string | null | undefined, type: LocationNodeType) {
  if (!parentId) return;
  if (parentId === id) throw new LocationDomainError("PARENT_CYCLE", "A location cannot be its own parent");
  const parent = locationRow(parentId);
  if (!parent) throw new LocationDomainError("PARENT_NOT_FOUND", "The parent location does not exist");
  const allowed = new Set(allowedParentTypes(type));
  if (!allowed.has(String(parent.type ?? "legacy") as LocationNodeType)) throw new LocationDomainError("PARENT_TYPE_INVALID", "The parent location type is not valid for this node");
  const seen = new Set<string>(id ? [id] : []);
  let currentId: string | null = parentId;
  while (currentId) {
    if (seen.has(currentId)) throw new LocationDomainError("PARENT_CYCLE", "The location hierarchy would contain a cycle");
    seen.add(currentId);
    const current = locationRow(currentId);
    currentId = current?.parentId ? String(current.parentId) : null;
  }
}

function validateCode(id: string | undefined, displayCode: string | undefined) {
  if (!hasLocationModel() || !displayCode) return;
  const existing = sqlite.prepare("SELECT id FROM shelf_locations WHERE user_id=? AND display_code=? AND id<>? LIMIT 1").get(USER_ID, displayCode, id ?? "") as { id: string } | undefined;
  if (existing) throw new LocationDomainError("LOCATION_CODE_CONFLICT", "The display code is already used by another location");
}

export function createLocation(input: { name: string; type?: LocationNodeType; parentId?: string | null; room?: string; displayCode?: string | null }) {
  ensureDatabase();
  const id = uid();
  const type = input.type ?? "shelf";
  validateParent(undefined, input.parentId, type);
  validateCode(undefined, input.displayCode ?? undefined);
  const order = Number((sqlite.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM shelf_locations WHERE user_id=? AND parent_id IS ?").get(USER_ID, input.parentId ?? null) as { nextOrder: number }).nextOrder);
  if (hasLocationModel()) {
    sqlite.prepare("INSERT INTO shelf_locations (id,name,parent_id,room,user_id,sort_order,active,location_type,display_code) VALUES (?,?,?,?,?,?,?,?,?)").run(id, input.name, input.parentId ?? null, input.room ?? null, USER_ID, order, 1, type, input.displayCode ?? null);
  } else {
    sqlite.prepare("INSERT INTO shelf_locations (id,name,parent_id,room,user_id,sort_order,active) VALUES (?,?,?,?,?,?,1)").run(id, input.name, input.parentId ?? null, input.room ?? null, USER_ID, order);
  }
  return listLocations(true).find((item) => item.id === id) as LocationDto;
}

export function updateLocation(id: string, input: { name?: string; type?: LocationNodeType; parentId?: string | null; room?: string; displayCode?: string | null; sortOrder?: number; active?: boolean }) {
  ensureDatabase();
  const current = locationRow(id);
  if (!current) return null;
  const type = input.type ?? (current.type ? String(current.type) as LocationNodeType : "legacy");
  const parentId = input.parentId === undefined ? (current.parentId ? String(current.parentId) : null) : input.parentId;
  validateParent(id, parentId, type);
  validateCode(id, input.displayCode === undefined ? (current.displayCode ? String(current.displayCode) : undefined) : input.displayCode ?? undefined);
  if (hasLocationModel()) {
    sqlite.prepare("UPDATE shelf_locations SET name=?,parent_id=?,room=?,sort_order=?,active=?,location_type=?,display_code=? WHERE id=? AND user_id=?").run(input.name ?? String(current.name), parentId, input.room === undefined ? (current.room ?? null) : input.room, input.sortOrder ?? Number(current.sortOrder ?? 0), input.active === undefined ? (current.active ? 1 : 0) : (input.active ? 1 : 0), type, input.displayCode === undefined ? (current.displayCode ?? null) : input.displayCode ?? null, id, USER_ID);
  } else {
    sqlite.prepare("UPDATE shelf_locations SET name=?,parent_id=?,room=?,sort_order=?,active=? WHERE id=? AND user_id=?").run(input.name ?? String(current.name), parentId, input.room === undefined ? (current.room ?? null) : input.room, input.sortOrder ?? Number(current.sortOrder ?? 0), input.active === undefined ? (current.active ? 1 : 0) : (input.active ? 1 : 0), id, USER_ID);
  }
  return listLocations(true).find((item) => item.id === id) ?? null;
}

export function shelfUsage(id: string) {
  ensureDatabase();
  return Number((sqlite.prepare("SELECT count(*) AS count FROM owned_copies WHERE shelf_location_id=? AND user_id=? AND deleted_at IS NULL").get(id, USER_ID) as { count: number }).count);
}

export function deleteLocation(id: string) {
  ensureDatabase();
  if (!locationRow(id)) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (shelfUsage(id) > 0) return { ok: false as const, reason: "IN_USE" as const };
  if (Number((sqlite.prepare("SELECT count(*) AS count FROM shelf_locations WHERE parent_id=? AND user_id=?").get(id, USER_ID) as { count: number }).count) > 0) return { ok: false as const, reason: "IN_USE" as const };
  if (hasLocationModel() && Number((sqlite.prepare("SELECT count(*) AS count FROM loans WHERE original_location_id=?").get(id) as { count: number }).count) > 0) return { ok: false as const, reason: "IN_USE" as const };
  sqlite.prepare("DELETE FROM shelf_locations WHERE id=? AND user_id=?").run(id, USER_ID);
  return { ok: true as const };
}

export function assertCopyLocation(locationId: string | null | undefined) {
  if (!locationId || !hasLocationModel()) return;
  if (!locationRow(locationId)) throw new LocationDomainError("LOCATION_NOT_FOUND", "The copy location does not exist");
}

export function copyLocationReference(fields: { location?: string | null; shelfLocationId?: string | null; shelfSlot?: string | null; shelfCoordinate?: string | null }): LocationReferenceDto | undefined {
  const location = fields.shelfLocationId ? listLocations(true).find((item) => item.id === fields.shelfLocationId) : undefined;
  return makeLocationReference(location, { location: fields.location, locationId: fields.shelfLocationId, slot: fields.shelfSlot, coordinate: fields.shelfCoordinate });
}

export function currentCopyLocation(copyId: string) {
  ensureDatabase();
  const row = sqlite.prepare("SELECT location,shelf_location_id AS shelfLocationId,shelf_slot AS shelfSlot,shelf_coordinate AS shelfCoordinate FROM owned_copies WHERE id=? AND user_id=?").get(copyId, USER_ID) as { location?: string | null; shelfLocationId?: string | null; shelfSlot?: string | null; shelfCoordinate?: string | null } | undefined;
  return row ? copyLocationReference(row) : undefined;
}

export type CopyLocationSnapshot = {
  location: string | null;
  shelfLocationId: string | null;
  shelfSlot: string | null;
  shelfCoordinate: string | null;
  locationSortOrder: number | null;
};

export function copyLocationSnapshot(copyId: string): CopyLocationSnapshot | undefined {
  ensureDatabase();
  return sqlite.prepare("SELECT location,shelf_location_id AS shelfLocationId,shelf_slot AS shelfSlot,shelf_coordinate AS shelfCoordinate,location_sort_order AS locationSortOrder FROM owned_copies WHERE id=? AND user_id=?").get(copyId, USER_ID) as CopyLocationSnapshot | undefined;
}

export function restoreCopyLocation(copyId: string, snapshot: CopyLocationSnapshot) {
  ensureDatabase();
  sqlite.prepare("UPDATE owned_copies SET location=?,shelf_location_id=?,shelf_slot=?,shelf_coordinate=?,location_sort_order=?,updated_at=? WHERE id=? AND user_id=?").run(snapshot.location, snapshot.shelfLocationId, snapshot.shelfSlot, snapshot.shelfCoordinate, snapshot.locationSortOrder, new Date().toISOString(), copyId, USER_ID);
}
