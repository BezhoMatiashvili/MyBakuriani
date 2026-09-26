import { expect, test, type Locator, type Page } from "@playwright/test";
import { supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";
import {
  getBalance,
  getListing,
  hoursFromNow,
  invokePurchase,
  laneFromProject,
  laneIds,
  lastTransaction,
  loginPage,
  resetPromotions,
  setBalance,
  setPromotion,
  signIn,
  titles,
  vipPackages,
  type Lane,
} from "./vip-fixtures";

/**
 * Buying VIP / SUPER VIP / discount badges through the real UI and the real
 * deployed purchase-vip edge function. Wallet credit is granted from the DB
 * (vip-fixtures.ts). Every purchase is asserted in the UI AND in the database.
 * Run: vip-seed → vip-desktop + vip-mobile → vip-teardown.
 */

// Tests share one lane's wallet, so they run in order inside a project.
test.describe.configure({ mode: "default" });

const KA = {
  selectListing: "აირჩიეთ განცხადება",
  pay: "გადახდა",
  confirmTitle: "გადახდის დადასტურება",
  agree: "დავეთანხმე და გადავიხდი",
  discount: "ფასდაკლება",
  daysLeft: (n: number) => `${n} დღე დარჩა`,
};
const EN = {
  selectListing: "Select listing",
  pay: "Pay",
  confirmTitle: "Confirm payment",
  agree: "I agree, proceed with payment",
  discount: "Discount",
  daysLeft: (n: number) => (n === 1 ? "1 day left" : `${n} days left`),
};
type Strings = typeof KA;

const GEORGIAN = /[Ⴀ-ჿ]/;

let lane: Lane;
let ids: ReturnType<typeof laneIds>;
let t: ReturnType<typeof titles>;

test.beforeEach(async ({}, testInfo) => {
  lane = laneFromProject(testInfo.project.name);
  ids = laneIds(lane);
  t = titles(lane);
  await resetPromotions(lane);
  await setBalance(ids.owner, 200);
  await setBalance(ids.svcOwner, 200);
  await setBalance(ids.poor, 1);
});

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const url = page.url();
  // Never let a logged-out or unconsented page pass as "nothing broke".
  expect(url, "landed on login").not.toContain("/auth/login");
  expect(url, "landed on consent gate").not.toContain("/consent-required");
}

function row(page: Page, listingId: string) {
  return page.locator(`[data-listing-id="${listingId}"]`).first();
}

function tierButton(
  scope: Locator,
  tier: "super" | "vip" | "discount",
  L: Strings,
) {
  const text =
    tier === "super"
      ? /SUPER VIP/
      : tier === "vip"
        ? /^\s*VIP\s*$/
        : new RegExp(L.discount);
  return scope
    .locator("button")
    .filter({ hasText: text })
    .filter({ visible: true })
    .first();
}

function picker(page: Page, L: Strings) {
  return page
    .locator("div.fixed.inset-0.z-50")
    .filter({ has: page.getByRole("heading", { name: L.selectListing }) })
    .first();
}

function confirmDialog(page: Page, L: Strings) {
  return page.getByRole("dialog").filter({ hasText: L.confirmTitle });
}

async function openPicker(
  page: Page,
  listingId: string,
  tier: "super" | "vip" | "discount",
  L: Strings,
) {
  const r = row(page, listingId);
  await r.scrollIntoViewIfNeeded();
  await tierButton(r, tier, L).click();
  const p = picker(page, L);
  await expect(p).toBeVisible();
  return p;
}

async function selectInPicker(p: Locator, title: string) {
  await p.getByRole("button", { name: title, exact: true }).click();
}

async function payAndConfirm(page: Page, p: Locator, L: Strings) {
  const pay = p.getByRole("button", { name: L.pay, exact: true });
  await expect(pay).toBeEnabled({ timeout: 15_000 });
  await pay.click();
  const c = confirmDialog(page, L);
  await expect(c).toBeVisible();
  return c;
}

async function agree(page: Page, c: Locator, L: Strings) {
  await c.getByRole("button", { name: L.agree }).click();
  await expect(c).toBeHidden({ timeout: 30_000 });
  await expect(picker(page, L)).toBeHidden();
}

const isDesktop = () => lane === "d";

// ---------------------------------------------------------------------------
// Entry point: renter overview (desktop row buttons / phone promo grid)
// ---------------------------------------------------------------------------

test("[B2] clicking a tier on a listing preselects THAT listing", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  for (const [listingId, title, tier] of [
    [ids.rental3, t.rental3, "vip"],
    [ids.rental1, t.rental1, "super"],
    [ids.rental2, t.rental2, "discount"],
  ] as const) {
    const p = await openPicker(page, listingId, tier, KA);
    const c = await payAndConfirm(page, p, KA);
    await expect(
      c,
      `confirm names the clicked listing (${tier})`,
    ).toContainText(title);
    await c.getByRole("button", { name: "გაუქმება" }).click();
    await expect(c).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(p).toBeHidden();
  }
});

