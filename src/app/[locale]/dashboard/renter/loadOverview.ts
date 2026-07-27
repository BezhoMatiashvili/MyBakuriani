import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type OwnerStats =
  Database["public"]["Functions"]["owner_dashboard_stats"]["Returns"][number];

export type RenterOverview = {
  profile: Tables<"profiles"> | null;
  properties: Tables<"properties">[];
  stats: OwnerStats | null;
  walletBalance: number;
  /** The furthest currently-valid account membership expiry, if any. */
  membershipExpiresAt: string | null;
  membershipPlans: RenterMembershipPlan[];
};

export type RenterMembershipPlan = Pick<
  Tables<"pricing_packages">,
  "id" | "name" | "label" | "description" | "amount_gel" | "sort_order"
> & {
  durationMonths: 1 | 3;
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
  const [
    profileRes,
    propertiesRes,
    statsRes,
    balanceRes,
    subscriptionsRes,
    packagesRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("properties")
      .select("*")
      .eq("owner_id", userId)
      .eq("is_for_sale", false)
      .order("created_at", { ascending: false }),
    supabase.rpc("owner_dashboard_stats", { p_scope: "rental" }),
    supabase
      .from("balances")
      .select("amount")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_subscriptions")
      .select("starts_at, expires_at, status")
      .eq("user_id", userId)
      // No starts_at filter: an extension bought while the current term is still
      // running is stored as a future-dated row, and it is exactly that row which
      // carries the new expiry the dashboard must show.
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString()),
    supabase
      .from("pricing_packages")
      .select("id, name, label, description, amount_gel, sort_order, meta")
      .eq("category", "subscription")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
  ]);

  const membershipExpiresAt = (subscriptionsRes.data ?? []).reduce<
    string | null
  >(
    (latest, subscription) =>
      !latest || subscription.expires_at > latest
        ? subscription.expires_at
        : latest,
    null,
  );
  const membershipPlans = (packagesRes.data ?? []).flatMap((pkg) => {
    const meta = pkg.meta as Record<string, unknown> | null;
    const duration = meta?.duration_months;
    if (
      meta?.subscription_scope !== "renter" ||
      (duration !== 1 && duration !== 3)
    ) {
      return [];
    }
    return [{ ...pkg, durationMonths: duration as 1 | 3 }];
  });

  return {
    profile: profileRes.data ?? null,
    properties: propertiesRes.data ?? [],
    stats: statsRes.data?.[0] ?? null,
    walletBalance: Number(balanceRes.data?.amount ?? 0),
    membershipExpiresAt,
    membershipPlans,
  };
}
