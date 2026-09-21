import { defineConfig, devices } from "@playwright/test";

const stablePort = process.env.E2E_STABLE_PORT || "3017";
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || `http://127.0.0.1:${stablePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results/stable",
  use: { baseURL, trace: "retain-on-failure", locale: "zh-CN" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