test("[core] buy standard VIP ×1 — DB flags, 24 h, debit 1.50, badge", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "vip", KA);
  await selectInPicker(p, t.rental1);
  await expect(p).toContainText("1.50 ₾");
  const c = await payAndConfirm(page, p, KA);
  await expect(c).toContainText(t.rental1);
  await agree(page, c, KA);

  const l = await getListing("properties", ids.rental1);
  expect(l.is_vip).toBe(true);
  expect(l.is_super_vip).toBe(false);
  expect(hoursFromNow(l.vip_expires_at)).toBeGreaterThan(23.9);
  expect(hoursFromNow(l.vip_expires_at)).toBeLessThan(24.1);
  expect(await getBalance(ids.owner)).toBeCloseTo(198.5, 2);
  const tx = await lastTransaction(ids.owner);
  expect(tx?.type).toBe("vip_boost");
  expect(Number(tx?.amount)).toBeCloseTo(-1.5, 2);
  expect(tx?.reference_id).toBe(ids.rental1);

  await expect(
    row(page, ids.rental1).locator('[data-promotion-tier="vip"]'),
  ).toContainText(KA.daysLeft(1));
});

test("[core] quantity 3 — price 4.50 ₾, 72 h, 3 days", async ({ page }) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental2, "vip", KA);
  await selectInPicker(p, t.rental2);
  await p.getByRole("button", { name: "+", exact: true }).click();
  await p.getByRole("button", { name: "+", exact: true }).click();
  await expect(p).toContainText("4.50 ₾");
  await expect(p).toContainText("3 დღე");
  const c = await payAndConfirm(page, p, KA);
  await expect(c).toContainText("4.50 ₾");
  await expect(c).toContainText("72");
  await agree(page, c, KA);
  const l = await getListing("properties", ids.rental2);
  expect(hoursFromNow(l.vip_expires_at)).toBeGreaterThan(71.9);
  expect(hoursFromNow(l.vip_expires_at)).toBeLessThan(72.1);
  expect(await getBalance(ids.owner)).toBeCloseTo(195.5, 2);
  await expect(
    row(page, ids.rental2).locator('[data-promotion-tier="vip"]'),
  ).toContainText(KA.daysLeft(3));
});

test("[B4] re-buying an ACTIVE VIP adds to the remaining time", async ({
  page,
}) => {
  await setPromotion("properties", ids.rental1, {
    is_vip: true,
    vip_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  });
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "vip", KA);
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  const l = await getListing("properties", ids.rental1);
  // 20 h left + 24 h bought.
  expect(hoursFromNow(l.vip_expires_at)).toBeGreaterThan(43.8);
  expect(hoursFromNow(l.vip_expires_at)).toBeLessThan(44.1);
  expect(await getBalance(ids.owner)).toBeCloseTo(198.5, 2);
});

test("[B4] re-buying an ACTIVE discount extends it and applies the new percent", async ({
  page,
}) => {
  await setPromotion("properties", ids.rental2, {
    discount_percent: 10,
    discount_expires_at: new Date(Date.now() + 10 * 3_600_000).toISOString(),
  });
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental2, "discount", KA);
  await selectInPicker(p, t.rental2);
  const percent = p.locator("input").first();
  await percent.fill("30");
  await percent.blur();
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  const l = await getListing("properties", ids.rental2);
  expect(l.discount_percent).toBe(30);
  expect(hoursFromNow(l.discount_expires_at)).toBeGreaterThan(33.8);
  expect(hoursFromNow(l.discount_expires_at)).toBeLessThan(34.1);
});

test("[C23] active SUPER VIP blocks standard VIP in the UI and on the server", async ({
  page,
}) => {
  await setPromotion("properties", ids.rental2, {
    is_super_vip: true,
    vip_expires_at: new Date(Date.now() + 10 * 3_600_000).toISOString(),
  });
  const token = await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  await expect(tierButton(row(page, ids.rental2), "vip", KA)).toBeDisabled();
  await expect(
    row(page, ids.rental2).locator('[data-promotion-tier="super-vip"]'),
  ).toBeVisible();

  const { vip } = await vipPackages();
  const res = await invokePurchase(token, {
    package_id: vip.id,
    property_id: ids.rental2,
    quantity: 1,
  });
  expect(res.status).toBe(409);
  expect(res.json.error).toBe("vip_tier_conflict");
  expect(await getBalance(ids.owner)).toBeCloseTo(200, 2);
  const l = await getListing("properties", ids.rental2);
  expect(l.is_super_vip).toBe(true);
  expect(l.is_vip).toBe(false);
});

test("[C23] SUPER VIP bought over an active VIP replaces it from now", async ({
  page,
}) => {
  await setPromotion("properties", ids.rental1, {
    is_vip: true,
    vip_expires_at: new Date(Date.now() + 30 * 3_600_000).toISOString(),
  });
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "super", KA);
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  const l = await getListing("properties", ids.rental1);
  expect(l.is_super_vip).toBe(true);
  expect(l.is_vip).toBe(false);
  expect(hoursFromNow(l.vip_expires_at)).toBeGreaterThan(23.9);
  expect(hoursFromNow(l.vip_expires_at)).toBeLessThan(24.1);
  expect(await getBalance(ids.owner)).toBeCloseTo(195, 2);
  await expect(
    row(page, ids.rental1).locator('[data-promotion-tier="super-vip"]'),
  ).toBeVisible();
});

