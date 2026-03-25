"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  TrendingUp,
  BarChart3,
  Eye,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import StatCard from "@/components/cards/StatCard";
import SmartMatchCard from "@/components/cards/SmartMatchCard";
import StatusBadge from "@/components/shared/StatusBadge";
import VIPBadge from "@/components/shared/VIPBadge";
import { useProperties } from "@/lib/hooks/useProperties";
import { useBookings } from "@/lib/hooks/useBookings";
import { useProfile } from "@/lib/hooks/useProfile";
import { useBalance } from "@/lib/hooks/useBalance";
import { formatPrice, formatDateRange } from "@/lib/utils/format";
import { staggerChildren, slideUp } from "@/lib/utils/animations";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";

export default function RenterDashboardPage() {
  const router = useRouter();
  const {
    properties,
    loading: propsLoading,
    list: listProperties,
  } = useProperties();
  const {
    bookings,
    loading: bookingsLoading,
    list: listBookings,
  } = useBookings();
  const { profile, loading: profileLoading } = useProfile();
  const { balance, loading: balanceLoading } = useBalance();

  const [smartMatchCount, setSmartMatchCount] = useState(0);

  useEffect(() => {
    listProperties({ status: "active" });
    listBookings();
    // Simulated smart match count — in production, fetch from supabase
    setSmartMatchCount(3);
  }, [listProperties, listBookings]);

  const loading =
    propsLoading || bookingsLoading || profileLoading || balanceLoading;

  // Compute stats
  const monthlyIncome = bookings
    .filter((b) => b.status === "confirmed" || b.status === "completed")
    .reduce((sum, b) => sum + b.total_price, 0);

  const pendingIncome = bookings
    .filter((b) => b.status === "pending")
    .reduce((sum, b) => sum + b.total_price, 0);

  const totalCapacity = properties.length * 30; // approximate monthly capacity
  const bookedDays = bookings.filter(
    (b) => b.status === "confirmed" || b.status === "completed",
  ).length;
  const occupancy =
    totalCapacity > 0 ? Math.round((bookedDays / totalCapacity) * 100) : 0;

  const totalViews = properties.reduce((sum, p) => sum + p.views_count, 0);

  const recentBookings = bookings.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          გამარჯობა, {profile?.display_name ?? "გამქირავებელი"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          თქვენი ქირავნობის პანელი
        </p>
      </div>

      {/* Stat cards row */}
      <motion.div
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <motion.div variants={slideUp}>
          <StatCard
            icon={<Banknote className="h-5 w-5" />}
            label="თვის შემოსავალი"
            value={formatPrice(monthlyIncome)}
            change={12}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={slideUp}>
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="მისაღები / ვალი"
            value={formatPrice(pendingIncome)}
            change={null}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={slideUp}>
          <StatCard
            icon={<BarChart3 className="h-5 w-5" />}
            label="დატვირთულობა"
            value={`${occupancy}%`}
            change={5}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={slideUp}>
          <StatCard
            icon={<Eye className="h-5 w-5" />}
            label="პროფილის ნახვები"
            value={totalViews.toLocaleString()}
            change={8}
            loading={loading}
          />
        </motion.div>
      </motion.div>

      {/* Smart Match + Subscription row */}
      <div className="grid gap-4 md:grid-cols-2">
        <SmartMatchCard
          notificationCount={smartMatchCount}
          onClick={() => router.push("/dashboard/renter/smart-match")}
        />

        {/* Subscription status */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">გამოწერის სტატუსი</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {balance && balance.amount > 0 ? "აქტიური" : "უფასო"}
              </p>
            </div>
            <Link
              href="/dashboard/renter/balance"
              className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-hover"
            >
              შევსება
            </Link>
          </div>
          {balance && (
            <p className="mt-2 text-sm text-muted-foreground">
              ბალანსი: {formatPrice(balance.amount)} | SMS:{" "}
              {balance.sms_remaining}
            </p>
          )}
        </motion.div>
      </div>

      {/* My Properties */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">ჩემი ქონება</h2>
          <Link
            href="/dashboard/renter/listings"
            className="flex items-center gap-1 text-sm font-medium text-brand-accent hover:text-brand-accent-hover"
          >
            ყველა <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {propsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-brand-surface p-8 text-center shadow-[var(--shadow-card)]">
            <p className="text-muted-foreground">ქონება ჯერ არ დამატებულა</p>
            <Link
              href="/create/property"
              className="mt-3 inline-block rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white hover:bg-brand-accent-hover"
            >
              ქონების დამატება
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.slice(0, 6).map((prop) => (
              <motion.div
                key={prop.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-[var(--radius-card)] bg-brand-surface shadow-[var(--shadow-card)]"
              >
                <Link href={`/dashboard/renter/listings`}>
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Image
                      src={prop.photos[0] ?? "/placeholder-property.jpg"}
                      alt={prop.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover"
                    />
                    <div className="absolute top-2 right-2 flex gap-1.5">
                      {prop.is_super_vip && <VIPBadge level="super_vip" />}
                      {prop.is_vip && !prop.is_super_vip && (
                        <VIPBadge level="vip" />
                      )}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {prop.title}
                      </h3>
                      <StatusBadge
                        status={prop.status as "active" | "blocked" | "pending"}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {prop.price_per_night
                          ? formatPrice(prop.price_per_night) + " / ღამე"
                          : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {prop.views_count}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Bookings */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">ბოლო ჯავშნები</h2>
          <Link
            href="/dashboard/renter/calendar"
            className="flex items-center gap-1 text-sm font-medium text-brand-accent hover:text-brand-accent-hover"
          >
            კალენდარი <CalendarDays className="h-4 w-4" />
          </Link>
        </div>

        {bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : recentBookings.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-brand-surface p-6 text-center shadow-[var(--shadow-card)]">
            <p className="text-muted-foreground">ჯავშნები ჯერ არ არის</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentBookings.map((booking) => (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {formatDateRange(booking.check_in, booking.check_out)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {booking.guests_count} სტუმარი
                  </p>
                </div>
                <div className="ml-4 flex items-center gap-3">
                  <span className="text-sm font-bold text-foreground">
                    {formatPrice(booking.total_price)}
                  </span>
                  <StatusBadge
                    status={
                      booking.status === "confirmed"
                        ? "active"
                        : booking.status === "cancelled"
                          ? "blocked"
                          : "pending"
                    }
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
