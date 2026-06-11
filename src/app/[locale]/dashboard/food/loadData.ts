import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type OwnerStats =
  Database["public"]["Functions"]["owner_dashboard_stats"]["Returns"][number];

export type FoodData = {
  restaurant: Tables<"services"> | null;
  kpis: OwnerStats | null;
  stats: {
    ordersToday: number;
    revenueThisMonth: number;
  };
};

/**
 * Loads the food dashboard data. Shared by the server component (initial render,
 * server client) and the client realtime handler (browser client) so the logic
 * lives in one place and the first paint already has real data.
 */
export async function loadFoodData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FoodData> {
  const { data: svcData } = await supabase
    .from("services")
    .select("*")
    .eq("owner_id", userId)
    .eq("category", "food")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const restaurant = svcData ?? null;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [todayRes, monthRes, kpisRes] = await Promise.all([
    supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", userId)
      .gte("created_at", startOfDay.toISOString()),
    supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", userId)
      .gte("created_at", startOfMonth.toISOString()),
    supabase.rpc("owner_dashboard_stats", { p_scope: "food" }),
  ]);

  const unitPrice = restaurant?.price ?? 0;

  return {
    restaurant,
    kpis: kpisRes.data?.[0] ?? null,
    stats: {
      ordersToday: todayRes.count ?? 0,
      revenueThisMonth: (monthRes.count ?? 0) * unitPrice,
    },
  };
}