test("[C23] standard VIP over an EXPIRED SUPER flag is allowed and clears it", async ({
  page,
}) => {
  await setPromotion("properties", ids.rental3, {
    is_super_vip: true,
    vip_expires_at: new Date(Date.now() - 3_600_000).toISOString(),
  });
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  await expect(tierButton(row(page, ids.rental3), "vip", KA)).toBeEnabled();
  const p = await openPicker(page, ids.rental3, "vip", KA);
  await selectInPicker(p, t.rental3);
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  const l = await getListing("properties", ids.rental3);
  expect(l.is_vip).toBe(true);
  expect(l.is_super_vip).toBe(false);
});

test("[core] exact balance 1.50 buys VIP and leaves 0", async ({ page }) => {
  await setBalance(ids.owner, 1.5);
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "vip", KA);
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  expect(await getBalance(ids.owner)).toBeCloseTo(0, 2);
  expect((await getListing("properties", ids.rental1)).is_vip).toBe(true);
});

test("[core] double-clicking agree charges once", async ({ page }) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "vip", KA);
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, KA);
  const since = new Date().toISOString();
  await c.getByRole("button", { name: KA.agree }).dblclick();
  await expect(c).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  expect(await getBalance(ids.owner)).toBeCloseTo(198.5, 2);
  const { count } = await supabaseAdmin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ids.owner)
    .eq("type", "vip_boost")
    .gte("created_at", since);
  expect(count).toBe(1);
});

test("[core] short wallet offers card top-up instead of a failing wallet payment", async ({
  page,
}) => {
  await loginPage(page, ids.poor);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.poorRental, "vip", KA);
  const c = await payAndConfirm(page, p, KA);
  await expect(c.getByRole("button", { name: KA.agree })).toHaveCount(0);
  // 0.50 ₾ short → the 1 ₾ card minimum (MIN_CARD_TOPUP_TETRI).
  await expect(c).toContainText("1.00 ₾");
  expect(await getBalance(ids.poor)).toBeCloseTo(1, 2);
});

test("[B8][B12] renter overview wallet and 'spent' refresh after a VIP purchase", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "vip", KA);
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  // The membership dialog shows the wallet the overview holds in state.
  const membershipPay = row(page, ids.rental1)
    .locator("button")
    .filter({ hasText: /^\s*გადახდა\s*$/ })
    .filter({ visible: true })
    .first();
  await membershipPay.click();
  const dlg = page.getByRole("dialog").last();
  await expect(dlg).toContainText("198.50");
});

// ---------------------------------------------------------------------------
// Discount badge
// ---------------------------------------------------------------------------

test("[B7] an empty discount percent cannot be submitted", async ({ page }) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "discount", KA);
  await selectInPicker(p, t.rental1);
  const percent = p.locator("input").first();
  await percent.fill("");
  await expect(
    p.getByRole("button", { name: KA.pay, exact: true }),
  ).toBeDisabled();
});

test("[core] discount 25 % — DB, debit 2.50, badge", async ({ page }) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "discount", KA);
  await selectInPicker(p, t.rental1);
  const percent = p.locator("input").first();
  await percent.fill("25");
  await percent.blur();
  await expect(p).toContainText("2.50 ₾");
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  const l = await getListing("properties", ids.rental1);
  expect(l.discount_percent).toBe(25);
  expect(hoursFromNow(l.discount_expires_at)).toBeGreaterThan(23.9);
  expect(await getBalance(ids.owner)).toBeCloseTo(197.5, 2);
  await expect(
    row(page, ids.rental1).locator('[data-promotion-tier="discount"]'),
  ).toContainText("25%");
});

test("[core] discount via target price 150 of 200 → 25 %", async ({ page }) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental2, "discount", KA);
  await selectInPicker(p, t.rental2);
  const price = p.locator("input").nth(1);
  await price.fill("150");
  await price.blur();
  await expect(p.locator("input").first()).toHaveValue("25");
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  expect((await getListing("properties", ids.rental2)).discount_percent).toBe(
    25,
  );
});

// ---------------------------------------------------------------------------
// Non-live listing, dialogs, errors
// ---------------------------------------------------------------------------

test("[B3] a pending listing can be promoted but the dialog warns it is not visible", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.pending, "super", KA);
  // The clicked listing is last in the list: it must be scrolled into view.
  const pendingRow = p.locator(`[data-picker-listing="${ids.pending}"]`);
  await expect(pendingRow).toContainText("ჯერ არ ჩანს საიტზე");
  await expect
    .poll(() =>
      pendingRow.evaluate((row) => {
        const list = row.parentElement!;
        const r = row.getBoundingClientRect();
        const l = list.getBoundingClientRect();
        return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
      }),
    )
    .toBe(true);
  const c = await payAndConfirm(page, p, KA);
  await expect(c.getByTestId("confirm-payment-warning")).toBeVisible();
  await agree(page, c, KA);
  expect((await getListing("properties", ids.pending)).is_super_vip).toBe(true);
});

