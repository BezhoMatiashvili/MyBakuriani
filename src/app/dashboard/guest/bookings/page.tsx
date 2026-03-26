"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import type { Tables } from "@/lib/types/database";

type BookingWithProperty = Tables<"bookings"> & {
  properties: Pick<
    Tables<"properties">,
    "title" | "location" | "photos"
  > | null;
};

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: "მოლოდინში",
    color: "bg-yellow-100 text-yellow-700",
    icon: Clock,
  },
  confirmed: {
    label: "დადასტურებული",
    color: "bg-green-100 text-green-700",
    icon: CheckCircle,
  },
  cancelled: {
    label: "გაუქმებული",
    color: "bg-red-100 text-red-700",
    icon: XCircle,
  },
  completed: {
    label: "დასრულებული",
    color: "bg-blue-100 text-blue-700",
    icon: CalendarCheck,
  },
};

const filterTabs = [
  { key: "all", label: "ყველა" },
  { key: "pending", label: "მოლოდინში" },
  { key: "confirmed", label: "დადასტურებული" },
  { key: "completed", label: "დასრულებული" },
  { key: "cancelled", label: "გაუქმებული" },
];

export default function GuestBookingsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [bookings, setBookings] = useState<BookingWithProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    if (!user) return;

    async function fetchBookings() {
      const { data } = await supabase
        .from("bookings")
        .select("*, properties(title, location, photos)")
        .eq("guest_id", user!.id)
        .order("created_at", { ascending: false });

      if (data) setBookings(data as BookingWithProperty[]);
      setLoading(false);
    }

    fetchBookings();

    // Realtime booking updates
    const channel = supabase
      .channel("guest-bookings")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `guest_id=eq.${user.id}`,
        },
        () => {
          fetchBookings();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredBookings =
    activeFilter === "all"
      ? bookings
      : bookings.filter((b) => b.status === activeFilter);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-foreground">ჩემი ჯავშნები</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          მართეთ თქვენი ჯავშნები და ნახეთ სტატუსები
        </p>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeFilter === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Bookings list */}
      <div className="space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex gap-4">
                <Skeleton className="h-20 w-20 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))
        ) : filteredBookings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-brand-surface py-16 shadow-[var(--shadow-card)]"
          >
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              ჯავშნები ვერ მოიძებნა
            </p>
          </motion.div>
        ) : (
          filteredBookings.map((booking, index) => {
            const config = statusConfig[booking.status];
            const StatusIcon = config?.icon ?? Clock;

            return (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  {/* Property image */}
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {booking.properties?.photos?.[0] && (
                      <Image
                        src={booking.properties.photos[0]}
                        alt={booking.properties?.title ?? ""}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {booking.properties?.title ?? "ობიექტი"}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {booking.properties?.location}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config?.color ?? ""}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {config?.label ?? booking.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarCheck className="h-3.5 w-3.5" />
                        {booking.check_in} — {booking.check_out}
                      </span>
                      <span>სტუმრები: {booking.guests_count}</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-brand-accent">
                        {booking.total_price} ₾
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(booking.created_at).toLocaleDateString(
                          "ka-GE",
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
