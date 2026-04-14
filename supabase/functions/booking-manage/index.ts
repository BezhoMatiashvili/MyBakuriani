import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { supabase, user } = await requireUser(req);

    const { booking_id, action, owner_response } = await req.json();

    // Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) throw new Error("ჯავშანი ვერ მოიძებნა");

    // Only owner can manage
    if (booking.owner_id !== user.id) {
      throw new Error("მხოლოდ მფლობელს შეუძლია ჯავშნის მართვა");
    }

    if (booking.status !== "pending") {
      throw new Error("ჯავშანი უკვე დამუშავებულია");
    }

    if (action === "accept") {
      // Accept booking
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          owner_response: owner_response || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking_id);

      if (updateError) throw updateError;

      // Calendar blocks will be created by the on_booking_confirmed trigger

      // Notify guest
      await supabase.from("notifications").insert({
        user_id: booking.guest_id,
        type: "booking",
        title: "ჯავშანი დადასტურებულია",
        message: `თქვენი ჯავშანი ${booking.check_in} - ${booking.check_out} დადასტურდა`,
        action_url: `/dashboard/bookings/${booking.id}`,
      });

      return jsonResponse({ data: { status: "confirmed", booking_id } }, 200);
    } else if (action === "reject") {
      // Reject booking
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          owner_response: owner_response || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking_id);

      if (updateError) throw updateError;

      // Notify guest
      await supabase.from("notifications").insert({
        user_id: booking.guest_id,
        type: "booking",
        title: "ჯავშანი უარყოფილია",
        message: `თქვენი ჯავშანი ${booking.check_in} - ${booking.check_out} უარყოფილია`,
        action_url: `/dashboard/bookings/${booking.id}`,
      });

      return jsonResponse({ data: { status: "cancelled", booking_id } }, 200);
    } else {
      throw new Error("არასწორი მოქმედება. გამოიყენეთ 'accept' ან 'reject'");
    }
  } catch (err) {
    return errorResponse(err);
  }
});