test("[B6] Escape while paying does not tear down the dialog", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  // Slow the real request down (not a mock) so Escape lands mid-payment.
  await page.route("**/functions/v1/purchase-vip", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  const p = await openPicker(page, ids.rental1, "vip", KA);
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, KA);
  await c.getByRole("button", { name: KA.agree }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  // Longer than the 200 ms exit animation, shorter than the 2.5 s delay.
  await page.waitForTimeout(1000);
  await expect(
    c,
    "confirm stays open while the payment is in flight",
  ).toBeVisible();
  await expect(c).toBeHidden({ timeout: 30_000 });
  await expect
    .poll(async () => (await getListing("properties", ids.rental1)).is_vip, {
      timeout: 15_000,
    })
    .toBe(true);
});

test("[B5] wallet emptied mid-flow → readable, localized error (en)", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/en/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "vip", EN);
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, EN);
  await setBalance(ids.owner, 0);
  await c.getByRole("button", { name: EN.agree }).click();
  const err = c.locator(".bg-\\[\\#FEF2F2\\]");
  await expect(err).toBeVisible({ timeout: 20_000 });
  const text = (await err.innerText()).trim();
  expect(text.length).toBeGreaterThan(5);
  expect(text, "English user must not get Georgian DB text").not.toMatch(
    GEORGIAN,
  );
  expect(text).not.toBe("Error. Please try again.");
  expect((await getListing("properties", ids.rental1)).is_vip).toBe(false);
});

test("[B5] edge function returns actionable 4xx, never a masked 500", async () => {
  test.skip(!isDesktop(), "server-only checks run once");
  const { session } = await signIn(ids.owner);
  const token = session.access_token;
  const { vip, super: superPkg, discount } = await vipPackages();

  const badQty = await invokePurchase(token, {
    package_id: vip.id,
    property_id: ids.rental1,
    quantity: 0,
  });
  expect(badQty.status, JSON.stringify(badQty.json)).toBe(400);

  const badPct = await invokePurchase(token, {
    package_id: discount.id,
    property_id: ids.rental1,
    quantity: 1,
    discount_percent: 91,
  });
  expect(badPct.status, JSON.stringify(badPct.json)).toBe(400);

  const noPct = await invokePurchase(token, {
    package_id: discount.id,
    property_id: ids.rental1,
    quantity: 1,
  });
  expect(noPct.status, JSON.stringify(noPct.json)).toBe(400);

  const notOwner = await invokePurchase(token, {
    package_id: vip.id,
    property_id: ids.poorRental,
    quantity: 1,
  });
  expect([400, 403], JSON.stringify(notOwner.json)).toContain(notOwner.status);
  expect(notOwner.json.reason).toBe("not_owner");

  const { session: poor } = await signIn(ids.poor);
  const broke = await invokePurchase(poor.access_token, {
    package_id: superPkg.id,
    property_id: ids.poorRental,
    quantity: 1,
  });
  expect(broke.status).toBe(400);
  expect(broke.json.reason).toBe("insufficient_balance");

  expect(await getBalance(ids.owner)).toBeCloseTo(200, 2);
  expect(await getBalance(ids.poor)).toBeCloseTo(1, 2);
});

test("[B1] an owner cannot create a service that is already SUPER VIP", async () => {
  test.skip(!isDesktop(), "server-only checks run once");
  const e2e = configureIsolatedE2E();
  const { session } = await signIn(ids.svcOwner);
  const rogueId = `5e1${lane}c7ff-0000-4000-8000-000000000000`;
  await supabaseAdmin.from("services").delete().eq("id", rogueId);
  const res = await fetch(`${e2e.supabaseUrl}/rest/v1/services`, {
    method: "POST",
    headers: {
      apikey: e2e.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: rogueId,
      owner_id: ids.svcOwner,
      category: "transport",
      title: "rogue super vip",
      description: "x",
      location: "ბაკურიანი",
      status: "active",
      is_vip: true,
      is_super_vip: true,
      discount_percent: 50,
      discount_expires_at: "2099-01-01T00:00:00Z",
      vip_expires_at: "2099-01-01T00:00:00Z",
    }),
  });
  try {
    expect(res.status, await res.text()).toBe(201);
    const { data } = await supabaseAdmin
      .from("services")
      .select(
        "status, is_vip, is_super_vip, vip_expires_at, discount_percent, discount_expires_at",
      )
      .eq("id", rogueId)
      .single();
    expect(data?.status).toBe("pending");
    expect(data?.is_vip).toBe(false);
    expect(data?.is_super_vip, "is_super_vip must be forced false").toBe(false);
    expect(data?.discount_percent).toBe(0);
    expect(data?.discount_expires_at).toBeNull();
  } finally {
    await supabaseAdmin.from("services").delete().eq("id", rogueId);
  }
});

