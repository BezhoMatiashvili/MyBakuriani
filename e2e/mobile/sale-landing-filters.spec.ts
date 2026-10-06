import { test, expect, type Locator, type Page } from "@playwright/test";
import { SALE_ZONE_PRICES_HIDDEN } from "../../src/lib/features";

// Home page, sale mode (2026-09-27): the min/max boxes under the area and
// price sliders are typeable, and on phones the zone price cards hang below
// the green hero like the rent status cards, for any number of zones.

const BUY = "ყიდვა"; // RentBuyToggle.buy
const DETAILED = "დეტალურად"; // SaleSearchBox.detailed
const DESKTOP_SEARCH = "ძიება"; // SaleSearchBox.search
const MOBILE_SEARCH = "ძებნა"; // SaleSearchBox.searchMobile
const APPLY = "ფილტრის გამოყენება"; // SaleSearchBox.applyFilter
const SALE_TAB = "ყიდვა / ძიება"; // SaleSearchBox.tabBuySearch
const PILL_MIN = "მინ"; // SaleSearchBox.minPlaceholder
const PILL_MAX = "მაქს"; // SaleSearchBox.maxPlaceholder

test.beforeEach(async ({ page, baseURL }) => {
  // The cookie banner otherwise covers the bottom of the phone viewport.
  await page.context().addCookies([
    // v2: a v1 value never answers the location question, so the banner stays.
    {
      name: "mb_cookie_consent",
      value: "v2|analytics=0|location=0",
      url: baseURL!,
    },
  ]);
});

