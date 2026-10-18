import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  authenticateAsRole,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../helpers/auth";
import { supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";

// The consent links (register wizard, ConsentGate, /consent-required) used to
// open the policy in a new tab, where ConsentGate covered it with the same
// dialog again. They now open the document in place, with a back arrow that
// returns to the same, still unanswered checkboxes.

const TERMS_LINK = "წესებსა და პირობებს";
const PRIVACY_LINK = "კონფიდენციალურობის პოლიტიკას";
const MARKETING_LINK = "(პირდაპირი მარკეტინგის პოლიტიკა)";
const BACK = "უკან დაბრუნება";
const DOCS = [
  [TERMS_LINK, "წესები და პირობები"],
  [PRIVACY_LINK, "კონფიდენციალურობის პოლიტიკა"],
  [MARKETING_LINK, "პირდაპირი მარკეტინგის პოლიტიკა"],
] as const;
const GATE = '[role="dialog"][aria-labelledby="consent-gate-title"]';

async function openDoc(
  page: Page,
  scope: Page | Locator,
  link: string,
  title: string,
) {
  await scope.getByRole("link", { name: link, exact: true }).click();
  // `exact`: the gate's own accessible name contains every link text.
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(
    dialog.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  return dialog;
}

// A signed-in user whose profile has not accepted the policies: ConsentGate.
async function createUnconsentedUser() {
  const id = randomUUID();
  const user = await createTestUser({
    id,
    phone: `+9955${Math.floor(Math.random() * 100_000_000)
      .toString()
      .padStart(8, "0")}`,
    displayName: "Consent Docs",
    role: "guest",
  });
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      terms_accepted_at: null,
      terms_version: null,
      privacy_accepted_at: null,
      privacy_version: null,
    })
    .eq("id", id);
  if (error) throw new Error(`unconsent failed: ${error.message}`);
  return user;
}

// A signed-in user with no profile yet: the register wizard.
async function createUserWithoutProfile(): Promise<TestUser> {
  const id = randomUUID();
  const email = `test-consent-${id.slice(0, 8)}@e2e.mybakuriani.test`;
  const password = `consent-${randomUUID()}`;
  const { error } = await supabaseAdmin.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const e2e = configureIsolatedE2E();
  const anon = createClient(e2e.supabaseUrl, e2e.anonKey, {
    auth: { persistSession: false },
  });
  const { data, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !data.session)
    throw new Error(`sign-in failed: ${signInError?.message}`);
  return {
    id,
    email,
    phone: "",
    role: "guest",
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

let gateUser: TestUser;
let wizardUser: TestUser;

test.beforeAll(async () => {
  gateUser = await createUnconsentedUser();
  wizardUser = await createUserWithoutProfile();
});

test.afterAll(async () => {
  for (const user of [gateUser, wizardUser]) {
    if (!user) continue;
    await supabaseAdmin.from("balances").delete().eq("user_id", user.id);
    await supabaseAdmin.from("profiles").delete().eq("id", user.id);
    await deleteTestUser(user.id);
  }
});

const VIEWPORTS = [
  { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  {
    name: "mobile",
    use: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    },
  },
];

for (const { name, use } of VIEWPORTS) {
  test.describe(`consent documents (${name})`, () => {
    test.use(use);

    test("gate: each policy opens in place and the back arrow returns", async ({
      page,
    }) => {
      await authenticateAsRole(gateUser, page);
      await page.goto("/");
      const gate = page.locator(GATE);
      await expect(gate).toBeVisible();
      const terms = gate.getByRole("checkbox").first();

      for (const [link, title] of DOCS) {
        const dialog = await openDoc(page, gate, link, title);
        // No new tab, and the link does not answer its own checkbox.
        expect(page.context().pages()).toHaveLength(1);
        await expect(terms).not.toBeChecked();
        if (use.viewport.width < 640) {
          expect(await dialog.boundingBox()).toEqual({
            x: 0,
            y: 0,
            width: use.viewport.width,
            height: use.viewport.height,
          });
        }
        await dialog.getByRole("button", { name: BACK }).click();
        await expect(dialog).toBeHidden();
        await expect(gate).toBeVisible();
      }
      expect(new URL(page.url()).pathname).toBe("/");
    });

    test("gate: browser back and Escape close the document, not the page", async ({
      page,
    }) => {
      await authenticateAsRole(gateUser, page);
      await page.goto("/faq");
      await page.goto("/");
      const gate = page.locator(GATE);
      await expect(gate).toBeVisible();
      await page.evaluate(() => {
        (window as unknown as { stay: number }).stay = 1;
      });
      await gate.getByRole("checkbox").first().check();

      const privacy = await openDoc(page, gate, PRIVACY_LINK, DOCS[1][1]);
      await page.goBack();
      await expect(privacy).toBeHidden();
      expect(new URL(page.url()).pathname).toBe("/");
      await expect(gate.getByRole("checkbox").first()).toBeChecked();

      const terms = await openDoc(page, gate, TERMS_LINK, DOCS[0][1]);
      await page.keyboard.press("Escape");
      await expect(terms).toBeHidden();
      // Same document (no reload), and nothing left behind in history.
      expect(
        await page.evaluate(
          () => (window as unknown as { stay?: number }).stay,
        ),
      ).toBe(1);
      await page.goBack();
      await expect(page).toHaveURL(/\/faq$/);
    });

    test("policy pages stay readable while consent is pending", async ({
      page,
    }) => {
      await authenticateAsRole(gateUser, page);
      await page.goto("/");
      await expect(page.locator(GATE)).toBeVisible();
      // The gate still checks consent here; it just must not cover the page.
      const consentCheck = page.waitForResponse(
        (res) =>
          res.url().includes("/rest/v1/profiles") &&
          res.url().includes("terms_accepted_at"),
      );
      await page.goto("/privacy");
      await expect(
        page.getByRole("heading", { level: 1, name: DOCS[1][1] }),
      ).toBeVisible();
      await consentCheck;
      await expect(page.locator(GATE)).toHaveCount(0);
    });

    test("register wizard: documents open in place and the form survives", async ({
      page,
    }) => {
      await authenticateAsRole(wizardUser, page);
      await page.goto("/auth/register");
      const nameInput = page.locator("form input[type='text']").first();
      await nameInput.fill("Consent Docs Wizard");
      const termsBox = page.locator("form input[type='checkbox']").nth(0);
      const privacyBox = page.locator("form input[type='checkbox']").nth(1);
      await termsBox.check();

      const privacy = await openDoc(page, page, PRIVACY_LINK, DOCS[1][1]);
      expect(page.context().pages()).toHaveLength(1);
      await page.goBack();
      await expect(privacy).toBeHidden();
      await expect(page).toHaveURL(/\/auth\/register$/);
      await expect(nameInput).toHaveValue("Consent Docs Wizard");
      await expect(termsBox).toBeChecked();
      await expect(privacyBox).not.toBeChecked();

      const terms = await openDoc(page, page, TERMS_LINK, DOCS[0][1]);
      await terms.getByRole("button", { name: BACK }).click();
      await expect(terms).toBeHidden();
      await expect(nameInput).toHaveValue("Consent Docs Wizard");
    });
  });
}