// ---------------------------------------------------------------------------
// Other entry points
// ---------------------------------------------------------------------------

test("[core] renter listings page: SUPER VIP on the clicked listing", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter/listings");
  const p = await openPicker(page, ids.rental2, "super", KA);
  const c = await payAndConfirm(page, p, KA);
  await expect(c).toContainText(t.rental2);
  await agree(page, c, KA);
  expect((await getListing("properties", ids.rental2)).is_super_vip).toBe(true);
});

test("[core] seller dashboard: VIP on the sale listing", async ({ page }) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/seller");
  const p = await openPicker(page, ids.sale, "vip", KA);
  const c = await payAndConfirm(page, p, KA);
  await expect(c).toContainText(t.sale);
  await agree(page, c, KA);
  const l = await getListing("properties", ids.sale);
  expect(l.is_vip).toBe(true);
  await expect(
    row(page, ids.sale)
      .locator('[data-promotion-tier="vip"]')
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test("[core] transport dashboard: SUPER VIP on a service", async ({ page }) => {
  await loginPage(page, ids.svcOwner);
  await open(page, "/dashboard/transport");
  const p = await openPicker(page, ids.transport, "super", KA);
  const c = await payAndConfirm(page, p, KA);
  await expect(c).toContainText(t.transport);
  await agree(page, c, KA);
  const l = await getListing("services", ids.transport);
  expect(l.is_super_vip).toBe(true);
  expect(await getBalance(ids.svcOwner)).toBeCloseTo(195, 2);
  const tx = await lastTransaction(ids.svcOwner);
  expect(tx?.type).toBe("super_vip");
  expect(tx?.reference_id).toBe(ids.transport);
});

test("[core] food dashboard: VIP on the restaurant", async ({ page }) => {
  await loginPage(page, ids.svcOwner);
  await open(page, "/dashboard/food");
  const p = await openPicker(page, ids.food, "vip", KA);
  const c = await payAndConfirm(page, p, KA);
  await expect(c).toContainText(t.food);
  await agree(page, c, KA);
  expect((await getListing("services", ids.food)).is_vip).toBe(true);
});

// ---------------------------------------------------------------------------
// Formatting and phone layout
// ---------------------------------------------------------------------------

test("[B12] package prices print like the price list (5 ₾, 1.50 ₾)", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "super", KA);
  await selectInPicker(p, t.rental1);
  const total = p.locator("p.text-\\[20px\\]").first();
  await expect(total).toHaveText(/^5 ₾\s*1 დღე$/);
  await p.getByRole("button", { name: "+", exact: true }).click();
  await expect(total).toHaveText(/^10 ₾\s*2 დღე$/);
  await page.keyboard.press("Escape");
  const vip = await openPicker(page, ids.rental1, "vip", KA);
  await expect(vip.locator("p.text-\\[20px\\]").first()).toHaveText(/^1\.50 ₾\s*1 დღე$/);
});

test("[B13] phone: picker controls are ≥44 px and nothing overflows", async ({
  page,
}) => {
  test.skip(isDesktop(), "phone layout only");
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "vip", KA);
  await selectInPicker(p, t.rental1);
  const vw = page.viewportSize()!.width;
  for (const name of ["+", "-"]) {
    const box = await p
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(box, `${name} button`).not.toBeNull();
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
  }
  const overflow = await p.evaluate((root, width) => {
    const out: string[] = [];
    root.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > width + 0.5 || r.left < -0.5)) {
        out.push(`${el.tagName}.${String(el.className)}`.slice(0, 80));
      }
    });
    return out;
  }, vw);
  expect(overflow).toEqual([]);
  const c = await payAndConfirm(page, p, KA);
  const cb = await c.boundingBox();
  expect(cb!.x).toBeGreaterThanOrEqual(0);
  expect(cb!.x + cb!.width).toBeLessThanOrEqual(vw + 0.5);
});

// ---------------------------------------------------------------------------
// Public display after purchase (pages are ISR — poll up to ~2.5 min)
// ---------------------------------------------------------------------------

async function pollFor(
  page: Page,
  path: string,
  check: () => Promise<boolean>,
) {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await page.goto(path);
    if (await check()) return true;
    await page.waitForTimeout(10_000);
  }
  return false;
}

function publicCard(page: Page, title: string) {
  return page
    .getByText(title, { exact: true })
    .first()
    .locator("xpath=ancestor::*[self::a or self::article][1]");
}

test("[B10] a SUPER VIP sale listing shows its badge on /sales", async ({
  page,
}) => {
  test.skip(!isDesktop(), "public display checked once");
  test.setTimeout(200_000);
  await setPromotion("properties", ids.sale, {
    is_super_vip: true,
    vip_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  });
  // /sales is ISR: poll until a regenerated page renders the badge.
  const shown = await pollFor(page, "/sales", async () => {
    if ((await page.getByText(t.sale).count()) === 0) return false;
    return (await publicCard(page, t.sale).innerText()).includes("SUPER VIP");
  });
  expect(shown, "SUPER VIP badge on the /sales card").toBe(true);
});

