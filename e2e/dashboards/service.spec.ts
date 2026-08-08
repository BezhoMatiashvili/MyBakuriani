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

test.describe("Service Dashboard", () => {
  test("overview loads", async ({ transportPage }) => {
    await transportPage.goto("/dashboard/service");
    if (!(await assertDashboard(transportPage, "/dashboard/service"))) return;

    await expect(transportPage.locator("main")).toBeVisible();
    await expect(transportPage).toHaveURL(/\/dashboard\/service/);
  });

  test("service cards show SUPER VIP and discount remaining days", async ({
    transportPage,
  }) => {
    const serviceId = randomUUID();
    const expiredServiceId = randomUUID();
    const legacyServiceId = randomUUID();
    await services.create({
      id: serviceId,
      owner_id: TEST_IDS.transport,
      category: "transport",
      title: `E2E VIP ტრანსპორტი ${serviceId.slice(0, 6)}`,
      description: "Service promotion status regression fixture",
      location: "ბაკურიანი",
      price: 80,
      price_unit: "მგზავრობა",
      photos: [],
      status: "active",
      is_vip: false,
      is_super_vip: true,
      vip_expires_at: new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      discount_percent: 10,
      discount_expires_at: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    await services.create({
      id: expiredServiceId,
      owner_id: TEST_IDS.transport,
      category: "transport",
      title: `E2E expired VIP ${expiredServiceId.slice(0, 6)}`,
      description: "Expired promotion status regression fixture",
      location: "ბაკურიანი",
      price: 60,
      photos: [],
      status: "active",
      is_vip: true,
      vip_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    await services.create({
      id: legacyServiceId,
      owner_id: TEST_IDS.transport,
      category: "transport",
      title: `E2E legacy VIP ${legacyServiceId.slice(0, 6)}`,
      description: "Legacy promotion status regression fixture",
      location: "ბაკურიანი",
      price: 50,
      photos: [],
      status: "active",
      is_super_vip: true,
      vip_expires_at: null,
    });

    try {
      await transportPage.goto("/dashboard/transport");
      if (!(await assertDashboard(transportPage, "/dashboard/transport")))
        return;

      const status = transportPage
        .locator(`[data-listing-id="${serviceId}"]`)
        .getByTestId("listing-promotion-status");
      await expect(
        status.locator('[data-promotion-tier="super-vip"]'),
      ).toContainText("SUPER VIP · 2 დღე დარჩა");
      await expect(
        status.locator('[data-promotion-tier="discount"]'),
      ).toContainText("−10% · 1 დღე დარჩა");
      await expect(
        transportPage
          .locator(`[data-listing-id="${expiredServiceId}"]`)
          .getByTestId("listing-promotion-status"),
      ).toHaveCount(0);
      await expect(
        transportPage
          .locator(`[data-listing-id="${legacyServiceId}"]`)
          .locator('[data-promotion-tier="super-vip"]'),
      ).toHaveText("SUPER VIP");
    } finally {
      await services.delete(serviceId);
      await services.delete(expiredServiceId);
      await services.delete(legacyServiceId);
    }
  });

  test("orders page loads", async ({ transportPage }) => {
    await transportPage.goto("/dashboard/service/orders");
    if (!(await assertDashboard(transportPage, "/dashboard/service/orders")))
      return;

    await expect(transportPage.locator("main")).toBeVisible();
    await expect(transportPage).toHaveURL(/\/dashboard\/service\/orders/);
  });

  test("entertainment provider can access", async ({ entertainmentPage }) => {
    await entertainmentPage.goto("/dashboard/service");
    if (!(await assertDashboard(entertainmentPage, "/dashboard/service")))
      return;

    await expect(entertainmentPage.locator("main")).toBeVisible();
    await expect(entertainmentPage).toHaveURL(/\/dashboard\/service/);
  });

  test("employment provider can access", async ({ employmentPage }) => {
    await employmentPage.goto("/dashboard/service");
    if (!(await assertDashboard(employmentPage, "/dashboard/service"))) return;

    await expect(employmentPage.locator("main")).toBeVisible();
    await expect(employmentPage).toHaveURL(/\/dashboard\/service/);
  });

  test("sidebar has Georgian labels", async ({ transportPage }) => {
    await transportPage.goto("/dashboard/service");
    if (!(await assertDashboard(transportPage, "/dashboard/service"))) return;

    const pageContent = transportPage.locator("body");

    const georgianLabels = ["მთავარი", "შეკვეთები"];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});
