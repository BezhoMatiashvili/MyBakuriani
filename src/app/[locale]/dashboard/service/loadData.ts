import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type OwnerStats =
  Database["public"]["Functions"]["owner_dashboard_stats"]["Returns"][number];

export type ServiceData = {
  services: Tables<"services">[];
  stats: OwnerStats | null;
};

/**
 * Computes the service dashboard data for a single service category (e.g.
 * "transport", "employment", "entertainment", "handyman"). Shared by the server
 * component (initial render, server client) and the client realtime handler
 * (browser client) so the logic lives in one place and the first paint already
 * has real data.
 *
 * KPIs are scoped to the category's own listings via the RPC's `p_listing_ids`
 * (no DB change). An empty array correctly yields zeroed stats; passing the IDs
 * also narrows `spent` to listing-tied purchases.
 */
export async function loadServiceData(
  supabase: SupabaseClient<Database>,
  userId: string,
  category: string,
): Promise<ServiceData> {
  const { data: svcData } = await supabase
    .from("services")
    .select("*")
    .eq("owner_id", userId)
    // `category` arrives as a plain string from the loosely-typed client prop;
    // callers only pass valid service_category values, so narrow it for the query.
    .eq("category", category as Database["public"]["Enums"]["service_category"])
    .order("created_at", { ascending: false });

  const mine = svcData ?? [];

  const { data: statsData } = await supabase.rpc("owner_dashboard_stats", {
    p_scope: "service",
    p_listing_ids: mine.map((s) => s.id),
  });

  return {
    services: mine,
    stats: statsData?.[0] ?? null,
  };
}
