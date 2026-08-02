import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SmsCenterClient } from "./SmsCenterClient";
import { canUseSmsCenter } from "@/lib/sms/sender-access";
import { isSmsFeatureEnabled } from "@/lib/sms/feature-flags";

const DEFAULT_RULES = {
  check_in_reminder_enabled: false,
  review_request_enabled: false,
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

  if (
    !isSmsFeatureEnabled("SMS_RENTAL_MODE", user.id) ||
    !(await canUseSmsCenter(supabase, user.id))
  ) {
    redirect("/dashboard/renter");
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
        "check_in_reminder_enabled, review_request_enabled, win_back_enabled, win_back_discount_value, win_back_discount_period",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <SmsCenterClient
      initialSmsRemaining={Number(balanceRes.data?.sms_remaining ?? 0)}
      initialRules={rulesRes.data ?? DEFAULT_RULES}
    />
  );
}
