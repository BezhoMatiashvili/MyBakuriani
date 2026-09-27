import { test, expect, type Page } from "@playwright/test";

// Home page on phones (2026-09-26): the map preview is a real Mapbox static
// image instead of an empty placeholder, the rent search has a visible guest
// stepper, and the sale search has a location (zone) picker.

const BUY = "ყიდვა"; // RentBuyToggle.buy
const MAP = "რუკა"; // SaleSearchBox.map
const EXPAND_MAP = "რუკის გაშლა"; // BakurianiMap.expandMap
const ADD_GUEST = "სტუმრის დამატება"; // SearchBox.addGuest
const REMOVE_GUEST = "სტუმრის მოკლება"; // SearchBox.removeGuest
const SHOW_RESULTS = "შედეგების ჩვენება"; // SearchBox.showResults
const SALE_LOCATION = "ლოკაცია / ზონა"; // SaleSearchBox.locationZone
const SALE_SEARCH = "ძებნა"; // SaleSearchBox.searchMobile

test.beforeEach(async ({ page, baseURL }) => {
  // The cookie banner otherwise covers the bottom of the phone viewport.
  await page
    .context()
    .addCookies([
      { name: "mb_cookie_consent", value: "v1|analytics=0", url: baseURL! },
    ]);
});

async function switchToSale(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: BUY, exact: true }).first().click();
}

test("sale home map preview is a real map and opens the interactive one", async ({
  page,
}) => {
  test.skip(
    !process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
    "the build has no Mapbox token, so the placeholder is expected",
  );
  const cspErrors: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) cspErrors.push(msg.text());
  });
  await switchToSale(page);
  await page.getByRole("button", { name: MAP, exact: true }).first().click();

  const preview = page.locator('img[src^="https://api.mapbox.com/"]:visible');
  await expect(preview).toHaveCount(1);
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // The expand button sits top-right so the image's bottom-right Mapbox
  // attribution stays visible.
  const imgBox = (await preview.boundingBox())!;
  const expandBox = (await page
    .getByRole("button", { name: EXPAND_MAP })
    .filter({ visible: true })
    .first()
    .boundingBox())!;
  expect(expandBox.y - imgBox.y).toBeLessThan(20);

  await preview.click();
  await expect(page.locator(".mapboxgl-canvas").first()).toBeVisible({
    timeout: 20_000,
  });
  expect(cspErrors).toEqual([]);
});

test("rent home guest stepper feeds the filters panel and the search URL", async ({
  page,
}) => {
  await page.goto("/");
  const stepper = page.getByTestId("search-mobile-guests");
  const add = stepper.getByRole("button", { name: ADD_GUEST });
  const remove = stepper.getByRole("button", { name: REMOVE_GUEST });
  await expect(remove).toBeDisabled();
  await add.click();
  await add.click();
  await add.click();
  await remove.click();
  await expect(stepper).toContainText("2 სტუმარი");

  // Applying the filters panel must not erase the stepper's count.
  await page.getByTestId("search-mobile-filters").click();
  await expect(
    page.getByRole("button", { name: "2 სტუმარი", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: SHOW_RESULTS })
    .filter({ visible: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/search\?.*guests=2/);
});

test("sale home location picker filters /sales/all", async ({ page }) => {
  await switchToSale(page);
  await page
    .locator("div.relative", {
      has: page.locator(":scope > label", { hasText: SALE_LOCATION }),
    })
    .filter({ visible: true })
    .locator(":scope > button")
    .click();
  // First option is "any"; pick the first real zone.
  await page.locator("ul li button:visible").nth(1).click();
  await page
    .getByRole("button", { name: SALE_SEARCH, exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/sales\/all\?.*location=/);
});
