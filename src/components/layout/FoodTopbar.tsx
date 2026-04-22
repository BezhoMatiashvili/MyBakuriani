"use client";

import { Link } from "@/i18n/navigation";
import { MessageSquare, Plus, Search, Globe } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";

interface FoodTopbarProps {
  balance: number;
  smsRemaining: number;
  smsTotal: number;
  searchPlaceholder?: string;
}

export function FoodTopbar({
  balance,
  smsRemaining,
  smsTotal,
  searchPlaceholder = "ძიება...",
}: FoodTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-5 py-4 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] sm:px-10">
      <div className="flex w-full items-center gap-4">
        <label className="relative block w-full max-w-[480px] flex-1">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            className="h-[44px] w-full rounded-full border border-[#E2E8F0] bg-white pl-11 pr-5 text-[13px] font-medium text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
          />
        </label>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/dashboard/food/balance"
            className="group flex h-[44px] items-center gap-2.5 rounded-full border border-[#E2E8F0] bg-white pl-4 pr-1.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB]"
          >
            <span>{formatPrice(balance)}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9] text-[#0F172A] transition-colors group-hover:bg-[#EFF6FF] group-hover:text-[#2563EB]">
              <Plus className="h-4 w-4" strokeWidth={2.4} />
            </span>
          </Link>

          <div className="hidden h-[44px] items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold sm:flex">
            <MessageSquare
              className="h-[15px] w-[15px] text-[#2563EB]"
              strokeWidth={2.4}
            />
            <span>
              <span className="text-[#0F172A]">{smsRemaining}</span>
              <span className="text-[#94A3B8]"> / {smsTotal} SMS</span>
            </span>
          </div>

          <button
            type="button"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#0F172A] transition-colors hover:border-[#CBD5E1]"
            aria-label="language"
          >
            <Globe className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );
}
