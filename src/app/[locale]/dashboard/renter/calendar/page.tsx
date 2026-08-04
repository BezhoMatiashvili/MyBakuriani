"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip } from "@base-ui/react/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  CalendarRange,
  History,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import AddBookingModal, {
  type AddBookingPayload,
  type ViewBooking,
} from "@/components/renter/AddBookingModal";
import PriceRangeModal from "@/components/renter/PriceRangeModal";
import BookingHistoryDrawer from "@/components/renter/BookingHistoryDrawer";
import AvailabilityRangeModal, {
  type AvailabilityAction,
} from "@/components/calendar/AvailabilityRangeModal";
import {
  datesInRange,
  mapBookingError,
  occupancyWindow,
  type BookingErrorCode,
  type OccupiedMap,
} from "@/lib/utils/availability";
import { revalidatePublicProperty } from "@/app/actions/revalidateListing";
import type { Tables } from "@/lib/types/database";

type CalendarBlock = Tables<"calendar_blocks">;
type CalendarBlockView = Pick<
  CalendarBlock,
  "date" | "status" | "booking_id"
>;
type Property = Tables<"properties">;
type PriceOverrideRow = Tables<"price_overrides">;
type ManualBooking = Tables<"manual_bookings">;

// Result of a manual-booking RPC call, surfaced to the modal so it can show an
// inline error (and stay open) instead of failing silently. The message→code
// mapping is shared with the guests page via `mapBookingError`.
type BookingResult = {
  ok: boolean;
  errorCode?: BookingErrorCode;
  bookingId?: string;
};

// A platform (guest-made) booking joined with the guest's contact profile.
interface PlatformBookingRow {
  id: string;
  guest_id: string | null;
  check_in: string;
  check_out: string;
  status: string;
  total_price: number | null;
  guest: { name: string | null; phone: string | null } | null;
}

