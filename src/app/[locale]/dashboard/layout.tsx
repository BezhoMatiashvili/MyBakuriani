import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/current-user";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { deriveAvailableCabinets } from "@/lib/cabinets";

const SMS_PLAN_TOTAL = 100;

// Shape of the dashboard_layout_data() RPC payload (jsonb).
// smart_match_unread = unread smart_match_request notifications created by
// the DB fan-out trigger, NOT a global active-request count.
type LayoutData = {
  unread_count?: number;
  smart_match_unread?: number;
  balance_amount?: number | null;
  sms_remaining?: number | null;
  is_for_sale_flags?: boolean[];
  service_categories?: string[];
  cleaning_tasks_count?: number;
  cleaner_online?: boolean | null;
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const t = await getTranslations("DashboardLayout");
  const supabase = await createClient();

  // One RPC instead of 7 parallel REST queries — counts, balance and
  // cabinet-derivation flags arrive in a single round trip.
  const [profile, layoutRes] = await Promise.all([
    getCurrentProfile(),
    supabase.rpc("dashboard_layout_data"),
  ]);

  // Defensive: fall back to safe defaults if the RPC errors (e.g. code
  // deployed before the migration) instead of crashing every dashboard route.
  const data: LayoutData = layoutRes.error
    ? {}
    : ((layoutRes.data ?? {}) as LayoutData);

  const displayName = profile?.display_name ?? t("defaultUser");
  const role = profile?.role ?? "guest";
  const avatarUrl = profile?.avatar_url ?? null;
  const notificationCount = data.unread_count ?? 0;
  const balance = Number(data.balance_amount ?? 0);
  const smsRemaining = Number(data.sms_remaining ?? SMS_PLAN_TOTAL);
  const smartMatchCount = data.smart_match_unread ?? 0;

  const availableCabinets = deriveAvailableCabinets({
    role,
    isForSaleFlags: (data.is_for_sale_flags ?? []).map((f) => f === true),
    serviceCategories: data.service_categories ?? [],
    hasCleaningTasks: (data.cleaning_tasks_count ?? 0) > 0,
  });

  return (
    <DashboardShell
      userId={user.id}
      displayName={displayName}
      role={role}
      avatarUrl={avatarUrl}
      initialNotificationCount={notificationCount}
      balance={balance}
      smsRemaining={smsRemaining}
      smartMatchCount={smartMatchCount}
      availableCabinets={availableCabinets}
      cleanerOnline={data.cleaner_online ?? true}
    >
      {children}
    </DashboardShell>
  );
}
