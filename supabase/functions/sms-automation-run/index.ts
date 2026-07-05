// SMS automation run.
//
// For each user with sms_automation_rules.*_enabled = true, scans bookings
// and enqueues sms_outbound rows (status='pending') that admins then approve.
//
// Idempotent: a unique partial index on
//   sms_outbound (sender_id, source_booking_id, automation_kind)
// prevents duplicate rows. We insert with ON CONFLICT DO NOTHING.
//
// Schedule via Supabase Cron (every hour). The pg_cron job created in the
// migration is a no-op fallback — the real work happens here.
//
// Trigger sources:
//   * Supabase scheduled invocation
//   * Manual: `supabase functions invoke sms-automation-run`

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  buildCorsHeaders,
  createServiceClient,
  errorResponse,
  getBearerToken,
  jsonResponse,
} from "../_shared/guards.ts";

// Auth: shared secret in SMS_AUTOMATION_RUN_SECRET (Bearer header), matching
// the vip-lifecycle/sms-dispatch/booking-finalize cron functions — this
// function does a privileged, service-role scan of all bookings/guest PII and
// must not be triggerable by anyone holding only the public anon key.
function requireSharedSecret(req: Request) {
  const expected = Deno.env.get("SMS_AUTOMATION_RUN_SECRET");
  if (!expected) {
    throw new ApiError(
      "SMS_AUTOMATION_RUN_SECRET is not configured",
      500,
      "ENV_MISSING",
    );
  }
  const token = getBearerToken(req);
  if (token !== expected) {
    throw new ApiError("Invalid shared secret", 401, "AUTH_UNAUTHORIZED");
  }
}

type AutomationKind = "check_in" | "review_request" | "win_back";

interface Rule {
  user_id: string;
  display_name: string | null;
  check_in_reminder_enabled: boolean;
  check_in_reminder_hours_before: number;
  review_request_enabled: boolean;
  review_request_hours_after: number;
  win_back_enabled: boolean;
  win_back_days_after: number;
}

interface BookingRow {
  id: string;
  owner_id: string;
  guest_id: string;
  check_in: string;
  check_out: string;
  status: string;
  property_title: string | null;
  guest_phone: string | null;
  guest_name: string | null;
}

const TEMPLATES: Record<AutomationKind, string> = {
  check_in:
    "გამარჯობა {guest}! გვაგონებთ, რომ ხვალ ({date}) იჯავშნით {property}. სასიამოვნო დღეების სურვილით — {sender} | MyBakuriani",
  review_request:
    "გამარჯობა {guest}! გვინდა ვიცოდეთ თქვენი აზრი {property} ცხოვრებაზე. დატოვეთ შეფასება — {sender}",
  win_back:
    "გამარჯობა {guest}! ბევრი ხანი გავიდა, {property} მზად არის ხელახლა მისაღებად — დაგვიკავშირდით სპეციალური ფასისთვის. — {sender}",
};

function render(
  kind: AutomationKind,
  ctx: {
    guest: string;
    property: string;
    sender: string;
    date?: string;
  },
) {
  let tpl = TEMPLATES[kind];
  tpl = tpl.replaceAll("{guest}", ctx.guest);
  tpl = tpl.replaceAll("{property}", ctx.property);
  tpl = tpl.replaceAll("{sender}", ctx.sender);
  tpl = tpl.replaceAll("{date}", ctx.date ?? "");
  // Trim to 320 char safety.
  return tpl.length > 320 ? tpl.slice(0, 317) + "..." : tpl;
}

serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    requireSharedSecret(req);

    const db = createServiceClient();

    // 1. Load all enabled rules joined with profile display_name.
    const { data: rulesData, error: rulesErr } = await db
      .from("sms_automation_rules")
      .select(
        `user_id,
         check_in_reminder_enabled, check_in_reminder_hours_before,
         review_request_enabled, review_request_hours_after,
         win_back_enabled, win_back_days_after,
         profiles!inner(display_name)`,
      )
      .or(
        "check_in_reminder_enabled.eq.true,review_request_enabled.eq.true,win_back_enabled.eq.true",
      );

    if (rulesErr) throw rulesErr;

    type RuleJoin = {
      user_id: string;
      check_in_reminder_enabled: boolean;
      check_in_reminder_hours_before: number;
      review_request_enabled: boolean;
      review_request_hours_after: number;
      win_back_enabled: boolean;
      win_back_days_after: number;
      profiles:
        | { display_name: string | null }
        | { display_name: string | null }[]
        | null;
    };
    const rules: Rule[] = ((rulesData as RuleJoin[] | null) ?? []).map((r) => ({
      user_id: r.user_id,
      check_in_reminder_enabled: r.check_in_reminder_enabled,
      check_in_reminder_hours_before: r.check_in_reminder_hours_before,
      review_request_enabled: r.review_request_enabled,
      review_request_hours_after: r.review_request_hours_after,
      win_back_enabled: r.win_back_enabled,
      win_back_days_after: r.win_back_days_after,
      display_name: Array.isArray(r.profiles)
        ? (r.profiles[0]?.display_name ?? null)
        : (r.profiles?.display_name ?? null),
    }));

    const summary = {
      processed_users: rules.length,
      queued: { check_in: 0, review_request: 0, win_back: 0 } as Record<
        AutomationKind,
        number
      >,
    };

    for (const rule of rules) {
      // CHECK-IN reminders: bookings starting within the configured window.
      if (rule.check_in_reminder_enabled) {
        const hoursAhead = rule.check_in_reminder_hours_before;
        const windowEnd = new Date(Date.now() + hoursAhead * 3600_000)
          .toISOString()
          .slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const rows = await fetchBookings(db, {
          owner_id: rule.user_id,
          minCheckIn: today,
          maxCheckIn: windowEnd,
          statuses: ["confirmed", "pending"],
        });
        for (const b of rows) {
          if (!b.guest_phone) continue;
          summary.queued.check_in += await enqueue(db, {
            sender_id: b.owner_id,
            recipient_id: b.guest_id,
            recipient_phone: b.guest_phone,
            booking_id: b.id,
            kind: "check_in",
            message: render("check_in", {
              guest: b.guest_name ?? "სტუმარო",
              property: b.property_title ?? "ბაკურიანში",
              date: b.check_in,
              sender: rule.display_name ?? "MyBakuriani",
            }),
          });
        }
      }

      // REVIEW requests: bookings that ended `hours_after` ago and no review.
      if (rule.review_request_enabled) {
        const hoursAfter = rule.review_request_hours_after;
        const cutoff = new Date(Date.now() - hoursAfter * 3600_000)
          .toISOString()
          .slice(0, 10);
        const rows = await fetchBookings(db, {
          owner_id: rule.user_id,
          minCheckOut: cutoff,
          maxCheckOut: cutoff,
          statuses: ["completed"],
        });
        for (const b of rows) {
          if (!b.guest_phone) continue;
          // Skip if a review already exists for this booking.
          const { count: reviewCount } = await db
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("booking_id", b.id);
          if ((reviewCount ?? 0) > 0) continue;
          summary.queued.review_request += await enqueue(db, {
            sender_id: b.owner_id,
            recipient_id: b.guest_id,
            recipient_phone: b.guest_phone,
            booking_id: b.id,
            kind: "review_request",
            message: render("review_request", {
              guest: b.guest_name ?? "სტუმარო",
              property: b.property_title ?? "ბაკურიანში",
              sender: rule.display_name ?? "MyBakuriani",
            }),
          });
        }
      }

      // WIN-BACK: bookings that ended exactly N days ago, guest hasn't returned.
      if (rule.win_back_enabled) {
        const daysAfter = rule.win_back_days_after;
        const target = new Date(Date.now() - daysAfter * 86400_000)
          .toISOString()
          .slice(0, 10);
        const rows = await fetchBookings(db, {
          owner_id: rule.user_id,
          minCheckOut: target,
          maxCheckOut: target,
          statuses: ["completed"],
        });
        for (const b of rows) {
          if (!b.guest_phone) continue;
          // Skip if guest has another booking with this owner in the meantime.
          const { count: recentCount } = await db
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", b.owner_id)
            .eq("guest_id", b.guest_id)
            .gt("check_in", target);
          if ((recentCount ?? 0) > 0) continue;
          summary.queued.win_back += await enqueue(db, {
            sender_id: b.owner_id,
            recipient_id: b.guest_id,
            recipient_phone: b.guest_phone,
            booking_id: b.id,
            kind: "win_back",
            message: render("win_back", {
              guest: b.guest_name ?? "სტუმარო",
              property: b.property_title ?? "ბაკურიანში",
              sender: rule.display_name ?? "MyBakuriani",
            }),
          });
        }
      }
    }

    return jsonResponse({ ok: true, ...summary }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});