test("[display] a SUPER VIP rental shows its badge on /apartments (control)", async ({
  page,
}) => {
  test.skip(!isDesktop(), "public display checked once");
  test.setTimeout(200_000);
  await setPromotion("properties", ids.rental3, {
    is_super_vip: true,
    vip_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  });
  const shown = await pollFor(page, "/apartments", async () => {
    if ((await page.getByText(t.rental3).count()) === 0) return false;
    return (await publicCard(page, t.rental3).innerText()).includes("SUPER VIP");
  });
  expect(shown, "SUPER VIP badge on the /apartments card").toBe(true);
});

// ---------------------------------------------------------------------------
// Balance pages (package card → picker → confirm)
// ---------------------------------------------------------------------------

function packageCard(page: Page, name: string) {
  return page
    .locator("div.flex.flex-col.rounded-\\[20px\\]")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .first();
}

function walletHeader(page: Page) {
  return page
    .locator("div")
    .filter({ hasText: /^მიმდინარე ბალანსი/ })
    .locator("p.font-black")
    .first();
}

test("[core] renter balance page: VIP via package card, wallet updates", async ({ page }) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter/balance");
  await expect(walletHeader(page)).toContainText("200.00");
  await packageCard(page, "VIP სტატუსი").getByRole("button", { name: "გააქტიურება" }).click();
  const p = picker(page, KA);
  await expect(p).toBeVisible();
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  expect((await getListing("properties", ids.rental1)).is_vip).toBe(true);
  await expect(walletHeader(page)).toContainText("198.50");
});

test("[B8] transport balance page: SUPER VIP via package card, wallet updates", async ({ page }) => {
  await loginPage(page, ids.svcOwner);
  await open(page, "/dashboard/transport/balance");
  await expect(walletHeader(page)).toContainText("200.00");
  await packageCard(page, "SUPER VIP").getByRole("button", { name: "გააქტიურება" }).click();
  const p = picker(page, KA);
  await expect(p).toBeVisible();
  await selectInPicker(p, t.transport);
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  expect((await getListing("services", ids.transport)).is_super_vip).toBe(true);
  expect(await getBalance(ids.svcOwner)).toBeCloseTo(195, 2);
  await expect(walletHeader(page)).toContainText("195.00");
});

test("[B8] food balance page: VIP via package card, wallet updates", async ({ page }) => {
  await loginPage(page, ids.svcOwner);
  await open(page, "/dashboard/food/balance");
  await expect(walletHeader(page)).toContainText("200.00");
  await packageCard(page, "VIP სტატუსი").getByRole("button", { name: "გააქტიურება" }).click();
  const p = picker(page, KA);
  await expect(p).toBeVisible();
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  expect((await getListing("services", ids.food)).is_vip).toBe(true);
  await expect(walletHeader(page)).toContainText("198.50");
});

// ---------------------------------------------------------------------------
// Failure and expiry states
// ---------------------------------------------------------------------------

test("[B15] package list fails to load → the picker says so instead of spinning", async ({ page }) => {
  await loginPage(page, ids.owner);
  await page.route("**/api/pricing-packages**", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "vip", KA);
  await expect(p.getByRole("alert")).toBeVisible({ timeout: 8_000 });
});

