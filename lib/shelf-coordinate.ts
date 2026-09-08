import type { ShelfLocation } from "@/lib/types";

function compactShelfName(name: string) {
  const compact = name.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  return Array.from(compact).slice(0, 4).join("").toUpperCase() || "SHELF";
}

export function makeShelfCoordinate(shelf: Pick<ShelfLocation, "name"> | undefined, slot: string | undefined) {
  const normalizedSlot = slot?.trim().replace(/\s+/g, " ");
  if (!shelf?.name.trim() || !normalizedSlot) return "";
  return `${compactShelfName(shelf.name)}-${normalizedSlot}`;
}
