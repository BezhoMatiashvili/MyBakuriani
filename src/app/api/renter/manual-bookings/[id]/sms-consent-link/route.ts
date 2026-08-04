import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { toCanonicalGePhone } from "@/lib/sms/phone";
import {
  MANUAL_BOOKING_SMS_CONSENT_VERSION,
  createManualBookingConsentToken,
  manualBookingConsentUrl,
} from "@/lib/sms/manual-booking-consent";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

const LOCALES = new Set(["ka", "en", "ru"]);

async function ownerBooking(id: string) {
  if (!isUuid(id)) return { error: "invalid_booking" as const, status: 400 };
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
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

  const { data, error } = await result.db
    .from("manual_booking_sms_consents")
    .select("status, created_at, accepted_at, declined_at, revoked_at")
    .eq("manual_booking_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    {
      status: data?.status ?? "not_requested",
      marketingConsent: result.booking.marketing_consent,
      canGenerate:
        result.booking.status !== "cancelled" &&
        data?.status !== "accepted" &&
        Boolean(toCanonicalGePhone(result.booking.guest_phone)),
      updatedAt:
        data?.accepted_at ??
        data?.declined_at ??
        data?.revoked_at ??
        data?.created_at ??
        null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: NextRequest,
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
  const phone = toCanonicalGePhone(result.booking.guest_phone);
  if (!phone) {
    return Response.json({ error: "valid_phone_required" }, { status: 409 });
  }

  const { data: latest, error: latestError } = await result.db
    .from("manual_booking_sms_consents")
    .select("status")
    .eq("manual_booking_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    return Response.json({ error: latestError.message }, { status: 500 });
  }
  if (latest?.status === "accepted") {
    return Response.json({ error: "consent_already_accepted" }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as {
    locale?: unknown;
  } | null;
  const locale =
    typeof body?.locale === "string" && LOCALES.has(body.locale)
      ? body.locale
      : "ka";
  const { token, tokenHash } = createManualBookingConsentToken();
  const { error } = await result.db.rpc("issue_manual_booking_sms_consent", {
    p_consent_version: MANUAL_BOOKING_SMS_CONSENT_VERSION,
    p_manual_booking_id: id,
    p_owner_id: result.ownerId,
    p_phone_snapshot: phone,
    p_token_hash: tokenHash,
  });
  if (error) {
    return Response.json(
      { error: error.code === "22023" ? "link_not_available" : error.message },
      { status: error.code === "22023" ? 409 : 500 },
    );
  }

  return Response.json(
    {
      status: "pending",
      url: manualBookingConsentUrl(token, locale),
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
