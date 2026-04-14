"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Users,
  Calendar,
  Building2,
  MapPin,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/cards/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils/format";

interface AnalyticsData {
  monthlyRevenue: number[];
  newUsers: number[];
  completionRate: number;
  cancellationRate: number;
  avgBookingValue: number;
  topProperties: { title: string; bookings: number; rating: number | null }[];
  locationDistribution: { location: string; count: number }[];
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
}

const months = [
  "იან",
  "თებ",
  "მარ",
  "აპრ",
  "მაი",
  "ივნ",
  "ივლ",
  "აგვ",
  "სექ",
  "ოქტ",
  "ნოე",
  "დეკ",
];

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"month" | "quarter" | "year">(
    "year",
  );
  const [data, setData] = useState<AnalyticsData>({
    monthlyRevenue: [],
    newUsers: [],
    completionRate: 0,
    cancellationRate: 0,
    avgBookingValue: 0,
    topProperties: [],
    locationDistribution: [],
    totalUsers: 0,
    totalBookings: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      try {
        const [{ data: bookings }, { data: profiles }, { data: properties }] =
          await Promise.all([
            supabase.from("bookings").select("*"),
            supabase.from("profiles").select("id, created_at"),
            supabase
              .from("properties")
              .select("id, title, location, views_count"),
          ]);

        const allBookings = bookings ?? [];
        const completed = allBookings.filter((b) => b.status === "completed");
        const cancelled = allBookings.filter((b) => b.status === "cancelled");
        const totalRevenue = completed.reduce(
          (sum, b) => sum + (b.total_price || 0),
          0,
        );
        const avgValue =
          completed.length > 0
            ? Math.round(totalRevenue / completed.length)
            : 0;

        // Monthly revenue (placeholder distribution)
        const monthlyRev = Array.from({ length: 12 }, (_, i) => {
          const monthBookings = completed.filter((b) => {
            const d = new Date(b.created_at ?? "");
            return d.getMonth() === i;
          });
          return monthBookings.reduce((s, b) => s + (b.total_price || 0), 0);
        });

        // New users per month
        const monthlyUsers = Array.from({ length: 12 }, (_, i) => {
          return (
            profiles?.filter((p) => {
              const d = new Date(p.created_at ?? "");
              return d.getMonth() === i;
            }).length ?? 0
          );
        });

        // Top properties by booking count
        const propBookingCount = new Map<string, number>();
        allBookings.forEach((b) => {
          propBookingCount.set(
            b.property_id,
            (propBookingCount.get(b.property_id) ?? 0) + 1,
          );
        });

        const topProps = (properties ?? [])
          .map((p) => ({
            title: p.title,
            bookings: propBookingCount.get(p.id) ?? 0,
            rating: null as number | null,
          }))
          .sort((a, b) => b.bookings - a.bookings)
          .slice(0, 5);

        // Location distribution
        const locMap = new Map<string, number>();
        properties?.forEach((p) => {
          locMap.set(p.location, (locMap.get(p.location) ?? 0) + 1);
        });
        const locationDist = Array.from(locMap.entries())
          .map(([location, count]) => ({ location, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6);

        setData({
          monthlyRevenue: monthlyRev,
          newUsers: monthlyUsers,
          completionRate:
            allBookings.length > 0
              ? Math.round((completed.length / allBookings.length) * 100)
              : 0,
          cancellationRate:
            allBookings.length > 0
              ? Math.round((cancelled.length / allBookings.length) * 100)
              : 0,
          avgBookingValue: avgValue,
          topProperties: topProps,
          locationDistribution: locationDist,
          totalUsers: profiles?.length ?? 0,
          totalBookings: allBookings.length,
          totalRevenue,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const maxRevenue = Math.max(...data.monthlyRevenue, 1);
  const maxUsers = Math.max(...data.newUsers, 1);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-black leading-[30px] tracking-[-0.5px] text-[#1E293B]">
            ანალიტიკა
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            პლატფორმის დეტალური სტატისტიკა
          </p>
        </div>
        <div className="flex gap-2">
          {/* Date range selector */}
          <div className="flex rounded-lg border border-[#E2E8F0]">
            {(["month", "quarter", "year"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateRange === range
                    ? "bg-brand-accent text-white"
                    : "text-[#94A3B8] hover:bg-[#F8FAFC]"
                } ${range === "month" ? "rounded-l-lg" : range === "year" ? "rounded-r-lg" : ""}`}
              >
                {range === "month"
                  ? "თვე"
                  : range === "quarter"
                    ? "კვარტალი"
                    : "წელი"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            ექსპორტი
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="მთლიანი შემოსავალი"
          value={formatPrice(data.totalRevenue)}
          change={14.2}
          loading={loading}
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="მომხმარებლები"
          value={data.totalUsers}
          change={8.5}
          loading={loading}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="ჯავშნები"
          value={data.totalBookings}
          change={12.1}
          loading={loading}
        />
        <StatCard
          icon={<Building2 className="h-5 w-5" />}
          label="საშუალო ჯავშნის ღირებულება"
          value={formatPrice(data.avgBookingValue)}
          change={3.7}
          loading={loading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">
            ყოველთვიური შემოსავალი
          </h2>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="flex h-48 items-end gap-1.5">
                {data.monthlyRevenue.map((v, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{
                      height: `${Math.max((v / maxRevenue) * 100, 2)}%`,
                    }}
                    transition={{ duration: 0.5, delay: i * 0.04 }}
                    className="flex-1 rounded-t bg-brand-accent/80 hover:bg-brand-accent"
                    title={`${months[i]}: ${formatPrice(v)}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[#94A3B8]">
                {months.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </>
          )}
        </motion.div>

        {/* User growth chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">
            ახალი რეგისტრაციები
          </h2>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="flex h-48 items-end gap-1.5">
                {data.newUsers.map((v, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{
                      height: `${Math.max((v / maxUsers) * 100, 2)}%`,
                    }}
                    transition={{ duration: 0.5, delay: i * 0.04 }}
                    className="flex-1 rounded-t bg-indigo-500/80 hover:bg-indigo-500"
                    title={`${months[i]}: ${v}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[#94A3B8]">
                {months.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Booking metrics */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">
          ჯავშნების მეტრიკები
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {data.completionRate}%
            </p>
            <p className="mt-1 text-sm text-[#94A3B8]">
              დასრულების მაჩვენებელი
            </p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-red-500">
              {data.cancellationRate}%
            </p>
            <p className="mt-1 text-sm text-[#94A3B8]">გაუქმების მაჩვენებელი</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-brand-accent">
              {formatPrice(data.avgBookingValue)}
            </p>
            <p className="mt-1 text-sm text-[#94A3B8]">საშუალო ღირებულება</p>
          </div>
        </div>
      </motion.div>

      {/* Bottom row: Top properties + Geo distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top properties */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">
            ტოპ ქონებები
          </h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data.topProperties.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#94A3B8]">
              მონაცემები არ არის
            </p>
          ) : (
            <div className="space-y-3">
              {data.topProperties.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-[#F8FAFC]/60 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-accent/10 text-xs font-bold text-brand-accent">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-[#1E293B]">
                      {p.title}
                    </span>
                  </div>
                  <span className="text-sm text-[#94A3B8]">
                    {p.bookings} ჯავშანი
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Geographic distribution */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <div className="mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-brand-accent" />
            <h2 className="text-lg font-semibold text-[#1E293B]">
              გეოგრაფიული განაწილება
            </h2>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : data.locationDistribution.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#94A3B8]">
              მონაცემები არ არის
            </p>
          ) : (
            <div className="space-y-3">
              {data.locationDistribution.map((loc) => {
                const maxCount = data.locationDistribution[0]?.count ?? 1;
                return (
                  <div key={loc.location} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#94A3B8]">{loc.location}</span>
                      <span className="font-medium text-[#1E293B]">
                        {loc.count}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#F8FAFC]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(loc.count / maxCount) * 100}%`,
                        }}
                        transition={{ duration: 0.6 }}
                        className="h-full rounded-full bg-brand-accent/70"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
