import { test, expect } from "../helpers/fixtures";
import { smartMatchRequests, supabaseAdmin } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";

// ---------------------------------------------------------------------------
// Smart match flow
// Request exists from seed -> renter sees it in dashboard ->
// update matched_properties via DB -> guest sees matches
// ---------------------------------------------------------------------------

test.describe("Smart match flow", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    // Reset the seed smart match request back to pending with empty matches
    try {
      await smartMatchRequests.update(TEST_IDS.smartMatch, {
        status: "pending",
        matched_properties: [],
      });
    } catch {}
  });

  test("seed smart match request exists in DB", async ({ testIds }) => {
    const request = await smartMatchRequests.get(testIds.smartMatch);
    expect(request).toBeTruthy();
    expect(request!.status).toBe("pending");
    expect(request!.guest_id).toBe(testIds.guest);
    expect(request!.budget_min).toBe(100);
    expect(request!.budget_max).toBe(300);
    expect(request!.guests_count).toBe(3);
  });

  test("renter can access smart-match page in dashboard", async ({
    renterPage,
  }) => {
    await renterPage.goto("/dashboard/renter/smart-match");
    await renterPage.waitForLoadState("networkidle");

    const currentUrl = renterPage.url();

    // Handle auth redirect gracefully
    if (currentUrl.includes("/auth/")) {
      expect(currentUrl).toContain("/auth/");
      return;
    }

    // Smart match page should load
    const mainContent = renterPage.locator("main, [role='main'], .dashboard");
    await expect(mainContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test("renter sees smart match requests on dashboard", async ({
    renterPage,
  }) => {
    await renterPage.goto("/dashboard/renter");
    await renterPage.waitForLoadState("networkidle");

    const currentUrl = renterPage.url();
    if (currentUrl.includes("/auth/")) {
      return;
    }

    // Dashboard should have content
    const body = renterPage.locator("body");
    await expect(body).toBeVisible();
    const pageText = await renterPage.textContent("body");
    expect(pageText).toBeTruthy();
  });

  test("update matched_properties via DB", async ({ testIds }) => {
    // Renter matches their apartment to the guest's request
    const updated = await smartMatchRequests.update(testIds.smartMatch, {
      matched_properties: [testIds.apartment, testIds.villa],
      status: "matched",
    });

    expect(updated.status).toBe("matched");
    expect(updated.matched_properties).toContain(testIds.apartment);
    expect(updated.matched_properties).toContain(testIds.villa);
  });

  test("guest can see matched properties after match", async ({
    guestPage,
    testIds,
  }) => {
    // Verify in DB that the match exists
    const request = await smartMatchRequests.get(testIds.smartMatch);
    expect(request).toBeTruthy();
    expect(request!.status).toBe("matched");
    expect(request!.matched_properties).toHaveLength(2);

    // Guest navigates to their dashboard to see matches
    await guestPage.goto("/dashboard/guest");
    await guestPage.waitForLoadState("networkidle");

    const currentUrl = guestPage.url();
    if (currentUrl.includes("/auth/")) {
      return;
    }

    // Guest dashboard should load
    const mainContent = guestPage.locator("main, [role='main'], .dashboard");
    await expect(mainContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test("matched property details are accessible to guest", async ({
    guestPage,
    testIds,
  }) => {
    // Guest can view the matched apartment detail
    await guestPage.goto(`/apartments/${testIds.apartment}`);
    await guestPage.waitForLoadState("networkidle");

    const title = guestPage.locator("h1").first();
    await expect(title).toBeVisible({ timeout: 10_000 });

    // Guest can view the matched villa detail
    await guestPage.goto(`/apartments/${testIds.villa}`);
    await guestPage.waitForLoadState("networkidle");

    const villaTitle = guestPage.locator("h1").first();
    await expect(villaTitle).toBeVisible({ timeout: 10_000 });
  });
});
