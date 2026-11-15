import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/foreman",
  outputDir: "test-results",
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "foreman-report/report.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "on",
    video: "on",
    trace: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node server.js",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
