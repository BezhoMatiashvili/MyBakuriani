"use client";

import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { linkClass } from "@/components/admin/finance/ui";
import { cn } from "@/lib/utils";
import CompaniesTab from "./CompaniesTab";
import ListingsTab from "./ListingsTab";
import MembershipsTab from "./MembershipsTab";
import { useStatusQuery } from "./shared";

// /dashboard/admin/statuses (C44): memberships, listing VIP / discounts and
// company plans. The tab and every filter live in the URL.

const TABS = ["memberships", "listings", "companies"] as const;
type Tab = (typeof TABS)[number];

export default function StatusesPage() {
  const t = useTranslations("AdminStatuses");
  const query = useStatusQuery();
  const raw = query.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw)
    ? (raw as Tab)
    : "memberships";

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#FEF3C7] text-[#B45309]">
            <CalendarClock className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 max-w-[760px]">
            <h1 className="text-[26px] font-black leading-[1.15] tracking-[-0.6px] text-[#0F172A] sm:text-[30px]">
              {t("title")}
            </h1>
            <p className="mt-1 text-[14px] leading-[22px] text-[#64748B]">
              {t("subtitle")}
            </p>
          </div>
        </div>
        <Link href="/dashboard/admin/memberships" className={linkClass}>
          {t("queueLink")}
        </Link>
      </header>

      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-1"
      >
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`status-tab-${item}`}
            aria-selected={item === tab}
            aria-controls={`status-panel-${item}`}
            onClick={() => item !== tab && query.reset({ tab: item })}
            className={cn(
              "min-h-[44px] shrink-0 rounded-xl px-4 text-[14px] font-bold transition-colors",
              item === tab
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]",
            )}
          >
            {t(`tabs.${item}`)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`status-panel-${tab}`}
        aria-labelledby={`status-tab-${tab}`}
      >
        {tab === "memberships" && (
          <MembershipsTab
            onShowListings={(ownerId) =>
              query.reset({ tab: "listings", owner: ownerId })
            }
          />
        )}
        {tab === "listings" && <ListingsTab />}
        {tab === "companies" && <CompaniesTab />}
      </div>
    </div>
  );
}
