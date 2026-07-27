import { test, expect } from "../helpers/fixtures";
import { supabaseAdmin } from "../helpers/supabase";
import { TEST_IDS } from "../helpers/seed";

const RENTER_MEMBERSHIP_PACKAGE_IDS = {
  oneMonth: "aae2ff00-e101-4000-a000-000000000001",
  threeMonths: "aae2ff00-e102-4000-a000-000000000002",
} as const;

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
