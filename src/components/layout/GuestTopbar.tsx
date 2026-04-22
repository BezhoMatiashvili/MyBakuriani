"use client";

import { Link } from "@/i18n/navigation";
import { Search, Sparkles } from "lucide-react";

interface GuestTopbarProps {
  searchPlaceholder?: string;
}

export function GuestTopbar({
  searchPlaceholder = "ძიება ობიექტების...",
}: GuestTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-5 py-4 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] sm:px-10">
      <div className="flex w-full items-center gap-4">
        <label className="relative block w-full max-w-[520px] flex-1">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            className="h-[44px] w-full rounded-full border border-[#E2E8F0] bg-white pl-11 pr-5 text-[13px] font-medium text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
          />
        </label>

        <div className="flex-1" />

        <Link
          href="/dashboard/guest/bookings"
          className="flex h-[44px] shrink-0 items-center gap-2 rounded-full bg-[#0F8F60] px-5 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52]"
        >
          <Sparkles className="h-4 w-4" />
          ავტორიზება
        </Link>
      </div>
    </header>
  );
}
