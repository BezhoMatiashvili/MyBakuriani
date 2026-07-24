"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bell,
  Building,
  CalendarDays,
  Ellipsis,
  ClipboardList,
  FileText,
  Home,
  IdCard,
  LayoutGrid,
  LogOut,
  MapPin,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toServiceSegment } from "@/lib/dashboard/serviceSegments";
import BottomSheet from "@/components/shared/BottomSheet";

interface MobileBottomNavProps {
  currentPath: string;
  userRole?: string;
  onSignOut?: () => void;
  notificationCount?: number;
  leadsCount?: number;
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  badge?: "notifications" | "leads";
}

interface RoleNavigation {
  tabs: NavItem[];
  more: NavItem[];
}

const serviceItems = (role: string): RoleNavigation => {
  const segment = toServiceSegment(role) ?? "services";
  const base = `/dashboard/${segment}`;
  const orderLabel = segment === "employment" ? "cvs" : "orders";
  const orderIcon = segment === "employment" ? FileText : ClipboardList;
  return {
    tabs: [
      { labelKey: "home", href: base, icon: LayoutGrid },
      { labelKey: orderLabel, href: `${base}/orders`, icon: orderIcon },
      { labelKey: "balance", href: `${base}/balance`, icon: Wallet },
    ],
    more: [
      {
        labelKey: "notificationsItem",
        href: `${base}/notifications`,
        icon: Bell,
        badge: "notifications",
      },
      { labelKey: "settings", href: `${base}/parameters`, icon: Settings },
    ],
  };
};

function getNavigation(role: string): RoleNavigation {
  switch (role) {
    case "admin":
      return {
        tabs: [
          { labelKey: "home", href: "/dashboard/admin", icon: Home },
          {
            labelKey: "verifications",
            href: "/dashboard/admin/verifications",
            icon: ShieldCheck,
          },
          {
            labelKey: "clients",
            href: "/dashboard/admin/clients",
            icon: Users,
          },
        ],
        more: [
          {
            labelKey: "analytics",
            href: "/dashboard/admin/analytics",
            icon: BarChart3,
          },
          {
            labelKey: "companies",
            href: "/dashboard/admin/companies",
            icon: Building,
          },
          {
            labelKey: "listings",
            href: "/dashboard/admin/listings",
            icon: Building,
          },
          { labelKey: "reviews", href: "/dashboard/admin/reviews", icon: Star },
          {
            labelKey: "tariffsAndPackages",
            href: "/dashboard/admin/settings",
            icon: Settings,
          },
          {
            labelKey: "locationZones",
            href: "/dashboard/admin/zones",
            icon: MapPin,
          },
          {
            labelKey: "statusCards",
            href: "/dashboard/admin/status-cards",
            icon: LayoutGrid,
          },
          {
            labelKey: "finances",
            href: "/dashboard/admin/finances",
            icon: Wallet,
          },
          {
            labelKey: "ads",
            href: "/dashboard/admin/moderation",
            icon: ClipboardList,
          },
          {
            labelKey: "smsApproval",
            href: "/dashboard/admin/sms-approvals",
            icon: Bell,
          },
          {
            labelKey: "broadcast",
            href: "/dashboard/admin/broadcast",
            icon: Users,
          },
          {
            labelKey: "promoCodes",
            href: "/dashboard/admin/promocodes",
            icon: Sparkles,
          },
          {
            labelKey: "banners",
            href: "/dashboard/admin/banners",
            icon: LayoutGrid,
          },
          { labelKey: "news", href: "/dashboard/admin/seo", icon: FileText },
          {
            labelKey: "logs",
            href: "/dashboard/admin/logs",
            icon: ClipboardList,
          },
        ],
      };
    case "renter":
      return {
        tabs: [
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
        ],
        more: [
          { labelKey: "guests", href: "/dashboard/renter/guests", icon: Users },
          {
            labelKey: "cleaners",
            href: "/dashboard/renter/cleaners",
            icon: Sparkles,
          },
          {
            labelKey: "reviews",
            href: "/dashboard/renter/reviews",
            icon: Star,
          },
          {
            labelKey: "balanceAndVip",
            href: "/dashboard/renter/balance",
            icon: Wallet,
          },
          { labelKey: "smsCenter", href: "/dashboard/sms", icon: FileText },
          {
            labelKey: "smartMatch",
            href: "/dashboard/renter/smart-match",
            icon: Sparkles,
          },
          {
            labelKey: "notificationsItem",
            href: "/dashboard/renter/notifications",
            icon: Bell,
            badge: "notifications",
          },
          {
            labelKey: "settings",
            href: "/dashboard/renter/profile",
            icon: Settings,
          },
        ],
      };
    case "seller":
      return {
        tabs: [
          { labelKey: "home", href: "/dashboard/seller", icon: Home },
          {
            labelKey: "myListings",
            href: "/dashboard/seller/listings",
            icon: Building,
          },
          {
            labelKey: "clientsDatabase",
            href: "/dashboard/seller/leads",
            icon: IdCard,
            badge: "leads",
          },
        ],
        more: [
          {
            labelKey: "myOrganizations",
            href: "/dashboard/seller/organizations",
            icon: Building,
          },
          {
            labelKey: "analyticsAndFeedback",
            href: "/dashboard/seller/analytics",
            icon: BarChart3,
          },
          {
            labelKey: "balanceAndVip",
            href: "/dashboard/seller/balance",
            icon: Wallet,
          },
          {
            labelKey: "notificationsItem",
            href: "/dashboard/seller/notifications",
            icon: Bell,
            badge: "notifications",
          },
          {
            labelKey: "settings",
            href: "/dashboard/seller/settings",
            icon: Settings,
          },
        ],
      };
    case "cleaner":
      // The cleaner overview is the current orders board; there is no separate
      // orders route to expose on mobile.
      return {
        tabs: [
          { labelKey: "home", href: "/dashboard/cleaner", icon: Home },
          {
            labelKey: "orders",
            href: "/dashboard/cleaner",
            icon: ClipboardList,
          },
          {
            labelKey: "schedule",
            href: "/dashboard/cleaner/schedule",
            icon: CalendarDays,
          },
        ],
        more: [
          {
            labelKey: "earnings",
            href: "/dashboard/cleaner/earnings",
            icon: Wallet,
          },
          {
            labelKey: "settings",
            href: "/dashboard/cleaner/parameters",
            icon: Settings,
          },
        ],
      };
    case "food":
      return {
        tabs: [
          { labelKey: "home", href: "/dashboard/food", icon: Home },
          {
            labelKey: "orders",
            href: "/dashboard/food/orders",
            icon: ShoppingBag,
          },
          {
            labelKey: "balance",
            href: "/dashboard/food/balance",
            icon: Wallet,
          },
        ],
        more: [
          {
            labelKey: "notificationsItem",
            href: "/dashboard/food/notifications",
            icon: Bell,
            badge: "notifications",
          },
          {
            labelKey: "settings",
            href: "/dashboard/food/parameters",
            icon: Settings,
          },
        ],
      };
    case "employment":
    case "entertainment":
    case "transport":
    case "handyman":
    case "services":
    case "service":
      return serviceItems(role);
    case "guest":
    default:
      return {
        tabs: [
          { labelKey: "home", href: "/dashboard/guest", icon: Home },
          {
            labelKey: "bookings",
            href: "/dashboard/guest/bookings",
            icon: ClipboardList,
          },
          {
            labelKey: "profile",
            href: "/dashboard/guest/profile",
            icon: Users,
          },
        ],
        more: [
          {
            labelKey: "favorites",
            href: "/dashboard/guest/favorites",
            icon: Star,
          },
          {
            labelKey: "reviews",
            href: "/dashboard/guest/reviews",
            icon: MapPin,
          },
        ],
      };
  }
}

