import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-results",
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node scripts/e2e-backend.mjs",
      url: "http://127.0.0.1:3333/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter frontend exec vite --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_URL: "http://127.0.0.1:3333",
      },
    },
  ],
});
