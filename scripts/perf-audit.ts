import { chromium } from "@playwright/test";

const baseURL = process.env.PERF_BASE_URL || "http://localhost:3000";
const routes = ["/", "/home", "/add"];

type RouteAudit = {
  route: string;
  navigationMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  lcpMs: number | null;
  transferBytes: number;
  jsBytes: number;
  cssBytes: number;
  fontBytes: number;
  fontRequests: number;
  largestFontBytes: number;
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const output: RouteAudit[] = [];
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1441, height: 778 } });
    await page.addInitScript("window.__lcp = null; new PerformanceObserver(function(entries) { var entry = entries.getEntries().at(-1); if (entry) window.__lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });");
    const started = performance.now();
    await page.goto(`${baseURL}${route}`, { waitUntil: "load" });
    const navigationMs = performance.now() - started;
    await page.waitForTimeout(300);
    const data = await page.evaluate(`(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      const bytesFor = (pattern) => resources.filter((resource) => pattern.test(resource.name)).reduce((total, resource) => total + resource.transferSize, 0);
      const fonts = resources.filter((resource) => /\\.(woff2?|ttf|otf)(\\?|$)/i.test(resource.name));
      return {
        domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd,
        lcpMs: window.__lcp,
        transferBytes: resources.reduce((total, resource) => total + resource.transferSize, 0),
        jsBytes: bytesFor(/\\.js(\\?|$)/),
        cssBytes: bytesFor(/\\.css(\\?|$)/),
        fontBytes: fonts.reduce((total, resource) => total + resource.transferSize, 0),
        fontRequests: fonts.length,
        largestFontBytes: Math.max(0, ...fonts.map((resource) => resource.transferSize)),
      };
    })()`);
    output.push({ route, navigationMs: Math.round(navigationMs), ...Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([key, value]) => [key, typeof value === "number" ? Math.round(value) : value])) as Omit<RouteAudit, "route" | "navigationMs"> });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(output, null, 2));
}

void main();
