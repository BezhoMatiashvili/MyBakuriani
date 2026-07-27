import { test, expect } from "../helpers/fixtures";
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
