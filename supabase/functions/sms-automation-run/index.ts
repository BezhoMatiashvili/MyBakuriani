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
//   * pg_cron via net.http_post (see the 20260726130000 schedule migration)
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

type AutomationKind = "check_in" | "review_request" | "win_back";

// Spec-mandated texts. Placeholders are the spec's own bracket names.
// THIS IS THE ONLY LIVE COPY. src/lib/sms/templates.ts is DEAD CODE (zero importers)
// with divergent {brace} placeholders - do not edit it, do not sync to it (contract C17).
const TEMPLATES = {
  check_in:
    "გამარჯობა [Guest_Name]. გელოდებით ხვალ [Check_In_Time]-დან. ლოკაცია: [Map_Link]. დეტალებისთვის: [Host_Phone]. კარგ დასვენებას გისურვებთ!",
  review_request:
    "[Guest_Name], მადლობა სტუმრობისთვის! მოხარული ვიქნებით თუ შეაფასებთ ჩვენს ბინას აქ: [Property_Review_Link]. თქვენი აზრი ჩვენთვის მნიშვნელოვანია! - MyBakuriani.ge",
  win_back:
    "მოგესალმებით [Guest_Name]. დაბრუნდით ბაკურიანში! დაჯავშნეთ ჩვენი ბინა და მიიღეთ [Discount_Value] ფასდაკლება ([Discount_Period]): [Property_Direct_Link]",
  // Spec section 4 fallback, used when the owner left the two win-back fields empty.
  win_back_fallback:
    "მოგესალმებით [Guest_Name]. დაბრუნდით ბაკურიანში! დაჯავშნეთ ჩვენი ბინა და მიიღეთ სპეციალური ფასდაკლება ექსკლუზიურად თქვენთვის: [Property_Direct_Link]",
} as const;

const GUEST_NAME_FALLBACK = "ძვირფასო სტუმარო"; // spec section 4
const GUEST_NAME_MAX = 40; // T2 has the thinnest headroom under the 320-char CHECK

interface Rule {
  user_id: string;
  display_name: string | null;
  owner_phone: string | null;
  check_in_reminder_enabled: boolean;
  check_in_reminder_hours_before: number;
  review_request_enabled: boolean;
  review_request_hours_after: number;
  win_back_enabled: boolean;
  win_back_days_after: number;
  win_back_discount_value: string | null;
  win_back_discount_period: string | null;
}

interface PropertyRef {
  id: string;
  type: string | null;
  is_for_sale: boolean | null;
  location_lat: number | null;
  location_lng: number | null;
  phone: string | null;
  check_in_time: string | null;
}

interface Candidate {
  source: "platform" | "manual";
  booking_id: string;
  owner_id: string;
  recipient_id: string | null; // NULL for an offline guest (no profiles row)
  guest_phone: string | null;
  guest_name: string | null;
  property: PropertyRef | null;
}

type SkipReason =
  | "no_phone"
  | "invalid_phone"
  | "no_consent"
  | "opted_out"
  | "already_queued"
  | "no_credit"
  | "sale_only";

// ---------------------------------------------------------------------------
// Phone handling - the REPO's semantics, not the DB trigger's.
//
// Do NOT lift the strict ^(\+995)?5\d{8}$ regex from trg_ge_phone: that trigger is
// attached to renter_guests, renter_cleaners, manual_bookings.guest_phone, leads and
// cleaner_profiles - NEVER to profiles. profiles.phone is written verbatim from
// Supabase auth, so the repo's own readers digit-strip before testing. Ported from
// src/lib/utils/number.ts (toLocalGePhone / isValidGePhone); src/ cannot be imported
// into Deno, so this is a deliberate duplication (contract C17).
// ---------------------------------------------------------------------------
function toLocalGePhone(value: string | null | undefined): string {
  if (!value) return "";
  let d = value.replace(/\D/g, "");
  if (d.length > 9 && d.startsWith("995")) d = d.slice(3);
  return d.slice(0, 9);
}

function isValidGePhone(value: string | null | undefined): boolean {
  return /^5\d{8}$/.test(toLocalGePhone(value));
}

