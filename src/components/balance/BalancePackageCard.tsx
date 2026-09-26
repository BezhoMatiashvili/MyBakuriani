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
  available = true,
  disabledReason,
  purchasing,
  onHowItWorks,
  onActivate,
}: BalancePackageCardProps) {
  const t = useTranslations("DashboardShared");

  return (
    <div
      data-balance-package-card
      className="flex h-full flex-col rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.04)] sm:p-6"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
      >
        <Icon className={`h-5 w-5 ${iconColor}`} strokeWidth={2.2} />
      </div>

      <h3 className="mt-4 text-[15px] font-black text-[#0F172A] sm:text-[18px]">
        {title}
      </h3>
      {/* Phones skip the description: it repeats the "how it works" dialog
          and made the two-column cards tall and uneven. */}
      <p className="mt-1.5 hidden text-[12px] leading-[17px] text-[#64748B] sm:text-[13px] sm:leading-[19px] md:block">
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

      {/* mt-auto pins price + button to the card bottom so buttons line up
          across a grid row; below md the button stacks under the price. */}
      <div className="mt-auto flex flex-col gap-3 pt-4 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-x-3 md:gap-y-2 md:pt-6">
        <div className="min-w-0">
          <p className="text-[22px] font-black leading-[26px] text-[#0F172A] sm:text-[28px] sm:leading-[32px]">
            {price.toFixed(2)}
          </p>
          <p className="mt-1 text-[11px] font-bold text-[#64748B]">{unit}</p>
        </div>
        <button
          type="button"
          // A short wallet is not a dead end: the confirm dialog offers paying
          // the missing amount by card (C32).
          disabled={!available || purchasing}
          title={!available ? disabledReason : undefined}
          onClick={onActivate}
          className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl px-3 py-2.5 text-[12px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-0 sm:px-5 sm:py-3 sm:text-[13px] md:min-h-0 md:w-auto ${ctaColor}`}
        >
          {purchasing ? "..." : t("activate")}
        </button>
      </div>
    </div>
  );
}
