import { test, expect, type Page } from "@playwright/test";

// Password reset (C51). GoTrue and PostgREST are mocked at the browser
// boundary, so nothing here sends mail or changes a password.

const LINK_SENT =
  "თუ ეს ელ. ფოსტა დარეგისტრირებულია, პაროლის აღდგენის ბმული უკვე გამოგზავნილია.";
const COOLDOWN = /ხელახლა გაგზავნა \d+ წამში/;
const RESEND = "ბმულის ხელახლა გაგზავნა";
const OLD_DEAD_END = "მოთხოვნები ძალიან ხშირია. სცადეთ მოგვიანებით.";
const MAIL_UNAVAILABLE = "ელ. ფოსტის გაგზავნა ახლა ვერ ხერხდება.";
const IP_LIMITED = "ამ ქსელიდან ძალიან ბევრი მოთხოვნა მოვიდა.";
const LINK_INVALID = "ბმული არასწორია ან ვადაგასულია.";
const SAVE = "პაროლის შენახვა";

const TOKEN_HASH = "pkce_5e7a-hash-from-the-email";
const RESET_LINK = `/auth/reset-password?token_hash=${TOKEN_HASH}&type=recovery`;
const USER_ID = "00000000-0000-4000-8000-0000000000e1";
const NEW_PASSWORD = "a-new-password-for-e2e";

const emailUser = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "reset-person@example.com",
  email_confirmed_at: "2026-10-07T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-10-07T00:00:00Z",
};

// POST /auth/v1/recover: answers with `refusal` when given, else accepts.
// Returns how many requests arrived.
async function mockRecover(
  page: Page,
  refusal?: { status: number; error_code: string; msg: string },
) {
  const calls = { count: 0 };
  await page.route(/\/auth\/v1\/recover(\?|$)/, async (route) => {
    calls.count += 1;
    await route.fulfill(
      refusal
        ? {
            status: refusal.status,
            contentType: "application/json",
            body: JSON.stringify({ code: refusal.status, ...refusal }),
          }
        : { status: 200, contentType: "application/json", body: "{}" },
    );
  });
  return calls;
}

// Fills the form and submits until `expectAfter` holds (retried so a click
// before hydration is not lost).
async function submitEmail(page: Page, expectAfter: () => Promise<void>) {
  await page.goto("/auth/forgot-password");
  const input = page.locator("#forgot-email");
  await expect(input).toBeVisible();
  await expect(async () => {
    await input.fill("reset-person@example.com");
    await page.getByRole("button", { name: "ბმულის გაგზავნა" }).click();
    await expectAfter();
  }).toPass();
}

const sentState = (page: Page) => () =>
  expect(page.getByText(LINK_SENT)).toBeVisible({ timeout: 1_000 });

test.describe("Forgot password", () => {
  test("a sent link shows the resend countdown", async ({ page }) => {
    const calls = await mockRecover(page);
    await submitEmail(page, sentState(page));
    await expect(page.getByRole("button", { name: COOLDOWN })).toBeDisabled();
    expect(calls.count).toBe(1);
  });

  test("GoTrue's per-address window is the sent state, not an error", async ({
    page,
  }) => {
    await mockRecover(page, {
      status: 429,
      error_code: "over_email_send_rate_limit",
      msg: "For security purposes, you can only request this after 2 seconds.",
    });
    await submitEmail(page, sentState(page));
    await expect(page.getByText(OLD_DEAD_END)).toHaveCount(0);
    // The countdown runs out and the link can be asked for again.
    await expect(page.getByRole("button", { name: RESEND })).toBeEnabled({
      timeout: 5_000,
    });
  });

  test("a different email goes back to the form", async ({ page }) => {
    await mockRecover(page);
    await submitEmail(page, sentState(page));
    await page.getByRole("button", { name: "სხვა ელ. ფოსტის შეყვანა" }).click();
    await expect(page.locator("#forgot-email")).toBeVisible();
  });

  test("the project's email cap says so and gives a contact", async ({
    page,
  }) => {
    await mockRecover(page, {
      status: 429,
      error_code: "over_email_send_rate_limit",
      msg: "Email rate limit exceeded",
    });
    await submitEmail(page, () =>
      expect(page.getByText(MAIL_UNAVAILABLE)).toBeVisible({ timeout: 1_000 }),
    );
    await expect(page.getByText("+995 551 26 11 11")).toBeVisible();
  });

  test("the per-IP limit has its own message", async ({ page }) => {
    await mockRecover(page, {
      status: 429,
      error_code: "over_request_rate_limit",
      msg: "Request rate limit reached",
    });
    await submitEmail(page, () =>
      expect(page.getByText(IP_LIMITED)).toBeVisible({ timeout: 1_000 }),
    );
  });
});

test.describe("Reset link (token_hash template)", () => {
  test("a plain GET, like a mail scanner's prefetch, gets the page", async ({
    page,
  }) => {
    const res = await page.request.get(RESET_LINK, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["location"]).toBeUndefined();
  });

  test("the link is spent only on submit, then the password is saved", async ({
    page,
  }) => {
    const verifyBodies: Record<string, unknown>[] = [];
    const updateBodies: Record<string, unknown>[] = [];
    await page.route(/\/auth\/v1\/verify(\?|$)/, async (route) => {
      verifyBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "fake-access-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "fake-refresh-token",
          user: emailUser,
        }),
      });
    });
    await page.route(/\/auth\/v1\/user(\?|$)/, async (route) => {
      if (route.request().method() === "PUT") {
        updateBodies.push(route.request().postDataJSON());
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emailUser),
      });
    });
    await page.route(/\/rest\/v1\/profiles\?/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ role: "guest" }),
      }),
    );
    // The dashboard needs a real session; where the user is sent is enough.
    await page.route(
      (url) => url.pathname === "/dashboard/guest",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><title>guest</title>",
        }),
    );

    await page.goto(RESET_LINK);
    await expect(page.locator("#reset-password")).toBeVisible();
    expect(verifyBodies).toHaveLength(0);

    const landing = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/dashboard/guest",
    );
    await expect(async () => {
      await page.locator("#reset-password").fill(NEW_PASSWORD);
      await page.locator("#reset-confirm-password").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: SAVE }).click();
      expect(verifyBodies.length).toBeGreaterThan(0);
    }).toPass();
    await landing;
    expect(verifyBodies).toHaveLength(1);
    expect(verifyBodies[0]).toMatchObject({
      type: "recovery",
      token_hash: TOKEN_HASH,
    });
    expect(updateBodies).toHaveLength(1);
    expect(updateBodies[0]).toMatchObject({ password: NEW_PASSWORD });
  });

  test("a spent or expired link says so and offers a new one", async ({
    page,
  }) => {
    await page.route(/\/auth\/v1\/verify(\?|$)/, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: 403,
          error_code: "otp_expired",
          msg: "Email link is invalid or has expired",
        }),
      }),
    );
    await page.goto(RESET_LINK);
    await expect(page.locator("#reset-password")).toBeVisible();
    await expect(async () => {
      await page.locator("#reset-password").fill(NEW_PASSWORD);
      await page.locator("#reset-confirm-password").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: SAVE }).click();
      await expect(page.getByText(LINK_INVALID)).toBeVisible({
        timeout: 1_000,
      });
    }).toPass();
    await expect(
      page.getByRole("link", { name: "ახალი ბმულის მოთხოვნა" }),
    ).toBeVisible();
  });
});
