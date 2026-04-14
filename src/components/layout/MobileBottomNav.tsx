"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  Building,
  CalendarDays,
  Wallet,
  User,
  ClipboardList,
  Star,
  Sparkles,
  ShoppingBag,
  Briefcase,
  Clock,
  ShieldCheck,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  currentPath: string;
  userRole?: string;
}

interface TabItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

function getTabs(role: string): TabItem[] {
  switch (role) {
    case "admin":
      return [
        { labelKey: "home", href: "/dashboard/admin", icon: Home },
        {
          labelKey: "verifications",
          href: "/dashboard/admin/verifications",
          icon: ShieldCheck,
        },
        { labelKey: "clients", href: "/dashboard/admin/clients", icon: User },
        {
          labelKey: "analytics",
          href: "/dashboard/admin/analytics",
          icon: BarChart3,
        },
      ];
    case "renter":
      return [
        { labelKey: "home", href: "/dashboard/renter", icon: Home },
        {
          labelKey: "myProperties",
          href: "/dashboard/renter/listings",
          icon: Building,
        },
        {
          labelKey: "calendar",
          href: "/dashboard/renter/calendar",
          icon: CalendarDays,
        },
        {
          labelKey: "balance",
          href: "/dashboard/renter/balance",
          icon: Wallet,
        },
        {
          labelKey: "smartMatch",
          href: "/dashboard/renter/smart-match",
          icon: Sparkles,
        },
      ];
    case "seller":
      return [
        { labelKey: "home", href: "/dashboard/seller", icon: Home },
        {
          labelKey: "myListings",
          href: "/dashboard/seller/listings",
          icon: Building,
        },
        { labelKey: "profile", href: "/dashboard/renter/profile", icon: User },
      ];
    case "cleaner":
      return [
        { labelKey: "home", href: "/dashboard/cleaner", icon: Home },
        {
          labelKey: "schedule",
          href: "/dashboard/cleaner/schedule",
          icon: Clock,
        },
        {
          labelKey: "earnings",
          href: "/dashboard/cleaner/earnings",
          icon: Wallet,
        },
      ];
    case "food":
      return [
        { labelKey: "home", href: "/dashboard/food", icon: Home },
        {
          labelKey: "orders",
          href: "/dashboard/food/orders",
          icon: ShoppingBag,
        },
      ];
    case "entertainment":
    case "transport":
    case "employment":
    case "handyman":
      return [
        { labelKey: "home", href: "/dashboard/service", icon: Home },
        {
          labelKey: "orders",
          href: "/dashboard/service/orders",
          icon: Briefcase,
        },
      ];
    case "guest":
    default:
      return [
        { labelKey: "home", href: "/dashboard/guest", icon: Home },
        {
          labelKey: "bookings",
          href: "/dashboard/guest/bookings",
          icon: ClipboardList,
        },
        { labelKey: "reviews", href: "/dashboard/guest/reviews", icon: Star },
        { labelKey: "profile", href: "/dashboard/guest/profile", icon: User },
      ];
  }
}

export function MobileBottomNav({
  currentPath,
  userRole = "guest",
}: MobileBottomNavProps) {
  const tabs = getTabs(userRole);
  const t = useTranslations("DashboardSidebar.nav");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E2E8F0] bg-white shadow-[0px_-4px_12px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="flex items-center justify-around">
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const isDashboardHomeTab = index === 0;
          const isActive = isDashboardHomeTab
            ? currentPath === tab.href
            : currentPath === tab.href ||
              currentPath.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-brand-accent" : "text-[#94A3B8]",
                )}
              >
                <Icon className="size-5" />
                <span>{t(tab.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
