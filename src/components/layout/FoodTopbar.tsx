"use client";

import { Link } from "@/i18n/navigation";
import { Bell, Home, MessageSquare, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils/format";
import { LanguageSelector } from "@/components/LanguageSelector";

interface FoodTopbarProps {
  balance: number;
  smsRemaining: number;
  /** Unread notifications in this cabinet, shown on the mobile bell. */
  notificationCount?: number;
  searchPlaceholder?: string;
}

export function FoodTopbar({
  balance,
  smsRemaining,
  notificationCount = 0,
  searchPlaceholder,
}: FoodTopbarProps) {
  const t = useTranslations("DashboardLayout");
  const tSidebar = useTranslations("DashboardSidebar");
  const tNavbar = useTranslations("Navbar");
  const placeholder = searchPlaceholder ?? t("topbar.searchDefault");

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-5 py-4 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] sm:px-10">
      <div className="flex w-full items-center gap-2 sm:gap-4">
        <label className="relative hidden w-full min-w-0 max-w-[480px] flex-1 lg:block">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder={placeholder}
            className="h-[44px] w-full rounded-full border border-[#E2E8F0] bg-white pl-11 pr-5 text-[13px] font-medium text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
          />
        </label>

        <Link
          href="/"
          aria-label={tSidebar("backToHome")}
          className="flex h-[44px] shrink-0 items-center gap-2 rounded-full bg-[#2563EB] px-3 text-[13px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.45)] transition-colors hover:bg-[#1D4ED8] md:px-4 lg:hidden"
        >
          <Home className="size-4" />
          <span className="hidden md:inline">{tSidebar("backToHome")}</span>
        </Link>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard/food/balance"
            className="group flex h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E2E8F0] bg-white pl-3 pr-1.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] sm:gap-2.5 sm:pl-4"
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
              <span className="text-[#94A3B8]">{t("topbar.smsSuffix")}</span>
            </span>
          </div>

          <LanguageSelector className="px-2.5 sm:px-3.5" />
          {/* Mobile only: the desktop sidebar lists notifications itself. */}
          <Link
            href="/dashboard/food/notifications"
            data-testid="mobile-header-bell"
            aria-label={tNavbar("notificationsAria", {
              count: notificationCount,
            })}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB] lg:hidden"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
            {notificationCount > 0 && (
              <span
                data-testid="mobile-header-bell-badge"
                aria-hidden
                className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_white]"
              >
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
