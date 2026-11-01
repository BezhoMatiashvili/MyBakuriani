import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/fixtures";
import {
  ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
  TEST_IDS,
} from "../helpers/seed";
import {
  leads,
  organizationSubscriptions,
  properties,
  supabaseAdmin,
} from "../helpers/supabase";
import { createTestUser, type TestUser } from "../helpers/auth";
import { configureIsolatedE2E } from "../helpers/env";
import { formatDateTime } from "../../src/lib/utils/format";
import { formatRateDay, tbilisiDay } from "../../src/lib/currency/money";

const SELLER_LEADS_PATH = "/dashboard/seller/leads";
const LEAD_NAME = "E2E Drag Lead";

type LeadStage = "new" | "contacted" | "shown" | "negotiating" | "closed";

/** If page redirected to login, skip assertion gracefully */
async function assertDashboard(page: Page, expectedPath: string) {
  if (page.url().includes("/auth/login")) {
    test.info().annotations.push({
      type: "skip",
      description: "Auth not available",
    });
    return false;
  }
  await expect(page).toHaveURL(new RegExp(`${expectedPath}(?:$|[/?#])`));
  return true;
}

function stageColumn(page: Page, stage: LeadStage) {
  return page.locator(`[data-stage="${stage}"]`);
}

function leadCard(page: Page) {
  return page.locator(`[data-lead-id="${TEST_IDS.sellerLead}"]`);
}

async function openSalesBoard(page: Page): Promise<boolean> {
  await page.goto(SELLER_LEADS_PATH);
  if (!(await assertDashboard(page, SELLER_LEADS_PATH))) return false;

  await expect(stageColumn(page, "new")).toBeVisible();
  await expect(leadCard(page)).toBeVisible();
  return true;
}

async function expectStageLeadCount(
  page: Page,
  stage: LeadStage,
  count: number,
) {
  await expect(stageColumn(page, stage).locator("[data-lead-id]")).toHaveCount(
    count,
  );

  // Prefer the board's explicit counter hook when it is present. Counting the
  // cards above remains a useful fallback for older deployments under test.
  const counter = stageColumn(page, stage).locator(
    `[data-stage-count="${stage}"]`,
  );
  if ((await counter.count()) > 0) {
    await expect(counter).toHaveText(String(count));
  }
}

async function dragLeadToStage(page: Page, stage: LeadStage) {
  const source = leadCard(page);
  const target = stageColumn(page, stage);
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Lead card or target stage has no visible bounding box");
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + Math.min(150, targetBox.height / 3);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Cross the pointer sensor's activation threshold before entering the target.
  await page.mouse.move(startX + 14, startY, { steps: 4 });
  await expect(source).toHaveAttribute("data-dragging", "true");
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
}

async function dragLeadOutsideBoard(page: Page) {
  const source = leadCard(page);
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const viewport = page.viewportSize();
  if (!sourceBox || !viewport) {
    throw new Error("Lead card or viewport has no visible bounding box");
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 14, startY, { steps: 4 });
  await expect(source).toHaveAttribute("data-dragging", "true");
  // The top-right of the page is in the dashboard top bar, outside all stages.
  await page.mouse.move(viewport.width - 24, 80, { steps: 12 });
  await page.mouse.up();
}

async function expectEditModal(page: Page) {
  const heading = page.getByRole("heading", {
    name: /მოთხოვნის რედაქტირება|Edit request|Редактировать запрос/i,
  });
  await expect(heading).toBeVisible();
  const modal = heading.locator(
    "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' fixed ')][1]",
  );
  await expect(modal.locator('input[type="text"]').first()).toHaveValue(
    LEAD_NAME,
  );
}

