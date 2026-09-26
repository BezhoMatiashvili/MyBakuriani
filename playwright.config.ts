import { defineConfig, devices } from "@playwright/test";
import { configureIsolatedE2E } from "./e2e/helpers/env";

// E2E accepts only a dedicated project supplied through TEST_* variables.
const e2e = configureIsolatedE2E();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: e2e.baseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Setup project — seeds DB before tests
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
      teardown: "teardown",
    },
    {
      name: "teardown",
      testMatch: /global-teardown\.ts/,
    },

    // Public pages — no auth needed
    {
      name: "public",
      testMatch: /public\/.+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Seeds WITHOUT the paired teardown. `setup` declares `teardown: "teardown"`,
    // so running it alone seeds and then immediately deletes everything - use
    // this when you need seeded data to persist for a standalone sweep
    // (scripts/responsive-audit.mjs), then run `teardown-only` afterwards.
    {
      name: "seed-only",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "teardown-only",
      testMatch: /global-teardown\.ts/,
    },

    // VIP / SUPER VIP / discount purchase flows against the real purchase-vip
    // edge function. vip-seed runs first (paired with vip-teardown, like
    // setup/teardown above); each viewport project owns its own users
    // (e2e/vip/vip-fixtures.ts), so the two can run side by side.
    {
      name: "vip-seed",
      testMatch: /vip\/vip\.setup\.ts/,
      teardown: "vip-teardown",
    },
    { name: "vip-teardown", testMatch: /vip\/vip\.teardown\.ts/ },
    {
      name: "vip-desktop",
      testMatch: /vip\/.+\.spec\.ts/,
      dependencies: ["vip-seed"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "vip-mobile",
      testMatch: /vip\/.+\.spec\.ts/,
      dependencies: ["vip-seed"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },

    // Card geometry — listing cards must stay the same size regardless of how
    // much content each one carries. Sets its own viewports per test.
    {
      name: "ui",
      testMatch: /ui\/.+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Auth flows
    {
      name: "auth",
      testMatch: /auth\/.+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Guest role tests
    {
      name: "guest",
      testMatch: /dashboards\/guest\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Renter role tests
    {
      name: "renter",
      testMatch: /dashboards\/renter\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Seller role tests
    {
      name: "seller",
      testMatch: /dashboards\/seller\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Cleaner role tests
    {
      name: "cleaner",
      testMatch: /dashboards\/cleaner\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Food provider tests
    {
      name: "food",
      testMatch: /dashboards\/food\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Service provider tests
    {
      name: "service",
      testMatch: /dashboards\/service\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Scoped inbox behavior spans several dashboard families, so it has an
    // isolated project instead of being coupled to any one role's broad suite.
    {
      name: "dashboard-notifications",
      testMatch: /dashboards\/notifications\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Admin role tests
    {
      name: "admin",
      testMatch: /dashboards\/admin\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Cross-role interaction tests
    {
      name: "cross-role",
      testMatch: /cross-role\/.+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Booking system tests
    {
      name: "booking",
      testMatch: /booking\/.+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Search & filter tests
    {
      name: "search",
      testMatch: /search\/.+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Mobile responsive tests
    {
      name: "mobile",
      testMatch: /mobile\/.+\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    // Public mobile checks intentionally do not depend on seeded QA data so
    // they can run against any preview and cover WebKit regressions as well.
    {
      name: "mobile-webkit",
      testMatch: /mobile\/.+\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],

  /*
   * Web server management:
   * - Locally: starts `next start` (requires `npm run build` first)
   * - CI: starts `npm run dev`
   * - If a server is already running on :3000, reuses it
   */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
