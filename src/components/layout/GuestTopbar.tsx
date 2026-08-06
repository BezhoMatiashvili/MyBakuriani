"use client";

import { Search, CheckCircle2, Home } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSelector } from "@/components/LanguageSelector";
import { DashboardNotificationBell } from "@/components/layout/DashboardNotificationBell";

interface GuestTopbarProps {
  searchPlaceholder?: string;
  notificationCount?: number;
}

export function GuestTopbar({
  searchPlaceholder,
  notificationCount = 0,
}: GuestTopbarProps) {
  const tLayout = useTranslations("DashboardLayout");
  const tSidebar = useTranslations("DashboardSidebar");
  const placeholder = searchPlaceholder ?? tLayout("topbar.searchBakuriani");

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-5 py-4 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] sm:px-10">
      <div className="flex w-full items-center gap-4">
        <label className="relative hidden w-full min-w-0 max-w-[520px] flex-1 lg:block">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder={placeholder}
            className="h-[44px] w-full rounded-full border border-[#E2E8F0] bg-white pl-11 pr-5 text-[13px] font-medium text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-[#94A3B8] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
          />
        </label>

        <Link
          href="/"
          className="flex h-[44px] shrink-0 items-center gap-2 rounded-full bg-[#2563EB] px-4 text-[13px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.45)] transition-colors hover:bg-[#1D4ED8] lg:hidden"
        >
          <Home className="size-4" />
          {tSidebar("backToHome")}
        </Link>

        <div className="flex-1" />

        <span className="hidden sm:inline-flex h-[44px] shrink-0 items-center gap-2 rounded-full border border-[#A7F3D0] bg-[#F0FDF4] px-4 text-[13px] font-bold text-[#16A34A]">
          <CheckCircle2 className="h-4 w-4" />
          {tLayout("topbar.activeVisitor")}
        </span>

        <LanguageSelector />

        <DashboardNotificationBell
          initialUnreadCount={notificationCount}
          scope="guest"
          triggerClassName="relative flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:border-[#0F8F60] hover:text-[#0F8F60]"
        />
      </div>
    </header>
  );
}
