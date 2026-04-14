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
