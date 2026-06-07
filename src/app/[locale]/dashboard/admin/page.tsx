"use client";

import { useEffect, useMemo, useState } from "react";
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

interface AdminKPIs {
  revenue: number;
  activeListings: number;
  registeredUsers: number;
  weeklyVisitors: number;
}

interface FunnelStep {
  label: string;
  value: number;
}

type AdminStatsApiResponse = {
  data: {
    active_listings: number;
    total_properties: number;
    total_bookings: number;
    completed_bookings: number;
    active_or_completed_bookings: number;
    total_revenue: number;
    average_response_minutes: number;
    average_booking_price: number;
    net_revenue: number;
    pending_over_24h: number;
    total_visits: number;
    unique_visits: number;
    registered_visitors: number;
    registered_users: number;
    weekly_visitors: number;
  };
};

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<AdminKPIs>({
    revenue: 0,
    activeListings: 0,
    registeredUsers: 0,
    weeklyVisitors: 0,
  });
  const [pendingOver24, setPendingOver24] = useState(0);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [occupancyRate, setOccupancyRate] = useState(0);
  const [avgPriceTrend, setAvgPriceTrend] = useState(0);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch("/api/admin/stats", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("stats_unavailable");
        }

        const payload = (await response.json()) as AdminStatsApiResponse;
        const stats = payload.data;
        const occ =
          stats.total_properties > 0
            ? Math.round(
                (stats.active_or_completed_bookings / stats.total_properties) *
                  100,
              )
            : 0;

        setKpis({
          revenue: Number(stats.net_revenue ?? 0),
          activeListings: Number(stats.active_listings ?? 0),
          registeredUsers: Number(stats.registered_users ?? 0),
          weeklyVisitors: Number(stats.weekly_visitors ?? 0),
        });
        setPendingOver24(Number(stats.pending_over_24h ?? 0));

        // Funnel top steps require analytics tracking we haven't wired yet.
        // Surface only the known terminal count; upper steps stay at 0 until
        // page-view / search / request events are tracked.
        setFunnel([
          { label: "ნახვები", value: 0 },
          { label: "ძიებები", value: 0 },
          { label: "მოთხოვნები", value: 0 },
          {
            label: "დასრულებული",
            value: Number(stats.completed_bookings ?? 0),
          },
        ]);

        setOccupancyRate(occ);
        setAvgPriceTrend(Math.round(Number(stats.average_booking_price ?? 0)));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const funnelCards = useMemo(
    () => [
      {
        label: "საიტის ვიზიტი (კვირაში)",
        value: funnel[0]?.value ?? 0,
        icon: Users2,
        tone: "bg-[#F8FAFC] text-[#334155]",
      },
      {
        label: "ძიების გახსნა",
        value: funnel[1]?.value ?? 0,
        icon: Search,
        tone: "bg-[#EEF2FF] text-[#1D4ED8]",
      },
      {
        label: "მოთხოვნის გაგზავნა",
        value: funnel[2]?.value ?? 0,
        icon: Send,
        tone: "bg-[#ECFDF5] text-[#059669]",
      },
    ],
    [funnel],
  );

  const kpiCards = [
    {
      label: "სუფთა შემოსავალი (₾)",
      value: formatPrice(kpis.revenue),
      icon: Banknote,
    },
    {
      label: "შემოსული მომხმარებლები",
      value: formatNumber(kpis.weeklyVisitors),
      icon: Users,
    },
    {
      label: "აქტიური განცხადებები",
      value: formatNumber(kpis.activeListings),
      icon: Building2,
    },
    {
      label: "რეგისტრირებული მომხმარებლები",
      value: formatNumber(kpis.registeredUsers),
      icon: UserCheck,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-7 pb-10">
      <div className="pt-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          მთავარი გვერდი
        </h1>
        <p className="mt-2 text-[14px] font-medium leading-[21px] text-[#64748B]">
          პლატფორმის ოპერატიული მართვა
        </p>
      </div>

      {!loading && pendingOver24 > 0 && (
        <div className="flex flex-col gap-4 rounded-[18px] bg-[#EF2D2D] px-6 py-4 text-white shadow-[0px_8px_20px_rgba(239,45,45,0.25)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-lg font-semibold leading-none">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <span>
              ყურადღება: {pendingOver24} ვერიფიკაცია ითხოვს 24 საათზე მეტია
            </span>
          </div>
          <Link
            href="/dashboard/admin/verifications"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-[#EF2D2D] transition-colors hover:bg-[#F8FAFC]"
          >
            შემოწმება
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-black uppercase tracking-[1px] text-[#64748B]">
          მთავარი მაჩვენებლები (KPI)
        </h2>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-sm font-semibold text-[#2563EB] transition-colors hover:bg-[#EFF6FF]"
        >
          <Download className="h-4 w-4" />
          სტატისტიკის გადმოწერა
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
            გაყიდვების ფუნელი (FUNNEL)
          </h2>
          <div className="space-y-3">
            {funnelCards.map((step, index) => {
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
                      ↓ დანაკარგი: {dropoff}%
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <h2 className="mb-5 text-[16px] font-black uppercase tracking-[1px] text-[#64748B]">
            ბაზრის ჯანმრთელობა
          </h2>
          <div className="space-y-3">
            <div className="rounded-2xl bg-[#F8FAFC] p-4">
              <p className="text-sm font-semibold text-[#64748B]">
                პასიური ობიექტები
              </p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-[38px] font-black leading-none text-[#0F172A]">
                  {loading ? "0" : kpis.activeListings}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-[#F8FAFC] p-4">
              <p className="text-sm font-semibold text-[#64748B]">
                კალენდრის სიხშირე
              </p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-[38px] font-black leading-none text-[#0F172A]">
                  {occupancyRate}%
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-[#F8FAFC] p-4">
              <p className="text-sm font-semibold text-[#64748B]">
                საშუალო ღამის ფასი
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
