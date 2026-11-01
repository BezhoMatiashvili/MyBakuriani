import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/fixtures";
import { TEST_IDS } from "../helpers/seed";
import { properties, supabaseAdmin } from "../helpers/supabase";
import type { TablesInsert } from "../../src/lib/types/database";
import { tbilisiDay } from "../../src/lib/currency/money";

// A sale typed in lari keeps its dollars beside it (C54). It prints in its
// seller's currency on the server and at hydration; the header pick shows the
// OTHER STORED number, with no rate; only a legacy dollar-only row converts
// live (C55). Each test makes its own active sale listing(s) and deletes them;
// /api/fx/usd is mocked or fails, and the pick is set the way
// src/lib/currency/client.ts stores it.

const CURRENCY_KEY = "mybakuriani:currency"; // client.ts CURRENCY_KEY
const RATE_KEY = "mybakuriani:fx_usd"; // client.ts RATE_KEY
const BUY = "ყიდვა"; // RentBuyToggle.buy
const SALE_TAB = "ყიდვა / ძიება"; // SaleSearchBox.tabBuySearch

const AREA_SQM = 47;
// 150 000 ₾ typed; its dollars converted once at 2.5971 lari per dollar.
const GEL_SALE = {
  sale_price: 57757,
  sale_price_gel: 150000,
  sale_price_currency: "GEL",
};
const GEL_TEXT = "150 000 ₾";
const USD_TEXT = "$57 757";
const USD_PER_SQM_TEXT = "$1 229"; // 57 757 / 47 m², stored dollars
// A legacy row: dollars only (no lari, currency left at its 'USD' default).
const LEGACY_SALE = { sale_price: 55000 };
const LEGACY_TEXT = "$55 000";
const MOCK_GEL_PER_USD = 2.5971;
const LEGACY_GEL_TEXT = "142 841 ₾"; // 55 000 × 2.5971, rounded

async function createSale(
  fields: Partial<TablesInsert<"properties">>,
): Promise<string> {
  const id = randomUUID();
  await properties.create({
    id,
    owner_id: TEST_IDS.seller,
    type: "apartment",
    title: `E2E sale currency ${id.slice(0, 8)}`,
    // No owner text: the meta description is then the facts sentence (C40).
    description: null,
    location: "ბაკურიანი",
    area_sqm: AREA_SQM,
    rooms: 2,
    photos: [],
    status: "active",
    is_for_sale: true,
    construction_status: "completed",
    ...fields,
  });
  return id;
}

/** Deletes the listing, then the view events its detail page recorded
 * (listing_view_events has no FK; a late view POST finds no active listing). */
async function removeSale(id: string) {
  await properties.delete(id);
  const { error } = await supabaseAdmin
    .from("listing_view_events")
    .delete()
    .eq("listing_id", id);
  if (error)
    throw new Error(`[listing_view_events] delete failed: ${error.message}`);
}

/** The header pick as client.ts keeps it, with no rate stored beforehand. */
async function pickCurrency(page: Page, currency: "GEL" | "USD") {
  await page.addInitScript(
    ([currencyKey, rateKey, value]) => {
      window.localStorage.setItem(currencyKey, value);
      window.localStorage.removeItem(rateKey);
    },
    [CURRENCY_KEY, RATE_KEY, currency] as const,
  );
}

/** Serves /api/fx/usd at `gelPerUsd` for today's Tbilisi day, or fails the
 * request (null). `asked()` tells whether the page has asked for it yet. */
async function routeRate(page: Page, gelPerUsd: number | null) {
  let asked = false;
  await page.route("**/api/fx/usd", (route) => {
    asked = true;
    if (gelPerUsd === null) return route.abort();
    const day = tbilisiDay(new Date());
    return route.fulfill({ json: { gelPerUsd, date: day, validFrom: day } });
  });
  return { asked: () => asked };
}

test.beforeEach(async ({ page, baseURL }) => {
  // Keep the cookie banner out of the way of the home page's toggle.
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: "v2|analytics=0|location=0",
      url: baseURL!,
    },
  ]);
});

