import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type OwnerStats =
  Database["public"]["Functions"]["owner_dashboard_stats"]["Returns"][number];

export type RenterOverview = {
  profile: Tables<"profiles"> | null;
  properties: Tables<"properties">[];
  stats: OwnerStats | null;
};

/**
 * Computes the renter dashboard overview. Shared by the server component (initial
 * render, server client) and the client realtime handler (browser client) so the
 * logic lives in one place and the first paint already has real data.
 */
export async function loadRenterOverview(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RenterOverview> {
  // Views/calls/favorites/spent/revenue come from the SECURITY DEFINER RPC —
  // the old owner-side favorites query silently returned 0 under RLS.
  const [profileRes, propertiesRes, statsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("properties")
      .select("*")
      .eq("owner_id", userId)
      .eq("is_for_sale", false)
      .order("created_at", { ascending: false }),
    supabase.rpc("owner_dashboard_stats", { p_scope: "rental" }),
  ]);

  return {
    profile: profileRes.data ?? null,
    properties: propertiesRes.data ?? [],
    stats: statsRes.data?.[0] ?? null,
  };
}
