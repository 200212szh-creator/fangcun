import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const baseURL = "http://localhost:3017";
const output = path.join(process.cwd(), "artifacts", "phase7-audit", "before");

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${baseURL}/home`, { waitUntil: "networkidle" });
  await shot(page, "01-empty-home.png");

  await page.goto(`${baseURL}/add`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /完全手动录入|Manual/ }).click();
  await shot(page, "02-manual-form-expanded.png");

  const shelfResponse = await page.request.post(`${baseURL}/api/catalog/shelves`, { data: { name: "审查书架" } });
  const shelf = await shelfResponse.json() as { id: string };
  const bookResponse = await page.request.post(`${baseURL}/api/catalog/books/from-edition`, {
    data: {
      edition: { id: "phase7-before-edition", title: "百年孤独", authors: ["加西亚·马尔克斯"], publisher: "南海出版公司", publicationYear: 2011, isbn13: "9787544253994", source: "audit" },
      shelfLocationId: shelf.id,
      shelfSlot: "1",
    },
  });
  const book = await bookResponse.json() as { id: string };
  await page.goto(`${baseURL}/books/${book.id}`, { waitUntil: "networkidle" });
  await shot(page, "03-detail-all-fields.png");

  await page.getByLabel("批注内容").fill("时间在记忆中形成回环。");
  await page.getByLabel("概念").fill("时间, 记忆");
  await page.getByRole("button", { name: "保存批注" }).click();
  await page.getByPlaceholder("例如：设计").fill("时间");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "检索", exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("networkidle");
  await shot(popup, "04-concept-search-raw-json.png");

  await browser.close();
}

void main();
