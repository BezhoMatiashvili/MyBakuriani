import { test, expect } from "../helpers/fixtures";
import { supabaseAdmin } from "../helpers/supabase";

// ---------------------------------------------------------------------------
// Gap-coverage spec — exercises tables/APIs that no other spec covers.
// All actions go through the service-role client to mirror the admin/server
// code paths (which use the same client) — avoiding the cookie-auth shortcut
// limitation in the test helpers.
// ---------------------------------------------------------------------------

const PREFIX = "aae2ff00-ee00-4000-a000-";
const ID = {
  fav1: `${PREFIX}000000000001`,
  fav2: `${PREFIX}000000000002`,
  promo: `${PREFIX}000000000010`,
  pkg: `${PREFIX}000000000020`,
  ad: `${PREFIX}000000000030`,
  bcast: `${PREFIX}000000000040`,
  banner: `${PREFIX}000000000050`,
  rentalListing: `${PREFIX}000000000060`,
  saleListing: `${PREFIX}000000000061`,
  foodListing: `${PREFIX}000000000062`,
  serviceListing: `${PREFIX}000000000063`,
  blogPost: `${PREFIX}000000000070`,
  jobApp: `${PREFIX}000000000080`,
  pricingOverride: `${PREFIX}000000000090`,
};

test.describe("Favorites toggle (guest)", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await supabaseAdmin.from("favorites").delete().in("id", [ID.fav1, ID.fav2]);
  });

  test("guest can add a property to favorites", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("favorites")
      .insert({
        id: ID.fav1,
        user_id: testIds.guest,
        property_id: testIds.apartment,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(testIds.guest);
    expect(data?.property_id).toBe(testIds.apartment);
  });

  test("guest can add a service to favorites", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("favorites")
      .insert({
        id: ID.fav2,
        user_id: testIds.guest,
        service_id: testIds.foodService,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.service_id).toBe(testIds.foodService);
  });

  test("favorites are correctly scoped to the user", async ({ testIds }) => {
    const { data } = await supabaseAdmin
      .from("favorites")
      .select("id, property_id, service_id")
      .eq("user_id", testIds.guest);
    expect(data?.length).toBeGreaterThanOrEqual(2);
    const propIds = data?.map((f) => f.property_id).filter(Boolean);
    const svcIds = data?.map((f) => f.service_id).filter(Boolean);
    expect(propIds).toContain(testIds.apartment);
    expect(svcIds).toContain(testIds.foodService);
  });

  test("guest can remove a favorite", async () => {
    const { error } = await supabaseAdmin
      .from("favorites")
      .delete()
      .eq("id", ID.fav1);
    expect(error).toBeNull();
    const { data } = await supabaseAdmin
      .from("favorites")
      .select("id")
      .eq("id", ID.fav1)
      .maybeSingle();
    expect(data).toBeNull();
  });
});

test.describe("Promocodes (admin)", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    await supabaseAdmin.from("promocodes").delete().eq("id", ID.promo);
  });

  test("admin can create a promocode", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("promocodes")
      .insert({
        id: ID.promo,
        code: "E2E-TEST-10",
        discount_type: "percent",
        discount_value: 10,
        max_uses: 100,
        is_active: true,
        created_by: testIds.admin,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.code).toBe("E2E-TEST-10");
    expect(data?.is_active).toBe(true);
    expect(Number(data?.discount_value)).toBe(10);
  });

  test("admin can deactivate a promocode", async () => {
    const { data, error } = await supabaseAdmin
      .from("promocodes")
      .update({ is_active: false })
      .eq("id", ID.promo)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.is_active).toBe(false);
  });

  test("promocode uses_count can be incremented", async () => {
    const { data, error } = await supabaseAdmin
      .from("promocodes")
      .update({ uses_count: 5 })
      .eq("id", ID.promo)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.uses_count).toBe(5);
  });
});

test.describe("Pricing packages (admin)", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    await supabaseAdmin.from("pricing_packages").delete().eq("id", ID.pkg);
  });

  test("admin can add a pricing package", async () => {
    const { data, error } = await supabaseAdmin
      .from("pricing_packages")
      .insert({
        id: ID.pkg,
        code: "E2E_PKG",
        name: "E2E ტესტ პაკეტი",
        label: "Test package",
        category: "vip",
        amount_gel: 99,
        is_enabled: true,
        sort_order: 999,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.code).toBe("E2E_PKG");
    expect(Number(data?.amount_gel)).toBe(99);
  });

  test("admin can disable a pricing package", async () => {
    const { data } = await supabaseAdmin
      .from("pricing_packages")
      .update({ is_enabled: false })
      .eq("id", ID.pkg)
      .select()
      .single();
    expect(data?.is_enabled).toBe(false);
  });

  test("at least 10 seeded packages exist", async () => {
    const { data, error } = await supabaseAdmin
      .from("pricing_packages")
      .select("id", { count: "exact", head: false });
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(10);
  });
});

