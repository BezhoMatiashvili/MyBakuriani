import { test, expect, type Page } from "@playwright/test";

// The cookie banner itself, so unlike the other specs nothing presets
// mb_cookie_consent. Strings are CookieConsent.* in messages/ka.json.
const COOKIES_REGION = "ქუქი-ფაილები"; // title
const LOCATION_REGION = "მდებარეობის გაზიარება"; // locationTitle
const ESSENTIAL_ONLY = "მხოლოდ აუცილებელი"; // essentialOnly
const ACCEPT_ALL = "ვეთანხმები ყველას"; // acceptAll
const LOCATION_NOT_NOW = "არა, გმადლობთ"; // locationNotNow
const ENABLE_LOCATION = "ჩართვა"; // enableLocation

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

async function openAndAccept(page: Page) {
  await page.goto("/");
  await expect(cookiesCard(page)).toBeVisible();
  await page.getByRole("button", { name: ACCEPT_ALL, exact: true }).tap();
  await expect(locationCard(page)).toBeVisible();
}

test("answering the cookie question swaps the card for the location question", async ({
  page,
}) => {
  await openAndAccept(page);
  // The answered question is gone, not left on screen looking untouched.
  await expect(cookiesCard(page)).toHaveCount(0);
  expect(await storedConsent(page)).toBe("v2|analytics=1");

  await page.getByRole("button", { name: LOCATION_NOT_NOW, exact: true }).tap();
  await expect(locationCard(page)).toHaveCount(0);
  expect(await storedConsent(page)).toBe("v2|analytics=1|location=0");

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(cookiesCard(page)).toHaveCount(0);
  await expect(locationCard(page)).toHaveCount(0);
});

test("an unanswered location question does not bring the banner back", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: ESSENTIAL_ONLY, exact: true }).tap();
  await expect(locationCard(page)).toBeVisible();

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(cookiesCard(page)).toHaveCount(0);
  await expect(locationCard(page)).toHaveCount(0);
});

test("the card stays on screen and scrolls when the viewport is shorter than it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 260 });
  await page.goto("/");
  const card = cookiesCard(page);
  await expect(card).toBeVisible();

  const box = (await card.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(260);

  // Scrolled to the end, the last button is reachable.
  const inner = card.locator("> div");
  await inner.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(
    page.getByRole("button", { name: ACCEPT_ALL, exact: true }),
  ).toBeInViewport();
});

test("a denied location is recorded and closes the card", async ({ page }) => {
  // A plain object with code 1, as a WebView without the
  // GeolocationPositionError global would deliver it.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) =>
      err?.({ code: 1 } as GeolocationPositionError);
  });
  await openAndAccept(page);
  await page.getByRole("button", { name: ENABLE_LOCATION, exact: true }).tap();

  await expect(locationCard(page)).toHaveCount(0);
  expect(await storedConsent(page)).toBe("v2|analytics=1|location=0");
});

test("a position that cannot be found closes the card without recording a decline", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) =>
      err?.({ code: 2 } as GeolocationPositionError);
  });
  await openAndAccept(page);
  await page.getByRole("button", { name: ENABLE_LOCATION, exact: true }).tap();

  await expect(locationCard(page)).toHaveCount(0);
  expect(await storedConsent(page)).toBe("v2|analytics=1");
});

test("a location request nobody answers never traps the visitor", async ({
  page,
}) => {
  // The permission prompt ignored, or a WebView with no geolocation handler:
  // the browser never calls back.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = () => {};
  });
  await openAndAccept(page);
  await page.getByRole("button", { name: ENABLE_LOCATION, exact: true }).tap();

  const notNow = page.getByRole("button", {
    name: LOCATION_NOT_NOW,
    exact: true,
  });
  await expect(notNow).toBeEnabled();
  await notNow.tap();
  await expect(locationCard(page)).toHaveCount(0);
});

test("a browser that drops the cookie write still closes the card", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: () => {},
    });
  });
  await openAndAccept(page);
  await page.getByRole("button", { name: LOCATION_NOT_NOW, exact: true }).tap();
  await expect(locationCard(page)).toHaveCount(0);
});
