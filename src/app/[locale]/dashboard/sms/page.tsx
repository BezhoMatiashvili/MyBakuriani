import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SmsCenterClient } from "./SmsCenterClient";
import { canUseSmsCenter } from "@/lib/sms/sender-access";
import {
  SMS_MARKETING_GATES_KEY,
  smsMarketingGateOpen,
} from "@/lib/sms/marketing-gates";

const DEFAULT_RULES = {
  check_in_reminder_enabled: false,
  win_back_enabled: false,
  win_back_discount_value: null,
  win_back_discount_period: null,
};

export default async function SmsCenterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (!(await canUseSmsCenter(supabase, user.id))) {
    redirect("/dashboard/seller");
  }

  const [balanceRes, rulesRes, gatesRes] = await Promise.all([
    supabase
      .from("balances")
      .select("sms_remaining")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("sms_automation_rules")
      .select(
        "check_in_reminder_enabled, win_back_enabled, win_back_discount_value, win_back_discount_period",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    // Win-back texts are paused until the lawyer approves them (C18).
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", SMS_MARKETING_GATES_KEY)
      .maybeSingle(),
  ]);

  return (
    <SmsCenterClient
      initialSmsRemaining={Number(balanceRes.data?.sms_remaining ?? 0)}
      initialRules={rulesRes.data ?? DEFAULT_RULES}
      winBackPaused={!smsMarketingGateOpen(gatesRes.data?.value, "win_back")}
    />
  );
}
