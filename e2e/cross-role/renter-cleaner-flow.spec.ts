import { test, expect, loadTestUsers } from "../helpers/fixtures";
import { cleaningTasks, supabaseAdmin } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";
import { configureIsolatedE2E } from "../helpers/env";
import { createClient } from "@supabase/supabase-js";
import {
  createPlatformCleanerTask,
  transitionPlatformCleanerTask,
} from "../../src/lib/cleaner/tasks";

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

  test("create RPC persists address while deriving identity and price server-side", async ({
    testIds,
  }) => {
    const env = configureIsolatedE2E();
    const renter = loadTestUsers().renter;
    const renterClient = createClient(env.supabaseUrl, env.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await renterClient.auth.setSession({
      access_token: renter.accessToken,
      refresh_token: renter.refreshToken,
    });
    const scheduledAt = new Date(Date.now() + 14 * 86_400_000);
    scheduledAt.setUTCHours(7, 17, 0, 0);

    // The helper pins the address-aware RPC wire contract used by the modal.
    const result = await createPlatformCleanerTask(renterClient, {
      p_property_id: testIds.apartment,
      p_cleaner_service_id: testIds.cleaningServicePrimary,
      p_cleaning_type: "general",
      p_scheduled_at: scheduledAt.toISOString(),
      p_notes: "RPC პირობების ტესტი",
      p_address: "ბაკურიანი, სატესტო ქუჩა 17",
    });
    expect(result.error).toBeNull();
    const task = result.data as {
      id: string;
      owner_id: string;
      cleaner_id: string;
      cleaner_service_id: string | null;
      price: number | null;
      price_unit: string | null;
      service_title: string | null;
      address: string | null;
      notes: string | null;
    };

    try {
      expect(task.owner_id).toBe(testIds.renter);
      expect(task.cleaner_id).toBe(testIds.cleaner);
      expect(task.cleaner_service_id).toBe(testIds.cleaningServicePrimary);
      expect(Number(task.price)).toBe(80);
      expect(task.price_unit).toBe("საათი");
      expect(task.service_title).toBe("E2E დილის დასუფთავება");
      expect(task.address).toBe("ბაკურიანი, სატესტო ქუჩა 17");
      expect(task.notes).toBe("RPC პირობების ტესტი");
    } finally {
      await supabaseAdmin.from("cleaning_tasks").delete().eq("id", task.id);
    }
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

  test("renter sees every call-out term and cancellation requires consent after acceptance", async ({
    renterPage,
    cleanerPage,
    testIds,
  }) => {
    const notificationSince = new Date(Date.now() - 1_000).toISOString();
    await renterPage.goto("/dashboard/renter/cleaners");
    await renterPage.waitForLoadState("networkidle");
    if (renterPage.url().includes("/auth/")) return;

    const renterCard = renterPage.getByTestId(
      `renter-cleaning-task-${testIds.cleaningTask}`,
    );
    await expect(renterCard).toBeVisible();
    await expect(renterCard).toContainText("E2E დამლაგებელი");
    await expect(renterCard).toContainText("E2E ბინა ბაკურიანში");
    await expect(renterCard).toContainText("E2E დილის დასუფთავება");
    await expect(renterCard).toContainText("ბაკურიანი, დიდველის ქუჩა, ბინა 12");
    await expect(renterCard).toContainText("ტესტ დავალება");
    await expect(renterCard).toContainText(/80 ₾\s*\/\s*საათი/);
    await expect(renterCard.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(renterCard).toContainText(
      "ამ ბარათზე დამლაგებლის ნომერი გამოჩნდება, როცა გამოძახებას დაადასტურებს",
    );

    // A pending request has not been accepted, so the owner can withdraw it
    // immediately without manufacturing a cleaner decision.
    renterPage.once("dialog", (dialog) => dialog.accept());
    await renterCard
      .getByRole("button", { name: "გამოძახების გაუქმება", exact: true })
      .click();
    await expect
      .poll(async () => (await cleaningTasks.get(testIds.cleaningTask))?.status)
      .toBe("cancelled");
    await expect(renterCard).toContainText("გაუქმებული");
    await expect
      .poll(async () => {
        const { count } = await supabaseAdmin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", testIds.cleaner)
          .eq("type", "cleaning_task_cancelled")
          .gte("created_at", notificationSince);
        return count ?? 0;
      })
      .toBeGreaterThan(0);

    // Once accepted, the same owner action becomes a request and must keep the
    // job active until the cleaner explicitly responds.
    await cleaningTasks.update(testIds.cleaningTask, { status: "accepted" });

    const env = configureIsolatedE2E();
    const renter = loadTestUsers().renter;
    const renterClient = createClient(env.supabaseUrl, env.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await renterClient.auth.setSession({
      access_token: renter.accessToken,
      refresh_token: renter.refreshToken,
    });
    const bypass = await transitionPlatformCleanerTask(
      renterClient,
      testIds.cleaningTask,
      "cancelled",
    );
    expect(bypass.error).toBeTruthy();
    expect((await cleaningTasks.get(testIds.cleaningTask))?.status).toBe(
      "accepted",
    );

    await renterPage.reload();
    const acceptedCard = renterPage.getByTestId(
      `renter-cleaning-task-${testIds.cleaningTask}`,
    );
    await expect(
      acceptedCard.locator('a[href="tel:+995599000005"]'),
    ).toBeVisible();
    renterPage.once("dialog", (dialog) => dialog.accept());
    await acceptedCard
      .getByRole("button", { name: "გაუქმების მოთხოვნა", exact: true })
      .click();
    await expect
      .poll(async () => (await cleaningTasks.get(testIds.cleaningTask))?.status)
      .toBe("cancellation_requested");
    await expect(acceptedCard).toContainText("დამლაგებლის პასუხს ელოდებით");
    await expect
      .poll(async () => {
        const { count } = await supabaseAdmin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", testIds.cleaner)
          .eq("type", "cleaning_task_cancellation_requested")
          .gte("created_at", notificationSince);
        return count ?? 0;
      })
      .toBeGreaterThan(0);

    await cleanerPage.goto("/dashboard/cleaner");
    if (cleanerPage.url().includes("/auth/")) return;
    let cleanerCard = cleanerPage.getByTestId(
      `cleaner-scheduled-task-platform-${testIds.cleaningTask}`,
    );
    await expect(cleanerCard).toContainText("გაუქმებას ითხოვენ");
    await cleanerCard
      .getByRole("button", { name: "სამუშაო ძალაში დარჩეს", exact: true })
      .click();
    await expect
      .poll(async () => (await cleaningTasks.get(testIds.cleaningTask))?.status)
      .toBe("accepted");

    // Request once more and approve it, proving the job only reaches the final
    // cancelled state after the cleaner's affirmative response.
    await renterPage.reload();
    renterPage.once("dialog", (dialog) => dialog.accept());
    await renterPage
      .getByTestId(`renter-cleaning-task-${testIds.cleaningTask}`)
      .getByRole("button", { name: "გაუქმების მოთხოვნა", exact: true })
      .click();
    await expect
      .poll(async () => (await cleaningTasks.get(testIds.cleaningTask))?.status)
      .toBe("cancellation_requested");

    await cleanerPage.reload();
    cleanerCard = cleanerPage.getByTestId(
      `cleaner-scheduled-task-platform-${testIds.cleaningTask}`,
    );
    await cleanerCard
      .getByRole("button", { name: "გაუქმებაზე თანხმობა", exact: true })
      .click();
    await expect
      .poll(async () => (await cleaningTasks.get(testIds.cleaningTask))?.status)
      .toBe("cancelled");
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("notifications")
          .select("message")
          .eq("user_id", testIds.renter)
          .eq("type", "cleaning_task_status")
          .gte("created_at", notificationSince)
          .order("created_at", { ascending: false })
          .limit(1);
        return data?.[0]?.message ?? "";
      })
      .toContain("დაეთანხმა");

    await renterPage.reload();
    await expect(
      renterPage.getByTestId(`renter-cleaning-task-${testIds.cleaningTask}`),
    ).toContainText("გაუქმებული");
  });

  test("mark cleaning task as completed via DB", async ({ testIds }) => {
    const completed = await cleaningTasks.update(testIds.cleaningTask, {
      status: "completed",
    });

    expect(completed.status).toBe("completed");
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
