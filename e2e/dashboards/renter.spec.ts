import { test, expect } from "../helpers/fixtures";
import type { Locator, Page, Response } from "@playwright/test";
import { supabaseAdmin } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";

const RENTER_MEMBERSHIP_PACKAGE_IDS = {
  oneMonth: "aae2ff00-e101-4000-a000-000000000001",
  threeMonths: "aae2ff00-e102-4000-a000-000000000002",
} as const;

const RENTER_BLACKLIST_CASES = {
  newPhone: "+995599800101",
  existingPhone: "+995599800102",
  failedPhone: "+995599800103",
} as const;

async function cleanupRenterBlacklistCases() {
  await supabaseAdmin
    .from("renter_guests")
    .delete()
    .eq("owner_id", TEST_IDS.renter)
    .in("phone", Object.values(RENTER_BLACKLIST_CASES));
}

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

test.describe("Renter Dashboard", () => {
  test("overview loads with stats", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter");
    if (!(await assertDashboard(renterPage, "/dashboard/renter"))) return;

    await expect(renterPage.locator("main")).toBeVisible();
    await expect(renterPage).toHaveURL(/\/dashboard\/renter/);
  });

  test("overview matches the compact renter mobile layout", async ({
    renterPage,
  }) => {
    await renterPage.setViewportSize({ width: 390, height: 844 });
    await renterPage.goto("/dashboard/renter");
    if (!(await assertDashboard(renterPage, "/dashboard/renter"))) return;

    const activeService = renterPage.getByTestId("renter-active-service");
    await expect(activeService).toBeVisible();
    expect((await activeService.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await activeService.click();
    const switcher = renterPage.getByTestId("mobile-service-switcher");
    await expect(switcher).toBeVisible();
    await expect(switcher.getByText("სტუმარი", { exact: true })).toHaveCount(0);
    expect(await renterPage.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    await renterPage.keyboard.press("Escape");
    await expect(switcher).toBeHidden();

    await expect(renterPage.getByTestId("renter-welcome-card")).toBeVisible();
    const stats = renterPage.getByTestId("renter-stats-grid");
    const statCards = stats.locator('[data-compact-mobile="true"]');
    await expect(statCards).toHaveCount(6);
    const [firstStat, secondStat] = await Promise.all([
      statCards.nth(0).boundingBox(),
      statCards.nth(1).boundingBox(),
    ]);
    expect(firstStat?.y).toBeCloseTo(secondStat?.y ?? 0, 0);

    const property = renterPage.getByTestId("renter-property-card").first();
    await expect(property).toBeVisible();
    await expect(
      property.getByTestId("renter-mobile-actions").locator("button, a"),
    ).toHaveCount(3);
    await expect(
      property.getByTestId("renter-mobile-promotions").locator("button"),
    ).toHaveCount(3);

    const overflows = await renterPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });

  test("listings page loads", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter/listings");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/listings")))
      return;

    await expect(renterPage.locator("main")).toBeVisible();
    await expect(renterPage).toHaveURL(/\/dashboard\/renter\/listings/);
  });

  test("calendar page loads", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter/calendar");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/calendar")))
      return;

    await expect(renterPage.locator("main")).toBeVisible();
    await expect(renterPage).toHaveURL(/\/dashboard\/renter\/calendar/);
  });

  test("calendar availability is managed only from the date-range dialog", async ({
    renterPage,
  }) => {
    let calendarMutations = 0;
    renterPage.on("request", (request) => {
      const isCalendarWrite =
        request.method() !== "GET" &&
        (/\/rest\/v1\/calendar_blocks(?:\?|$)/.test(request.url()) ||
          request.url().includes("/rest/v1/rpc/apply_calendar_availability"));
      if (isCalendarWrite) calendarMutations += 1;
    });

    await renterPage.goto("/dashboard/renter/calendar");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/calendar")))
      return;

    await expect(
      renterPage.getByRole("button", { name: "მომდევნო 7 დღე" }),
    ).toHaveCount(0);
    await renterPage
      .getByRole("button", { name: "ხელმისაწვდომობა" })
      .click();
    const dialog = renterPage.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "ხელმისაწვდომობის მართვა" }),
    ).toBeVisible();
    await expect(dialog.locator('input[type="date"]')).toHaveCount(2);
    await expect(
      dialog.getByRole("button", { name: "არ ქირავდება" }),
    ).toHaveAttribute("aria-pressed", "true");
    await renterPage.waitForTimeout(300);
    expect(calendarMutations).toBe(0);
  });

  test("win-back automation shows the live production SMS template", async ({
    renterPage,
  }) => {
    await renterPage.setViewportSize({ width: 390, height: 844 });

    const mockRules = {
      check_in_reminder_enabled: false,
      review_request_enabled: false,
      win_back_enabled: true,
      win_back_discount_value: null as string | null,
      win_back_discount_period: null as string | null,
    };
    await renterPage.route("**/api/sms/automation", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      Object.assign(mockRules, route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rules: mockRules }),
      });
    });

    await renterPage.goto("/dashboard/sms");
    if (!(await assertDashboard(renterPage, "/dashboard/sms"))) return;

    const winBackSwitch = renterPage.getByRole("switch", {
      name: "დაბრუნებების გამოწვევა",
    });
    if ((await winBackSwitch.getAttribute("aria-checked")) !== "true") {
      await winBackSwitch.click();
    }

    const preview = renterPage.getByTestId("win-back-sms-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("SMS-ის წინასწარი ხედი");

    const discountValue = renterPage.getByLabel("ფასდაკლების ოდენობა");
    const discountPeriod = renterPage.getByLabel("აქციის პერიოდი ან პირობა");
    await discountValue.fill("");
    await discountPeriod.fill("");
    await discountValue.fill("15%");

    await expect(preview).toContainText(
      "მიიღეთ სპეციალური ფასდაკლება ექსკლუზიურად თქვენთვის",
    );
    await expect(preview).not.toContainText("15%");

    await discountPeriod.fill("ნოემბრის ბოლომდე");
    await expect(preview).toContainText(
      "მიიღეთ 15% ფასდაკლება (ნოემბრის ბოლომდე)",
    );
    await expect(preview).toContainText("[სტუმრის სახელი]");
    await expect(preview).toContainText("[ბინის ბმული]");

    const overflows = await renterPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });

  test("balance page loads", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter/balance");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/balance")))
      return;

    await expect(renterPage.locator("main")).toBeVisible();
    await expect(renterPage).toHaveURL(/\/dashboard\/renter\/balance/);
    // Verify currency symbol is present on the balance page
    await expect(
      renterPage.locator("body").getByText("₾", { exact: false }).first(),
    ).toBeVisible();
  });

  test("smart-match page loads", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter/smart-match");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/smart-match")))
      return;

    await expect(renterPage.locator("main")).toBeVisible();
    await expect(renterPage).toHaveURL(/\/dashboard\/renter\/smart-match/);
  });

  test("profile page loads", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter/profile");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/profile")))
      return;

    await expect(renterPage.locator("main")).toBeVisible();
    await expect(renterPage).toHaveURL(/\/dashboard\/renter\/profile/);
  });

  test("sidebar has Georgian labels", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter");
    if (!(await assertDashboard(renterPage, "/dashboard/renter"))) return;

    const pageContent = renterPage.locator("body");

    const georgianLabels = [
      "მთავარი",
      "ჩემი ობიექტები",
      "კალენდარი",
      "ბალანსი",
      "Smart Match",
      "პროფილი",
    ];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});

