"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Download,
  Search,
  Send,
  UserCheck,
  Users,
  Users2,
} from "lucide-react";
import { formatPrice, formatNumber } from "@/lib/utils/format";
import type { AdminStatsData } from "@/lib/admin/getAdminStats";

interface AdminKPIs {
  revenue: number;
  activeListings: number;
  registeredUsers: number;
  totalVisits: number;
  registeredVisitors: number;
}

export default function AdminDashboardClient({
  initialStats,
}: {
  initialStats: AdminStatsData | null;
}) {
  const t = useTranslations("AdminDashboard");

  const occ =
    initialStats && initialStats.total_properties > 0
      ? Math.round(
          (initialStats.active_or_completed_bookings /
            initialStats.total_properties) *
            100,
        )
      : 0;

  const [loading] = useState(false);
  const [kpis] = useState<AdminKPIs>({
    revenue: Number(initialStats?.net_revenue ?? 0),
    activeListings: Number(initialStats?.active_listings ?? 0),
    registeredUsers: Number(initialStats?.registered_users ?? 0),
    totalVisits: Number(initialStats?.total_visits ?? 0),
    registeredVisitors: Number(initialStats?.registered_visitors ?? 0),
  });
  const [pendingOver24] = useState(Number(initialStats?.pending_over_24h ?? 0));

  // Rolling 7-day funnel computed by admin_overview_stats(): page views,
  // /search opens and bookings. The trailing "completed" entry only feeds
  // the last drop-off percentage.
  const funnelCards = useMemo(
    () => [
      {
        label: t("funnelSiteVisits"),
        value: Number(initialStats?.visits_7d ?? 0),
        icon: Users2,
        tone: "bg-[#F8FAFC] text-[#334155]",
      },
      {
        label: t("funnelSearchOpens"),
        value: Number(initialStats?.searches_7d ?? 0),
        icon: Search,
        tone: "bg-[#EEF2FF] text-[#1D4ED8]",
      },
      {
        label: t("funnelRequestSends"),
        value: Number(initialStats?.requests_7d ?? 0),
        icon: Send,
        tone: "bg-[#ECFDF5] text-[#059669]",
      },
      {
        label: t("funnelCompleted"),
        value: Number(initialStats?.completed_bookings ?? 0),
        icon: Send,
        tone: "bg-[#ECFDF5] text-[#059669]",
      },
    ],
    [t, initialStats],
  );

  const kpiCards = [
    {
      label: t("netRevenue"),
      value: formatPrice(kpis.revenue),
      icon: Banknote,
    },
    {
      label: t("totalVisits"),
      value: formatNumber(kpis.totalVisits),
      icon: Users2,
    },
    {
      label: t("registeredVisitors"),
      value: formatNumber(kpis.registeredVisitors),
      icon: Users,
    },
    {
      label: t("activeListings"),
      value: formatNumber(kpis.activeListings),
      icon: Building2,
    },
    {
      label: t("registeredUsers"),
      value: formatNumber(kpis.registeredUsers),
      icon: UserCheck,
    },
  ];

  const [occupancyRate] = useState(occ);
  const [avgPriceTrend] = useState(
    Math.round(Number(initialStats?.average_booking_price ?? 0)),
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-7 pb-10">
      <div className="pt-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-2 text-[14px] font-medium leading-[21px] text-[#64748B]">
          {t("subtitle")}
        </p>
      </div>

      {!loading && pendingOver24 > 0 && (
        <div className="flex flex-col gap-4 rounded-[18px] bg-[#EF2D2D] px-6 py-4 text-white shadow-[0px_8px_20px_rgba(239,45,45,0.25)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-lg font-semibold leading-none">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <span>{t("alert", { count: pendingOver24 })}</span>
          </div>
          <Link
            href="/dashboard/admin/verifications"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-[#EF2D2D] transition-colors hover:bg-[#F8FAFC]"
          >
            {t("review")}
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-black uppercase tracking-[1px] text-[#64748B]">
          {t("kpiTitle")}
        </h2>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-sm font-semibold text-[#2563EB] transition-colors hover:bg-[#EFF6FF]"
        >
          <Download className="h-4 w-4" />
          {t("downloadStats")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 shadow-[0px_2px_6px_rgba(15,23,42,0.03)]"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] font-semibold text-[#64748B]">
                {card.label}
              </p>
              <card.icon className="h-4 w-4 text-[#CBD5E1]" />
            </div>
            <div className="mt-2">
              <p className="text-[42px] font-black leading-none text-[#0F172A]">
                {loading ? "..." : card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr,1fr]">
        <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <h2 className="mb-4 text-[16px] font-black uppercase tracking-[1px] text-[#64748B]">
            {t("funnelTitle")}
          </h2>
          <div className="space-y-3">
            {funnelCards.slice(0, 3).map((step, index) => {
              const nextStep = funnelCards[index + 1];
              const dropoff = nextStep
                ? Math.round(
                    ((step.value - nextStep.value) / Math.max(step.value, 1)) *
                      100,
                  )
                : null;

              return (
                <div key={step.label}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F1F5F9] text-[#475569]">
                      <step.icon className="h-4 w-4" />
                    </div>
                    <div
                      className={`flex-1 rounded-2xl border border-[#E2E8F0] px-4 py-3 ${step.tone}`}
                    >
                      <p className="text-xs font-semibold">{step.label}</p>
                      <p className="mt-1 text-[38px] font-black leading-none text-[#0F172A]">
                        {formatNumber(step.value)}
                      </p>
                    </div>
                  </div>
                  {dropoff !== null ? (
                    <p className="ml-14 mt-1 text-xs font-bold text-[#EF4444]">
                      {t("dropoff", { percent: dropoff })}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <h2 className="mb-5 text-[16px] font-black uppercase tracking-[1px] text-[#64748B]">
            {t("marketHealth")}
          </h2>
          <div className="space-y-3">
            <div className="rounded-2xl bg-[#F8FAFC] p-4">
              <p className="text-sm font-semibold text-[#64748B]">
                {t("passiveObjects")}
              </p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-[38px] font-black leading-none text-[#0F172A]">
                  {loading ? "0" : kpis.activeListings}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-[#F8FAFC] p-4">
              <p className="text-sm font-semibold text-[#64748B]">
                {t("calendarFrequency")}
              </p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-[38px] font-black leading-none text-[#0F172A]">
                  {occupancyRate}%
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-[#F8FAFC] p-4">
              <p className="text-sm font-semibold text-[#64748B]">
                {t("avgNightPrice")}
              </p>
              <p className="mt-2 text-[38px] font-black leading-none text-[#0F172A]">
                {formatPrice(avgPriceTrend)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
