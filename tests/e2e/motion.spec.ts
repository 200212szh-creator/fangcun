import { expect, test } from "@playwright/test";

test.describe("motion system", () => {
  test("desktop content, disclosure, save feedback, and screenshots", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 778 }, locale: "zh-CN" });
    const page = await context.newPage();
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#main-content > div")).toHaveClass(/motion-page-in/);
    await expect(page.locator("body")).toHaveCSS("overflow-x", "visible");
    await page.screenshot({ path: "artifacts/motion-audit/after/desktop-home.png", fullPage: true });

    await page.goto("/manage?focus=shelf", { waitUntil: "domcontentloaded" });
    const menuTrigger = page.locator('summary[aria-label*="更多操作"]').first();
    await menuTrigger.click();
    await expect(page.getByRole("button", { name: "编辑名称" })).toBeVisible();
    await page.getByRole("tab", { name: /分类/ }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();

    const catalog = await page.request.get("/api/catalog/books");
    const firstCopy = (await catalog.json() as { items: Array<{ id: string }> }).items[0];
    expect(firstCopy?.id).toBeTruthy();
    await page.goto(`/books/${firstCopy.id}`, { waitUntil: "domcontentloaded" });
    await page.getByText("展开购藏与副本档案", { exact: true }).click();
    await expect(page.getByLabel("位置编码（自动生成）")).toBeVisible();

    let patchCount = 0;
    await page.route("**/api/catalog/books/**", async (route) => {
      if (route.request().method() !== "PATCH") { await route.continue(); return; }
      patchCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 220));
      await route.continue();
    });
    const save = page.getByRole("button", { name: "保存档案", exact: true });
    const before = await save.boundingBox();
    await save.dblclick({ delay: 15 });
    await expect(page.getByText("保存成功，档案已同步", { exact: true })).toBeVisible();
    const after = await page.getByRole("button", { name: "保存档案", exact: true }).boundingBox();
    expect(patchCount).toBe(1);
    expect(after?.width).toBe(before?.width);
    await context.close();
  });

  test("mobile drawer closes, returns focus, and leaves no mask", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
    const page = await context.newPage();
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    const open = page.getByRole("button", { name: "打开菜单" });
    await open.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await expect(dialog).toBeVisible();
    await page.locator("div.fixed.inset-0").first().click({ position: { x: 380, y: 820 } });
    await expect(dialog).toBeHidden();
    await expect(page.locator("div.fixed.inset-0")).toHaveCount(0);
    await page.screenshot({ path: "artifacts/motion-audit/after/mobile-home.png", fullPage: true });
    await context.close();
  });

  test("reduced motion disables movement and keeps drawer immediate", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 844 }, locale: "zh-CN", reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    const reduced = await page.evaluate(() => ({
      animation: getComputedStyle(document.querySelector("#main-content > div") as Element).animationName,
      scroll: getComputedStyle(document.documentElement).scrollBehavior,
    }));
    expect(reduced.animation).toBe("none");
    expect(reduced.scroll).toBe("auto");
    await page.getByRole("button", { name: "打开菜单" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "关闭" }).click();
    await expect(dialog).toBeHidden();
    await page.screenshot({ path: "artifacts/motion-audit/after/reduced-motion.png", fullPage: true });
    await context.close();
  });

  test("fast input cancels stale add results and search loading is delayed", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
    const page = await context.newPage();
    const addQueries: string[] = [];
    await page.route("**/api/discovery/books**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/editions")) { await route.continue(); return; }
      const query = url.searchParams.get("q") ?? "";
      addQueries.push(query);
      if (query === "第一查询") await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ id: `motion-${query}`, title: query, authors: ["测试作者"], score: 0.98, editionCount: 1, source: "motion-fixture" }], offline: false }) });
    });
    await page.goto("/add", { waitUntil: "domcontentloaded" });
    const title = page.getByLabel(/输入书名/);
    await title.fill("第一查询");
    await page.waitForTimeout(380);
    await title.fill("第二查询");
    await expect(page.getByRole("button", { name: /第二查询/ })).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("button", { name: /第一查询/ })).toHaveCount(0);
    expect(addQueries).toContain("第一查询");
    expect(addQueries).toContain("第二查询");

    await page.route("**/api/discovery/search**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 450));
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ kind: "paper", id: "motion-paper", title: "动效测试结果", authors: ["测试作者"], source: "motion-fixture", abstract: "用于验证检索状态替换。" }] }) });
    });
    await page.goto("/search", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/搜索书名/).fill("设计");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page.waitForTimeout(150);
    await expect(page.getByRole("status", { name: "正在检索" })).toHaveCount(0);
    await page.waitForTimeout(220);
    await expect(page.getByRole("status", { name: "正在检索" })).toBeVisible();
    await expect(page.getByText("动效测试结果", { exact: true })).toBeVisible({ timeout: 2000 });
    await context.close();
  });
});
