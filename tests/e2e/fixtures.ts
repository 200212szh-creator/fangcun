import { test as base, expect, type Page } from "@playwright/test";

type E2EFixtures = {
  resetIsolatedDatabase: void;
};

export const test = base.extend<E2EFixtures>({
  resetIsolatedDatabase: [async ({ request }, use) => {
    const reset = async () => {
      const response = await request.post("/api/e2e/reset");
      if (!response.ok()) throw new Error(`Unable to reset isolated E2E database: ${response.status()}`);
    };
    await reset();
    try {
      await use();
    } finally {
      await reset();
    }
  }, { auto: true }],
});

export { expect };
export type { Page };

export async function createFixtureBook(page: Page, prefix: string) {
  const shelfResponse = await page.request.post("/api/catalog/shelves", {
    data: { name: "书房东墙", room: "书房" },
  });
  expect(shelfResponse.ok()).toBeTruthy();
  const shelf = await shelfResponse.json() as { id: string };
  const bookResponse = await page.request.post("/api/catalog/books/from-edition", {
    data: {
      edition: {
        id: `${prefix}-edition-${crypto.randomUUID()}`,
        title: `${prefix} fixture book`,
        authors: ["Fixture Author"],
        source: "e2e-fixture",
      },
      shelfLocationId: shelf.id,
      shelfSlot: "1",
    },
  });
  expect(bookResponse.ok()).toBeTruthy();
  const book = await bookResponse.json() as { id: string };
  return { shelfId: shelf.id, bookId: book.id };
}
