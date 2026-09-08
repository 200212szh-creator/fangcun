import { chromium } from "@playwright/test";

const baseURL = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const output = "artifacts";

async function capture(path: string, file: string, viewport: { width: number; height: number }) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport });
  await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${output}/${file}`, fullPage: false });
  await browser.close();
}

async function main() {
  await capture("/", "entry-1441x778.png", { width: 1441, height: 778 });
  await capture("/", "entry-375x812.png", { width: 375, height: 812 });
  await capture("/home", "home-1441x778.png", { width: 1441, height: 778 });
  await capture("/add", "add-1441x778.png", { width: 1441, height: 778 });
  await capture("/library", "library-1441x778.png", { width: 1441, height: 778 });
  await capture("/manage", "manage-1441x778.png", { width: 1441, height: 778 });
}

void main();
