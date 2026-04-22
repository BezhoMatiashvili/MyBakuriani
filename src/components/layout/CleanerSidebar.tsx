"use client";

import { Link } from "@/i18n/navigation";
import {
  LayoutGrid,
  CalendarDays,
  Wallet,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface CleanerSidebarProps {
  userName: string;
  avatarUrl?: string;
  status?: "available" | "busy" | "offline";
  currentPath: string;
  onSignOut: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "ჩემი კაბინეტი", href: "/dashboard/cleaner", icon: LayoutGrid },
  {
    label: "გრაფიკი",
    href: "/dashboard/cleaner/schedule",
    icon: CalendarDays,
  },
  { label: "შემოსავალი", href: "/dashboard/cleaner/earnings", icon: Wallet },
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
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M12 10L20 24H4L12 10Z"
          fill="#8FA6E6"
          stroke="#8FA6E6"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M20 2L24 8L20 10L16 8L20 2Z" fill="#0E2150" opacity="0.6" />
        <circle cx="30" cy="8" r="4" fill="#F97316" />
      </svg>
      <span className="text-xl font-extrabold leading-none">
        <span className="text-[#F97316]">My</span>
        <span className="text-white">Bakuriani</span>
      </span>
    </div>
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

const STATUS_META: Record<
  NonNullable<CleanerSidebarProps["status"]>,
  { dot: string; label: string }
> = {
  available: { dot: "bg-[#10B981]", label: "თავისუფალი" },
  busy: { dot: "bg-[#F97316]", label: "დაკავებული" },
  offline: { dot: "bg-[#94A3B8]", label: "ოფლაინ" },
};

export function CleanerSidebar({
  userName,
  avatarUrl,
  status = "available",
  currentPath,
  onSignOut,
}: CleanerSidebarProps) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
  const statusMeta = STATUS_META[status];

  return (
    <motion.aside className="hidden h-screen w-[272px] shrink-0 flex-col bg-[#0B1832] md:flex">
      <div className="px-6 py-6">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      <div className="mx-4">
        <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
          <div className="relative shrink-0">
            <Avatar className="h-11 w-11">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
              <AvatarFallback className="bg-[#1E3A8A] text-[14px] font-extrabold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0B1832]",
                statusMeta.dot,
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-extrabold text-white">
              {userName}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-white/60">
              {statusMeta.label}
            </p>
          </div>
        </div>
      </div>

      <nav className="mt-5 flex-1 overflow-y-auto px-4">
        <p className="px-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
          ნავიგაცია
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
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#60A5FA]"
                    />
                  )}
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-[18px]" />
          გამოსვლა
        </button>
      </div>
    </motion.aside>
  );
}