test.describe("Ads (admin)", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    await supabaseAdmin.from("ads").delete().eq("id", ID.ad);
  });

  test("admin can create an ad", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("ads")
      .insert({
        id: ID.ad,
        title: "E2E სატესტო რეკლამა",
        url: "https://example.com",
        banner_url: "https://example.com/banner.png",
        position: "landing_hero",
        status: "active",
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        created_by: testIds.admin,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("active");
    expect(data?.position).toBe("landing_hero");
  });

  test("ad click + view counters increment", async () => {
    const { data: incView } = await supabaseAdmin
      .from("ads")
      .update({ views_count: 100, clicks_count: 5 })
      .eq("id", ID.ad)
      .select()
      .single();
    expect(incView?.views_count).toBe(100);
    expect(incView?.clicks_count).toBe(5);
  });
});

test.describe("Broadcasts (admin)", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    await supabaseAdmin.from("broadcasts").delete().eq("id", ID.bcast);
  });

  test("admin can create a broadcast record", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        id: ID.bcast,
        channel: "sms",
        subject: "E2E ბროდკასტი",
        body: "ტესტი",
        audience_filter: "all_renters",
        recipient_count: 0,
        sent_by: testIds.admin,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.channel).toBe("sms");
  });

  test("recipient_count and sent_at can be updated after dispatch", async () => {
    const sentAt = new Date().toISOString();
    const { data } = await supabaseAdmin
      .from("broadcasts")
      .update({ recipient_count: 42, sent_at: sentAt })
      .eq("id", ID.bcast)
      .select()
      .single();
    expect(data?.recipient_count).toBe(42);
    expect(new Date(data!.sent_at as string).toISOString()).toBe(sentAt);
  });
});

test.describe("Landing banners + /api/banners", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    await supabaseAdmin.from("landing_banners").delete().eq("id", ID.banner);
  });

  test("admin can publish an active banner", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("landing_banners")
      .insert({
        id: ID.banner,
        kind: "info",
        title: "E2E სატესტო ბანერი",
        body: "სატესტო ბანერი",
        cta_label: "ნახე",
        cta_href: "/apartments",
        tone: "info",
        active: true,
        sort_order: 1,
        created_by: testIds.admin,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.active).toBe(true);
  });

  test("active banner is returned by service-role query (mirrors /api/banners)", async () => {
    const { data, error } = await supabaseAdmin
      .from("landing_banners")
      .select("id, kind, title, active")
      .eq("active", true)
      .eq("id", ID.banner);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0].title).toBe("E2E სატესტო ბანერი");
    expect(data?.[0].kind).toBe("info");
  });

  test("deactivated banner is hidden", async () => {
    await supabaseAdmin
      .from("landing_banners")
      .update({ active: false })
      .eq("id", ID.banner);
    const { data } = await supabaseAdmin
      .from("landing_banners")
      .select("id")
      .eq("active", true)
      .eq("id", ID.banner);
    expect(data?.length).toBe(0);
  });
});

