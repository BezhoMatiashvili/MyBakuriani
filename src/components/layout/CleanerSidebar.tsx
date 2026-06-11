"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  Home,
  CalendarDays,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CabinetSwitcher } from "@/components/layout/CabinetSwitcher";

interface CleanerSidebarProps {
  userName: string;
  userId?: string;
  avatarUrl?: string;
  currentPath: string;
  onSignOut: () => void;
  availableCabinets: string[];
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: "homePage", href: "/dashboard/cleaner", icon: Home },
  {
    labelKey: "graphic",
    href: "/dashboard/cleaner/schedule",
    icon: CalendarDays,
  },
  {
    labelKey: "settings",
    href: "/dashboard/cleaner/parameters",
    icon: Settings,
  },
];

function BrandLogo() {
  return (
    <Image
      src="/logo.png"
      alt="MyBakuriani"
      width={300}
      height={199}
      className="h-10 w-auto"
    />
  );
}

function isItemActive(href: string, current: string) {
  const isHome = href === "/dashboard/cleaner";
  if (isHome) {
    return (
      current === "/dashboard/cleaner" ||
      /^\/(ka|en|ru)\/dashboard\/cleaner$/.test(current)
    );
  }
  return (
    current === href || current.startsWith(`${href}/`) || current.endsWith(href)
  );
}

export function CleanerSidebar({
  userName,
  userId,
  avatarUrl,
  currentPath,
  onSignOut,
  availableCabinets,
}: CleanerSidebarProps) {
  const t = useTranslations("DashboardSidebar");
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
  const shortId = userId ? userId.replace(/-/g, "").slice(0, 8) : null;

  return (
    <motion.aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white md:flex">
      {/* Logo */}
      <div className="px-6 py-6">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      {/* User chip with role switcher */}
      <CabinetSwitcher activeKey="cleaner" availableKeys={availableCabinets}>
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-[#2563EB] text-[14px] font-extrabold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#10B981]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-[#0F172A]">
            {userName}
          </p>
          {shortId && (
            <p className="mt-0.5 text-[11px] font-bold tracking-wide text-[#2563EB]">
              {t("userIdPrefix")} {shortId}
            </p>
          )}
        </div>
      </CabinetSwitcher>

      {/* Separator */}
      <div className="mx-6 mt-5 h-px bg-[#EEF1F4]" />

      {/* Nav */}
      <nav className="mt-4 flex-1 overflow-y-auto px-4">
        <p className="px-4 pb-2 text-[10px] font-black uppercase tracking-[0.1em] text-[#94A3B8]">
          {t("sections.main")}
        </p>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(item.href, currentPath);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-bold transition-colors",
                    active
                      ? "bg-[#EFF6FF] text-[#2563EB]"
                      : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#2563EB]"
                    />
                  )}
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1 truncate">
                    {t(`nav.${item.labelKey}`)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold text-[#EF4444] transition-colors hover:bg-[#FEF2F2]"
        >
          <LogOut className="size-[18px]" />
          {t("logout")}
        </button>
      </div>
    </motion.aside>
  );
}
