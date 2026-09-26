import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../helpers/supabase";
import { configureIsolatedE2E } from "../helpers/env";
import { createTestUser, deleteTestUser } from "../helpers/auth";
import type { Database } from "../../src/lib/types/database";

/**
 * Dedicated VIP-purchase fixtures. Each viewport lane owns its own users and
 * listings so the desktop and mobile projects can run side by side without
 * racing on one wallet. Ids are fixed so a crashed run can be torn down again.
 */
export type Lane = "d" | "e";

const E2E_PASSWORD = "test-password-e2e-12345";

// createTestUser derives the e-mail from the first 8 id characters, so they
// must differ per user (and per lane).
function id(lane: Lane, nn: string) {
  return `5e1${lane}c7${nn}-0000-4000-8000-000000000000`;
}

export function laneIds(lane: Lane) {
  return {
    owner: id(lane, "01"),
    svcOwner: id(lane, "02"),
    poor: id(lane, "03"),
    rental1: id(lane, "11"),
    rental2: id(lane, "12"),
    rental3: id(lane, "13"),
    pending: id(lane, "14"),
    sale: id(lane, "15"),
    transport: id(lane, "21"),
    entertainment: id(lane, "22"),
    food: id(lane, "23"),
    poorRental: id(lane, "31"),
  };
}

export type LaneIds = ReturnType<typeof laneIds>;

export function laneFromProject(projectName: string): Lane {
  return projectName.includes("mobile") ? "e" : "d";
}

export const titles = (lane: Lane) => ({
  rental1: `VIP-T ${lane} ბინა ერთი`,
  rental2: `VIP-T ${lane} ბინა ორი`,
  rental3: `VIP-T ${lane} ბინა სამი`,
  pending: `VIP-T ${lane} მოლოდინში`,
  sale: `VIP-T ${lane} გასაყიდი`,
  transport: `VIP-T ${lane} ტრანსპორტი`,
  entertainment: `VIP-T ${lane} გართობა`,
  food: `VIP-T ${lane} რესტორანი`,
  poorRental: `VIP-T ${lane} ღარიბი ბინა`,
});

const RESET_PROMOTION = {
  is_vip: false,
  is_super_vip: false,
  vip_expires_at: null as string | null,
  vip_expiry_notified_at: null as string | null,
  discount_percent: 0,
  discount_expires_at: null as string | null,
};

