import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  checkRateLimit,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (!(await checkRateLimit(req, "booking-create", 10, 60 * 60_000))) {
    return jsonResponse(
      { error: "rate_limited", code: "RATE_LIMITED" },
      429,
      cors,
    );
  }

  try {
    const { supabase, user } = await requireUser(req);

    const body = await req.json().catch(() => ({}));
    const {
      property_id,
      check_in,
      check_out,
      guests_count,
      guest_message,
      marketing_consent,
    } = body;

    if (!property_id || typeof property_id !== "string") {
      throw new Error("ობიექტი ვერ მოიძებნა");
    }
    if (typeof check_in !== "string" || !ISO_DATE_RE.test(check_in)) {
      throw new Error("არასწორი თარიღები");
    }
    if (typeof check_out !== "string" || !ISO_DATE_RE.test(check_out)) {
      throw new Error("არასწორი თარიღები");
    }

    const { data: booking, error } = await supabase
      .rpc("create_booking", {
        p_guest_id: user.id,
        p_property_id: property_id,
        p_check_in: check_in,
        p_check_out: check_out,
        p_guests_count: Number.isFinite(Number(guests_count))
          ? Number(guests_count)
          : 1,
        p_guest_message:
          typeof guest_message === "string" ? guest_message : null,
        p_marketing_consent: marketing_consent === true,
      })
      .single();

    if (error) throw error;
    if (!booking) throw new Error("ჯავშნის შექმნა ვერ მოხერხდა");
    const bookingRow = booking as Record<string, unknown>;
    if (
      typeof bookingRow.id !== "string" ||
      typeof bookingRow.owner_id !== "string" ||
      (typeof bookingRow.total_price !== "number" &&
        typeof bookingRow.total_price !== "string")
    ) {
      throw new Error("ჯავშნის შექმნა ვერ მოხერხდა");
    }

    // Notify owner
    await supabase.from("notifications").insert({
      user_id: bookingRow.owner_id,
      type: "booking",
      title: "ახალი ჯავშანი",
      message: `ახალი ჯავშანი: ${check_in} - ${check_out}, ${bookingRow.total_price} ₾`,
      action_url: `/dashboard/bookings/${bookingRow.id}`,
      dashboard_scope: "renter",
    });

    return jsonResponse({ data: booking }, 201, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
