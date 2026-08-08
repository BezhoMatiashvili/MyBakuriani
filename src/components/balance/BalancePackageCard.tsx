"use client";

import { useTranslations } from "next-intl";
import { Info, type LucideIcon } from "lucide-react";

interface BalancePackageCardProps {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  price: number;
  unit: string;
  ctaColor: string;
  canAfford: boolean;
  available?: boolean;
  disabledReason?: string;
  purchasing: boolean;
  onHowItWorks: () => void;
  onActivate: () => void;
}

/**
 * Shared "Balance & VIP" package card used by every dashboard balance page so
 * the SMS/VIP grid stays visually identical across roles.
 */
export default function BalancePackageCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  price,
  unit,
  ctaColor,
  canAfford,
  available = true,
  disabledReason,
  purchasing,
  onHowItWorks,
  onActivate,
}: BalancePackageCardProps) {
  const t = useTranslations("DashboardShared");

  return (
    <div className="flex flex-col rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
      >
        <Icon className={`h-5 w-5 ${iconColor}`} strokeWidth={2.2} />
      </div>

      <h3 className="mt-4 text-[15px] font-black text-[#0F172A] sm:text-[18px]">
        {title}
      </h3>
      <p className="mt-1.5 text-[12px] leading-[17px] text-[#64748B] sm:text-[13px] sm:leading-[19px]">
        {description}
      </p>
      {!available && disabledReason && (
        <p className="mt-2 text-[11px] font-bold leading-4 text-[#B45309]">
          {disabledReason}
        </p>
      )}
      <button
        type="button"
        onClick={onHowItWorks}
        className="mt-3 inline-flex items-center gap-1 self-start text-[11px] font-bold text-[#2563EB] hover:underline sm:text-[12px]"
      >
        <Info className="h-3.5 w-3.5" />
        {t("howItWorks")}
      </button>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-[22px] font-black leading-[26px] text-[#0F172A] sm:text-[28px] sm:leading-[32px]">
            {price.toFixed(2)}
          </p>
          <p className="mt-1 text-[11px] font-bold text-[#64748B]">{unit}</p>
        </div>
        <button
          type="button"
          disabled={!available || !canAfford || purchasing}
          title={!available ? disabledReason : undefined}
          onClick={onActivate}
          className={`inline-flex shrink-0 items-center rounded-xl px-3 py-2.5 text-[12px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-0 sm:px-5 sm:py-3 sm:text-[13px] ${ctaColor}`}
        >
          {purchasing ? "..." : t("activate")}
        </button>
      </div>
    </div>
  );
}
