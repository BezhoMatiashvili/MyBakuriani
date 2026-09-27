"use client";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * SMS credits left (`balances.sms_remaining`), shown beside the ₾ amount in
 * the wallet card of every balance page. SMS packages bought there credit this
 * column, and each page refetches `balances` after a purchase.
 */
export default function SmsBalanceStat({
  remaining,
  loading,
}: {
  remaining: number;
  loading: boolean;
}) {
  const tSms = useTranslations("SMSCenter.balance");
  const tTopbar = useTranslations("DashboardLayout.topbar");

  return (
    <div
      data-testid="sms-balance"
      className="border-t border-white/10 pt-4 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">
        <MessageSquare className="size-3.5" strokeWidth={2.5} aria-hidden />
        {tSms("label")}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-10 w-24 bg-white/20" />
      ) : (
        <p className="mt-2 text-[36px] font-black leading-[44px]">
          {remaining}
          <span className="text-[24px] text-white/60">
            {tTopbar("smsSuffix")}
          </span>
        </p>
      )}
    </div>
  );
}
