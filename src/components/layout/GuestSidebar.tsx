"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutGrid,
  Heart,
  MapPin,
  Settings,
  LogOut,
  Home,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CabinetSwitcher } from "@/components/layout/CabinetSwitcher";

interface GuestSidebarProps {
  userName: string;
  avatarUrl?: string;
  isVerified?: boolean;
  currentPath: string;
  onSignOut: () => void;
  availableCabinets: string[];
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: "main",
    items: [
      { labelKey: "homePage", href: "/dashboard/guest", icon: LayoutGrid },
      {
        labelKey: "favorites",
        href: "/dashboard/guest/favorites",
        icon: Heart,
      },
    ],
  },
  {
    titleKey: "activity",
    items: [
      { labelKey: "history", href: "/dashboard/guest/reviews", icon: MapPin },
    ],
  },
  {
    titleKey: "profile",
    items: [
      {
        labelKey: "settings",
        href: "/dashboard/guest/profile",
        icon: Settings,
      },
    ],
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
  const isHome = href === "/dashboard/guest";
  if (isHome) {
    return (
      current === "/dashboard/guest" ||
      /^\/(ka|en|ru)\/dashboard\/guest$/.test(current)
    );
  }
  return (
    current === href || current.startsWith(`${href}/`) || current.endsWith(href)
  );
}

export function GuestSidebar({
  userName,
  avatarUrl,
  isVerified = true,
  currentPath,
  onSignOut,
  availableCabinets,
}: GuestSidebarProps) {
  const t = useTranslations("DashboardSidebar");
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white lg:flex">
      <div className="px-6 py-6">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      <CabinetSwitcher activeKey="guest" availableKeys={availableCabinets}>
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-[#DCFCE7] text-[14px] font-extrabold text-[#0F8F60]">
              {initials}
            </AvatarFallback>
          </Avatar>
          {isVerified && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-[#10B981]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-[#0F172A]">
            {userName}
          </p>
          <span className="mt-1 inline-flex items-center rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#16A34A]">
            {t("roles.visitor")}
          </span>
        </div>
      </CabinetSwitcher>

      <div className="mx-6 mt-5 h-px bg-[#EEF1F4]" />

      <nav className="mt-4 flex-1 overflow-y-auto px-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.titleKey} className="mb-5">
            <p className="mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">
              {group.titleKey === "profile"
                ? t("nav.profile")
                : t(`sections.${group.titleKey}`)}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = isItemActive(item.href, currentPath);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-bold transition-colors",
                        active
                          ? "bg-[#ECFDF5] text-[#0F8F60]"
                          : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#0F8F60]"
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
          </div>
        ))}
      </nav>

      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-[14px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.45)] transition-colors hover:bg-[#1D4ED8]"
        >
          <Home className="size-[18px]" />
          {t("backToHome")}
        </Link>
      </div>

      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
        >
          <LogOut className="size-[18px]" />
          {t("logout")}
        </button>
      </div>
    </motion.aside>
  );
}