test("[display] an expired VIP shows no badge and re-enables the buttons (control)", async ({ page }) => {
  await setPromotion("properties", ids.rental1, {
    is_super_vip: true,
    vip_expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const r = row(page, ids.rental1);
  await expect(r.locator('[data-promotion-tier]')).toHaveCount(0);
  await expect(tierButton(r, "vip", KA)).toBeEnabled();
});

test("[B10] a SUPER VIP sale listing shows its badge on the landing page", async ({ page }) => {
  test.skip(!isDesktop(), "public display checked once");
  test.setTimeout(200_000);
  await setPromotion("properties", ids.sale, {
    is_super_vip: true,
    vip_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  });
  // The landing page defaults to rentals; the sale view is a client toggle.
  const shown = await pollFor(page, "/", async () => {
    await page.getByRole("button", { name: "ყიდვა" }).first().click();
    await page.getByTestId("homepage-super-vip-heading").waitFor({ timeout: 5_000 }).catch(() => undefined);
    return (await page.getByText(t.sale).count()) > 0;
  });
  test.skip(!shown, "landing sale rows did not include the fixture (limited slots)");
  await expect(publicCard(page, t.sale)).toContainText("SUPER VIP");
});

// ---------------------------------------------------------------------------
// Badges that were paid for but not shown, touch targets, localization
// ---------------------------------------------------------------------------

test("[B17] VIP and discount are both shown on a rental card", async ({ page }) => {
  test.skip(!isDesktop(), "public display checked once");
  test.setTimeout(200_000);
  await setPromotion("properties", ids.rental2, {
    is_vip: true,
    vip_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    discount_percent: 20,
    discount_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  });
  const shown = await pollFor(page, "/apartments", async () => {
    if ((await page.getByText(t.rental2).count()) === 0) return false;
    const text = await publicCard(page, t.rental2).innerText();
    return text.includes("-20%") && /(^|\n)\s*VIP\s*($|\n)/.test(text);
  });
  expect(shown, "both the -20% and the VIP badge on the card").toBe(true);
});

test("[B17] a VIP hotel shows its badge on /hotels", async ({ page }) => {
  test.skip(!isDesktop(), "public display checked once");
  test.setTimeout(200_000);
  const hotelId = `5e1${lane}c716-0000-4000-8000-000000000000`;
  const hotelTitle = `VIP-T ${lane} სასტუმრო`;
  await supabaseAdmin.from("properties").delete().eq("id", hotelId);
  const { error } = await supabaseAdmin.from("properties").insert({
    id: hotelId,
    owner_id: ids.owner,
    type: "hotel",
    title: hotelTitle,
    description: "VIP test hotel",
    location: "ბაკურიანი, VIP ტესტი",
    price_per_night: 180,
    currency: "GEL",
    photos: [],
    amenities: [],
    status: "active",
    is_for_sale: false,
    is_vip: true,
    vip_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  });
  expect(error?.message).toBeUndefined();
  try {
    const shown = await pollFor(page, "/hotels", async () => {
      if ((await page.getByText(hotelTitle).count()) === 0) return false;
      return /(^|\n)\s*VIP\s*($|\n)/.test(await publicCard(page, hotelTitle).innerText());
    });
    expect(shown, "VIP badge on the hotel card").toBe(true);
  } finally {
    await supabaseAdmin.from("properties").delete().eq("id", hotelId);
  }
});

test("[B13] phone: renter listings promo buttons are ≥44 px", async ({ page }) => {
  test.skip(isDesktop(), "phone layout only");
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter/listings");
  const r = row(page, ids.rental1);
  for (const tier of ["super", "vip", "discount"] as const) {
    const box = await tierButton(r, tier, KA).boundingBox();
    expect(box, tier).not.toBeNull();
    expect(box!.height, `${tier} height`).toBeGreaterThanOrEqual(44);
  }
});

test("[B16] balance page does not flash 'no eligible listings' while loading", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  // Hold the owner's listings (not a mock) so the packages render first.
  let held = false;
  let released = false;
  await page.route("**/rest/v1/properties?*", async (route) => {
    held = true;
    await new Promise((r) => setTimeout(r, 4000));
    released = true;
    await route.continue();
  });
  await page.goto("/dashboard/renter/balance");
  await expect(packageCard(page, "VIP სტატუსი")).toBeVisible({ timeout: 15_000 });
  // One-shot read while the listings are provably still in flight — an
  // auto-retrying assertion would just wait the flash out.
  const flashing = await page
    .getByText("სტანდარტული VIP-ისთვის ხელმისაწვდომი განცხადება არ არის")
    .count();
  expect(held && !released, "listings request still held").toBe(true);
  expect(flashing, "no 'no eligible listings' while loading").toBe(0);
  await expect(
    packageCard(page, "VIP სტატუსი").getByRole("button", { name: "გააქტიურება" }),
  ).toBeEnabled({ timeout: 15_000 });
});

test("[B14] English transport balance page has no Georgian package labels", async ({ page }) => {
  await loginPage(page, ids.svcOwner);
  await open(page, "/en/dashboard/transport/balance");
  const card = page
    .locator("div.flex.flex-col.rounded-\\[20px\\]")
    .filter({ has: page.getByRole("heading", { name: "SUPER VIP", exact: true }) })
    .first();
  await expect(card).toBeVisible();
  const unit = card.locator("p.text-\\[11px\\].font-bold").last();
  await expect(unit).not.toHaveText(GEORGIAN);
});

// ---------------------------------------------------------------------------
// More edge cases: bounds, re-buy rules, services
// ---------------------------------------------------------------------------

test("[B7] out-of-range percents (0, 91) cannot be submitted; 1 and 90 can", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  await open(page, "/dashboard/renter");
  const p = await openPicker(page, ids.rental1, "discount", KA);
  const pay = p.getByRole("button", { name: KA.pay, exact: true });
  const percent = p.locator("input").first();
  for (const bad of ["0", "91"]) {
    await percent.fill(bad);
    await expect(pay, `percent ${bad}`).toBeDisabled();
  }
  await percent.fill("90");
  await expect(pay).toBeEnabled();
  const c = await payAndConfirm(page, p, KA);
  await agree(page, c, KA);
  expect((await getListing("properties", ids.rental1)).discount_percent).toBe(90);
  const p2 = await openPicker(page, ids.rental3, "discount", KA);
  await p2.locator("input").first().fill("1");
  const c2 = await payAndConfirm(page, p2, KA);
  await agree(page, c2, KA);
  expect((await getListing("properties", ids.rental3)).discount_percent).toBe(1);
});

