import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/DashboardShell";

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

  const [profileRes, notifRes, balanceRes, smartMatchRes] = await Promise.all([
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
  ]);

  const displayName = profileRes.data?.display_name ?? "მომხმარებელი";
  const role = profileRes.data?.role ?? "guest";
  const avatarUrl = profileRes.data?.avatar_url ?? null;
  const notificationCount = notifRes.count ?? 0;
  const balance = Number(balanceRes.data?.amount ?? 0);
  const smsRemaining = Number(balanceRes.data?.sms_remaining ?? SMS_PLAN_TOTAL);
  const smartMatchCount = smartMatchRes.count ?? 0;

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
    >
      {children}
    </DashboardShell>
  );
}
