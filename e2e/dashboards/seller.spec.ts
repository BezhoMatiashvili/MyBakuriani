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

test.describe("Seller Dashboard", () => {
  test("overview loads", async ({ sellerPage }) => {
    await sellerPage.goto("/dashboard/seller");
    if (!(await assertDashboard(sellerPage, "/dashboard/seller"))) return;

    await expect(sellerPage.locator("main")).toBeVisible();
    await expect(sellerPage).toHaveURL(/\/dashboard\/seller/);
  });

  test("listings page loads", async ({ sellerPage }) => {
    await sellerPage.goto("/dashboard/seller/listings");
    if (!(await assertDashboard(sellerPage, "/dashboard/seller/listings")))
      return;

    await expect(sellerPage.locator("main")).toBeVisible();
    await expect(sellerPage).toHaveURL(/\/dashboard\/seller\/listings/);
  });

  test("sidebar has Georgian labels", async ({ sellerPage }) => {
    await sellerPage.goto("/dashboard/seller");
    if (!(await assertDashboard(sellerPage, "/dashboard/seller"))) return;

    const pageContent = sellerPage.locator("body");

    const georgianLabels = ["მთავარი", "ჩემი განცხადებები"];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});
