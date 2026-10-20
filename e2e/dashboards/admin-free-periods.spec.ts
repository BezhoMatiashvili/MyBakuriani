import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";
import { addDays, tbilisiToday } from "../../src/lib/free-periods";

// Admin free periods (C53). Registration windows sit ~400 days ahead and the
// "registrants" are synthetic users whose profiles.created_at is back-dated into
// that window, so no seeded or real account can ever match a test period.

const NAME = "E2E უფასო პერიოდი";
const today = tbilisiToday();
const FROM = addDays(today, 400);
const TO = addDays(today, 409);
const END = addDays(today, 460);
const INSIDE = addDays(FROM, 3);
const OUTSIDE = addDays(TO, 5);
const LATER_END = addDays(today, 480);

const createdPeriods: string[] = [];
const createdUsers: string[] = [];

/** APIRequestContext sends no Origin; the mutation guard (C8) needs the app's own. */
const sameOrigin = { origin: new URL(configureIsolatedE2E().baseUrl).origin };

/** Same instant the DB computes: the end of the Tbilisi day. */
const endOfDay = (day: string) => `${day}T23:59:59.999999+04:00`;

async function answerCookieBanner(page: Page) {
  await page.context().addCookies([
    {
      name: "mb_cookie_consent",
      value: encodeURIComponent("v2|analytics=0|location=0"),
      url: configureIsolatedE2E().baseUrl,
    },
  ]);
}

function body(over: Record<string, unknown> = {}) {
  return {
    name: `${NAME} ${randomUUID().slice(0, 6)}`,
    benefit: "membership",
    registrationFrom: FROM,
    registrationTo: TO,
    endDate: END,
    roles: ["cleaner"],
    isActive: true,
    ...over,
  };
}

