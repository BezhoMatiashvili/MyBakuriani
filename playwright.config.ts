import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

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
    baseURL: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
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
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
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