export async function seedLane(lane: Lane) {
  const ids = laneIds(lane);
  const t = titles(lane);
  await cleanupLane(lane);

  for (const [userId, role, name] of [
    [ids.owner, "renter", `VIP-T ${lane} owner`],
    [ids.svcOwner, "transport", `VIP-T ${lane} services`],
    [ids.poor, "renter", `VIP-T ${lane} poor`],
  ] as const) {
    // The profile CHECK rejects an empty phone; a placeholder is nulled below.
    const placeholder = `+99559990${lane === "d" ? "1" : "2"}${userId.slice(-2)}`;
    await createTestUser({ id: userId, phone: placeholder, displayName: name, role });
    // No phone: VIP activation queues a system SMS and uBill is live on staging.
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ phone: null })
      .eq("id", userId);
    if (error) throw new Error(`profile phone reset: ${error.message}`);
  }

  const baseRental = {
    type: "apartment" as const,
    description: "VIP purchase test listing",
    location: "ბაკურიანი, VIP ტესტი",
    area_sqm: 50,
    rooms: 2,
    bathrooms: 1,
    capacity: 4,
    currency: "GEL",
    amenities: [],
    photos: [],
    is_for_sale: false,
  };
  const rows: Database["public"]["Tables"]["properties"]["Insert"][] = [
    {
      ...baseRental,
      id: ids.rental1,
      owner_id: ids.owner,
      title: t.rental1,
      price_per_night: 150,
      status: "active",
      created_at: ago(3),
    },
    {
      ...baseRental,
      id: ids.rental2,
      owner_id: ids.owner,
      title: t.rental2,
      price_per_night: 200,
      status: "active",
      created_at: ago(2),
    },
    {
      ...baseRental,
      id: ids.rental3,
      owner_id: ids.owner,
      title: t.rental3,
      price_per_night: 99,
      status: "active",
      created_at: ago(1),
    },
    {
      ...baseRental,
      id: ids.pending,
      owner_id: ids.owner,
      title: t.pending,
      price_per_night: 120,
      status: "pending",
      created_at: ago(4),
    },
    {
      ...baseRental,
      id: ids.sale,
      owner_id: ids.owner,
      title: t.sale,
      is_for_sale: true,
      sale_price: 95000,
      price_per_night: null,
      construction_status: "completed",
      status: "active",
      created_at: ago(5),
    },
    {
      ...baseRental,
      id: ids.poorRental,
      owner_id: ids.poor,
      title: t.poorRental,
      price_per_night: 80,
      status: "active",
      created_at: ago(1),
    },
  ];
  const { error: propErr } = await supabaseAdmin
    .from("properties")
    .insert(rows);
  if (propErr) throw new Error(`properties seed: ${propErr.message}`);

  const services: Database["public"]["Tables"]["services"]["Insert"][] = [
    {
      id: ids.transport,
      owner_id: ids.svcOwner,
      category: "transport",
      title: t.transport,
      description: "VIP test transport",
      price: 50,
      price_unit: "რეისი",
      location: "ბაკურიანი",
      driver_name: "ტესტი",
      vehicle_capacity: 7,
      route: "თბილისი - ბაკურიანი",
      status: "active",
      created_at: ago(2),
    },
    {
      id: ids.entertainment,
      owner_id: ids.svcOwner,
      category: "entertainment",
      title: t.entertainment,
      description: "VIP test fun",
      price: 100,
      price_unit: "ადამიანი",
      location: "ბაკურიანი",
      status: "active",
      created_at: ago(3),
    },
    {
      id: ids.food,
      owner_id: ids.svcOwner,
      category: "food",
      title: t.food,
      description: "VIP test food",
      price: 30,
      price_unit: "კერძი",
      location: "ბაკურიანი",
      cuisine_type: "ქართული",
      status: "active",
      created_at: ago(4),
    },
  ];
  const { error: svcErr } = await supabaseAdmin
    .from("services")
    .insert(services);
  if (svcErr) throw new Error(`services seed: ${svcErr.message}`);

  await setBalance(ids.owner, 0);
  await setBalance(ids.svcOwner, 0);
  await setBalance(ids.poor, 0);
  // "Buying" in this suite means wallet credit granted from the database.
  await grantBalance(ids.owner, 200);
  await grantBalance(ids.svcOwner, 200);
  await grantBalance(ids.poor, 1);
}

function ago(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Real DB grant, the same path as the admin wallet bonus. */
export async function grantBalance(userId: string, amount: number) {
  const { error } = await supabaseAdmin.rpc("topup_balance", {
    p_user_id: userId,
    p_amount: amount,
    p_description: "VIP purchase test credit",
  });
  if (error) throw new Error(`topup_balance: ${error.message}`);
}

/** Exact wallet state for edge cases (e.g. exactly the package price). */
export async function setBalance(userId: string, amount: number) {
  const { error } = await supabaseAdmin
    .from("balances")
    .upsert({ user_id: userId, amount, sms_remaining: 0 });
  if (error) throw new Error(`balance upsert: ${error.message}`);
}

export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("balances")
    .select("amount")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`balance read: ${error.message}`);
  return Number(data.amount);
}

export async function resetPromotions(lane: Lane) {
  const ids = laneIds(lane);
  const props = [
    ids.rental1,
    ids.rental2,
    ids.rental3,
    ids.pending,
    ids.sale,
    ids.poorRental,
  ];
  const svcs = [ids.transport, ids.entertainment, ids.food];
  const a = await supabaseAdmin
    .from("properties")
    .update(RESET_PROMOTION)
    .in("id", props);
  if (a.error) throw new Error(`reset properties: ${a.error.message}`);
  const b = await supabaseAdmin
    .from("services")
    .update(RESET_PROMOTION)
    .in("id", svcs);
  if (b.error) throw new Error(`reset services: ${b.error.message}`);
}

