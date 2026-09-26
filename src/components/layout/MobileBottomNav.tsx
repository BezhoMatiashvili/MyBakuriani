"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bell,
  Building,
  CalendarDays,
  ChevronRight,
  Ellipsis,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  IdCard,
  KeyRound,
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
import { MobileServiceSwitcherGrid } from "@/components/layout/MobileServiceSwitcherGrid";
import BottomSheet from "@/components/shared/BottomSheet";
import { RENTAL_REVIEWS_HIDDEN } from "@/lib/features";

interface MobileBottomNavProps {
  currentPath: string;
  userRole?: string;
  onSignOut?: () => void;
  leadsCount?: number;
  canUseSms?: boolean;
  availableCabinets?: string[];
  balance?: number;
  companies?: { id: string; name: string; role: string; status: string }[];
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  badge?: "leads";
  /** Already-translated label, for an entry outside DashboardSidebar.nav. */
  label?: string;
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
      { labelKey: "balanceAndVip", href: `${base}/balance`, icon: Wallet },
    ],
    more: [
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
            labelKey: "users",
            href: "/dashboard/admin/clients",
            icon: Users,
          },
        ],
        // AdminSidebar order. No "analytics" entry: that route only
        // redirects to /dashboard/admin, and desktop dropped it.
        more: [
          {
            labelKey: "memberships",
            href: "/dashboard/admin/memberships",
            icon: IdCard,
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
          {
            labelKey: "logs",
            href: "/dashboard/admin/logs",
            icon: ClipboardList,
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
            labelKey: "payments",
            href: "/dashboard/admin/payments",
            icon: CreditCard,
          },
          {
            labelKey: "ads",
            href: "/dashboard/admin/moderation",
            icon: ClipboardList,
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
            labelKey: "clientsDatabase",
            href: "/dashboard/seller/leads",
            icon: IdCard,
            badge: "leads",
          },
          {
            labelKey: "propertiesAndProjects",
            href: "/dashboard/seller/listings",
            icon: Building,
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
            labelKey: "priceDropSms",
            href: "/dashboard/seller/sms",
            icon: Bell,
          },
          {
            labelKey: "settings",
            href: "/dashboard/seller/settings",
            icon: Settings,
          },
        ],
      };
    case "cleaner":
      // Mirrors the web CleanerSidebar exactly: home, schedule, settings.
      return {
        tabs: [
          { labelKey: "home", href: "/dashboard/cleaner", icon: Home },
          {
            labelKey: "graphic",
            href: "/dashboard/cleaner/schedule",
            icon: CalendarDays,
          },
          {
            labelKey: "settings",
            href: "/dashboard/cleaner/parameters",
            icon: Settings,
          },
        ],
        more: [],
      };
    case "food":
      return {
        tabs: [
          { labelKey: "home", href: "/dashboard/food", icon: Home },
          {
            labelKey: "myMenuPdf",
            href: "/dashboard/food/orders",
            icon: ShoppingBag,
          },
          {
            labelKey: "balanceAndVip",
            href: "/dashboard/food/balance",
            icon: Wallet,
          },
        ],
        more: [
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
            labelKey: "settings",
            href: "/dashboard/guest/profile",
            icon: Settings,
          },
        ],
        more: [
          {
            labelKey: "favorites",
            href: "/dashboard/guest/favorites",
            icon: Star,
          },
          {
            labelKey: "history",
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
  leadsCount = 0,
  canUseSms = false,
  availableCabinets = [],
  balance = 0,
  companies = [],
}: MobileBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const t = useTranslations("DashboardSidebar.nav");
  const tSidebar = useTranslations("DashboardSidebar");
  const navigation = getNavigation(userRole);
  const tabs = navigation.tabs;
  // `userRole` is the URL cabinet segment (or the profile role), so
  // service/services/handyman all mean the "services" cabinet. Deliberately not
  // roleToCabinetKey — its `default: return "guest"` would put the check on
  // სტუმარი for admin and any unknown segment.
  const activeCabinetKey = toServiceSegment(userRole) ?? userRole;
  // Every cabinet's desktop sidebar renders CabinetSwitcher except admin
  // (see AdminSidebar.tsx) — mirror that here instead of restricting mobile
  // cross-cabinet switching to just renter/seller.
  const showCabinets = activeCabinetKey !== "admin";
  // The desktop CabinetSwitcher dropdown links to the account-wide settings
  // (sign-in methods + marketing notification channels). Mobile had no route
  // there at all, so the same entry is listed in the More sheet.
  const accountItem: NavItem = {
    labelKey: "linkedAccounts",
    label: tSidebar("switcher.linkedAccounts"),
    href: "/dashboard/account",
    icon: KeyRound,
  };
  // Notifications are not listed here for renter/seller/food/services: those
  // cabinets reach them from the bell in their mobile top header.
  const more = [
    ...navigation.more.filter(
      (item) =>
        ((item.href !== "/dashboard/sms" &&
          item.href !== "/dashboard/seller/sms") ||
          canUseSms) &&
        // Rental reviews are temporarily hidden (see RENTAL_REVIEWS_HIDDEN).
        (item.href !== "/dashboard/renter/reviews" || !RENTAL_REVIEWS_HIDDEN),
    ),
    ...(showCabinets ? [accountItem] : []),
  ];
  const hasMoreActive = more.some((item) => isActive(item, currentPath));
  const navVisibility = "lg:hidden";
  const isSeller = userRole === "seller";
  const memberCompanies = companies.filter(
    (company) => company.role === "owner" || company.role === "agent",
  );
  const companyHref =
    memberCompanies.length === 1
      ? `/dashboard/seller/organizations/${memberCompanies[0].id}`
      : "/dashboard/seller/organizations";
  const sellerSheetItems: Array<{
    labelKey: string;
    label?: string;
    href: string;
    detail?: "balance";
    active?: (path: string) => boolean;
  }> = [
    {
      labelKey: "mainPanel",
      href: "/dashboard/seller",
      active: (path) => path === "/dashboard/seller",
    },
    { labelKey: "clientsDatabase", href: "/dashboard/seller/leads" },
    {
      labelKey: "propertiesAndProjects",
      href: "/dashboard/seller/listings",
    },
    {
      labelKey: "myOrganizations",
      href: "/dashboard/seller/organizations",
      active: (path) => path === "/dashboard/seller/organizations",
    },
    ...(memberCompanies.length > 0
      ? [
          {
            labelKey: "myCompany",
            href: companyHref,
            active: (path: string) =>
              memberCompanies.some(
                (company) =>
                  path === `/dashboard/seller/organizations/${company.id}` ||
                  path.startsWith(
                    `/dashboard/seller/organizations/${company.id}/`,
                  ),
              ),
          },
        ]
      : []),
    {
      labelKey: "analyticsAndFeedback",
      href: "/dashboard/seller/analytics",
    },
    {
      labelKey: "balanceAndVip",
      href: "/dashboard/seller/balance",
      detail: "balance" as const,
    },
    // SellerSidebar appends this to its "efficiency" group under the same flag.
    ...(canUseSms
      ? [{ labelKey: "priceDropSms", href: "/dashboard/seller/sms" }]
      : []),
    { labelKey: "settings", href: "/dashboard/seller/settings" },
    {
      labelKey: accountItem.labelKey,
      label: accountItem.label,
      href: accountItem.href,
    },
    {
      labelKey: "backToHome",
      label: tSidebar("backToHome"),
      href: "/",
      // Every path starts with "/", so the prefix match would always fire.
      active: () => false,
    },
  ];

  const badgeFor = (item: NavItem) => (item.badge === "leads" ? leadsCount : 0);

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
                    "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors max-[359px]:px-0",
                    active ? "text-brand-accent" : "text-[#64748B]",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {/* Desktop labels, so some are long ("ობიექტები და
                      პროექტები"): wrap to two lines rather than truncate.
                      Below 360px the tab loses its padding and the text
                      tightens slightly, or that label would need three. */}
                  <span className="line-clamp-2 max-w-full text-center leading-3 max-[359px]:tracking-tight">
                    {t(tab.labelKey)}
                  </span>
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
        title={isSeller ? tSidebar("menu") : t("more")}
        panelClassName="h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)]"
      >
        <div
          id="dashboard-more-sheet"
          className={isSeller ? "space-y-4" : "space-y-1"}
        >
          {showCabinets && (
            <MobileServiceSwitcherGrid
              activeCabinetKey={activeCabinetKey}
              availableCabinets={availableCabinets}
              onSelect={() => setMoreOpen(false)}
            />
          )}
          {isSeller ? (
            <div
              data-testid="seller-mobile-menu-list"
              className="overflow-hidden rounded-[18px] border border-[#E2E8F0] bg-white"
            >
              {sellerSheetItems.map((item) => {
                const path = stripLocale(currentPath);
                const active = item.active
                  ? item.active(path)
                  : path === item.href || path.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={`${item.labelKey}-${item.href}`}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 border-b border-[#EEF1F4] px-4 text-[13px] font-bold transition-colors last:border-b-0",
                      active
                        ? "bg-[#EFF6FF] text-[#2563EB]"
                        : "text-[#1E293B] hover:bg-[#F8FAFC]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      {item.label ?? t(item.labelKey)}
                    </span>
                    {item.detail === "balance" && (
                      <span
                        className={cn(
                          "shrink-0 text-[12px] font-semibold",
                          active ? "text-[#2563EB]" : "text-[#64748B]",
                        )}
                      >
                        {balance.toFixed(2)} ₾
                      </span>
                    )}
                    <ChevronRight
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-[#2563EB]" : "text-[#94A3B8]",
                      )}
                      aria-hidden
                    />
                  </Link>
                );
              })}
              {onSignOut && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onSignOut();
                  }}
                  className="flex min-h-12 w-full items-center px-4 text-left text-[13px] font-bold text-[#DC2626] transition-colors hover:bg-[#FEF2F2]"
                >
                  {tSidebar("logout")}
                </button>
              )}
            </div>
          ) : (
            more.map((item) => {
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
                  <span className="flex-1">
                    {item.label ?? t(item.labelKey)}
                  </span>
                  {badge > 0 && (
                    <span className="rounded-full bg-[#EF4444] px-2 py-0.5 text-[10px] text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })
          )}
          {!isSeller && (
            <>
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
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
