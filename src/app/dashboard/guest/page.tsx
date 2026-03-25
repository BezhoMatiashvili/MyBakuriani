"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Search, CalendarDays, Star, ChevronRight } from "lucide-react";
import { useProfile } from "@/lib/hooks/useProfile";
import { useSmartMatch } from "@/lib/hooks/useSmartMatch";
import { useBookings } from "@/lib/hooks/useBookings";
import SmartMatchCard from "@/components/cards/SmartMatchCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function GuestDashboardPage() {
  const { profile, loading: profileLoading } = useProfile();
  const { requests, list: listMatches } = useSmartMatch();
  const { bookings, list: listBookings } = useBookings();

  useEffect(() => {
    listMatches();
    listBookings();
  }, [listMatches, listBookings]);

  const activeMatches = requests.filter(
    (r) => r.status === "pending" || r.status === "matched",
  );
  const recentBookings = bookings.slice(0, 3);

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-foreground">
          გამარჯობა, {profile?.display_name ?? "სტუმარი"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          მოგესალმებით MyBakuriani-ზე
        </p>
      </motion.div>

      {/* Smart Match alerts */}
      <SmartMatchCard
        notificationCount={activeMatches.length}
        onClick={() => {}}
      />

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/apartments">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
              <Search className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                ბინების ძიება
              </p>
              <p className="text-xs text-muted-foreground">
                იპოვე შენთვის სასურველი
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </motion.div>
        </Link>

        <Link href="/dashboard/guest/bookings">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-green-100 text-brand-success">
              <CalendarDays className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                ჩემი ჯავშნები
              </p>
              <p className="text-xs text-muted-foreground">
                {recentBookings.length} აქტიური ჯავშანი
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </motion.div>
        </Link>
      </div>

      {/* Recent bookings */}
      {recentBookings.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              ბოლო ჯავშნები
            </h2>
            <Link
              href="/dashboard/guest/bookings"
              className="text-sm font-medium text-brand-accent hover:underline"
            >
              ყველა
            </Link>
          </div>

          <div className="space-y-3">
            {recentBookings.map((booking, i) => (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    ჯავშანი #{booking.id.slice(0, 8)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(booking.check_in).toLocaleDateString("ka-GE")} –{" "}
                    {new Date(booking.check_out).toLocaleDateString("ka-GE")}
                  </p>
                </div>
                <BookingStatusBadge status={booking.status} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Reviews shortcut */}
      <Link href="/dashboard/guest/reviews">
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="flex items-center gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-brand-warning">
            <Star className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              ჩემი შეფასებები
            </p>
            <p className="text-xs text-muted-foreground">
              დატოვე შეფასება დასრულებულ ჯავშანზე
            </p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </motion.div>
      </Link>
    </div>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    pending: {
      label: "მოლოდინში",
      classes: "bg-amber-100 text-amber-700",
    },
    confirmed: {
      label: "დადასტურებული",
      classes: "bg-green-100 text-green-700",
    },
    cancelled: {
      label: "გაუქმებული",
      classes: "bg-red-100 text-red-700",
    },
    completed: {
      label: "დასრულებული",
      classes: "bg-blue-100 text-blue-700",
    },
  };

  const c = config[status] ?? {
    label: status,
    classes: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.classes}`}
    >
      {c.label}
    </span>
  );
}
