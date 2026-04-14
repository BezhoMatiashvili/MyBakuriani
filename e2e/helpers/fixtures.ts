import { test as base, type Page, type BrowserContext } from "@playwright/test";
import { authenticateAsRole, type TestUser } from "./auth";
import { TEST_IDS } from "./seed";
import type { Database } from "../../src/lib/types/database";
import fs from "fs";
import path from "path";

type UserRole = Database["public"]["Enums"]["user_role"];

const TEST_USERS_FILE = path.resolve(__dirname, "../.test-users.json");

export function saveTestUsers(users: Record<string, TestUser>): void {
  fs.writeFileSync(TEST_USERS_FILE, JSON.stringify(users, null, 2));
}

export function loadTestUsers(): Record<string, TestUser> {
  if (!fs.existsSync(TEST_USERS_FILE)) {
    throw new Error(
      `Test users file not found at ${TEST_USERS_FILE}. Run global-setup first.`,
    );
  }
  return JSON.parse(fs.readFileSync(TEST_USERS_FILE, "utf-8"));
}

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------
type TestFixtures = {
  guestPage: Page;
  renterPage: Page;
  sellerPage: Page;
  adminPage: Page;
  cleanerPage: Page;
  foodPage: Page;
  transportPage: Page;
  entertainmentPage: Page;
  employmentPage: Page;
  authenticateAs: (role: UserRole, page: Page) => Promise<void>;
  testIds: typeof TEST_IDS;
};

// ---------------------------------------------------------------------------
// Helper to create an authenticated page
// ---------------------------------------------------------------------------
async function createAuthenticatedPage(
  context: BrowserContext,
  role: string,
): Promise<Page> {
  const users = loadTestUsers();
  const user = users[role];
  if (!user) {
    throw new Error(`No test user found for role "${role}"`);
  }
  const page = await context.newPage();
  await authenticateAsRole(user, page);
  return page;
}

// ---------------------------------------------------------------------------
// Extended test fixtures
// ---------------------------------------------------------------------------
export const test = base.extend<TestFixtures>({
  guestPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "guest");
    await use(page);
    await page.close();
  },

  renterPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "renter");
    await use(page);
    await page.close();
  },

  sellerPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "seller");
    await use(page);
    await page.close();
  },

  adminPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "admin");
    await use(page);
    await page.close();
  },

  cleanerPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "cleaner");
    await use(page);
    await page.close();
  },

  foodPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "food");
    await use(page);
    await page.close();
  },

  transportPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "transport");
    await use(page);
    await page.close();
  },

  entertainmentPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "entertainment");
    await use(page);
    await page.close();
  },

  employmentPage: async ({ context }, use) => {
    const page = await createAuthenticatedPage(context, "employment");
    await use(page);
    await page.close();
  },

  authenticateAs: async ({ context }, use) => {
    const fn = async (role: UserRole, page: Page) => {
      const users = loadTestUsers();
      const user = users[role];
      if (!user) throw new Error(`No test user for role "${role}"`);
      await authenticateAsRole(user, page);
    };
    await use(fn);
  },

  testIds: async ({}, use) => {
    await use(TEST_IDS);
  },
});

export { expect } from "@playwright/test";
