import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  buildCorsHeaders,
  createServiceClient,
  errorResponse,
  getBearerToken,
  jsonResponse,
} from "../_shared/guards.ts";

// Daily-scheduled VIP lifecycle job. For both properties and services:
//   WARN   — listings whose VIP expires within 48h and haven't been warned yet
//            get an in-app notification + a transactional SMS, then are marked
//            warned (vip_expiry_notified_at) so the warning fires once.
//   EXPIRE — listings whose VIP has already lapsed have is_vip / is_super_vip
//            cleared so the badge disappears. Silent (the 48h warning covered
//            it). Keys off the flags, so it never re-clears -> idempotent.
// Also: expired discount badges (discount_expires_at in the past) have
// discount_percent / discount_expires_at cleared on both listing tables.
//
// Auth: shared secret in VIP_LIFECYCLE_SECRET (Bearer header). The cron job and
// any manual invocations must present this token.
//
// SMS rows are inserted directly as status='approved' (no admin moderation, no
// credit consumption) and sent by the sms-dispatch job once a provider is
// wired. Notifications + SMS use the service client, which bypasses RLS.

const WARN_WINDOW_HOURS = 48;
const WARN_BATCH = 100;

const LISTING_TABLES = ["properties", "services"] as const;
type ListingTable = (typeof LISTING_TABLES)[number];

const VIP_EXPIRY_SMS = "MyBakuriani: თქვენი VIP მალე იწურება.";

function requireSharedSecret(req: Request) {
  const expected = Deno.env.get("VIP_LIFECYCLE_SECRET");
  if (!expected) {
    throw new ApiError(
      "VIP_LIFECYCLE_SECRET is not configured",
      500,
      "ENV_MISSING",
    );
  }
  const token = getBearerToken(req);
  if (token !== expected) {
    throw new ApiError("Invalid shared secret", 401, "AUTH_UNAUTHORIZED");
  }
}

type SbClient = ReturnType<typeof createServiceClient>;

interface WarnRow {
  id: string;
  owner_id: string;
  is_for_sale?: boolean | null;
  category?: string | null;
  owner: { phone: string | null } | { phone: string | null }[] | null;
}

function ownerPhone(row: WarnRow): string | null {
  const o = Array.isArray(row.owner) ? row.owner[0] : row.owner;
  return o?.phone ?? null;
}

async function warnExpiring(
  db: SbClient,
  table: ListingTable,
  nowISO: string,
  windowEndISO: string,
): Promise<{ warned: number; sms: number }> {
  const { data, error } = await db
    .from(table)
    .select(
      table === "properties"
        ? "id, owner_id, is_for_sale, owner:owner_id(phone)"
        : "id, owner_id, category, owner:owner_id(phone)",
    )
    .gte("vip_expires_at", nowISO)
    .lte("vip_expires_at", windowEndISO)
    .is("vip_expiry_notified_at", null)
    .or("is_vip.eq.true,is_super_vip.eq.true")
    .limit(WARN_BATCH);

  if (error) throw error;
  const rows = (data as WarnRow[] | null) ?? [];
  if (rows.length === 0) return { warned: 0, sms: 0 };

  // In-app notifications (one per owner).
  const notifications = rows.map((r) => ({
    user_id: r.owner_id,
    type: "vip_expiring",
    title: "VIP იწურება",
    message: "თქვენი VIP მალე იწურება.",
    action_url: "/dashboard",
    severity: "warning",
    dashboard_scope:
      table === "properties"
        ? r.is_for_sale
          ? "seller"
          : "renter"
        : r.category === "food"
          ? "food"
          : r.category === "cleaning"
            ? "cleaner"
            : ["employment", "transport", "entertainment"].includes(
                  r.category ?? "",
                )
              ? r.category
              : "services",
  }));
  const { error: notifyErr } = await db
    .from("notifications")
    .insert(notifications);
  if (notifyErr) throw notifyErr;

  // Transactional SMS for owners that have a phone on file.
  const smsRows = rows
    .filter((r) => {
      const phone = ownerPhone(r);
      return phone !== null && phone !== "";
    })
    .map((r) => ({
      sender_id: r.owner_id,
      recipient_id: r.owner_id,
      recipient_phone: ownerPhone(r) as string,
      automation_kind: "vip_expiry",
      message: VIP_EXPIRY_SMS,
      status: "approved",
    }));
  if (smsRows.length > 0) {
    const { error: smsErr } = await db.from("sms_outbound").insert(smsRows);
    if (smsErr) throw smsErr;
  }

  // Mark warned so the notification fires once per VIP cycle.
  const { error: markErr } = await db
    .from(table)
    .update({ vip_expiry_notified_at: nowISO })
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (markErr) throw markErr;

  return { warned: rows.length, sms: smsRows.length };
}

async function clearExpired(
  db: SbClient,
  table: ListingTable,
  nowISO: string,
): Promise<number> {
  const { data, error } = await db
    .from(table)
    .update({ is_vip: false, is_super_vip: false })
    .lt("vip_expires_at", nowISO)
    .or("is_vip.eq.true,is_super_vip.eq.true")
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

async function clearExpiredDiscounts(
  db: SbClient,
  table: ListingTable,
  nowISO: string,
): Promise<number> {
  const { data, error } = await db
    .from(table)
    .update({ discount_percent: 0, discount_expires_at: null })
    .lt("discount_expires_at", nowISO)
    .not("discount_expires_at", "is", null)
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    requireSharedSecret(req);
    const db = createServiceClient();

    const now = new Date();
    const nowISO = now.toISOString();
    const windowEndISO = new Date(
      now.getTime() + WARN_WINDOW_HOURS * 3600_000,
    ).toISOString();

    const summary: Record<string, unknown> = { ok: true };
    let warned = 0;
    let sms = 0;
    let expired = 0;

    for (const table of LISTING_TABLES) {
      const w = await warnExpiring(db, table, nowISO, windowEndISO);
      warned += w.warned;
      sms += w.sms;
      expired += await clearExpired(db, table, nowISO);
    }

    let discountsCleared = 0;
    for (const table of LISTING_TABLES) {
      discountsCleared += await clearExpiredDiscounts(db, table, nowISO);
    }

    summary.warned = warned;
    summary.sms_queued = sms;
    summary.expired_cleared = expired;
    summary.discounts_cleared = discountsCleared;

    return jsonResponse(summary, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
