import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SMS Center is a rental-listing capability, not a profile-role capability.
 * A primary-role renter with no rental listing, or with sale-only listings,
 * must not see or call the module.
 */
export async function canUseSmsCenter(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    // null is_for_sale counts as rental — same as coalesce(is_for_sale, false)
    // in the dashboard_layout_data RPC
    .or("is_for_sale.eq.false,is_for_sale.is.null");
  return !error && (count ?? 0) > 0;
}
