"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  LayoutGrid,
  ListChecks,
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

interface ServiceSidebarProps {
  userName: string;
  userSubtitle?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  currentPath: string;
  notificationCount?: number;
  onSignOut: () => void;
  availableCabinets: string[];
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
  availableCabinets,
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

      <CabinetSwitcher activeKey="service" availableKeys={availableCabinets}>
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
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold text-[#EF4444] transition-colors hover:bg-[#FEF2F2]"
        >
          <LogOut className="size-[18px]" />
          გამოსვლა
        </button>
      </div>
    </motion.aside>
  );
}
