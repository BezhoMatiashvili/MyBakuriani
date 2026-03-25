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

    const { property_id, check_in, check_out, guests_count, guest_message } =
      await req.json();

    // Fetch property
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", property_id)
      .eq("status", "active")
      .single();

    if (propError || !property) throw new Error("ობიექტი ვერ მოიძებნა");

    // Guest cannot book own property
    if (property.owner_id === user.id) {
      throw new Error("საკუთარ ობიექტზე ჯავშნის გაკეთება შეუძლებელია");
    }

    // Validate dates
    const checkInDate = new Date(check_in);
    const checkOutDate = new Date(check_out);
    if (checkOutDate <= checkInDate) {
      throw new Error("არასწორი თარიღები");
    }

    // Check min_booking_days
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (nights < property.min_booking_days) {
      throw new Error(`მინიმალური ჯავშანი: ${property.min_booking_days} ღამე`);
    }

    // Check date availability (no conflicts in calendar_blocks)
    const { data: conflicts } = await supabase
      .from("calendar_blocks")
      .select("id")
      .eq("property_id", property_id)
      .gte("date", check_in)
      .lt("date", check_out)
      .in("status", ["booked", "blocked"]);

    if (conflicts && conflicts.length > 0) {
      throw new Error("არჩეული თარიღები დაკავებულია");
    }

    // Calculate total price
    const total_price = nights * property.price_per_night;

    // Create booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        property_id,
        guest_id: user.id,
        owner_id: property.owner_id,
        check_in,
        check_out,
        guests_count: guests_count || 1,
        total_price,
        guest_message,
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Notify owner
    await supabase.from("notifications").insert({
      user_id: property.owner_id,
      type: "booking",
      title: "ახალი ჯავშანი",
      message: `ახალი ჯავშანი: ${check_in} - ${check_out}, ${total_price} ₾`,
      action_url: `/dashboard/bookings/${booking.id}`,
    });

    return new Response(JSON.stringify({ data: booking }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 201,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
