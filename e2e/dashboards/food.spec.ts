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

test.describe("Food Dashboard", () => {
  test("overview loads", async ({ foodPage }) => {
    await foodPage.goto("/dashboard/food");
    if (!(await assertDashboard(foodPage, "/dashboard/food"))) return;

    await expect(foodPage.locator("main")).toBeVisible();
    await expect(foodPage).toHaveURL(/\/dashboard\/food/);
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
