import assert from "node:assert/strict";
import { isAbsolute } from "node:path";

const databaseFile = process.env.FANGCUN_MIGRATION_DATABASE;
if (process.env.FANGCUN_MIGRATION_TARGET !== "ISOLATED" || !databaseFile || !isAbsolute(databaseFile)) {
  throw new Error("Task 003 probe requires an explicit isolated database");
}

let ensureDatabase: (typeof import("@/lib/db"))["ensureDatabase"];
let sqlite: (typeof import("@/lib/db"))["sqlite"];
let repository: typeof import("@/lib/db/repository");

function count(table: string) {
  return Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

async function seed() {
  ensureDatabase();
  const created = repository.createOwnedCopy({
    edition: {
      id: "task003-legacy-edition",
      title: "Legacy Compatibility Title",
      authors: ["Legacy Author"],
      translators: ["Legacy Translator"],
      publisher: "Legacy Press",
      publicationYear: 2020,
      isbn13: "9780306406157",
      description: "Legacy description",
      source: "test",
    },
    location: "Study shelf",
    readingStatus: "reading",
  });
  const loan = repository.createLoan(created.id, { borrowerName: "Compatibility Reader", dueAt: "2099-01-01" });
  assert.equal(loan.ok, true);
  const annotation = repository.createAnnotation(created.id, { pageLabel: "p. 1", body: "Legacy note", concepts: ["Compatibility"] });
  assert.ok(annotation);
  console.log(JSON.stringify({ copyId: created.id, editionId: "task003-legacy-edition" }));
}

async function regression(copyId: string) {
  ensureDatabase();
  const before = repository.getOwnedCopy(copyId);
  assert.ok(before);
  assert.equal(before.edition.title, "Legacy Compatibility Title");
  assert.deepEqual(before.edition.authors, ["Legacy Author"]);
  assert.deepEqual(before.edition.translators, ["Legacy Translator"]);
  assert.equal(before.edition.isbn13, "9780306406157");
  assert.ok(before.work);
  assert.equal(before.work.title, "Legacy Compatibility Title");
  assert.equal(before.edition.workId, before.work.id);

  const collectionRoute = await import("../app/api/catalog/books/route");
  const collectionResponse = await collectionRoute.GET();
  const collection = await collectionResponse.json() as { items: Array<typeof before>; total: number };
  const collectionItem = collection.items.find((item) => item.id === copyId);
  assert.ok(collectionItem);
  assert.equal(collectionItem.edition.title, "Legacy Compatibility Title");
  assert.equal(collectionItem.work?.id, before.work.id);

  const detailRoute = await import("../app/api/catalog/books/[copyId]/route");
  const detailResponse = await detailRoute.GET(new Request("http://localhost/api/catalog/books/" + copyId), { params: Promise.resolve({ copyId }) });
  const detail = await detailResponse.json() as typeof before;
  assert.equal(detail.edition.isbn13, "9780306406157");
  assert.equal(detail.work?.id, before.work.id);

  const patchResponse = await detailRoute.PATCH(new Request("http://localhost/api/catalog/books/" + copyId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      edition: { title: "Updated Compatibility Title", authors: ["Legacy Author"], source: "test" },
      copy: { notes: "Updated through one boundary", readingStatus: "read" },
    }),
  }), { params: Promise.resolve({ copyId }) });
  assert.equal(patchResponse.status, 200);
  const patched = await patchResponse.json() as typeof before;
  assert.equal(patched.edition.title, "Updated Compatibility Title");
  assert.equal(patched.notes, "Updated through one boundary");
  assert.equal(patched.work?.title, "Legacy Compatibility Title");

  const addRoute = await import("../app/api/catalog/books/route");
  const addResponse = await addRoute.POST(new Request("http://localhost/api/catalog/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Created Through Boundary", authors: "Created Author", source: "manual" }),
  }));
  assert.equal(addResponse.status, 201);
  const added = await addResponse.json() as { id: string };
  const addedCopy = repository.getOwnedCopy(added.id);
  assert.ok(addedCopy?.work);
  assert.equal(addedCopy?.edition.title, "Created Through Boundary");

  const wishlist = repository.addWishlist({ id: "task003-wishlist-edition", title: "Wishlist Through Boundary", authors: ["Wishlist Author"], source: "search" }, "Keep for later");
  assert.ok(wishlist);
  const wishlistItem = repository.listWishlist().find((item) => item.edition.title === "Wishlist Through Boundary");
  assert.equal(wishlistItem?.edition.workId !== undefined, true);

  const importRoute = await import("../app/api/import/books/commit/route");
  const importResponse = await importRoute.POST(new Request("http://localhost/api/import/books/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: [{ title: "Imported Through Boundary", authors: "Imported Author", isbn: "9780306406157" }] }),
  }));
  assert.equal(importResponse.status, 200);
  assert.deepEqual(await importResponse.json(), { imported: 1 });
  const imported = repository.listOwnedCopies().find((item) => item.edition.title === "Imported Through Boundary");
  assert.ok(imported?.work);

  const activeLoan = repository.createLoan(added.id, { borrowerName: "Regression Reader", dueAt: "2099-01-01" });
  assert.equal(activeLoan.ok, true);
  const newAnnotation = repository.createAnnotation(added.id, { body: "Regression annotation", concepts: ["Work"] });
  assert.ok(newAnnotation);
  assert.equal(repository.listLoans(added.id).length, 1);
  assert.equal(repository.listAnnotations(added.id).length, 1);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  try {
    const { searchBookCandidates } = await import("../lib/discovery/providers");
    const searchResults = await searchBookCandidates("Updated Compatibility Title");
    assert.ok(searchResults.some((item) => item.title === "Updated Compatibility Title"));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const exportRoute = await import("../app/api/export/route");
  const exportResponse = await exportRoute.GET(new Request("http://localhost/api/export?format=json"));
  const exported = await exportResponse.json() as { books: Array<typeof before> };
  assert.ok(exported.books.some((item) => item.edition.title === "Imported Through Boundary"));
  assert.ok(exported.books.every((item) => item.edition.authors.length > 0));

  const workId = before.work.id;
  sqlite.prepare("UPDATE book_editions SET work_id=NULL WHERE id=?").run(before.editionId);
  assert.throws(() => repository.getOwnedCopy(copyId), (error: unknown) => error instanceof Error && "code" in error && error.code === "WORK_RELATION_MISSING");
  sqlite.prepare("UPDATE book_editions SET work_id=? WHERE id=?").run(workId, before.editionId);

  const countsBeforeFailure = { works: count("works"), editions: count("book_editions"), copies: count("owned_copies") };
  assert.throws(() => repository.createOwnedCopy({
    edition: {
      id: "task003-transaction-failure",
      title: "Should Roll Back",
      authors: ["Failure Test"],
      source: null as unknown as string,
    },
  }));
  assert.deepEqual({ works: count("works"), editions: count("book_editions"), copies: count("owned_copies") }, countsBeforeFailure);

  assert.equal(count("works"), count("book_editions"));
  assert.equal(Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions WHERE work_id IS NULL").get() as { count: number }).count), 0);
  console.log(JSON.stringify({ status: "pass", workCount: count("works"), editionCount: count("book_editions"), copyCount: count("owned_copies") }));
}

async function guard() {
  ensureDatabase();
  sqlite.exec("CREATE TABLE works (id TEXT PRIMARY KEY, title TEXT NOT NULL, original_title TEXT, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  sqlite.exec("ALTER TABLE book_editions ADD COLUMN work_id TEXT");
  const { getCatalogSchemaMode, CatalogCompatibilityError } = await import("@/lib/db/catalog-adapter");
  assert.throws(() => getCatalogSchemaMode(), (error: unknown) => error instanceof CatalogCompatibilityError && error.code === "WORK_MIGRATION_UNRECORDED");
  console.log(JSON.stringify({ status: "pass", guard: "WORK_MIGRATION_UNRECORDED" }));
}

async function main() {
  ({ ensureDatabase, sqlite } = await import("@/lib/db"));
  repository = await import("@/lib/db/repository");
  const mode = process.argv[2];
  if (mode === "seed") await seed();
  else if (mode === "regression") await regression(process.argv[3] || "");
  else if (mode === "guard") await guard();
  else throw new Error("Unknown Task 003 probe mode");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
