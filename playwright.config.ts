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
  webServer: {
    command: "npm run build && npm start -- --port 4002",
    url: "http://localhost:4002/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