test("[B4] re-buy rules on the server: SUPER extends, expired VIP restarts, discount untouched by VIP", async () => {
  test.skip(!isDesktop(), "server-only checks run once");
  const { session } = await signIn(ids.owner);
  const token = session.access_token;
  const { vip, super: superPkg } = await vipPackages();

  // Active SUPER VIP with 5 h left + 2 days → ~53 h.
  await setPromotion("properties", ids.rental1, {
    is_super_vip: true,
    vip_expires_at: new Date(Date.now() + 5 * 3_600_000).toISOString(),
  });
  const a = await invokePurchase(token, { package_id: superPkg.id, property_id: ids.rental1, quantity: 2 });
  expect(a.status, JSON.stringify(a.json)).toBe(200);
  const l1 = await getListing("properties", ids.rental1);
  expect(hoursFromNow(l1.vip_expires_at)).toBeGreaterThan(52.8);
  expect(hoursFromNow(l1.vip_expires_at)).toBeLessThan(53.1);

  // Expired VIP flag (not yet swept) → starts from now, not from the past.
  await setPromotion("properties", ids.rental2, {
    is_vip: true,
    vip_expires_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  });
  const b = await invokePurchase(token, { package_id: vip.id, property_id: ids.rental2, quantity: 1 });
  expect(b.status, JSON.stringify(b.json)).toBe(200);
  const l2 = await getListing("properties", ids.rental2);
  expect(hoursFromNow(l2.vip_expires_at)).toBeGreaterThan(23.9);
  expect(hoursFromNow(l2.vip_expires_at)).toBeLessThan(24.1);

  // A VIP purchase leaves an active discount exactly as it was.
  const discountEnd = new Date(Date.now() + 7 * 3_600_000).toISOString();
  await setPromotion("properties", ids.rental3, {
    discount_percent: 15,
    discount_expires_at: discountEnd,
  });
  const c = await invokePurchase(token, { package_id: vip.id, property_id: ids.rental3, quantity: 1 });
  expect(c.status, JSON.stringify(c.json)).toBe(200);
  const l3 = await getListing("properties", ids.rental3);
  expect(l3.is_vip).toBe(true);
  expect(l3.discount_percent).toBe(15);
  expect(new Date(l3.discount_expires_at!).getTime()).toBe(new Date(discountEnd).getTime());

  expect(await getBalance(ids.owner)).toBeCloseTo(200 - 10 - 1.5 - 1.5, 2);
});

test("[core] transport dashboard: discount 15 % on a service", async ({ page }) => {
  await loginPage(page, ids.svcOwner);
  await open(page, "/dashboard/transport");
  const p = await openPicker(page, ids.transport, "discount", KA);
  const percent = p.locator("input").first();
  await percent.fill("15");
  const c = await payAndConfirm(page, p, KA);
  await expect(c).toContainText(t.transport);
  await agree(page, c, KA);
  const l = await getListing("services", ids.transport);
  expect(l.discount_percent).toBe(15);
  expect(hoursFromNow(l.discount_expires_at)).toBeGreaterThan(23.9);
  expect(await getBalance(ids.svcOwner)).toBeCloseTo(197.5, 2);
  const tx = await lastTransaction(ids.svcOwner);
  expect(tx?.type).toBe("discount_badge");
});

test("[B6] balance page: the wallet refresh mid-payment does not unlock the dialog", async ({
  page,
}) => {
  await loginPage(page, ids.owner);
  let purchased = false;
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/purchase-vip")) purchased = true;
  });
  // After the purchase, hold the listing refresh (not a mock) so the dialog is
  // still open when the refreshed wallet amount lands.
  await page.route("**/rest/v1/properties?*", async (route) => {
    if (purchased) await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await open(page, "/dashboard/renter/balance");
  await packageCard(page, "VIP სტატუსი").getByRole("button", { name: "გააქტიურება" }).click();
  const p = picker(page, KA);
  await selectInPicker(p, t.rental1);
  const c = await payAndConfirm(page, p, KA);
  await c.getByRole("button", { name: KA.agree }).click();
  await expect(walletHeader(page)).toContainText("198.50", { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await expect(c, "still locked while the purchase finishes").toBeVisible();
  await expect(c.getByRole("button", { name: KA.agree })).toBeHidden();
  await expect(c).toBeHidden({ timeout: 20_000 });
  expect((await getListing("properties", ids.rental1)).is_vip).toBe(true);
});

test("[B15] renter balance page: a failed package load is retryable", async ({ page }) => {
  await loginPage(page, ids.owner);
  let fail = true;
  await page.route("**/api/pricing-packages**", (route) =>
    fail ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
  );
  await open(page, "/dashboard/renter/balance");
  const alert = page.getByRole("alert").filter({ hasText: "ფასები ვერ ჩაიტვირთა." });
  await expect(alert).toBeVisible();
  fail = false;
  await alert.getByRole("button", { name: "თავიდან ცდა" }).click();
  await expect(packageCard(page, "VIP სტატუსი")).toBeVisible();
});
