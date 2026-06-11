import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/current-user";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { deriveAvailableCabinets } from "@/lib/cabinets";

const SMS_PLAN_TOTAL = 100;

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

  const [
    profile,
    notifRes,
    balanceRes,
    smartMatchRes,
    propertiesRes,
    servicesRes,
    cleaningRes,
    cleanerProfileRes,
  ] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
    supabase
      .from("balances")
      .select("amount, sms_remaining")
      .eq("user_id", user.id)
      .maybeSingle(),
    // Per-renter "new requests" badge: unread smart_match_request notifications
    // (created by the DB fan-out trigger), NOT a global active-request count.
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "smart_match_request")
      .eq("is_read", false),
    supabase.from("properties").select("is_for_sale").eq("owner_id", user.id),
    supabase.from("services").select("category").eq("owner_id", user.id),
    supabase
      .from("cleaning_tasks")
      .select("id", { count: "exact", head: true })
      .eq("cleaner_id", user.id),
    supabase
      .from("cleaner_profiles")
      .select("is_online")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const displayName = profile?.display_name ?? t("defaultUser");
  const role = profile?.role ?? "guest";
  const avatarUrl = profile?.avatar_url ?? null;
  const notificationCount = notifRes.count ?? 0;
  const balance = Number(balanceRes.data?.amount ?? 0);
  const smsRemaining = Number(balanceRes.data?.sms_remaining ?? SMS_PLAN_TOTAL);
  const smartMatchCount = smartMatchRes.count ?? 0;

  const availableCabinets = deriveAvailableCabinets({
    role,
    isForSaleFlags: (propertiesRes.data ?? []).map(
      (p) => p.is_for_sale === true,
    ),
    serviceCategories: (servicesRes.data ?? []).map((s) => s.category),
    hasCleaningTasks: (cleaningRes.count ?? 0) > 0,
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
      cleanerOnline={cleanerProfileRes.data?.is_online ?? true}
    >
      {children}
    </DashboardShell>
  );
}
