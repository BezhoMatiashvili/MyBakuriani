import { test, expect, type Page } from "@playwright/test";

// The cookie banner on a build with NEXT_PUBLIC_META_PIXEL_ID (C59): one
// combined answer for Analytics + Meta, and a single re-ask for a stored
// Analytics "yes" from before Meta. Runs only against such a build
// (E2E_META_PIXEL=1); cookie-banner.spec.ts keeps covering builds without it.
// fbevents.js is answered locally, so no request reaches Meta.
test.skip(
  !process.env.E2E_META_PIXEL,
  "needs a build with NEXT_PUBLIC_META_PIXEL_ID",
);

const COOKIES_REGION = "ქუქი-ფაილები";
const LOCATION_REGION = "მდებარეობის გაზიარება";
const ESSENTIAL_ONLY = "მხოლოდ აუცილებელი";
const ACCEPT_ALL = "ვეთანხმები ყველას";

const cookiesCard = (page: Page) =>
  page.getByRole("region", { name: COOKIES_REGION });
const locationCard = (page: Page) =>
  page.getByRole("region", { name: LOCATION_REGION });

async function storedConsent(page: Page) {
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "mb_cookie_consent",
  );
  return cookie ? decodeURIComponent(cookie.value) : null;
}

async function seedConsent(page: Page, value: string) {
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent(value),
      url: test.info().project.use.baseURL ?? "http://localhost:3000",
    },
  ]);
}

test.beforeEach(async ({ page }) => {
  await page.route(/facebook\.(com|net)/, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "" }),
  );
});

test("accept all answers Analytics and Meta together", async ({ page }) => {
  await page.goto("/");
  await expect(cookiesCard(page)).toContainText("Meta");
  await page.getByRole("button", { name: ACCEPT_ALL, exact: true }).tap();
  expect(await storedConsent(page)).toBe("v2|analytics=1|marketing=1");
});

test("essential only declines both", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: ESSENTIAL_ONLY, exact: true }).tap();
  expect(await storedConsent(page)).toBe("v2|analytics=0|marketing=0");
});

test("a stored Analytics yes is asked once more, keeping its location answer", async ({
  page,
}) => {
  await seedConsent(page, "v2|analytics=1|location=0");
  await page.goto("/");
  await expect(cookiesCard(page)).toBeVisible();
  await page.getByRole("button", { name: ACCEPT_ALL, exact: true }).tap();
  await expect(cookiesCard(page)).toHaveCount(0);
  await expect(locationCard(page)).toHaveCount(0);
  expect(await storedConsent(page)).toBe(
    "v2|analytics=1|marketing=1|location=0",
  );

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(cookiesCard(page)).toHaveCount(0);
});

test("a stored decline is never asked again", async ({ page }) => {
  await seedConsent(page, "v2|analytics=0");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(cookiesCard(page)).toHaveCount(0);
});
