import { createFixtureBook, expect, test } from "./fixtures";

test("feedback refinements are visible and actionable", async ({ page }) => {
  await createFixtureBook(page, "feedback");
  await page.goto("/manage?focus=shelf", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab", { name: /分类/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /书架/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /标签/ })).toBeVisible();
  await expect(page.locator('summary[aria-label*="更多操作"]').first()).toBeVisible();

  await page.route("**/api/discovery/books**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/editions")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ id: "feedback-edition", title: "百年孤独", authors: ["加西亚·马尔克斯"], publisher: "南海出版公司", publicationYear: 2011, format: "精装", source: "feedback-fixture" }] }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ id: "feedback-candidate", title: "百年孤独", authors: ["加西亚·马尔克斯"], score: 0.99, editionCount: 1, source: "feedback-fixture" }], nextCursor: null, offline: false }) });
  });
  await page.goto("/add", { waitUntil: "networkidle" });
  await page.getByLabel(/输入书名/).fill("百年孤独");
  await page.getByRole("button", { name: /百年孤独/ }).first().click();
  await expect(page.getByRole("status")).toContainText("版本已加载");
  await expect(page.getByText("选择具体版本", { exact: true })).toBeVisible();

  const catalog = await page.request.get("/api/catalog/books");
  const firstCopy = (await catalog.json() as { items: Array<{ id: string }> }).items[0];
  await page.goto(`/books/${firstCopy.id}`, { waitUntil: "networkidle" });
  await page.getByText("展开购藏与副本档案", { exact: true }).click();
  await page.getByRole("textbox", { name: "层 / 格", exact: true }).fill("4");
  await expect(page.getByLabel("位置编码（自动生成）")).toHaveValue(/书房东墙-4/);
  await page.getByRole("button", { name: "保存档案" }).click();
  await expect(page.getByText("档案已保存", { exact: true })).toBeVisible();
  await expect(page.getByText("保存成功，档案已同步", { exact: true })).toBeVisible();
});


