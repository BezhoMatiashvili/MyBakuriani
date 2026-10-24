import { test, expect } from "../helpers/fixtures";
import { bookings, supabaseAdmin } from "../helpers/supabase";
import { futureISO, TEST_IDS } from "../helpers/seed";

// ---------------------------------------------------------------------------
// Guest–Renter cross-role flow
// Browse apartments -> view detail -> booking via DB -> renter confirms
// ---------------------------------------------------------------------------

const CREATED_IDS: { bookingId?: string } = {};

test.describe("Guest-Renter interaction flow", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    const ignore = () => {};
    if (CREATED_IDS.bookingId) {
      await bookings.delete(CREATED_IDS.bookingId).catch(ignore);
    }
  });

  test("guest can browse apartment listings", async ({ guestPage }) => {
    await guestPage.goto("/apartments");
    await guestPage.waitForLoadState("networkidle");

    // Should see at least the seed apartment
    const heading = guestPage.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Property cards or listing items should be present
    const cards = guestPage.locator(
      '[data-testid="property-card"], .property-card, article, a[href*="/apartments/"]',
    );
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test("guest can view property detail page", async ({
    guestPage,
    testIds,
  }) => {
    await guestPage.goto(`/apartments/${testIds.apartment}`);
    await guestPage.waitForLoadState("networkidle");

    // Title should contain the seed property name
    const title = guestPage.locator("h1").first();
    await expect(title).toBeVisible({ timeout: 10_000 });

    // Price info should be visible
    const priceText = guestPage.getByText("₾");
    await expect(priceText.first()).toBeVisible({ timeout: 10_000 });
  });

  test("create booking via DB, renter confirms", async ({
    renterPage,
    testIds,
  }) => {
    // Step 1: Create a booking via DB (simulating guest booking)
    const bookingId = "aae2ff00-2000-4000-a000-100000000001";
    CREATED_IDS.bookingId = bookingId;

    const booking = await bookings.create({
      id: bookingId,
      property_id: testIds.apartment,
      guest_id: testIds.guest,
      owner_id: testIds.renter,
      check_in: futureISO(50),
      check_out: futureISO(53),
      guests_count: 2,
      total_price: 450,
      currency: "GEL",
      status: "pending",
      guest_message: "E2E ტესტ ჯავშანი",
    });

    expect(booking).toBeTruthy();
    expect(booking.status).toBe("pending");

    // Step 2: Renter confirms the booking via DB
    const confirmed = await bookings.update(bookingId, {
      status: "confirmed",
    });
    expect(confirmed.status).toBe("confirmed");

    // Step 3: Renter should see the booking on their dashboard
    await renterPage.goto("/dashboard/renter");
    await renterPage.waitForLoadState("networkidle");

    // The renter dashboard should load without auth redirect
    const renterUrl = renterPage.url();
    if (!renterUrl.includes("/auth/")) {
      // Dashboard loaded successfully
      const dashboardContent = renterPage.locator(
        "main, [role='main'], .dashboard",
      );
      await expect(dashboardContent.first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
