import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SmsCenterClient } from "./SmsCenterClient";
import { SENDER_ROLES, type SenderRole } from "@/lib/sms/audience";

const DEFAULT_RULES = {
  check_in_reminder_enabled: false,
  check_in_reminder_hours_before: 24,
  review_request_enabled: false,
  review_request_hours_after: 24,
  win_back_enabled: false,
  win_back_days_after: 90,
};

export default async function SmsCenterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? "guest") as SenderRole;
  if (!SENDER_ROLES.has(role)) {
    redirect("/dashboard");
  }

  const [balanceRes, rulesRes] = await Promise.all([
    supabase
      .from("balances")
      .select("sms_remaining")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("sms_automation_rules")
      .select(
        "check_in_reminder_enabled, check_in_reminder_hours_before, review_request_enabled, review_request_hours_after, win_back_enabled, win_back_days_after",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <SmsCenterClient
      role={role}
      senderName={profile?.display_name ?? null}
      initialSmsRemaining={Number(balanceRes.data?.sms_remaining ?? 0)}
      initialRules={rulesRes.data ?? DEFAULT_RULES}
    />
  );
}
