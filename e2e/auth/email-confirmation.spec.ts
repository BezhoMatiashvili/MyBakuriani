import { test, expect, type Page } from "@playwright/test";

// With phone sign-in on (C48) /auth/login opens on the phone tab; these tests
// exercise the e-mail form. Retried so a click before hydration is not lost.
async function openEmailTab(page: Page) {
  // The page streams behind loading.tsx: when goto() resolves it can still sit
  // in a hidden boundary, where a role query finds no tab.
  await expect(page.locator("#auth-phone, #auth-email").first()).toBeVisible();
  // Already open (no phone tab, or ?error=invalid_link): a click would clear
  // the page's error notice.
  if (await page.locator("#auth-email").isVisible()) return;
  const tab = page.getByRole("button", { name: "ელ. ფოსტა", exact: true });
  await expect(async () => {
    await tab.click();
    await expect(page.locator("#auth-email")).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

// Sign-up with "Confirm email" ON: no session until the emailed link is opened
// on /auth/confirm and its button is clicked. GoTrue and PostgREST are mocked
// at the browser boundary, the pages a confirmed user is sent to are stubbed
// (they need a real session), and the route checks read the redirect without
// following it, so nothing here sends mail or creates an account.

const CHECK_EMAIL = "დადასტურების ბმული გამოგზავნილია თქვენს ელ. ფოსტაზე.";
const NOT_CONFIRMED = "ელ. ფოსტა ჯერ არ არის დადასტურებული.";
const LINK_EXPIRED = "ბმულს ვადა გაუვიდა ან უკვე გამოყენებულია.";
const RESEND = "ბმულის ხელახლა გაგზავნა";
const RESENT = "ახალი ბმული გამოგზავნილია თქვენს ელ. ფოსტაზე.";
const TOO_MANY = "მოთხოვნები ძალიან ხშირია. სცადეთ მოგვიანებით.";
const COOLDOWN = /ხელახლა გაგზავნა \d+ წამში/;
const CONFIRM = "ელ. ფოსტის დადასტურება";

const TOKEN_HASH = "4f1c0de5-hash-from-the-email";
const CONFIRM_LINK = `/auth/confirm?token_hash=${TOKEN_HASH}&type=email`;
const INVALID_LINK = /\/auth\/login\?error=invalid_link$/;
const USER_ID = "00000000-0000-4000-8000-0000000000c1";

async function redirectTarget(page: Page, path: string) {
  const res = await page.request.get(path, { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  const location = new URL(res.headers()["location"]);
  return location.pathname + location.search;
}

function signupUser(identities: unknown[]) {
  const id = USER_ID;
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "new-person@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: identities.map(() => ({
      id,
      identity_id: "00000000-0000-4000-8000-0000000000c2",
      user_id: id,
      provider: "email",
      identity_data: { email: "new-person@example.com", sub: id },
    })),
    created_at: new Date().toISOString(),
  };
}

async function submitRegister(page: Page) {
  await page.goto("/auth/login");
  await openEmailTab(page);
  await page.getByRole("button", { name: "რეგისტრაცია" }).first().click();
  await page.locator("#auth-email").fill("new-person@example.com");
  await page.locator("#auth-password").fill("a-long-enough-password");
  await page.locator("#auth-confirm-password").fill("a-long-enough-password");
  await page.locator("form button[type='submit']").click();
}

// GoTrue /verify, /user and the profiles read behind postAuthRedirectPath.
// Returns the bodies POSTed to /verify, so tests can count them.
async function mockConfirmation(
  page: Page,
  { verifyStatus = 200, role = null as string | null } = {},
) {
  const verifyBodies: Record<string, unknown>[] = [];
  const user = {
    ...signupUser([{}]),
    email_confirmed_at: "2026-09-27T00:00:00Z",
  };
  await page.route(/\/auth\/v1\/verify(\?|$)/, async (route) => {
    verifyBodies.push(route.request().postDataJSON());
    await route.fulfill(
      verifyStatus === 200
        ? {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              access_token: "fake-access-token",
              token_type: "bearer",
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              refresh_token: "fake-refresh-token",
              user,
            }),
          }
        : {
            status: verifyStatus,
            contentType: "application/json",
            body: JSON.stringify({
              code: verifyStatus,
              error_code: "otp_expired",
              msg: "Email link is invalid or has expired",
            }),
          },
    );
  });
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    }),
  );
  await page.route(/\/rest\/v1\/profiles\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(role ? [{ role }] : []),
    }),
  );
  return verifyBodies;
}

