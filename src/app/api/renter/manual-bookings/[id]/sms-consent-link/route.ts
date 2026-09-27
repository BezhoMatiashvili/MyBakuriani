import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { toCanonicalGePhone } from "@/lib/sms/phone";
import {
  MANUAL_BOOKING_SMS_CONSENT_VERSION,
  createManualBookingConsentToken,
  manualBookingConsentSms,
} from "@/lib/sms/manual-booking-consent";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

// The owner only asks; the platform texts the consent link to the booking's
// phone. The token and link are never returned or logged here (S07).

// Mirrors the 24-hour-per-number rule enforced in request_manual_booking_sms_consent.
const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;

// Owner-shared links retired by migration 20260927091100. An acceptance they
// lost was not the guest's own withdrawal, so the guest may be asked again.
const RETIRED_CONSENT_VERSION = "manual-sms-v1";

const noStore = { "Cache-Control": "no-store" };

type SmsState = "queued" | "sent" | "failed";

function smsState(status: string): SmsState {
  if (status === "sent") return "sent";
  if (status === "failed" || status === "rejected") return "failed";
  return "queued";
}

type RequestResult = {
  ok: boolean;
  reason?: string;
  duplicate?: boolean;
  consent_status?: string;
  sms_status?: string;
  requested_at?: string;
};

// request_manual_booking_sms_consent (migration 20260927091100) is missing from
// the generated types until `npm run types:gen` runs against a database that has
// it; this narrow cast can go after that regen.
type RequestConsentSmsRpc = (
  fn: "request_manual_booking_sms_consent",
  args: {
    p_owner_id: string;
    p_manual_booking_id: string;
    p_token_hash: string;
    p_consent_version: string;
    p_message: string;
  },
) => PromiseLike<{
  data: RequestResult | null;
  error: { code?: string } | null;
}>;

const REFUSAL_STATUS: Record<string, number> = {
  cancelled_booking: 409,
  valid_phone_required: 409,
  consent_already_accepted: 409,
  consent_declined: 409,
  phone_rate_limited: 429,
  daily_limit: 429,
  insufficient_sms_credit: 402,
};

async function ownerBooking(id: string) {
  if (!isUuid(id)) return { error: "invalid_booking" as const, status: 400 };
  const user = await getCurrentUser();
  if (!user) return { error: "unauthenticated" as const, status: 401 };

  const db = createServiceClient();
  const { data, error } = await db
    .from("manual_bookings")
    .select("id, owner_id, guest_phone, marketing_consent, status")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: "not_found" as const, status: 404 };
  return { db, booking: data, ownerId: user.id };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await ownerBooking(id);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const phone = toCanonicalGePhone(result.booking.guest_phone);
  const [consentRes, smsRes, answerRes] = await Promise.all([
    result.db
      .from("manual_booking_sms_consents")
      .select("status, created_at, accepted_at, declined_at, revoked_at")
      .eq("manual_booking_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // The request SMS attached to this booking (one per booking by the
    // automation uniqueness key). Its message holds the guest's link and is
    // deliberately not selected.
    result.db
      .from("sms_outbound")
      .select("status, recipient_phone, created_at")
      .eq("sender_id", result.ownerId)
      .eq("source_manual_booking_id", id)
      .eq("automation_kind", "consent_request")
      .maybeSingle(),
    // Same row request_manual_booking_sms_consent judges: the latest link
    // issued to the booking's current number.
    phone
      ? result.db
          .from("manual_booking_sms_consents")
          .select("status, consent_version, accepted_at, declined_at")
          .eq("manual_booking_id", id)
          .eq("phone_snapshot", phone)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null,
  ]);
  if (consentRes.error || smsRes.error || answerRes?.error) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }

  const data = consentRes.data;
  const sms = smsRes.data;
  const answer = answerRes?.data;
  // Mirrors the RPC's consent_declined refusal: this number's guest declined,
  // or withdrew an acceptance, so the booking cannot ask them again.
  const guestDeclined = Boolean(
    answer &&
    (answer.declined_at ||
      (answer.status === "revoked" &&
        answer.accepted_at &&
        answer.consent_version !== RETIRED_CONSENT_VERSION)),
  );
  const state = sms ? smsState(sms.status) : null;
  const resendAt =
    sms && state !== "failed" && sms.recipient_phone === phone
      ? Date.parse(sms.created_at) + RESEND_WINDOW_MS
      : null;
  const coolingDown = resendAt !== null && resendAt > Date.now();

  return Response.json(
    {
      status: data?.status ?? "not_requested",
      marketingConsent: result.booking.marketing_consent,
      phoneValid: Boolean(phone),
      guestDeclined,
      canRequest:
        result.booking.status !== "cancelled" &&
        data?.status !== "accepted" &&
        !guestDeclined &&
        Boolean(phone) &&
        !coolingDown,
      sms: sms ? { status: state, requestedAt: sms.created_at } : null,
      resendAt: coolingDown ? new Date(resendAt).toISOString() : null,
      updatedAt:
        data?.accepted_at ??
        data?.declined_at ??
        data?.revoked_at ??
        data?.created_at ??
        null,
    },
    { headers: noStore },
  );
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await ownerBooking(id);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  if (result.booking.status === "cancelled") {
    return Response.json({ error: "cancelled_booking" }, { status: 409 });
  }
  if (!toCanonicalGePhone(result.booking.guest_phone)) {
    return Response.json({ error: "valid_phone_required" }, { status: 409 });
  }

  const { token, tokenHash } = createManualBookingConsentToken();
  const message = manualBookingConsentSms(token);
  if (!message) {
    return Response.json({ error: "site_url_missing" }, { status: 500 });
  }

  const rpc = result.db.rpc.bind(result.db) as unknown as RequestConsentSmsRpc;
  const { data, error } = await rpc("request_manual_booking_sms_consent", {
    p_owner_id: result.ownerId,
    p_manual_booking_id: id,
    p_token_hash: tokenHash,
    p_consent_version: MANUAL_BOOKING_SMS_CONSENT_VERSION,
    p_message: message,
  });
  if (error) {
    // Never forward the database error: a constraint message could echo the SMS.
    const status =
      error.code === "P0002" ? 404 : error.code === "22023" ? 409 : 500;
    return Response.json(
      {
        error:
          status === 404
            ? "not_found"
            : status === 409
              ? "request_not_available"
              : "server_error",
      },
      { status, headers: noStore },
    );
  }
  if (!data?.ok) {
    const reason = data?.reason ?? "server_error";
    return Response.json(
      { error: reason },
      { status: REFUSAL_STATUS[reason] ?? 500, headers: noStore },
    );
  }

  return Response.json(
    {
      status: data.consent_status ?? "pending",
      duplicate: Boolean(data.duplicate),
      sms: {
        status: smsState(data.sms_status ?? "approved"),
        requestedAt: data.requested_at ?? null,
      },
    },
    { status: data.duplicate ? 200 : 201, headers: noStore },
  );
}
