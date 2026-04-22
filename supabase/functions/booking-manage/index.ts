import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { supabase, user } = await requireUser(req);

    const body = await req.json().catch(() => ({}));
    const { booking_id, action, owner_response } = body;

    if (!booking_id || typeof booking_id !== "string") {
      throw new Error("ჯავშანი ვერ მოიძებნა");
    }
    if (action !== "accept" && action !== "reject") {
      throw new Error("არასწორი მოქმედება. გამოიყენეთ 'accept' ან 'reject'");
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) throw new Error("ჯავშანი ვერ მოიძებნა");

    if (booking.owner_id !== user.id) {
      throw new Error("მხოლოდ მფლობელს შეუძლია ჯავშნის მართვა");
    }

    if (booking.status !== "pending") {
      throw new Error("ჯავშანი უკვე დამუშავებულია");
    }

    const nextStatus = action === "accept" ? "confirmed" : "cancelled";

    const { error: updateError, data: updated } = await supabase
      .from("bookings")
      .update({
        status: nextStatus,
        owner_response: owner_response || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking_id)
      .eq("status", "pending") // optimistic concurrency guard
      .select("*")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) throw new Error("ჯავშანი უკვე დამუშავებულია");

    if (action === "reject") {
      // Free up the dates so other guests can book them
      await supabase.rpc("release_booking_calendar", {
        p_booking_id: booking_id,
      });
    }

    await supabase.from("notifications").insert({
      user_id: booking.guest_id,
      type: "booking",
      title:
        action === "accept" ? "ჯავშანი დადასტურებულია" : "ჯავშანი უარყოფილია",
      message:
        action === "accept"
          ? `თქვენი ჯავშანი ${booking.check_in} - ${booking.check_out} დადასტურდა`
          : `თქვენი ჯავშანი ${booking.check_in} - ${booking.check_out} უარყოფილია`,
      action_url: `/dashboard/bookings/${booking.id}`,
    });

    return jsonResponse(
      { data: { status: nextStatus, booking_id } },
      200,
      cors,
    );
  } catch (err) {
    return errorResponse(err, cors);
  }
});
