"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  TrendingUp,
  Building2,
  Clock,
  ShieldCheck,
  Users,
  List,
  BarChart3,
  Settings,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import StatCard from "@/components/cards/StatCard";
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
  color: string;
}

const quickLinks = [
  {
    href: "/dashboard/admin/verifications",
    icon: ShieldCheck,
    label: "ვერიფიკაციები",
    desc: "მომლოდინე მოთხოვნები",
  },
  {
    href: "/dashboard/admin/clients",
    icon: Users,
    label: "კლიენტები",
    desc: "მომხმარებლების მართვა",
  },
  {
    href: "/dashboard/admin/listings",
    icon: List,
    label: "განცხადებები",
    desc: "ქონება და სერვისები",
  },
  {
    href: "/dashboard/admin/analytics",
    icon: BarChart3,
    label: "ანალიტიკა",
    desc: "დეტალური სტატისტიკა",
  },
  {
    href: "/dashboard/admin/settings",
    icon: Settings,
    label: "პარამეტრები",
    desc: "პლატფორმის კონფიგურაცია",
  },
];

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
        supabase.from("properties").select("*", { count: "exact", head: true }),
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
        { label: "ნახვები", value: 12450, color: "bg-blue-500" },
        { label: "ძიებები", value: 8320, color: "bg-indigo-500" },
        { label: "ჯავშნები", value: allBookings, color: "bg-violet-500" },
        {
          label: "დასრულებული",
          value: completedBookings.length,
          color: "bg-green-500",
        },
      ]);

      setOccupancyRate(occ);
      setAvgPriceTrend(185);

      setLoading(false);
    }

    loadData();
  }, []);

  const maxFunnelValue = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">ადმინ პანელი</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          პლატფორმის მთავარი მართვის პანელი
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="h-5 w-5" />}
          label="წმინდა შემოსავალი"
          value={formatPrice(kpis.revenue)}
          change={kpis.revenueChange}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="კონვერსიის მაჩვენებელი"
          value={`${kpis.conversionRate}%`}
          change={kpis.conversionChange}
          loading={loading}
        />
        <StatCard
          icon={<Building2 className="h-5 w-5" />}
          label="აქტიური განცხადებები"
          value={kpis.activeListings}
          change={kpis.listingsChange}
          loading={loading}
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="საშუალო პასუხის დრო"
          value={`${kpis.avgResponseTime} წთ`}
          change={kpis.responseChange}
          loading={loading}
        />
      </div>

      {/* Funnel + Market Health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sales Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-[var(--shadow-card)]"
        >
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            გაყიდვების ფუნელი
          </h2>
          <div className="space-y-3">
            {funnel.map((step) => (
              <div key={step.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{step.label}</span>
                  <span className="font-medium text-foreground">
                    {step.value.toLocaleString("ka-GE")}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(step.value / maxFunnelValue) * 100}%`,
                    }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`h-full rounded-full ${step.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Market Health */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-[var(--shadow-card)]"
        >
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            ბაზრის ჯანმრთელობა
          </h2>
          <div className="space-y-6">
            {/* Occupancy */}
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  დაკავებულობის მაჩვენებელი
                </span>
                <span className="font-semibold text-foreground">
                  {occupancyRate}%
                </span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${occupancyRate}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full bg-brand-accent"
                />
              </div>
            </div>

            {/* Average price trend */}
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  საშუალო ფასის ტრენდი
                </span>
                <span className="font-semibold text-foreground">
                  {formatPrice(avgPriceTrend)} / ღამე
                </span>
              </div>
              <div className="mt-4 flex h-24 items-end gap-1.5">
                {[65, 72, 68, 80, 85, 78, 90, 88, 95, 92, 100, 98].map(
                  (v, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${v}%` }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                      className="flex-1 rounded-t bg-brand-accent/70"
                    />
                  ),
                )}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>იან</span>
                <span>მარ</span>
                <span>მაი</span>
                <span>ივლ</span>
                <span>სექ</span>
                <span>ნოე</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Quick Links */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          სწრაფი ნავიგაცია
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-brand-accent-light"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent group-hover:bg-brand-accent group-hover:text-white">
                <link.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{link.label}</p>
                <p className="text-xs text-muted-foreground">{link.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
