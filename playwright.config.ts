import { defineConfig } from "@playwright/test";

import { requireLoopbackBaseUrl } from "./tests/support/acceptance-environment";

const baseURL = requireLoopbackBaseUrl(
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4000",
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: "output/playwright/test-results",
  reporter: "line",
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
