import { expect, test, type Page } from "./fixtures";

async function mockDiscovery(page: Page) {
  await page.route("**/api/discovery/books**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/editions")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ id: "fixture-edition", title: "百年孤独", authors: ["加西亚·马尔克斯"], publisher: "Fixture Press", publicationYear: 2011, format: "Paperback", language: "zh", isbn13: "9787544253994", source: "fixture" }] }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ id: "fixture-candidate", title: "百年孤独", authors: ["加西亚·马尔克斯"], score: 0.98, editionCount: 1, source: "fixture" }], nextCursor: null, offline: false }) });
  });
}

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
}

test("entry page preserves the three-language brand and deep links stay direct", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "方寸之间，万卷有序" })).toBeVisible();
  await expect(page.getByText("A world of books, perfectly in order.", { exact: true })).toBeVisible();
  await expect(page.getByText("Eine Welt voller Bücher, wohlgeordnet", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("设计中的设计");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByText("方寸之间，万卷有序", { exact: true })).toBeVisible();
  await expect(page.getByText("A world of books, perfectly in order.", { exact: true })).toBeVisible();
  await expect(page.getByText("Eine Welt voller Bücher, wohlgeordnet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enter my library" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "方寸之间，万卷有序" })).toBeVisible();
  await page.goto("/add");
  await expect(page).toHaveURL(/\/add$/);
});

test("entry has no desktop or mobile horizontal overflow", async ({ page }) => {
  for (const viewport of [{ width: 1441, height: 778 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "方寸之间，万卷有序" })).toBeVisible();
    await expectNoOverflow(page);
  }
});

test("empty home uses database values and a concise heading", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /我的藏书|My books/ })).toBeVisible();
  const stats = await page.getByRole("region", { name: /藏书统计|Collection stats/ }).locator(".atelier-stat-value").allTextContents();
  expect(stats).toHaveLength(4);
  expect(stats.every((value) => /^\d+$/.test(value.trim()))).toBeTruthy();
  await expect(page.locator("header").getByRole("link", { name: /添加一本书|Add a book/ })).toHaveCount(0);
  await expect(page.getByText("设计中的设计")).toHaveCount(0);
  await expect(page.getByText(/书房 \/ A柜|Study \/ Cabinet/)).toHaveCount(0);
});

test("first shelf can be created from the empty state", async ({ page }, testInfo) => {
  const shelfName = `测试书架-${testInfo.project.name}-${crypto.randomUUID()}`;
  await page.goto("/home");
  await page.goto("/manage?focus=shelf");
  await page.locator("#new-shelf").fill(shelfName);
  await page.locator("#new-shelf").press("Enter");
  await expect(page.locator("#main-content").getByText(shelfName, { exact: true })).toHaveCount(2);
  await page.goto("/home");
  const shelfLink = page.locator("#main-content").getByRole("link", { name: new RegExp(shelfName) });
  await expect(shelfLink).toBeVisible();
  await expect(shelfLink).toContainText(/0 本书|0 books/);
});

test("title lookup shows candidates and never shows the removed duplicate version prompt", async ({ page }) => {
  await mockDiscovery(page);
  await page.goto("/add");
  await expect(page.getByText("同一作品有多个版本，请确认出版社、年份和装帧。", { exact: true })).toHaveCount(0);
  await page.getByLabel(/输入书名|Enter a title/).fill("百年孤独");
  const candidate = page.locator("button").filter({ hasText: "百年孤独" }).first();
  await expect(candidate).toBeVisible({ timeout: 10000 });
  await candidate.click();
  await expect(page.getByText(/选择具体版本|Choose an edition/).first()).toBeVisible({ timeout: 10000 });
});

test("ISBN action stays readable on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/add");
  await page.getByRole("tab", { name: /扫描 \/ ISBN|Scan \/ ISBN/ }).click();
  const button = page.getByRole("button", { name: /查找书目|Find book/ });
  await expect(button).toBeVisible();
  const details = await button.evaluate((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return { whiteSpace: style.whiteSpace, width: rect.width, height: rect.height }; });
  expect(details.whiteSpace).toBe("nowrap");
  expect(details.height).toBeGreaterThanOrEqual(44);
  await expectNoOverflow(page);
});

test("language switch changes interface copy", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /English/ }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("one edition can hold two copies and detail metadata survives refresh", async ({ page }, testInfo) => {
  const shelfResponse = await page.request.post("/api/catalog/shelves", { data: { name: `验收位置-${testInfo.project.name}-${Date.now()}` } });
  expect(shelfResponse.ok()).toBeTruthy();
  const shelf = await shelfResponse.json() as { id: string };
  const edition = { id: `e2e-edition-${Date.now()}`, title: "无 ISBN 验收书", authors: ["Fixture Author"], source: "fixture" };
  const firstResponse = await page.request.post("/api/catalog/books/from-edition", { data: { edition, shelfLocationId: shelf.id, shelfSlot: "1", acquisitionMethod: "purchase", priceCents: 1999, currency: "CNY" } });
  const secondResponse = await page.request.post("/api/catalog/books/from-edition", { data: { edition, shelfLocationId: shelf.id, shelfSlot: "2", acquisitionMethod: "gift", priceCents: 0, currency: "CNY" } });
  expect(firstResponse.ok()).toBeTruthy(); expect(secondResponse.ok()).toBeTruthy();
  const first = await firstResponse.json() as { id: string }; const second = await secondResponse.json() as { id: string };
  expect(first.id).not.toBe(second.id);
  await page.goto(`/books/${first.id}`);
  await expect(page.getByRole("heading", { name: "版本与书目" })).toBeVisible();
  await page.getByText("展开购藏与副本档案", { exact: true }).click();
  await page.getByLabel("价格（元）").fill("19.99");
  await page.getByLabel("品相").fill("近全新");
  await page.getByRole("button", { name: "保存档案" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await expect(page.getByLabel("价格（元）")).toHaveValue("19.99");
  await page.goto(`/books/${second.id}`);
  await expect(page.getByLabel("购藏方式")).toHaveValue("gift");
  await expect(page.getByLabel("价格（元）")).toHaveValue("0.00");
});
