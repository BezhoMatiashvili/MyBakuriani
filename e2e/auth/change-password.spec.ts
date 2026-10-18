import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/auth";
import { supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";
import type { Database } from "../../src/lib/types/database";

type UserRole = Database["public"]["Enums"]["user_role"];

// C51: every cabinet's settings page carries the shared password card, and a
// change needs the current password (a session alone never sets one).

const CHANGE = "პაროლის შეცვლა";
const SAVE = "შენახვა";
const WRONG_CURRENT = "მიმდინარე პაროლი არასწორია.";
const SAME_PASSWORD = "ახალი პაროლი ძველისგან უნდა განსხვავდებოდეს.";
const SAVED = "პაროლი შეიცვალა.";
const SET_VIA_EMAIL = "ბმულის მოთხოვნა";

const createdIds: string[] = [];

// Long and random, so leaked-password protection never refuses it.
function freshPassword() {
  return `Mb-${randomUUID()}`;
}

async function createUser(role: UserRole) {
  const id = randomUUID();
  createdIds.push(id);
  return createTestUser({
    id,
    phone: `+9955${Math.floor(Math.random() * 100_000_000)
      .toString()
      .padStart(8, "0")}`,
    displayName: `Password ${role}`,
    role,
  });
}

function anonClient() {
  const e2e = configureIsolatedE2E();
  return createClient(e2e.supabaseUrl, e2e.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Stores a session in the browser the way @supabase/ssr does. The shared
 * authenticateAsRole cookie carries a trimmed user without `identities`, and
 * the card decides from them whether the account has a password.
 */
async function writeSession(page: Page, session: Session) {
  const ref = new URL(configureIsolatedE2E().supabaseUrl).hostname.split(
    ".",
  )[0];
  const key = `sb-${ref}-auth-token`;
  // base64url needs no URI escaping, so @supabase/ssr's chunker splits it
  // into plain 3180-character slices.
  const value =
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const chunks =
    value.length <= 3180
      ? [{ name: key, value }]
      : (value.match(/.{1,3180}/g) ?? []).map((part, i) => ({
          name: `${key}.${i}`,
          value: part,
        }));
  await page.context().addCookies(
    chunks.map((chunk) => ({
      ...chunk,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );
  // The cookie banner sits over the bottom of the page, where the card is.
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
}

/**
 * Reuses the session createTestUser already signed in, with the full user
 * read through the admin API: GoTrue allows about 30 password sign-ins per
 * 5 minutes per IP, and every test signing in again ran out of them.
 * `withoutEmailIdentity` drops the email identity, as a Google-only account.
 */
async function useTestUserSession(
  page: Page,
  user: TestUser,
  { withoutEmailIdentity = false } = {},
) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(user.id);
  if (error || !data.user) {
    throw new Error(`getUserById failed: ${error?.message ?? "no user"}`);
  }
  const identities = (data.user.identities ?? []).filter(
    (identity) => !withoutEmailIdentity || identity.provider !== "email",
  );
  await writeSession(page, {
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { ...data.user, identities },
  });
}

/** Gives the account a known password and signs the browser in with it. */
async function signInWithNewPassword(
  page: Page,
  user: TestUser,
  password: string,
) {
  const { error: setError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    { password },
  );
  if (setError) throw new Error(`set password failed: ${setError.message}`);
  const { data, error } = await anonClient().auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`sign-in failed: ${error?.message ?? "no session"}`);
  }
  await writeSession(page, data.session);
}

/** The password sign-ins and password updates the page sends, in order. */
function recordAuthWrites(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/auth/v1/token?grant_type=password")) {
      calls.push("sign-in");
    } else if (request.method() === "PUT" && url.includes("/auth/v1/user")) {
      calls.push("update");
    }
  });
  return calls;
}

async function submitChange(
  page: Page,
  current: string,
  next: string,
  confirm = next,
) {
  await page.locator("#account-current-password").fill(current);
  await page.locator("#account-new-password").fill(next);
  await page.locator("#account-confirm-password").fill(confirm);
  // Settings pages have other "შენახვა" buttons (notification preferences).
  await page
    .locator("form", { has: page.locator("#account-current-password") })
    .getByRole("button", { name: SAVE, exact: true })
    .click();
}

