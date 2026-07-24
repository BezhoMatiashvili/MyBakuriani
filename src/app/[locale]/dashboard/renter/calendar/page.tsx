"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import NumberField from "@/components/shared/NumberField";
import { cn } from "@/lib/utils";
import AddBookingModal, {
  type AddBookingPayload,
  type ViewBooking,
} from "@/components/renter/AddBookingModal";
import PriceRangeModal from "@/components/renter/PriceRangeModal";
import BulkActionBar, {
  BulkApplyChanges,
} from "@/components/calendar/BulkActionBar";
import { datesInRange } from "@/lib/utils/availability";
import { revalidatePublicProperty } from "@/app/actions/revalidateListing";
import type { Tables } from "@/lib/types/database";

type CalendarBlock = Tables<"calendar_blocks">;
type Property = Tables<"properties">;
type PriceOverrideRow = Tables<"price_overrides">;
type ManualBooking = Tables<"manual_bookings">;

// Result of a manual-booking RPC call, surfaced to the modal so it can show an
// inline error (and stay open) instead of failing silently.
type BookingErrorCode = "datesUnavailable" | "generic";
type BookingResult = { ok: boolean; errorCode?: BookingErrorCode };

// Map a Postgres RAISE EXCEPTION message to a translatable error code. The
// overlap-safe RPCs raise the Georgian "...დაკავებულია" on a date conflict.
const mapBookingError = (msg: string): BookingErrorCode =>
  msg.includes("დაკავებულია") ? "datesUnavailable" : "generic";

// A platform (guest-made) booking joined with the guest's contact profile.
interface PlatformBookingRow {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  guest: { display_name: string | null; phone: string | null } | null;
}

// Per-night resolution of who occupies a booked day, so a tapped cell knows
// whether it's an editable manual booking or a read-only platform booking.
type BookingEntry =
  | { type: "manual"; label: string; manual: ManualBooking }
  | { type: "platform"; label: string; view: ViewBooking };

const MONTH_KEYS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const WEEKEND_INDICES = [4, 5, 6];

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

