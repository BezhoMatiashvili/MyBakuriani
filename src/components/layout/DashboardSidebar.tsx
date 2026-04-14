"use client";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  Building,
  CalendarDays,
  Wallet,
  Bell,
  User,
  ChevronLeft,
  Sparkles,
  Star,
  ClipboardList,
  ShoppingBag,
  Settings,
  Users,
  BarChart3,
  ShieldCheck,
  Briefcase,
  Clock,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface DashboardSidebarProps {
  userName: string;
  userRole: string;
  avatarUrl?: string;
  smsCount?: number;
  currentPath: string;
}
interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

function getNavItems(role: string): NavItem[] {
  switch (role) {
    case "admin":
      return [
        { labelKey: "home", href: "/dashboard/admin", icon: Home },
        {
          labelKey: "verifications",
          href: "/dashboard/admin/verifications",
          icon: ShieldCheck,
        },
        { labelKey: "clients", href: "/dashboard/admin/clients", icon: Users },
        {
          labelKey: "listings",
          href: "/dashboard/admin/listings",
          icon: Building,
        },
        {
          labelKey: "analytics",
          href: "/dashboard/admin/analytics",
          icon: BarChart3,
        },
        {
          labelKey: "settings",
          href: "/dashboard/admin/settings",
          icon: Settings,
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
        { labelKey: "profile", href: "/dashboard/renter/profile", icon: User },
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
          icon: DollarSign,
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
    default:
      return [
        { labelKey: "home", href: "/dashboard/guest", icon: Home },
        {
          labelKey: "bookings",
          href: "/dashboard/guest/bookings",
          icon: ClipboardList,
        },
        {
          labelKey: "reviews",
          href: "/dashboard/guest/reviews",
          icon: Star,
        },
        { labelKey: "profile", href: "/dashboard/guest/profile", icon: User },
      ];
  }
}

export function DashboardSidebar({
  userName,
  userRole,
  avatarUrl,
  smsCount = 0,
  currentPath,
}: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations("DashboardSidebar");
  const navItems = getNavItems(userRole);
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <motion.aside
      className="hidden h-screen border-r border-[#E2E8F0] bg-white md:flex md:flex-col"
      animate={{ width: collapsed ? 72 : 275 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      <div className="flex items-center gap-3 border-b border-[#E2E8F0] px-5 py-4">
        <Avatar className="h-11 w-11 shrink-0">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
          <AvatarFallback className="bg-[#2563EB] text-[15px] font-extrabold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-[#0F172A]">
              {userName}
            </p>
            <p className="mt-0.5 text-[10px] font-bold text-[#10B981]">
              {t(`roles.${userRole}`)}
            </p>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isDashboardHomeTab = index === 0;
            const isActive = isDashboardHomeTab
              ? currentPath === item.href
              : currentPath === item.href ||
                currentPath.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-4 py-3 text-[13px] font-bold transition-colors",
                    isActive
                      ? "border-l-4 border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                      : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]",
                  )}
                  title={collapsed ? t(`nav.${item.labelKey}`) : undefined}
                >
                  <Icon className="size-[18px] shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 truncate">
                      {t(`nav.${item.labelKey}`)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {!collapsed && smsCount > 0 && (
        <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg bg-brand-accent-light px-3 py-2">
          <Bell className="size-4 text-brand-accent" />
          <span className="text-xs font-medium text-brand-accent">
            {t("notifications", { count: smsCount })}
          </span>
        </div>
      )}
      <div className="border-t border-[#E2E8F0] p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((p) => !p)}
          aria-label={collapsed ? t("expand") : t("collapse")}
          className="w-full"
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronLeft className="size-4" />
          </motion.div>
        </Button>
      </div>
    </motion.aside>
  );
}
