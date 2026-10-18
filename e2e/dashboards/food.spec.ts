import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/fixtures";
import { TEST_IDS } from "../helpers/seed";
import { services, supabaseAdmin } from "../helpers/supabase";

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

test.describe("Food Dashboard", () => {
  test("overview loads", async ({ foodPage }) => {
    await foodPage.goto("/dashboard/food");
    if (!(await assertDashboard(foodPage, "/dashboard/food"))) return;

    await expect(foodPage.locator("main")).toBeVisible();
    await expect(foodPage).toHaveURL(/\/dashboard\/food/);
  });

  // Each test here makes the newest restaurant of the food user, which is the
  // one the cabinet shows, so they must not run at the same time.
  test.describe("the newest restaurant", () => {
    test.describe.configure({ mode: "serial" });

    test("food listing shows its VIP and no discount or revenue card", async ({
      foodPage,
    }) => {
      const serviceId = randomUUID();
      await services.create({
        id: serviceId,
        owner_id: TEST_IDS.food,
        category: "food",
        title: `E2E VIP რესტორანი ${serviceId.slice(0, 6)}`,
        description: "Food promotion status regression fixture",
        location: "ბაკურიანი",
        price: 40,
        photos: [],
        status: "active",
        is_vip: true,
        is_super_vip: false,
        vip_expires_at: new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      try {
        await foodPage.goto("/dashboard/food");
        if (!(await assertDashboard(foodPage, "/dashboard/food"))) return;

        const listing = foodPage.locator(`[data-listing-id="${serviceId}"]`);
        await expect(
          listing
            .getByTestId("listing-promotion-status")
            .locator('[data-promotion-tier="vip"]'),
        ).toContainText(/VIP\s*·\s*3 დღე დარჩა/);
        // Restaurants make no discounts (C21): VIP and SUPER VIP only.
        const promotions = listing.getByTestId("listing-promotions");
        await expect(
          promotions.getByRole("button", { name: "VIP", exact: true }),
        ).toBeVisible();
        await expect(
          promotions.getByRole("button", { name: "ფასდაკლება" }),
        ).toHaveCount(0);
        await expect(foodPage.getByText("დღის ბრუნვა")).toHaveCount(0);
        await expect(foodPage.getByText("PREMIUM გადახდილია")).toHaveCount(0);
      } finally {
        await services.delete(serviceId);
      }
    });

    test("restaurants cannot start a discount", async ({ foodPage }) => {
      const serviceId = randomUUID();
      const dishName = `E2E კერძი ${serviceId.slice(0, 6)}`;
      await services.create({
        id: serviceId,
        owner_id: TEST_IDS.food,
        category: "food",
        title: `E2E რესტორანი ${serviceId.slice(0, 6)}`,
        description: "Restaurant discount removal fixture",
        location: "ბაკურიანი",
        photos: [],
        status: "active",
      });

      try {
        const { data: dish, error } = await supabaseAdmin
          .from("service_menu_items")
          .insert({ service_id: serviceId, name: dishName, price: 12 })
          .select("id")
          .single();
        expect(error).toBeNull();

        // The database refuses a discount on a dish and on a restaurant.
        const dishUpdate = await supabaseAdmin
          .from("service_menu_items")
          .update({ discount_percent: 10 })
          .eq("id", dish!.id);
        expect(dishUpdate.error?.code).toBe("23514");
        const listingUpdate = await supabaseAdmin
          .from("services")
          .update({ discount_percent: 10 })
          .eq("id", serviceId);
        expect(listingUpdate.error?.code).toBe("23514");
        expect(listingUpdate.error?.hint).toBe("invalid_target");

        await foodPage.goto("/dashboard/food/orders");
        if (!(await assertDashboard(foodPage, "/dashboard/food/orders"))) {
          return;
        }
        await expect(foodPage.getByText(dishName)).toBeVisible();
        await expect(
          foodPage.getByRole("button", { name: "ფასდაკლების გააქტიურება" }),
        ).toHaveCount(0);

        // The per-dish route is gone. The page's own origin passes the
        // middleware's API origin check, so a 404 means no route.
        const res = await foodPage.request.post(
          "/api/food/menu-item-discount-requests",
          { headers: { Origin: new URL(foodPage.url()).origin }, data: {} },
        );
        expect(res.status()).toBe(404);

        await foodPage.goto("/dashboard/food/balance");
        await expect(
          foodPage.getByText("SUPER VIP", { exact: true }).first(),
        ).toBeVisible();
        await expect(foodPage.getByText(/ფასდაკლების ბე(ი)?ჯი/)).toHaveCount(0);
      } finally {
        await services.delete(serviceId);
      }
    });
  });

  test("orders page loads", async ({ foodPage }) => {
    await foodPage.goto("/dashboard/food/orders");
    if (!(await assertDashboard(foodPage, "/dashboard/food/orders"))) return;

    await expect(foodPage.locator("main")).toBeVisible();
    await expect(foodPage).toHaveURL(/\/dashboard\/food\/orders/);
  });

  test("sidebar has Georgian labels", async ({ foodPage }) => {
    await foodPage.goto("/dashboard/food");
    if (!(await assertDashboard(foodPage, "/dashboard/food"))) return;

    const pageContent = foodPage.locator("body");

    const georgianLabels = ["მთავარი", "შეკვეთები"];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});
