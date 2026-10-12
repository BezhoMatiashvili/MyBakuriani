import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { configureIsolatedE2E } from "../helpers/env";
import { supabaseAdmin } from "../helpers/supabase";
import {
  BANNER_PLACEMENTS,
  legacyPositionForPlacement,
} from "../../src/lib/banner-placements";

// The admin's on-site ad preview (C47, 2026-10-11). Every placement gets one
// PAUSED fixture ad: a paused ad takes no slot capacity and never reaches a
// visitor, yet its card's "საიტზე ნახვა" must open the page of its placement
// with the ad in place, and that browser must send no banner statistics.

const IMAGE =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800";

const FIXTURES = BANNER_PLACEMENTS.map((spec, index) => ({
  id: `aae2ff00-ad00-4000-a000-${String(index + 1).padStart(12, "0")}`,
  placement: spec.id,
  title: `E2E preview ${spec.id}`,
}));

const PREVIEW_PILL = "რეკლამის გადახედვა";

// One worker, in order: the rows are shared by every test of the file.
test.describe.configure({ mode: "default" });

test.beforeAll(async () => {
  const day = 86_400_000;
  const { error } = await supabaseAdmin.from("ads").upsert(
    FIXTURES.map(({ id, placement, title }) => ({
      id,
      placement,
      position: legacyPositionForPlacement(placement),
      title,
      url: "https://example.com/e2e-ad-preview",
      banner_url: IMAGE,
      start_at: new Date(Date.now() - day).toISOString(),
      end_at: new Date(Date.now() + 7 * day).toISOString(),
      status: "paused",
      sov_percent: 25,
      priority: 5,
      frequency_cap_per_day: 3,
      // `ads.created_by` has no ON DELETE action: a leftover row pointing at
      // the seeded admin would block that user's teardown.
      created_by: null,
    })),
  );
  if (error)
    throw new Error(`seeding the preview ads failed: ${error.message}`);
});

test.afterAll(async () => {
  await supabaseAdmin
    .from("ads")
    .delete()
    .in(
      "id",
      FIXTURES.map((fixture) => fixture.id),
    );
});

// The cookie panel would cover the lower half of the page.
async function acceptCookies(context: BrowserContext) {
  await context.addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
}

/** Counts banner beacons and keeps them away from the server. */
async function watchBeacons(context: BrowserContext): Promise<() => number> {
  let sent = 0;
  context.on("request", (request) => {
    if (request.url().includes("/api/banner-slots/track")) sent += 1;
  });
  await context.route("**/api/banner-slots/track", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  return () => sent;
}

/** Leaving the page flushes whatever the banner queue holds (pagehide). */
async function leave(page: Page) {
  await page.waitForTimeout(3_000);
  await page.goto("about:blank");
  await page.waitForTimeout(500);
}

test("a visitor cannot open an ad's preview", async ({ request }) => {
  const response = await request.get(
    `/api/admin/ads/${FIXTURES[0].id}/preview?open=1&locale=ka`,
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("a visitor's page ignores a preview link", async ({ page, context }) => {
  // A visitor's browser does send beacons (the live creatives on the page);
  // stubbed so a test run adds nothing to the advertisers' reports.
  await watchBeacons(context);
  await acceptCookies(context);
  await page.goto(`/#mb-ad-preview=${FIXTURES[0].id}`);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.sessionStorage.getItem("mybakuriani:ad_preview"),
      ),
    )
    .toBeNull();
  await expect(page.locator("[data-ad-preview]")).toHaveCount(0);
  await expect(page.getByTestId("ad-preview-bar")).toHaveCount(0);
});

for (const fixture of FIXTURES) {
  test(`"საიტზე ნახვა" shows the ${fixture.placement} ad in place`, async ({
    adminPage,
    context,
  }) => {
    const beacons = await watchBeacons(context);
    await acceptCookies(context);

    await adminPage.goto("/dashboard/admin/moderation");
    const link = adminPage.locator(
      `a[data-testid="ad-preview-on-site"][href*="${fixture.id}"]`,
    );
    await expect(link).toBeVisible({ timeout: 20_000 });
    const [preview] = await Promise.all([
      context.waitForEvent("page"),
      link.click(),
    ]);

    // The ad is drawn in its slot, outlined, and the pill names it.
    const slot = preview.locator("[data-ad-preview]");
    const bar = preview.getByTestId("ad-preview-bar");
    await expect(slot.first()).toBeVisible({ timeout: 30_000 });
    await expect(bar).toContainText(PREVIEW_PILL);
    await expect(bar).toContainText(fixture.title);
    expect(new URL(preview.url()).hash).toBe("");

    // In view long enough to count an impression (half on screen for 1 s),
    // which this admin's browser must not send.
    await slot.first().scrollIntoViewIfNeeded();
    await preview.waitForTimeout(2_000);

    // A reload keeps the preview (sessionStorage), and "დახურვა" ends it.
    await preview.reload();
    await expect(slot.first()).toBeVisible({ timeout: 30_000 });
    await bar.getByRole("button", { name: "დახურვა" }).click();
    await expect(slot).toHaveCount(0);
    await expect(bar).toHaveCount(0);

    await leave(preview);
    expect(beacons()).toBe(0);
  });
}