// The 3-way public-listing route logic, DUPLICATED from
// src/lib/utils/listingUrls.ts:propertyViewUrl because src/ cannot be imported here.
// The sale branch is unreachable while the scans are rental-only, but it is kept so
// the logic matches its source verbatim (contract C17).
function propertyViewPath(p: PropertyRef): string {
  if (p.is_for_sale) return `/sales/${p.id}`;
  if (p.type === "hotel") return `/hotels/${p.id}`;
  return `/apartments/${p.id}`;
}

/** UTC date (YYYY-MM-DD) offset by whole days from today. */
function utcDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** UTC date of (now - hours). */
function utcDateHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString().slice(0, 10);
}

function clampName(name: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return GUEST_NAME_FALLBACK;
  return trimmed.length > GUEST_NAME_MAX
    ? trimmed.slice(0, GUEST_NAME_MAX)
    : trimmed;
}

// ---------------------------------------------------------------------------
// Message builders. Optional pieces use CLAUSE DROPPING: an unavailable value
// removes its whole sentence rather than rendering an empty placeholder.
// ---------------------------------------------------------------------------
function buildCheckIn(c: Candidate, rule: Rule): string {
  const p = c.property;
  // The column is `time` and defaults to '14:00', so it is never null in practice;
  // slice to HH:MM in case a full HH:MM:SS comes back over the wire.
  const time = (p?.check_in_time ?? "14:00").slice(0, 5);
  const mapLink =
    p && p.location_lat != null && p.location_lng != null
      ? `https://maps.google.com/?q=${p.location_lat},${p.location_lng}`
      : null;
  const hostPhone = p?.phone ?? rule.owner_phone ?? null;

  let msg = TEMPLATES.check_in
    .replace("[Guest_Name]", clampName(c.guest_name))
    .replace("[Check_In_Time]", time);
  msg = mapLink
    ? msg.replace("[Map_Link]", mapLink)
    : msg.replace(" ლოკაცია: [Map_Link].", "");
  msg = hostPhone
    ? msg.replace("[Host_Phone]", hostPhone)
    : msg.replace(" დეტალებისთვის: [Host_Phone].", "");
  return msg;
}

function buildReviewRequest(c: Candidate, siteUrl: string): string {
  // D4: the existing auth-gated route. No token-based public review page exists.
  return TEMPLATES.review_request
    .replace("[Guest_Name]", clampName(c.guest_name))
    .replace(
      "[Property_Review_Link]",
      `${siteUrl}/dashboard/guest/rate/${c.booking_id}`,
    );
}

