"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  CalendarDays,
  Users,
  Heart,
  QrCode,
  Wallet,
  Bell,
  Settings,
  LogOut,
  Check,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface RenterSidebarProps {
  userName: string;
  userId: string;
  avatarUrl?: string;
  isVerified?: boolean;
  notificationCount?: number;
  qrAlert?: boolean;
  smartMatchCount?: number;
  currentPath: string;
  onSignOut: () => void;
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
    labelKey: "qrReviews",
    href: "/dashboard/renter/qr-reviews",
    icon: QrCode,
    badge: "dot",
  },
  {
    labelKey: "balanceAndVip",
    href: "/dashboard/renter/balance",
    icon: Wallet,
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

interface SwitcherItem {
  key: string;
  href: string;
  current?: boolean;
}

const SWITCHER_ITEMS: SwitcherItem[] = [
  { key: "rentalsRent", href: "/dashboard/renter", current: true },
  { key: "employment", href: "/dashboard/service" },
  { key: "services", href: "/dashboard/service" },
  { key: "rentalsSale", href: "/dashboard/seller" },
  { key: "food", href: "/dashboard/food" },
  { key: "guest", href: "/dashboard/guest" },
  { key: "cleaner", href: "/dashboard/cleaner" },
];

function BrandLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg
        width="40"
        height="32"
        viewBox="0 0 40 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <path
          d="M20 2L32 22H8L20 2Z"
          fill="#0E2150"
          stroke="#0E2150"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M12 10L20 24H4L12 10Z"
          fill="#1E419A"
          stroke="#1E419A"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M20 2L24 8L20 10L16 8L20 2Z" fill="white" opacity="0.6" />
        <circle cx="30" cy="8" r="4" fill="#F97316" />
      </svg>
      <span className="text-xl font-extrabold leading-none">
        <span className="text-[#F97316]">My</span>
        <span className="text-[#0E2150]">Bakuriani</span>
      </span>
    </div>
  );
}

export function RenterSidebar({
  userName,
  userId,
  avatarUrl,
  isVerified = true,
  notificationCount = 0,
  qrAlert = false,
  smartMatchCount = 0,
  currentPath,
  onSignOut,
}: RenterSidebarProps) {
  const t = useTranslations("DashboardSidebar");
  const tSmart = useTranslations("SmartMatchCard");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  useEffect(() => {
    if (!switcherOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(e.target as Node)
      ) {
        setSwitcherOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSwitcherOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [switcherOpen]);

  return (
    <motion.aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white md:flex">
      {/* Logo */}
      <div className="px-6 py-6">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      {/* User chip with role switcher */}
      <div ref={switcherRef} className="relative mx-4">
        <button
          type="button"
          onClick={() => setSwitcherOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
            switcherOpen
              ? "border-[#2563EB] bg-[#EFF6FF]"
              : "border-[#EEF1F4] bg-white hover:border-[#CBD5E1]",
          )}
        >
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
        </button>

        <AnimatePresence>
          {switcherOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0px_16px_40px_-12px_rgba(15,23,42,0.18)]"
            >
              <ul className="py-2">
                {SWITCHER_ITEMS.map((item) => (
                  <li key={`${item.key}-${item.href}`}>
                    <Link
                      href={item.href}
                      onClick={() => setSwitcherOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors",
                        item.current
                          ? "text-[#2563EB]"
                          : "text-[#0F172A] hover:bg-[#F8FAFC]",
                      )}
                    >
                      <span className="flex-1 truncate">
                        {t(`switcher.${item.key}`)}
                      </span>
                      {item.current && (
                        <Check className="h-4 w-4 text-[#10B981]" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2 border-t border-[#F1F5F9] px-4 py-2.5">
                <Settings className="h-3.5 w-3.5 text-[#94A3B8]" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                  {t("nav.settings")}
                </span>
              </div>

              <div className="px-3 pb-3 pt-1">
                <Link
                  href="/dashboard/guest"
                  onClick={() => setSwitcherOpen(false)}
                  className="block rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-center"
                >
                  <p className="text-[13px] font-bold text-[#2563EB]">
                    {t("switcher.guestMode")}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium text-[#64748B]">
                    {t("switcher.guestModeDesc")}
                  </p>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Separator */}
      <div className="mx-6 mt-5 h-px bg-[#EEF1F4]" />

      {/* Nav */}
      <nav className="mt-4 flex-1 overflow-y-auto px-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
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
                  {item.badge === "dot" && qrAlert && (
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