type SbClient = ReturnType<typeof createServiceClient>;

async function fetchBookings(
  db: SbClient,
  opts: {
    owner_id: string;
    minCheckIn?: string;
    maxCheckIn?: string;
    minCheckOut?: string;
    maxCheckOut?: string;
    statuses: string[];
  },
): Promise<BookingRow[]> {
  let q = db
    .from("bookings")
    .select(
      `id, owner_id, guest_id, check_in, check_out, status,
       properties:property_id(title),
       guest:guest_id(phone, display_name)`,
    )
    .eq("owner_id", opts.owner_id)
    .in("status", opts.statuses);

  if (opts.minCheckIn) q = q.gte("check_in", opts.minCheckIn);
  if (opts.maxCheckIn) q = q.lte("check_in", opts.maxCheckIn);
  if (opts.minCheckOut) q = q.gte("check_out", opts.minCheckOut);
  if (opts.maxCheckOut) q = q.lte("check_out", opts.maxCheckOut);

  const { data, error } = await q.limit(200);
  if (error) throw error;

  type Row = {
    id: string;
    owner_id: string;
    guest_id: string;
    check_in: string;
    check_out: string;
    status: string;
    properties: { title: string } | { title: string }[] | null;
    guest:
      | { phone: string | null; display_name: string | null }
      | { phone: string | null; display_name: string | null }[]
      | null;
  };

  return ((data as Row[] | null) ?? []).map((r) => {
    const p = Array.isArray(r.properties) ? r.properties[0] : r.properties;
    const g = Array.isArray(r.guest) ? r.guest[0] : r.guest;
    return {
      id: r.id,
      owner_id: r.owner_id,
      guest_id: r.guest_id,
      check_in: r.check_in,
      check_out: r.check_out,
      status: r.status,
      property_title: p?.title ?? null,
      guest_phone: g?.phone ?? null,
      guest_name: g?.display_name ?? null,
    };
  });
}

async function enqueue(
  db: SbClient,
  args: {
    sender_id: string;
    recipient_id: string;
    recipient_phone: string;
    booking_id: string;
    kind: AutomationKind;
    message: string;
  },
): Promise<number> {
  // ON CONFLICT DO NOTHING via the unique partial index on
  // (sender_id, source_booking_id, automation_kind).
  const { error, count } = await db.from("sms_outbound").upsert(
    {
      sender_id: args.sender_id,
      recipient_id: args.recipient_id,
      recipient_phone: args.recipient_phone,
      contact_event_id: null,
      broadcast_id: null,
      automation_kind: args.kind,
      source_booking_id: args.booking_id,
      message: args.message,
      status: "pending",
    },
    {
      onConflict: "sender_id,source_booking_id,automation_kind",
      ignoreDuplicates: true,
      count: "exact",
    },
  );

  if (error) {
    console.error("enqueue failed", error);
    return 0;
  }
  return count ?? 0;
}
