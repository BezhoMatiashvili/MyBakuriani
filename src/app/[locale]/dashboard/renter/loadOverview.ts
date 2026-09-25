import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";
import {
  deriveMembershipState,
  type MembershipWindow,
} from "@/lib/membership/plans";

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
  membershipPendingStartsAt: string | null;
  membershipPendingExpiresAt: string | null;
  /** An approved membership for a later season (e.g. winter bought in summer). */
  membershipUpcoming: MembershipWindow | null;
  /** Remaining windows already paid for; plans overlapping them are not sold. */
  membershipCovered: MembershipWindow[];
  membershipPlans: RenterMembershipPlan[];
};

/**
 * One enabled seasonal plan (2026 price list: summer / winter × FB-group VIP
 * member / other user) with its current-or-next season window — computed in
 * SQL by renter_membership_plans(), never in the browser.
 */
export type RenterMembershipPlan =
  Database["public"]["Functions"]["renter_membership_plans"]["Returns"][number];

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
    plansRes,
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
    supabase.rpc("renter_membership_plans"),
  ]);

  const membership = deriveMembershipState(
    subscriptionsRes.data ?? [],
    Date.now(),
  );

  return {
    profile: profileRes.data ?? null,
    properties: propertiesRes.data ?? [],
    stats: statsRes.data?.[0] ?? null,
    walletBalance: Number(balanceRes.data?.amount ?? 0),
    membershipExpiresAt: membership.activeUntil,
    membershipPending: membership.pending !== null,
    membershipPendingStartsAt: membership.pending?.startsAt ?? null,
    membershipPendingExpiresAt: membership.pending?.expiresAt ?? null,
    membershipUpcoming: membership.upcoming,
    membershipCovered: membership.covered,
    membershipPlans: plansRes.data ?? [],
  };
}
