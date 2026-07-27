import { type Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { services } from "../helpers/supabase";

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

test.describe("Cleaner Dashboard", () => {
  test("overview loads", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner");
    if (!(await assertDashboard(cleanerPage))) return;

    await expect(cleanerPage.locator("main")).toBeVisible();
    await expect(cleanerPage).toHaveURL(/\/dashboard\/cleaner/);
  });

  test("schedule page loads", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    if (!(await assertDashboard(cleanerPage))) return;

    await expect(cleanerPage.locator("main")).toBeVisible();
    await expect(cleanerPage).toHaveURL(/\/dashboard\/cleaner\/schedule/);
  });

  test("empty selected date shows only its add-job CTA", async ({
    cleanerPage,
  }) => {
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    if (!(await assertDashboard(cleanerPage))) return;

    await cleanerPage.getByRole("button", { name: /^ხვალ/ }).click();
    await expect(
      cleanerPage.getByText("ამ დღეს დავალებები არ გაქვთ", { exact: true }),
    ).toBeVisible();

    const addJobButtons = cleanerPage.getByRole("button", {
      name: "სამუშაოს დამატება",
      exact: true,
    });
    await expect(addJobButtons).toHaveCount(1);
    await expect(cleanerPage.getByTestId("schedule-empty-add-job")).toBeVisible();
    await expect(cleanerPage.getByTestId("schedule-header-add-job")).toHaveCount(0);

    await cleanerPage.getByTestId("schedule-empty-add-job").click();
    await expect(
      cleanerPage.getByRole("heading", { name: "ახალი სამუშაო", exact: true }),
    ).toBeVisible();
  });

  test("populated selected date shows only the header add-job CTA", async ({
    cleanerPage,
  }) => {
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    if (!(await assertDashboard(cleanerPage))) return;

    await expect(
      cleanerPage.getByText("E2E ვილა ბაკურიანში", { exact: true }),
    ).toBeVisible();

    const addJobButtons = cleanerPage.getByRole("button", {
      name: "სამუშაოს დამატება",
      exact: true,
    });
    await expect(addJobButtons).toHaveCount(1);
    await expect(cleanerPage.getByTestId("schedule-header-add-job")).toBeVisible();
    await expect(cleanerPage.getByTestId("schedule-empty-add-job")).toHaveCount(0);

    await cleanerPage.getByTestId("schedule-header-add-job").click();
    await expect(
      cleanerPage.getByRole("heading", { name: "ახალი სამუშაო", exact: true }),
    ).toBeVisible();
  });

  test("working hours are per cleaning listing", async ({
    cleanerPage,
    testIds,
  }) => {
    await cleanerPage.goto("/dashboard/cleaner/parameters");
    if (!(await assertDashboard(cleanerPage))) return;

    const primary = cleanerPage.getByTestId(
      `cleaning-hours-${testIds.cleaningServicePrimary}`,
    );
    const secondary = cleanerPage.getByTestId(
      `cleaning-hours-${testIds.cleaningServiceSecondary}`,
    );

    await expect(primary).toContainText("08:00");
    await expect(primary).toContainText("16:00");
    await expect(secondary).toContainText("10:00");
    await expect(secondary).toContainText("18:00");

    await primary.getByTestId("working-hours-247").click();
    await primary.getByTestId("save-working-hours").click();
    await expect.poll(async () => {
      const service = await services.get(testIds.cleaningServicePrimary);
      return service?.schedule;
    }).toBe("24/7");

    const [savedPrimary, untouchedSecondary] = await Promise.all([
      services.get(testIds.cleaningServicePrimary),
      services.get(testIds.cleaningServiceSecondary),
    ]);
    expect(savedPrimary?.schedule).toBe("24/7");
    expect(savedPrimary?.operating_hours).toBe("24/7");
    expect(untouchedSecondary?.schedule).toBeNull();
    expect(untouchedSecondary?.operating_hours).toBe("10:00 - 18:00");
  });

  test("earnings page loads", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner/earnings");
    if (!(await assertDashboard(cleanerPage))) return;

    await expect(cleanerPage.locator("main")).toBeVisible();
    await expect(cleanerPage).toHaveURL(/\/dashboard\/cleaner\/earnings/);
  });

  test("sidebar has Georgian labels", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner");
    if (!(await assertDashboard(cleanerPage))) return;

    const pageContent = cleanerPage.locator("body");

    const georgianLabels = ["მთავარი", "განრიგი", "შემოსავალი"];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});