export default function RenterCalendarPage() {
  const t = useTranslations("RenterCalendar");
  const tMonths = useTranslations("DateRangeFilter.months");
  const tShared = useTranslations("DashboardShared");
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
  // Touch drag-select: armed by a long-press on a day cell (grid onPointerDown
  // below), active while the finger keeps dragging across cells.
  const [touchDragActive, setTouchDragActive] = useState(false);
  const touchPressRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingBlocks, setSavingBlocks] = useState(false);

  // Bookings occupying the visible month — who is coming on which day.
  const [manualBookings, setManualBookings] = useState<ManualBooking[]>([]);
  const [platformBookings, setPlatformBookings] = useState<
    PlatformBookingRow[]
  >([]);

  // Details modal opened by tapping a booked day.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<"edit" | "view">("edit");
  const [editingBooking, setEditingBooking] = useState<ManualBooking | null>(
    null,
  );
  const [viewBooking, setViewBooking] = useState<ViewBooking | null>(null);

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

  const fetchBlocks = useCallback(async () => {
    if (!selectedPropertyId) return;
    const startDate = `${year}-${pad(month + 1)}-01`;
    const endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`;
    const { data } = await supabase
      .from("calendar_blocks")
      .select("*")
      .eq("property_id", selectedPropertyId)
      .gte("date", startDate)
      .lte("date", endDate);
    if (data) setCalendarBlocks(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, year, month]);

  useEffect(() => {
    if (!selectedPropertyId) return;

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
        () => {
          fetchBlocks();
          fetchBookings();
        },
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

  // Fetch the manual + platform bookings that occupy the visible month. New and
  // edited stays include their check-out date as an occupied calendar day.
  const fetchBookings = useCallback(async () => {
    if (!selectedPropertyId || !user) return;
    const startDate = `${year}-${pad(month + 1)}-01`;
    const endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`;
    const [manualRes, platformRes] = await Promise.all([
      supabase
        .from("manual_bookings")
        .select("*")
        .eq("owner_id", user.id)
        .eq("property_id", selectedPropertyId)
        .lte("check_in", endDate)
        .gte("check_out", startDate),
      supabase
        .from("bookings")
        .select(
          "id, check_in, check_out, status, guest:profiles!bookings_guest_id_fkey(display_name, phone)",
        )
        .eq("owner_id", user.id)
        .eq("property_id", selectedPropertyId)
        .neq("status", "cancelled")
        .lte("check_in", endDate)
        .gte("check_out", startDate),
    ]);
    if (manualRes.data) setManualBookings(manualRes.data);
    if (platformRes.data) {
      setPlatformBookings(platformRes.data as unknown as PlatformBookingRow[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, user, year, month]);

  useEffect(() => {
    fetchBookings();
    if (!selectedPropertyId) return;
    const channel = supabase
      .channel(`manual-bookings-${selectedPropertyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "manual_bookings",
          filter: `property_id=eq.${selectedPropertyId}`,
        },
        () => fetchBookings(),
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

  // Map each booked night → its booking. Platform bookings are filled first so
  // manual (owner-editable) bookings win on any overlapping date.
  const bookingByDate = useMemo(() => {
    const map = new Map<string, BookingEntry>();
    for (const b of platformBookings) {
      const label = b.guest?.display_name || tShared("guest");
      const view: ViewBooking = {
        guestName: b.guest?.display_name ?? "",
        guestPhone: b.guest?.phone ?? null,
        checkIn: b.check_in,
        checkOut: b.check_out,
        status: b.status,
      };
      for (const d of datesInRange(b.check_in, b.check_out)) {
        map.set(d, { type: "platform", label, view });
      }
    }
    for (const b of manualBookings) {
      const label = b.guest_name || b.source || tShared("guest");
      for (const d of datesInRange(b.check_in, b.check_out)) {
        map.set(d, { type: "manual", label, manual: b });
      }
    }
    return map;
  }, [platformBookings, manualBookings, tShared]);

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

  // While a touch drag is active, stop the page from scrolling under the
  // finger (touch-action can't change mid-gesture, so preventDefault the
  // touchmoves) and let Escape abort the drag without committing it.
  useEffect(() => {
    if (!touchDragActive) return;
    const prevent = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTouchDragActive(false);
      setIsDragging(false);
      setDragAnchor(null);
      setDragHover(null);
      setDragMoved(false);
    };
    document.addEventListener("touchmove", prevent, { passive: false });
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("touchmove", prevent);
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [touchDragActive]);

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
          guestLabel:
            status === "booked" ? bookingByDate.get(dateStr)?.label : undefined,
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
  }, [year, month, blocksByDate, overridesByDate, basePrice, bookingByDate]);

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

  // ── Touch drag-select ────────────────────────────────────────────────
  // The mouse path above uses per-cell onMouseDown/onMouseEnter. Touch
  // pointers implicitly capture to the touchstart target, so per-cell enters
  // never fire on touch; instead a long-press (~350ms hold without moving) on
  // a day cell arms the drag, then the grid's pointermove hit-tests
  // document.elementFromPoint against [data-day] cells. Page scroll survives:
  // before activation a moved finger cancels the hold (and a browser-initiated
  // scroll fires pointercancel), and scrolling is suppressed only once active.

  const cancelTouchPress = () => {
    if (touchPressRef.current) {
      clearTimeout(touchPressRef.current.timer);
      touchPressRef.current = null;
    }
  };

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch" || touchDragActive) return;
    const dateStr = (e.target as HTMLElement)
      .closest("[data-day]")
      ?.getAttribute("data-day");
    if (!dateStr) return;
    cancelTouchPress();
    touchPressRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      timer: setTimeout(() => {
        touchPressRef.current = null;
        // data-day exists only on selectable (in-month, non-booked) cells,
        // so handleCellMouseDown's booked guard is already satisfied.
        handleCellMouseDown(dateStr, "free");
        setTouchDragActive(true);
      }, 350),
    };
  };

  const handleGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    const pending = touchPressRef.current;
    if (pending && pending.pointerId === e.pointerId) {
      // Finger moved during the hold — that's a scroll, not a long-press.
      if (
        Math.abs(e.clientX - pending.startX) > 10 ||
        Math.abs(e.clientY - pending.startY) > 10
      ) {
        cancelTouchPress();
      }
      return;
    }
    if (!touchDragActive) return;
    const dateStr = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-day]")
      ?.getAttribute("data-day");
    if (dateStr) handleCellMouseEnter(dateStr);
  };

  const handleGridPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    cancelTouchPress();
    if (!touchDragActive) return;
    setTouchDragActive(false);
    if (e.type === "pointercancel") {
      // The browser took over the gesture — abort without committing.
      setIsDragging(false);
      setDragAnchor(null);
      setDragHover(null);
      setDragMoved(false);
    }
    // On pointerup the shared mouseup/touchend handler commits the range.
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
      await revalidatePublicProperty(selectedPropertyId);
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
      await revalidatePublicProperty(selectedPropertyId);
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
    if (!error) {
      await revalidatePublicProperty(selectedPropertyId);
      clearSelection();
    }
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
    if (!error) {
      await revalidatePublicProperty(selectedPropertyId);
      clearSelection();
    }
  };

  // Today's date in YYYY-MM-DD (browser-local), shared by the bulk bar and the
  // current-day cell marker.
  const todayIso = useMemo(() => {
    const t = new Date();
    return fmtDate(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  // Dates of the currently visible month, restricted to today or later — past
  // days can never be re-blocked, and the bulk bar shouldn't act on them.
  const visibleMonthDates = useMemo(() => {
    const days = getDaysInMonth(year, month);
    const out: string[] = [];
    for (let d = 1; d <= days; d++) {
      const iso = fmtDate(year, month, d);
      if (iso >= todayIso) out.push(iso);
    }
    return out;
  }, [year, month, todayIso]);

  const bookedDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of calendarBlocks) {
      if (b.status === "booked") s.add(b.date);
    }
    return s;
  }, [calendarBlocks]);

  // Nights already occupied for the selected property (this month's window),
  // excluding the booking being edited — fed to the modal for instant overlap
  // feedback. The server RPC remains the hard guarantee.
  const occupiedNights = useMemo(() => {
    const s = new Set<string>();
    for (const b of calendarBlocks) {
      if (b.status !== "booked" && b.status !== "blocked") continue;
      if (editingBooking && b.booking_id === editingBooking.id) continue;
      s.add(b.date);
    }
    return s;
  }, [calendarBlocks, editingBooking]);

  const parseCount = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const parseAmount = (v: string) => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  };

  // Persist a manually-added booking via the overlap-safe RPC: it takes a
  // per-property advisory lock, rejects any date conflict, and writes the
  // calendar_blocks reservation atomically (no silent clobbering).
  const handleAddBooking = async (
    payload: AddBookingPayload,
  ): Promise<BookingResult> => {
    if (!selectedPropertyId || !user)
      return { ok: false, errorCode: "generic" };
    if (!payload.checkIn || !payload.checkOut || !payload.guestName.trim())
      return { ok: false, errorCode: "generic" };
    const { error } = await supabase.rpc("create_manual_booking", {
      p_property_id: selectedPropertyId,
      p_check_in: payload.checkIn,
      p_check_out: payload.checkOut,
      p_source: payload.source || undefined,
      p_guest_name: payload.guestName || undefined,
      p_guest_phone: payload.guestPhone || undefined,
      p_guests_count: parseCount(payload.guestsCount) ?? undefined,
      p_amount: parseAmount(payload.amount) ?? undefined,
      p_note: payload.note || undefined,
      p_status: payload.status === "booked" ? "booked" : "manual",
      p_client_list: payload.clientList,
    });
    if (error) return { ok: false, errorCode: mapBookingError(error.message) };
    await Promise.all([fetchBlocks(), fetchBookings()]);
    await revalidatePublicProperty(selectedPropertyId);
    return { ok: true };
  };

  // Save edits to an existing manual booking via the overlap-safe RPC. It frees
  // the booking's own nights, re-checks the new range for conflicts under the
  // advisory lock, and re-reserves it atomically.
  const handleEditBooking = async (
    payload: AddBookingPayload,
  ): Promise<BookingResult> => {
    if (!editingBooking || !user) return { ok: false, errorCode: "generic" };
    if (!payload.checkIn || !payload.checkOut || !payload.guestName.trim())
      return { ok: false, errorCode: "generic" };
    const { error } = await supabase.rpc("update_manual_booking", {
      p_id: editingBooking.id,
      p_check_in: payload.checkIn,
      p_check_out: payload.checkOut,
      p_source: payload.source || undefined,
      p_guest_name: payload.guestName || undefined,
      p_guest_phone: payload.guestPhone || undefined,
      p_guests_count: parseCount(payload.guestsCount) ?? undefined,
      p_amount: parseAmount(payload.amount) ?? undefined,
      p_note: payload.note || undefined,
      p_status: payload.status === "booked" ? "booked" : "manual",
      p_client_list: payload.clientList,
    });
    if (error) return { ok: false, errorCode: mapBookingError(error.message) };
    await Promise.all([fetchBlocks(), fetchBookings()]);
    if (selectedPropertyId) await revalidatePublicProperty(selectedPropertyId);
    return { ok: true };
  };

  // A DB trigger releases this booking's calendar blocks in the same transaction.
  const handleCancelBooking = async () => {
    if (!editingBooking || !selectedPropertyId || !user) return;
    try {
      await supabase
        .from("manual_bookings")
        .delete()
        .eq("id", editingBooking.id)
        .eq("owner_id", user.id);
      await Promise.all([fetchBlocks(), fetchBookings()]);
      await revalidatePublicProperty(selectedPropertyId);
    } catch (err) {
      console.error("Failed to cancel booking", err);
    }
  };

  // Tapping a booked day opens its details: manual → editable, platform → read-only.
  const handleBookedClick = (dateStr: string) => {
    const entry = bookingByDate.get(dateStr);
    if (!entry) return;
    if (entry.type === "manual") {
      setEditingBooking(entry.manual);
      setViewBooking(null);
      setDetailsMode("edit");
    } else {
      setViewBooking(entry.view);
      setEditingBooking(null);
      setDetailsMode("view");
    }
    setDetailsOpen(true);
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
      await revalidatePublicProperty(selectedPropertyId);
      clearSelection();
    } finally {
      setSavingBlocks(false);
    }
  };

  return (
    <div
      className={cn(
        "space-y-5",
        hasActionable ? "pb-72 lg:pb-28" : "pb-32 lg:pb-5",
      )}
    >
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
              label={t("legendFree")}
            />
            <LegendItem
              swatch={
                <span className="h-3.5 w-3.5 rounded-[3px] bg-[#FEE2E2]" />
              }
              label={t("legendBooked")}
            />
            <LegendItem
              swatch={
                <span className="h-3.5 w-3.5 rounded-[3px] bg-[#FEF3C7]" />
              }
              label={t("legendBlocked")}
            />
            <LegendItem
              swatch={
                <span className="h-3.5 w-3.5 rounded-full bg-[#F97316]" />
              }
              label={t("legendPriceChanged")}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="inline-flex items-center rounded-xl border border-[#E2E8F0] bg-white px-2 py-1 shadow-[0px_1px_2px_rgba(15,23,42,0.04)]">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label={t("prevMonth")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 text-[13px] font-black text-[#0F172A]">
              {tMonths(MONTH_KEYS[month])} {year}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label={t("nextMonth")}
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
            {t("range")}
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
            {tShared("add")}
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
        {DAY_KEYS.map((key, i) => (
          <div
            key={key}
            className={cn(
              "py-3 text-center text-[11px] font-bold uppercase tracking-wide",
              WEEKEND_INDICES.includes(i) ? "text-[#EF4444]" : "text-[#94A3B8]",
            )}
          >
            {t(`daysShort.${key}`)}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-7 overflow-hidden rounded-[8px] border border-[#EEF1F4] select-none"
        onPointerDown={handleGridPointerDown}
        onPointerMove={handleGridPointerMove}
        onPointerUp={handleGridPointerEnd}
        onPointerCancel={handleGridPointerEnd}
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
            isToday={d.inMonth && d.date === todayIso}
            onMouseDown={() => handleCellMouseDown(d.date, d.status)}
            onMouseEnter={() => handleCellMouseEnter(d.date)}
            onClick={() => {
              if (!d.inMonth) return;
              if (d.status === "booked") {
                handleBookedClick(d.date);
                return;
              }
              handleCellClick(d.date, d.status);
            }}
            onDoubleClick={() => {
              if (!d.inMonth || d.status === "booked") return;
              clearSelection();
              setAddBookingInitial({ checkIn: d.date, checkOut: "" });
              setAddBookingOpen(true);
            }}
          />
        ))}
      </motion.div>

      <p className="text-[11px] text-[#94A3B8] md:text-[12px]">{t("hint")}</p>

      {/* Selection action bar */}
      <AnimatePresence>
        {hasActionable && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 border-t border-[#E2E8F0] bg-white px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)] lg:bottom-0 lg:left-[272px] lg:px-5 lg:py-4"
          >
            <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
                  aria-label={tShared("cancel")}
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="text-[13px]">
                  <div className="font-black text-[#0F172A]">
                    {freeSelected.length > 0 && blockedSelected.length > 0
                      ? t("selectionMixed", {
                          free: freeSelected.length,
                          blocked: blockedSelected.length,
                        })
                      : freeSelected.length > 0
                        ? t("selectionFree", { count: freeSelected.length })
                        : t("selectionBlocked", {
                            count: blockedSelected.length,
                          })}
                  </div>
                  {freeSelected.length > 0 && (
                    <div className="text-[11px] font-semibold text-[#64748B]">
                      {t("avgPrice", { price: avgCurrentPrice })}
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
                    {t("turnOn", { count: blockedSelected.length })}
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
                      {t("turnOff", { count: freeSelected.length })}
                    </button>
                    <div className="flex-1 md:max-w-[180px]">
                      <NumberField
                        value={priceInput}
                        onChange={setPriceInput}
                        min={0}
                        max={99999}
                        decimals={2}
                        suffix="₾"
                        accent="orange"
                        placeholder={t("newPricePlaceholder")}
                      />
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
                      {t("applyPrice")}
                    </button>
                    <button
                      type="button"
                      disabled={savingPrice}
                      onClick={resetToDefault}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#F1F5F9] disabled:opacity-50"
                      title={t("resetDefaultTitle")}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("resetDefault")}
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
        occupiedNights={occupiedNights}
      />

      {/* Details for a tapped booked day — manual editable, platform read-only */}
      <AddBookingModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        mode={detailsMode}
        existing={editingBooking}
        viewBooking={viewBooking}
        onSave={handleEditBooking}
        onDelete={handleCancelBooking}
        occupiedNights={occupiedNights}
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
  isToday,
  onMouseDown,
  onMouseEnter,
  onClick,
  onDoubleClick,
}: {
  meta: DayMeta;
  isBottomRow: boolean;
  isRightCol: boolean;
  isSelected: boolean;
  isToday: boolean;
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
      data-day={isSelectable ? meta.date : undefined}
      onMouseDown={isSelectable ? onMouseDown : undefined}
      onMouseEnter={isSelectable ? onMouseEnter : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={!meta.inMonth}
      className={cn(
        "relative flex h-[84px] flex-col items-start justify-between border-b border-r border-[#EEF1F4] px-1 py-1.5 text-left transition-colors sm:h-[110px] sm:px-3 sm:py-2.5",
        bg,
        isBottomRow && "border-b-0",
        isRightCol && "border-r-0",
        meta.inMonth ? "cursor-pointer" : "cursor-default",
        isSelected && "ring-2 ring-inset ring-[#F97316]",
        accentBorder &&
          `before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full ${accentBorder}`,
      )}
    >
      <div className="flex w-full items-center justify-between gap-1">
        <span
          className={cn(
            "text-[12px] font-black sm:text-[13px]",
            isToday
              ? "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#2563EB] px-1 text-white sm:h-5 sm:min-w-5"
              : numberColor,
          )}
        >
          {meta.day}
        </span>
        {isToday && (
          <span className="hidden rounded-full bg-[#DBEAFE] px-1.5 py-0.5 text-[9px] font-bold leading-none text-[#2563EB] sm:inline sm:text-[10px]">
            დღეს
          </span>
        )}
      </div>
      <div className="flex w-full items-end justify-between gap-1">
        {meta.guestLabel && meta.status === "booked" && (
          <span className="min-w-0 truncate text-[10px] font-bold text-[#B91C1C]">
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
              <span className="hidden h-1.5 w-1.5 rounded-full bg-[#F97316] min-[360px]:inline" />
            )}
            {meta.price}₾
          </span>
        )}
      </div>
    </button>
  );
}
