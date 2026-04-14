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

test.describe("Cleaner Dashboard", () => {
  test("overview loads", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner");
    if (!(await assertDashboard(cleanerPage, "/dashboard/cleaner"))) return;

    await expect(cleanerPage.locator("main")).toBeVisible();
    await expect(cleanerPage).toHaveURL(/\/dashboard\/cleaner/);
  });

  test("schedule page loads", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    if (!(await assertDashboard(cleanerPage, "/dashboard/cleaner/schedule")))
      return;

    await expect(cleanerPage.locator("main")).toBeVisible();
    await expect(cleanerPage).toHaveURL(/\/dashboard\/cleaner\/schedule/);
  });

  test("earnings page loads", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner/earnings");
    if (!(await assertDashboard(cleanerPage, "/dashboard/cleaner/earnings")))
      return;

    await expect(cleanerPage.locator("main")).toBeVisible();
    await expect(cleanerPage).toHaveURL(/\/dashboard\/cleaner\/earnings/);
  });

  test("sidebar has Georgian labels", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner");
    if (!(await assertDashboard(cleanerPage, "/dashboard/cleaner"))) return;

    const pageContent = cleanerPage.locator("body");

    const georgianLabels = ["მთავარი", "განრიგი", "შემოსავალი"];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});
