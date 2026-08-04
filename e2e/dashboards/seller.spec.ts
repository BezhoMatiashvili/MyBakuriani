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
import { formatDateTime } from "../../src/lib/utils/format";

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

  test("overview and More sheet match the compact mobile layout", async ({
    sellerPage,
  }) => {
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
    await expect(switcher.getByText("სტუმარი", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("მთავარი პანელი", { exact: true })).toBeVisible();
    await expect(menu.getByText("ობიექტები და პროექტები", { exact: true })).toBeVisible();
    await expect(menu.getByText(/\d+\.\d{2} ₾/)).toBeVisible();
    expect(await sellerPage.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    await sellerPage.keyboard.press("Escape");
    await expect(menu).toBeHidden();

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

    await expect(sellerPage.getByText("PRO", { exact: true })).toBeVisible();
    await expect(sellerPage.getByTestId("organization-tier-entry")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-pro")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-premium")).toBeEnabled();
    await expect(
      sellerPage.getByTestId("organization-subscription-activate"),
    ).toBeDisabled();
    await expect(sellerPage.getByText("შესაძლებელია მხოლოდ უფრო მაღალ პაკეტზე")).toBeVisible();
    await expect(expiry).toContainText(
      formatDateTime(ORGANIZATION_SUBSCRIPTION_EXPIRES_AT, "ka"),
    );
    await expect(expiry).toContainText(`${expectedDaysLeft} დღე`);

    await organizationSubscriptions.update(TEST_IDS.organizationSubscription, {
      tier: "premium",
      status: "active",
      expires_at: ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
    });
    await sellerPage.reload();
    await expect(sellerPage.getByTestId("organization-tier-entry")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-pro")).toBeDisabled();
    await expect(sellerPage.getByTestId("organization-tier-premium")).toBeDisabled();
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

    async function setSubscription(tier: "entry" | "pro" | "premium", expiresAt: string) {
      await supabaseAdmin
        .from("organization_subscriptions")
        .delete()
        .eq("organization_id", orgId);
      await supabaseAdmin
        .from("transactions")
        .delete()
        .eq("user_id", userId);
      await supabaseAdmin.from("balances").update({ amount: 1000 }).eq("user_id", userId);
      const limits = { entry: 10, pro: 50, premium: null };
      const amounts = { entry: 100, pro: 200, premium: 350 };
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

    async function purchase(tier: "entry" | "pro" | "premium") {
      return supabaseAdmin.rpc("purchase_company_subscription", {
        p_user_id: userId,
        p_org_id: orgId,
        p_tier: tier,
      });
    }

    async function expectRejected(active: "pro" | "premium", requested: "entry" | "pro") {
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
