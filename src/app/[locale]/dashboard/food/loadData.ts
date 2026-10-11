import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type OwnerStats =
  Database["public"]["Functions"]["owner_dashboard_stats"]["Returns"][number];

export type FoodData = {
  restaurant: Tables<"services"> | null;
  kpis: OwnerStats | null;
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

  const kpisRes = await supabase.rpc("owner_dashboard_stats", {
    p_scope: "food",
    // The whole screen describes `restaurant` (newest food listing: header,
    // hours, price, actions, one-item picker), so scope the tiles to it —
    // its header count and the Views tile can no longer disagree for owners
    // with several food listings.
    p_listing_ids: restaurant ? [restaurant.id] : undefined,
  });

  return {
    restaurant,
    kpis: kpisRes.data?.[0] ?? null,
  };
}
