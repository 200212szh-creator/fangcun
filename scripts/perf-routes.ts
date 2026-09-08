import { chromium } from "@playwright/test";

const baseURL = process.env.PERF_BASE_URL || "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1441, height: 778 } });
  await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  const entryToHomeStart = performance.now();
  await page.getByRole("button", { name: /进入我的藏书室|Enter my library/ }).click();
  await page.waitForURL(`${baseURL}/home`);
  const entryToHomeMs = Math.round(performance.now() - entryToHomeStart);
  await page.goto(`${baseURL}/home`, { waitUntil: "networkidle" });
  const homeToAddStart = performance.now();
  await page.getByRole("link", { name: /添加一本书|Add a book/ }).first().click();
  await page.waitForURL(`${baseURL}/add`);
  const homeToAddMs = Math.round(performance.now() - homeToAddStart);
  console.log(JSON.stringify({ entryToHomeMs, homeToAddMs }, null, 2));
  await browser.close();
}

void main();
