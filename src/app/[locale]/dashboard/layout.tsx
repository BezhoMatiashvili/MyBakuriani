import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { deriveAvailableCabinets } from "@/lib/cabinets";

const SMS_PLAN_TOTAL = 100;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [
    profileRes,
    notifRes,
    balanceRes,
    smartMatchRes,
    propertiesRes,
    servicesRes,
    cleaningRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, role, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
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
    supabase
      .from("smart_match_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("properties").select("is_for_sale").eq("owner_id", user.id),
    supabase.from("services").select("category").eq("owner_id", user.id),
    supabase
      .from("cleaning_tasks")
      .select("id", { count: "exact", head: true })
      .eq("cleaner_id", user.id),
  ]);

  const displayName = profileRes.data?.display_name ?? "მომხმარებელი";
  const role = profileRes.data?.role ?? "guest";
  const avatarUrl = profileRes.data?.avatar_url ?? null;
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
    >
      {children}
    </DashboardShell>
  );
}
