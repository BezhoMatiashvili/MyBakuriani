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

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      throw new Error("მხოლოდ ადმინისტრატორს აქვს წვდომა");
    }

    // Total revenue
    const { data: revenue } = await supabase
      .from("transactions")
      .select("amount")
      .gt("amount", 0);

    const totalRevenue =
      revenue?.reduce(
        (sum: number, t: { amount: number }) => sum + t.amount,
        0,
      ) || 0;

    // Active listings
    const { count: activeListings } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    // Total bookings and completion rate
    const { count: totalBookings } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true });

    const { count: completedBookings } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed");

    const bookingCompletionRate = totalBookings
      ? Math.round(((completedBookings || 0) / totalBookings) * 100)
      : 0;

    // New users this month
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const { count: newUsersThisMonth } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", firstOfMonth.toISOString());

    // Pending verifications
    const { count: pendingVerifications } = await supabase
      .from("verifications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // Active services
    const { count: activeServices } = await supabase
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    return new Response(
      JSON.stringify({
        data: {
          total_revenue: totalRevenue,
          active_listings: activeListings || 0,
          active_services: activeServices || 0,
          total_bookings: totalBookings || 0,
          completed_bookings: completedBookings || 0,
          booking_completion_rate: bookingCompletionRate,
          new_users_this_month: newUsersThisMonth || 0,
          pending_verifications: pendingVerifications || 0,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
