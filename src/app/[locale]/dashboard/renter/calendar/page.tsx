"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Building } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/types/database";

type CalendarBlock = Tables<"calendar_blocks">;
type Property = Tables<"properties">;

const dayNames = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];

const statusConfig: Record<string, { label: string; color: string }> = {
  available: { label: "თავისუფალი", color: "bg-green-100 text-green-700" },
  booked: { label: "დაკავებული", color: "bg-red-100 text-red-700" },
  blocked: { label: "არჩეული", color: "bg-gray-200 text-gray-700" },
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  // Convert from Sunday=0 to Monday=0
  return day === 0 ? 6 : day - 1;
}

const monthNames = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
];

export default function RenterCalendarPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null,
  );
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    if (!user) return;

    async function fetchProperties() {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .eq("owner_id", user!.id)
        .eq("is_for_sale", false)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        setProperties(data);
        setSelectedPropertyId(data[0].id);
      }
      setLoading(false);
    }

    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedPropertyId) return;

    async function fetchBlocks() {
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${getDaysInMonth(year, month)}`;

      const { data } = await supabase
        .from("calendar_blocks")
        .select("*")
        .eq("property_id", selectedPropertyId!)
        .gte("date", startDate)
        .lte("date", endDate);

      if (data) setCalendarBlocks(data);
    }

    fetchBlocks();

    // Realtime updates
    const channel = supabase
      .channel("calendar-blocks")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_blocks",
          filter: `property_id=eq.${selectedPropertyId}`,
        },
        () => {
          fetchBlocks();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, year, month]);

  const blocksByDate = useMemo(() => {
    const map = new Map<string, CalendarBlock>();
    calendarBlocks.forEach((block) => map.set(block.date, block));
    return map;
  }, [calendarBlocks]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDates(new Set());
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDates(new Set());
  };

  const handleDateClick = (dateStr: string) => {
    if (blocksByDate.get(dateStr)?.status === "booked") return;

    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return next;
    });
  };

  const handleBlockDates = async (status: "available" | "blocked") => {
    if (!selectedPropertyId || selectedDates.size === 0) return;

    setActionError(null);
    setIsSaving(true);

    const selectedDateValues = Array.from(selectedDates);
    const editableDates = selectedDateValues.filter(
      (date) => blocksByDate.get(date)?.status !== "booked",
    );

    if (editableDates.length === 0) {
      setActionError("დაჯავშნილი დღეების ცვლილება შეუძლებელია");
      setIsSaving(false);
      return;
    }

    let error: { message: string } | null = null;

    if (status === "blocked") {
      const upserts = editableDates.map((date) => ({
        property_id: selectedPropertyId,
        date,
        status: "blocked" as const,
      }));

      const { error: upsertError } = await supabase
        .from("calendar_blocks")
        .upsert(upserts, {
          onConflict: "property_id,date",
        });
      error = upsertError;
    } else {
      // "Unblock" means removing manual blocks, so the date becomes normally available.
      const { error: deleteError } = await supabase
        .from("calendar_blocks")
        .delete()
        .eq("property_id", selectedPropertyId)
        .in("date", editableDates)
        .eq("status", "blocked");
      error = deleteError;
    }

    if (error) {
      setActionError("ოპერაცია ვერ შესრულდა, სცადეთ თავიდან");
      setIsSaving(false);
      return;
    }

    setSelectedDates(new Set());
    setIsSaving(false);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          კალენდარი
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          მართეთ ობიექტების ხელმისაწვდომობა
        </p>
      </motion.div>

      {/* Property selector */}
      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {properties.map((property) => (
            <Button
              key={property.id}
              variant={
                selectedPropertyId === property.id ? "default" : "outline"
              }
              size="sm"
              onClick={() => {
                setSelectedPropertyId(property.id);
                setSelectedDates(new Set());
              }}
              className="gap-2"
            >
              <Building className="h-3.5 w-3.5" />
              {property.title}
            </Button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {Object.entries(statusConfig).map(([key, config]) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span
              className={`h-3 w-3 rounded-sm ${config.color.split(" ")[0]}`}
            />
            <span className="text-[#94A3B8]">{config.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-xs">
          <span className="h-3 w-3 rounded-sm bg-brand-accent/30" />
          <span className="text-[#94A3B8]">არჩეული</span>
        </div>
      </div>

      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-6"
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h3 className="text-base font-semibold text-[#1E293B]">
            {monthNames[month]} {year}
          </h3>
          <Button variant="ghost" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="mt-4 grid grid-cols-7 gap-1">
          {dayNames.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-medium text-[#94A3B8]"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for offset */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Date cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const block = blocksByDate.get(dateStr);
            const isSelected = selectedDates.has(dateStr);
            const isToday = new Date().toISOString().startsWith(dateStr);
            const isPast =
              new Date(dateStr) < new Date(new Date().toDateString());

            let bgColor = "bg-white hover:bg-gray-50";
            if (block?.status === "booked") bgColor = "bg-red-100 text-red-700";
            else if (block?.status === "blocked")
              bgColor = "bg-gray-200 text-gray-700";
            else if (block?.status === "available")
              bgColor = "bg-green-100 text-green-700";

            if (isSelected)
              bgColor = "bg-brand-accent/20 ring-2 ring-brand-accent";

            return (
              <button
                key={dateStr}
                onClick={() => !isPast && handleDateClick(dateStr)}
                disabled={isPast}
                className={cn(
                  "flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-colors sm:h-12",
                  bgColor,
                  isPast && "cursor-not-allowed opacity-40",
                  isToday && "ring-1 ring-brand-accent",
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Actions for selected dates */}
      {selectedDates.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-[#1E293B]">
            არჩეულია <span className="font-bold">{selectedDates.size}</span> დღე
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBlockDates("blocked")}
              disabled={isSaving}
            >
              დაბლოკვა
            </Button>
            <Button
              size="sm"
              onClick={() => handleBlockDates("available")}
              disabled={isSaving}
            >
              გახსნა
            </Button>
          </div>
        </motion.div>
      )}
      {actionError && (
        <p className="text-sm font-medium text-red-600">{actionError}</p>
      )}
    </div>
  );
}
