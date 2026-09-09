import type { LocationBreadcrumbItem, LocationDto, LocationNodeType, LocationReferenceDto } from "@/lib/types";

export const LOCATION_NODE_TYPES = ["legacy", "room", "zone", "shelf", "level", "slot"] as const;

export type LocationRecord = {
  id: string;
  name: string;
  parentId?: string | null;
  room?: string | null;
  sortOrder?: number | null;
  active?: boolean | number | null;
  type?: string | null;
  displayCode?: string | null;
};

export type LocationFields = {
  location?: string | null;
  locationId?: string | null;
  slot?: string | null;
  coordinate?: string | null;
  sortOrder?: number | null;
};

function nodeType(value: string | null | undefined): LocationNodeType {
  return (LOCATION_NODE_TYPES as readonly string[]).includes(value ?? "") ? value as LocationNodeType : "legacy";
}

function activeValue(value: LocationRecord["active"]) {
  return value === true || value === 1;
}

export function buildLocationDtos(records: LocationRecord[]): LocationDto[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  return records.map((record) => {
    const chain: LocationRecord[] = [];
    const seen = new Set<string>();
    let current: LocationRecord | undefined = record;
    let valid = true;
    while (current) {
      if (seen.has(current.id)) {
        valid = false;
        break;
      }
      seen.add(current.id);
      chain.push(current);
      if (!current.parentId) break;
      const parent = byId.get(current.parentId);
      if (!parent) {
        valid = false;
        break;
      }
      current = parent;
    }
    const breadcrumb: LocationBreadcrumbItem[] = chain.reverse().map((item) => ({
      id: item.id,
      name: item.name,
      type: nodeType(item.type),
      ...(item.displayCode ? { code: item.displayCode } : {}),
    }));
    const ancestorsActive = chain.every((item) => activeValue(item.active));
    const active = activeValue(record.active);
    return {
      id: record.id,
      name: record.name,
      type: nodeType(record.type),
      ...(record.displayCode ? { displayCode: record.displayCode } : {}),
      parentId: record.parentId ?? null,
      breadcrumb,
      sortOrder: Number(record.sortOrder ?? 0),
      active,
      status: active ? "active" : "inactive",
      available: valid && ancestorsActive,
      ...(record.room ? { room: record.room } : {}),
    };
  });
}

export function makeLocationReference(location: LocationDto | undefined, fields: LocationFields): LocationReferenceDto | undefined {
  const reference: LocationReferenceDto = {
    ...(location?.id || fields.locationId ? { id: location?.id ?? fields.locationId ?? undefined } : {}),
    ...(location?.name ? { name: location.name } : {}),
    ...(location?.displayCode ? { code: location.displayCode } : {}),
    ...(location?.breadcrumb?.length ? { breadcrumb: location.breadcrumb.map((item) => item.name) } : {}),
    ...(fields.slot ? { slot: fields.slot } : {}),
    ...(fields.coordinate ? { coordinate: fields.coordinate } : {}),
    ...(fields.location ? { detail: fields.location } : {}),
  };
  return Object.keys(reference).length ? reference : undefined;
}

export function allowedParentTypes(type: LocationNodeType): LocationNodeType[] {
  if (type === "room") return [];
  if (type === "zone") return ["room"];
  if (type === "shelf") return ["zone", "room"];
  if (type === "level") return ["shelf"];
  if (type === "slot") return ["level"];
  return ["legacy", "room", "zone", "shelf", "level", "slot"];
}
