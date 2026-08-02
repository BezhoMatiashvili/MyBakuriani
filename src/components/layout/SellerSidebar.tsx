"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  PieChart,
  IdCard,
  Building2,
  Building,
  TrendingUp,
  Wallet,
  Bell,
  MessageSquare,
  Settings,
  LogOut,
  Home,
  Check,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CabinetSwitcher } from "@/components/layout/CabinetSwitcher";
import { useActiveOrgScope } from "@/lib/dashboard/orgScope";

interface SellerCompany {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface SellerSidebarProps {
  userName: string;
  profileType?: "individual" | "legal";
  avatarUrl?: string;
  isVerified?: boolean;
  leadsCount?: number;
  notificationCount?: number;
  currentPath: string;
  onSignOut: () => void;
  availableCabinets: string[];
  /** Approved organizations the user belongs to (drives company nav items). */
  companies?: SellerCompany[];
  canUseSellerSms?: boolean;
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  badgeKind?: "leads" | "notifications";
  /** Whether nested routes should also mark this item as active. */
  matchDescendants?: boolean;
  /** Custom active check (receives the locale-stripped path); wins over href matching. */
  isActive?: (path: string) => boolean;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    titleKey: "managementPanel",
    items: [
      { labelKey: "mainPanel", href: "/dashboard/seller", icon: PieChart },
      {
        labelKey: "clientsDatabase",
        href: "/dashboard/seller/leads",
        icon: IdCard,
        badgeKind: "leads",
      },
      {
        labelKey: "propertiesAndProjects",
        href: "/dashboard/seller/listings",
        icon: Building2,
      },
    ],
  },
  {
    titleKey: "efficiency",
    items: [
      {
        labelKey: "analyticsAndFeedback",
        href: "/dashboard/seller/analytics",
        icon: TrendingUp,
      },
      {
        labelKey: "balanceAndVip",
        href: "/dashboard/seller/balance",
        icon: Wallet,
      },
    ],
  },
  {
    titleKey: "system",
    items: [
      {
        labelKey: "notificationsItem",
        href: "/dashboard/seller/notifications",
        icon: Bell,
        badgeKind: "notifications",
      },
      {
        labelKey: "settings",
        href: "/dashboard/seller/settings",
        icon: Settings,
      },
    ],
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

/** usePathname() may carry a locale prefix (e.g. /en/...); nav hrefs never do. */
function stripLocalePrefix(path: string) {
  return path.replace(/^\/(ka|en|ru)(?=\/|$)/, "") || "/";
}

function isItemActive(itemHref: string, path: string, matchDescendants = true) {
  if (itemHref === "/dashboard/seller" || !matchDescendants) {
    return path === itemHref;
  }
  return path === itemHref || path.startsWith(`${itemHref}/`);
}

export function SellerSidebar({
  userName,
  profileType = "individual",
  avatarUrl,
  isVerified = true,
  leadsCount = 0,
  notificationCount = 0,
  currentPath,
  onSignOut,
  availableCabinets,
  companies = [],
  canUseSellerSms = false,
}: SellerSidebarProps) {
  const t = useTranslations("DashboardSidebar");
  const scope = useActiveOrgScope();
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  // Inject company nav into the management section: "My organizations" is always
  // shown; "My company" appears only when the user is a member (owner or agent)
  // of one (links to its cabinet, or to the list when they belong to several).
  const memberCompanies = companies.filter(
    (c) => c.role === "owner" || c.role === "agent",
  );
  const companyHref =
    memberCompanies.length === 1
      ? `/dashboard/seller/organizations/${memberCompanies[0].id}`
      : "/dashboard/seller/organizations";
  const sections: NavSection[] = SECTIONS.map((section) => {
    if (section.titleKey !== "managementPanel") {
      if (section.titleKey === "efficiency" && canUseSellerSms) {
        return {
          ...section,
          items: [
            ...section.items,
            {
              labelKey: "priceDropSms",
              href: "/dashboard/seller/sms",
              icon: MessageSquare,
            },
          ],
        };
      }
      return section;
    }
    const items: NavItem[] = [
      ...section.items,
      {
        labelKey: "myOrganizations",
        href: "/dashboard/seller/organizations",
        icon: Building2,
        // A company cabinet lives beneath this URL. Keep its highlight on
        // "My company" instead of marking both links as selected.
        matchDescendants: false,
      },
    ];
    if (memberCompanies.length > 0) {
      items.push({
        labelKey: "myCompany",
        href: companyHref,
        icon: Building,
        // Active only inside a member company's cabinet — never on the
        // organizations list, even when companyHref points there (>1 company).
        isActive: (path) =>
          memberCompanies.some(
            (c) =>
              path === `/dashboard/seller/organizations/${c.id}` ||
              path.startsWith(`/dashboard/seller/organizations/${c.id}/`),
          ),
      });
    }
    return { ...section, items };
  });

  return (
    <motion.aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white lg:flex">
      <div className="px-6 py-6">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      <CabinetSwitcher activeKey="seller" availableKeys={availableCabinets}>
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11 bg-[#DCFCE7]">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-[#DCFCE7] text-[14px] font-extrabold text-[#059669]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-[#0F172A]">
            {userName}
          </p>
          {isVerified && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#10B981]">
              <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#10B981] text-white">
                <Check className="h-2 w-2" strokeWidth={3} />
              </span>
              {t("verified")}
            </p>
          )}
          <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
            {t(`profileType.${profileType}`)}
          </p>
        </div>
      </CabinetSwitcher>

      {scope.companies.length > 0 && (
        <div className="mx-4 mt-3">
          <label className="mb-1.5 block px-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
            {t("scopeSwitcher.label")}
          </label>
          <select
            value={
              scope.mode === "org" && scope.organizationId
                ? scope.organizationId
                : "personal"
            }
            onChange={(e) => {
              const value = e.target.value;
              scope.setActiveOrgId(value === "personal" ? null : value);
            }}
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[13px] font-bold text-[#0F172A] outline-none transition-colors focus:border-[#2563EB]"
          >
            <option value="personal">{t("scopeSwitcher.personal")}</option>
            {scope.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="mt-5 flex-1 overflow-y-auto px-4">
        <ul className="space-y-5">
          {sections.map((section) => (
            <li key={section.titleKey}>
              <p className="px-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                {t(`sections.${section.titleKey}`)}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const path = stripLocalePrefix(currentPath);
                  const active = item.isActive
                    ? item.isActive(path)
                    : isItemActive(item.href, path, item.matchDescendants);
                  const Icon = item.icon;
                  const badgeValue =
                    item.badgeKind === "leads"
                      ? leadsCount
                      : item.badgeKind === "notifications"
                        ? notificationCount
                        : 0;
                  const showBadge = Boolean(item.badgeKind) && badgeValue > 0;
                  const badgeStyle =
                    item.badgeKind === "leads" ||
                    item.badgeKind === "notifications"
                      ? "bg-[#EF4444] text-white"
                      : "bg-[#E2E8F0] text-[#64748B]";
                  return (
                    <li key={item.labelKey}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-bold transition-colors",
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
                        <span className="flex-1 truncate">
                          {t(`nav.${item.labelKey}`)}
                        </span>
                        {showBadge && (
                          <span
                            className={cn(
                              "flex h-[20px] min-w-[24px] items-center justify-center rounded-md px-1.5 text-[11px] font-bold",
                              badgeStyle,
                            )}
                          >
                            {badgeValue > 99 ? "99+" : badgeValue}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-[14px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.45)] transition-colors hover:bg-[#1D4ED8]"
        >
          <Home className="size-[18px]" />
          {t("backToHome")}
        </Link>
      </div>

      <div className="border-t border-[#EEF1F4] px-4 py-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-bold text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
        >
          <LogOut className="size-[18px]" />
          {t("logout")}
        </button>
      </div>
    </motion.aside>
  );
}
