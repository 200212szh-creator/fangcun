import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3017";
process.env.PLAYWRIGHT_TEST_BASE_URL = baseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  workers: 1,
  fullyParallel: false,
  use: { baseURL, trace: "retain-on-failure", locale: "zh-CN" },
  webServer: {
    command: "node scripts/e2e-server.cjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      FANGCUN_E2E: "1",
      NODE_ENV: "test",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