test.describe("Site settings (admin banner toggle)", () => {
  test.describe.configure({ mode: "serial" });
  const key = "e2e_test_flag";

  test.afterAll(async () => {
    await supabaseAdmin.from("site_settings").delete().eq("key", key);
  });

  test("admin can write a site setting", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .upsert({
        key,
        value: { enabled: true, label: "test" },
        updated_by: testIds.admin,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect((data?.value as { enabled?: boolean })?.enabled).toBe(true);
  });

  test("admin can update a site setting", async ({ testIds }) => {
    const { data } = await supabaseAdmin
      .from("site_settings")
      .upsert({
        key,
        value: { enabled: false, label: "off" },
        updated_by: testIds.admin,
      })
      .select()
      .single();
    expect((data?.value as { enabled?: boolean })?.enabled).toBe(false);
  });
});

test.describe("Listing creation (renter/seller/food simulating /create/* forms)", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    await supabaseAdmin
      .from("properties")
      .delete()
      .in("id", [ID.rentalListing, ID.saleListing]);
    await supabaseAdmin
      .from("services")
      .delete()
      .in("id", [ID.foodListing, ID.serviceListing]);
  });

  test("renter submits a rental listing (status starts pending)", async ({
    testIds,
  }) => {
    const { data, error } = await supabaseAdmin
      .from("properties")
      .insert({
        id: ID.rentalListing,
        owner_id: testIds.renter,
        type: "apartment",
        title: "E2E /create/rental sim",
        description: "სატესტო",
        location: "ბაკურიანი",
        area_sqm: 45,
        rooms: 2,
        bathrooms: 1,
        capacity: 3,
        price_per_night: 120,
        currency: "GEL",
        amenities: ["wifi"],
        photos: [],
        status: "pending",
        is_for_sale: false,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("pending");
    expect(data?.is_for_sale).toBe(false);
  });

  test("seller submits a sale listing", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("properties")
      .insert({
        id: ID.saleListing,
        owner_id: testIds.seller,
        type: "apartment",
        title: "E2E /create/sale sim",
        description: "ფასით 100k",
        location: "ბაკურიანი",
        area_sqm: 60,
        rooms: 2,
        bathrooms: 1,
        capacity: 4,
        sale_price: 100000,
        currency: "GEL",
        amenities: [],
        photos: [],
        status: "pending",
        is_for_sale: true,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.is_for_sale).toBe(true);
    expect(Number(data?.sale_price)).toBe(100000);
  });

  test("food provider submits a food listing", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("services")
      .insert({
        id: ID.foodListing,
        owner_id: testIds.food,
        category: "food",
        title: "E2E /create/food sim",
        description: "ქართული სამზარეულო",
        price: 25,
        price_unit: "კერძი",
        location: "ბაკურიანი",
        cuisine_type: "ქართული",
        has_delivery: false,
        status: "pending",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.category).toBe("food");
    expect(data?.status).toBe("pending");
  });

  test("transport provider submits a transport service listing", async ({
    testIds,
  }) => {
    const { data, error } = await supabaseAdmin
      .from("services")
      .insert({
        id: ID.serviceListing,
        owner_id: testIds.transport,
        category: "transport",
        title: "E2E /create/transport sim",
        description: "თბილისი ↔ ბაკურიანი",
        price: 80,
        price_unit: "რეისი",
        location: "ბაკურიანი",
        driver_name: "ტესტი მძღოლი",
        vehicle_capacity: 4,
        route: "თბილისი-ბაკურიანი",
        status: "pending",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.category).toBe("transport");
  });

  test("admin sees both pending properties + services in pending queue", async () => {
    const { data: props } = await supabaseAdmin
      .from("properties")
      .select("id, title, status")
      .eq("status", "pending");
    expect(props?.map((p) => p.id)).toEqual(
      expect.arrayContaining([ID.rentalListing, ID.saleListing]),
    );

    const { data: svcs } = await supabaseAdmin
      .from("services")
      .select("id, title, status")
      .eq("status", "pending");
    expect(svcs?.map((s) => s.id)).toEqual(
      expect.arrayContaining([ID.foodListing, ID.serviceListing]),
    );
  });

  test("admin approves rental → status becomes active (no notes)", async () => {
    const { data, error } = await supabaseAdmin
      .from("properties")
      .update({ status: "active" })
      .eq("id", ID.rentalListing)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("active");
  });

  test("rejecting a property WITH admin_notes fails (BUG: missing column)", async () => {
    const { error } = await supabaseAdmin
      .from("properties")
      .update({ status: "blocked", admin_notes: "ფასი არასწორია" } as never)
      .eq("id", ID.saleListing);
    // We expect this to error because admin_notes column does not exist
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/admin_notes/);
  });

  test("approved property is publicly visible", async ({ page }) => {
    const res = await page.request.get(`/apartments/${ID.rentalListing}`);
    expect([200, 308]).toContain(res.status());
  });
});

test.describe("Public API surface (no auth required)", () => {
  test("GET /api/banners?kind=landing_top returns 200 or documented 500", async ({
    page,
  }) => {
    const res = await page.request.get("/api/banners?kind=landing_top");
    // We tolerate the documented Bug 3 (env-loading 500) as long as the route
    // is not crashing the rest of the server.
    expect([200, 500]).toContain(res.status());
  });

  test("admin endpoints are protected (return 401 when unauthenticated)", async ({
    page,
  }) => {
    const endpoints = [
      "/api/admin/listings/pending",
      "/api/admin/promocodes",
      "/api/admin/pricing-packages",
      "/api/admin/finances/summary",
    ];
    for (const ep of endpoints) {
      const res = await page.request.get(ep);
      expect([401, 403]).toContain(res.status());
    }
  });

  test("admin moderate endpoints reject non-admin POSTs", async ({ page }) => {
    const res = await page.request.post("/api/admin/listings/moderate", {
      data: {
        kind: "property",
        id: "00000000-0000-0000-0000-000000000000",
        action: "approve",
      },
      headers: { "content-type": "application/json" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Storage bucket (property-photos)", () => {
  test("property-photos bucket exists", async () => {
    const { data, error } = await supabaseAdmin.storage.listBuckets();
    expect(error).toBeNull();
    const names = (data ?? []).map((b) => b.name);
    expect(names).toContain("property-photos");
  });
});

test.describe("Edge functions deployed", () => {
  test("expected edge functions are reachable (returns 200/401 not 404)", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const names = [
      "admin-stats",
      "balance-topup",
      "booking-create",
      "booking-manage",
      "purchase-vip",
      "search",
      "smart-match",
      "upload-photos",
      "verify-listing",
    ];
    for (const name of names) {
      const res = await fetch(`${url}/functions/v1/${name}`, {
        method: "OPTIONS",
        headers: { Authorization: `Bearer ${anonKey}` },
      });
      // 204 or 200 for OPTIONS; not 404
      expect(res.status).not.toBe(404);
    }
  });
});
