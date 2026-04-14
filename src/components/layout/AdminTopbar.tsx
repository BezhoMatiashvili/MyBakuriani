"use client";

import { Bell, Search } from "lucide-react";

interface AdminTopbarProps {
  userName: string;
}

export function AdminTopbar({ userName }: AdminTopbarProps) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-20 border-b border-[#E2E8F0] bg-white px-10 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
      <div className="flex h-full w-full items-center justify-between gap-4">
        <div className="w-full max-w-[505px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="ძიება (ID, ნომერი)..."
              className="h-[42px] w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-11 pr-4 text-[13px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] shadow-[inset_0_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            />
          </label>
        </div>

        <div className="flex items-center gap-5">
          <div className="h-8 w-px bg-[#E2E8F0]" />
          <button
            type="button"
            className="relative text-[#94A3B8] transition-colors hover:text-[#0F172A]"
            aria-label="შეტყობინებები"
          >
            <Bell className="h-[20px] w-[18px]" />
            <span className="absolute -right-1 -top-1 h-[10px] w-[10px] rounded-full border-2 border-white bg-[#EF4444]" />
          </button>
          <div className="hidden items-center gap-3 sm:flex">
            <p className="text-[13px] font-bold leading-4 text-[#1E293B]">
              სუპერ ადმინი
            </p>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563EB] text-sm font-bold text-white">
              {initials || "AD"}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
