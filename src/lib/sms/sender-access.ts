import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SMS Center belongs to the renter cabinet: primary-role renters plus anyone
 * who owns at least one rental (non-for-sale) property. Mirrors
 * deriveAvailableCabinets() in @/lib/cabinets.ts. Callers pass the
 * already-fetched profile role so renters skip the extra query.
 */
export async function canUseSmsCenter(
  supabase: SupabaseClient,
  userId: string,
  role: string | null | undefined,
): Promise<boolean> {
  if (role === "renter") return true;
  const { count } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    // null is_for_sale counts as rental — same as coalesce(is_for_sale, false)
    // in the dashboard_layout_data RPC
    .or("is_for_sale.eq.false,is_for_sale.is.null");
  return (count ?? 0) > 0;
}
