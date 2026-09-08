import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "feedback-refinements.spec.ts",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3017", trace: "retain-on-failure" },
});
