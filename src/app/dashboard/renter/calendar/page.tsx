"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import {
  CalendarGrid,
  type CalendarDate,
  type DateStatus,
} from "@/components/booking/CalendarGrid";
import { useProperties } from "@/lib/hooks/useProperties";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ka } from "date-fns/locale";
import type { Database } from "@/lib/types/database";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

export default function RenterCalendarPage() {
  const supabase = createClient();
  const {
    properties,
    loading: propsLoading,
    list: listProperties,
  } = useProperties();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null,
  );
  const [calendarDates, setCalendarDates] = useState<CalendarDate[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    listProperties();
  }, [listProperties]);

  // Auto-select first property
  useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  const fetchCalendarData = useCallback(async () => {
    if (!selectedPropertyId) return;

    setLoadingDates(true);
    try {
      const { data: blocks } = await supabase
        .from("calendar_blocks")
        .select("*")
        .eq("property_id", selectedPropertyId);

      if (blocks) {
        const dates: CalendarDate[] = blocks.map((block) => ({
          date: new Date(block.date),
          status: block.status as DateStatus,
        }));
        setCalendarDates(dates);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingDates(false);
    }
  }, [selectedPropertyId, supabase]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const handleDateClick = async (date: Date) => {
    if (!selectedPropertyId) return;

    const dateStr = format(date, "yyyy-MM-dd");
    const existing = calendarDates.find(
      (d) => format(d.date, "yyyy-MM-dd") === dateStr,
    );

    if (!existing || existing.status === "available") {
      // Block the date
      try {
        await supabase.from("calendar_blocks").upsert({
          property_id: selectedPropertyId,
          date: dateStr,
          status: "blocked" as const,
        });
        setCalendarDates((prev) => [
          ...prev.filter((d) => format(d.date, "yyyy-MM-dd") !== dateStr),
          { date, status: "blocked" as DateStatus },
        ]);
      } catch {
        // silently fail
      }
    } else if (existing.status === "blocked") {
      // Unblock the date
      try {
        await supabase
          .from("calendar_blocks")
          .delete()
          .eq("property_id", selectedPropertyId)
          .eq("date", dateStr);
        setCalendarDates((prev) =>
          prev.filter((d) => format(d.date, "yyyy-MM-dd") !== dateStr),
        );
      } catch {
        // silently fail
      }
    }
  };

  const prevMonth = () => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1));
  };

  const secondMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">კალენდარი</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          მართეთ თქვენი ქონების ხელმისაწვდომობა
        </p>
      </div>

      {/* Property selector */}
      {propsLoading ? (
        <Skeleton className="h-10 w-64 rounded-lg" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {properties.map((prop) => (
            <button
              key={prop.id}
              onClick={() => setSelectedPropertyId(prop.id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                selectedPropertyId === prop.id
                  ? "bg-brand-accent text-white"
                  : "bg-brand-surface text-foreground shadow-[var(--shadow-card)] hover:bg-muted",
              )}
            >
              {prop.title}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-green-100" />
          თავისუფალი
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-100" />
          დაკავებული
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-gray-200" />
          დაბლოკილი
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          დააწკაპუნეთ თარიღზე დაბლოკვა/განბლოკვისთვის
        </span>
      </div>

      {/* Calendar navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold capitalize text-foreground">
          {format(currentDate, "LLLL yyyy", { locale: ka })}
          {" – "}
          {format(secondMonth, "LLLL yyyy", { locale: ka })}
        </span>
        <button
          onClick={nextMonth}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Calendar grids */}
      {loadingDates ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-72 rounded-[var(--radius-card)]" />
          <Skeleton className="h-72 rounded-[var(--radius-card)]" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid gap-6 md:grid-cols-2"
        >
          <div className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]">
            <CalendarGrid
              year={currentDate.getFullYear()}
              month={currentDate.getMonth()}
              dates={calendarDates}
              onDateClick={handleDateClick}
            />
          </div>

          {/* Second month (desktop only on mobile shows single) */}
          <div className="hidden rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] md:block">
            <CalendarGrid
              year={secondMonth.getFullYear()}
              month={secondMonth.getMonth()}
              dates={calendarDates}
              onDateClick={handleDateClick}
            />
          </div>
        </motion.div>
      )}

      {/* Booking details panel */}
      {selectedBooking && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
        >
          <h3 className="text-sm font-semibold text-foreground">
            ჯავშნის დეტალები
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {selectedBooking.check_in} — {selectedBooking.check_out}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedBooking.guests_count} სტუმარი •{" "}
            {selectedBooking.total_price} ₾
          </p>
        </motion.div>
      )}
    </div>
  );
}