// Per-night resolution of who occupies a booked day, so a tapped cell knows
// whether it's an editable manual booking or a read-only platform booking.
type BookingEntry =
  | { type: "manual"; label: string; manual: ManualBooking }
  | {
      type: "platform";
      label: string;
      view: ViewBooking;
      platform: PlatformBookingRow;
    };

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
  booking?: BookingEntry;
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
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlockView[]>([]);
  // Wide-window occupancy for the modal date pickers (see `fetchOccupancy`).
  const [occupancyRows, setOccupancyRows] = useState<
    CalendarBlockView[]
  >([]);
  const [, setOccupancyReady] = useState(false);
  const [priceOverrides, setPriceOverrides] = useState<PriceOverrideRow[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [addBookingInitial, setAddBookingInitial] = useState<{
    checkIn: string;
    checkOut: string;
  }>({ checkIn: "", checkOut: "" });
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

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
  const selectedPropertyRef = useRef<string | null>(null);
  const calendarRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const priceRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const calendarRefreshBookingsRef = useRef(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    selectedPropertyRef.current = selectedPropertyId;
  }, [selectedPropertyId]);

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
        selectedPropertyRef.current = data[0].id;
        setSelectedPropertyId(data[0].id);
      }
      setLoading(false);
    }

    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchBlocks = useCallback(async () => {
    if (!selectedPropertyId) return;
    const propertyId = selectedPropertyId;
    const startDate = `${year}-${pad(month + 1)}-01`;
    const endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`;
    const { data, error } = await supabase
      .from("calendar_blocks")
      .select("date, status, booking_id")
      .eq("property_id", propertyId)
      .gte("date", startDate)
      .lte("date", endDate);
    if (!error && data && selectedPropertyRef.current === propertyId) {
      setCalendarBlocks(data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, year, month]);

  // Occupancy over a much wider window than the month grid. The pickers inside
  // the booking modals let the owner browse to any month, so a month-scoped read
  // would render occupied nights as free the moment they navigate away.
  // Deliberately month-independent: it refetches on property change and on
  // writes, never on paging the grid.
  const fetchOccupancy = useCallback(async () => {
    if (!selectedPropertyId) return false;
    const propertyId = selectedPropertyId;
    const [from, to] = occupancyWindow();
    const { data, error } = await supabase
      .from("calendar_blocks")
      .select("date, status, booking_id")
      .eq("property_id", propertyId)
      .in("status", ["booked", "blocked"])
      .gte("date", from)
      .lte("date", to);
    if (!error && data && selectedPropertyRef.current === propertyId) {
      setOccupancyRows(data);
    }
    return !error;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setOccupancyRows([]);
      setOccupancyReady(false);
      return;
    }
    let active = true;
    setOccupancyReady(false);
    setOccupancyRows([]);
    void fetchOccupancy().then((ok) => {
      if (active && selectedPropertyRef.current === selectedPropertyId) {
        setOccupancyReady(ok);
      }
    });
    return () => {
      active = false;
    };
  }, [fetchOccupancy, selectedPropertyId]);

  const fetchOverrides = useCallback(async () => {
    if (!selectedPropertyId) return;
    const propertyId = selectedPropertyId;
    const startDate = `${year}-${pad(month + 1)}-01`;
    const endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`;
    const { data, error } = await supabase
      .from("price_overrides")
      .select("*")
      .eq("property_id", propertyId)
      .gte("date", startDate)
      .lte("date", endDate);
    if (!error && data && selectedPropertyRef.current === propertyId) {
      setPriceOverrides(data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, year, month]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  // Fetch the manual + platform bookings that occupy the visible month. New and
  // edited stays include their check-out date as an occupied calendar day.
  const fetchBookings = useCallback(async () => {
    if (!selectedPropertyId || !user) return;
    const propertyId = selectedPropertyId;
    const startDate = `${year}-${pad(month + 1)}-01`;
    const endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`;
    const [manualRes, platformRes] = await Promise.all([
      supabase
        .from("manual_bookings")
        .select("*")
        .eq("owner_id", user.id)
        .eq("property_id", propertyId)
        .neq("status", "cancelled")
        .lte("check_in", endDate)
        .gte("check_out", startDate),
      supabase
        .from("bookings")
        .select(
          "id, guest_id, check_in, check_out, status, total_price",
        )
        .eq("owner_id", user.id)
        .eq("property_id", propertyId)
        .neq("status", "cancelled")
        .lte("check_in", endDate)
        .gte("check_out", startDate),
    ]);
    const platformRows = (platformRes.data ?? []) as Omit<
      PlatformBookingRow,
      "guest"
    >[];
    const profileIds = [
      ...new Set(platformRows.map((row) => row.guest_id).filter(Boolean)),
    ] as string[];
    const contacts = new Map<
      string,
      { name: string | null; phone: string | null }
    >();
    if (profileIds.length > 0) {
      const contactRes = await supabase
        .from("renter_guests")
        .select("profile_id, name, phone")
        .eq("owner_id", user.id)
        .in("profile_id", profileIds);
      for (const contact of contactRes.data ?? []) {
        if (contact.profile_id) {
          contacts.set(contact.profile_id, {
            name: contact.name,
            phone: contact.phone,
          });
        }
      }
    }
    if (selectedPropertyRef.current !== propertyId) return;
    setManualBookings(manualRes.data ?? []);
    setPlatformBookings(
      platformRows.map((row) => ({
        ...row,
        guest: row.guest_id ? (contacts.get(row.guest_id) ?? null) : null,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, user, year, month]);

  useEffect(() => {
    setManualBookings([]);
    setPlatformBookings([]);
  }, [selectedPropertyId, year, month]);

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

  const scheduleCalendarRefresh = useCallback(
    (includeBookings = false) => {
      calendarRefreshBookingsRef.current ||= includeBookings;
      if (calendarRefreshTimerRef.current) {
        clearTimeout(calendarRefreshTimerRef.current);
      }
      calendarRefreshTimerRef.current = setTimeout(() => {
        calendarRefreshTimerRef.current = null;
        const shouldFetchBookings = calendarRefreshBookingsRef.current;
        calendarRefreshBookingsRef.current = false;
        const jobs: Promise<unknown>[] = [fetchBlocks(), fetchOccupancy()];
        if (shouldFetchBookings) jobs.push(fetchBookings());
        void Promise.all(jobs);
      }, 200);
    },
    [fetchBlocks, fetchBookings, fetchOccupancy],
  );

  const schedulePriceRefresh = useCallback(() => {
    if (priceRefreshTimerRef.current) {
      clearTimeout(priceRefreshTimerRef.current);
    }
    priceRefreshTimerRef.current = setTimeout(() => {
      priceRefreshTimerRef.current = null;
      void fetchOverrides();
    }, 200);
  }, [fetchOverrides]);

  useEffect(() => {
    void fetchBlocks();
  }, [fetchBlocks]);

  useEffect(() => {
    if (!selectedPropertyId) return;
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
        (payload) => {
          const next = payload.new as {
            status?: string;
            booking_id?: string | null;
          };
          scheduleCalendarRefresh(
            next?.status === "booked" || Boolean(next?.booking_id),
          );
        },
      )
      .subscribe();
    return () => {
      if (calendarRefreshTimerRef.current) {
        clearTimeout(calendarRefreshTimerRef.current);
        calendarRefreshTimerRef.current = null;
      }
      calendarRefreshBookingsRef.current = false;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, scheduleCalendarRefresh]);

  useEffect(() => {
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
        schedulePriceRefresh,
      )
      .subscribe();
    return () => {
      if (priceRefreshTimerRef.current) {
        clearTimeout(priceRefreshTimerRef.current);
        priceRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId, schedulePriceRefresh]);

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
    const map = new Map<string, CalendarBlockView>();
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
      const label = b.guest?.name || tShared("guest");
      const view: ViewBooking = {
        guestName: b.guest?.name ?? "",
        guestPhone: b.guest?.phone ?? null,
        checkIn: b.check_in,
        checkOut: b.check_out,
        status: b.status,
      };
      for (const d of datesInRange(b.check_in, b.check_out)) {
        map.set(d, { type: "platform", label, view, platform: b });
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
          booking:
            status === "booked" ? bookingByDate.get(dateStr) : undefined,
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

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const applyAvailability = async (
    action: AvailabilityAction,
    dates: string[],
  ): Promise<boolean> => {
    if (!selectedPropertyId || dates.length === 0) return false;
    const propertyId = selectedPropertyId;
    const { data, error } = await supabase.rpc(
      "apply_calendar_availability",
      {
        p_action: action,
        p_dates: dates,
        p_property_id: propertyId,
      },
    );
    if (error) {
      toast.error(t("saveError"));
      return false;
    }

    const result = data?.[0];
    const changedDates = result?.changed_dates ?? [];
    const skippedBookedDates = result?.skipped_booked_dates ?? [];
    const changed = new Set(changedDates);
    const patchRows = (rows: CalendarBlockView[]): CalendarBlockView[] => {
      const next = rows.filter((row) => !changed.has(row.date));
      if (action === "blocked") {
        for (const date of changedDates) {
          next.push({ date, status: "blocked", booking_id: null });
        }
      }
      return next;
    };
    setCalendarBlocks(patchRows);
    setOccupancyRows(patchRows);
    scheduleCalendarRefresh(false);
    if (changedDates.length > 0) {
      toast.success(t("bulkApplied", { count: changedDates.length }));
      void revalidatePublicProperty(propertyId).catch(() => undefined);
    } else {
      toast.info(t("bulkNoChange"));
    }
    if (skippedBookedDates.length > 0) {
      toast.info(
        t("bulkBookedSkipped", { count: skippedBookedDates.length }),
      );
    }
    return true;
  };

  // Today's date in YYYY-MM-DD (browser-local), shared by the bulk bar and the
  // current-day cell marker.
  const todayIso = useMemo(() => {
    const t = new Date();
    return fmtDate(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);


  // Every unbookable night for this property. Fed to the CREATE modal, where
  // nothing may be excluded.
  const occupiedAll = useMemo<OccupiedMap>(() => {
    const m = new Map<string, "booked" | "blocked">();
    for (const b of occupancyRows) {
      if (b.status !== "booked" && b.status !== "blocked") continue;
      m.set(b.date, b.status);
    }
    return m;
  }, [occupancyRows]);

  // Same, minus the nights held by the booking currently open for editing —
  // otherwise a booking could never be saved over its own dates. Kept separate
  // from `occupiedAll` because `editingBooking` outlives the details modal, and
  // sharing one map would leak that exclusion into the create modal.
  const occupiedForEdit = useMemo<OccupiedMap>(() => {
    if (!editingBooking) return occupiedAll;
    const m = new Map(occupiedAll);
    for (const b of occupancyRows) {
      if (b.booking_id === editingBooking.id) m.delete(b.date);
    }
    return m;
  }, [occupiedAll, occupancyRows, editingBooking]);

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
    const { data, error } = await supabase.rpc("create_manual_booking", {
      p_property_id: selectedPropertyId,
      p_check_in: payload.checkIn,
      p_check_out: payload.checkOut,
      p_source: payload.source || undefined,
      p_guest_name: payload.guestName || undefined,
      p_guest_phone: payload.guestPhone || undefined,
      p_guests_count: parseCount(payload.guestsCount) ?? undefined,
      p_amount: parseAmount(payload.amount),
      p_deposit_amount: parseAmount(payload.depositAmount),
      p_deposit_paid_on: payload.depositPaidOn || null,
      p_note: payload.note || undefined,
      p_status: payload.status === "booked" ? "booked" : "manual",
      p_client_list: payload.clientList,
    });
    if (error) return { ok: false, errorCode: mapBookingError(error.message) };
    await Promise.all([fetchBlocks(), fetchBookings(), fetchOccupancy()]);
    await revalidatePublicProperty(selectedPropertyId);
    return { ok: true, bookingId: data.id };
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
      p_amount: parseAmount(payload.amount),
      p_deposit_amount: parseAmount(payload.depositAmount),
      p_deposit_paid_on: payload.depositPaidOn || null,
      p_note: payload.note || undefined,
      p_status: payload.status === "booked" ? "booked" : "manual",
      p_client_list: payload.clientList,
    });
    if (error) return { ok: false, errorCode: mapBookingError(error.message) };
    await Promise.all([fetchBlocks(), fetchBookings(), fetchOccupancy()]);
    if (selectedPropertyId) await revalidatePublicProperty(selectedPropertyId);
    return { ok: true };
  };

  // Soft cancellation preserves the row and audit trail while atomically
  // releasing its calendar blocks.
  const handleCancelBooking = async (): Promise<BookingResult> => {
    if (!editingBooking || !selectedPropertyId || !user)
      return { ok: false, errorCode: "generic" };
    const { error } = await supabase.rpc("cancel_manual_booking", {
      p_id: editingBooking.id,
    });
    if (error) return { ok: false, errorCode: "generic" };
    await Promise.all([fetchBlocks(), fetchBookings(), fetchOccupancy()]);
    setHistoryRefreshToken((value) => value + 1);
    try {
      await revalidatePublicProperty(selectedPropertyId);
    } catch (revalidateError) {
      console.error("Failed to revalidate cancelled booking", revalidateError);
    }
    toast.success(t("history.cancelledSuccess"));
    return { ok: true };
  };

  const handleRestoreBooking = async (
    booking: ManualBooking,
  ): Promise<"restored" | "conflict" | "error"> => {
    const { error } = await supabase.rpc("restore_manual_booking", {
      p_id: booking.id,
    });
    if (error) {
      if (mapBookingError(error.message) === "datesUnavailable") {
        setHistoryOpen(false);
        setEditingBooking(booking);
        setViewBooking(null);
        setDetailsMode("edit");
        setDetailsOpen(true);
        toast.error(t("history.restoreConflict"));
        return "conflict";
      }
      toast.error(t("history.restoreError"));
      return "error";
    }
    await Promise.all([fetchBlocks(), fetchBookings(), fetchOccupancy()]);
    setHistoryRefreshToken((value) => value + 1);
    if (selectedPropertyId) {
      try {
        await revalidatePublicProperty(selectedPropertyId);
      } catch (revalidateError) {
        console.error("Failed to revalidate restored booking", revalidateError);
      }
    }
    toast.success(t("history.restoredSuccess"));
    return "restored";
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

  return (
    <div className="space-y-5 pb-32 lg:pb-5">
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
                          selectedPropertyRef.current = p.id;
                          setCalendarBlocks([]);
                          setOccupancyRows([]);
                          setPriceOverrides([]);
                          setManualBookings([]);
                          setPlatformBookings([]);
                          setOccupancyReady(false);
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
          <button
            type="button"
            disabled={!selectedPropertyId}
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-black text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            <History className="h-4 w-4" />
            {t("history.button")}
          </button>

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
            onClick={() => setAvailabilityModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#D97706] bg-white px-4 py-2.5 text-[13px] font-black text-[#B45309] transition-colors hover:bg-[#FFFBEB] disabled:opacity-50"
          >
            <CalendarRange className="h-4 w-4" strokeWidth={2.4} />
            {t("availability.button")}
          </button>

          <button
            type="button"
            disabled={!selectedPropertyId}
            onClick={() => setRangeModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#F97316] bg-white px-4 py-2.5 text-[13px] font-black text-[#F97316] transition-colors hover:bg-[#FFF7ED] disabled:opacity-50"
          >
            <CalendarRange className="h-4 w-4" strokeWidth={2.4} />
            {t("priceRange")}
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
        className="grid grid-cols-7 overflow-hidden rounded-[8px] border border-[#EEF1F4]"
      >
        {days.map((d, i) => (
          <DayCell
            key={`${d.date}-${i}`}
            meta={d}
            isBottomRow={i >= 35}
            isRightCol={d.weekendIndex === 6}
            isToday={d.inMonth && d.date === todayIso}
            booking={d.booking}
            onClick={() => {
              if (!d.inMonth) return;
              if (d.status === "booked") {
                handleBookedClick(d.date);
              }
            }}
            onDoubleClick={() => {
              if (!d.inMonth || d.status === "booked") return;
              setAddBookingInitial({ checkIn: d.date, checkOut: "" });
              setAddBookingOpen(true);
            }}
          />
        ))}
      </motion.div>

      <p className="text-[11px] text-[#94A3B8] md:text-[12px]">{t("hint")}</p>

      <AddBookingModal
        isOpen={addBookingOpen}
        onClose={() => setAddBookingOpen(false)}
        onSubmit={handleAddBooking}
        initialCheckIn={addBookingInitial.checkIn}
        initialCheckOut={addBookingInitial.checkOut}
        occupied={occupiedAll}
      />

      {/* Details for a tapped booked day — manual editable, platform read-only */}
      <AddBookingModal
        isOpen={detailsOpen}
        // Clearing the edit target matters beyond tidiness: `occupiedForEdit`
        // hides this booking's own nights, and a stale `editingBooking` would
        // keep hiding them from the CREATE modal after this one closes.
        // `viewBooking` is deliberately left alone — it feeds the read-only
        // body, which would flash into the form branch mid exit-animation.
        onClose={() => {
          setDetailsOpen(false);
          setEditingBooking(null);
        }}
        mode={detailsMode}
        existing={editingBooking}
        viewBooking={viewBooking}
        onSave={handleEditBooking}
        onDelete={handleCancelBooking}
        occupied={occupiedForEdit}
      />

      {selectedPropertyId && (
        <>
          <AvailabilityRangeModal
            isOpen={availabilityModalOpen}
            onClose={() => setAvailabilityModalOpen(false)}
            onApply={applyAvailability}
          />
          <PriceRangeModal
            isOpen={rangeModalOpen}
            onClose={() => setRangeModalOpen(false)}
            propertyId={selectedPropertyId}
            basePrice={basePrice}
            onSaved={fetchOverrides}
          />
        </>
      )}

      <BookingHistoryDrawer
        isOpen={historyOpen}
        propertyId={selectedPropertyId}
        currentUserId={user?.id ?? null}
        refreshToken={historyRefreshToken}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleRestoreBooking}
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
  isToday,
  booking,
  onClick,
  onDoubleClick,
}: {
  meta: DayMeta;
  isBottomRow: boolean;
  isRightCol: boolean;
  isToday: boolean;
  booking?: BookingEntry;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const tCalendar = useTranslations("Calendar");
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

  const button = (
    <button
      type="button"
      data-booking-type={booking?.type}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={!meta.inMonth}
      className={cn(
        "relative flex h-[84px] flex-col items-start justify-between border-b border-r border-[#EEF1F4] px-1 py-1.5 text-left transition-colors sm:h-[110px] sm:px-3 sm:py-2.5",
        bg,
        isBottomRow && "border-b-0",
        isRightCol && "border-r-0",
        meta.inMonth ? "cursor-pointer" : "cursor-default",
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
            {tCalendar("today")}
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

  if (meta.status !== "booked" || !booking) return button;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={button} delay={250} closeDelay={80} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8} className="z-[70]">
          <Tooltip.Popup className="w-[min(320px,calc(100vw-24px))] rounded-xl border border-[#E2E8F0] bg-white p-4 text-left shadow-[0_18px_45px_-18px_rgba(15,23,42,0.45)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
            <BookingTooltip booking={booking} />
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function BookingTooltip({ booking }: { booking: BookingEntry }) {
  const t = useTranslations("RenterCalendar.bookingTooltip");
  const unknown = t("unknown");
  const manual = booking.type === "manual" ? booking.manual : null;
  const platform = booking.type === "platform" ? booking.platform : null;
  const total = manual?.amount ?? platform?.total_price ?? null;
  const deposit = manual?.deposit_amount ?? null;
  const remaining =
    manual && manual.amount != null && manual.deposit_amount != null
      ? Number(manual.amount) - Number(manual.deposit_amount)
      : null;
  const money = (value: number | null) =>
    value == null ? unknown : `${Number(value).toFixed(2)} ₾`;
  const rows: Array<[string, string]> = [
    [t("phone"), manual?.guest_phone ?? platform?.guest?.phone ?? unknown],
    [
      t("dates"),
      `${manual?.check_in ?? platform?.check_in} – ${manual?.check_out ?? platform?.check_out}`,
    ],
    [
      t("source"),
      manual?.client_list ?? manual?.source ?? (platform ? t("platform") : unknown),
    ],
    [t("total"), money(total)],
    [t("deposit"), manual ? money(deposit) : unknown],
    [t("depositDate"), manual?.deposit_paid_on ?? unknown],
    [t("remaining"), money(remaining)],
  ];

  return (
    <div>
      <p className="text-[13px] font-black text-[#0F172A]">
        {manual?.guest_name ?? platform?.guest?.name ?? t("guest")}
      </p>
      <dl className="mt-2.5 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 text-[11px] leading-4">
            <dt className="shrink-0 font-semibold text-[#94A3B8]">{label}</dt>
            <dd className="text-right font-bold text-[#334155]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
