"use client";

import { Link } from "@/i18n/navigation";
import {
  LayoutGrid,
  ListChecks,
  Wallet,
  Bell,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CabinetSwitcher } from "@/components/layout/CabinetSwitcher";

interface ServiceSidebarProps {
  userName: string;
  userSubtitle?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  currentPath: string;
  notificationCount?: number;
  onSignOut: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badgeKind?: "notifications";
}

const NAV_ITEMS: NavItem[] = [
  { label: "ჩემი კაბინეტი", href: "/dashboard/service", icon: LayoutGrid },
  {
    label: "ჩემი განცხადებები",
    href: "/dashboard/service/orders",
    icon: ListChecks,
  },
  {
    label: "ბალანსი და VIP",
    href: "/dashboard/service/balance",
    icon: Wallet,
  },
  {
    label: "შეტყობინებები",
    href: "/dashboard/service/notifications",
    icon: Bell,
    badgeKind: "notifications",
  },
  {
    label: "პარამეტრები",
    href: "/dashboard/service/parameters",
    icon: Settings,
  },
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

function isItemActive(href: string, current: string) {
  const isHome = href === "/dashboard/service";
  if (isHome) {
    return (
      current === "/dashboard/service" ||
      /^\/(ka|en|ru)\/dashboard\/service$/.test(current)
    );
  }
  return (
    current === href || current.startsWith(`${href}/`) || current.endsWith(href)
  );
}

export function ServiceSidebar({
  userName,
  userSubtitle = "სერვისის პროვაიდერი",
  avatarUrl,
  isVerified = true,
  currentPath,
  notificationCount = 0,
  onSignOut,
}: ServiceSidebarProps) {
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

      <CabinetSwitcher activeKey="service">
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-[#DBEAFE] text-[14px] font-extrabold text-[#2563EB]">
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
          <p className="mt-0.5 text-[11px] font-medium text-[#64748B]">
            {userSubtitle}
          </p>
        </div>
      </CabinetSwitcher>

      <div className="mx-6 mt-5 h-px bg-[#EEF1F4]" />

      <nav className="mt-4 flex-1 overflow-y-auto px-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(item.href, currentPath);
            const Icon = item.icon;
            const showBadge =
              item.badgeKind === "notifications" && notificationCount > 0;
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
                  <span className="flex-1 truncate">{item.label}</span>
                  {showBadge && (
                    <span className="flex h-[20px] min-w-[24px] items-center justify-center rounded-md bg-[#EF4444] px-1.5 text-[10px] font-bold text-white">
                      {notificationCount > 9 ? "9+" : notificationCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold text-[#EF4444] transition-colors hover:bg-[#FEF2F2]"
        >
          <LogOut className="size-[18px]" />
          გამოსვლა
        </button>
      </div>
    </motion.aside>
  );
}
