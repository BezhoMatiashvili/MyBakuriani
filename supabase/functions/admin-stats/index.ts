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

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      throw new Error("მხოლოდ ადმინისტრატორს აქვს წვდომა");
    }

    const firstOfMonth = new Date();
    firstOfMonth.setUTCDate(1);
    firstOfMonth.setUTCHours(0, 0, 0, 0);

    // Revenue = commissions + VIP/SMS/discount purchases in the current month.
    // Exclude 'topup' (user adding funds is not platform revenue).
    const { data: revenueRows } = await supabase
      .from("transactions")
      .select("amount, type")
      .gte("created_at", firstOfMonth.toISOString())
      .in("type", [
        "vip_boost",
        "super_vip",
        "sms_package",
        "discount_badge",
        "commission",
      ]);

    const totalRevenue = (revenueRows ?? []).reduce(
      (sum: number, t: { amount: number }) => sum + Math.abs(Number(t.amount)),
      0,
    );

    const { count: activeListings } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

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

    const { count: newUsersThisMonth } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", firstOfMonth.toISOString());

    const { count: pendingVerifications } = await supabase
      .from("verifications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: activeServices } = await supabase
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    return jsonResponse(
      {
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
      },
      200,
      cors,
    );
  } catch (err) {
    return errorResponse(err, cors);
  }
});
