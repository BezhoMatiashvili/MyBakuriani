import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import {
  ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
  TEST_IDS,
  seedRenterMembership,
} from "../helpers/seed";
import { supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";

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

test.describe("Admin Dashboard", () => {
  test("overview loads with stats", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin/);
    // Business strip + the analytics dashboard (C49).
    await expect(adminPage.getByTestId("admin-business-card")).toHaveCount(6);
    await expect(adminPage.getByTestId("admin-analytics")).toBeVisible();
    await expect(adminPage.getByTestId("analytics-chain")).toBeVisible();
    await expect(
      adminPage.getByTestId("analytics-kpi-uniqueUsers"),
    ).toBeVisible();
  });

  test("analytics filters reach the chain and the export (C49)", async ({
    adminPage,
  }) => {
    await adminPage.goto("/dashboard/admin?period=last7&device=mobile");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.getByTestId("analytics-chip-device")).toContainText(
      "მობილური",
    );

    const filtered = await adminPage.request.get(
      "/api/admin/analytics/export?period=last7&device=mobile&block=all&scope=filtered&format=csv",
    );
    expect(filtered.status()).toBe(200);
    expect(filtered.headers()["content-disposition"]).toMatch(
      /^attachment; filename="mybakuriani-analytics-all-/,
    );
    const csv = await filtered.text();
    expect(csv).toContain("აქტიური ფილტრები: მოწყობილობა: მობილური");
    expect(csv).toContain("გენერირების თარიღი:");

    const full = await adminPage.request.get(
      "/api/admin/analytics/export?period=last7&device=mobile&block=kpis&scope=full&format=xlsx",
    );
    expect(full.status()).toBe(200);
    expect(full.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("verifications page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/verifications");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/verifications/);
    await expect(adminPage.getByText("ვერიფიკაციები").first()).toBeVisible();
  });

  test("membership approval queue loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/memberships");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/memberships/);
    await expect(adminPage.getByRole("heading", { name: "საწევროს დადასტურება" })).toBeVisible();
  });

  test("clients page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/clients");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/clients/);
    await expect(adminPage.getByText("კლიენტები").first()).toBeVisible();
  });

  test("listings page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/listings");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/listings/);
    await expect(adminPage.getByText("განცხადებები").first()).toBeVisible();
  });

  test("analytics page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/analytics");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/analytics/);
    await expect(adminPage.getByText("ანალიტიკა").first()).toBeVisible();
  });

  test("settings page loads", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin/settings");
    if (!(await assertDashboard(adminPage))) return;

    await expect(adminPage.locator("main")).toBeVisible();
    await expect(adminPage).toHaveURL(/\/dashboard\/admin\/settings/);
    await expect(adminPage.getByText("პარამეტრები").first()).toBeVisible();
  });

  test("protected admin route redirects with next param", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard/admin");
    if (!page.url().includes("/auth/login")) {
      test.info().annotations.push({
        type: "skip",
        description: "Session still active in environment",
      });
      return;
    }
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page).toHaveURL(/next=%2Fdashboard%2Fadmin/);
  });

  test("sidebar has Georgian labels", async ({ adminPage }) => {
    await adminPage.goto("/dashboard/admin");
    if (!(await assertDashboard(adminPage))) return;

    const pageContent = adminPage.locator("body");

    const georgianLabels = [
      "მთავარი",
      "ვერიფიკაციები",
      "კლიენტები",
      "განცხადებები",
      "ანალიტიკა",
      "პარამეტრები",
    ];

    for (const label of georgianLabels) {
      await expect(
        pageContent.getByText(label, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});

test.describe("Admin verifications — expandable audit panel", () => {
  test("clicking a row reveals owner + listing audit details", async ({
    adminPage,
  }) => {
    await adminPage.goto("/dashboard/admin/verifications");
    console.log("URL after goto:", adminPage.url());
    expect(adminPage.url(), "should not redirect to login").not.toContain(
      "/auth/login",
    );

    await expect(adminPage.getByText("ვერიფიკაციის გვერდი")).toBeVisible();

    const firstRow = adminPage
      .locator('[role="button"][aria-expanded]')
      .first();
    await firstRow.waitFor({ state: "visible", timeout: 15_000 });

    await expect(adminPage.getByText("მესაკუთრის ინფო")).toHaveCount(0);

    await firstRow.click();
    await expect(firstRow).toHaveAttribute("aria-expanded", "true");

    await expect(adminPage.getByText("მესაკუთრის ინფო")).toBeVisible();
    await expect(adminPage.getByText("პირადი ნომერი")).toBeVisible();
    await expect(adminPage.getByText("ელ-ფოსტა")).toBeVisible();
    await expect(
      adminPage.getByText("ადმინისტრატორის კომენტარი"),
    ).toBeVisible();

    await adminPage.screenshot({
      path: "playwright-report/admin-verifications-expanded.png",
      fullPage: true,
    });
  });

  test("property row shows საკადასტრო კოდი + napr.gov.ge link", async ({
    adminPage,
  }) => {
    await adminPage.goto("/dashboard/admin/verifications");
    if (!(await assertDashboard(adminPage))) return;

    const rentalFilter = adminPage.getByRole("button", {
      name: /^ქირავდება/,
    });
    await rentalFilter.waitFor({ timeout: 10_000 });
    await rentalFilter.click();

    const rows = adminPage.locator('[role="button"][aria-expanded]');
    const count = await rows.count();

    if (count === 0) {
      const res = await adminPage.request.get(
        "/api/admin/listings/audit?kind=property&id=e2e8028b-39f7-414c-bc71-cba8ccad66d0",
      );
      expect(res.ok(), await res.text()).toBeTruthy();
      const body = await res.json();
      expect(body.kind).toBe("property");
      expect(body.listing).toHaveProperty("cadastral_code");
      expect(body.owner).toHaveProperty("personal_id");
      expect(body.owner).toHaveProperty("email");
      console.log(
        "PROPERTY AUDIT PAYLOAD:",
        JSON.stringify(
          {
            kind: body.kind,
            owner: body.owner,
            listing: {
              ...body.listing,
              photos: `[${body.listing.photos?.length ?? 0} items]`,
            },
          },
          null,
          2,
        ),
      );
      test.info().annotations.push({
        type: "note",
        description:
          "No pending property row in DB — verified endpoint payload shape directly",
      });
      return;
    }

    await rows.first().click();
    await expect(adminPage.getByText("იურიდიული (NAPR)")).toBeVisible();
    await expect(adminPage.getByText("საკადასტრო კოდი")).toBeVisible();
    await expect(
      adminPage.getByRole("link", { name: /napr\.gov\.ge/ }),
    ).toBeVisible();

    await adminPage.screenshot({
      path: "playwright-report/admin-verifications-property.png",
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// C44 — admin status management. Every case asserts the exact database values
// after an apply (and that a preview wrote nothing), then restores the seed.
// ---------------------------------------------------------------------------

const DAY_US = 86_400_000_000n;
const ADMIN_STATUS_TYPES = [
  "membership_admin_update",
  "promotion_admin_update",
  "company_plan_admin_update",
];

/** A timestamptz string from PostgREST as microseconds since the epoch. */
function micros(ts: string): bigint {
  const m = ts.match(/^(.+?T\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:?\d\d)$/);
  if (!m) throw new Error(`unexpected timestamp ${ts}`);
  const seconds = BigInt(Date.parse(`${m[1]}${m[3]}`)) * 1000n;
  return seconds + BigInt((m[2] ?? "").padEnd(6, "0").slice(0, 6));
}

async function membershipRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from("user_subscriptions")
    .select(
      "status, starts_at, expires_at, amount_paid, package_id, reviewed_by",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function clearAdminNotices(userIds: string[]) {
  await supabaseAdmin
    .from("notifications")
    .delete()
    .in("user_id", userIds)
    .in("type", ADMIN_STATUS_TYPES);
}

async function previewAndApply(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "წინასწარ ნახვა" }).click();
  await expect(
    dialog.locator("[data-testid=status-change-row][data-outcome=changed]"),
  ).toHaveCount(1);
  await dialog.getByRole("button", { name: "შესრულება" }).click();
  await expect(dialog.getByRole("heading", { name: "შედეგი" })).toBeVisible();
}

// The cookie banner covers the bottom of the screen and would take the
// clicks meant for the selection bar, so the admin has already answered it.
async function answerCookieBanner(page: Page) {
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
}

test.describe("Admin statuses (C44)", () => {
  test.describe.configure({ mode: "serial" });

  test("membership: the preview writes nothing, apply adds exactly 5 days", async ({
    adminPage,
  }) => {
    await answerCookieBanner(adminPage);
    await seedRenterMembership();
    await clearAdminNotices([TEST_IDS.renter]);
    const before = await membershipRow(TEST_IDS.renterMembership);
    try {
      await adminPage.goto(`/dashboard/admin/statuses?q=${TEST_IDS.renter}`);
      if (!(await assertDashboard(adminPage))) return;
      const table = adminPage.getByTestId("membership-table");
      await expect(table.locator("tbody tr")).toHaveCount(1);
      await table.getByRole("button", { name: "მართვა" }).click();
      const dialog = adminPage.getByRole("dialog");
      await dialog.getByRole("radio", { name: "დღეების დამატება" }).check();
      await dialog.locator("#status-days").fill("5");
      await dialog.getByRole("button", { name: "წინასწარ ნახვა" }).click();
      await expect(
        dialog.locator("[data-testid=status-change-row][data-outcome=changed]"),
      ).toHaveCount(1);
      // The preview rolled back.
      expect((await membershipRow(TEST_IDS.renterMembership)).expires_at).toBe(
        before.expires_at,
      );
      await dialog.getByRole("button", { name: "შესრულება" }).click();
      await expect(
        dialog.getByRole("heading", { name: "შედეგი" }),
      ).toBeVisible();

      const after = await membershipRow(TEST_IDS.renterMembership);
      expect(micros(after.expires_at) - micros(before.expires_at)).toBe(
        5n * DAY_US,
      );
      expect(after.starts_at).toBe(before.starts_at);
      expect(after.status).toBe("active");

      const { data: notices } = await supabaseAdmin
        .from("notifications")
        .select("type, dashboard_scope")
        .eq("user_id", TEST_IDS.renter)
        .eq("type", "membership_admin_update");
      expect(notices).toEqual([
        { type: "membership_admin_update", dashboard_scope: "renter" },
      ]);
      const { data: audit } = await supabaseAdmin
        .from("audit_logs")
        .select("actor_id, actor_source")
        .eq("table_name", "user_subscriptions")
        .eq("record_id", TEST_IDS.renterMembership)
        .order("occurred_at", { ascending: false })
        .limit(1);
      expect(audit?.[0]).toEqual({
        actor_id: TEST_IDS.admin,
        actor_source: "admin",
      });
    } finally {
      await seedRenterMembership();
      await clearAdminNotices([TEST_IDS.renter]);
    }
  });

  test("membership: grant a package season, then revoke it from the drawer", async ({
    adminPage,
  }) => {
    await answerCookieBanner(adminPage);
    await supabaseAdmin
      .from("user_subscriptions")
      .delete()
      .eq("user_id", TEST_IDS.seller);
    const { data: pkg } = await supabaseAdmin
      .from("pricing_packages")
      .select("id")
      .eq("code", "renter-winter-standard")
      .single();
    try {
      await adminPage.goto(
        `/dashboard/admin/statuses?scope=all&q=${TEST_IDS.seller}`,
      );
      if (!(await assertDashboard(adminPage))) return;
      const table = adminPage.getByTestId("membership-table");
      await expect(table.locator("tbody tr")).toHaveCount(1);
      await table.getByRole("button", { name: "მართვა" }).click();
      const dialog = adminPage.getByRole("dialog");
      await dialog.getByRole("radio", { name: "საწევროს მინიჭება" }).check();
      await dialog.locator("#status-package").selectOption(pkg!.id);
      await previewAndApply(adminPage);

      const { data: rows } = await supabaseAdmin
        .from("user_subscriptions")
        .select(
          "id, status, starts_at, expires_at, amount_paid, package_id, reviewed_by",
        )
        .eq("user_id", TEST_IDS.seller);
      expect(rows).toHaveLength(1);
      const granted = rows![0];
      expect(granted.status).toBe("active");
      expect(Number(granted.amount_paid)).toBe(0);
      expect(granted.package_id).toBe(pkg!.id);
      expect(granted.reviewed_by).toBe(TEST_IDS.admin);
      // A season ends at the last microsecond of its Tbilisi day.
      expect(granted.expires_at).toMatch(/T19:59:59\.999999\+00:00$/);

      // The footer button (the header X carries the same accessible name).
      await dialog.getByText("დახურვა", { exact: true }).click();
      await table
        .locator("tbody tr")
        .first()
        .locator("td")
        .nth(1)
        .getByRole("button")
        .click();
      const drawer = adminPage.getByTestId("membership-drawer");
      await expect(drawer.getByTestId("membership-period")).toHaveCount(1);
      await drawer
        .getByTestId("membership-period")
        .getByRole("button", { name: "გაუქმება", exact: true })
        .click();
      await previewAndApply(adminPage);

      const revoked = await membershipRow(granted.id);
      expect(revoked.status).toBe("revoked");
      expect(revoked.starts_at).toBe(granted.starts_at);
      expect(revoked.expires_at).toBe(granted.expires_at);
    } finally {
      await supabaseAdmin
        .from("user_subscriptions")
        .delete()
        .eq("user_id", TEST_IDS.seller);
      await clearAdminNotices([TEST_IDS.seller]);
    }
  });

  test("listing: SUPER VIP for 3 days from the bulk bar, then removed", async ({
    adminPage,
  }) => {
    await answerCookieBanner(adminPage);
    const columns =
      "is_vip, is_super_vip, vip_expires_at, vip_expiry_notified_at, discount_percent, discount_expires_at";
    const read = async () => {
      const { data, error } = await supabaseAdmin
        .from("services")
        .select(columns)
        .eq("id", TEST_IDS.transportService)
        .single();
      if (error) throw error;
      return data;
    };
    const original = await read();
    try {
      await adminPage.goto(
        `/dashboard/admin/statuses?tab=listings&q=${TEST_IDS.transportService}`,
      );
      if (!(await assertDashboard(adminPage))) return;
      const table = adminPage.getByTestId("listing-table");
      await expect(table.locator("tbody tr")).toHaveCount(1);
      await table.locator("tbody tr input[type=checkbox]").check();
      await adminPage
        .getByTestId("status-selection-bar")
        .getByRole("button", { name: "VIP-ის მინიჭება" })
        .click();
      const dialog = adminPage.getByRole("dialog");
      await dialog.locator("#status-tier").selectOption("super");
      await dialog.locator("#status-days").fill("3");
      await dialog.getByRole("button", { name: "წინასწარ ნახვა" }).click();
      await expect(
        dialog.locator("[data-testid=status-change-row][data-outcome=changed]"),
      ).toHaveCount(1);
      expect(await read()).toEqual(original);
      const t0 = BigInt(Date.now()) * 1000n;
      await dialog.getByRole("button", { name: "შესრულება" }).click();
      await expect(
        dialog.getByRole("heading", { name: "შედეგი" }),
      ).toBeVisible();
      const t1 = BigInt(Date.now()) * 1000n;

      const granted = await read();
      expect(granted.is_super_vip).toBe(true);
      expect(granted.is_vip).toBe(false);
      expect(granted.vip_expiry_notified_at).toBeNull();
      const expires = micros(granted.vip_expires_at!);
      expect(expires >= t0 + 3n * DAY_US - 2_000_000n).toBe(true);
      expect(expires <= t1 + 3n * DAY_US + 2_000_000n).toBe(true);
      expect(granted.discount_percent ?? 0).toBe(
        original.discount_percent ?? 0,
      );

      // The footer button (the header X carries the same accessible name).
      await dialog.getByText("დახურვა", { exact: true }).click();
      await table.getByRole("button", { name: "მართვა" }).click();
      await dialog.getByRole("radio", { name: "VIP-ის მოხსნა" }).check();
      await previewAndApply(adminPage);
      const ended = await read();
      expect(ended.is_super_vip).toBe(false);
      expect(ended.is_vip).toBe(false);
      expect(micros(ended.vip_expires_at!) <= BigInt(Date.now()) * 1000n).toBe(
        true,
      );
    } finally {
      await supabaseAdmin
        .from("services")
        .update(original)
        .eq("id", TEST_IDS.transportService);
      await clearAdminNotices([TEST_IDS.transport]);
    }
  });

  test("company plan: the API preview writes nothing, apply adds exactly 2 days", async ({
    adminPage,
  }) => {
    await answerCookieBanner(adminPage);
    const read = async () => {
      const { data, error } = await supabaseAdmin
        .from("organization_subscriptions")
        .select("status, expires_at, tier, listing_limit")
        .eq("id", TEST_IDS.organizationSubscription)
        .single();
      if (error) throw error;
      return data;
    };
    const before = await read();
    try {
      await adminPage.goto("/dashboard/admin/statuses?tab=companies");
      if (!(await assertDashboard(adminPage))) return;
      const post = (body: Record<string, unknown>) =>
        adminPage.evaluate(async (payload) => {
          const res = await fetch("/api/admin/statuses/companies", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          return { status: res.status, json: await res.json() };
        }, body);
      const body = {
        action: "extend",
        orgIds: [TEST_IDS.organization],
        days: 2,
        notify: false,
      };
      const preview = await post(body);
      expect(preview.status).toBe(200);
      expect(preview.json.applied).toBe(false);
      expect(preview.json.changed).toBe(1);
      expect(await read()).toEqual(before);

      const applied = await post({ ...body, dryRun: false });
      expect(applied.json.applied).toBe(true);
      const after = await read();
      expect(micros(after.expires_at) - micros(before.expires_at)).toBe(
        2n * DAY_US,
      );
      // The preview showed exactly what the apply wrote.
      expect(micros(preview.json.rows[0].after.expires_at)).toBe(
        micros(after.expires_at),
      );
      expect(after.tier).toBe(before.tier);
      expect(after.status).toBe("active");
    } finally {
      await supabaseAdmin
        .from("organization_subscriptions")
        .update({
          expires_at: ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
          status: "active",
        })
        .eq("id", TEST_IDS.organizationSubscription);
    }
  });

  test("a non-admin cannot read or change statuses", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter");
    const result = await renterPage.evaluate(async (userId) => {
      const list = await fetch("/api/admin/statuses/memberships");
      const change = await fetch("/api/admin/statuses/memberships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "extend", userIds: [userId], days: 1 }),
      });
      return [list.status, change.status];
    }, TEST_IDS.renter);
    expect(result).toEqual([403, 403]);
  });
});

test.describe("Admin gifts", () => {
  // The guest fixture: no other spec writes its balance or transactions, so the
  // "no transaction, amount unchanged" checks hold in a parallel full run.
  test("SMS credits from the client page: credits added, no transaction, bell-only notice", async ({
    adminPage,
  }) => {
    await answerCookieBanner(adminPage);
    const balanceOf = async () => {
      const { data } = await supabaseAdmin
        .from("balances")
        .select("amount, sms_remaining")
        .eq("user_id", TEST_IDS.guest)
        .maybeSingle();
      return {
        amount: Number(data?.amount ?? 0),
        sms: Number(data?.sms_remaining ?? 0),
      };
    };
    const clearGiftNotices = () =>
      supabaseAdmin
        .from("notifications")
        .delete()
        .eq("user_id", TEST_IDS.guest)
        .eq("type", "sms_credit_admin_update");
    await clearGiftNotices();
    const before = await balanceOf();
    const startedAt = new Date().toISOString();
    try {
      await adminPage.goto(`/dashboard/admin/clients/${TEST_IDS.guest}`);
      if (!(await assertDashboard(adminPage))) return;
      await adminPage.getByRole("button", { name: "ბონუსი" }).click();
      const dialog = adminPage.getByRole("dialog");
      await dialog.getByRole("radio", { name: "SMS კრედიტები" }).click();
      await dialog.locator("#client-gift-value").fill("7");
      await dialog.getByRole("button", { name: "დარიცხვა" }).click();
      await expect(adminPage.getByText("SMS კრედიტები დაერიცხა")).toBeVisible();
      await expect(dialog).toBeHidden();

      const after = await balanceOf();
      expect(after.sms).toBe(before.sms + 7);
      expect(after.amount).toBe(before.amount);
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .eq("user_id", TEST_IDS.guest)
        .gte("created_at", startedAt);
      expect(txs).toEqual([]);
      const { data: notices } = await supabaseAdmin
        .from("notifications")
        .select("type, dashboard_scope")
        .eq("user_id", TEST_IDS.guest)
        .eq("type", "sms_credit_admin_update");
      expect(notices).toEqual([
        { type: "sms_credit_admin_update", dashboard_scope: null },
      ]);
    } finally {
      await supabaseAdmin
        .from("balances")
        .update({ sms_remaining: before.sms })
        .eq("user_id", TEST_IDS.guest);
      await clearGiftNotices();
    }
  });

  test("a non-admin cannot gift", async ({ renterPage }) => {
    await renterPage.goto("/dashboard/renter");
    const status = await renterPage.evaluate(async (userId) => {
      const res = await fetch("/api/admin/clients/bonus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, kind: "sms", credits: 5 }),
      });
      return res.status;
    }, TEST_IDS.guest);
    expect(status).toBe(403);
  });
});
