import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST as importBooks } from "../app/api/import/books/commit/route";
import { POST as fromEdition } from "../app/api/catalog/books/from-edition/route";
import { exportData, createOwnedCopy, getOwnedCopy, listOwnedCopies, updateBookEdition } from "../lib/db/repository";
import { sqlite, ensureDatabase } from "../lib/db";
import { searchLocalBookCandidates } from "../lib/discovery/providers";
import type { ContributorPayload } from "../lib/catalog/contributors";

function count(sql: string, ...parameters: string[]) {
  return Number((sqlite.prepare(sql).get(...parameters) as { count: number }).count);
}

function contributorDisplayName(item: ContributorPayload) {
  return "contributor" in item ? item.contributor.displayName : item.displayName;
}

async function main() {
  ensureDatabase();
  const legacyCopy = sqlite.prepare("SELECT id FROM owned_copies ORDER BY id LIMIT 1").get() as { id: string };
  const legacy = getOwnedCopy(legacyCopy.id);
  assert(legacy);
  assert.equal(legacy.edition.contributors?.length, 2);
  assert.equal(legacy.edition.contributors?.[0].role, "author");
  assert.equal(legacy.edition.contributors?.[1].role, "translator");

  const structuredEditionId = "structured-edition-" + randomUUID();
  const created = createOwnedCopy({
    edition: {
      id: structuredEditionId,
      title: "Structured Contributor Book",
      authors: [],
      translators: [],
      contributors: [
        { displayName: "Structured Author", role: "author", orderIndex: 0 },
        { displayName: "Structured Translator", role: "translator", orderIndex: 1, creditedAs: "Translator Credit" },
      ],
      source: "task008-test",
    },
  });
  const structured = getOwnedCopy(created.id);
  assert(structured);
  assert.deepEqual(structured.edition.authors, ["Structured Author"]);
  assert.deepEqual(structured.edition.translators, ["Translator Credit"]);
  assert.equal(structured.edition.contributors?.length, 2);
  const contributorIds = structured.edition.contributors!.map((item) => ("contributor" in item ? item.contributor.id : item.id)) as string[];
  const localContributorSearch = searchLocalBookCandidates("Structured Translator");
  assert(localContributorSearch.some((candidate) => candidate.id === structuredEditionId));

  const failedEditionId = "failed-structured-edition-" + randomUUID();
  assert.throws(() => createOwnedCopy({
    edition: {
      id: failedEditionId,
      title: "Should Roll Back",
      authors: [],
      contributors: [{ displayName: "Rolled Back Contributor", role: "author", orderIndex: 0 }],
      source: "task008-test",
    },
    shelfLocationId: "missing-location",
  }));
  assert.equal(count("SELECT COUNT(*) AS count FROM book_editions WHERE id=?", failedEditionId), 0);
  assert.equal(count("SELECT COUNT(*) AS count FROM contributors WHERE display_name=?", "Rolled Back Contributor"), 0);

  const beforeFailedEdit = getOwnedCopy(created.id)!.edition.title;
  assert.throws(() => updateBookEdition(structuredEditionId, {
    title: "Should Also Roll Back",
    contributors: [{ id: "missing-contributor", displayName: "Missing", role: "editor", orderIndex: 0 }],
  }));
  assert.equal(getOwnedCopy(created.id)!.edition.title, beforeFailedEdit);

  updateBookEdition(structuredEditionId, {
    title: "Structured Contributor Book Edited",
    contributors: [
      { id: contributorIds[1], displayName: "Structured Translator", role: "editor", orderIndex: 0, creditedAs: "Editor Credit" },
      { id: contributorIds[0], displayName: "Structured Author", role: "author", orderIndex: 1 },
    ],
  });
  const edited = getOwnedCopy(created.id);
  assert(edited);
  assert.deepEqual(edited.edition.contributors?.map((item) => [item.role, item.orderIndex]), [["editor", 0], ["author", 1]]);
  updateBookEdition(structuredEditionId, { contributors: [] });
  assert.equal(getOwnedCopy(created.id)!.edition.contributors?.length, 0);
  assert.equal(count("SELECT COUNT(*) AS count FROM contributors WHERE id IN (?,?)", contributorIds[0], contributorIds[1]), 2);

  const apiEditionId = "api-structured-edition-" + randomUUID();
  const apiResponse = await fromEdition(new Request("http://localhost/api/catalog/books/from-edition", {
    method: "POST",
    body: JSON.stringify({
      edition: { id: apiEditionId, title: "API Structured Contributor Book", authors: [], source: "task008-test" },
      contributors: [{ displayName: "API Author", role: "author", orderIndex: 0 }],
    }),
  }));
  assert.equal(apiResponse.status, 201);
  const apiBook = getOwnedCopy((await apiResponse.json()).id);
  assert(apiBook);
  assert.equal(contributorDisplayName(apiBook.edition.contributors![0]), "API Author");

  const importResponse = await importBooks(new Request("http://localhost/api/import/books/commit", {
    method: "POST",
    body: JSON.stringify({ rows: [{ title: "Imported Legacy Contributor Book", author: "Imported Author", translator: "Imported Translator" }] }),
  }));
  assert.equal(importResponse.status, 200);
  assert.deepEqual(await importResponse.json(), { imported: 1 });
  const imported = listOwnedCopies().find((book) => book.edition.title === "Imported Legacy Contributor Book");
  assert(imported);
  assert.deepEqual(imported.edition.authors, ["Imported Author"]);
  assert.deepEqual(imported.edition.translators, ["Imported Translator"]);
  assert.equal(imported.edition.contributors?.length, 2);

  const structuredImportResponse = await importBooks(new Request("http://localhost/api/import/books/commit", {
    method: "POST",
    body: JSON.stringify({
      rows: [{
        title: "Imported Structured Contributor Book",
        contributors: JSON.stringify([
          { displayName: "Imported Structured Author", role: "author", orderIndex: 0 },
          { displayName: "Imported Structured Translator", role: "translator", orderIndex: 1 },
        ]),
      }],
    }),
  }));
  assert.equal(structuredImportResponse.status, 200);
  const structuredImported = listOwnedCopies().find((book) => book.edition.title === "Imported Structured Contributor Book");
  assert(structuredImported);
  assert.deepEqual(structuredImported.edition.authors, ["Imported Structured Author"]);
  assert.deepEqual(structuredImported.edition.translators, ["Imported Structured Translator"]);
  assert.equal(structuredImported.edition.contributors?.length, 2);

  const exported = exportData();
  assert.equal(exported.version, 2);
  assert.equal(exported.compatibilityVersion, 1);
  const exportedStructured = exported.books.find((book) => book.edition.id === structuredEditionId);
  assert(exportedStructured);
  assert.equal(exportedStructured.edition.contributors?.length, 0);
  const exportedImported = exported.books.find((book) => book.edition.title === "Imported Legacy Contributor Book");
  assert(exportedImported);
  assert.equal(exportedImported.edition.contributors?.length, 2);

  const orphanRelations = count("SELECT COUNT(*) AS count FROM edition_contributors ec LEFT JOIN book_editions e ON e.id=ec.edition_id WHERE e.id IS NULL");
  const orphanReferences = count("SELECT COUNT(*) AS count FROM edition_contributors ec LEFT JOIN contributors c ON c.id=ec.contributor_id WHERE c.id IS NULL");
  assert.equal(orphanRelations, 0);
  assert.equal(orphanReferences, 0);
  console.log(JSON.stringify({ status: "pass", legacyContributors: legacy.edition.contributors?.length, structuredCreate: "PASS", transactionRollback: "PASS", editAtomicity: "PASS", search: "PASS", import: "PASS", export: "PASS", orphanValidation: "PASS" }));
}

main().finally(() => sqlite.close());
