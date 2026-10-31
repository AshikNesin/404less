import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false, // Run sequentially to avoid browser conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid parallel browser issues
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Use headed mode for local development (works better on macOS)
    headless: !!process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Start the dev server directly via tsx (bypassing the `pnpm dev` portless
    // wrapper, which conflicts with Playwright's port-availability check).
    // E2e runs on its own throwaway SQLite file — wiped each run, then
    // migrations + seed run first so the demo user exists — so it never
    // depends on (or disturbs) the developer's `data/dev.db`. Set
    // DATABASE_URL to run against a different engine instead.
    command:
      "rm -f data/e2e.db data/e2e.db-shm data/e2e.db-wal && " +
      "DATABASE_URL=file:./data/e2e.db pnpm exec tsx scripts/seed.ts && " +
      "DATABASE_URL=file:./data/e2e.db pnpm exec tsx watch --max-old-space-size=512 apps/web/src/server/entry.node.ts",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
