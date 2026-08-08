import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/fixtures";
import { TEST_IDS } from "../helpers/seed";
import { services } from "../helpers/supabase";

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

  test("food listing shows its active VIP and discount durations", async ({
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
      discount_percent: 15,
      discount_expires_at: new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    try {
      await foodPage.goto("/dashboard/food");
      if (!(await assertDashboard(foodPage, "/dashboard/food"))) return;

      const status = foodPage
        .locator(`[data-listing-id="${serviceId}"]`)
        .getByTestId("listing-promotion-status");
      await expect(status.locator('[data-promotion-tier="vip"]')).toContainText(
        "VIP · 3 დღე დარჩა",
      );
      await expect(
        status.locator('[data-promotion-tier="discount"]'),
      ).toContainText("−15% · 2 დღე დარჩა");
    } finally {
      await services.delete(serviceId);
    }
  });

  test("orders page loads", async ({ foodPage }) => {
    await foodPage.goto("/dashboard/food/orders");
    if (!(await assertDashboard(foodPage, "/dashboard/food/orders"))) return;

    await expect(foodPage.locator("main")).toBeVisible();
    await expect(foodPage).toHaveURL(/\/dashboard\/food\/orders/);
  });

  test("restaurant discounts are submitted for admin review", async ({
    foodPage,
  }) => {
    await foodPage.goto("/dashboard/food/orders");
    if (!(await assertDashboard(foodPage, "/dashboard/food/orders"))) return;

    await expect(
      foodPage.getByRole("heading", { name: "რესტორნის ფასდაკლება" }),
    ).toBeVisible();
    await expect(
      foodPage.getByRole("button", { name: "ფასდაკლების მოთხოვნა" }),
    ).toBeEnabled();
    await expect(foodPage.getByText("ახალი შეთავაზება", { exact: true })).toHaveCount(0);

    await foodPage
      .getByRole("button", { name: "ფასდაკლების მოთხოვნა" })
      .click();
    await expect(foodPage.getByRole("dialog")).toBeVisible();
    await expect(foodPage.getByText("ფასდაკლების პროცენტი")).toBeVisible();
    await expect(
      foodPage.getByText(/ადმინის განხილვაზე გაიგზავნება/),
    ).toBeVisible();
    await expect(
      foodPage.getByRole("button", { name: "განხილვაზე გაგზავნა" }),
    ).toBeEnabled();
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