/** A synthetic sign-up: auth user + profile registered at noon of `day`. */
async function registerOn(day: string, role = "cleaner"): Promise<string> {
  const id = randomUUID();
  const { error } = await supabaseAdmin.auth.admin.createUser({
    id,
    email: `free-period-${id.slice(0, 8)}@e2e.mybakuriani.test`,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  createdUsers.push(id);
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id,
    role: role as "cleaner",
    display_name: "E2E registrant",
    phone: `+99559${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    created_at: `${day}T12:00:00+04:00`,
  });
  if (profileError) throw new Error(`profile: ${profileError.message}`);
  return id;
}

async function memberships(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_subscriptions")
    .select("id, status, package_id, amount_paid, expires_at, review_note")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** An ACTIVE rental owned by `ownerId`; `tier` pre-sets a paid VIP the period must not touch. */
async function listing(
  ownerId: string,
  title: string,
  tier?: { expires: string },
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .insert({
      owner_id: ownerId,
      type: "apartment",
      title,
      description: "E2E free period",
      location: "ბაკურიანი",
      area_sqm: 40,
      rooms: 1,
      bathrooms: 1,
      capacity: 2,
      price_per_night: 100,
      currency: "GEL",
      amenities: [],
      house_rules: {},
      photos: ["/placeholder-property.jpg", "/placeholder-property.jpg"],
      status: "active",
      is_for_sale: false,
      ...(tier ? { is_vip: true, vip_expires_at: tier.expires } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`listing: ${error.message}`);
  return data.id;
}

async function vipRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("is_vip, is_super_vip, vip_expires_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

const at = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

test.afterAll(async () => {
  if (createdPeriods.length) {
    await supabaseAdmin.from("free_periods").delete().in("id", createdPeriods);
  }
  for (const id of createdUsers) {
    await supabaseAdmin.from("properties").delete().eq("owner_id", id);
    await supabaseAdmin.from("notifications").delete().eq("user_id", id);
    await supabaseAdmin.from("user_subscriptions").delete().eq("user_id", id);
    await supabaseAdmin.from("profiles").delete().eq("id", id);
    await supabaseAdmin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

test.describe("Admin free periods (C53)", () => {
  test.describe.configure({ mode: "serial" });

  // One membership at a time: a still-active earlier period would grant the next
  // registrant first, so every test leaves its periods paused.
  test.afterEach(async () => {
    if (!createdPeriods.length) return;
    await supabaseAdmin
      .from("free_periods")
      .update({ is_active: false })
      .in("id", createdPeriods);
  });

  test("a non-admin and a signed-out visitor are refused", async ({
    renterPage,
    request,
  }) => {
    expect((await request.get("/api/admin/free-periods")).status()).toBe(401);
    expect(
      (await renterPage.request.get("/api/admin/free-periods")).status(),
    ).toBe(403);
    expect(
      (
        await renterPage.request.post("/api/admin/free-periods", {
          headers: sameOrigin,
          data: body(),
        })
      ).status(),
    ).toBe(403);
    await renterPage.goto("/dashboard/admin/free-periods");
    await expect(renterPage.getByTestId("free-period-new")).toHaveCount(0);
  });

  // adminPage and renterPage share one browser context (and its cookies), so the
  // admin checks live in their own tests.
  test("the admin list answers no-store", async ({ adminPage }) => {
    const ok = await adminPage.request.get("/api/admin/free-periods");
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toContain("no-store");
    expect(Array.isArray((await ok.json()).periods)).toBe(true);
  });

  test("a bad request is refused with a specific code and creates nothing", async ({
    adminPage,
  }) => {
    const refuse = async (over: Record<string, unknown>, error: string) => {
      const res = await adminPage.request.post("/api/admin/free-periods", {
        headers: sameOrigin,
        data: body(over),
      });
      expect(res.status(), error).toBe(400);
      expect((await res.json()).error).toBe(error);
    };
    await refuse({ name: "   " }, "invalid_name");
    await refuse({ benefit: "company_plan" }, "invalid_benefit");
    await refuse({ roles: ["admin"] }, "invalid_roles");
    await refuse({ roles: [] }, "invalid_roles");
    await refuse({ endDate: addDays(TO, -1) }, "end_before_window_end");
    await refuse({ endDate: addDays(today, 900) }, "invalid_end_date");
    await refuse(
      { registrationFrom: TO, registrationTo: FROM },
      "invalid_window",
    );
    await refuse(
      { benefit: "membership", maxListings: 3 },
      "invalid_max_listings",
    );
    await refuse({ benefit: "vip", maxListings: 0 }, "invalid_max_listings");
  });

  test("a membership period reaches earlier registrants, new ones and no one else", async ({
    adminPage,
  }) => {
    const earlier = await registerOn(INSIDE);
    const outside = await registerOn(OUTSIDE);
    const otherRole = await registerOn(INSIDE, "food");

    const res = await adminPage.request.post("/api/admin/free-periods", {
      headers: sameOrigin,
      data: body(),
    });
    expect(res.status()).toBe(201);
    const created = await res.json();
    createdPeriods.push(created.period.id);
    expect(created.apply.granted_members).toBe(1);

    // Registered before the period existed: granted by the first sweep.
    const [row, ...rest] = await memberships(earlier);
    expect(rest).toHaveLength(0);
    expect(row.status).toBe("active");
    expect(row.package_id).toBeNull();
    expect(Number(row.amount_paid)).toBe(0);
    expect(new Date(row.expires_at).getTime()).toBe(
      new Date(endOfDay(END)).getTime(),
    );
    expect(row.review_note).toContain(created.period.name);

    // Wrong day, wrong role: nothing.
    expect(await memberships(outside)).toHaveLength(0);
    expect(await memberships(otherRole)).toHaveLength(0);

    // Registers after the period was saved: the sign-up trigger grants at once.
    const later = await registerOn(addDays(FROM, 5));
    const granted = await memberships(later);
    expect(granted).toHaveLength(1);
    expect(granted[0].status).toBe("active");

    const { data: notices } = await supabaseAdmin
      .from("notifications")
      .select("type, dashboard_scope")
      .eq("user_id", later);
    expect(notices?.map((n) => n.type)).toEqual(["membership_admin_update"]);

    // A free membership is never revenue.
    const { count } = await supabaseAdmin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", later);
    expect(count).toBe(0);

    // Applying again changes nothing.
    const again = await adminPage.request.post(
      `/api/admin/free-periods/${created.period.id}/apply`,
      { headers: sameOrigin },
    );
    expect(again.status()).toBe(200);
    expect((await again.json()).apply.granted_members).toBe(0);
    expect(await memberships(earlier)).toHaveLength(1);
  });

  test("editing re-dates live grants, a pause stops new ones, the benefit is locked", async ({
    adminPage,
  }) => {
    const res = await adminPage.request.post("/api/admin/free-periods", {
      headers: sameOrigin,
      data: body(),
    });
    const { period } = await res.json();
    createdPeriods.push(period.id);
    // The sign-up trigger grants at once; the sweep then has nothing left to do.
    const user = await registerOn(INSIDE);
    expect(await memberships(user)).toHaveLength(1);
    const sweep = await adminPage.request.post(
      `/api/admin/free-periods/${period.id}/apply`,
      { headers: sameOrigin },
    );
    expect((await sweep.json()).apply.granted_members).toBe(0);

    const moved = await adminPage.request.patch(
      `/api/admin/free-periods/${period.id}`,
      { headers: sameOrigin, data: { endDate: LATER_END } },
    );
    expect(moved.status()).toBe(200);
    expect(new Date((await memberships(user))[0].expires_at).getTime()).toBe(
      new Date(endOfDay(LATER_END)).getTime(),
    );

    const locked = await adminPage.request.patch(
      `/api/admin/free-periods/${period.id}`,
      { headers: sameOrigin, data: { benefit: "vip" } },
    );
    expect(locked.status()).toBe(409);
    expect((await locked.json()).error).toBe("benefit_locked");

    const paused = await adminPage.request.patch(
      `/api/admin/free-periods/${period.id}`,
      { headers: sameOrigin, data: { isActive: false } },
    );
    expect(paused.status()).toBe(200);
    const afterPause = await registerOn(addDays(FROM, 6));
    expect(await memberships(afterPause)).toHaveLength(0);
    // Pausing revoked nothing.
    expect(await memberships(user)).toHaveLength(1);

    const missing = await adminPage.request.patch(
      `/api/admin/free-periods/${randomUUID()}`,
      { headers: sameOrigin, data: { name: "x" } },
    );
    expect(missing.status()).toBe(404);
  });

  test("a draft SUPER VIP period lists its counters", async ({ adminPage }) => {
    const res = await adminPage.request.post("/api/admin/free-periods", {
      headers: sameOrigin,
      data: body({
        benefit: "super_vip",
        roles: ["cleaner"],
        maxListings: 2,
        isActive: false,
      }),
    });
    expect(res.status()).toBe(201);
    const { period } = await res.json();
    createdPeriods.push(period.id);
    expect(period.benefit).toBe("super_vip");
    expect(period.maxListings).toBe(2);
    expect(period.state).toBe("paused");

    const list = await (
      await adminPage.request.get("/api/admin/free-periods")
    ).json();
    const listed = list.periods.find((p: { id: string }) => p.id === period.id);
    expect(listed.grantedListings).toBe(0);
    expect(listed.waiting).toBe(0);
  });

  test("a VIP period flags active listings, respects the cap and leaves a paid tier alone", async ({
    adminPage,
  }) => {
    const owner = await registerOn(INSIDE);
    const outsider = await registerOn(OUTSIDE);
    const paidUntil = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const first = await listing(owner, "E2E free VIP 1");
    const second = await listing(owner, "E2E free VIP 2");
    const paid = await listing(owner, "E2E paid VIP", { expires: paidUntil });
    const outside = await listing(outsider, "E2E outside the window");

    const res = await adminPage.request.post("/api/admin/free-periods", {
      headers: sameOrigin,
      data: body({ benefit: "super_vip", maxListings: 1 }),
    });
    expect(res.status()).toBe(201);
    const { period, apply } = await res.json();
    createdPeriods.push(period.id);
    expect(apply.granted_listings).toBe(1);

    // The oldest eligible listing, as SUPER VIP until the end of the chosen day.
    const granted = await vipRow(first);
    expect(granted.is_super_vip).toBe(true);
    expect(granted.is_vip).toBe(false);
    expect(at(granted.vip_expires_at)).toBe(at(endOfDay(END)));
    // Over the cap, outside the window, and a paid tier: untouched.
    expect((await vipRow(second)).is_super_vip).toBe(false);
    expect((await vipRow(outside)).is_super_vip).toBe(false);
    const kept = await vipRow(paid);
    expect(kept.is_vip).toBe(true);
    expect(kept.is_super_vip).toBe(false);
    expect(at(kept.vip_expires_at)).toBe(at(paidUntil));

    const { data: notices } = await supabaseAdmin
      .from("notifications")
      .select("type")
      .eq("user_id", owner);
    expect(notices?.map((n) => n.type)).toEqual(["promotion_admin_update"]);

    // A new end date re-dates the live grant.
    const moved = await adminPage.request.patch(
      `/api/admin/free-periods/${period.id}`,
      { headers: sameOrigin, data: { endDate: LATER_END } },
    );
    expect(moved.status()).toBe(200);
    expect(at((await vipRow(first)).vip_expires_at)).toBe(
      at(endOfDay(LATER_END)),
    );

    // Raising the cap reaches the next listing; nothing is granted twice.
    const raised = await adminPage.request.patch(
      `/api/admin/free-periods/${period.id}`,
      { headers: sameOrigin, data: { maxListings: 2 } },
    );
    expect(raised.status()).toBe(200);
    expect((await vipRow(second)).is_super_vip).toBe(true);
    const again = await adminPage.request.post(
      `/api/admin/free-periods/${period.id}/apply`,
      { headers: sameOrigin },
    );
    expect((await again.json()).apply.granted_listings).toBe(0);
  });

  test("the admin creates and edits a draft period in the UI", async ({
    adminPage,
  }) => {
    await answerCookieBanner(adminPage);
    await adminPage.goto("/dashboard/admin/free-periods");
    if (adminPage.url().includes("/auth/login")) return;

    const name = `${NAME} UI ${randomUUID().slice(0, 6)}`;
    await adminPage.getByTestId("free-period-new").click();
    const form = adminPage.getByTestId("free-period-form");
    await expect(form).toBeVisible();
    await form.locator("#fp-name").fill(name);
    // The default window includes today: keep it a draft so nobody is granted.
    await adminPage.getByTestId("free-period-active").uncheck();
    await expect(adminPage.getByTestId("free-period-summary")).toBeVisible();
    await adminPage.getByTestId("free-period-save").click();

    const card = adminPage
      .getByTestId("free-period-card")
      .filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-state", "paused");
    await expect(card.getByTestId("free-period-granted")).toHaveText("0");

    const { data: row } = await supabaseAdmin
      .from("free_periods")
      .select("id")
      .eq("name", name)
      .single();
    if (row) createdPeriods.push(row.id);

    await card.getByTestId("free-period-edit").click();
    const renamed = `${name} ✎`;
    await adminPage
      .getByTestId("free-period-form")
      .locator("#fp-name")
      .fill(renamed);
    await adminPage.getByTestId("free-period-save").click();
    await expect(
      adminPage.getByTestId("free-period-card").filter({ hasText: renamed }),
    ).toBeVisible();
  });
});