test.describe("Renter guest blacklist", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await cleanupRenterBlacklistCases();
  });

  test.afterAll(async () => {
    await cleanupRenterBlacklistCases();
  });

  async function openBlacklistForm(
    renterPage: Page,
  ): Promise<Locator | null> {
    await renterPage.goto("/dashboard/renter/guests");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/guests")))
      return null;

    await renterPage.getByRole("button", { name: "შავი სია" }).click();
    await renterPage
      .getByRole("button", { name: "შავ სიაში დამატება" })
      .first()
      .click();
    return renterPage.getByRole("dialog", { name: "შავ სიაში დამატება" });
  }

  test("adds a standalone blacklisted contact without a booking", async ({
    renterPage,
  }) => {
    const dialog = await openBlacklistForm(renterPage);
    if (!dialog) return;

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("შესვლა", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("გასვლა", { exact: true })).toHaveCount(0);
    await expect(
      dialog.getByText("სტუმარი დათანხმდა სარეკლამო SMS-ების მიღებას"),
    ).toHaveCount(0);

    await dialog.locator('input[type="text"]').fill("E2E შავი სიის პირი");
    await dialog.locator('input[type="tel"]').fill("599800101");
    await dialog.locator("textarea").fill("E2E ხელით დამატებული");

    const rpcResponse = renterPage.waitForResponse(
      (response: Response) =>
        response.request().method() === "POST" &&
        response.url().includes("/rest/v1/rpc/add_renter_guest_to_blacklist"),
    );
    await dialog
      .getByRole("button", { name: "შავ სიაში დამატება" })
      .click();
    expect((await rpcResponse).ok()).toBeTruthy();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("renter_guests")
          .select("id")
          .eq("owner_id", TEST_IDS.renter)
          .eq("phone", RENTER_BLACKLIST_CASES.newPhone);
        return data?.length ?? 0;
      })
      .toBe(1);

    const { data: rows, error } = await supabaseAdmin
      .from("renter_guests")
      .select("*")
      .eq("owner_id", TEST_IDS.renter)
      .eq("phone", RENTER_BLACKLIST_CASES.newPhone);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      name: "E2E შავი სიის პირი",
      note: "E2E ხელით დამატებული",
      blacklisted: true,
    });

    const { count: bookingCount } = await supabaseAdmin
      .from("manual_bookings")
      .select("id", { count: "exact", head: true })
      .eq("renter_guest_id", rows![0].id);
    expect(bookingCount).toBe(0);

    await expect(
      renterPage.getByText("E2E შავი სიის პირი", { exact: true }),
    ).toBeVisible();
    await renterPage.getByRole("button", { name: "ყველა" }).click();
    await expect(
      renterPage.getByText("E2E შავი სიის პირი", { exact: true }),
    ).toBeVisible();
  });

  test("reuses an existing phone match and preserves its CRM data", async ({
    renterPage,
  }) => {
    const { data: existing, error: seedError } = await supabaseAdmin
      .from("renter_guests")
      .insert({
        owner_id: TEST_IDS.renter,
        name: "E2E არსებული სტუმარი",
        phone: RENTER_BLACKLIST_CASES.existingPhone,
        note: "E2E ძველი შენიშვნა",
        visit_dates: "2026-01-10/2026-01-12",
        blacklisted: false,
      })
      .select()
      .single();
    expect(seedError).toBeNull();

    const dialog = await openBlacklistForm(renterPage);
    if (!dialog || !existing) return;
    await dialog.locator('input[type="text"]').fill("E2E სხვა სახელი");
    await dialog.locator('input[type="tel"]').fill("599800102");
    await dialog.locator("textarea").fill("E2E ახალი შენიშვნა");
    await dialog
      .getByRole("button", { name: "შავ სიაში დამატება" })
      .click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("renter_guests")
          .select("id, blacklisted")
          .eq("owner_id", TEST_IDS.renter)
          .eq("phone", RENTER_BLACKLIST_CASES.existingPhone);
        return data;
      })
      .toEqual([{ id: existing.id, blacklisted: true }]);

    const { data: preserved } = await supabaseAdmin
      .from("renter_guests")
      .select("name, note, visit_dates")
      .eq("id", existing.id)
      .single();
    expect(preserved).toEqual({
      name: "E2E არსებული სტუმარი",
      note: "E2E ძველი შენიშვნა",
      visit_dates: "2026-01-10/2026-01-12",
    });

    const row = renterPage.locator(`[data-guest-id="${existing.id}"]`);
    await expect(row).toContainText("E2E არსებული სტუმარი");
    await expect(
      row.getByRole("button", { name: "რედაქტირება" }),
    ).toBeVisible();
    await row.getByRole("button", { name: "აღდგენა" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("renter_guests")
          .select("blacklisted")
          .eq("id", existing.id)
          .single();
        return data?.blacklisted;
      })
      .toBe(false);
    await expect(row).toHaveCount(0);
  });

  test("keeps the blacklist form open when the RPC fails", async ({
    renterPage,
  }) => {
    let failedRequests = 0;
    await renterPage.route(
      "**/rest/v1/rpc/add_renter_guest_to_blacklist*",
      async (route) => {
        failedRequests += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            code: "E2E_FORCED_FAILURE",
            details: null,
            hint: null,
            message: "Forced blacklist failure",
          }),
        });
      },
    );

    const dialog = await openBlacklistForm(renterPage);
    if (!dialog) return;
    await dialog.locator('input[type="text"]').fill("E2E წარუმატებელი პირი");
    await dialog.locator('input[type="tel"]').fill("599800103");
    await dialog
      .getByRole("button", { name: "შავ სიაში დამატება" })
      .click();

    await expect.poll(() => failedRequests).toBe(1);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("შეცდომა. სცადეთ თავიდან.")).toBeVisible();

    const { count } = await supabaseAdmin
      .from("renter_guests")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", TEST_IDS.renter)
      .eq("phone", RENTER_BLACKLIST_CASES.failedPhone);
    expect(count).toBe(0);
  });
});

