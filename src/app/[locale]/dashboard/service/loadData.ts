import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type OwnerStats =
  Database["public"]["Functions"]["owner_dashboard_stats"]["Returns"][number];

export type ServiceData = {
  services: Tables<"services">[];
  stats: OwnerStats | null;
};

/**
 * Computes the service dashboard data. Shared by the server component (initial
 * render, server client) and the client realtime handler (browser client) so the
 * logic lives in one place and the first paint already has real data.
 */
export async function loadServiceData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ServiceData> {
  const [svcRes, rpcRes] = await Promise.all([
    supabase
      .from("services")
      .select("*")
      .eq("owner_id", userId)
      .neq("category", "food")
      .neq("category", "cleaning")
      .order("created_at", { ascending: false }),
    supabase.rpc("owner_dashboard_stats", { p_scope: "service" }),
  ]);

  const mine = svcRes.data ?? [];

  return {
    services: mine,
    stats: rpcRes.data?.[0] ?? null,
  };
}
