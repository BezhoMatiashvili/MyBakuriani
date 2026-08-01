// SMS automation run. See sms.md P4a.
//
// For each owner with sms_automation_rules.*_enabled = true, scans BOTH booking
// sources (public.bookings and public.manual_bookings, per D2) and enqueues
// sms_outbound rows through the sms_enqueue_automation RPC.
//
// D1 - AUTO-APPROVE: rows are enqueued at status='approved', not 'pending'. There
// is no admin moderation for automation rows (the spec forbids the owner editing
// the text, so there is nothing to moderate). Exactly 1 credit is deducted later,
// on gateway success, by sms_mark_sent.
//
// DEDUP LIVES IN THE DB. The previous version used
//   .upsert({...}, { onConflict: "sender_id,source_booking_id,automation_kind" })
// which cannot work: both uniqueness guarantees are PARTIAL indexes, and ON CONFLICT
// will not infer a partial index as arbiter unless the statement repeats the index
// predicate - which PostgREST's on_conflict= param cannot supply. That raises 42P10,
// and the old enqueue() swallowed it (console.error; return 0) while still reporting
// ok:true with queued all-zeros. sms_enqueue_automation supplies the predicate inside
// plpgsql and returns NULL for an already-queued row.
//
// Trigger sources:
//   * pg_cron via net.http_post (see 20260801132000_schedule_sms_pipeline.sql)
//   * Manual: curl -X POST .../sms-automation-run -H "Authorization: Bearer $SECRET"

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  buildCorsHeaders,
  createServiceClient,
  errorResponse,
  getBearerToken,
  jsonResponse,
} from "../_shared/guards.ts";
import {
  type AutomationKind,
  buildCheckIn,
  buildReviewRequest,
  buildWinBack,
  type Candidate,
  type PropertyRef,
  type Rule,
  tbilisiDate,
  toCanonicalGePhone,
} from "./domain.ts";

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

// SITE_URL must be an absolute origin: NEXT_PUBLIC_* is a Next build-time thing and
// is NOT visible inside Deno, so without this the review/listing links would render
// as relative paths inside an SMS - unclickable and unfixable after delivery.
//
// Checked per-request rather than at module scope on purpose: a module-level throw
// fails the isolate's boot, which also kills the CORS preflight and reports as an
// opaque platform error. This surfaces the same refusal as a clean ENV_MISSING 500,
// exactly like requireSharedSecret above, and still guarantees no message is ever
// built with a relative link.
function requireSiteUrl(): string {
  const raw = Deno.env.get("SITE_URL");
  if (!raw || !/^https?:\/\//.test(raw)) {
    throw new ApiError(
      "SITE_URL is not configured (absolute origin required for SMS links)",
      500,
      "ENV_MISSING",
    );
  }
  return raw.replace(/\/+$/, "");
}

type SkipReason =
  | "no_phone"
  | "invalid_phone"
  | "no_consent"
  | "opted_out"
  | "already_queued"
  | "no_credit"
  | "sale_only";

type SbClient = ReturnType<typeof createServiceClient>;

