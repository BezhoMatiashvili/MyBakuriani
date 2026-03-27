"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Banknote,
  TrendingUp,
  BarChart3,
  Eye,
  Building,
  ArrowRight,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatCard from "@/components/cards/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

const statusLabels: Record<string, string> = {
  active: "აქტიური",
  blocked: "დაბლოკილი",
  pending: "მოლოდინში",
  draft: "დრაფტი",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  draft: "bg-gray-100 text-gray-700",
};

export default function RenterDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [properties, setProperties] = useState<Tables<"properties">[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [receivable, setReceivable] = useState(0);
  const [occupancy, setOccupancy] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [smartMatchCount, setSmartMatchCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      const [profileRes, propertiesRes, bookingsRes, matchesRes] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", user!.id).single(),
          supabase
            .from("properties")
            .select("*")
            .eq("owner_id", user!.id)
            .order("created_at", { ascending: false }),
          supabase.from("bookings").select("*").eq("owner_id", user!.id),
          supabase
            .from("smart_match_requests")
            .select("*", { count: "exact", head: true })
            .eq("status", "active"),
        ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (propertiesRes.data) {
        setProperties(propertiesRes.data);
        setTotalViews(
          propertiesRes.data.reduce((sum, p) => sum + p.views_count, 0),
        );
      }
      setSmartMatchCount(matchesRes.count ?? 0);

      // Calculate income metrics from bookings
      if (bookingsRes.data) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const completedThisMonth = bookingsRes.data.filter(
          (b) =>
            b.status === "completed" && new Date(b.check_out) >= monthStart,
        );
        const pendingBookings = bookingsRes.data.filter(
          (b) => b.status === "confirmed",
        );

        setMonthlyIncome(
          completedThisMonth.reduce((sum, b) => sum + b.total_price, 0),
        );
        setReceivable(
          pendingBookings.reduce((sum, b) => sum + b.total_price, 0),
        );

        // Calculate occupancy based on confirmed/completed bookings this month
        const totalProps = propertiesRes.data?.length ?? 1;
        const daysInMonth = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
        ).getDate();
        const bookedDays = bookingsRes.data.filter(
          (b) =>
            (b.status === "confirmed" || b.status === "completed") &&
            new Date(b.check_in) <=
              new Date(now.getFullYear(), now.getMonth() + 1, 0) &&
            new Date(b.check_out) >= monthStart,
        ).length;

        setOccupancy(
          totalProps > 0
            ? Math.round((bookedDays / (totalProps * daysInMonth)) * 100)
            : 0,
        );
      }

      setLoading(false);
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-foreground">
          გამარჯობა, {profile?.display_name ?? "მესაკუთრე"}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          თქვენი ობიექტების მართვის პანელი
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="h-5 w-5" />}
          label="თვის შემოსავალი"
          value={formatPrice(Number(monthlyIncome))}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="მისაღები (ვალი)"
          value={formatPrice(Number(receivable))}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="დატვირთულობა"
          value={`${occupancy}%`}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<Eye className="h-5 w-5" />}
          label="პროფილის ნახვები"
          value={totalViews}
          change={null}
          loading={loading}
        />
      </div>

      {/* Quick navigation */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "კალენდარი",
            href: "/dashboard/renter/calendar",
            icon: CalendarDays,
            color: "bg-brand-accent-light text-brand-accent",
          },
          {
            label: "Smart Match",
            href: "/dashboard/renter/smart-match",
            icon: Sparkles,
            count: smartMatchCount,
            color: "bg-purple-100 text-purple-600",
          },
          {
            label: "ობიექტები",
            href: "/dashboard/renter/listings",
            icon: Building,
            count: properties.length,
            color: "bg-green-100 text-green-600",
          },
          {
            label: "ბალანსი",
            href: "/dashboard/renter/balance",
            icon: Banknote,
            color: "bg-orange-100 text-orange-600",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-md"
            >
              <div
                className={`relative flex h-12 w-12 items-center justify-center rounded-full ${item.color}`}
              >
                <Icon className="h-6 w-6" />
                {"count" in item &&
                  item.count !== undefined &&
                  item.count > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-[10px] font-bold text-white">
                      {item.count > 99 ? "99+" : item.count}
                    </span>
                  )}
              </div>
              <span className="text-center text-xs font-medium text-foreground">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Property listing overview */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            ჩემი ობიექტები
          </h2>
          <Link
            href="/dashboard/renter/listings"
            className="flex items-center gap-1 text-sm text-brand-accent hover:underline"
          >
            ყველა
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-3 space-y-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="flex gap-4">
                    <Skeleton className="h-16 w-16 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </div>
              ))
            : properties.slice(0, 5).map((property) => (
                <div
                  key={property.id}
                  className="flex items-center gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {property.photos[0] && (
                      <Image
                        src={property.photos[0]}
                        alt={property.title}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {property.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[property.status] ?? ""}`}
                      >
                        {statusLabels[property.status] ?? property.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {property.views_count} ნახვა
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-brand-accent">
                    {formatPrice(Number(property.price_per_night ?? 0))}
                  </span>
                </div>
              ))}
        </div>
      </motion.section>
    </div>
  );
}
