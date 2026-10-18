import { test, expect, type Page } from "@playwright/test";

// Phone sign-in (C48): number -> SMS code -> session. GoTrue and PostgREST are
// mocked at the browser boundary, so nothing here sends an SMS or creates an
// account (seed numbers are real-format Georgian mobiles). The whole file
// skips on a build without NEXT_PUBLIC_PHONE_AUTH_ENABLED=true.

const PHONE_TAB = "ტელეფონი";
const GET_CODE = "SMS კოდის მიღება";
const INVALID_PHONE = "გთხოვთ შეიყვანოთ სწორი ტელეფონის ნომერი";
const CODE_SENT = "კოდი გაიგზავნა ნომერზე +995 599 12 34 56";
const COOLDOWN = /ხელახლა გაგზავნა \d+ წამში/;
const WRONG_CODE =
  "კოდი არასწორია ან ვადა გაუვიდა. სცადეთ თავიდან ან მოითხოვეთ ახალი კოდი.";
const NUMBER_LIMIT =
  "ამ ნომერზე ძალიან ბევრი კოდი გაიგზავნა. სცადეთ მოგვიანებით.";
const NOT_SUPPORTED =
  "SMS-ით შესვლა მხოლოდ საქართველოს მობილურ ნომრებზე მუშაობს.";
const USER_ID = "00000000-0000-4000-8000-0000000000d1";

const phoneUser = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "",
  phone: "995599123456",
  phone_confirmed_at: "2026-10-06T00:00:00Z",
  app_metadata: { provider: "phone", providers: ["phone"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-10-06T00:00:00Z",
};

async function openLogin(page: Page) {
  await page.goto("/auth/login");
  // The page streams behind loading.tsx: when goto() resolves it can still sit
  // in a hidden boundary, where a role query finds no tab.
  await expect(page.locator("#auth-phone, #auth-email").first()).toBeVisible();
  const tab = page.getByRole("button", { name: PHONE_TAB, exact: true });
  test.skip((await tab.count()) === 0, "phone sign-in is off in this build");
  await expect(page.locator("#auth-phone")).toBeVisible();
}

// /auth/v1/otp: answers with `refusal` when given, else accepts. Returns the
// request bodies.
async function mockOtp(page: Page, refusal?: { status: number; msg: string }) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(/\/auth\/v1\/otp(\?|$)/, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill(
      refusal
        ? {
            status: refusal.status,
            contentType: "application/json",
            body: JSON.stringify({ code: refusal.status, msg: refusal.msg }),
          }
        : { status: 200, contentType: "application/json", body: "{}" },
    );
  });
  return bodies;
}

// Retried so a click before hydration is not lost.
async function submitNumber(page: Page, expected: string) {
  await expect(async () => {
    await page.locator("#auth-phone").fill("599 12 34 56");
    await page.getByRole("button", { name: GET_CODE }).click();
    await expect(page.getByText(expected)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test.describe("Phone sign-in", () => {
  test("opens on the phone tab with the +995 prefix and no e-mail form", async ({
    page,
  }) => {
    await openLogin(page);
    await expect(page.getByText("+995", { exact: true })).toBeVisible();
    await expect(page.locator("#auth-email")).toHaveCount(0);
    await expect(page.locator("#auth-phone")).toHaveAttribute(
      "autocomplete",
      "tel-national",
    );
  });

  test("an incomplete number is refused before any request", async ({
    page,
  }) => {
    const bodies = await mockOtp(page);
    await openLogin(page);
    await expect(async () => {
      await page.locator("#auth-phone").fill("5991");
      await page.getByRole("button", { name: GET_CODE }).click();
      await expect(page.getByText(INVALID_PHONE)).toBeVisible({
        timeout: 1_000,
      });
    }).toPass();
    expect(bodies).toHaveLength(0);
  });

  test("a pasted +995 number keeps the local digits", async ({ page }) => {
    await openLogin(page);
    await page.locator("#auth-phone").fill("+995 599 12 34 56");
    await expect(page.locator("#auth-phone")).toHaveValue("599 12 34 56");
  });

  test("sends the code to +995… with the sign-up link and starts the resend cooldown", async ({
    page,
    context,
  }) => {
    const bodies = await mockOtp(page);
    await openLogin(page);
    await context.addCookies([
      {
        name: "mb_signup_link",
        value: "ski-week",
        url: new URL(page.url()).origin,
      },
    ]);
    await submitNumber(page, CODE_SENT);
    expect(bodies.at(-1)).toMatchObject({
      phone: "+995599123456",
      data: { signup_link: "ski-week" },
    });
    await expect(page.locator("#auth-code")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
    const resend = page.getByRole("button", { name: COOLDOWN });
    await expect(resend).toBeVisible();
    await expect(resend).toBeDisabled();
  });

  test("a refused number shows the hook's reason", async ({ page }) => {
    await mockOtp(page, { status: 400, msg: "phone_not_supported" });
    await openLogin(page);
    await submitNumber(page, NOT_SUPPORTED);
  });

  test("the per-number cap is explained", async ({ page }) => {
    await mockOtp(page, { status: 429, msg: "sms_limit_number" });
    await openLogin(page);
    await submitNumber(page, NUMBER_LIMIT);
  });

  test("a wrong code is reported and can be retyped", async ({ page }) => {
    await mockOtp(page);
    await page.route(/\/auth\/v1\/verify(\?|$)/, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: 403,
          error_code: "otp_expired",
          msg: "Token has expired or is invalid",
        }),
      }),
    );
    await openLogin(page);
    await submitNumber(page, CODE_SENT);
    await page.locator("#auth-code").fill("000000");
    await expect(page.getByText(WRONG_CODE)).toBeVisible();
    await expect(page.locator("#auth-code")).toBeEditable();
  });

  test("the right code signs a new number in and continues to registration", async ({
    page,
  }) => {
    await mockOtp(page);
    const verifyBodies: Record<string, unknown>[] = [];
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
          user: phoneUser,
        }),
      });
    });
    await page.route(/\/auth\/v1\/user(\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(phoneUser),
      }),
    );
    await page.route(/\/rest\/v1\/profiles\?/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );
    // The wizard needs a real session; where the user is sent is enough.
    await page.route(
      (url) => url.pathname === "/auth/register",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><title>register</title>",
        }),
    );

    await openLogin(page);
    await submitNumber(page, CODE_SENT);
    const landing = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/auth/register",
    );
    await page.locator("#auth-code").fill("123456");
    await landing;
    expect(verifyBodies).toHaveLength(1);
    expect(verifyBodies[0]).toMatchObject({
      phone: "+995599123456",
      token: "123456",
      type: "sms",
    });
  });

  test("change number goes back to the number step", async ({ page }) => {
    await mockOtp(page);
    await openLogin(page);
    await submitNumber(page, CODE_SENT);
    await page.getByRole("button", { name: "ნომრის შეცვლა" }).click();
    await expect(page.locator("#auth-phone")).toBeVisible();
  });
});
