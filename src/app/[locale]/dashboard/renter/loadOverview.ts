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
  /** A paid membership exists but cannot grant access before admin review. */
  membershipPending: boolean;
  membershipPendingExpiresAt: string | null;
  membershipPlans: RenterMembershipPlan[];
};

export type RenterMembershipPlan = Pick<
  Tables<"pricing_packages">,
  "id" | "name" | "label" | "description" | "amount_gel" | "sort_order"
> & {
  billingPeriod: "seasonal";
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
      .in("status", ["active", "pending_approval"]),
    supabase
      .from("pricing_packages")
      .select("id, name, label, description, amount_gel, sort_order, meta")
      .eq("category", "subscription")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
  ]);

  const now = new Date().toISOString();
  const activeSubscriptions = (subscriptionsRes.data ?? []).filter(
    (subscription) =>
      subscription.status === "active" &&
      subscription.starts_at <= now &&
      subscription.expires_at > now,
  );
  const membershipExpiresAt = activeSubscriptions.reduce<
    string | null
  >(
    (latest, subscription) =>
      !latest || subscription.expires_at > latest
        ? subscription.expires_at
        : latest,
    null,
  );
  const pendingMemberships = (subscriptionsRes.data ?? []).filter(
    (subscription) => subscription.status === "pending_approval",
  );
  const membershipPendingExpiresAt = pendingMemberships.reduce<string | null>(
    (latest, subscription) =>
      !latest || subscription.expires_at > latest
        ? subscription.expires_at
        : latest,
    null,
  );
  const membershipPlans = (packagesRes.data ?? []).flatMap((pkg) => {
    const meta = pkg.meta as Record<string, unknown> | null;
    if (
      meta?.subscription_scope !== "renter" ||
      meta?.billing_period !== "seasonal"
    ) {
      return [];
    }
    return [{ ...pkg, billingPeriod: "seasonal" as const }];
  }).slice(0, 1);

  return {
    profile: profileRes.data ?? null,
    properties: propertiesRes.data ?? [],
    stats: statsRes.data?.[0] ?? null,
    walletBalance: Number(balanceRes.data?.amount ?? 0),
    membershipExpiresAt,
    membershipPending: pendingMemberships.length > 0,
    membershipPendingExpiresAt,
    membershipPlans,
  };
}
