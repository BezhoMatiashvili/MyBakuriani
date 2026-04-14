"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  Download,
  Search,
  Send,
  TrendingUp,
  Users2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";

interface AdminKPIs {
  revenue: number;
  revenueChange: number;
  conversionRate: number;
  conversionChange: number;
  activeListings: number;
  listingsChange: number;
  avgResponseTime: number;
  responseChange: number;
}

interface FunnelStep {
  label: string;
  value: number;
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<AdminKPIs>({
    revenue: 0,
    revenueChange: 0,
    conversionRate: 0,
    conversionChange: 0,
    activeListings: 0,
    listingsChange: 0,
    avgResponseTime: 0,
    responseChange: 0,
  });
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [occupancyRate, setOccupancyRate] = useState(0);
  const [avgPriceTrend, setAvgPriceTrend] = useState(0);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      try {
        const [
          { count: activeListings },
          { data: bookingsData },
          { data: profilesData },
          { count: totalProperties },
        ] = await Promise.all([
          supabase
            .from("properties")
            .select("*", { count: "exact", head: true })
            .eq("status", "active"),
          supabase.from("bookings").select("total_price, status"),
          supabase.from("profiles").select("response_time_minutes"),
          supabase
            .from("properties")
            .select("*", { count: "exact", head: true }),
        ]);

        const completedBookings =
          bookingsData?.filter((b) => b.status === "completed") ?? [];
        const totalRevenue = completedBookings.reduce(
          (sum, b) => sum + (b.total_price || 0),
          0,
        );
        const allBookings = bookingsData?.length ?? 0;
        const conversionRate =
          allBookings > 0
            ? Math.round((completedBookings.length / allBookings) * 100)
            : 0;

        const responseTimes =
          profilesData
            ?.map((p) => p.response_time_minutes)
            .filter((t): t is number => t !== null) ?? [];
        const avgResponse =
          responseTimes.length > 0
            ? Math.round(
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
              )
            : 0;

        const bookedCount =
          bookingsData?.filter(
            (b) => b.status === "confirmed" || b.status === "completed",
          ).length ?? 0;
        const occ =
          (totalProperties ?? 0) > 0
            ? Math.round((bookedCount / (totalProperties ?? 1)) * 100)
            : 0;

        setKpis({
          revenue: totalRevenue,
          revenueChange: 12.5,
          conversionRate,
          conversionChange: 3.2,
          activeListings: activeListings ?? 0,
          listingsChange: 8.1,
          avgResponseTime: avgResponse,
          responseChange: -5.3,
        });

        setFunnel([
          { label: "ნახვები", value: 15000 },
          { label: "ძიებები", value: 9000 },
          { label: "მოთხოვნები", value: 3600 },
          {
            label: "დასრულებული",
            value: completedBookings.length,
          },
        ]);

        setOccupancyRate(occ);
        setAvgPriceTrend(185);
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
      change: kpis.revenueChange,
      icon: Banknote,
    },
    {
      label: "ქონების კონვერსია",
      value: `${kpis.conversionRate}%`,
      change: kpis.conversionChange,
      icon: TrendingUp,
    },
    {
      label: "აქტიური განცხადებები",
      value: kpis.activeListings.toLocaleString("en-US"),
      change: kpis.listingsChange,
      icon: Building2,
    },
    {
      label: "პასუხის საშ. დრო",
      value: `${kpis.avgResponseTime} წთ`,
      change: kpis.responseChange,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-7">
      <div className="pt-2">
        <h1 className="text-[48px] font-extrabold tracking-[-0.03em] text-[#0F172A]">
          მთავარი გვერდი
        </h1>
        <p className="mt-1 text-xl font-semibold text-[#64748B]">
          პლატფორმის ოპერატიული მართვა
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-[18px] bg-[#EF2D2D] px-6 py-4 text-white shadow-[0px_8px_20px_rgba(239,45,45,0.25)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-lg font-semibold leading-none">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <span>ყურადღება: 3 ვერიფიკაცია ითხოვს 24 საათზე მეტია</span>
        </div>
        <button
          type="button"
          className="h-11 rounded-xl bg-white px-5 text-sm font-bold text-[#EF2D2D] transition-colors hover:bg-[#F8FAFC]"
        >
          შემოწმება
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[32px] font-extrabold tracking-[-0.02em] text-[#475569]">
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            <div className="mt-2 flex items-end justify-between">
              <p className="text-[39px] font-black leading-none text-[#0F172A]">
                {loading ? "..." : card.value}
              </p>
              <p
                className={`text-xs font-bold ${
                  card.change >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                }`}
              >
                {card.change >= 0 ? "+" : ""}
                {card.change}%
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr,1fr]">
        <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-[0px_6px_18px_rgba(15,23,42,0.05)]">
          <h2 className="mb-4 text-[34px] font-extrabold tracking-[-0.03em] text-[#475569]">
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
                        {step.value.toLocaleString("en-US")}
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

        <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-[0px_6px_18px_rgba(15,23,42,0.05)]">
          <h2 className="mb-5 text-[30px] font-extrabold tracking-[-0.03em] text-[#475569]">
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
                <p className="text-[33px] font-black leading-none text-[#EF4444]">
                  45
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
                <p className="text-sm font-bold text-[#F97316]">12%</p>
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
