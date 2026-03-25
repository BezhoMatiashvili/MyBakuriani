import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization")!;
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) throw new Error("Unauthorized");

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

      return new Response(
        JSON.stringify({ data: { status: "confirmed", booking_id } }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
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

      return new Response(
        JSON.stringify({ data: { status: "cancelled", booking_id } }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } else {
      throw new Error("არასწორი მოქმედება. გამოიყენეთ 'accept' ან 'reject'");
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
