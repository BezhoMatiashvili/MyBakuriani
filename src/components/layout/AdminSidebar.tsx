"use client";

import { Mountain, Home } from "lucide-react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  verificationAlerts?: number;
  onSignOut: () => void;
}

interface NavItem {
  labelKey: string;
  href: string;
  badge?: number;
}

const sections: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: "analytics",
    items: [
      { labelKey: "homePage", href: "/dashboard/admin" },
      {
        labelKey: "verifications",
        href: "/dashboard/admin/verifications",
      },
      {
        labelKey: "companies",
        href: "/dashboard/admin/companies",
      },
      {
        labelKey: "users",
        href: "/dashboard/admin/clients",
      },
      {
        labelKey: "listings",
        href: "/dashboard/admin/listings",
      },
      {
        labelKey: "logs",
        href: "/dashboard/admin/logs",
      },
    ],
  },
  {
    titleKey: "operations",
    items: [
      {
        labelKey: "reviews",
        href: "/dashboard/admin/reviews",
      },
      {
        labelKey: "tariffsAndPackages",
        href: "/dashboard/admin/settings",
      },
      {
        labelKey: "locationZones",
        href: "/dashboard/admin/zones",
      },
      {
        labelKey: "statusCards",
        href: "/dashboard/admin/status-cards",
      },
    ],
  },
  {
    titleKey: "monetization",
    items: [
      {
        labelKey: "finances",
        href: "/dashboard/admin/finances",
      },
      {
        labelKey: "ads",
        href: "/dashboard/admin/moderation",
      },
    ],
  },
  {
    titleKey: "marketing",
    items: [
      {
        labelKey: "broadcast",
        href: "/dashboard/admin/broadcast",
      },
      {
        labelKey: "promoCodes",
        href: "/dashboard/admin/promocodes",
      },
      { labelKey: "banners", href: "/dashboard/admin/banners" },
      { labelKey: "news", href: "/dashboard/admin/seo" },
    ],
  },
];

function normalizePath(pathname: string) {
  return pathname.replace(/^\/[a-z]{2}(?=\/)/, "");
}

export function AdminSidebar({
  verificationAlerts = 0,
  onSignOut,
}: AdminSidebarProps) {
  const t = useTranslations("DashboardSidebar");
  const pathname = usePathname();
  const currentPath = normalizePath(pathname);

  return (
    <aside className="hidden h-screen w-[281px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#020B29] text-[#D1D5DB] lg:flex">
      <div className="flex h-20 shrink-0 items-center border-b border-white/10 px-6">
        <div className="mb-1 flex h-8 items-center text-[#2563EB]">
          <Mountain className="h-5 w-5" strokeWidth={2.4} />
        </div>
        <h2 className="ml-2 text-[20px] font-extrabold leading-none text-white">
          <span className="text-[#F97316]">My</span>Bakuriani
        </h2>
      </div>

      <nav className="flex-1 space-y-0 overflow-y-auto px-4 py-5 pb-2">
        {sections.map((section) => (
          <div key={section.titleKey} className="mb-4 last:mb-0">
            <p className="px-3 pb-1.5 pt-4 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#5C6D8F] first:pt-1">
              {t(`sections.${section.titleKey}`)}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isAdminHomeItem = item.href === "/dashboard/admin";
                const isActive = isAdminHomeItem
                  ? currentPath === item.href
                  : currentPath === item.href ||
                    currentPath.startsWith(`${item.href}/`);
                const badge =
                  item.href === "/dashboard/admin/verifications"
                    ? verificationAlerts
                    : item.badge;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex h-10 items-center gap-3 rounded-[12px] px-3 text-[14px] font-medium transition-colors",
                        isActive
                          ? "bg-[#052060] text-[#2E79FF] font-bold shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)]"
                          : "text-[#8D9BB7] hover:bg-[#0E1C45] hover:text-[#DCE6FB]",
                      )}
                    >
                      <span className="flex-1 truncate">
                        {t(`nav.${item.labelKey}`)}
                      </span>
                      {badge ? (
                        <span className="min-w-6 rounded-md bg-[#EF4444] px-2 py-1 text-center text-[11px] font-extrabold leading-none text-white shadow-sm">
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 bg-[#020B29] px-4 pt-4">
        <Link
          href="/"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-[14px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.55)] transition-colors hover:bg-[#1D4ED8]"
        >
          <Home className="size-[18px]" />
          {t("backToHome")}
        </Link>
      </div>

      <div className="flex h-[88px] shrink-0 items-center bg-[#020B29] p-4">
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-11 w-full items-center gap-2 rounded-xl border border-[#28406D] bg-[#172947] px-4 text-[14px] font-bold text-[#EAF1FF] transition-colors hover:bg-[#1D345A]"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
          {t("adminLogout")}
        </button>
      </div>
    </aside>
  );
}
