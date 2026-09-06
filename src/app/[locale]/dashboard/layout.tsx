import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { isSmsFeatureEnabled } from "@/lib/sms/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/current-user";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { deriveAvailableCabinets } from "@/lib/cabinets";
import type { DashboardUnreadCounts } from "@/lib/notifications/scopes";

// Dashboards render per-user data server-side (auth cookies, balances, roles)
// and redirect when signed out, so they must never be statically prerendered.
export const dynamic = "force-dynamic";

// Shape of the dashboard_layout_data() RPC payload (jsonb).
// smart_match_actionable = open Smart Match requests this renter has NOT answered
// (smart_match_actionable_count(), the same definition the inbox renders).
type LayoutData = {
  unread_counts?: DashboardUnreadCounts;
  smart_match_actionable?: number;
  balance_amount?: number | null;
  sms_remaining?: number | null;
  is_for_sale_flags?: boolean[];
  service_categories?: string[];
  cleaning_tasks_count?: number;
  cleaner_online?: boolean | null;
  organizations?: { id: string; name: string; role: string; status: string }[];
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Both of these are scoped by RLS from the request cookie, not by any value
  // getCurrentUser() returns, so they can fly alongside the auth round trip
  // instead of queueing behind it. That collapses two serial cross-region round
  // trips into one on every dashboard entry (the app runs in Singapore, the
  // database in Tokyo, so each serial hop is latency the user waits on).
  //
  // Both carry a .catch(): redirect() below throws, and a promise started before
  // it must not surface as an unhandled rejection. Falling back to the same
  // "empty" shapes this code already degrades to keeps behaviour identical — a
  // signed-out request still reaches the redirect rather than erroring.
  const profilePromise = getCurrentProfile().catch(() => null);
  const layoutPromise = Promise.resolve(
    supabase.rpc("dashboard_layout_data"),
  ).catch(() => ({
    data: null,
    error: { message: "dashboard_layout_data unavailable" },
  }));

  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const t = await getTranslations("DashboardLayout");
  const sellerSmsFlag = isSmsFeatureEnabled("SMS_PRICE_DROP_MODE", user.id);

  // One RPC instead of 7 parallel REST queries — counts, balance and
  // cabinet-derivation flags arrive in a single round trip.
  // The root [locale] provider only ships public namespaces, so re-provide the
  // full message bundle for the dashboard subtree (nested providers replace,
  // not merge — locale/timeZone/formats are still inherited from the parent).
  // sellerSmsCount only depends on user.id (already resolved above), so it runs
  // alongside the rest of this request's Supabase calls instead of adding a
  // separate round-trip to the tail of the critical path.
  const [profile, layoutRes, messages, sellerSmsCount] = await Promise.all([
    profilePromise,
    layoutPromise,
    getMessages(),
    sellerSmsFlag
      ? supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id)
          .eq("is_for_sale", true)
          .is("organization_id", null)
      : Promise.resolve({ count: 0 }),
  ]);

  // Defensive: fall back to safe defaults if the RPC errors (e.g. code
  // deployed before the migration) instead of crashing every dashboard route.
  const data: LayoutData = layoutRes.error
    ? {}
    : ((layoutRes.data ?? {}) as LayoutData);

  const displayName = profile?.display_name ?? t("defaultUser");
  const role = profile?.role ?? "guest";
  const avatarUrl = profile?.avatar_url ?? null;
  const balance = Number(data.balance_amount ?? 0);
  const smsRemaining = Number(data.sms_remaining ?? 0);
  const smartMatchCount = data.smart_match_actionable ?? 0;

  const availableCabinets = deriveAvailableCabinets({
    role,
    isForSaleFlags: (data.is_for_sale_flags ?? []).map((f) => f === true),
    serviceCategories: data.service_categories ?? [],
    hasCleaningTasks: (data.cleaning_tasks_count ?? 0) > 0,
    organizations: data.organizations ?? [],
  });
  const canUseSms = (data.is_for_sale_flags ?? []).some(
    (isForSale) => isForSale !== true,
  );
  const canUseSellerSms = sellerSmsFlag && (sellerSmsCount.count ?? 0) > 0;

  return (
    <NextIntlClientProvider messages={messages}>
      <DashboardShell
        userId={user.id}
        displayName={displayName}
        role={role}
        avatarUrl={avatarUrl}
        initialUnreadCounts={data.unread_counts ?? {}}
        balance={balance}
        smsRemaining={smsRemaining}
        canUseSms={canUseSms}
        canUseSellerSms={canUseSellerSms}
        smartMatchCount={smartMatchCount}
        availableCabinets={availableCabinets}
        cleanerOnline={data.cleaner_online ?? true}
        companies={data.organizations ?? []}
      >
        {children}
      </DashboardShell>
    </NextIntlClientProvider>
  );
}
