import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type SellerData = {
  properties: Tables<"properties">[];
};

export interface SellerScope {
  mode: "personal" | "org";
  organizationId: string | null;
}

/**
 * Loads the seller dashboard's listing preview (sale listings). Shared by the
 * server component (initial render, server client) and the client realtime
 * handler (browser client) so the first paint already has real data and the
 * query lives in one place.
 *
 * `scope` is optional: the server render has no access to the client's
 * org-scope selection, so it keeps calling this with just a userId, which
 * resolves to the personal (owner_id) view — matching the scope provider's
 * own default state on first paint.
 */
export async function loadSellerData(
  supabase: SupabaseClient<Database>,
  userId: string,
  scope?: SellerScope,
): Promise<SellerData> {
  let query = supabase.from("properties").select("*").eq("is_for_sale", true);

  if (scope?.mode === "org" && scope.organizationId) {
    query = query.eq("organization_id", scope.organizationId);
  } else {
    // Personal scope shows only untagged listings — company-linked ones live
    // exclusively under their org scope.
    query = query.eq("owner_id", userId).is("organization_id", null);
  }

  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(4);

  return { properties: data ?? [] };
}