async function switchToSale(page: Page) {
  await page.goto("/");
  // A click that lands before hydration is lost; retry until sale renders.
  await expect(async () => {
    await page.getByRole("button", { name: BUY, exact: true }).first().click();
    await expect(
      page.getByRole("button", { name: SALE_TAB, exact: true }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass();
}

/** Values of the two range thumbs that sit above a min/max box. */
function sliderValues(box: Locator) {
  return box.evaluate((input) =>
    Array.from(
      input
        .closest("label")!
        .parentElement!.previousElementSibling!.querySelectorAll<HTMLInputElement>(
          'input[type="range"]',
        ),
    ).map((range) => Number(range.value)),
  );
}

for (const width of [320, 375, 428]) {
  test(`sale zone cards hang below the hero like the rent cards at ${width}px`, async ({
    page,
  }) => {
    test.skip(
      SALE_ZONE_PRICES_HIDDEN,
      "zone price cards are hidden for now (src/lib/features.ts)",
    );
    await page.setViewportSize({ width, height: 844 });
    await switchToSale(page);

    const hero = page.getByTestId("homepage-hero");
    const cards = hero.locator("[data-zone-card]:visible");
    await expect(cards.first()).toBeVisible();
    // Every zone is in the one phone row; the sm+ extras row stays hidden.
    await expect(
      page.getByTestId("homepage-sale-extra-zone-cards"),
    ).toBeHidden();

    const geometry = await hero.evaluate((heroEl) => {
      const form = heroEl.querySelector("form")!.getBoundingClientRect();
      const heroBox = heroEl.getBoundingClientRect();
      const boxes = Array.from(
        heroEl.querySelectorAll<HTMLElement>("[data-zone-card]"),
      )
        .map((card) => card.getBoundingClientRect())
        .filter((box) => box.width > 0);
      // First real content below the hero and its aria-hidden spacers.
      let next = heroEl.nextElementSibling;
      while (
        next &&
        (next.getAttribute("aria-hidden") === "true" ||
          next.getBoundingClientRect().height === 0)
      ) {
        next = next.nextElementSibling;
      }
      return {
        formBottom: form.bottom,
        heroBottom: heroBox.bottom,
        cards: boxes.map((box) => ({
          x: box.x,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
        })),
        nextTop: next?.getBoundingClientRect().top ?? null,
      };
    });

    const [first, second] = geometry.cards;
    expect(first.top - geometry.formBottom).toBeCloseTo(20, 0);
    expect(first.bottom - geometry.heroBottom).toBeCloseTo(72, 0);
    expect(first.x).toBeCloseTo(16, 0);
    expect(first.width).toBeGreaterThanOrEqual(140);
    expect(first.width).toBeLessThanOrEqual(260);
    for (const card of geometry.cards) {
      expect(card.top).toBeCloseTo(first.top, 0);
      expect(card.bottom).toBeCloseTo(first.bottom, 0);
    }
    if (second) {
      expect(second.x - (first.x + first.width)).toBeCloseTo(12, 0);
    }
    if (geometry.nextTop !== null) {
      expect(geometry.nextTop).toBeGreaterThanOrEqual(first.bottom + 23);
    }

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
}

test.describe("desktop sale filters panel", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false });

  test("min/max boxes are typeable and drive the sliders and the search", async ({
    page,
  }) => {
    await switchToSale(page);
    await page
      .getByRole("button", { name: DETAILED })
      .filter({ visible: true })
      .first()
      .click();

    const priceMin = page.getByTestId("sale-filter-price-min");
    const priceMax = page.getByTestId("sale-filter-price-max");
    const areaMin = page.getByTestId("sale-filter-area-min");
    const areaMax = page.getByTestId("sale-filter-area-max");
    const pillMin = page.locator(`input[placeholder="${PILL_MIN}"]:visible`);
    const pillMax = page.locator(`input[placeholder="${PILL_MAX}"]:visible`);

    // Tabbing through untouched boxes must not set a price filter.
    await priceMin.focus();
    await priceMin.press("Tab");
    await priceMax.press("Tab");
    await expect(pillMin).toHaveValue("");
    await expect(pillMax).toHaveValue("");

    // 0 is a real minimum, not a reset to $30k; Enter applies, never submits.
    await priceMin.fill("0");
    await priceMin.press("Enter");
    await expect(priceMin).toHaveValue("$0");
    expect(new URL(page.url()).pathname).not.toContain("/sales/all");

    await priceMin.fill("150000");
    await priceMin.press("Tab");
    await priceMax.fill("400000");
    await priceMax.press("Tab");
    await expect(priceMin).toHaveValue("$150k");
    await expect(priceMax).toHaveValue("$400k");
    expect(await sliderValues(priceMin)).toEqual([150000, 400000]);

    // Out of range is clamped on blur: max stays just above min.
    await priceMax.fill("5");
    await priceMax.press("Tab");
    await expect(priceMax).toHaveValue("$150.0k");
    await priceMax.fill("400000");
    await priceMax.press("Tab");

    await areaMin.fill("35");
    await areaMin.press("Tab");
    await areaMax.fill("999");
    await areaMax.press("Tab");
    await expect(areaMin).toHaveValue("35 მ²");
    await expect(areaMax).toHaveValue("500+ მ²");
    expect(await sliderValues(areaMin)).toEqual([35, 500]);

    // Focus shows the raw number for editing.
    await areaMin.focus();
    await expect(areaMin).toHaveValue("35");
    await areaMin.press("Tab");

    await page
      .getByRole("button", { name: DESKTOP_SEARCH, exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/sales\/all\?/);
    const params = new URL(page.url()).searchParams;
    expect(params.get("price_min")).toBe("150000");
    expect(params.get("price_max")).toBe("400000");
    expect(params.get("area_min")).toBe("35");
    expect(params.get("area_max")).toBeNull(); // 500 = "500+", no upper bound
  });
});

test("phone filters sheet boxes are typeable and reach the search", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await switchToSale(page);
  await page.getByTestId("sale-mobile-filters").click();

  const areaMin = page.getByTestId("sale-filter-area-min");
  const areaMax = page.getByTestId("sale-filter-area-max");
  await areaMin.fill("40");
  await areaMin.press("Enter");
  await areaMax.fill("120");
  await areaMax.press("Enter");
  await expect(areaMax).toHaveValue("120 მ²");
  expect(await sliderValues(areaMax)).toEqual([40, 120]);

  await page.getByRole("button", { name: APPLY }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page
    .getByRole("button", { name: MOBILE_SEARCH, exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/sales\/all\?/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("area_min")).toBe("40");
  expect(params.get("area_max")).toBe("120");
});
