"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  CalendarDays,
  Users,
  Heart,
  Star,
  Wallet,
  Bell,
  Settings,
  LogOut,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CabinetSwitcher } from "@/components/layout/CabinetSwitcher";

interface RenterSidebarProps {
  userName: string;
  userId: string;
  avatarUrl?: string;
  isVerified?: boolean;
  notificationCount?: number;
  pendingReviewsAlert?: boolean;
  smartMatchCount?: number;
  currentPath: string;
  onSignOut: () => void;
  availableCabinets: string[];
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  badge?: "count" | "dot";
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: "myRentals", href: "/dashboard/renter", icon: Home },
  {
    labelKey: "calendar",
    href: "/dashboard/renter/calendar",
    icon: CalendarDays,
  },
  { labelKey: "guests", href: "/dashboard/renter/guests", icon: Users },
  {
    labelKey: "cleaners",
    href: "/dashboard/renter/cleaners",
    icon: Heart,
  },
  {
    labelKey: "reviews",
    href: "/dashboard/renter/reviews",
    icon: Star,
    badge: "dot",
  },
  {
    labelKey: "balanceAndVip",
    href: "/dashboard/renter/balance",
    icon: Wallet,
  },
  {
    labelKey: "smsCenter",
    href: "/dashboard/sms",
    icon: MessageSquare,
  },
  {
    labelKey: "notificationsItem",
    href: "/dashboard/renter/notifications",
    icon: Bell,
    badge: "count",
  },
  {
    labelKey: "settings",
    href: "/dashboard/renter/profile",
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

export function RenterSidebar({
  userName,
  userId,
  avatarUrl,
  isVerified = true,
  notificationCount = 0,
  pendingReviewsAlert = false,
  smartMatchCount = 0,
  currentPath,
  onSignOut,
  availableCabinets,
}: RenterSidebarProps) {
  const t = useTranslations("DashboardSidebar");
  const tSmart = useTranslations("SmartMatchCard");

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  // SMS Center belongs to the renter cabinet — hide its link from anyone viewing
  // this sidebar who isn't a renter-cabinet member (mirrors canUseSmsCenter on the
  // /dashboard/sms page, so the link never leads to a denied redirect).
  const navItems = NAV_ITEMS.filter(
    (item) =>
      item.href !== "/dashboard/sms" || availableCabinets.includes("renter"),
  );

  return (
    <motion.aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white md:flex">
      {/* Logo */}
      <div className="px-6 py-6">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      {/* User chip with role switcher */}
      <CabinetSwitcher activeKey="renter" availableKeys={availableCabinets}>
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-[#2563EB] text-[14px] font-extrabold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          {isVerified && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-[#10B981]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-[#0F172A]">
            {userName}
          </p>
          <p className="mt-0.5 text-[11px] font-bold tracking-wide text-[#2563EB]">
            {t("userIdPrefix")} {userId}
          </p>
        </div>
      </CabinetSwitcher>

      {/* Separator */}
      <div className="mx-6 mt-5 h-px bg-[#EEF1F4]" />

      {/* Nav */}
      <nav className="mt-4 flex-1 overflow-y-auto px-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isHome = item.href === "/dashboard/renter";
            const isActive = isHome
              ? currentPath === "/dashboard/renter" ||
                /^\/(ka|en|ru)\/dashboard\/renter$/.test(currentPath)
              : currentPath === item.href ||
                currentPath.startsWith(`${item.href}/`) ||
                currentPath.endsWith(item.href);

            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-bold transition-colors",
                    isActive
                      ? "bg-[#EFF6FF] text-[#2563EB]"
                      : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]",
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#2563EB]"
                    />
                  )}
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1 truncate">
                    {t(`nav.${item.labelKey}`)}
                  </span>
                  {item.badge === "count" && notificationCount > 0 && (
                    <span className="flex h-[22px] min-w-[26px] items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-[#64748B] shadow-[0_0_0_1px_rgba(226,232,240,0.9)]">
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </span>
                  )}
                  {item.badge === "dot" && pendingReviewsAlert && (
                    <span className="h-2 w-2 rounded-full bg-[#EF4444]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Smart Match promo */}
        <div className="mt-6">
          <Link
            href="/dashboard/renter/smart-match"
            className="block overflow-hidden rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1E3A8A] p-5 text-left text-white shadow-[0px_10px_20px_-6px_rgba(37,99,235,0.35)]"
          >
            <span className="inline-block rounded-md bg-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.225px] text-white">
              SMART MATCH
            </span>
            <h3 className="mt-3 text-[17px] font-black leading-[22px]">
              {smartMatchCount > 0
                ? `${smartMatchCount} ${tSmart("newRequest")}`
                : tSmart("guestRequests")}
            </h3>
            <p className="mt-1.5 text-[11px] font-medium leading-[16px] text-white/80">
              {tSmart("ownersNote")}
            </p>
            <span className="mt-4 block w-full rounded-xl bg-white px-4 py-2.5 text-center text-[12px] font-black text-[#0F172A]">
              {tSmart("sendOffer")}
            </span>
          </Link>
        </div>
      </nav>

      {/* Back to public site */}
      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-[14px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.45)] transition-colors hover:bg-[#1D4ED8]"
        >
          <Home className="size-[18px]" />
          {t("backToHome")}
        </Link>
      </div>

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