// Rental-only (spec section 5). is_for_sale is nullable and NULL means rental
// everywhere in this repo, so the filter must be NULL-tolerant. On an EMBEDDED
// resource supabase-js needs the referenced table named explicitly - a bare .or()
// string would filter the TOP-LEVEL table and silently do nothing useful here.
const RENTAL_ONLY = "is_for_sale.eq.false,is_for_sale.is.null";
const PROPERTY_EMBED =
  "property:property_id!inner(id, type, is_for_sale, location_lat, location_lng, phone, check_in_time)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    requireSharedSecret(req);
    const siteUrl = requireSiteUrl();
    const db = createServiceClient();

    // 1. Enabled rules + the owner's own display name and phone. Without owner_phone
    //    the [Host_Phone] clause would silently vanish from every check-in SMS.
    const { data: rulesData, error: rulesErr } = await db
      .from("sms_automation_rules")
      .select(
        `user_id,
         check_in_reminder_enabled,
         review_request_enabled,
         win_back_enabled,
         win_back_discount_value, win_back_discount_period,
         profiles!inner(display_name, phone)`,
      )
      .or(
        "check_in_reminder_enabled.eq.true,review_request_enabled.eq.true,win_back_enabled.eq.true",
      );
    if (rulesErr) throw rulesErr;

    type RuleJoin = Omit<Rule, "display_name" | "owner_phone"> & {
      profiles:
        | { display_name: string | null; phone: string | null }
        | { display_name: string | null; phone: string | null }[]
        | null;
    };
    const rules: Rule[] = ((rulesData as RuleJoin[] | null) ?? []).map((r) => {
      const prof = one(r.profiles);
      return {
        user_id: r.user_id,
        check_in_reminder_enabled: r.check_in_reminder_enabled,
        review_request_enabled: r.review_request_enabled,
        win_back_enabled: r.win_back_enabled,
        win_back_discount_value: r.win_back_discount_value,
        win_back_discount_period: r.win_back_discount_period,
        display_name: prof?.display_name ?? null,
        owner_phone: prof?.phone ?? null,
      };
    });

    // 2. Opt-out set (D5). Resolved by NORMALIZED PHONE, not by guest_id /
    //    renter_guests.profile_id: profile_id is auto-resolved from phone but NULL for
    //    the profile-less remainder, and phone matching covers both sources uniformly.
    //    A phone with no profile at all cannot opt out and will still receive T3 - a
    //    real gap, owned by follow-up sms-f3 (SMS STOP keyword).
    //    Canonicalized with the same exact Georgian-mobile contract as the queue RPC.
    const { data: optOutRows, error: optOutErr } = await db
      .from("profiles")
      .select("phone")
      .eq("marketing_opt_out", true);
    if (optOutErr) throw optOutErr;
    const optedOut = new Set(
      ((optOutRows as { phone: string | null }[] | null) ?? [])
        .map((r) => toCanonicalGePhone(r.phone))
        .filter((p): p is string => p !== null),
    );

    const summary = {
      processed_users: rules.length,
      queued: { check_in: 0, review_request: 0, win_back: 0 } as Record<
        AutomationKind,
        number
      >,
      failed: 0,
      skipped: {
        no_phone: 0,
        invalid_phone: 0,
        // no_consent and sale_only are enforced as QUERY FILTERS (so each page
        // is not consumed by rows we would then discard). They are therefore
        // structurally 0 here; the keys exist so the response shape is stable.
        no_consent: 0,
        opted_out: 0,
        already_queued: 0,
        no_credit: 0,
        sale_only: 0,
      } as Record<SkipReason, number>,
    };

    const skip = (reason: SkipReason, detail: Record<string, unknown>) => {
      summary.skipped[reason] += 1;
      // A silent `continue` is how this class of bug hides. Log every skip.
      console.log(JSON.stringify({ skip: reason, ...detail }));
    };

    const { error: maintenanceErr } = await db.rpc(
      "sms_expire_stale_automation",
    );
    if (maintenanceErr) throw maintenanceErr;

    for (const rule of rules) {
      // 3. Credit preflight, ONCE per owner (spec section 6). A 0-credit owner must
      //    never have a send attempted. balances rows are created LAZILY, so "no row"
      //    is a common state and must read as 0 - sms_consume_credit raises P0002 on it.
      const { data: bal, error: balErr } = await db
        .from("balances")
        .select("sms_remaining")
        .eq("user_id", rule.user_id)
        .maybeSingle();
      if (balErr) throw balErr;
      const credits = bal?.sms_remaining ?? 0;
      if (credits < 1) {
        skip("no_credit", { owner: rule.user_id, credits });
        continue;
      }

      const { count: activeQueue, error: queueErr } = await db
        .from("sms_outbound")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", rule.user_id)
        .eq("status", "approved")
        .is("charged_at", null)
        .in("automation_kind", ["check_in", "review_request", "win_back"]);
      if (queueErr) throw queueErr;
      let remainingCapacity = Math.max(0, credits - (activeQueue ?? 0));
      if (remainingCapacity < 1) {
        skip("no_credit", {
          owner: rule.user_id,
          credits,
          active_queue: activeQueue ?? 0,
        });
        continue;
      }

      const enqueue = async (
        kind: AutomationKind,
        c: Candidate,
        message: string,
      ): Promise<boolean> => {
        if (remainingCapacity < 1) return false;
        const { data, error } = await db.rpc("sms_enqueue_automation", {
          p_sender_id: c.owner_id,
          p_recipient_id: c.recipient_id,
          p_recipient_phone: c.guest_phone,
          p_kind: kind,
          p_message: message,
          p_booking_id: c.source === "platform" ? c.booking_id : null,
          p_manual_booking_id: c.source === "manual" ? c.booking_id : null,
        });
        if (error) {
          // Make failures VISIBLE. The old enqueue() returned 0 here, so a total
          // failure still reported ok:true with queued all-zeros.
          summary.failed += 1;
          console.error("enqueue failed", {
            kind,
            source: c.source,
            booking_id: c.booking_id,
            error,
          });
          return false;
        }
        if (data) {
          summary.queued[kind] += 1;
          remainingCapacity -= 1;
          return true;
        }
        skip("already_queued", { kind, booking_id: c.booking_id });
        return false;
      };

      // Shared per-candidate gate for reachability + opt-out.
      const reachable = (c: Candidate, marketing: boolean): boolean => {
        if (!c.guest_phone) {
          skip("no_phone", { booking_id: c.booking_id });
          return false;
        }
        const canonicalPhone = toCanonicalGePhone(c.guest_phone);
        if (!canonicalPhone) {
          skip("invalid_phone", { booking_id: c.booking_id });
          return false;
        }
        c.guest_phone = canonicalPhone;
        // T1 is transactional, so opt-out applies only to the marketing kinds.
        if (marketing && optedOut.has(canonicalPhone)) {
          skip("opted_out", { booking_id: c.booking_id });
          return false;
        }
        return true;
      };

      // ---- T1 CHECK-IN -----------------------------------------------------
      // PINNED TO EXACTLY check_in = tomorrow. The template hardcodes "ხვალ"
      // (tomorrow), so any other window would make the SMS lie.
      // The legacy timing column is fixed at 24 by a DB CHECK and is deliberately
      // absent from the owner UI. P2(e)'s 36h expiry window depends on this pinning;
      // change one and the other must change.
      // T1 ignores marketing_consent - it is transactional, not marketing (spec §2).
      if (rule.check_in_reminder_enabled) {
        const tomorrow = tbilisiDate(1);
        for (
          const c of await scanPlatform(db, {
            owner_id: rule.user_id,
            dateCol: "check_in",
            date: tomorrow,
            statuses: ["confirmed"],
          })
        ) {
          if (!reachable(c, false)) continue;
          await enqueue("check_in", c, buildCheckIn(c, rule));
        }
        for (
          const c of await scanManual(db, {
            owner_id: rule.user_id,
            dateCol: "check_in",
            date: tomorrow,
          })
        ) {
          if (!reachable(c, false)) continue;
          await enqueue("check_in", c, buildCheckIn(c, rule));
        }
      }

      // ---- T2 REVIEW REQUEST ----------------------------------------------
      // PLATFORM-ONLY BY CONSTRUCTION (D4/D5). The review link requires a bookings
      // row whose guest_id matches the logged-in user, and reviews.booking_id FKs
      // bookings. An offline guest has neither a bookings row nor a profile.
      // Expect queued.review_request = 0 until an online booking flow exists
      // (follow-up sms-f10). THAT IS THE CORRECT RESULT - do not debug it.
      if (rule.review_request_enabled) {
        const day = tbilisiDate(-1);
        for (
          const c of await scanPlatform(db, {
            owner_id: rule.user_id,
            dateCol: "check_out",
            date: day,
            statuses: ["completed"],
            requireConsent: true,
          })
        ) {
          if (!reachable(c, true)) continue;
          const { count, error: reviewErr } = await db
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("booking_id", c.booking_id);
          if (reviewErr) throw reviewErr;
          if ((count ?? 0) > 0) continue; // already reviewed
          await enqueue("review_request", c, buildReviewRequest(c, siteUrl));
        }
      }

      // ---- T3 WIN-BACK -----------------------------------------------------
      if (rule.win_back_enabled) {
        const day = tbilisiDate(-90);
        for (
          const c of await scanPlatform(db, {
            owner_id: rule.user_id,
            dateCol: "check_out",
            date: day,
            statuses: ["completed"],
            requireConsent: true,
          })
        ) {
          if (!reachable(c, true)) continue;
          // A platform candidate always carries guest_id, so recipient_id is non-null
          // here. Guard rather than coalescing to "": `guest_id=eq.` with an empty
          // string is a malformed uuid, PostgREST answers 22P02, and `const { count }`
          // would discard that error - count becomes undefined, `?? 0` reads as 0, and
          // the re-booked-since skip silently stops working.
          if (!c.recipient_id) continue;
          const { count, error: rbErr } = await db
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", c.owner_id)
            .eq("guest_id", c.recipient_id)
            .gt("check_in", day);
          if (rbErr) throw rbErr;
          if ((count ?? 0) > 0) continue; // guest already re-booked with this owner
          await enqueue("win_back", c, buildWinBack(c, rule, siteUrl));
        }

        // Manual twin of the re-booked-since skip. An offline guest has no id, so the
        // match is on phone - but it MUST be normalised on both sides: verified live,
        // manual_bookings.guest_phone holds at least three shapes (+995XXXXXXXXX,
        // 995XXXXXXXXX, and a 15-digit legacy value). A raw .eq() would miss the
        // re-booking and send a win-back to a guest who is already coming back.
        // Fetched ONCE per owner instead of once per candidate.
        const manualCandidates = await scanManual(db, {
          owner_id: rule.user_id,
          dateCol: "check_out",
          date: day,
          requireConsent: true,
        });
        if (manualCandidates.length > 0) {
          const { data: laterRows, error: laterErr } = await db
            .from("manual_bookings")
            .select("guest_phone")
            .eq("owner_id", rule.user_id)
            .gt("check_in", day);
          if (laterErr) throw laterErr;
          const rebooked = new Set(
            ((laterRows as { guest_phone: string | null }[] | null) ?? [])
              .map((r) => toCanonicalGePhone(r.guest_phone))
              .filter((p): p is string => p !== null),
          );
          for (const c of manualCandidates) {
            if (!reachable(c, true)) continue;
            const phone = toCanonicalGePhone(c.guest_phone);
            if (phone && rebooked.has(phone)) continue;
            await enqueue("win_back", c, buildWinBack(c, rule, siteUrl));
          }
        }
      }
    }

    return jsonResponse({ ok: true, ...summary }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});

