import { expect, test } from "./fixtures";

type State = {
  databaseTarget: string;
  migrations: string[];
  counts: { works: number; editions: number; copies: number; activeCopies: number; shelves: number; loans: number; annotations: number };
  integrity: string;
  quickCheck: string;
  foreignKeyViolations: number;
  missingWorkId: number;
  orphanEditions: number;
  orphanWorks: number;
};

async function state(page: import("@playwright/test").Page) {
  const response = await page.request.get("/api/e2e/state");
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<State>;
}

test("Task 006 isolated Work-Edition-Copy write smoke owns and removes its fixture", async ({ page }) => {
  test.setTimeout(60000);
  const marker = `task006-${crypto.randomUUID()}`;
  const baseline = await state(page);
  expect(baseline.databaseTarget).toBe("ISOLATED");
  expect(baseline.migrations).toEqual(["0001_archive_fields", "0002_loans_annotations", "0003_works", "0004_location_model", "0005_contributors"]);
  expect(baseline.counts).toEqual({ works: 0, editions: 0, copies: 0, activeCopies: 0, shelves: 0, loans: 0, annotations: 0 });

  const atomicFailure = await page.request.post("/api/catalog/books/from-edition", { data: { edition: { id: `${marker}-atomic-edition`, title: `${marker} atomic rollback`, source: "task006-write-smoke" } } });
  expect(atomicFailure.ok()).toBeFalsy();
  expect((await state(page)).counts).toEqual(baseline.counts);

  const shelfResponse = await page.request.post("/api/catalog/shelves", { data: { name: `${marker} shelf`, room: "Task 006" } });
  expect(shelfResponse.status()).toBe(201);
  const shelf = await shelfResponse.json() as { id: string };
  const editionId = `${marker}-edition`;
  const title = `${marker} — write smoke book`;
  const createResponse = await page.request.post("/api/catalog/books/from-edition", { data: { edition: { id: editionId, title, authors: ["Task 006 Fixture"], source: "task006-write-smoke" }, shelfLocationId: shelf.id, shelfSlot: "3" } });
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json() as { id: string };
  const createdDetail = await page.request.get(`/api/catalog/books/${created.id}`);
  expect(createdDetail.status()).toBe(200);
  const detail = await createdDetail.json() as { id: string; edition: { id: string; title: string; workId?: string }; work?: { id: string } };
  expect(detail.edition.id).toBe(editionId);
  expect(detail.edition.title).toBe(title);
  expect(detail.work?.id).toBeTruthy();
  expect(detail.edition.workId).toBe(detail.work?.id);
  expect((await state(page)).counts).toEqual({ works: 1, editions: 1, copies: 1, activeCopies: 1, shelves: 1, loans: 0, annotations: 0 });

  await page.route("**/api/discovery/search**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ kind: "book", id: `${marker}-search`, title, authors: ["Task 006 Fixture"], publisher: "Task 006", year: 2026, source: "task006-write-smoke", edition: { id: editionId, title, authors: ["Task 006 Fixture"], source: "task006-write-smoke" } }] }) });
  });
  await page.goto(`/search?q=${encodeURIComponent(marker)}`, { waitUntil: "domcontentloaded" });
  const searchMain = page.locator("main");
  const searchBox = searchMain.getByRole("textbox");
  await expect(searchBox).toHaveValue(marker);
  await expect(searchMain.getByRole("heading", { name: title, exact: true })).toBeVisible();

  const editedTitle = `${marker} — edited book`;
  const editResponse = await page.request.patch(`/api/catalog/books/${created.id}`, { data: { edition: { title: editedTitle, authors: ["Task 006 Fixture"], source: "task006-write-smoke" }, copy: { notes: "Task 006 isolated edit", shelfSlot: "4" } } });
  expect(editResponse.status()).toBe(200);
  const edited = await (await page.request.get(`/api/catalog/books/${created.id}`)).json() as { edition: { title: string }; notes?: string; shelfSlot?: string };
  expect(edited.edition.title).toBe(editedTitle);
  expect(edited.notes).toBe("Task 006 isolated edit");
  expect(edited.shelfSlot).toBe("4");

  const deleteResponse = await page.request.delete(`/api/catalog/books/${created.id}`);
  expect(deleteResponse.status()).toBe(200);
  const deleted = await (await page.request.get(`/api/catalog/books/${created.id}`)).json() as { deletedAt?: string | null };
  expect(deleted.deletedAt).toBeTruthy();
  const activeCatalog = await (await page.request.get("/api/catalog/books")).json() as { items: Array<{ id: string }> };
  expect(activeCatalog.items.some((item) => item.id === created.id)).toBe(false);

  const cleanupResponse = await page.request.post("/api/e2e/write-smoke/cleanup", { data: { marker, workId: detail.work!.id, editionId, copyId: created.id, shelfId: shelf.id } });
  expect(cleanupResponse.status()).toBe(200);
  const restored = await state(page);
  expect(restored.counts).toEqual(baseline.counts);
  expect(restored.integrity).toBe("ok");
  expect(restored.quickCheck).toBe("ok");
  expect(restored.foreignKeyViolations).toBe(0);
  expect(restored.missingWorkId).toBe(0);
  expect(restored.orphanEditions).toBe(0);
  expect(restored.orphanWorks).toBe(0);
});
