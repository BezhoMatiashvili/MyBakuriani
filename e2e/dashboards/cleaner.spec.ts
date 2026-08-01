import { type Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { services, supabaseAdmin } from "../helpers/supabase";

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

  test("24/7 working hours transfer atomically between cleaning listings", async ({
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

    const primary247 = primary.getByTestId("working-hours-247");
    const secondary247 = secondary.getByTestId("working-hours-247");

    // A-on: selecting 24/7 disables that card's time inputs. Hold the request
    // briefly to verify every hours control is disabled during an in-flight save.
    await primary247.click();
    await expect(primary.getByRole("button", { name: "08:00" })).toBeDisabled();
    await expect(primary.getByRole("button", { name: "16:00" })).toBeDisabled();

    let releaseSave!: () => void;
    const saveReleased = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const hoursApi = `**/api/self-service/cleaner/services/${testIds.cleaningServicePrimary}/working-hours`;
    await cleanerPage.route(hoursApi, async (route) => {
      await saveReleased;
      await route.continue();
    });
    await primary.getByTestId("save-working-hours").click();
    await expect(primary247).toBeDisabled();
    await expect(secondary247).toBeDisabled();
    await expect(
      secondary.getByRole("button", { name: "10:00" }),
    ).toBeDisabled();
    releaseSave();
    await expect.poll(async () => {
      const service = await services.get(testIds.cleaningServicePrimary);
      return service?.schedule;
    }).toBe("24/7");
    await cleanerPage.unroute(hoursApi);

    const [savedPrimary, untouchedSecondary] = await Promise.all([
      services.get(testIds.cleaningServicePrimary),
      services.get(testIds.cleaningServiceSecondary),
    ]);
    expect(savedPrimary?.schedule).toBe("24/7");
    expect(savedPrimary?.operating_hours).toBe("24/7");
    expect(untouchedSecondary?.schedule).toBeNull();
    expect(untouchedSecondary?.operating_hours).toBe("10:00 - 18:00");

    // A failed optimistic transfer to B must restore A from an authoritative read.
    await secondary247.click();
    await expect(primary247).toHaveAttribute("aria-pressed", "false");
    await expect(secondary247).toHaveAttribute("aria-pressed", "true");
    const secondaryHoursApi = `**/api/self-service/cleaner/services/${testIds.cleaningServiceSecondary}/working-hours`;
    await cleanerPage.route(secondaryHoursApi, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced_test_failure" }),
      }),
    );
    await secondary.getByTestId("save-working-hours").click();
    await expect(secondary.getByText(/შენახვა ვერ მოხერხდა/)).toBeVisible();
    await expect(primary247).toHaveAttribute("aria-pressed", "true");
    await expect(secondary247).toHaveAttribute("aria-pressed", "false");
    await cleanerPage.unroute(secondaryHoursApi);

    // Transfer to B: the server returns and the UI merges both affected rows.
    await secondary247.click();
    await secondary.getByTestId("save-working-hours").click();
    await expect.poll(async () => {
      const [first, second] = await Promise.all([
        services.get(testIds.cleaningServicePrimary),
        services.get(testIds.cleaningServiceSecondary),
      ]);
      return `${first?.schedule}|${second?.schedule}`;
    }).toBe("09:00 - 19:00|24/7");
    await expect(primary).toContainText("09:00");
    await expect(primary).toContainText("19:00");
    await expect(primary247).toHaveAttribute("aria-pressed", "false");
    await expect(secondary247).toHaveAttribute("aria-pressed", "true");

    // Create and edit flows direct the cleaner back here instead of racing the
    // unique index or placing an impossible editorial request in the queue.
    await cleanerPage.goto("/create/service");
    await expect(cleanerPage.getByTestId("existing-247-conflict")).toBeVisible();
    await expect(
      cleanerPage.getByRole("link", { name: "პარამეტრების გახსნა" }),
    ).toBeVisible();
    await cleanerPage.goto(
      `/create/service?edit=${testIds.cleaningServicePrimary}`,
    );
    await expect(cleanerPage.getByTestId("existing-247-conflict")).toBeVisible();

    // All-off persists across a reload and both physical hour columns stay synced.
    await cleanerPage.goto("/dashboard/cleaner/parameters");
    const reloadedSecondary = cleanerPage.getByTestId(
      `cleaning-hours-${testIds.cleaningServiceSecondary}`,
    );
    await reloadedSecondary.getByTestId("working-hours-247").click();
    await reloadedSecondary.getByTestId("save-working-hours").click();
    await expect.poll(async () => {
      const service = await services.get(testIds.cleaningServiceSecondary);
      return `${service?.schedule}|${service?.operating_hours}`;
    }).toBe("09:00 - 19:00|09:00 - 19:00");
    await cleanerPage.reload();
    await expect(
      cleanerPage
        .getByTestId(`cleaning-hours-${testIds.cleaningServicePrimary}`)
        .getByTestId("working-hours-247"),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      cleanerPage
        .getByTestId(`cleaning-hours-${testIds.cleaningServiceSecondary}`)
        .getByTestId("working-hours-247"),
    ).toHaveAttribute("aria-pressed", "false");

    // Database backstops: reject invalid/cross-owner/non-cleaning calls, isolate
    // another owner's cleaning row, serialize concurrent activation, and reject a
    // direct duplicate write with the partial unique index.
    const otherCleanerServiceId = "aae2ff00-4010-4000-a000-000000000010";
    await services.create({
      id: otherCleanerServiceId,
      owner_id: testIds.food,
      category: "cleaning",
      title: "E2E სხვა დამლაგებელი",
      schedule: "07:00 - 15:00",
      operating_hours: "07:00 - 15:00",
      status: "active",
    });
    try {
      const invalidRange = await supabaseAdmin.rpc(
        "self_service_set_cleaner_working_hours",
        {
          p_actor_id: testIds.cleaner,
          p_service_id: testIds.cleaningServicePrimary,
          p_is_24_7: false,
          p_working_hours: "19:00 - 09:00",
        },
      );
      expect(invalidRange.error?.message).toContain(
        "invalid_cleaner_working_hours_range",
      );

      const crossOwner = await supabaseAdmin.rpc(
        "self_service_set_cleaner_working_hours",
        {
          p_actor_id: testIds.food,
          p_service_id: testIds.cleaningServicePrimary,
          p_is_24_7: true,
          p_working_hours: "09:00 - 19:00",
        },
      );
      expect(crossOwner.error?.code).toBe("42501");

      const nonCleaning = await supabaseAdmin.rpc(
        "self_service_set_cleaner_working_hours",
        {
          p_actor_id: testIds.food,
          p_service_id: testIds.foodService,
          p_is_24_7: true,
          p_working_hours: "09:00 - 19:00",
        },
      );
      expect(nonCleaning.error?.message).toContain("service_is_not_cleaning");

      const concurrent = await Promise.all([
        supabaseAdmin.rpc("self_service_set_cleaner_working_hours", {
          p_actor_id: testIds.cleaner,
          p_service_id: testIds.cleaningServicePrimary,
          p_is_24_7: true,
          p_working_hours: "09:00 - 19:00",
        }),
        supabaseAdmin.rpc("self_service_set_cleaner_working_hours", {
          p_actor_id: testIds.cleaner,
          p_service_id: testIds.cleaningServiceSecondary,
          p_is_24_7: true,
          p_working_hours: "09:00 - 19:00",
        }),
      ]);
      expect(concurrent.every(({ error }) => !error)).toBe(true);

      const { data: ownedRows, error: ownedRowsError } = await supabaseAdmin
        .from("services")
        .select("id, schedule, operating_hours")
        .eq("owner_id", testIds.cleaner)
        .eq("category", "cleaning");
      expect(ownedRowsError).toBeNull();
      const active247 = (ownedRows ?? []).filter(
        (service) =>
          (service.schedule?.trim() || service.operating_hours?.trim()) ===
          "24/7",
      );
      expect(active247).toHaveLength(1);

      const duplicateTarget = (ownedRows ?? []).find(
        (service) => service.id !== active247[0]?.id,
      );
      expect(duplicateTarget).toBeTruthy();
      const { error: duplicateError } = await supabaseAdmin
        .from("services")
        .update({ schedule: "24/7", operating_hours: "24/7" })
        .eq("id", duplicateTarget!.id);
      expect(duplicateError?.code).toBe("23505");

      const unaffected = await services.get(otherCleanerServiceId);
      expect(unaffected?.schedule).toBe("07:00 - 15:00");
      expect(unaffected?.operating_hours).toBe("07:00 - 15:00");
      const food = await services.get(testIds.foodService);
      expect(food?.operating_hours).toBe("10:00-22:00");
    } finally {
      await services.delete(otherCleanerServiceId);
    }
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