// ---------------------------------------------------------------------------
// Scans. Consent and rental-only are QUERY FILTERS, not post-filters, so the
// paginated scans are never consumed by rows we would immediately discard.
// ---------------------------------------------------------------------------
async function scanPlatform(
  db: SbClient,
  opts: {
    owner_id: string;
    dateCol: "check_in" | "check_out";
    date: string;
    statuses: string[];
    requireConsent?: boolean;
  },
): Promise<Candidate[]> {
  type Row = {
    id: string;
    owner_id: string;
    guest_id: string;
    property: PropertyRef | PropertyRef[] | null;
    guest:
      | { phone: string | null; display_name: string | null }
      | { phone: string | null; display_name: string | null }[]
      | null;
  };
  const rows: Row[] = [];
  let cursor: string | null = null;
  while (true) {
    let q = db
      .from("bookings")
      .select(
        `id, owner_id, guest_id, check_in, check_out, status, marketing_consent,
         ${PROPERTY_EMBED},
         guest:guest_id(phone, display_name)`,
      )
      .eq("owner_id", opts.owner_id)
      .eq(opts.dateCol, opts.date)
      .in("status", opts.statuses)
      .or(RENTAL_ONLY, { referencedTable: "property" })
      .order("id")
      .limit(200);
    if (opts.requireConsent) q = q.eq("marketing_consent", true);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error) throw error;
    const page = (data as Row[] | null) ?? [];
    rows.push(...page);
    if (page.length < 200) break;
    cursor = page[page.length - 1].id;
  }

  return rows.map((r) => {
    const g = one(r.guest);
    return {
      source: "platform" as const,
      booking_id: r.id,
      owner_id: r.owner_id,
      recipient_id: r.guest_id,
      guest_phone: g?.phone ?? null,
      guest_name: g?.display_name ?? null,
      property: one(r.property),
    };
  });
}

