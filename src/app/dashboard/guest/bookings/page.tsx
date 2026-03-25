"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Users, ChevronDown, ChevronUp, X } from "lucide-react";
import { useBookings } from "@/lib/hooks/useBookings";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatDateRange } from "@/lib/utils/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/types/database";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Property = Database["public"]["Tables"]["properties"]["Row"];

type TabKey = "upcoming" | "past" | "cancelled";

const tabs: { key: TabKey; label: string }[] = [
  { key: "upcoming", label: "მომავალი" },
  { key: "past", label: "წარსული" },
  { key: "cancelled", label: "გაუქმებული" },
];

export default function GuestBookingsPage() {
  const { bookings, loading, list } = useBookings();
  const [activeTab, setActiveTab] = useState<TabKey>("upcoming");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [properties, setProperties] = useState<Record<string, Property>>({});

  useEffect(() => {
    list();
  }, [list]);

  // Fetch property details for bookings
  useEffect(() => {
    if (bookings.length === 0) return;

    const propertyIds = [...new Set(bookings.map((b) => b.property_id))];
    const missing = propertyIds.filter((id) => !properties[id]);
    if (missing.length === 0) return;

    const supabase = createClient();
    supabase
      .from("properties")
      .select("*")
      .in("id", missing)
      .then(({ data }) => {
        if (data) {
          setProperties((prev) => {
            const next = { ...prev };
            data.forEach((p) => {
              next[p.id] = p;
            });
            return next;
          });
        }
      });
  }, [bookings, properties]);

  // Set up real-time subscription for booking updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("guest-bookings")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
        },
        () => {
          list();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [list]);

  const filtered = useMemo(() => {
    const now = new Date();
    return bookings.filter((b) => {
      if (activeTab === "cancelled") return b.status === "cancelled";
      if (activeTab === "past")
        return b.status === "completed" || new Date(b.check_out) < now;
      // upcoming
      return (
        (b.status === "pending" || b.status === "confirmed") &&
        new Date(b.check_out) >= now
      );
    });
  }, [bookings, activeTab]);

  if (loading && bookings.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          {tabs.map((t) => (
            <Skeleton key={t.key} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-foreground">ჩემი ჯავშნები</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-brand-accent text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Booking list */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {activeTab === "upcoming" && "მომავალი ჯავშნები არ გაქვთ"}
          {activeTab === "past" && "წარსული ჯავშნები არ გაქვთ"}
          {activeTab === "cancelled" && "გაუქმებული ჯავშნები არ გაქვთ"}
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                property={properties[booking.property_id]}
                expanded={expandedId === booking.id}
                onToggle={() =>
                  setExpandedId(expandedId === booking.id ? null : booking.id)
                }
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function BookingCard({
  booking,
  property,
  expanded,
  onToggle,
}: {
  booking: Booking;
  property?: Property;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { updateStatus } = useBookings();
  const [cancelling, setCancelling] = useState(false);

  const photoUrl = property?.photos?.[0] ?? "/placeholder-property.jpg";

  const statusConfig: Record<string, { label: string; classes: string }> = {
    pending: { label: "მოლოდინში", classes: "bg-amber-100 text-amber-700" },
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

  const sc = statusConfig[booking.status] ?? {
    label: booking.status,
    classes: "bg-gray-100 text-gray-700",
  };

  async function handleCancel() {
    setCancelling(true);
    try {
      await updateStatus(booking.id, "cancelled");
    } catch {
      // error handled in hook
    } finally {
      setCancelling(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="overflow-hidden rounded-[var(--radius-card)] bg-brand-surface shadow-[var(--shadow-card)]"
    >
      {/* Main row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        {/* Property photo */}
        <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={property?.title ?? "ობიექტი"}
            className="size-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {property?.title ?? `ჯავშანი #${booking.id.slice(0, 8)}`}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3" />
            {formatDateRange(booking.check_in, booking.check_out)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${sc.classes}`}
            >
              {sc.label}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {formatPrice(booking.total_price)}
            </span>
          </div>
        </div>

        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-brand-surface-border px-4 pb-4 pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">სტუმრები</p>
                  <p className="flex items-center gap-1 font-medium text-foreground">
                    <Users className="size-3.5" />
                    {booking.guests_count}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ჯამი</p>
                  <p className="font-medium text-foreground">
                    {formatPrice(booking.total_price)}
                  </p>
                </div>
              </div>

              {booking.guest_message && (
                <div>
                  <p className="text-xs text-muted-foreground">
                    თქვენი შეტყობინება
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {booking.guest_message}
                  </p>
                </div>
              )}

              {booking.owner_response && (
                <div>
                  <p className="text-xs text-muted-foreground">
                    მეპატრონის პასუხი
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {booking.owner_response}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {(booking.status === "pending" ||
                  booking.status === "confirmed") && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancelling}
                    onClick={handleCancel}
                    className="gap-1"
                  >
                    <X className="size-3.5" />
                    {cancelling ? "იტვირთება..." : "გაუქმება"}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
