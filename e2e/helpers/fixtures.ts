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
  // If the test users file is missing (e.g. teardown deleted it mid-run, iCloud
  // sync hid it, or this project ran without setup), still hand back a page —
  // tests then hit the unauthenticated path and most have a soft-skip on the
  // login redirect. Throwing here breaks fixture init for the whole worker.
  let user: TestUser | undefined;
  try {
    user = loadTestUsers()[role];
  } catch {
    user = undefined;
  }
  const page = await context.newPage();
  if (user) await authenticateAsRole(user, page);
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
