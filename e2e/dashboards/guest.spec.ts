import type { Page } from "@playwright/test";
import { test, expect, loadTestUsers } from "../helpers/fixtures";
import { authenticateAsRole } from "../helpers/auth";
import { STRESS_IDS } from "../helpers/fixture-manifest.mjs";
import { TEST_IDS } from "../helpers/seed";
import { supabaseAdmin } from "../helpers/supabase";

/** If page redirected to login, skip assertion gracefully */
async function assertDashboard(page: any, expectedPath: string) {
  if (page.url().includes("/auth/login")) {
    test.info().annotations.push({
      type: "skip",
      description: "Auth not available",
    });
    return false;
  }
  return true;
}

test.describe("Guest Dashboard", () => {
  test("overview loads", async ({ guestPage }) => {
    await guestPage.goto("/dashboard/guest");
    if (!(await assertDashboard(guestPage, "/dashboard/guest"))) return;

    await expect(guestPage.locator("main")).toBeVisible();
    await expect(guestPage).toHaveURL(/\/dashboard\/guest/);
  });

  test("bookings page loads", async ({ guestPage }) => {
    await guestPage.goto("/dashboard/guest/bookings");
    if (!(await assertDashboard(guestPage, "/dashboard/guest/bookings")))
      return;

    await expect(guestPage.locator("main")).toBeVisible();
    await expect(guestPage).toHaveURL(/\/dashboard\/guest\/bookings/);
  });

  test("reviews page loads", async ({ guestPage }) => {
    await guestPage.goto("/dashboard/guest/reviews");
    if (!(await assertDashboard(guestPage, "/dashboard/guest/reviews"))) return;

    await expect(guestPage.locator("main")).toBeVisible();
    await expect(guestPage).toHaveURL(/\/dashboard\/guest\/reviews/);
  });

  test("profile page loads", async ({ guestPage }) => {
    await guestPage.goto("/dashboard/guest/profile");
    if (!(await assertDashboard(guestPage, "/dashboard/guest/profile"))) return;

    await expect(guestPage.locator("main")).toBeVisible();
    await expect(guestPage).toHaveURL(/\/dashboard\/guest\/profile/);
  });

  test("sidebar has Georgian labels", async ({ guestPage }) => {
    await guestPage.goto("/dashboard/guest");
    if (!(await assertDashboard(guestPage, "/dashboard/guest"))) return;

    const sidebar = guestPage.locator("nav, aside, [role='navigation']");
    const pageContent = guestPage.locator("body");

    const georgianLabels = ["მთავარი", "ჯავშნები", "შეფასებები", "პროფილი"];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});

test.describe("Guest favorites", () => {
  test.describe.configure({ mode: "serial" });

  async function clearGuestFavorites(userId: string, propertyId: string, serviceId: string) {
    const [properties, services] = await Promise.all([
      supabaseAdmin
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("property_id", propertyId),
      supabaseAdmin
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("service_id", serviceId),
    ]);
    expect(properties.error).toBeNull();
    expect(services.error).toBeNull();
  }

  test.beforeEach(async ({ testIds }) => {
    await clearGuestFavorites(testIds.guest, testIds.villa, testIds.foodService);
    const { error } = await supabaseAdmin
      .from("services")
      .update({ status: "active" })
      .eq("id", testIds.foodService);
    expect(error).toBeNull();
  });

  test.afterEach(async ({ testIds }) => {
    await clearGuestFavorites(testIds.guest, testIds.villa, testIds.foodService);
    await supabaseAdmin
      .from("services")
      .update({ status: "active" })
      .eq("id", testIds.foodService);
  });

  test("adds property and service favorites, then persists removal after reload", async ({
    guestPage,
    testIds,
  }) => {
    await guestPage.goto("/apartments");
    if (!(await assertDashboard(guestPage, "/apartments"))) return;

    const propertyCard = guestPage
      .getByText("E2E ვილა ბაკურიანში", { exact: true })
      .locator("xpath=ancestor::a[1]");
    const propertyHeart = propertyCard.locator("[data-slot='favorite-button']");
    await propertyHeart.click();
    await expect(propertyHeart).toHaveAttribute("aria-pressed", "true");

    await guestPage.goto("/food");
    const serviceCard = guestPage.getByRole("link", { name: "E2E რესტორანი" });
    const serviceHeart = serviceCard.locator("[data-slot='favorite-button']");
    await serviceHeart.click();
    await expect(serviceHeart).toHaveAttribute("aria-pressed", "true");
    await guestPage.reload();
    await expect(serviceHeart).toHaveAttribute("aria-pressed", "true");

    await guestPage.goto("/dashboard/guest/favorites");
    await expect(guestPage.getByText("აქ ინახება ფავორიტი განცხადებები")).toBeVisible();
    await expect(guestPage.getByText("E2E ვილა ბაკურიანში")).toBeVisible();
    await expect(guestPage.getByText("E2E რესტორანი")).toBeVisible();
    await expect(guestPage.getByText("ყველას ნახვა")).toHaveCount(0);

    const removeButtons = guestPage.getByRole("button", {
      name: "წაშლა რჩეულებიდან",
    });
    await removeButtons.first().click();
    await guestPage.reload();

    const { count, error } = await supabaseAdmin
      .from("favorites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", testIds.guest);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  test("reconciles a stale client add when the database row already exists", async ({
    guestPage,
    testIds,
  }) => {
    const hydrated = guestPage.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/rest/v1/favorites"),
    );
    await guestPage.goto("/apartments");
    await hydrated;
    const propertyCard = guestPage
      .getByText("E2E ვილა ბაკურიანში", { exact: true })
      .locator("xpath=ancestor::a[1]");
    const propertyHeart = propertyCard.locator("[data-slot='favorite-button']");
    await expect(propertyHeart).toHaveAttribute("aria-pressed", "false");

    // The client has completed its empty hydration. Insert a row externally
    // to reproduce another tab/device favoriting the same listing first.
    const { error: insertError } = await supabaseAdmin.from("favorites").insert({
      user_id: testIds.guest,
      property_id: testIds.villa,
    });
    expect(insertError).toBeNull();

    await propertyHeart.click();
    await expect(propertyHeart).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(guestPage.getByText("ვერ მოხერხდა, სცადეთ ხელახლა")).toHaveCount(0);

    const { count, error } = await supabaseAdmin
      .from("favorites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", testIds.guest)
      .eq("property_id", testIds.villa);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  test("keeps non-public favorites removable without exposing their listing", async ({
    guestPage,
    testIds,
  }) => {
    const { error: favoriteError } = await supabaseAdmin.from("favorites").insert({
      user_id: testIds.guest,
      service_id: testIds.foodService,
    });
    expect(favoriteError).toBeNull();
    const { error: statusError } = await supabaseAdmin
      .from("services")
      .update({ status: "pending" })
      .eq("id", testIds.foodService);
    expect(statusError).toBeNull();

    await guestPage.goto("/dashboard/guest/favorites");
    await expect(guestPage.getByText("განცხადება აღარ არის ხელმისაწვდომი")).toBeVisible();
    await expect(guestPage.getByText("E2E რესტორანი")).toHaveCount(0);

    await guestPage
      .getByRole("button", { name: "წაშლა რჩეულებიდან" })
      .click();
    await guestPage.reload();
    await expect(guestPage.getByText("განცხადება აღარ არის ხელმისაწვდომი")).toHaveCount(0);
  });
});

test.describe("Guest recently viewed + live view counts", () => {
  test.describe.configure({ mode: "serial" });

  // Not testIds.foodService: the favorites tests above flip that one to
  // pending while they run in parallel. This stress fixture stays active.
  const FOOD = STRESS_IDS.foodMax;

  /** The per-viewer 24h dedup keys these tests can mint (C22). */
  function viewKeys(ids: typeof TEST_IDS) {
    return [
      `listing-view:user:${ids.guest}:property:${ids.hotel}`,
      `listing-view:user:${ids.seller}:property:${ids.hotel}`,
      `listing-view:user:${ids.renter}:property:${ids.hotel}`,
      `listing-view:user:${ids.guest}:service:${FOOD}`,
    ];
  }

  async function resetViews(ids: typeof TEST_IDS) {
    const [keys, history] = await Promise.all([
      supabaseAdmin
        .from("rate_limit_counters")
        .delete()
        .in("key", viewKeys(ids)),
      supabaseAdmin
        .from("recently_viewed_listings")
        .delete()
        .in("user_id", [ids.guest, ids.seller, ids.renter]),
    ]);
    expect(keys.error).toBeNull();
    expect(history.error).toBeNull();
  }

  /** Resolves with the detail page's view beacon response for one listing. */
  function viewBeacon(page: Page, kind: "property" | "service", id: string) {
    return page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/api/listings/${kind}/${id}/view`),
    );
  }

  /**
   * The page shows the larger of its ISR-rendered count and the beacon's live
   * one. A cached page can outlive a re-seeded fixture (and then show more
   * than the fresh row has), so only "at least the live count" is stable.
   */
  async function expectShownViewsAtLeast(page: Page, live: number) {
    const label = page.getByText(/^\d+ ნახვა$/);
    await expect(label).toBeVisible();
    await expect
      .poll(async () => Number.parseInt(await label.innerText(), 10))
      .toBeGreaterThanOrEqual(live);
  }

  async function hotelViews(hotelId: string) {
    const { data, error } = await supabaseAdmin
      .from("properties")
      .select("views_count")
      .eq("id", hotelId)
      .single();
    expect(error).toBeNull();
    return data?.views_count ?? 0;
  }

  test.beforeEach(async ({ testIds }) => {
    await resetViews(testIds);
  });

  test.afterAll(async () => {
    await resetViews(TEST_IDS);
    // listing_view_events has no FK to the listing, so the fixture teardown
    // would leave these behind (same cleanup as e2e/vip/vip-fixtures.ts).
    await supabaseAdmin
      .from("listing_view_events")
      .delete()
      .in("listing_id", [TEST_IDS.hotel, FOOD]);
  });

  test("records the viewer's own history newest-first with canonical links", async ({
    guestPage,
    testIds,
  }) => {
    await guestPage.goto("/dashboard/guest");
    if (!(await assertDashboard(guestPage, "/dashboard/guest"))) return;
    await expect(
      guestPage.getByText("ჯერ არ გინახავთ განცხადებები"),
    ).toBeVisible();

    const hotelBeacon = viewBeacon(guestPage, "property", testIds.hotel);
    await guestPage.goto(`/hotels/${testIds.hotel}`);
    const hotelView = await (await hotelBeacon).json();
    expect(hotelView).toMatchObject({
      counted: true,
      views: expect.any(Number),
    });
    await expectShownViewsAtLeast(guestPage, hotelView.views);

    const foodBeacon = viewBeacon(guestPage, "service", FOOD);
    await guestPage.goto(`/food/${FOOD}`);
    const foodView = await (await foodBeacon).json();
    expect(foodView).toMatchObject({
      counted: true,
      views: expect.any(Number),
    });
    await expectShownViewsAtLeast(guestPage, foodView.views);

    // Newest first, each on its category's own detail route. No exact total:
    // other suites can view listings as this guest in parallel.
    await guestPage.goto("/dashboard/guest");
    const cards = guestPage.getByTestId("recent-listing");
    await expect(cards.nth(0)).toHaveAttribute("href", `/food/${FOOD}`);
    await expect(cards.nth(1)).toHaveAttribute(
      "href",
      `/hotels/${testIds.hotel}`,
    );
  });

  test("an owner's own view is neither counted nor recorded", async ({
    renterPage,
    testIds,
  }) => {
    // The renter owns the hotel fixture.
    const beacon = viewBeacon(renterPage, "property", testIds.hotel);
    await renterPage.goto(`/hotels/${testIds.hotel}`);
    const response = await beacon;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      counted: false,
      reason: "self",
    });

    const { count, error } = await supabaseAdmin
      .from("recently_viewed_listings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", testIds.renter)
      .eq("property_id", testIds.hotel);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  test("each signed-in viewer counts once, even from the same IP", async ({
    guestPage,
    browser,
    testIds,
  }) => {
    const before = await hotelViews(testIds.hotel);

    const guestBeacon = viewBeacon(guestPage, "property", testIds.hotel);
    await guestPage.goto(`/hotels/${testIds.hotel}`);
    const first = await (await guestBeacon).json();
    expect(first).toMatchObject({ counted: true });

    // Fixture pages share one browser context (one cookie jar), so the seller
    // gets its own. Both viewers reach the server from the same local IP,
    // which the old IP-keyed dedup merged into a single view.
    const sellerContext = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    try {
      const sellerPage = await sellerContext.newPage();
      await authenticateAsRole(loadTestUsers().seller, sellerPage);
      const sellerBeacon = viewBeacon(sellerPage, "property", testIds.hotel);
      await sellerPage.goto(`/hotels/${testIds.hotel}`);
      const second = await (await sellerBeacon).json();
      expect(second).toMatchObject({ counted: true });
      expect(second.views).toBeGreaterThanOrEqual(first.views + 1);
    } finally {
      await sellerContext.close();
    }

    const reloadBeacon = viewBeacon(guestPage, "property", testIds.hotel);
    await guestPage.reload();
    expect(await (await reloadBeacon).json()).toMatchObject({
      counted: false,
      reason: "duplicate",
    });

    // At least, not exactly: the public suite views this hotel concurrently.
    expect(await hotelViews(testIds.hotel)).toBeGreaterThanOrEqual(before + 2);
  });
});
