"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  CalendarRange,
  X,
  RotateCcw,
  Lock,
  Unlock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import AddBookingModal from "@/components/renter/AddBookingModal";
import PriceRangeModal from "@/components/renter/PriceRangeModal";
import BulkActionBar, {
  BulkApplyChanges,
} from "@/components/calendar/BulkActionBar";
import type { Tables } from "@/lib/types/database";

type CalendarBlock = Tables<"calendar_blocks">;
type Property = Tables<"properties">;
type PriceOverrideRow = Tables<"price_overrides">;

const DAY_NAMES = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];
const WEEKEND_INDICES = [4, 5, 6];

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
  weekendIndex: number;
  status: "free" | "booked" | "manual";
  price?: number;
  hasOverride: boolean;
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

function dateStrCompare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function datesInRange(a: string, b: string): string[] {
  const [from, to] = dateStrCompare(a, b) <= 0 ? [a, b] : [b, a];
  const out: string[] = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const d = cur.getDate();
    out.push(fmtDate(y, m, d));
    cur.setDate(d + 1);
  }
  return out;
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
  const [priceOverrides, setPriceOverrides] = useState<PriceOverrideRow[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [addBookingInitial, setAddBookingInitial] = useState<{
    checkIn: string;
    checkOut: string;
  }>({ checkIn: "", checkOut: "" });
  const [rangeModalOpen, setRangeModalOpen] = useState(false);

  // Multi-day selection — non-contiguous committed set + transient drag preview
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [dragHover, setDragHover] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMoved, setDragMoved] = useState(false);
  const suppressClickRef = useRef(false);
  const [priceInput, setPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingBlocks, setSavingBlocks] = useState(false);

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
      .channel(`calendar-blocks-${selectedPropertyId}`)
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

  const fetchOverrides = useCallback(async () => {
    if (!selectedPropertyId) return;
    const startDate = `${year}-${pad(month + 1)}-01`;
    const endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`;
    const { data } = await supabase
      .from("price_overrides")
      .select("*")
      .eq("property_id", selectedPropertyId)
      .gte("date", startDate)
      .lte("date", endDate);
    if (data) setPriceOverrides(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, year, month]);

  useEffect(() => {
    fetchOverrides();
    if (!selectedPropertyId) return;
    const channel = supabase
      .channel(`price-overrides-${selectedPropertyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "price_overrides",
          filter: `property_id=eq.${selectedPropertyId}`,
        },
        () => fetchOverrides(),
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

  const overridesByDate = useMemo(() => {
    const map = new Map<string, number>();
    priceOverrides.forEach((o) => map.set(o.date, Number(o.price)));
    return map;
  }, [priceOverrides]);

  // Commit drag on mouseup/touchend anywhere. A drag (cursor moved between cells)
  // adds the whole range to `selectedSet` and suppresses the trailing click; a
  // pure click without movement falls through to `handleCellClick` for toggling.
  useEffect(() => {
    if (!isDragging) return;
    const handler = () => {
      if (dragAnchor && dragMoved) {
        const range = datesInRange(dragAnchor, dragHover ?? dragAnchor);
        setSelectedSet((prev) => {
          const next = new Set(prev);
          for (const d of range) {
            const b = blocksByDate.get(d);
            if (b?.status === "booked") continue;
            next.add(d);
          }
          return next;
        });
        suppressClickRef.current = true;
      }
      setIsDragging(false);
      setDragAnchor(null);
      setDragHover(null);
      setDragMoved(false);
    };
    document.addEventListener("mouseup", handler);
    document.addEventListener("touchend", handler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("touchend", handler);
    };
  }, [isDragging, dragAnchor, dragHover, dragMoved, blocksByDate]);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const basePrice = selectedProperty?.price_per_night ?? 0;

  const days: DayMeta[] = useMemo(() => {
    const offset = getFirstDayOfMonth(year, month);
    const daysInMonth = getDaysInMonth(year, month);
    const prevMonthDays = getDaysInMonth(year, month - 1);
    const total = 42;

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
          hasOverride: false,
        });
      } else if (i - offset < daysInMonth) {
        const d = i - offset + 1;
        const dateStr = fmtDate(year, month, d);
        const block = blocksByDate.get(dateStr);
        let status: DayMeta["status"] = "free";
        if (block?.status === "booked") status = "booked";
        else if (block?.status === "blocked") status = "manual";
        const override = overridesByDate.get(dateStr);
        list.push({
          date: dateStr,
          day: d,
          inMonth: true,
          weekendIndex,
          status,
          price: override ?? basePrice,
          hasOverride: override != null,
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
          hasOverride: false,
        });
      }
    }
    return list;
  }, [year, month, blocksByDate, overridesByDate, basePrice]);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // ── Selection helpers ────────────────────────────────────────────────

  // Live preview of the in-flight drag range (inclusive, no booked/blocked filter yet).
  const dragRange = useMemo<string[]>(() => {
    if (!isDragging || !dragAnchor) return [];
    return datesInRange(dragAnchor, dragHover ?? dragAnchor);
  }, [isDragging, dragAnchor, dragHover]);

  // What the calendar should render as "selected": committed set ∪ drag preview.
  const displaySet = useMemo(() => {
    if (dragRange.length === 0) return selectedSet;
    const merged = new Set(selectedSet);
    for (const d of dragRange) merged.add(d);
    return merged;
  }, [selectedSet, dragRange]);

  // Free days in the selection — price actions operate on these.
  const freeSelected = useMemo(
    () =>
      Array.from(displaySet).filter((dateStr) => {
        const b = blocksByDate.get(dateStr);
        return b?.status !== "booked" && b?.status !== "blocked";
      }),
    [displaySet, blocksByDate],
  );

  // Already-blocked days in the selection — "turn on" operates on these.
  const blockedSelected = useMemo(
    () =>
      Array.from(displaySet).filter(
        (dateStr) => blocksByDate.get(dateStr)?.status === "blocked",
      ),
    [displaySet, blocksByDate],
  );

  const hasActionable = freeSelected.length + blockedSelected.length > 0;

  const avgCurrentPrice = useMemo(() => {
    if (freeSelected.length === 0) return basePrice;
    const sum = freeSelected.reduce(
      (acc, d) => acc + (overridesByDate.get(d) ?? basePrice),
      0,
    );
    return Math.round(sum / freeSelected.length);
  }, [freeSelected, overridesByDate, basePrice]);

  const clearSelection = () => {
    setSelectedSet(new Set());
    setDragAnchor(null);
    setDragHover(null);
    setIsDragging(false);
    setDragMoved(false);
    suppressClickRef.current = false;
    setPriceInput("");
  };

  const handleCellMouseDown = (dateStr: string, status: DayMeta["status"]) => {
    if (status === "booked") return;
    // Reset any stale suppress flag from a drag that ended outside the grid.
    suppressClickRef.current = false;
    setIsDragging(true);
    setDragAnchor(dateStr);
    setDragHover(dateStr);
    setDragMoved(false);
  };

  const handleCellMouseEnter = (dateStr: string) => {
    if (!isDragging || !dragAnchor) return;
    if (dateStr !== dragAnchor) setDragMoved(true);
    setDragHover(dateStr);
  };

  const handleCellClick = (dateStr: string, status: DayMeta["status"]) => {
    // A real drag already committed via mouseup; swallow the trailing click.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (status === "booked") return;
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const applyPrice = async () => {
    if (!selectedPropertyId || freeSelected.length === 0) return;
    const value = Number(priceInput);
    if (!Number.isFinite(value) || value < 0) return;
    setSavingPrice(true);
    const rows = freeSelected.map((d) => ({
      property_id: selectedPropertyId,
      date: d,
      price: value,
    }));
    const { error } = await supabase
      .from("price_overrides")
      .upsert(rows, { onConflict: "property_id,date" });
    setSavingPrice(false);
    if (!error) {
      await fetchOverrides();
      clearSelection();
    }
  };

  const resetToDefault = async () => {
    if (!selectedPropertyId || freeSelected.length === 0) return;
    setSavingPrice(true);
    const { error } = await supabase
      .from("price_overrides")
      .delete()
      .eq("property_id", selectedPropertyId)
      .in("date", freeSelected);
    setSavingPrice(false);
    if (!error) {
      await fetchOverrides();
      clearSelection();
    }
  };

  // Mark the selected free days as blocked so guests can't book them.
  // Booked days are filtered out by `freeSelected` so they can never be touched.
  const turnOffDays = async () => {
    if (!selectedPropertyId || freeSelected.length === 0) return;
    setSavingBlocks(true);
    const rows = freeSelected.map((d) => ({
      property_id: selectedPropertyId,
      date: d,
      status: "blocked" as const,
      booking_id: null,
    }));
    const { error } = await supabase
      .from("calendar_blocks")
      .upsert(rows, { onConflict: "property_id,date" });
    setSavingBlocks(false);
    if (!error) clearSelection();
  };

  // Clear an owner-set block. The extra status='blocked' guard prevents
  // ever deleting a booking-derived row if state shifts mid-flight.
  const turnOnDays = async () => {
    if (!selectedPropertyId || blockedSelected.length === 0) return;
    setSavingBlocks(true);
    const { error } = await supabase
      .from("calendar_blocks")
      .delete()
      .eq("property_id", selectedPropertyId)
      .eq("status", "blocked")
      .in("date", blockedSelected);
    setSavingBlocks(false);
    if (!error) clearSelection();
  };

  // Dates of the currently visible month, restricted to today or later — past
  // days can never be re-blocked, and the bulk bar shouldn't act on them.
  const visibleMonthDates = useMemo(() => {
    const todayIso = (() => {
      const t = new Date();
      return fmtDate(t.getFullYear(), t.getMonth(), t.getDate());
    })();
    const days = getDaysInMonth(year, month);
    const out: string[] = [];
    for (let d = 1; d <= days; d++) {
      const iso = fmtDate(year, month, d);
      if (iso >= todayIso) out.push(iso);
    }
    return out;
  }, [year, month]);

  const bookedDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of calendarBlocks) {
      if (b.status === "booked") s.add(b.date);
    }
    return s;
  }, [calendarBlocks]);

  // Persist a manually-added booking: one row in manual_bookings, then block the
  // inclusive check-in → (check-out − 1) nights in calendar_blocks so the grid reflects it.
  const handleAddBooking = async (payload: {
    checkIn: string;
    checkOut: string;
    source: string;
    guestName: string;
    status: "booked" | "manual";
    clientList: string;
  }) => {
    if (!selectedPropertyId || !user) return;
    if (!payload.checkIn || !payload.checkOut) return;
    try {
      const { data: booking, error: insertError } = await supabase
        .from("manual_bookings")
        .insert({
          owner_id: user.id,
          property_id: selectedPropertyId,
          check_in: payload.checkIn,
          check_out: payload.checkOut,
          source: payload.source,
          guest_name: payload.guestName,
          status: payload.status === "booked" ? "booked" : "manual",
          client_list: payload.clientList,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      // Nights span check-in up to (but excluding) check-out.
      const nights = datesInRange(payload.checkIn, payload.checkOut).filter(
        (d) => d !== payload.checkOut,
      );
      if (nights.length > 0) {
        const rows = nights.map((d) => ({
          property_id: selectedPropertyId,
          date: d,
          status: "booked" as const,
          booking_id: booking.id,
        }));
        const { error: blockError } = await supabase
          .from("calendar_blocks")
          .upsert(rows, { onConflict: "property_id,date" });
        if (blockError) throw blockError;
      }

      const startDate = `${year}-${pad(month + 1)}-01`;
      const endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`;
      const { data } = await supabase
        .from("calendar_blocks")
        .select("*")
        .eq("property_id", selectedPropertyId)
        .gte("date", startDate)
        .lte("date", endDate);
      if (data) setCalendarBlocks(data);
    } catch (err) {
      console.error("Failed to add manual booking", err);
    }
  };

  const handleBulkApply = async ({ available, blocked }: BulkApplyChanges) => {
    if (!selectedPropertyId) return;
    setSavingBlocks(true);
    try {
      if (available.length > 0) {
        await supabase
          .from("calendar_blocks")
          .delete()
          .eq("property_id", selectedPropertyId)
          .eq("status", "blocked")
          .in("date", available);
      }
      if (blocked.length > 0) {
        const rows = blocked.map((d) => ({
          property_id: selectedPropertyId,
          date: d,
          status: "blocked" as const,
          booking_id: null,
        }));
        await supabase
          .from("calendar_blocks")
          .upsert(rows, { onConflict: "property_id,date" });
      }
      clearSelection();
    } finally {
      setSavingBlocks(false);
    }
  };

  return (
    <div className="space-y-5 pb-32 md:pb-5">
      {/* Header row */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
                          clearSelection();
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
              label="გათიშული"
            />
            <LegendItem
              swatch={
                <span className="h-3.5 w-3.5 rounded-full bg-[#F97316]" />
              }
              label="ფასი შეცვლილია"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
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
            disabled={!selectedPropertyId}
            onClick={() => setRangeModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#F97316] bg-white px-4 py-2.5 text-[13px] font-black text-[#F97316] transition-colors hover:bg-[#FFF7ED] disabled:opacity-50"
          >
            <CalendarRange className="h-4 w-4" strokeWidth={2.4} />
            დიაპაზონი
          </button>

          <button
            type="button"
            disabled={!selectedPropertyId}
            onClick={() => {
              setAddBookingInitial({ checkIn: "", checkOut: "" });
              setAddBookingOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2.5 text-[13px] font-black text-white shadow-[0_1px_2px_rgba(34,197,94,0.3)] transition-colors hover:bg-[#16A34A] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            დამატება
          </button>
        </div>
      </div>

      {/* Bulk-action bar — wired to the currently visible month (today-onwards only) */}
      {selectedPropertyId && visibleMonthDates.length > 0 && (
        <BulkActionBar
          windowDates={visibleMonthDates}
          skipDates={bookedDateSet}
          onApply={handleBulkApply}
        />
      )}

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
        className="grid grid-cols-7 overflow-hidden rounded-[8px] border border-[#EEF1F4] select-none"
        onMouseLeave={() => {
          // Keep selection but stop drag tracking when user leaves the grid
        }}
      >
        {days.map((d, i) => (
          <DayCell
            key={`${d.date}-${i}`}
            meta={d}
            isBottomRow={i >= 35}
            isRightCol={d.weekendIndex === 6}
            isSelected={displaySet.has(d.date) && d.inMonth}
            onMouseDown={() => handleCellMouseDown(d.date, d.status)}
            onMouseEnter={() => handleCellMouseEnter(d.date)}
            onClick={() => {
              if (!d.inMonth) return;
              handleCellClick(d.date, d.status);
            }}
            onDoubleClick={() => {
              if (!d.inMonth) return;
              clearSelection();
              setAddBookingInitial({ checkIn: d.date, checkOut: "" });
              setAddBookingOpen(true);
            }}
          />
        ))}
      </motion.div>

      <p className="text-[11px] text-[#94A3B8] md:text-[12px]">
        💡 აირჩიეთ დღეები დაკლიკით (შეიძლება არამიმდევრობით) ან გადაიტანეთ მაუსი
        დიაპაზონისთვის. გათიშეთ დღეები, რომ სტუმრებმა ვერ დაჯავშნონ. ჯავშნის
        დასამატებლად — ორმაგი დაკლიკება.
      </p>

      {/* Selection action bar */}
      <AnimatePresence>
        {hasActionable && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E2E8F0] bg-white px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)] md:sticky md:bottom-3 md:rounded-2xl md:border md:px-5 md:py-4"
          >
            <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
                  aria-label="გაუქმება"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="text-[13px]">
                  <div className="font-black text-[#0F172A]">
                    {freeSelected.length > 0 && blockedSelected.length > 0
                      ? `${freeSelected.length} თავისუფალი • ${blockedSelected.length} გათიშული`
                      : freeSelected.length > 0
                        ? `${freeSelected.length} დღე არჩეული`
                        : `${blockedSelected.length} გათიშული არჩეული`}
                  </div>
                  {freeSelected.length > 0 && (
                    <div className="text-[11px] font-semibold text-[#64748B]">
                      საშუალო ფასი: {avgCurrentPrice}₾
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-wrap items-center gap-2 md:justify-end">
                {blockedSelected.length > 0 && (
                  <button
                    type="button"
                    disabled={savingBlocks}
                    onClick={turnOnDays}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#16A34A] bg-white px-4 text-[13px] font-black text-[#16A34A] transition-colors hover:bg-[#F0FDF4] disabled:opacity-50"
                  >
                    <Unlock className="h-4 w-4" strokeWidth={2.4} />
                    ჩართვა ({blockedSelected.length})
                  </button>
                )}
                {freeSelected.length > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={savingBlocks}
                      onClick={turnOffDays}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#D97706] px-4 text-[13px] font-black text-white shadow-[0_1px_2px_rgba(217,119,6,0.3)] transition-colors hover:bg-[#B45309] disabled:opacity-50"
                    >
                      <Lock className="h-4 w-4" strokeWidth={2.4} />
                      გათიშვა ({freeSelected.length})
                    </button>
                    <div className="relative flex-1 md:max-w-[180px]">
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        placeholder="ახალი ფასი"
                        className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pl-3 pr-8 text-[14px] font-semibold text-[#0F172A] outline-none focus:border-[#F97316]"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[#94A3B8]">
                        ₾
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={
                        savingPrice ||
                        !priceInput ||
                        Number(priceInput) < 0 ||
                        !Number.isFinite(Number(priceInput))
                      }
                      onClick={applyPrice}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#F97316] px-4 text-[13px] font-black text-white transition-colors hover:bg-[#EA580C] disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                      გადატარება
                    </button>
                    <button
                      type="button"
                      disabled={savingPrice}
                      onClick={resetToDefault}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#F1F5F9] disabled:opacity-50"
                      title="ფასი ნაგულისხმევზე დაბრუნება"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      ნაგულისხმევზე
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddBookingModal
        isOpen={addBookingOpen}
        onClose={() => setAddBookingOpen(false)}
        onSubmit={handleAddBooking}
        initialCheckIn={addBookingInitial.checkIn}
        initialCheckOut={addBookingInitial.checkOut}
      />

      {selectedPropertyId && (
        <PriceRangeModal
          isOpen={rangeModalOpen}
          onClose={() => setRangeModalOpen(false)}
          propertyId={selectedPropertyId}
          basePrice={basePrice}
          onSaved={fetchOverrides}
        />
      )}
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
  isSelected,
  onMouseDown,
  onMouseEnter,
  onClick,
  onDoubleClick,
}: {
  meta: DayMeta;
  isBottomRow: boolean;
  isRightCol: boolean;
  isSelected: boolean;
  onMouseDown: () => void;
  onMouseEnter: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const isWeekend = WEEKEND_INDICES.includes(meta.weekendIndex);
  const isSelectable = meta.inMonth && meta.status !== "booked";

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

  if (isSelected) {
    bg = "bg-[#FFF7ED]";
  }

  return (
    <button
      type="button"
      onMouseDown={isSelectable ? onMouseDown : undefined}
      onMouseEnter={isSelectable ? onMouseEnter : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={!meta.inMonth}
      className={cn(
        "relative flex h-[110px] flex-col items-start justify-between border-b border-r border-[#EEF1F4] px-3 py-2.5 text-left transition-colors",
        bg,
        isBottomRow && "border-b-0",
        isRightCol && "border-r-0",
        meta.inMonth ? "cursor-pointer" : "cursor-default",
        isSelected && "ring-2 ring-inset ring-[#F97316]",
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
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 text-[10px] font-semibold",
              meta.hasOverride ? "text-[#F97316]" : "text-[#94A3B8]",
            )}
          >
            {meta.hasOverride && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />
            )}
            {meta.price}₾
          </span>
        )}
      </div>
    </button>
  );
}
