"use client";

import { Link } from "@/i18n/navigation";
import {
  LayoutGrid,
  Heart,
  MapPin,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface GuestSidebarProps {
  userName: string;
  avatarUrl?: string;
  isVerified?: boolean;
  currentPath: string;
  onSignOut: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "მთავარი",
    items: [
      { label: "მთავარი გვერდი", href: "/dashboard/guest", icon: LayoutGrid },
      { label: "რჩეულები", href: "/dashboard/guest/favorites", icon: Heart },
    ],
  },
  {
    title: "აქტივობა",
    items: [
      { label: "ისტორია", href: "/dashboard/guest/reviews", icon: MapPin },
    ],
  },
  {
    title: "პროფილი",
    items: [
      {
        label: "პარამეტრები",
        href: "/dashboard/guest/profile",
        icon: Settings,
      },
    ],
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
}: GuestSidebarProps) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white md:flex">
      <div className="px-6 py-6">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      <div className="mx-4 flex items-center gap-3 rounded-2xl px-2 py-2">
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
            დამსვენებელი
          </span>
        </div>
      </div>

      <div className="mx-6 mt-5 h-px bg-[#EEF1F4]" />

      <nav className="mt-4 flex-1 overflow-y-auto px-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-5">
            <p className="mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">
              {group.title}
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
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

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