test.describe("server HTML (no JavaScript)", () => {
  test.use({ javaScriptEnabled: false });

  test("a sale typed in lari is printed in lari in the sidebar and the meta description", async ({
    page,
  }) => {
    const id = await createSale(GEL_SALE);
    try {
      await page.goto(`/sales/${id}`);
      const sidebar = page.locator("#seller-sidebar");
      await expect(sidebar).toContainText(GEL_TEXT);
      await expect(sidebar).not.toContainText(USD_TEXT);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        new RegExp(GEL_TEXT),
      );
    } finally {
      await removeSale(id);
    }
  });
});

test("a $ pick shows a lari sale's stored dollars, with no rate", async ({
  page,
}) => {
  const id = await createSale(GEL_SALE);
  try {
    await pickCurrency(page, "USD");
    const rate = await routeRate(page, null);
    await page.goto(`/sales/${id}`);
    const sidebar = page.locator("#seller-sidebar");
    await expect(sidebar).toContainText(USD_TEXT);
    await expect(sidebar).toContainText(USD_PER_SQM_TEXT);
    await expect(sidebar).not.toContainText(GEL_TEXT);
    // The rate was asked for and failed: the dollars are stored, not converted.
    await expect.poll(rate.asked).toBe(true);
  } finally {
    await removeSale(id);
  }
});

test("a ₾ pick converts a legacy dollar-only sale live, and keeps dollars without a rate", async ({
  page,
}) => {
  const id = await createSale(LEGACY_SALE);
  try {
    await pickCurrency(page, "GEL");
    await routeRate(page, MOCK_GEL_PER_USD);
    await page.goto(`/sales/${id}`);
    const sidebar = page.locator("#seller-sidebar");
    await expect(sidebar).toContainText(LEGACY_GEL_TEXT);
    await expect(sidebar).not.toContainText(LEGACY_TEXT);

    await page.unroute("**/api/fx/usd");
    const failed = await routeRate(page, null);
    await page.reload();
    // Hydrated and asked (the server HTML alone also reads "$55 000").
    await expect.poll(failed.asked).toBe(true);
    await expect(sidebar).toContainText(LEGACY_TEXT);
    await expect(sidebar).not.toContainText(LEGACY_GEL_TEXT);
  } finally {
    await removeSale(id);
  }
});

test("the /sales/all card of a sale typed in lari shows its lari", async ({
  page,
}) => {
  const id = await createSale(GEL_SALE);
  try {
    await routeRate(page, null);
    // /sales/all renders per request (it reads searchParams), so a new
    // listing shows at once; the dollar filter (sale_price) isolates it.
    await page.goto(
      `/sales/all?price_min=${GEL_SALE.sale_price}&price_max=${GEL_SALE.sale_price}`,
    );
    const card = page.locator(`a[data-listing-card][href$="/sales/${id}"]`);
    await expect(card).toContainText(GEL_TEXT);
    await expect(card).not.toContainText(USD_TEXT);
  } finally {
    await removeSale(id);
  }
});

test("the home page's sale row shows a sale typed in lari in lari", async ({
  page,
}) => {
  // "/" is ISR (revalidate 120) and its sale view is a client toggle. A SUPER
  // VIP listing is the newest in the home's SUPER VIP sale row (up to 12), so
  // the page is reloaded until a regenerated copy carries it.
  test.setTimeout(240_000);
  const id = await createSale({
    ...GEL_SALE,
    is_super_vip: true,
    vip_expires_at: new Date(Date.now() + 2 * 24 * 3_600_000).toISOString(),
  });
  try {
    await routeRate(page, null);
    const card = page.locator(`a[data-sale-card][href$="/sales/${id}"]`);
    await expect(async () => {
      await page.goto("/");
      // A click that lands before hydration is lost; retry until sale renders.
      await expect(async () => {
        await page
          .getByRole("button", { name: BUY, exact: true })
          .first()
          .click();
        await expect(
          page.getByRole("button", { name: SALE_TAB, exact: true }),
        ).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await expect(card).not.toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 200_000, intervals: [10_000] });
    await expect(card.first()).toContainText(GEL_TEXT);
    await expect(card.first()).not.toContainText(USD_TEXT);
  } finally {
    await removeSale(id);
  }
});
