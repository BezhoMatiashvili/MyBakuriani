import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { manualReviewUrl } from "@/lib/sms/manual-booking-review";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

const LOCALES = new Set(["ka", "en", "ru"]);

async function ownerBooking(id: string) {
  if (!isUuid(id)) return { error: "invalid_booking" as const, status: 400 };
  const user = await getCurrentUser();
  if (!user) return { error: "unauthenticated" as const, status: 401 };

  const db = createServiceClient();
  const { data, error } = await db
    .from("manual_bookings")
    .select("id, owner_id, status, check_out, marketing_consent")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: "not_found" as const, status: 404 };
  return { db, booking: data, ownerId: user.id };
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
  const { booking, db, ownerId } = result;

  if (booking.status === "cancelled") {
    return Response.json({ error: "cancelled_booking" }, { status: 409 });
  }
  if (!booking.marketing_consent) {
    return Response.json({ error: "not_consented" }, { status: 409 });
  }
  const todayTbilisi = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Tbilisi",
  });
  if (booking.check_out > todayTbilisi) {
    return Response.json({ error: "not_past_checkout" }, { status: 409 });
  }

  const { data: existingReview, error: reviewError } = await db
    .from("reviews")
    .select("id")
    .eq("manual_booking_id", id)
    .maybeSingle();
  if (reviewError) {
    return Response.json({ error: reviewError.message }, { status: 500 });
  }
  if (existingReview) {
    return Response.json({ error: "already_reviewed" }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as {
    locale?: unknown;
  } | null;
  const locale =
    typeof body?.locale === "string" && LOCALES.has(body.locale)
      ? body.locale
      : "ka";

  const { data: token, error } = await db.rpc(
    "sms_create_manual_review_token",
    { p_owner_id: ownerId, p_manual_booking_id: id },
  );
  if (error) {
    return Response.json(
      { error: error.code === "42501" ? "not_review_eligible" : error.message },
      { status: error.code === "42501" ? 409 : 500 },
    );
  }

  return Response.json(
    { url: manualReviewUrl(token as string, locale) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
