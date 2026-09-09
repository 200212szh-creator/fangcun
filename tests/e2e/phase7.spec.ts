import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "./fixtures";
import jsQR from "jsqr";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3017";
const output = path.join(process.cwd(), "artifacts", "phase7-audit", "after");

async function capture(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: path.join(output, name), fullPage });
}

async function books(page: Page) {
  const response = await page.request.get(`${baseURL}/api/catalog/books`);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ items: Array<{ id: string; edition: { id: string; title: string; isbn13?: string }; shelfLocationId?: string; shelfSlot?: string }> }>;
}

async function expectNoOverflow(page: Page) {
  const details = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) }))
      .filter((element) => element.right > window.innerWidth + 1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 8);
    return { viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, elements };
  });
  expect(details.scrollWidth).toBeLessThanOrEqual(details.viewport + 1);
}

test("phase 7 isolated daily workflow", async ({ browser }) => {
  test.setTimeout(60000);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN", acceptDownloads: true });
  const page = await context.newPage();
  const fatalErrors: string[] = [];
  page.on("pageerror", (error) => fatalErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) fatalErrors.push(message.text()); });

  await page.route("**/api/discovery/books**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/editions")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ id: "phase7-edition-main", title: "百年孤独", authors: ["加西亚·马尔克斯"], publisher: "南海出版公司", publicationYear: 2011, format: "精装", language: "zh", isbn13: "9787544253994", source: "phase7-fixture" }] }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ id: "phase7-candidate", title: "百年孤独", authors: ["加西亚·马尔克斯"], score: 0.99, editionCount: 1, source: "phase7-fixture" }], nextCursor: null, offline: false }) });
  });

  await page.goto(`${baseURL}/home`, { waitUntil: "networkidle" });
  await expect(page.getByRole("region", { name: /藏书统计|Collection stats/ }).locator(".atelier-stat-value")).toHaveText(["0", "0", "0", "0"]);
  await expect(page.getByRole("link", { name: "添加一本书" }).first()).toBeVisible();
  await capture(page, "01-empty-library.png");

  await page.goto(`${baseURL}/manage?focus=shelf`, { waitUntil: "networkidle" });
  await page.locator("#new-shelf").fill("书房东墙 / A 架");
  await page.locator("#new-shelf").press("Enter");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByText("书房东墙 / A 架", { exact: true })).toHaveCount(2);
  await capture(page, "02-shelf-created.png");
  const metadataResponse = await page.request.get(`${baseURL}/api/catalog/metadata`);
  const metadata = await metadataResponse.json() as { shelves: Array<{ id: string; name: string }> };
  const shelf = metadata.shelves.find((item) => item.name === "书房东墙 / A 架");
  expect(shelf).toBeTruthy();

  await page.goto(`${baseURL}/add`, { waitUntil: "networkidle" });
  await page.getByLabel(/输入书名/).fill("百年孤独");
  await expect(page.locator("button").filter({ hasText: "百年孤独" }).first()).toBeVisible();
  await capture(page, "03-title-search-results.png");
  await page.locator("button").filter({ hasText: "百年孤独" }).first().click();
  await expect(page.getByText("选择具体版本", { exact: true })).toBeVisible();
  await page.locator("button").filter({ hasText: "南海出版公司" }).click();
  await page.locator("select").selectOption(shelf!.id);
  await page.getByPlaceholder("例如：第 2 层").fill("1");
  await capture(page, "04-edition-selected.png");
  await page.getByRole("button", { name: "确认此版本" }).click();
  await expect(page.getByRole("status")).toContainText("已加入藏书");
  await capture(page, "05-first-copy-saved.png");
  let catalog = await books(page);
  expect(catalog.items).toHaveLength(1);
  const firstCopy = catalog.items[0];
  expect(firstCopy.shelfSlot).toBe("1");

  await page.getByPlaceholder("例如：第 2 层").fill("2");
  await page.getByRole("button", { name: "确认此版本" }).click();
  await expect(page.getByRole("status")).toContainText("新增另一册");
  await capture(page, "06-second-copy-saved.png");
  catalog = await books(page);
  expect(catalog.items).toHaveLength(2);
  expect(new Set(catalog.items.map((item) => item.id)).size).toBe(2);
  expect(new Set(catalog.items.map((item) => item.edition.id)).size).toBe(1);

  await page.getByRole("tab", { name: "完全手动录入" }).click();
  await expect(page.getByText("完善版本与购藏档案（可选）", { exact: true })).toBeVisible();
  await expect(page.locator("details").filter({ hasText: "完善版本与购藏档案" })).not.toHaveAttribute("open", "");
  await page.locator('input[name="title"]').fill("城南旧事（旧藏）");
  await page.locator('input[name="authors"]').fill("林海音");
  await page.locator('select[name="shelfLocationId"]').selectOption(shelf!.id);
  await page.locator('input[name="shelfSlot"]').fill("3");
  await capture(page, "07-isbnless-manual-entry.png");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已加入藏书");
  catalog = await books(page);
  expect(catalog.items).toHaveLength(3);
  const oldBook = catalog.items.find((item) => item.edition.title === "城南旧事（旧藏）");
  expect(oldBook?.edition.isbn13).toBeFalsy();

  await page.goto(`${baseURL}/library`, { waitUntil: "networkidle" });
  await expect(page.getByText("百年孤独", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("城南旧事（旧藏）", { exact: true }).first()).toBeVisible();
  await capture(page, "08-library-three-copies.png");

  await page.goto(`${baseURL}/books/${firstCopy.id}`, { waitUntil: "networkidle" });
  await expect(page.getByText("展开完整版本档案", { exact: true })).toBeVisible();
  await expect(page.locator("details").filter({ hasText: "展开完整版本档案" })).not.toHaveAttribute("open", "");
  await capture(page, "09-progressive-detail.png");

  await page.getByLabel("借阅人").fill("王小明");
  await page.getByLabel("应还日期").fill("2000-01-01");
  await page.getByRole("button", { name: "记录借出" }).click();
  await expect(page.getByText("已逾期", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("借阅已记录");
  await capture(page, "10-loan-overdue.png");

  await page.getByLabel("新的归还日期").fill("2099-12-31");
  await page.getByRole("button", { name: "续借" }).click();
  await expect(page.getByRole("status")).toContainText("期限已更新");
  await expect(page.getByText("已逾期", { exact: true })).toHaveCount(0);
  await capture(page, "11-loan-renewed.png");

  await page.getByRole("button", { name: "归还" }).click();
  await expect(page.getByRole("status")).toContainText("已归还");
  await expect(page.getByText(/查看归还历史（1）/)).toBeVisible();
  await capture(page, "12-loan-returned.png");

  await page.getByLabel("页码或章节").fill("第 120 页");
  await page.getByLabel("概念", { exact: true }).fill("时间，记忆");
  await page.getByLabel("批注内容").fill("时间在记忆中形成回环。");
  await page.getByRole("button", { name: "保存批注" }).click();
  await expect(page.getByText("批注已保存", { exact: true })).toBeVisible();
  const oldAnnotation = await page.request.post(`${baseURL}/api/catalog/books/${oldBook!.id}/annotations`, { data: { pageLabel: "第一章", body: "旧城的时间沉积在日常生活里。", concepts: ["时间", "故乡"] } });
  expect(oldAnnotation.ok()).toBeTruthy();
  await page.getByLabel("跨书检索概念").fill("时间");
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await expect(page.getByRole("link", { name: "打开原书" })).toHaveCount(2);
  await capture(page, "13-annotation-concept-results.png");

  await page.goto(`${baseURL}/manage`, { waitUntil: "networkidle" });
  const shelfBook = page.locator('a[title="百年孤独"]').first();
  await expect(shelfBook).toBeVisible();
  await capture(page, "14-shelf-map-locates-book.png");
  await shelfBook.click();
  await expect(page.getByRole("heading", { name: "百年孤独" })).toBeVisible();

  const pngResponse = await page.request.get(`${baseURL}/api/catalog/books/${firstCopy.id}/bookplate?format=png`);
  const svgResponse = await page.request.get(`${baseURL}/api/catalog/books/${firstCopy.id}/bookplate?format=svg`);
  expect(pngResponse.ok()).toBeTruthy(); expect(svgResponse.ok()).toBeTruthy();
  expect(pngResponse.headers()["content-type"]).toContain("image/png");
  expect(svgResponse.headers()["content-type"]).toContain("image/svg+xml");
  const png = await pngResponse.body();
  const decodedPixels = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(decodedPixels.data), decodedPixels.info.width, decodedPixels.info.height);
  expect(decoded?.data).toBe(`fangcun://book/${firstCopy.id}`);
  const svg = await svgResponse.text();
  expect(svg).toContain("<svg");
  fs.writeFileSync(path.join(output, `fangcun-${firstCopy.id}.png`), png);
  fs.writeFileSync(path.join(output, `fangcun-${firstCopy.id}.svg`), svg);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "zh-CN" });
  const mobilePage = await mobile.newPage();
  mobilePage.on("pageerror", (error) => fatalErrors.push(`mobile: ${error.message}`));
  await mobilePage.goto(`${baseURL}/add`, { waitUntil: "networkidle" });
  const tabs = mobilePage.getByRole("tab");
  for (let index = 0; index < await tabs.count(); index += 1) expect((await tabs.nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await tabs.filter({ hasText: "扫描 / ISBN" }).click();
  const cameraButton = mobilePage.getByRole("button", { name: "启动摄像头" });
  await expect(cameraButton).toBeVisible();
  await cameraButton.click();
  await expect(mobilePage.getByRole("status")).toContainText(/不支持条码识别|没有可用摄像头|摄像头权限被拒绝|把 ISBN 条码对准镜头/);
  await capture(mobilePage, "15-mobile-isbn-scan.png");
  await tabs.filter({ hasText: "完全手动录入" }).click();
  await expectNoOverflow(mobilePage);
  await capture(mobilePage, "16-mobile-progressive-form.png");
  await mobilePage.goto(`${baseURL}/manage`, { waitUntil: "networkidle" });
  await expect(mobilePage.locator('a[title="百年孤独"]').first()).toBeVisible();
  await expectNoOverflow(mobilePage);
  await capture(mobilePage, "17-mobile-shelf-map.png");
  await mobilePage.goto(`${baseURL}/settings`, { waitUntil: "networkidle" });
  await expect(mobilePage.getByRole("heading", { name: "设置" })).toBeVisible();
  await capture(mobilePage, "18-mobile-guide.png");

  const keyboardPage = await context.newPage();
  await keyboardPage.goto(`${baseURL}/home`, { waitUntil: "networkidle" });
  const skipLink = keyboardPage.getByRole("link", { name: "跳到主要内容" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(keyboardPage).toHaveURL(/#main-content$/);

  await mobile.close();
  await context.close();
  expect(fatalErrors).toEqual([]);
});
