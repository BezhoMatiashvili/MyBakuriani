import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type SellerData = {
  properties: Tables<"properties">[];
};

/**
 * Loads the seller dashboard's listing preview (sale listings). Shared by the
 * server component (initial render, server client) and the client realtime
 * handler (browser client) so the first paint already has real data and the
 * query lives in one place.
 */
export async function loadSellerData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SellerData> {
  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("owner_id", userId)
    .eq("is_for_sale", true)
    .order("created_at", { ascending: false })
    .limit(4);

  return { properties: data ?? [] };
}