async function scanManual(
  db: SbClient,
  opts: {
    owner_id: string;
    dateCol: "check_in" | "check_out";
    date: string;
    requireConsent?: boolean;
  },
): Promise<Candidate[]> {
  // manual_bookings.status is only ever 'booked' or 'manual' - NEVER 'completed'
  // (create_manual_booking writes CASE WHEN p_status='booked' THEN 'booked' ELSE
  // 'manual' END, and cancelling is a hard DELETE). Filtering on 'completed' here
  // would return zero rows forever. "The stay ended" is derived from the DATE.
  type Row = {
    id: string;
    owner_id: string;
    guest_name: string | null;
    guest_phone: string | null;
    property: PropertyRef | PropertyRef[] | null;
  };
  const rows: Row[] = [];
  let cursor: string | null = null;
  while (true) {
    let q = db
      .from("manual_bookings")
      .select(
        `id, owner_id, check_in, check_out, status, marketing_consent,
         guest_name, guest_phone,
         ${PROPERTY_EMBED}`,
      )
      .eq("owner_id", opts.owner_id)
      .eq(opts.dateCol, opts.date)
      .neq("status", "cancelled")
      .or(RENTAL_ONLY, { referencedTable: "property" })
      .order("id")
      .limit(200);
    if (opts.requireConsent) q = q.eq("marketing_consent", true);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error) throw error;
    const page = (data as Row[] | null) ?? [];
    rows.push(...page);
    if (page.length < 200) break;
    cursor = page[page.length - 1].id;
  }

  return rows.map((r) => ({
    source: "manual" as const,
    booking_id: r.id,
    owner_id: r.owner_id,
    // An offline guest has no profiles row, hence no valid uuid. sms_outbound
    // .recipient_id was made nullable for exactly this (P2a). Do NOT substitute
    // owner_id - the admin queue would render the owner as their own recipient.
    recipient_id: null,
    guest_phone: r.guest_phone,
    guest_name: r.guest_name,
    property: one(r.property),
  }));
}