// Where a confirmed user is sent is asserted on the request the confirm page
// makes for it; the page itself is stubbed.
async function clickConfirmAndLand(page: Page, pathname: string) {
  await page.route(
    (url) => url.pathname === pathname,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>landed</title>",
      }),
  );
  const landing = page.waitForRequest(
    (request) => new URL(request.url()).pathname === pathname,
  );
  await page.getByRole("button", { name: CONFIRM }).click();
  await landing;
  // The stub is not an RSC payload, so Next finishes with a full navigation to
  // it; wait for that so the next goto cannot collide with it.
  await page.waitForURL((url) => url.pathname === pathname);
}

test.describe("Email link routes", () => {
  test("callback keeps a cancelled Google consent on the plain login page", async ({
    page,
  }) => {
    expect(
      await redirectTarget(
        page,
        "/auth/callback?error=access_denied&error_description=cancelled",
      ),
    ).toBe("/auth/login");
  });

  test("callback sends an expired email link to the link-expired notice", async ({
    page,
  }) => {
    expect(
      await redirectTarget(
        page,
        "/auth/callback?error=access_denied&error_code=otp_expired",
      ),
    ).toBe("/auth/login?error=invalid_link");
  });

  test("an expired reset link keeps its own page", async ({ page }) => {
    expect(
      await redirectTarget(
        page,
        "/auth/callback?next=/auth/reset-password&error=access_denied&error_code=otp_expired",
      ),
    ).toBe("/auth/forgot-password?error=invalid_link");
  });

  test("login explains an expired link", async ({ page }) => {
    await page.goto("/auth/login?error=invalid_link");
    await openEmailTab(page);
    await expect(page.getByText(LINK_EXPIRED)).toBeVisible();
  });
});