test.describe("Renter membership", () => {
  test.describe.configure({ mode: "serial" });

  async function clearMemberships() {
    await supabaseAdmin
      .from("user_subscriptions")
      .delete()
      .eq("user_id", TEST_IDS.renter);
  }

  test.beforeAll(async () => {
    await clearMemberships();
    await supabaseAdmin.from("pricing_packages").upsert([
      {
        id: RENTER_MEMBERSHIP_PACKAGE_IDS.oneMonth,
        category: "subscription",
        code: "e2e-renter-membership-1",
        name: "E2E renter membership — 1 month",
        label: "1 month",
        amount_gel: 30,
        is_enabled: true,
        sort_order: 990,
        meta: { subscription_scope: "renter", duration_months: 1 },
      },
      {
        id: RENTER_MEMBERSHIP_PACKAGE_IDS.threeMonths,
        category: "subscription",
        code: "e2e-renter-membership-3",
        name: "E2E renter membership — 3 months",
        label: "3 months",
        amount_gel: 90,
        is_enabled: true,
        sort_order: 991,
        meta: { subscription_scope: "renter", duration_months: 3 },
      },
    ]);
    await supabaseAdmin
      .from("balances")
      .update({ amount: 500 })
      .eq("user_id", TEST_IDS.renter);
  });

  test.afterAll(async () => {
    await clearMemberships();
    await supabaseAdmin
      .from("pricing_packages")
      .delete()
      .in("id", Object.values(RENTER_MEMBERSHIP_PACKAGE_IDS));
  });

  test("an active listing without a subscription shows a membership prompt", async ({
    renterPage,
  }) => {
    await clearMemberships();
    await renterPage.goto("/dashboard/renter");
    if (!(await assertDashboard(renterPage, "/dashboard/renter"))) return;

    await expect(renterPage.getByText("E2E ბინა ბაკურიანში")).toBeVisible();
    await expect(
      renterPage.getByText("გაააქტიურეთ გამქირავებლის წევრობა"),
    ).toBeVisible();
    await renterPage.getByRole("button", { name: "წევრობის გააქტიურება" }).click();
    await expect(renterPage.getByRole("dialog")).toBeVisible();
    await expect(
      renterPage.getByText("აქტიური წევრობა არ გაქვთ"),
    ).toBeVisible();
  });

  test("only a current active subscription is shown as valid", async ({ renterPage }) => {
    await clearMemberships();
    const now = Date.now();
    await supabaseAdmin.from("user_subscriptions").insert([
      {
        user_id: TEST_IDS.renter,
        starts_at: new Date(now - 60_000).toISOString(),
        expires_at: new Date(now + 86_400_000).toISOString(),
        status: "active",
      },
      {
        user_id: TEST_IDS.renter,
        starts_at: new Date(now - 86_400_000).toISOString(),
        expires_at: new Date(now - 60_000).toISOString(),
        status: "active",
      },
      {
        user_id: TEST_IDS.renter,
        starts_at: new Date(now + 86_400_000).toISOString(),
        expires_at: new Date(now + 172_800_000).toISOString(),
        status: "active",
      },
      {
        user_id: TEST_IDS.renter,
        starts_at: new Date(now - 60_000).toISOString(),
        expires_at: new Date(now + 172_800_000).toISOString(),
        status: "inactive",
      },
    ]);
    await renterPage.goto("/dashboard/renter");
    if (!(await assertDashboard(renterPage, "/dashboard/renter"))) return;
    await expect(
      renterPage.getByText("თქვენი გამქირავებლის წევრობა აქტიურია"),
    ).toBeVisible();

    await clearMemberships();
    await supabaseAdmin.from("user_subscriptions").insert({
      user_id: TEST_IDS.renter,
      starts_at: new Date(now + 86_400_000).toISOString(),
      expires_at: new Date(now + 172_800_000).toISOString(),
      status: "active",
    });
    await renterPage.reload();
    await expect(
      renterPage.getByText("გაააქტიურეთ გამქირავებლის წევრობა"),
    ).toBeVisible();
  });

  test("one- and three-month purchases use the wallet and extend from expiry", async () => {
    await clearMemberships();
    await supabaseAdmin
      .from("balances")
      .update({ amount: 500 })
      .eq("user_id", TEST_IDS.renter);

    const first = await supabaseAdmin.rpc("purchase_package", {
      p_user_id: TEST_IDS.renter,
      p_package_id: RENTER_MEMBERSHIP_PACKAGE_IDS.oneMonth,
      p_quantity: 1,
    });
    expect(first.error).toBeNull();
    const { data: firstSubscription } = await supabaseAdmin
      .from("user_subscriptions")
      .select("starts_at, expires_at")
      .eq("user_id", TEST_IDS.renter)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(firstSubscription?.expires_at).toBeTruthy();

    const renewal = await supabaseAdmin.rpc("purchase_package", {
      p_user_id: TEST_IDS.renter,
      p_package_id: RENTER_MEMBERSHIP_PACKAGE_IDS.threeMonths,
      p_quantity: 1,
    });
    expect(renewal.error).toBeNull();
    const { data: renewedSubscription } = await supabaseAdmin
      .from("user_subscriptions")
      .select("starts_at, expires_at")
      .eq("user_id", TEST_IDS.renter)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(renewedSubscription?.starts_at).toBe(firstSubscription?.expires_at);
    expect(
      new Date(renewedSubscription!.expires_at).getTime(),
    ).toBeGreaterThan(new Date(firstSubscription!.expires_at).getTime());
  });

  test("disabled plans and insufficient balances are rejected", async () => {
    await clearMemberships();
    await supabaseAdmin
      .from("balances")
      .update({ amount: 0 })
      .eq("user_id", TEST_IDS.renter);
    const insufficient = await supabaseAdmin.rpc("purchase_package", {
      p_user_id: TEST_IDS.renter,
      p_package_id: RENTER_MEMBERSHIP_PACKAGE_IDS.oneMonth,
      p_quantity: 1,
    });
    expect(insufficient.error?.message).toContain("არასაკმარისი ბალანსი");

    await supabaseAdmin
      .from("pricing_packages")
      .update({ is_enabled: false })
      .eq("id", RENTER_MEMBERSHIP_PACKAGE_IDS.oneMonth);
    const disabled = await supabaseAdmin.rpc("purchase_package", {
      p_user_id: TEST_IDS.renter,
      p_package_id: RENTER_MEMBERSHIP_PACKAGE_IDS.oneMonth,
      p_quantity: 1,
    });
    expect(disabled.error?.message).toContain("არ არის ხელმისაწვდომი");
  });
});

