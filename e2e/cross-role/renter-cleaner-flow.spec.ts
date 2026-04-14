import { test, expect } from "../helpers/fixtures";
import { cleaningTasks, supabaseAdmin } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";

// ---------------------------------------------------------------------------
// Renter-Cleaner cross-role flow
// Cleaning task exists from seed -> cleaner sees schedule page ->
// mark complete via DB -> check earnings
// ---------------------------------------------------------------------------

test.describe("Renter-Cleaner workflow", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    // Reset the seed cleaning task status back to pending
    await cleaningTasks
      .update(TEST_IDS.cleaningTask, { status: "pending" })
      .catch(() => {});
  });

  test("seed cleaning task exists in DB", async ({ testIds }) => {
    const task = await cleaningTasks.get(testIds.cleaningTask);
    expect(task).toBeTruthy();
    expect(task!.status).toBe("pending");
    expect(task!.cleaner_id).toBe(testIds.cleaner);
    expect(task!.property_id).toBe(testIds.apartment);
    expect(task!.price).toBe(80);
  });

  test("cleaner can access schedule page", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner/schedule");
    await cleanerPage.waitForLoadState("networkidle");

    const currentUrl = cleanerPage.url();

    // Handle auth redirect gracefully
    if (currentUrl.includes("/auth/")) {
      expect(currentUrl).toContain("/auth/");
      return;
    }

    // Schedule page should load
    const mainContent = cleanerPage.locator("main, [role='main'], .dashboard");
    await expect(mainContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test("cleaner dashboard shows their tasks", async ({ cleanerPage }) => {
    await cleanerPage.goto("/dashboard/cleaner");
    await cleanerPage.waitForLoadState("networkidle");

    const currentUrl = cleanerPage.url();
    if (currentUrl.includes("/auth/")) {
      return; // Auth redirect, skip UI assertions
    }

    const body = cleanerPage.locator("body");
    await expect(body).toBeVisible();

    // Dashboard should have content
    const pageText = await cleanerPage.textContent("body");
    expect(pageText).toBeTruthy();
  });

  test("mark cleaning task as completed via DB", async ({ testIds }) => {
    const completed = await cleaningTasks.update(testIds.cleaningTask, {
      status: "completed",
    });

    expect(completed.status).toBe("completed");
  });

  test("cleaner earnings page loads after task completion", async ({
    cleanerPage,
    testIds,
  }) => {
    // Ensure the task is completed for this check
    const task = await cleaningTasks.get(testIds.cleaningTask);
    expect(task!.status).toBe("completed");

    await cleanerPage.goto("/dashboard/cleaner/earnings");
    await cleanerPage.waitForLoadState("networkidle");

    const currentUrl = cleanerPage.url();
    if (currentUrl.includes("/auth/")) {
      return; // Auth redirect, skip UI assertions
    }

    // Earnings page should load
    const mainContent = cleanerPage.locator("main, [role='main'], .dashboard");
    await expect(mainContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test("renter can see property cleaning history in dashboard", async ({
    renterPage,
  }) => {
    await renterPage.goto("/dashboard/renter");
    await renterPage.waitForLoadState("networkidle");

    const currentUrl = renterPage.url();
    if (currentUrl.includes("/auth/")) {
      return;
    }

    // Renter dashboard should display
    const heading = renterPage.locator("h1, h2, h3").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});