test.describe("Confirmation link page", () => {
  test("a plain GET, like a mail scanner's prefetch, gets the page and no redirect", async ({
    page,
  }) => {
    const res = await page.request.get(CONFIRM_LINK, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["location"]).toBeUndefined();
  });

  test("opening the link verifies nothing until the button is clicked", async ({
    page,
  }) => {
    const verifyBodies = await mockConfirmation(page);

    await page.goto(CONFIRM_LINK);
    await expect(page.getByRole("button", { name: CONFIRM })).toBeEnabled();
    await page.waitForLoadState("networkidle");
    expect(verifyBodies).toHaveLength(0);

    // No profiles row yet: the registration wizard creates it.
    await clickConfirmAndLand(page, "/auth/register");
    expect(verifyBodies).toEqual([
      expect.objectContaining({ token_hash: TOKEN_HASH, type: "email" }),
    ]);
  });

  test("a user with a profile lands on the role dashboard", async ({
    page,
  }) => {
    await mockConfirmation(page, { role: "renter" });
    await page.goto(CONFIRM_LINK);
    await clickConfirmAndLand(page, "/dashboard/renter");
  });

  test("an internal next= is kept", async ({ page }) => {
    await mockConfirmation(page, { role: "renter" });
    await page.goto(`${CONFIRM_LINK}&next=%2Fdashboard%2Faccount`);
    await clickConfirmAndLand(page, "/dashboard/account");
  });

  test("next= cannot send a confirmed user off-site", async ({ page }) => {
    await mockConfirmation(page, { role: "renter" });
    const offSite: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname.endsWith("evil.example")) {
        offSite.push(request.url());
      }
    });

    for (const next of [
      "//evil.example/steal",
      "https://evil.example/steal",
      "/%2F%2Fevil.example/steal",
    ]) {
      await page.context().clearCookies();
      await page.goto(`${CONFIRM_LINK}&next=${encodeURIComponent(next)}`);
      await clickConfirmAndLand(page, "/dashboard/renter");
    }
    expect(offSite).toEqual([]);
  });

  test("an expired or used link ends on the link-expired notice", async ({
    page,
  }) => {
    const verifyBodies = await mockConfirmation(page, { verifyStatus: 403 });

    await page.goto(CONFIRM_LINK);
    await page.getByRole("button", { name: CONFIRM }).click();

    await expect(page).toHaveURL(INVALID_LINK);
    await expect(page.getByText(LINK_EXPIRED)).toBeVisible();
    expect(verifyBodies).toHaveLength(1);
  });

  for (const [name, path] of [
    ["a link without a token", "/auth/confirm"],
    ["a recovery link", `/auth/confirm?token_hash=${TOKEN_HASH}&type=recovery`],
    [
      "GoTrue's error redirect",
      "/auth/confirm?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    ],
  ]) {
    test(`${name} goes to the link-expired notice without verifying`, async ({
      page,
    }) => {
      const verifyBodies = await mockConfirmation(page);

      await page.goto(path);

      await expect(page).toHaveURL(INVALID_LINK);
      await expect(page.getByText(LINK_EXPIRED)).toBeVisible();
      expect(verifyBodies).toHaveLength(0);
    });
  }

  test("a ?code= link from a browser without its code verifier ends on the link-expired notice", async ({
    page,
  }) => {
    const tokenRequests: string[] = [];
    await page.route(/\/auth\/v1\/token\?grant_type=pkce$/, async (route) => {
      tokenRequests.push(route.request().url());
      await route.abort();
    });

    await page.goto("/auth/confirm?code=an-auth-code");
    await page.getByRole("button", { name: CONFIRM }).click();

    await expect(page).toHaveURL(INVALID_LINK);
    expect(tokenRequests).toHaveLength(0);
  });

  test("fits a 375px screen with a 44px button", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(CONFIRM_LINK);
    const button = page.getByRole("button", { name: CONFIRM });
    await expect(button).toBeEnabled();

    // min-h-11 is 44px; the box can come back a sub-pixel short.
    const box = await button.boundingBox();
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe("Sign-up awaiting confirmation", () => {
  test("a new address gets check-your-email with a resend cooldown", async ({
    page,
  }) => {
    let redirectTo: string | null = null;
    await page.route(/\/auth\/v1\/signup(\?|$)/, async (route) => {
      redirectTo = new URL(route.request().url()).searchParams.get(
        "redirect_to",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(signupUser([{}])),
      });
    });

    await submitRegister(page);

    await expect(page.getByText(CHECK_EMAIL)).toBeVisible();
    await expect(page.getByRole("button", { name: COOLDOWN })).toBeDisabled();
    expect(redirectTo).toMatch(/\/auth\/confirm$/);
  });

  test("an existing address gets the same state", async ({ page }) => {
    // GoTrue's obfuscated user for an existing address: no identities.
    await page.route(/\/auth\/v1\/signup(\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(signupUser([])),
      }),
    );

    await submitRegister(page);

    await expect(page.getByText(CHECK_EMAIL)).toBeVisible();
    await expect(page.getByRole("button", { name: COOLDOWN })).toBeDisabled();
  });
});

test.describe("Sign-in before confirming", () => {
  async function signInUnconfirmed(page: Page) {
    await page.route(/\/auth\/v1\/token\?grant_type=password$/, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "email_not_confirmed",
          error_code: "email_not_confirmed",
          msg: "Email not confirmed",
        }),
      }),
    );
    await page.goto("/auth/login");
    await openEmailTab(page);
    await page.locator("#auth-email").fill("pending@example.com");
    await page.locator("#auth-password").fill("the-right-password");
    await page.locator("form button[type='submit']").click();
    await expect(page.getByText(NOT_CONFIRMED)).toBeVisible();
  }

  test("offers to resend the link, then cools down", async ({ page }) => {
    let resendBody: Record<string, unknown> | null = null;
    await page.route(/\/auth\/v1\/resend(\?|$)/, async (route) => {
      resendBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });

    await signInUnconfirmed(page);
    await page.getByRole("button", { name: RESEND }).click();

    await expect(page.getByText(RESENT)).toBeVisible();
    await expect(page.getByRole("button", { name: COOLDOWN })).toBeDisabled();
    expect(resendBody).toMatchObject({
      type: "signup",
      email: "pending@example.com",
    });
  });

  test("a rate-limited resend says so", async ({ page }) => {
    await page.route(/\/auth\/v1\/resend(\?|$)/, (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error_code: "over_email_send_rate_limit",
          msg: "For security purposes, you can only request this after 42 seconds.",
        }),
      }),
    );

    await signInUnconfirmed(page);
    await page.getByRole("button", { name: RESEND }).click();

    await expect(page.getByText(TOO_MANY)).toBeVisible();
  });
});