function stripLocale(path: string) {
  return path.replace(/^\/(ka|en|ru)(?=\/|$)/, "") || "/";
}

function isActive(item: NavItem, currentPath: string) {
  const current = stripLocale(currentPath);
  const isOverview = /^\/dashboard\/[^/]+$/.test(item.href);
  return isOverview
    ? current === item.href
    : current === item.href || current.startsWith(`${item.href}/`);
}

export function MobileBottomNav({
  currentPath,
  userRole = "guest",
  onSignOut,
  notificationCount = 0,
  leadsCount = 0,
}: MobileBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { tabs, more } = getNavigation(userRole);
  const t = useTranslations("DashboardSidebar.nav");
  const tSidebar = useTranslations("DashboardSidebar");
  const hasMoreActive = more.some((item) => isActive(item, currentPath));
  const navVisibility = "lg:hidden";

  const badgeFor = (item: NavItem) =>
    item.badge === "leads"
      ? leadsCount
      : item.badge === "notifications"
        ? notificationCount
        : 0;

  return (
    <>
      <nav
        aria-label="Dashboard navigation"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-[#E2E8F0] bg-white shadow-[0px_-4px_12px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]",
          navVisibility,
        )}
      >
        <ul className="flex items-center justify-around">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab, currentPath);
            const badge = badgeFor(tab);
            return (
              <li
                key={`${tab.labelKey}-${tab.href}`}
                className="min-w-0 flex-1"
              >
                <Link
                  href={tab.href}
                  className={cn(
                    "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors",
                    active ? "text-brand-accent" : "text-[#64748B]",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="max-w-full truncate">{t(tab.labelKey)}</span>
                  {badge > 0 && (
                    <span className="absolute top-1.5 ml-5 flex min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[9px] font-bold leading-4 text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="dashboard-more-sheet"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors",
                hasMoreActive || moreOpen
                  ? "text-brand-accent"
                  : "text-[#64748B]",
              )}
            >
              <Ellipsis className="size-5" aria-hidden />
              <span>{t("more")}</span>
            </button>
          </li>
        </ul>
      </nav>

      <BottomSheet
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t("more")}
      >
        <div id="dashboard-more-sheet" className="space-y-1">
          {more.map((item) => {
            const Icon = item.icon;
            const badge = badgeFor(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold",
                  isActive(item, currentPath)
                    ? "bg-[#EFF6FF] text-[#2563EB]"
                    : "text-[#334155] hover:bg-[#F8FAFC]",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="flex-1">{t(item.labelKey)}</span>
                {badge > 0 && (
                  <span className="rounded-full bg-[#EF4444] px-2 py-0.5 text-[10px] text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
          <div className="my-3 border-t border-[#E2E8F0]" />
          <Link
            href="/"
            onClick={() => setMoreOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-[#334155] hover:bg-[#F8FAFC]"
          >
            <Home className="size-5" aria-hidden />
            {tSidebar("backToHome")}
          </Link>
          {onSignOut && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onSignOut();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-[#DC2626] hover:bg-[#FEF2F2]"
            >
              <LogOut className="size-5" aria-hidden />
              {tSidebar("logout")}
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