function buildWinBack(c: Candidate, rule: Rule, siteUrl: string): string {
  const value = (rule.win_back_discount_value ?? "").trim();
  const period = (rule.win_back_discount_period ?? "").trim();
  const link = c.property
    ? `${siteUrl}${propertyViewPath(c.property)}`
    : siteUrl;

  // THE FALLBACK RULE, stated so it cannot drift: use the parameterised template
  // ONLY when BOTH fields are non-empty after trim. If EITHER is missing, use the
  // fallback. Never render a half-filled "([Discount_Period])".
  if (!value || !period) {
    return TEMPLATES.win_back_fallback
      .replace("[Guest_Name]", clampName(c.guest_name))
      .replace("[Property_Direct_Link]", link);
  }
  return TEMPLATES.win_back
    .replace("[Guest_Name]", clampName(c.guest_name))
    .replace("[Discount_Value]", value)
    .replace("[Discount_Period]", period)
    .replace("[Property_Direct_Link]", link);
}

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
         check_in_reminder_enabled, check_in_reminder_hours_before,
         review_request_enabled, review_request_hours_after,
         win_back_enabled, win_back_days_after,
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
        check_in_reminder_hours_before: r.check_in_reminder_hours_before,
        review_request_enabled: r.review_request_enabled,
        review_request_hours_after: r.review_request_hours_after,
        win_back_enabled: r.win_back_enabled,
        win_back_days_after: r.win_back_days_after,
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
    //    Normalised with the repo's toLocalGePhone rather than the SQL normalize_ge_phone
    //    so both sides of the comparison use ONE definition (this file's).
    const { data: optOutRows, error: optOutErr } = await db
      .from("profiles")
      .select("phone")
      .eq("marketing_opt_out", true);
    if (optOutErr) throw optOutErr;
    const optedOut = new Set(
      ((optOutRows as { phone: string | null }[] | null) ?? [])
        .map((r) => toLocalGePhone(r.phone))
        .filter((p) => p.length > 0),
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
        // no_consent and sale_only are enforced as QUERY FILTERS (so the .limit()
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

      const enqueue = async (
        kind: AutomationKind,
        c: Candidate,
        message: string,
      ) => {
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
          return;
        }
        if (data) summary.queued[kind] += 1;
        else skip("already_queued", { kind, booking_id: c.booking_id });
      };

      // Shared per-candidate gate for reachability + opt-out.
      const reachable = (c: Candidate, marketing: boolean): boolean => {
        if (!c.guest_phone) {
          skip("no_phone", { booking_id: c.booking_id });
          return false;
        }
        if (!isValidGePhone(c.guest_phone)) {
          skip("invalid_phone", { booking_id: c.booking_id });
          return false;
        }
        // T1 is transactional, so opt-out applies only to the marketing kinds.
        if (marketing && optedOut.has(toLocalGePhone(c.guest_phone))) {
          skip("opted_out", { booking_id: c.booking_id });
          return false;
        }
        return true;
      };

      // ---- T1 CHECK-IN -----------------------------------------------------
      // PINNED TO EXACTLY check_in = tomorrow. The template hardcodes "ხვალ"
      // (tomorrow), so any other window would make the SMS lie.
      // check_in_reminder_hours_before is therefore VESTIGIAL for the message -
      // left in the DB, deliberately unused here (follow-up sms-f5: either derive
      // the day-word or narrow the CHECK to 24). P2(e)'s 36h expiry window depends
      // on this pinning; change one and the other must change.
      // T1 ignores marketing_consent - it is transactional, not marketing (spec §2).
      if (rule.check_in_reminder_enabled) {
        const tomorrow = utcDate(1);
        for (const c of await scanPlatform(db, {
          owner_id: rule.user_id,
          dateCol: "check_in",
          date: tomorrow,
          statuses: ["confirmed", "pending"],
        })) {
          if (!reachable(c, false)) continue;
          await enqueue("check_in", c, buildCheckIn(c, rule));
        }
        for (const c of await scanManual(db, {
          owner_id: rule.user_id,
          dateCol: "check_in",
          date: tomorrow,
        })) {
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
        const day = utcDateHoursAgo(rule.review_request_hours_after);
        for (const c of await scanPlatform(db, {
          owner_id: rule.user_id,
          dateCol: "check_out",
          date: day,
          statuses: ["completed"],
          requireConsent: true,
        })) {
          if (!reachable(c, true)) continue;
          const { count } = await db
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("booking_id", c.booking_id);
          if ((count ?? 0) > 0) continue; // already reviewed
          await enqueue("review_request", c, buildReviewRequest(c, siteUrl));
        }
      }

      // ---- T3 WIN-BACK -----------------------------------------------------
      if (rule.win_back_enabled) {
        const day = utcDate(-rule.win_back_days_after);
        for (const c of await scanPlatform(db, {
          owner_id: rule.user_id,
          dateCol: "check_out",
          date: day,
          statuses: ["completed"],
          requireConsent: true,
        })) {
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
              .map((r) => toLocalGePhone(r.guest_phone))
              .filter((p) => p.length > 0),
          );
          for (const c of manualCandidates) {
            if (!reachable(c, true)) continue;
            if (rebooked.has(toLocalGePhone(c.guest_phone))) continue;
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
// .limit() is never consumed by rows we would immediately discard.
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
    .or(RENTAL_ONLY, { referencedTable: "property" });
  if (opts.requireConsent) q = q.eq("marketing_consent", true);

  const { data, error } = await q.limit(200);
  if (error) throw error;

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
  return ((data as Row[] | null) ?? []).map((r) => {
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
    .or(RENTAL_ONLY, { referencedTable: "property" });
  if (opts.requireConsent) q = q.eq("marketing_consent", true);

  const { data, error } = await q.limit(200);
  if (error) throw error;

  type Row = {
    id: string;
    owner_id: string;
    guest_name: string | null;
    guest_phone: string | null;
    property: PropertyRef | PropertyRef[] | null;
  };
  return ((data as Row[] | null) ?? []).map((r) => ({
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
