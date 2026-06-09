"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  PieChart,
  IdCard,
  Building2,
  TrendingUp,
  Wallet,
  Bell,
  Settings,
  LogOut,
  Home,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CabinetSwitcher } from "@/components/layout/CabinetSwitcher";

interface SellerSidebarProps {
  userName: string;
  profileType?: "ფიზიკური პირი" | "იურიდიული პირი";
  avatarUrl?: string;
  isVerified?: boolean;
  leadsCount?: number;
  notificationCount?: number;
  currentPath: string;
  onSignOut: () => void;
  availableCabinets: string[];
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badgeKind?: "leads" | "notifications";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "მართვის პანელი",
    items: [
      { label: "მთავარი პანელი", href: "/dashboard/seller", icon: PieChart },
      {
        label: "კლიენტები / ბაზა",
        href: "/dashboard/seller/leads",
        icon: IdCard,
        badgeKind: "leads",
      },
      {
        label: "ობიექტები და პროექტები",
        href: "/dashboard/seller/listings",
        icon: Building2,
      },
    ],
  },
  {
    title: "ეფექტურობა",
    items: [
      {
        label: "ანალიტიკა და უკუგება",
        href: "/dashboard/seller/analytics",
        icon: TrendingUp,
      },
      {
        label: "ბალანსი და VIP",
        href: "/dashboard/seller/balance",
        icon: Wallet,
      },
    ],
  },
  {
    title: "სისტემა",
    items: [
      {
        label: "შეტყობინებები",
        href: "/dashboard/seller/notifications",
        icon: Bell,
        badgeKind: "notifications",
      },
      {
        label: "პარამეტრები",
        href: "/dashboard/seller/settings",
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

function isItemActive(itemHref: string, currentPath: string) {
  const isHome = itemHref === "/dashboard/seller";
  if (isHome) {
    return (
      currentPath === "/dashboard/seller" ||
      /^\/(ka|en|ru)\/dashboard\/seller$/.test(currentPath)
    );
  }
  return (
    currentPath === itemHref ||
    currentPath.startsWith(`${itemHref}/`) ||
    currentPath.endsWith(itemHref)
  );
}

export function SellerSidebar({
  userName,
  profileType = "ფიზიკური პირი",
  avatarUrl,
  isVerified = true,
  leadsCount = 0,
  notificationCount = 0,
  currentPath,
  onSignOut,
  availableCabinets,
}: SellerSidebarProps) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <motion.aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white md:flex">
      <div className="px-6 py-6">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      <CabinetSwitcher activeKey="seller" availableKeys={availableCabinets}>
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11 bg-[#DCFCE7]">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-[#DCFCE7] text-[14px] font-extrabold text-[#059669]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-[#0F172A]">
            {userName}
          </p>
          {isVerified && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#10B981]">
              <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#10B981] text-[8px] text-white">
                ✓
              </span>
              ვერიფიცირებული
            </p>
          )}
          <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
            {profileType}
          </p>
        </div>
      </CabinetSwitcher>

      <nav className="mt-5 flex-1 overflow-y-auto px-4">
        <ul className="space-y-5">
          {SECTIONS.map((section) => (
            <li key={section.title}>
              <p className="px-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isItemActive(item.href, currentPath);
                  const Icon = item.icon;
                  const badgeValue =
                    item.badgeKind === "leads"
                      ? leadsCount
                      : item.badgeKind === "notifications"
                        ? notificationCount
                        : 0;
                  const showBadge = Boolean(item.badgeKind) && badgeValue > 0;
                  const badgeStyle =
                    item.badgeKind === "leads"
                      ? "bg-[#EF4444] text-white"
                      : "bg-[#E2E8F0] text-[#64748B]";
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-bold transition-colors",
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
                        <span className="flex-1 truncate">{item.label}</span>
                        {showBadge && (
                          <span
                            className={cn(
                              "flex h-[20px] min-w-[24px] items-center justify-center rounded-md px-1.5 text-[11px] font-bold",
                              badgeStyle,
                            )}
                          >
                            {badgeValue > 99 ? "99+" : badgeValue}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-[14px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.45)] transition-colors hover:bg-[#1D4ED8]"
        >
          <Home className="size-[18px]" />
          მთავარზე დაბრუნება
        </Link>
      </div>

      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
        >
          <LogOut className="size-[18px]" />
          გამოსვლა
        </button>
      </div>
    </motion.aside>
  );
}