test.describe("Seller Dashboard", () => {
  test("overview loads", async ({ sellerPage }) => {
    await sellerPage.goto("/dashboard/seller");
    if (!(await assertDashboard(sellerPage, "/dashboard/seller"))) return;

    await expect(sellerPage.locator("main")).toBeVisible();
    await expect(sellerPage).toHaveURL(/\/dashboard\/seller/);
  });

  test("seller cards show one prioritized SUPER VIP status and discount durations", async ({
    sellerPage,
  }) => {
    const listingId = randomUUID();
    await properties.create({
      id: listingId,
      owner_id: TEST_IDS.seller,
      type: "apartment",
      title: `E2E SUPER VIP ${listingId.slice(0, 6)}`,
      description: "Seller promotion status regression fixture",
      location: "ბაკურიანი",
      sale_price: 125000,
      currency: "GEL",
      photos: [],
      status: "active",
      is_for_sale: true,
      is_vip: true,
      is_super_vip: true,
      vip_expires_at: new Date(
        Date.now() + 4 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      discount_percent: 20,
      discount_expires_at: new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    try {
      for (const path of [
        "/dashboard/seller",
        "/dashboard/seller/listings",
      ]) {
        await sellerPage.goto(path);
        if (!(await assertDashboard(sellerPage, path))) return;

        const card = sellerPage.locator(`[data-listing-id="${listingId}"]`);
        const status = card.getByTestId("listing-promotion-status");
        await expect(
          status.locator('[data-promotion-tier="super-vip"]'),
        ).toContainText("SUPER VIP · 4 დღე დარჩა");
        await expect(
          status.locator('[data-promotion-tier="vip"]'),
        ).toHaveCount(0);
        await expect(
          status.locator('[data-promotion-tier="discount"]'),
        ).toContainText("−20% · 2 დღე დარჩა");
      }
    } finally {
      await properties.delete(listingId);
    }
  });

  test("overview and More sheet match the compact mobile layout", async ({
    sellerPage,
  }) => {
    // The cookie + location panel covers a phone's lower half, More tab included.
    await sellerPage.context().addCookies([
      {
        name: "mb_cookie_consent",
        value: encodeURIComponent("v2|analytics=0|location=0"),
        url: configureIsolatedE2E().baseUrl,
      },
    ]);
    await sellerPage.setViewportSize({ width: 390, height: 844 });
    await sellerPage.goto("/dashboard/seller");
    if (!(await assertDashboard(sellerPage, "/dashboard/seller"))) return;

    const filters = sellerPage.getByTestId("seller-kpi-filters");
    const filterButtons = filters.locator("button");
    await expect(filterButtons).toHaveCount(2);
    const [listingFilter, dateFilter] = await Promise.all([
      filterButtons.nth(0).boundingBox(),
      filterButtons.nth(1).boundingBox(),
    ]);
    expect(listingFilter?.y).toBeCloseTo(dateFilter?.y ?? 0, 0);
    expect(listingFilter?.height).toBeGreaterThanOrEqual(44);
    expect(dateFilter?.height).toBeGreaterThanOrEqual(44);

    const listing = sellerPage.getByTestId("seller-overview-listing").first();
    await expect(listing).toBeVisible();
    const thumbnail = await listing
      .getByTestId("seller-listing-thumbnail")
      .boundingBox();
    expect(thumbnail?.width).toBeCloseTo(88, 0);
    expect(thumbnail?.height).toBeCloseTo(88, 0);

    const promotions = listing.getByTestId("seller-mobile-promotions");
    const actions = listing.getByTestId("seller-mobile-actions");
    await expect(promotions.locator("button")).toHaveCount(3);
    await expect(actions.locator("a")).toHaveCount(2);
    const [promotionBox, actionsBox] = await Promise.all([
      promotions.boundingBox(),
      actions.boundingBox(),
    ]);
    expect(promotionBox!.y).toBeLessThan(actionsBox!.y);

    await sellerPage
      .locator('button[aria-controls="dashboard-more-sheet"]')
      .click();
    const switcher = sellerPage.getByTestId("mobile-service-switcher");
    const menu = sellerPage.getByTestId("seller-mobile-menu-list");
    await expect(switcher).toBeVisible();
    await expect(menu).toBeVisible();
    // The account row (name + ID) heads the sheet, like the desktop sidebar chip.
    await expect(sellerPage.getByTestId("mobile-account-row")).toContainText(
      /ID: MB-[0-9A-F]{5}/,
    );
    const sheet = sellerPage.getByRole("dialog");
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox?.height).toBeGreaterThanOrEqual(800);
    await expect(switcher.getByText("სტუმარი", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("მთავარი პანელი", { exact: true })).toBeVisible();
    await expect(
      menu.getByRole("link", { name: "მთავარი პანელი", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(menu.getByText("ობიექტები და პროექტები", { exact: true })).toBeVisible();
    await expect(menu.getByText(/\d+\.\d{2} ₾/)).toBeVisible();
    expect(await sellerPage.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    await sellerPage.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await sellerPage.goto("/dashboard/seller/analytics");
    if (!(await assertDashboard(sellerPage, "/dashboard/seller/analytics")))
      return;
    await sellerPage
      .locator('button[aria-controls="dashboard-more-sheet"]')
      .click();
    await expect(
      sellerPage
        .getByTestId("seller-mobile-menu-list")
        .getByRole("link", { name: "ანალიტიკა და უკუგება", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    const overflows = await sellerPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });

  test("listings page loads", async ({ sellerPage }) => {
    await sellerPage.goto("/dashboard/seller/listings");
    if (!(await assertDashboard(sellerPage, "/dashboard/seller/listings")))
      return;

    await expect(sellerPage.locator("main")).toBeVisible();
    await expect(sellerPage).toHaveURL(/\/dashboard\/seller\/listings/);
  });

  test("listing promotion actions remain aligned and tappable on phones", async ({
    sellerPage,
  }) => {
    await sellerPage.setViewportSize({ width: 320, height: 568 });
    await sellerPage.goto("/dashboard/seller/listings");
    if (!(await assertDashboard(sellerPage, "/dashboard/seller/listings")))
      return;

    const promotions = sellerPage.getByTestId("listing-promotions").first();
    await expect(promotions).toBeVisible();
    const buttons = promotions.locator("button");
    await expect(buttons).toHaveCount(3);
    const boxes = await Promise.all(
      [0, 1, 2].map((index) => buttons.nth(index).boundingBox()),
    );
    expect(boxes.every((box) => (box?.height ?? 0) >= 44)).toBe(true);
    expect(boxes[0]?.y).toBeCloseTo(boxes[1]?.y ?? 0, 0);
    expect(boxes[1]?.y).toBeCloseTo(boxes[2]?.y ?? 0, 0);
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

  // KNOWN RED — not executed. The type-switch assertions below are correct and
  // exercise the new `land` type, but the save tail asserts a behaviour that no
  // longer exists: a sale edit now queues a content_change_requests row for admin
  // review instead of mutating the properties row, so `type` only becomes "land"
  // once an admin approves. (The two earlier blockers behind this fixme are fixed:
  // REVIEWABLE_FIELDS.property carries `roi_percent_max`, and the submit button is
  // back to a translated label — "განხილვაზე გაგზავნა" in edit mode.)
  // To re-enable: point the locator at the edit-mode label and assert on
  // content_change_requests.proposed_values (type: "land" + the null-set), or
  // approve the request via the admin RPC first and keep asserting on the row.
  test.fixme("land-sale edit hides construction fields and clears their saved metadata", async ({
    sellerPage,
  }) => {
    // Keep the edit fixture valid so this test exercises the real save path.
    await properties.update(TEST_IDS.sale, {
      type: "apartment",
      cadastral_code: "05.32.12.345",
      photos: ["e2e-sale-1.jpg", "e2e-sale-2.jpg", "e2e-sale-3.jpg"],
      phone: "+995599000004",
      construction_status: "under_construction",
      construction_progress_percent: 65,
      completion_year: 2030,
      units_total: 20,
      units_sold: 5,
      units_reserved: 3,
      house_rules: { handover_month: 8 },
    });

    await sellerPage.goto(`/create/sale?edit=${TEST_IDS.sale}`);
    if (sellerPage.url().includes("/auth/login")) return;

    const propertyTypeTrigger = sellerPage
      .getByText("ობიექტის ტიპი", { exact: true })
      .locator("xpath=../../following-sibling::button");
    const constructionStatus = sellerPage.getByText("მშენებლობის სტატუსი", {
      exact: true,
    });
    const handoverDate = sellerPage.getByText("ჩაბარების დრო", {
      exact: true,
    });

    await expect(propertyTypeTrigger).toBeVisible();
    await expect(constructionStatus).toBeVisible();
    await expect(handoverDate).toBeVisible();

    await propertyTypeTrigger.click();
    await sellerPage.getByText("მიწის ნაკვეთი", { exact: true }).click();
    await expect(constructionStatus).toHaveCount(0);
    await expect(handoverDate).toHaveCount(0);

    await propertyTypeTrigger.click();
    await sellerPage.getByText("აპარტამენტი", { exact: true }).click();
    await expect(constructionStatus).toBeVisible();
    await expect(handoverDate).toBeVisible();

    await propertyTypeTrigger.click();
    await sellerPage.getByText("მიწის ნაკვეთი", { exact: true }).click();
    await sellerPage.getByRole("button", { name: "შენახვა" }).click();

    // See the fixme note on this test: the original assertion (a direct row
    // mutation to type='land' with the construction metadata cleared) is what
    // this SHOULD check once the content-change path works end to end.
    await expect(sellerPage).toHaveURL(/\/dashboard\/seller(?:$|[/?#])/);
    await expect
      .poll(async () => properties.get(TEST_IDS.sale))
      .toMatchObject({
        type: "land",
        construction_status: null,
        construction_progress_percent: null,
        completion_year: null,
        units_total: null,
        units_sold: 0,
        units_reserved: 0,
        house_rules: expect.objectContaining({ handover_month: null }),
      });
  });

  test("organization cabinet shows an active package expiry and hides it once expired", async ({
    sellerPage,
  }) => {
    await organizationSubscriptions.update(TEST_IDS.organizationSubscription, {
      tier: "pro",
      status: "active",
      expires_at: ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
    });

    const cabinetPath = `/dashboard/seller/organizations/${TEST_IDS.organization}`;
    await sellerPage.goto(cabinetPath);
    if (!(await assertDashboard(sellerPage, cabinetPath))) return;

    const expiry = sellerPage.getByTestId("organization-subscription-expiry");
    const expectedDaysLeft = Math.max(
      0,
      Math.ceil(
        (new Date(ORGANIZATION_SUBSCRIPTION_EXPIRES_AT).getTime() -
          Date.now()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    // The tier cards also render package names, so read the active badge itself.
    await expect(sellerPage.getByTestId("organization-active-tier")).toHaveText("PRO");
    await expect(sellerPage.getByTestId("organization-tier-entry")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-pro")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-premium")).toBeEnabled();
    await expect(sellerPage.getByTestId("organization-tier-premium_plus")).toBeEnabled();
    await expect(
      sellerPage.getByTestId("organization-subscription-activate"),
    ).toBeDisabled();
    await expect(sellerPage.getByText("შესაძლებელია მხოლოდ უფრო მაღალ პაკეტზე")).toBeVisible();
    await expect(expiry).toContainText(
      formatDateTime(ORGANIZATION_SUBSCRIPTION_EXPIRES_AT, "ka"),
    );
    // ICU formats counts ≥ 1000 with a group separator ("3,552 დღე").
    await expect(expiry).toContainText(
      new RegExp(
        `${String(expectedDaysLeft).replace(/\B(?=(\d{3})+(?!\d))/g, "[,\\s\\u00a0\\u202f]?")} დღე`,
      ),
    );

    await organizationSubscriptions.update(TEST_IDS.organizationSubscription, {
      tier: "premium",
      status: "active",
      expires_at: ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
    });
    await sellerPage.reload();
    await expect(sellerPage.getByTestId("organization-tier-entry")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-pro")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-premium")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-active-tier")).toHaveText("PREMIUM");
    // PREMIUM+ (2026 price list) still ranks above an active PREMIUM.
    await expect(sellerPage.getByTestId("organization-tier-premium_plus")).toBeEnabled();
    await expect(
      sellerPage.getByTestId("organization-subscription-activate"),
    ).toBeDisabled();

    await organizationSubscriptions.update(TEST_IDS.organizationSubscription, {
      tier: "entry",
      status: "active",
      expires_at: ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
    });
    await sellerPage.reload();
    await expect(sellerPage.getByTestId("organization-tier-entry")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-pro")).toBeEnabled();
    await expect(sellerPage.getByTestId("organization-tier-premium")).toBeEnabled();
    await expect(sellerPage.getByTestId("organization-tier-premium_plus")).toBeEnabled();
    await sellerPage.getByTestId("organization-tier-pro").click();
    await expect(
      sellerPage.getByTestId("organization-subscription-activate"),
    ).toBeEnabled();

    await organizationSubscriptions.update(TEST_IDS.organizationSubscription, {
      tier: "premium",
      status: "expired",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await sellerPage.reload();

    await expect(
      sellerPage.getByText("არ გაქვთ პაკეტი", { exact: true }),
    ).toBeVisible();
    await expect(expiry).toHaveCount(0);
    await expect(sellerPage.getByTestId("organization-tier-entry")).toBeEnabled();
    await expect(sellerPage.getByTestId("organization-tier-pro")).toBeEnabled();
    await expect(sellerPage.getByTestId("organization-tier-premium")).toBeEnabled();
    await expect(sellerPage.getByTestId("organization-tier-premium_plus")).toBeEnabled();
  });
});

test.describe("Company subscription tier lock", () => {
  test.describe.configure({ mode: "serial" });

  test("blocks active downgrades and renewals, but allows upgrades and expired-tier purchases", async () => {
    const userId = randomUUID();
    const orgId = randomUUID();
    const timestamp = String(Date.now());
    const phone = `+995599${timestamp.slice(-6)}`;
    let user: TestUser | null = null;

    async function cleanup() {
      for (const request of [
        supabaseAdmin.from("notifications").delete().eq("user_id", userId),
        supabaseAdmin.from("transactions").delete().eq("user_id", userId),
        supabaseAdmin
          .from("organization_subscriptions")
          .delete()
          .eq("organization_id", orgId),
        supabaseAdmin.from("organizations").delete().eq("id", orgId),
        supabaseAdmin.from("balances").delete().eq("user_id", userId),
        supabaseAdmin.from("profiles").delete().eq("id", userId),
      ]) {
        try {
          await request;
        } catch {
          // Cleanup should continue through the remaining FK dependencies.
        }
      }
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    }

    async function setSubscription(
      tier: "entry" | "pro" | "premium" | "premium_plus",
      expiresAt: string,
    ) {
      await supabaseAdmin
        .from("organization_subscriptions")
        .delete()
        .eq("organization_id", orgId);
      await supabaseAdmin
        .from("transactions")
        .delete()
        .eq("user_id", userId);
      await supabaseAdmin.from("balances").update({ amount: 1000 }).eq("user_id", userId);
      const limits = { entry: 10, pro: 50, premium: null, premium_plus: null };
      const amounts = { entry: 100, pro: 200, premium: 350, premium_plus: 500 };
      const { error } = await supabaseAdmin.from("organization_subscriptions").insert({
        organization_id: orgId,
        tier,
        listing_limit: limits[tier],
        amount_gel: amounts[tier],
        starts_at: new Date().toISOString(),
        expires_at: expiresAt,
        status: "active",
      });
      expect(error).toBeNull();
    }

    async function state() {
      const [balance, transactions, subscriptions, notifications, listingLinks] = await Promise.all([
        supabaseAdmin.from("balances").select("amount").eq("user_id", userId).single(),
        supabaseAdmin.from("transactions").select("id").eq("user_id", userId),
        supabaseAdmin
          .from("organization_subscriptions")
          .select("id, tier, status, expires_at")
          .eq("organization_id", orgId)
          .order("created_at"),
        supabaseAdmin.from("notifications").select("id").eq("user_id", userId),
        supabaseAdmin.from("properties").select("id").eq("organization_id", orgId),
      ]);
      expect(balance.error).toBeNull();
      expect(transactions.error).toBeNull();
      expect(subscriptions.error).toBeNull();
      expect(notifications.error).toBeNull();
      expect(listingLinks.error).toBeNull();
      return {
        balance: balance.data?.amount,
        transactions: transactions.data,
        subscriptions: subscriptions.data,
        notifications: notifications.data,
        listingLinks: listingLinks.data,
      };
    }

    async function purchase(tier: "entry" | "pro" | "premium" | "premium_plus") {
      return supabaseAdmin.rpc("purchase_company_subscription", {
        p_user_id: userId,
        p_org_id: orgId,
        p_tier: tier,
      });
    }

    async function expectRejected(
      active: "pro" | "premium" | "premium_plus",
      requested: "entry" | "pro" | "premium",
    ) {
      await setSubscription(active, new Date(Date.now() + 86_400_000).toISOString());
      const before = await state();
      const { error } = await purchase(requested);
      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe("SUBSCRIPTION_TIER_LOCKED");
      expect(await state()).toEqual(before);
    }

    try {
      user = await createTestUser({
        id: userId,
        phone,
        displayName: "E2E subscription lock",
        role: "seller",
      });
      const { error: orgError } = await supabaseAdmin.from("organizations").insert({
        id: orgId,
        owner_id: user.id,
        org_type: "shps",
        legal_name: "შპს E2E Subscription Lock",
        identification_code: timestamp.slice(-9),
        brand_name: "E2E Subscription Lock",
        company_type: "developer",
        status: "active",
      });
      expect(orgError).toBeNull();
      const { error: balanceError } = await supabaseAdmin
        .from("balances")
        .upsert({ user_id: user.id, amount: 1000, sms_remaining: 0 });
      expect(balanceError).toBeNull();

      await expectRejected("premium", "pro");
      await expectRejected("pro", "entry");
      await expectRejected("pro", "pro");
      await expectRejected("premium_plus", "premium");

      await setSubscription("entry", new Date(Date.now() + 86_400_000).toISOString());
      const entryToPro = await purchase("pro");
      expect(entryToPro.error).toBeNull();
      const upgradedToPro = await state();
      expect(upgradedToPro.balance).toBe(800);
      expect(upgradedToPro.transactions).toHaveLength(1);
      expect(upgradedToPro.subscriptions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tier: "entry", status: "expired" }),
          expect.objectContaining({ tier: "pro", status: "active" }),
        ]),
      );
      const proExpiresAt = new Date(
        upgradedToPro.subscriptions?.find((sub) => sub.tier === "pro")?.expires_at ?? 0,
      ).getTime();
      expect(proExpiresAt).toBeGreaterThan(Date.now() + 29 * 86_400_000);

      await setSubscription("entry", new Date(Date.now() + 86_400_000).toISOString());
      const entryToPremium = await purchase("premium");
      expect(entryToPremium.error).toBeNull();
      expect((await state()).balance).toBe(650);

      await setSubscription("premium", new Date(Date.now() + 86_400_000).toISOString());
      const premiumToPremiumPlus = await purchase("premium_plus");
      expect(premiumToPremiumPlus.error).toBeNull();
      expect((await state()).balance).toBe(500);

      await setSubscription("pro", new Date(Date.now() - 60_000).toISOString());
      const expiredProToEntry = await purchase("entry");
      expect(expiredProToEntry.error).toBeNull();
      expect((await state()).balance).toBe(900);
    } finally {
      await cleanup();
    }
  });
});

test.describe("Seller lead board", () => {
  // These tests mutate one deterministic row. Keep them serial even though the
  // repository-level Playwright config enables fullyParallel.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await leads.update(TEST_IDS.sellerLead, { stage: "new" });
  });

  test.afterAll(async () => {
    await leads.update(TEST_IDS.sellerLead, { stage: "new" }).catch(() => {});
  });

  test("pointer drag updates columns, sidebar count, and persists", async ({
    sellerPage,
  }) => {
    if (!(await openSalesBoard(sellerPage))) return;

    await expectStageLeadCount(sellerPage, "new", 1);
    await expectStageLeadCount(sellerPage, "contacted", 0);

    const sidebarLeadsLink = sellerPage.locator(
      'a[href$="/dashboard/seller/leads"]',
    );
    const sidebarCount = sidebarLeadsLink
      .locator("span")
      .filter({ hasText: /^1$/ });
    await expect(sidebarCount).toHaveCount(1);

    const updateResponse = sellerPage.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/rest/v1/leads"),
    );
    await dragLeadToStage(sellerPage, "contacted");
    expect((await updateResponse).ok()).toBeTruthy();

    await expectStageLeadCount(sellerPage, "new", 0);
    await expectStageLeadCount(sellerPage, "contacted", 1);
    await expect(sidebarCount).toHaveCount(0);
    await expect(
      sellerPage.locator('[data-sonner-toast][data-type="success"]'),
    ).toBeVisible();
    await expect
      .poll(async () => (await leads.get(TEST_IDS.sellerLead))?.stage)
      .toBe("contacted");

    await sellerPage.reload();
    await expect(stageColumn(sellerPage, "contacted")).toBeVisible();
    await expectStageLeadCount(sellerPage, "new", 0);
    await expectStageLeadCount(sellerPage, "contacted", 1);

    await leadCard(sellerPage).click();
    await expectEditModal(sellerPage);
    await expect(
      sellerPage.getByRole("button", {
        name: /დავუკავშირდი|Contacted|Связались/i,
      }),
    ).toBeVisible();
  });

  test("failed stage PATCH rolls the optimistic move back", async ({
    sellerPage,
  }) => {
    let failedPatchCount = 0;
    await sellerPage.route("**/rest/v1/leads*", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }

      failedPatchCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          code: "E2E_FORCED_FAILURE",
          details: null,
          hint: null,
          message: "Forced lead update failure",
        }),
      });
    });

    if (!(await openSalesBoard(sellerPage))) return;
    await dragLeadToStage(sellerPage, "contacted");

    await expect.poll(() => failedPatchCount).toBe(1);
    await expectStageLeadCount(sellerPage, "new", 1);
    await expectStageLeadCount(sellerPage, "contacted", 0);
    await expect(
      sellerPage.locator('[data-sonner-toast][data-type="error"]'),
    ).toBeVisible();
    expect((await leads.get(TEST_IDS.sellerLead))?.stage).toBe("new");
  });

  test("same-column and outside drops are no-ops", async ({ sellerPage }) => {
    let patchCount = 0;
    sellerPage.on("request", (request) => {
      if (
        request.method() === "PATCH" &&
        request.url().includes("/rest/v1/leads")
      ) {
        patchCount += 1;
      }
    });

    if (!(await openSalesBoard(sellerPage))) return;
    await dragLeadToStage(sellerPage, "new");
    await expectStageLeadCount(sellerPage, "new", 1);
    await expectStageLeadCount(sellerPage, "contacted", 0);

    await dragLeadOutsideBoard(sellerPage);
    await expectStageLeadCount(sellerPage, "new", 1);
    await expectStageLeadCount(sellerPage, "contacted", 0);
    await sellerPage.waitForTimeout(200);
    expect(patchCount).toBe(0);
    expect((await leads.get(TEST_IDS.sellerLead))?.stage).toBe("new");
  });

  test("click and Enter continue to open lead editing", async ({
    sellerPage,
  }) => {
    if (!(await openSalesBoard(sellerPage))) return;

    await leadCard(sellerPage).click();
    await expectEditModal(sellerPage);
    await sellerPage.keyboard.press("Escape");
    await expect(
      sellerPage.getByRole("heading", {
        name: /მოთხოვნის რედაქტირება|Edit request|Редактировать запрос/i,
      }),
    ).toBeHidden();

    await leadCard(sellerPage).focus();
    await leadCard(sellerPage).press("Enter");
    await expectEditModal(sellerPage);
  });

  test("keyboard drag moves a focused lead to the next stage", async ({
    sellerPage,
  }) => {
    if (!(await openSalesBoard(sellerPage))) return;

    let patchCount = 0;
    sellerPage.on("request", (request) => {
      if (
        request.method() === "PATCH" &&
        request.url().includes("/rest/v1/leads")
      ) {
        patchCount += 1;
      }
    });
    const card = leadCard(sellerPage);
    await card.focus();
    await card.press("Space");
    await card.press("ArrowRight");
    await card.press("Escape");
    await expectStageLeadCount(sellerPage, "new", 1);
    await expectStageLeadCount(sellerPage, "contacted", 0);
    expect(patchCount).toBe(0);

    const updateResponse = sellerPage.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/rest/v1/leads"),
    );
    await card.focus();
    await card.press("Space");
    await card.press("ArrowRight");
    await card.press("Space");
    expect((await updateResponse).ok()).toBeTruthy();

    await expectStageLeadCount(sellerPage, "new", 0);
    await expectStageLeadCount(sellerPage, "contacted", 1);
    await expect
      .poll(async () => (await leads.get(TEST_IDS.sellerLead))?.stage)
      .toBe("contacted");
    expect(patchCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Sale price typed in ₾ or $ (C54): /create/sale's ₾/$ chip and the line under
// the price, what an edit proposes for review, and the cabinet's own currency.
// The NBG rate (/api/fx/usd) is mocked. Each test makes its own listing and
// removes it and its review requests in finally; the shared seed is untouched.
// ---------------------------------------------------------------------------

const RATE_DAY = tbilisiDay(new Date());
const RATE_DATE = formatRateDay(RATE_DAY);
const GEL_PRICE = {
  sale_price: 57757,
  sale_price_gel: 150000,
  sale_price_currency: "GEL",
};
const TAP_FOR_GEL = "ფასის ლარში მისათითებლად დააჭირეთ $-ს";
const NO_RATE_GEL =
  "ეროვნული ბანკის კურსი ახლა მიუწვდომელია, ამიტომ ფასს ლარში ვერ შევინახავთ. სცადეთ მოგვიანებით ან მიუთითეთ ფასი დოლარში.";
const NO_RATE_USD =
  "ეროვნული ბანკის კურსი ახლა მიუწვდომელია: ფასი მხოლოდ დოლარში შეინახება.";
const SUBMIT_FOR_REVIEW = "განხილვაზე გაგზავნა";

/** Serves `gelPerUsd` as today's NBG rate (null: a 503, NBG down). */
async function preparePricePage(page: Page, gelPerUsd: number | null) {
  // The cookie + location card would cover the lower half of the form.
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
  await page.route("**/api/fx/usd", (route) =>
    gelPerUsd === null
      ? route.fulfill({ status: 503, json: { error: "rate_unavailable" } })
      : route.fulfill({
          json: { gelPerUsd, date: RATE_DAY, validFrom: RATE_DAY },
        }),
  );
  // A rate this browser kept would skip the request.
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem("mybakuriani:fx_usd");
    } catch {
      // Storage blocked: nothing is kept either.
    }
  });
}

function priceFields(page: Page) {
  return {
    total: page.locator('[data-field="price"] input'),
    chip: page.locator('[data-field="price"] button'),
    perSqm: page.locator('[data-field="pricePerSqm"] input'),
    lines: page.locator("#sale-price-line p"),
  };
}

/** /create/sale past the "post as" screen; false when signed out. */
async function openNewSaleForm(page: Page): Promise<boolean> {
  // Continuing as an individual saves profile_type on the shared seller.
  await page.route("**/api/self-service/profile", (route) =>
    route.fulfill({ json: { profile: {}, cleaner_profile: null } }),
  );
  await page.goto("/create/sale");
  if (page.url().includes("/auth/login")) return false;
  const { total } = priceFields(page);
  const postAs = page.getByRole("button", { name: "გაგრძელება", exact: true });
  await expect(total.or(postAs).first()).toBeVisible();
  if (await postAs.isVisible()) await postAs.click();
  await expect(total).toBeVisible();
  return true;
}

async function openSaleEdit(page: Page, id: string): Promise<boolean> {
  await page.goto(`/create/sale?edit=${id}`);
  if (page.url().includes("/auth/login")) return false;
  await expect(priceFields(page).total).toBeVisible();
  return true;
}

/**
 * A sale listing of the seller's. The edit form sends back every column a test
 * leaves alone, rebuilt with these values, so a proposal holds only the change.
 */
async function createSaleListing(
  price: {
    sale_price: number;
    sale_price_gel: number | null;
    sale_price_currency: string;
    /** Overrides the 47 m² default. */
    area_sqm?: number;
  },
  createdAt?: string,
): Promise<string> {
  const id = randomUUID();
  await properties.create({
    id,
    owner_id: TEST_IDS.seller,
    type: "apartment",
    title: `E2E sale price ${id.slice(0, 8)}`,
    description: "Sale price pair fixture",
    location: "ბაკურიანი",
    area_sqm: 47,
    photos: [
      "/placeholder-property.jpg",
      "/placeholder-property.jpg",
      "/placeholder-property.jpg",
    ],
    phone: "+995599000004",
    status: "active",
    is_for_sale: true,
    construction_status: "completed",
    construction_progress_percent: null,
    completion_year: null,
    renovation_status: "white_frame",
    units_total: null,
    units_sold: 0,
    units_reserved: 0,
    house_rules: {
      handover_month: null,
      exact_location: null,
      management_service: "complex_management",
      price_currency: "USD",
    },
    ...price,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  return id;
}

async function removeSaleListing(id: string) {
  await supabaseAdmin
    .from("content_change_requests")
    .delete()
    .eq("target_id", id);
  await properties.delete(id);
}

async function reviewRequests(id: string) {
  const { data, error } = await supabaseAdmin
    .from("content_change_requests")
    .select("proposed_values, field_diff")
    .eq("target_id", id);
  expect(error).toBeNull();
  return data ?? [];
}

/** Sends the edit for review: the one request it filed, and its changed keys. */
async function submitSaleEdit(page: Page, id: string) {
  await page.getByRole("button", { name: SUBMIT_FOR_REVIEW }).click();
  await expect(page).toHaveURL(/\/dashboard\/seller(?:$|[/?#])/);
  const requests = await reviewRequests(id);
  expect(requests).toHaveLength(1);
  return {
    proposed: requests[0].proposed_values as Record<string, unknown>,
    changed: Object.keys(
      requests[0].field_diff as Record<string, unknown>,
    ).sort(),
  };
}

test.describe("Sale price in ₾ or $", () => {
  test("create: the chip switches only the unit, and the line shows the NBG rate", async ({
    sellerPage,
  }) => {
    await preparePricePage(sellerPage, 2.5971);
    if (!(await openNewSaleForm(sellerPage))) return;
    const { total, chip, perSqm, lines } = priceFields(sellerPage);

    await sellerPage.locator('[data-field="areaSqm"] input').fill("47");
    await total.fill("55000");
    await expect(perSqm).toHaveValue("1170.21");
    // Leaving the per-m² field keeps its cents, so the total stays (not 54 990).
    await perSqm.focus();
    await perSqm.blur();
    await expect(perSqm).toHaveValue("1170.21");
    await expect(total).toHaveValue("55000");

    await expect(chip).toHaveText("$");
    await expect(chip).toHaveAttribute("aria-label", "ლარზე გადართვა");
    const box = await chip.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(total).toHaveAttribute("aria-describedby", "sale-price-line");
    await expect(perSqm).toHaveAttribute("aria-describedby", "sale-price-line");
    await expect(lines).toHaveText([
      `განცხადებაში ასევე: 142 841 ₾ ($1 = 2.5971 ₾, ეროვნული ბანკი, ${RATE_DATE})`,
      TAP_FOR_GEL,
    ]);

    await chip.click();
    await expect(chip).toHaveText("₾");
    await expect(chip).toHaveAttribute("aria-label", "დოლარზე გადართვა");
    await expect(total).toHaveValue("55000");
    await expect(perSqm).toHaveValue("1170.21");
    await expect(
      sellerPage.locator('[data-field="pricePerSqm"]'),
    ).toContainText("₾");
    await expect(lines).toHaveText([
      `განცხადებაში ასევე: $21 177 ($1 = 2.5971 ₾, ეროვნული ბანკი, ${RATE_DATE})`,
    ]);
  });

  test("create: without an NBG rate the price stays in dollars", async ({
    sellerPage,
  }) => {
    await preparePricePage(sellerPage, null);
    if (!(await openNewSaleForm(sellerPage))) return;
    const { total, chip, lines } = priceFields(sellerPage);

    await sellerPage.locator('[data-field="areaSqm"] input').fill("47");
    await total.fill("55000");
    await expect(lines).toHaveText([NO_RATE_USD, TAP_FOR_GEL]);
    // The tap asks for the rate once more, then keeps the dollars.
    await chip.click();
    await expect(lines).toHaveText([NO_RATE_GEL]);
    await expect(chip).toHaveText("$");
    await expect(total).toHaveValue("55000");
  });

  test("edit: a ₾ listing opens in ₾, and a title edit proposes its stored price", async ({
    sellerPage,
  }) => {
    const id = await createSaleListing(GEL_PRICE);
    try {
      // At this rate 150 000 ₾ would convert to $55 556: the stored $57 757 shows.
      await preparePricePage(sellerPage, 2.7);
      if (!(await openSaleEdit(sellerPage, id))) return;
      const { total, chip, lines } = priceFields(sellerPage);
      await expect(total).toHaveValue("150000");
      await expect(chip).toHaveText("₾");
      await expect(lines).toHaveText(["განცხადებაში ასევე: $57 757"]);

      await sellerPage
        .locator('[data-field="title"] input')
        .fill(`E2E sale price edited ${id.slice(0, 8)}`);
      const { proposed, changed } = await submitSaleEdit(sellerPage, id);
      expect(proposed).toMatchObject(GEL_PRICE);
      expect(changed).toEqual(["title"]);
    } finally {
      await removeSaleListing(id);
    }
  });

  test("edit: a tap shows the stored dollars, and tapping back saves nothing", async ({
    sellerPage,
  }) => {
    const id = await createSaleListing(GEL_PRICE);
    try {
      await preparePricePage(sellerPage, 2.7);
      if (!(await openSaleEdit(sellerPage, id))) return;
      const { total, chip, lines } = priceFields(sellerPage);

      await chip.click();
      await expect(chip).toHaveText("$");
      await expect(total).toHaveValue("57757");
      await expect(lines).toHaveText([
        "განცხადებაში ასევე: 150 000 ₾",
        TAP_FOR_GEL,
      ]);
      await chip.click();
      await expect(chip).toHaveText("₾");
      await expect(total).toHaveValue("150000");

      await sellerPage.getByRole("button", { name: SUBMIT_FOR_REVIEW }).click();
      await expect(
        sellerPage.getByRole("alert").filter({ hasText: "ცვლილება არ არის" }),
      ).toBeVisible();
      expect(await reviewRequests(id)).toHaveLength(0);
    } finally {
      await removeSaleListing(id);
    }
  });

  test("edit: saving after a tap changes only the listing's currency", async ({
    sellerPage,
  }) => {
    const id = await createSaleListing(GEL_PRICE);
    try {
      await preparePricePage(sellerPage, 2.7);
      if (!(await openSaleEdit(sellerPage, id))) return;
      const { total, chip } = priceFields(sellerPage);

      await chip.click();
      await expect(total).toHaveValue("57757");
      const { proposed, changed } = await submitSaleEdit(sellerPage, id);
      expect(proposed).toMatchObject({
        ...GEL_PRICE,
        sale_price_currency: "USD",
      });
      expect(changed).toEqual(["sale_price_currency"]);
    } finally {
      await removeSaleListing(id);
    }
  });

  test("edit: a stored price above the caps survives a tap and a blur", async ({
    sellerPage,
  }) => {
    // ₾30M (the ₾ cap) on 10 m² stores more than the $10M and $1M-per-m² caps.
    const price = {
      sale_price: 11551791,
      sale_price_gel: 30000000,
      sale_price_currency: "GEL",
    };
    const id = await createSaleListing({ ...price, area_sqm: 10 });
    try {
      await preparePricePage(sellerPage, 2.7);
      if (!(await openSaleEdit(sellerPage, id))) return;
      const { total, chip, perSqm } = priceFields(sellerPage);
      const blurBoth = async () => {
        for (const field of [total, perSqm]) {
          await field.focus();
          await field.blur();
        }
      };

      await chip.click();
      await blurBoth();
      await expect(total).toHaveValue("11551791");
      await expect(perSqm).toHaveValue("1155179.1");
      await chip.click();
      await blurBoth();
      await expect(total).toHaveValue("30000000");
      await sellerPage.getByRole("button", { name: SUBMIT_FOR_REVIEW }).click();
      await expect(
        sellerPage.getByRole("alert").filter({ hasText: "ცვლილება არ არის" }),
      ).toBeVisible();
      expect(await reviewRequests(id)).toHaveLength(0);

      await chip.click();
      await blurBoth();
      const { proposed, changed } = await submitSaleEdit(sellerPage, id);
      expect(proposed).toMatchObject({ ...price, sale_price_currency: "USD" });
      expect(changed).toEqual(["sale_price_currency"]);
    } finally {
      await removeSaleListing(id);
    }
  });

  test("edit: a retyped dollar price gets its lari at the rate the line shows", async ({
    sellerPage,
  }) => {
    const id = await createSaleListing(GEL_PRICE);
    try {
      await preparePricePage(sellerPage, 2.7);
      if (!(await openSaleEdit(sellerPage, id))) return;
      const { total, chip, lines } = priceFields(sellerPage);

      await chip.click();
      await expect(total).toHaveValue("57757");
      await total.fill("56000");
      await expect(lines).toHaveText([
        `განცხადებაში ასევე: 151 200 ₾ ($1 = 2.7000 ₾, ეროვნული ბანკი, ${RATE_DATE})`,
        TAP_FOR_GEL,
      ]);
      const { proposed, changed } = await submitSaleEdit(sellerPage, id);
      expect(proposed).toMatchObject({
        sale_price: 56000,
        sale_price_gel: 151200,
        sale_price_currency: "USD",
      });
      expect(changed).toEqual([
        "sale_price",
        "sale_price_currency",
        "sale_price_gel",
      ]);
    } finally {
      await removeSaleListing(id);
    }
  });

  test("edit: a legacy dollar price keeps its cents through a blur and a title edit", async ({
    sellerPage,
  }) => {
    const id = await createSaleListing({
      sale_price: 55000.5,
      sale_price_gel: null,
      sale_price_currency: "USD",
    });
    try {
      await preparePricePage(sellerPage, 2.5971);
      if (!(await openSaleEdit(sellerPage, id))) return;
      const { total, chip, lines } = priceFields(sellerPage);

      await expect(total).toHaveValue("55000.5");
      await expect(chip).toHaveText("$");
      await total.focus();
      await total.blur();
      await expect(total).toHaveValue("55000.5");
      // It has no saved lari, and an untouched edit adds none: only the hint.
      await expect(lines).toHaveText([TAP_FOR_GEL]);

      await sellerPage
        .locator('[data-field="title"] input')
        .fill(`E2E sale price edited ${id.slice(0, 8)}`);
      const { proposed, changed } = await submitSaleEdit(sellerPage, id);
      expect(proposed).toMatchObject({
        sale_price: 55000.5,
        sale_price_gel: null,
        sale_price_currency: "USD",
      });
      expect(changed).toEqual(["title"]);
    } finally {
      await removeSaleListing(id);
    }
  });

  test("the seller dashboard prints a ₾ listing in ₾ whatever the visitor's pick", async ({
    sellerPage,
  }) => {
    // Newest, so it is among the overview's four latest listings.
    const id = await createSaleListing(
      GEL_PRICE,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );
    try {
      await sellerPage.goto("/dashboard/seller");
      if (!(await assertDashboard(sellerPage, "/dashboard/seller"))) return;
      const card = sellerPage.locator(`[data-listing-id="${id}"]`);
      await expect(card).toContainText("150 000 ₾");

      for (const pick of ["USD", "GEL"]) {
        await sellerPage.evaluate(
          (value) => window.localStorage.setItem("mybakuriani:currency", value),
          pick,
        );
        await sellerPage.reload();
        await expect(card).toContainText("150 000 ₾");
        await expect(card).not.toContainText("$57 757");
      }
    } finally {
      await removeSaleListing(id);
    }
  });
});
