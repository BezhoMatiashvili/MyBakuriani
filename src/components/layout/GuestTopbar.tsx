"use client";

import { Search, CheckCircle2, Bell } from "lucide-react";

interface GuestTopbarProps {
  searchPlaceholder?: string;
  notificationCount?: number;
}

export function GuestTopbar({
  searchPlaceholder = "ძიება ბაკურიანში...",
  notificationCount = 0,
}: GuestTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-5 py-4 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] sm:px-10">
      <div className="flex w-full items-center gap-4">
        <label className="relative block w-full max-w-[520px] flex-1">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            className="h-[44px] w-full rounded-full border border-[#E2E8F0] bg-white pl-11 pr-5 text-[13px] font-medium text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-[#94A3B8] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
          />
        </label>

        <div className="flex-1" />

        <span className="inline-flex h-[44px] shrink-0 items-center gap-2 rounded-full border border-[#A7F3D0] bg-[#F0FDF4] px-4 text-[13px] font-bold text-[#16A34A]">
          <CheckCircle2 className="h-4 w-4" />
          აქტიური ვიზიტორი
        </span>

        <button
          type="button"
          aria-label="შეტყობინებები"
          className="relative flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:border-[#0F8F60] hover:text-[#0F8F60]"
        >
          <Bell className="h-[18px] w-[18px]" />
          {notificationCount > 0 && (
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#EF4444]" />
          )}
        </button>
      </div>
    </header>
  );
}
