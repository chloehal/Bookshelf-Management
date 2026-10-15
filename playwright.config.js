import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5178",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    channel: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: process.env.PLAYWRIGHT_PRODUCTION
      ? "npm run build && npm run preview -- --host 127.0.0.1 --port 5178 --strictPort"
      : "npm run dev -- --host 127.0.0.1 --port 5178 --strictPort",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PRODUCTION,
  },
  reporter: "list",
});
