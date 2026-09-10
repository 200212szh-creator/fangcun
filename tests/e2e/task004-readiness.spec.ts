import { expect, test } from "./fixtures";

test("Task 004 isolated runtime smoke covers the core catalog flow", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /我的藏书|My books/ })).toBeVisible();

  await page.goto("/library", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /我的藏书|My books/ })).toBeVisible();

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /统一检索|Unified search/ })).toBeVisible();

  await page.goto("/add", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /添加图书|Add a book/ })).toBeVisible();
  await page.getByRole("tab", { name: /完全手动录入|Manual entry/ }).click();
  await expect(page.locator('input[name="title"]')).toBeVisible();

  const shelfResponse = await page.request.post("/api/catalog/shelves", { data: { name: `Task 004 smoke ${Date.now()}` } });
  expect(shelfResponse.ok()).toBeTruthy();
  const shelf = await shelfResponse.json() as { id: string };
  const bookResponse = await page.request.post("/api/catalog/books/from-edition", {
    data: {
      edition: { id: `task004-smoke-${Date.now()}`, title: "Task 004 Smoke Book", authors: ["Fixture Author"], source: "task004-smoke" },
      shelfLocationId: shelf.id,
      shelfSlot: "1",
    },
  });
  expect(bookResponse.ok()).toBeTruthy();
  const book = await bookResponse.json() as { id: string };

  await page.goto(`/books/${book.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "版本与书目" })).toBeVisible();
  await page.getByRole("textbox", { name: "书名", exact: true }).fill("Task 004 Smoke Book Updated");
  await page.getByRole("button", { name: "保存档案" }).click();
  await expect(page.getByText("保存成功，档案已同步", { exact: true })).toBeVisible();

  await page.goto("/import", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "导入藏书" })).toBeVisible();
  const csvInput = page.locator('textarea[aria-label="CSV 内容"]');
  const previewButton = page.getByRole("button", { name: "预览" });
  const csvValue = "title,authors\nTask 004 Imported Book,Fixture Author";
  let previewEnabled = false;
  for (const delay of [0, 250, 500, 1000]) {
    if (delay) await page.waitForTimeout(delay);
    await csvInput.fill(csvValue);
    if (await previewButton.isEnabled()) {
      previewEnabled = true;
      break;
    }
  }
  expect(previewEnabled).toBe(true);
  await expect(csvInput).toHaveValue(csvValue);
  await previewButton.click();
  await expect(page.getByText("Task 004 Imported Book", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "导入已通过的记录" }).click();
  await expect(page.getByRole("status")).toContainText("已导入记录");

  const exported = await page.request.get("/api/export?format=json");
  expect(exported.status()).toBe(200);
  const exportPayload = await exported.json() as { books: Array<{ edition: { title: string } }> };
  expect(exportPayload.books.some((book) => book.edition.title === "Task 004 Imported Book")).toBe(true);
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  const healthResponse = await page.request.get("/api/health");
  expect(healthResponse.status()).toBe(200);
  const health = await healthResponse.json() as { status: string; database: string; migrations: string[]; schemaMigrationState: string; release: string; buildId: string; sourceCommit: string; dirty: boolean; buildTimestamp: string };
  expect(health).toMatchObject({ status: "ok", database: "ok", migrations: ["0001_archive_fields", "0002_loans_annotations", "0003_works", "0004_location_model", "0005_contributors"], schemaMigrationState: "ready" });
  expect(health.release).toBeTruthy();
  expect(health.buildId).toBeTruthy();
  expect(health.sourceCommit).toBeTruthy();
  expect(typeof health.dirty).toBe("boolean");
  expect(health.buildTimestamp).toBeTruthy();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("personal-library.json");
});
