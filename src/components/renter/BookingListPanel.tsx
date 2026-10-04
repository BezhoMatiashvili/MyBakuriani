"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { ChevronRight, LoaderCircle, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOOKING_FILTERS,
  countBookings,
  filterBookings,
  type BookingFilter,
} from "@/lib/renter/booking-filters";
import { datesInRange, parseIsoDate } from "@/lib/utils/availability";
import { getDateFnsLocale } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type ManualBooking = Tables<"manual_bookings">;

const PAGE_SIZE = 10;

export default function BookingListPanel({
  bookings,
  loading,
  error,
  onRetry,
  todayIso,
  onOpen,
  onRestore,
}: {
  bookings: ManualBooking[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  todayIso: string;
  onOpen: (booking: ManualBooking) => void;
  onRestore: (booking: ManualBooking) => Promise<unknown>;
}) {
  const t = useTranslations("RenterCalendar.list");
  const locale = useLocale();
  const [filter, setFilter] = useState<BookingFilter>("current");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const counts = useMemo(
    () => countBookings(bookings, todayIso, query),
    [bookings, todayIso, query],
  );
  const rows = useMemo(
    () => filterBookings(bookings, filter, todayIso, query),
    [bookings, filter, todayIso, query],
  );

  // Same pattern as the booking modal's date fields (DateField).
  const formatDate = (date: Date) =>
    format(date, "d MMM, yyyy", { locale: getDateFnsLocale(locale) });

  const restore = async (booking: ManualBooking) => {
    setRestoringId(booking.id);
    try {
      await onRestore(booking);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-[16px] font-black text-[#0F172A]">{t("title")}</h2>
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-4 text-[13px] font-medium text-[#1E293B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
          />
        </div>
      </div>

      <div
        role="group"
        aria-label={t("filtersLabel")}
        className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {BOOKING_FILTERS.map((key) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(key);
                setVisible(PAGE_SIZE);
              }}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-bold transition-colors",
                active
                  ? "border-[#2563EB] bg-[#2563EB] text-white"
                  : "border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]",
              )}
            >
              {t(`filters.${key}`)}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-black",
                  active ? "bg-white/20" : "bg-[#F1F5F9] text-[#64748B]",
                )}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {loading && bookings.length === 0 ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="size-6 animate-spin text-[#2563EB]" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-[13px] font-semibold text-[#B91C1C]">
            {t("loadError")}
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 block min-h-11 font-black underline"
            >
              {t("retry")}
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl bg-[#F8FAFC] p-4 text-[13px] font-medium text-[#64748B]">
            {query.trim() ? t("noMatches") : t(`empty.${filter}`)}
          </p>
        ) : (
          <ul className="divide-y divide-[#F1F5F9]">
            {rows.slice(0, visible).map((b) => {
              const nights = Math.max(
                datesInRange(b.check_in, b.check_out).length - 1,
                1,
              );
              const isCurrent =
                b.status !== "cancelled" &&
                b.check_in <= todayIso &&
                b.check_out >= todayIso;
              const details = [
                `${formatDate(parseIsoDate(b.check_in))} – ${formatDate(parseIsoDate(b.check_out))}`,
                t("nights", { count: nights }),
                b.guests_count ? t("guests", { count: b.guests_count }) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const meta = [
                b.guest_phone,
                b.amount != null ? `${Number(b.amount)} ₾` : null,
                filter === "recent" && b.created_at
                  ? t("addedOn", { date: formatDate(new Date(b.created_at)) })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const body = (
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[14px] font-black text-[#0F172A]">
                    <span className="truncate">
                      {b.guest_name || t("unnamedGuest")}
                    </span>
                    {isCurrent && filter !== "current" && (
                      <span className="shrink-0 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#15803D]">
                        {t("filters.current")}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[#475569]">
                    {details}
                  </p>
                  {meta && (
                    <p className="mt-0.5 truncate text-[12px] text-[#94A3B8]">
                      {meta}
                    </p>
                  )}
                </div>
              );

              return (
                <li key={b.id}>
                  {b.status === "cancelled" ? (
                    <div className="flex min-h-11 items-center gap-3 py-3">
                      {body}
                      <button
                        type="button"
                        disabled={restoringId === b.id}
                        onClick={() => void restore(b)}
                        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#DCFCE7] px-3 text-[12px] font-black text-[#15803D] hover:bg-[#BBF7D0] disabled:opacity-60"
                      >
                        {restoringId === b.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="size-4" />
                        )}
                        {t("restore")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpen(b)}
                      className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-[#F8FAFC]"
                    >
                      {body}
                      <ChevronRight className="size-4 shrink-0 text-[#94A3B8]" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > visible && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E2E8F0] text-[12px] font-black text-[#475569] hover:bg-[#F8FAFC]"
          >
            {t("showMore", { count: rows.length - visible })}
          </button>
        )}
      </div>
    </section>
  );
}
