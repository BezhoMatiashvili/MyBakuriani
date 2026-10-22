import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/current-user";
import { requireConsent } from "@/lib/auth/require-consent";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SupportAssistantLoader } from "@/components/support/SupportAssistantLoader";
import { isSupportConfigured } from "@/lib/support/openrouter";
import { DASHBOARD_NAMESPACES, pickMessages } from "@/i18n/namespaces";
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

  // Server-side backstop for the blocking consent gate. Reuses the same
  // cache()-wrapped getCurrentProfile() call already in flight above, so this
  // adds no round trip. See src/lib/auth/require-consent.ts.
  await requireConsent();

  const t = await getTranslations("DashboardLayout");

  // One RPC instead of 7 parallel REST queries — counts, balance and
  // cabinet-derivation flags arrive in a single round trip.
  // The root [locale] provider only ships public namespaces, so re-provide the
  // dashboard subtree's namespaces (DASHBOARD_NAMESPACES, derived by
  // scripts/i18n-scope.mjs; nested providers replace, not merge —
  // locale/timeZone/formats are still inherited from the parent).
  const [profile, layoutRes, messages] = await Promise.all([
    profilePromise,
    layoutPromise,
    getMessages(),
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

  return (
    <NextIntlClientProvider
      messages={pickMessages(messages, DASHBOARD_NAMESPACES)}
    >
      <DashboardShell
        userId={user.id}
        displayName={displayName}
        role={role}
        avatarUrl={avatarUrl}
        initialUnreadCounts={data.unread_counts ?? {}}
        balance={balance}
        smsRemaining={smsRemaining}
        canUseSms={canUseSms}
        smartMatchCount={smartMatchCount}
        availableCabinets={availableCabinets}
        cleanerOnline={data.cleaner_online ?? true}
        companies={data.organizations ?? []}
      >
        {children}
      </DashboardShell>
      {isSupportConfigured() && <SupportAssistantLoader homeRole={role} />}
    </NextIntlClientProvider>
  );
}