export async function setPromotion(
  table: "properties" | "services",
  listingId: string,
  patch: Partial<typeof RESET_PROMOTION>,
) {
  const { error } = await supabaseAdmin
    .from(table)
    .update(patch)
    .eq("id", listingId);
  if (error) throw new Error(`setPromotion: ${error.message}`);
}

export async function getListing(
  table: "properties" | "services",
  listingId: string,
) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(
      "is_vip, is_super_vip, vip_expires_at, discount_percent, discount_expires_at, status",
    )
    .eq("id", listingId)
    .single();
  if (error) throw new Error(`getListing: ${error.message}`);
  return data;
}

export async function lastTransaction(userId: string) {
  const { data } = await supabaseAdmin
    .from("transactions")
    .select("amount, type, reference_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export function hoursFromNow(iso: string | null): number {
  if (!iso) return NaN;
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

/** A fresh session per test — reusing one refresh token across browser
 * contexts trips Supabase's refresh-token reuse detection. */
export async function signIn(userId: string) {
  const e2e = configureIsolatedE2E();
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = user.user?.email;
  if (!email) throw new Error(`no email for ${userId}`);
  const client = createClient(e2e.supabaseUrl, e2e.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: E2E_PASSWORD,
  });
  if (error || !data.session) throw new Error(`sign in: ${error?.message}`);
  return { session: data.session, email };
}

export async function loginPage(page: Page, userId: string) {
  const e2e = configureIsolatedE2E();
  const { session, email } = await signIn(userId);
  const ref = new URL(e2e.supabaseUrl).hostname.split(".")[0];
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: { id: userId, email },
  });
  const encoded =
    "base64-" +
    Buffer.from(payload)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const base = {
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  };
  await page.context().addCookies([
    { name: `sb-${ref}-auth-token`, value: encoded, ...base },
    // The cookie banner otherwise covers the bottom of the mobile page.
    { name: "mb_cookie_consent", value: "v1|analytics=0", ...base },
  ]);
  return session.access_token;
}

/** Calls the deployed purchase-vip function exactly like the browser does. */
export async function invokePurchase(
  accessToken: string,
  body: Record<string, unknown>,
) {
  const e2e = configureIsolatedE2E();
  const res = await fetch(`${e2e.supabaseUrl}/functions/v1/purchase-vip`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: e2e.anonKey,
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {}
  return { status: res.status, json };
}

export async function vipPackages() {
  const { data, error } = await supabaseAdmin
    .from("pricing_packages")
    .select("id, code, amount_gel, meta")
    .eq("category", "vip")
    .eq("is_enabled", true);
  if (error || !data) throw new Error(`packages: ${error?.message}`);
  const byTier = (tier: string) => {
    const row = data.find(
      (p) => (p.meta as { tier?: string } | null)?.tier === tier,
    );
    if (!row) throw new Error(`no ${tier} package`);
    return row;
  };
  return {
    vip: byTier("standard"),
    super: byTier("super"),
    discount: byTier("discount"),
  };
}

async function tryDelete(table: string, column: string, values: string[]) {
  // Some audit/outbound tables are not in the generated types; ignore absence.
  await supabaseAdmin
    .from(table as never)
    .delete()
    .in(column as never, values as never)
    .then(
      () => undefined,
      () => undefined,
    );
}

export async function cleanupLane(lane: Lane) {
  const ids = laneIds(lane);
  const users = [ids.owner, ids.svcOwner, ids.poor];
  await tryDelete("sms_outbound", "recipient_id", users);
  await tryDelete("email_outbound", "user_id", users);
  await tryDelete("listing_view_events", "listing_id", Object.values(ids));
  await tryDelete("notifications", "user_id", users);
  await tryDelete("transactions", "user_id", users);
  await tryDelete("properties", "owner_id", users);
  await tryDelete("services", "owner_id", users);
  await tryDelete("balances", "user_id", users);
  await tryDelete("user_consents", "user_id", users);
  for (const u of users) await deleteTestUser(u);
  // profiles does not cascade from auth.users.
  await tryDelete("profiles", "id", users);
}