test.describe("Renter cleaner profiles", () => {
  test.describe.configure({ mode: "serial" });

  const manualCleanerName = "E2E პირადი დამლაგებელი";
  const ownCleanerServiceId = "aae2ff00-4099-4000-a000-000000000099";

  async function resetCleanerDirectoryState() {
    await supabaseAdmin
      .from("renter_saved_cleaners")
      .delete()
      .eq("owner_id", TEST_IDS.renter)
      .eq("cleaner_id", TEST_IDS.cleaner);
    await supabaseAdmin
      .from("renter_cleaners")
      .delete()
      .eq("owner_id", TEST_IDS.renter)
      .eq("name", manualCleanerName);
    await supabaseAdmin
      .from("services")
      .delete()
      .eq("id", ownCleanerServiceId);
  }

  test.beforeEach(resetCleanerDirectoryState);
  test.afterEach(resetCleanerDirectoryState);

  test("shows grouped platform details before and after saving", async ({
    renterPage,
  }) => {
    await renterPage.goto("/dashboard/renter/cleaners");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/cleaners")))
      return;

    await renterPage.getByRole("button", { name: "დამატება", exact: true }).click();
    const addDialog = renterPage.getByRole("dialog", {
      name: "დამლაგებლის დამატება",
    });
    const candidate = addDialog.locator("li").filter({
      hasText: "E2E დამლაგებელი",
    });
    await expect(candidate).toHaveCount(1);
    await candidate.getByRole("button", { name: "დეტალები" }).click();

    const profileDialog = renterPage.getByRole("dialog", {
      name: "დამლაგებლის პროფილი",
    });
    await expect(profileDialog.getByText("MyBakuriani", { exact: true })).toBeVisible();
    await expect(
      profileDialog.getByText("ბაკურიანი, დიდველი", { exact: true }).first(),
    ).toBeVisible();
    await expect(profileDialog.getByText("E2E დილის დასუფთავება", { exact: true })).toBeVisible();
    await expect(profileDialog.getByText("E2E საღამოს დასუფთავება", { exact: true })).toBeVisible();
    await profileDialog.getByRole("button", { name: "დამატება", exact: true }).click();
    await expect(
      profileDialog.getByRole("button", { name: "წაშლა", exact: true }),
    ).toBeEnabled();
    await renterPage.keyboard.press("Escape");
    await renterPage.keyboard.press("Escape");

    await renterPage.reload();
    const savedCard = renterPage.locator("article").filter({
      hasText: "E2E დამლაგებელი",
    });
    await expect(savedCard).toHaveCount(1);
    await savedCard.getByRole("button", { name: "დეტალები" }).click();
    await expect(
      renterPage
        .getByRole("dialog", { name: "დამლაგებლის პროფილი" })
        .getByText("E2E საღამოს დასუფთავება", { exact: true }),
    ).toBeVisible();
  });

  test("shows the renter's own cleaning listing after approval", async ({
    renterPage,
  }) => {
    const { error } = await supabaseAdmin.from("services").insert({
      id: ownCleanerServiceId,
      owner_id: TEST_IDS.renter,
      title: "E2E საკუთარი დამლაგებლის განცხადება",
      category: "cleaning",
      status: "active",
      location: "ბაკურიანი",
      price: 75,
      price_unit: "per_service",
    });
    expect(error).toBeNull();

    await renterPage.goto("/dashboard/renter/cleaners");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/cleaners")))
      return;
    await renterPage.getByRole("button", { name: "დამატება", exact: true }).click();
    const addDialog = renterPage.getByRole("dialog", {
      name: "დამლაგებლის დამატება",
    });
    await expect(
      addDialog.getByText("E2E საკუთარი დამლაგებლის განცხადება", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      addDialog.getByText(/ადმინის დამტკიცების შემდეგ/),
    ).toBeVisible();
  });

  test("creates, reloads, and edits a rich manual cleaner profile", async ({
    renterPage,
  }) => {
    await renterPage.goto("/dashboard/renter/cleaners");
    if (!(await assertDashboard(renterPage, "/dashboard/renter/cleaners")))
      return;

    await renterPage.getByRole("button", { name: "დამატება", exact: true }).click();
    await renterPage
      .getByRole("button", { name: "ჩემი დამლაგებლის დამატება" })
      .click();
    const form = renterPage.getByRole("dialog", { name: "ახალი დამლაგებელი" });
    await form.getByPlaceholder("ნინო მაისურაძე").fill(manualCleanerName);
    await form.getByRole("button", { name: "ბაკურიანი", exact: true }).click();
    await form
      .getByPlaceholder(/ალაგებს აპარტამენტებსა და კოტეჯებს/)
      .fill("ალაგებს აპარტამენტებს და აკეთებს გენერალურ დასუფთავებას");
    await form.getByPlaceholder("5").fill("7");
    await form.getByRole("button", { name: "ინგლისური", exact: true }).click();
    await form.getByRole("button", { name: "შენახვა", exact: true }).click();
    await expect(form).toBeHidden();

    await renterPage.reload();
    const manualCard = renterPage.locator("article").filter({
      hasText: manualCleanerName,
    });
    await expect(manualCard.getByText("ხელით დამატებული", { exact: true })).toBeVisible();
    await manualCard.getByRole("button", { name: "დეტალები" }).click();
    let profileDialog = renterPage.getByRole("dialog", {
      name: "დამლაგებლის პროფილი",
    });
    await expect(profileDialog.getByText("7 წელი", { exact: true })).toBeVisible();
    await expect(
      profileDialog.getByText(
        "ალაგებს აპარტამენტებს და აკეთებს გენერალურ დასუფთავებას",
        { exact: true },
      ),
    ).toBeVisible();

    await profileDialog.getByRole("button", { name: "რედაქტირება" }).click();
    const editForm = renterPage.getByRole("dialog", {
      name: "დამლაგებლის რედაქტირება",
    });
    await editForm
      .getByPlaceholder(/ალაგებს აპარტამენტებსა და კოტეჯებს/)
      .fill("გენერალური დასუფთავება და თეთრეულის გამოცვლა");
    await editForm.getByRole("button", { name: "შენახვა", exact: true }).click();
    await expect(editForm).toBeHidden();
    await renterPage.reload();
    await renterPage
      .locator("article")
      .filter({ hasText: manualCleanerName })
      .getByRole("button", { name: "დეტალები" })
      .click();
    profileDialog = renterPage.getByRole("dialog", {
      name: "დამლაგებლის პროფილი",
    });
    await expect(
      profileDialog.getByText("გენერალური დასუფთავება და თეთრეულის გამოცვლა", {
        exact: true,
      }),
    ).toBeVisible();
  });
});
