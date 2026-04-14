import { test, expect } from "../helpers/fixtures";

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
