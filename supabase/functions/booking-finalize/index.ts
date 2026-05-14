import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  buildCorsHeaders,
  createServiceClient,
  errorResponse,
  getBearerToken,
  jsonResponse,
} from "../_shared/guards.ts";

// Daily-scheduled job. Finds bookings whose check_out has passed,
// transitions them to `completed`, and inserts a one-time
// `review_request` notification with a link to the in-dashboard rate page.
//
// Auth: shared secret in BOOKING_FINALIZE_SECRET (Bearer header). The cron
// job and any manual invocations must present this token.

function requireSharedSecret(req: Request) {
  const expected = Deno.env.get("BOOKING_FINALIZE_SECRET");
  if (!expected) {
    throw new ApiError(
      "BOOKING_FINALIZE_SECRET is not configured",
      500,
      "ENV_MISSING",
    );
  }
  const token = getBearerToken(req);
  if (token !== expected) {
    throw new ApiError("Invalid shared secret", 401, "AUTH_UNAUTHORIZED");
  }
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    requireSharedSecret(req);
    const supabase = createServiceClient();

    const today = new Date().toISOString().slice(0, 10);

    const { data: due, error: dueErr } = await supabase
      .from("bookings")
      .select("id, guest_id, property_id, check_out")
      .eq("status", "confirmed")
      .lt("check_out", today);

    if (dueErr) throw dueErr;

    let completed = 0;
    let notified = 0;
    let skipped = 0;

    for (const booking of due ?? []) {
      const { error: updateErr } = await supabase
        .from("bookings")
        .update({
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .eq("status", "confirmed");

      if (updateErr) continue;
      completed += 1;

      const { data: existingReview } = await supabase
        .from("reviews")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();

      if (existingReview) {
        skipped += 1;
        continue;
      }

      const actionUrl = `/dashboard/guest/rate/${booking.id}`;
      const { data: existingNotification } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", booking.guest_id)
        .eq("action_url", actionUrl)
        .maybeSingle();

      if (existingNotification) {
        skipped += 1;
        continue;
      }

      const { data: property } = await supabase
        .from("properties")
        .select("title")
        .eq("id", booking.property_id)
        .maybeSingle();

      const propertyTitle = property?.title ?? "თქვენი დარჩენა";

      const { error: notifyErr } = await supabase.from("notifications").insert({
        user_id: booking.guest_id,
        type: "review_request",
        title: "შეაფასეთ თქვენი დარჩენა",
        message: `გთხოვთ შეაფასოთ "${propertyTitle}"`,
        action_url: actionUrl,
      });

      if (!notifyErr) notified += 1;
    }

    return jsonResponse(
      {
        data: {
          processed: due?.length ?? 0,
          completed,
          notified,
          skipped,
        },
      },
      200,
      cors,
    );
  } catch (err) {
    return errorResponse(err, cors);
  }
});
