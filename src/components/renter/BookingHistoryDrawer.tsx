"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, History, LoaderCircle, RotateCcw, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Tables } from "@/lib/types/database";

type ManualBooking = Tables<"manual_bookings">;
type CancelledBooking = ManualBooking & {
  cancelledActor: {
    id: string;
    name: string | null;
    role: string | null;
  } | null;
};
type RestoreResult = "restored" | "conflict" | "error";

type HistoryItem = {
  id: string;
  bookingId: string | null;
  type: "created" | "edited" | "cancelled" | "restored" | "legacy_deleted";
  occurredAt: string;
  actor: { id: string | null; name: string | null; role: string | null };
  actorSource: string;
  changedFields: string[];
  snapshotComplete: boolean;
  booking: {
    guestName: string | null;
    checkIn: string | null;
    checkOut: string | null;
    source: string | null;
  };
};

type HistoryResponse = {
  items: HistoryItem[];
  cancelledBookings: CancelledBooking[];
  nextCursor: string | null;
};

export default function BookingHistoryDrawer({
  isOpen,
  propertyId,
  currentUserId,
  refreshToken,
  onClose,
  onRestore,
}: {
  isOpen: boolean;
  propertyId: string | null;
  currentUserId: string | null;
  refreshToken: number;
  onClose: () => void;
  onRestore: (booking: ManualBooking) => Promise<RestoreResult>;
}) {
  const t = useTranslations("RenterCalendar.history");
  const locale = useLocale();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cancelled, setCancelled] = useState<CancelledBooking[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (cursor: string | null = null) => {
      if (!propertyId) return;
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ property: propertyId });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/renter/calendar/history?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("history request failed");
        const body = (await response.json()) as HistoryResponse;
        setItems((current) => (cursor ? [...current, ...body.items] : body.items));
        if (!cursor) setCancelled(body.cancelledBookings);
        setNextCursor(body.nextCursor);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [propertyId],
  );

  useEffect(() => {
    if (!isOpen || !propertyId) return;
    setItems([]);
    setCancelled([]);
    setNextCursor(null);
    void load();
  }, [isOpen, propertyId, refreshToken, load]);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("button")?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  const formatWhen = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );

  const restore = async (booking: ManualBooking) => {
    setRestoringId(booking.id);
    try {
      await onRestore(booking);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end lg:items-stretch" role="presentation">
          <motion.button
            type="button"
            aria-label={t("close")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 40, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 40, x: 20 }}
            className="relative z-10 flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl lg:max-h-none lg:w-[440px] lg:rounded-none"
          >
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[#CBD5E1] lg:hidden" />
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                  <History className="size-4" />
                </span>
                <h2 id={titleId} className="text-[16px] font-black text-[#0F172A]">{t("title")}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                className="flex size-11 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F5F9]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              {loading ? (
                <div className="flex justify-center py-16"><LoaderCircle className="size-6 animate-spin text-[#2563EB]" /></div>
              ) : error ? (
                <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-[13px] font-semibold text-[#B91C1C]">
                  {t("loadError")}
                  <button type="button" onClick={() => void load()} className="mt-3 block font-black underline">{t("retry")}</button>
                </div>
              ) : (
                <div className="space-y-7">
                  <section>
                    <h3 className="text-[12px] font-black uppercase tracking-wide text-[#64748B]">{t("cancelledTitle")}</h3>
                    <div className="mt-3 space-y-3">
                      {cancelled.length === 0 ? (
                        <p className="rounded-2xl bg-[#F8FAFC] p-4 text-[13px] font-medium text-[#64748B]">{t("cancelledEmpty")}</p>
                      ) : cancelled.map((booking) => (
                        <div key={booking.id} className="rounded-2xl border border-[#E2E8F0] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-black text-[#0F172A]">{booking.guest_name || t("unnamedGuest")}</p>
                              <p className="mt-1 text-[12px] font-semibold text-[#64748B]">{booking.check_in} — {booking.check_out}</p>
                              {booking.cancelled_at && <p className="mt-1 text-[11px] text-[#94A3B8]">{t("cancelledAt", { date: formatWhen(booking.cancelled_at) })}</p>}
                              {booking.cancelled_by && (
                                <p className="mt-1 text-[11px] text-[#94A3B8]">
                                  {t("cancelledBy", {
                                    name:
                                      booking.cancelled_by === currentUserId
                                        ? t("you")
                                        : booking.cancelledActor?.name || t("system"),
                                  })}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={restoringId === booking.id}
                              onClick={() => void restore(booking)}
                              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#DCFCE7] px-3 text-[12px] font-black text-[#15803D] hover:bg-[#BBF7D0] disabled:opacity-60"
                            >
                              {restoringId === booking.id ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                              {t("restore")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[12px] font-black uppercase tracking-wide text-[#64748B]">{t("activityTitle")}</h3>
                    <div className="mt-3 space-y-1">
                      {items.length === 0 ? (
                        <p className="rounded-2xl bg-[#F8FAFC] p-4 text-[13px] font-medium text-[#64748B]">{t("activityEmpty")}</p>
                      ) : items.map((item) => (
                        <div key={item.id} className="flex gap-3 border-b border-[#F1F5F9] py-3 last:border-0">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F8FAFC] text-[#64748B]">
                            {item.type === "legacy_deleted" ? <Trash2 className="size-3.5" /> : <CalendarClock className="size-3.5" />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-[#0F172A]">{t(`events.${item.type}`)}</p>
                            <p className="mt-0.5 truncate text-[12px] text-[#64748B]">
                              {item.booking.guestName || t("unnamedGuest")}
                              {item.booking.checkIn && item.booking.checkOut ? ` · ${item.booking.checkIn} — ${item.booking.checkOut}` : ""}
                            </p>
                            <p className="mt-1 text-[11px] text-[#94A3B8]">
                              {formatWhen(item.occurredAt)} · {item.actor.id === currentUserId ? t("you") : item.actor.name || t("system")}
                            </p>
                            {!item.snapshotComplete && item.type !== "legacy_deleted" && (
                              <p className="mt-1 text-[11px] font-semibold text-[#B45309]">{t("legacyDetailsIncomplete")}</p>
                            )}
                            {item.type === "legacy_deleted" && <p className="mt-1 text-[11px] font-semibold text-[#B45309]">{t("legacyNotRestorable")}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {nextCursor && (
                      <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() => void load(nextCursor)}
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] text-[12px] font-black text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-60"
                      >
                        {loadingMore && <LoaderCircle className="size-4 animate-spin" />}
                        {t("loadMore")}
                      </button>
                    )}
                  </section>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
