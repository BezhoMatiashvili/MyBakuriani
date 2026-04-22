"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import AddBookingModal from "@/components/renter/AddBookingModal";
import type { Tables } from "@/lib/types/database";

type CalendarBlock = Tables<"calendar_blocks">;
type Property = Tables<"properties">;

const DAY_NAMES = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];
const WEEKEND_INDICES = [4, 5, 6]; // პარ, შაბ, კვი — weekend in the Figma ref

const MONTH_NAMES = [
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

interface DayMeta {
  date: string;
  day: number;
  inMonth: boolean;
  weekendIndex: number; // 0-6 (mon..sun)
  status: "free" | "booked" | "manual";
  price?: number;
  guestLabel?: string;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDate(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function RenterCalendarPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null,
  );
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [addBookingInitial, setAddBookingInitial] = useState<{
    checkIn: string;
    checkOut: string;
  }>({ checkIn: "", checkOut: "" });

  const propertyDropdownRef = useRef<HTMLDivElement>(null);

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
      const startDate = `${year}-${pad(month + 1)}-01`;
      const endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`;

      const { data } = await supabase
        .from("calendar_blocks")
        .select("*")
        .eq("property_id", selectedPropertyId!)
        .gte("date", startDate)
        .lte("date", endDate);

      if (data) setCalendarBlocks(data);
    }

    fetchBlocks();

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
        () => fetchBlocks(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, year, month]);

  // Close property dropdown on outside click
  useEffect(() => {
    if (!propertyOpen) return;
    function handle(e: MouseEvent) {
      if (
        propertyDropdownRef.current &&
        !propertyDropdownRef.current.contains(e.target as Node)
      ) {
        setPropertyOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [propertyOpen]);

  const blocksByDate = useMemo(() => {
    const map = new Map<string, CalendarBlock>();
    calendarBlocks.forEach((b) => map.set(b.date, b));
    return map;
  }, [calendarBlocks]);

  const days: DayMeta[] = useMemo(() => {
    const offset = getFirstDayOfMonth(year, month);
    const daysInMonth = getDaysInMonth(year, month);
    const prevMonthDays = getDaysInMonth(year, month - 1);
    const total = 42; // 6 rows * 7 cols

    const list: DayMeta[] = [];
    for (let i = 0; i < total; i += 1) {
      const weekendIndex = i % 7;
      if (i < offset) {
        const d = prevMonthDays - offset + i + 1;
        const prev = new Date(year, month - 1, d);
        list.push({
          date: fmtDate(prev.getFullYear(), prev.getMonth(), d),
          day: d,
          inMonth: false,
          weekendIndex,
          status: "free",
        });
      } else if (i - offset < daysInMonth) {
        const d = i - offset + 1;
        const dateStr = fmtDate(year, month, d);
        const block = blocksByDate.get(dateStr);
        let status: DayMeta["status"] = "free";
        if (block?.status === "booked") status = "booked";
        else if (block?.status === "blocked") status = "manual";
        list.push({
          date: dateStr,
          day: d,
          inMonth: true,
          weekendIndex,
          status,
          price: 120,
        });
      } else {
        const d = i - offset - daysInMonth + 1;
        const next = new Date(year, month + 1, d);
        list.push({
          date: fmtDate(next.getFullYear(), next.getMonth(), d),
          day: d,
          inMonth: false,
          weekendIndex,
          status: "free",
        });
      }
    }
    return list;
  }, [year, month, blocksByDate]);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Property dropdown */}
        <div ref={propertyDropdownRef} className="relative min-w-0">
          {loading ? (
            <Skeleton className="h-9 w-64" />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPropertyOpen((v) => !v)}
                className="inline-flex items-center gap-2 text-[20px] font-black text-[#0F172A] hover:text-[#2563EB]"
              >
                <span className="truncate">
                  {selectedProperty?.title ?? "—"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-[#64748B] transition-transform",
                    propertyOpen && "rotate-180 text-[#2563EB]",
                  )}
                />
              </button>
              <AnimatePresence>
                {propertyOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-[calc(100%+8px)] z-30 min-w-[280px] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white py-2 shadow-[0px_16px_40px_-12px_rgba(15,23,42,0.18)]"
                  >
                    {properties.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPropertyId(p.id);
                          setPropertyOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
                      >
                        <span className="flex-1 truncate">{p.title}</span>
                        {p.id === selectedPropertyId && (
                          <Check className="h-4 w-4 text-[#2563EB]" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <LegendItem
              swatch={
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#16A34A] bg-white">
                  <Check
                    className="h-2.5 w-2.5 text-[#16A34A]"
                    strokeWidth={3}
                  />
                </span>
              }
              label="თავისუფალი"
            />
            <LegendItem
              swatch={
                <span className="h-3.5 w-3.5 rounded-[3px] bg-[#FEE2E2]" />
              }
              label="დაკავშინილი"
            />
            <LegendItem
              swatch={
                <span className="h-3.5 w-3.5 rounded-[3px] bg-[#FEF3C7]" />
              }
              label="ხელით დამატებული"
            />
          </div>
        </div>

        {/* Right side: month nav + add */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-xl border border-[#E2E8F0] bg-white px-2 py-1 shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 text-[13px] font-black text-[#0F172A]">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setAddBookingInitial({ checkIn: "", checkOut: "" });
              setAddBookingOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2.5 text-[13px] font-black text-white shadow-[0_1px_2px_rgba(34,197,94,0.3)] transition-colors hover:bg-[#16A34A]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            დამატება
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-[#EEF1F4]">
        {DAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={cn(
              "py-3 text-center text-[11px] font-bold uppercase tracking-wide",
              WEEKEND_INDICES.includes(i) ? "text-[#EF4444]" : "text-[#94A3B8]",
            )}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-7 overflow-hidden rounded-[8px] border border-[#EEF1F4]"
      >
        {days.map((d, i) => (
          <DayCell
            key={`${d.date}-${i}`}
            meta={d}
            isBottomRow={i >= 35}
            isRightCol={d.weekendIndex === 6}
            onClick={() => {
              if (!d.inMonth) return;
              setAddBookingInitial({ checkIn: d.date, checkOut: "" });
              setAddBookingOpen(true);
            }}
          />
        ))}
      </motion.div>

      <AddBookingModal
        isOpen={addBookingOpen}
        onClose={() => setAddBookingOpen(false)}
        initialCheckIn={addBookingInitial.checkIn}
        initialCheckOut={addBookingInitial.checkOut}
      />
    </div>
  );
}

function LegendItem({
  swatch,
  label,
}: {
  swatch: React.ReactNode;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#64748B]">
      {swatch}
      {label}
    </span>
  );
}

function DayCell({
  meta,
  isBottomRow,
  isRightCol,
  onClick,
}: {
  meta: DayMeta;
  isBottomRow: boolean;
  isRightCol: boolean;
  onClick: () => void;
}) {
  const isWeekend = WEEKEND_INDICES.includes(meta.weekendIndex);

  let bg = "bg-white";
  let numberColor = isWeekend ? "text-[#EF4444]" : "text-[#0F172A]";
  let accentBorder: string | null = null;

  if (!meta.inMonth) {
    bg = "bg-white";
    numberColor = "text-[#CBD5E1]";
  } else if (meta.status === "booked") {
    bg = "bg-[#FEE2E2]";
    numberColor = "text-[#B91C1C]";
    accentBorder = "before:bg-[#EF4444]";
  } else if (meta.status === "manual") {
    bg = "bg-[#FEF3C7]";
    numberColor = "text-[#D97706]";
    accentBorder = "before:bg-[#F59E0B]";
  } else if (isWeekend) {
    bg = "bg-[#FEF2F2]";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!meta.inMonth}
      className={cn(
        "relative flex h-[110px] flex-col items-start justify-between border-b border-r border-[#EEF1F4] px-3 py-2.5 text-left transition-colors",
        bg,
        isBottomRow && "border-b-0",
        isRightCol && "border-r-0",
        meta.inMonth ? "hover:bg-opacity-80" : "cursor-default",
        accentBorder &&
          `before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full ${accentBorder}`,
      )}
    >
      <span className={cn("text-[13px] font-black", numberColor)}>
        {meta.day}
      </span>
      <div className="flex w-full items-end justify-between">
        {meta.status === "manual" && meta.guestLabel && (
          <span className="text-[10px] font-bold text-[#D97706]">
            {meta.guestLabel}
          </span>
        )}
        {meta.inMonth && meta.status === "free" && meta.price != null && (
          <span className="ml-auto text-[10px] font-semibold text-[#94A3B8]">
            {meta.price}₾
          </span>
        )}
      </div>
    </button>
  );
}
