import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  hashManualBookingConsentToken,
  maskConsentPhone,
} from "@/lib/sms/manual-booking-consent";
import { toCanonicalGePhone } from "@/lib/sms/phone";

export const runtime = "nodejs";

type ConsentJoin = {
  status: string;
  phone_snapshot: string | null;
  consent_version: string;
  manual_booking: {
    id: string;
    guest_name: string | null;
    guest_phone: string | null;
    check_in: string;
    check_out: string;
    status: string;
    property: { title: string | null } | null;
  } | null;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

async function consentDetails(token: string) {
  const tokenHash = hashManualBookingConsentToken(token);
  if (!tokenHash) return null;
  const db = createServiceClient();
  const { data, error } = await db
    .from("manual_booking_sms_consents")
    .select(
      "status, phone_snapshot, consent_version, manual_booking:manual_bookings!inner(id, guest_name, guest_phone, check_in, check_out, status, property:properties!inner(title))",
    )
    .eq("token_hash", tokenHash)
    .neq("status", "revoked")
    .maybeSingle();
  if (error) throw error;
  const consent = data as unknown as ConsentJoin | null;
  if (
    !consent?.manual_booking ||
    consent.manual_booking.status === "cancelled" ||
    toCanonicalGePhone(consent.manual_booking.guest_phone) !==
      consent.phone_snapshot
  ) {
    return null;
  }
  return { db, tokenHash, consent };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const result = await consentDetails(token);
    if (!result) {
      return Response.json(
        { error: "invalid_token" },
        { status: 404, headers: noStoreHeaders },
      );
    }
    const booking = result.consent.manual_booking!;
    return Response.json(
      {
        consent: {
          status: result.consent.status,
          consentVersion: result.consent.consent_version,
          phone: maskConsentPhone(result.consent.phone_snapshot),
          guestName: booking.guest_name,
          checkIn: booking.check_in,
          checkOut: booking.check_out,
          propertyTitle: booking.property?.title ?? null,
        },
      },
      { headers: noStoreHeaders },
    );
  } catch {
    return Response.json(
      { error: "server_error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  if (!body || !["accept", "decline", "revoke"].includes(String(body.action))) {
    return Response.json(
      { error: "invalid_action" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const result = await consentDetails(token);
    if (!result) {
      return Response.json(
        { error: "invalid_token" },
        { status: 404, headers: noStoreHeaders },
      );
    }
    const { data, error } = await result.db.rpc(
      "respond_manual_booking_sms_consent",
      {
        p_action: body.action as "accept" | "decline" | "revoke",
        p_token_hash: result.tokenHash,
      },
    );
    if (error) {
      const invalid = error.code === "P0002" || error.code === "22023";
      return Response.json(
        { error: invalid ? "invalid_token" : "server_error" },
        { status: invalid ? 404 : 500, headers: noStoreHeaders },
      );
    }
    if (!data) {
      return Response.json(
        { error: "invalid_token" },
        { status: 404, headers: noStoreHeaders },
      );
    }
    return Response.json({ consent: data }, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      { error: "server_error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
