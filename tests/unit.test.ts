import { describe, expect, it } from "vitest";
import { isbn10To13, isbn13To10, isValidISBN10, isValidISBN13, normalizeISBN } from "@/lib/isbn";
import { normalizeTitle } from "@/lib/normalize";
import { rankCandidates } from "@/lib/discovery/matching";
import { dedupeEditions, mergeEdition } from "@/lib/discovery/merge";
import { CACHE_TTL, clearDiscoveryCache, getCached, setCached } from "@/lib/discovery/cache";
import { messages } from "@/lib/translations";

describe("ISBN normalization", () => {
  it("validates and converts ISBN-10/13", () => {
    expect(isValidISBN10("0-307-29136-7")).toBe(true);
    expect(isbn10To13("0-307-29136-7")).toBe("9780307291363");
    expect(isValidISBN13("9780307291363")).toBe(true);
    expect(isbn13To10("9780307291363")).toBe("0307291367");
    expect(normalizeISBN("978-0-307-29136-3")?.isbn10).toBe("0307291367");
  });
});

describe("book matching and source normalization", () => {
  it("normalizes titles and ranks exact matches first", () => {
    expect(normalizeTitle("  “设计中的设计”：新版 ")).toBe("设计中的设计 新版");
    const ranked = rankCandidates("百年孤独", [{ id: "a", title: "百年孤独", authors: ["加西亚·马尔克斯"], score: 0, editionCount: 1, source: "demo" }, { id: "b", title: "百年孤独导读", authors: [], score: 0, editionCount: 1, source: "demo" }]);
    expect(ranked[0].id).toBe("a");
  });
  it("deduplicates editions and preserves primary values", () => {
    const primary = { id: "1", title: "A", authors: ["Author"], publisher: "Primary", isbn13: "9780000000001", source: "Google Books" };
    expect(mergeEdition(primary, { publisher: "Fallback", pages: 120 }).publisher).toBe("Primary");
    expect(mergeEdition(primary, { publisher: "Fallback", pages: 120 }).pages).toBe(120);
    expect(dedupeEditions([primary, { ...primary, id: "2" }])).toHaveLength(1);
  });
});

describe("discovery cache", () => {
  it("stores values with the configured search TTL", () => { clearDiscoveryCache(); setCached("test", { ok: true }, CACHE_TTL.search); expect(getCached<{ ok: boolean }>("test")?.ok).toBe(true); });
});

function flattenKeys(value: unknown, prefix = ""): string[] { if (!value || typeof value !== "object") return prefix ? [prefix] : []; return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key)); }
describe("translation completeness", () => {
  it("keeps Chinese and English key topology identical", () => { expect(flattenKeys(messages.zh).sort()).toEqual(flattenKeys(messages.en).sort()); expect(flattenKeys(messages.zh).every((key) => key.length > 0)).toBe(true); });
});
