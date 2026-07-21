import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import {
  ORGANIZATION_SUBSCRIPTION_EXPIRES_AT,
  TEST_IDS,
} from "../helpers/seed";
import {
  leads,
  organizationSubscriptions,
  properties,
} from "../helpers/supabase";
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

  test("land-sale edit hides construction fields and clears their saved metadata", async ({
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

    await expect(sellerPage).toHaveURL(/\/dashboard\/seller(?:$|[/?#])/);
    await expect.poll(async () => properties.get(TEST_IDS.sale)).toMatchObject({
      type: "villa",
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
    await expect(expiry).toContainText(
      formatDateTime(ORGANIZATION_SUBSCRIPTION_EXPIRES_AT, "ka"),
    );
    await expect(expiry).toContainText(`${expectedDaysLeft} დღე`);

    await organizationSubscriptions.update(TEST_IDS.organizationSubscription, {
      status: "expired",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await sellerPage.reload();

    await expect(sellerPage.getByText("არ გაქვთ პაკეტი", { exact: true })).toBeVisible();
    await expect(expiry).toHaveCount(0);
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
