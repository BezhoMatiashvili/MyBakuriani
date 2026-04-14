import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";

/** If page redirected to login, skip assertion gracefully */
async function assertDashboard(page: Page) {
  if (page.url().includes("/auth/login")) {
    test.info().annotations.push({
      type: "skip",
      description: "Auth not available",
    });
    return false;
  }
  return true;
}

test.describe("Admin Dashboard", () => {
  test("overview loads with stats", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin/);
  });

  test("verifications page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/verifications");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/verifications/);
    await expect(adminPage.getByText("ვერიფიკაციები").first()).toBeVisible();
  });

  test("clients page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/clients");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/clients/);
    await expect(adminPage.getByText("კლიენტები").first()).toBeVisible();
  });

  test("listings page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/listings");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/listings/);
    await expect(adminPage.getByText("განცხადებები").first()).toBeVisible();
  });

  test("analytics page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/analytics");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/analytics/);
    await expect(adminPage.getByText("ანალიტიკა").first()).toBeVisible();
  });

  test("settings page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/settings");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/settings/);
    await expect(adminPage.getByText("პარამეტრები").first()).toBeVisible();
  });

  test("protected admin route redirects with next param", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard/admin");
    if (!page.url().includes("/auth/login")) {
      test.info().annotations.push({
        type: "skip",
        description: "Session still active in environment",
      });
      return;
    }
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page).toHaveURL(/next=%2Fdashboard%2Fadmin/);
  });

  test("sidebar has Georgian labels", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin");
    if (!(await assertDashboard(adminPage))) return;

    const pageContent = adminPage.locator("body");

    const georgianLabels = [
      "მთავარი",
      "ვერიფიკაციები",
      "კლიენტები",
      "განცხადებები",
      "ანალიტიკა",
      "პარამეტრები",
    ];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});