// deleteTestUser removes only the auth user; the profile createTestUser
// upserts (and the balance row made for it) would stay behind as orphans.
test.afterAll(async () => {
  for (const id of createdIds) await deleteTestUser(id);
  if (createdIds.length === 0) return;
  await supabaseAdmin.from("balances").delete().in("user_id", createdIds);
  await supabaseAdmin.from("profiles").delete().in("id", createdIds);
});

test.describe("password change", () => {
  test.describe.configure({ timeout: 120_000 });

  test("needs the current password and keeps this session", async ({
    page,
  }) => {
    const oldPassword = freshPassword();
    const newPassword = freshPassword();
    const user = await createUser("guest");
    await signInWithNewPassword(page, user, oldPassword);
    const calls = recordAuthWrites(page);

    await page.goto("/dashboard/guest/profile");
    await page.getByRole("button", { name: CHANGE, exact: true }).click();

    // A wrong current password stops at the sign-in: no update is sent.
    await submitChange(page, "not-the-password-123", newPassword);
    await expect(page.getByText(WRONG_CURRENT)).toBeVisible();
    expect(calls).toEqual(["sign-in"]);

    // The right one, but the same password again: GoTrue's same_password.
    calls.length = 0;
    await submitChange(page, oldPassword, oldPassword);
    await expect(page.getByText(SAME_PASSWORD)).toBeVisible();
    expect(calls).toEqual(["sign-in", "update"]);

    // One sign-in with the current password, then exactly one update.
    calls.length = 0;
    await submitChange(page, oldPassword, newPassword);
    await expect(page.getByRole("status")).toHaveText(SAVED);
    expect(calls).toEqual(["sign-in", "update"]);

    const { error: oldError } = await anonClient().auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });
    expect(oldError?.code).toBe("invalid_credentials");
    const { error: newError } = await anonClient().auth.signInWithPassword({
      email: user.email,
      password: newPassword,
    });
    expect(newError).toBeNull();

    // The browser that made the change stays signed in.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard\/guest\/profile/);
    await expect(
      page.getByRole("button", { name: CHANGE, exact: true }),
    ).toBeVisible();
  });

  test("an account without a password gets the emailed link, no form", async ({
    page,
  }) => {
    const user = await createUser("guest");
    await useTestUserSession(page, user, { withoutEmailIdentity: true });

    await page.goto("/dashboard/guest/profile");
    await expect(
      page.getByRole("link", { name: SET_VIA_EMAIL, exact: true }),
    ).toHaveAttribute("href", /\/auth\/forgot-password$/);
    await expect(
      page.getByRole("button", { name: CHANGE, exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("#account-current-password")).toHaveCount(0);
  });

  const CABINET_PAGES: Array<[UserRole, string]> = [
    ["guest", "/dashboard/guest/profile"],
    ["renter", "/dashboard/renter/profile"],
    ["seller", "/dashboard/seller/settings"],
    ["cleaner", "/dashboard/cleaner/parameters"],
    ["food", "/dashboard/food/parameters"],
    ["transport", "/dashboard/transport/parameters"],
    ["entertainment", "/dashboard/entertainment/parameters"],
    ["employment", "/dashboard/employment/parameters"],
    ["handyman", "/dashboard/services/parameters"],
  ];

  for (const [role, path] of CABINET_PAGES) {
    test(`${role} settings carry the card`, async ({ page }) => {
      await useTestUserSession(page, await createUser(role));

      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await page.getByRole("button", { name: CHANGE, exact: true }).click();
      await expect(page.locator("#account-current-password")).toBeVisible();
    });
  }

  test("admin reaches the card from its sidebar", async ({ page }) => {
    await useTestUserSession(page, await createUser("admin"));

    await page.goto("/dashboard/admin");
    await page
      .locator("aside")
      .getByRole("link", { name: "შესვლის მეთოდები", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/account$/);
    await page.getByRole("button", { name: CHANGE, exact: true }).click();
    await expect(page.locator("#account-current-password")).toBeVisible();
  });
});
