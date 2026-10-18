"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { differenceInDays } from "date-fns";
import { Check, Copy, Home, Link2, LoaderCircle } from "lucide-react";
import { parseISODate } from "@/components/shared/DateField";
import { formatDate, formatDateRange, formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Guest = Tables<"renter_guests">;

/** One stay attributed to a guest, unified across manual + platform bookings. */
export interface VisitHistory {
  id: string;
  source: "manual" | "platform";
  propertyTitle: string | null;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  amount: number | null;
  status: string | null;
}

/** Booking-status enum values worth badging; other values (manual 'booked'
 *  /'manual') get no badge since the source badge already conveys them. */
const STATUS_META: Record<string, string> = {
  pending: "bg-[#FEF3C7] text-[#D97706]",
  confirmed: "bg-[#DCFCE7] text-[#16A34A]",
  completed: "bg-[#E0E7FF] text-[#4F46E5]",
  cancelled: "bg-[#FEE2E2] text-[#DC2626]",
};

/** Nights between two ISO dates. parseISODate builds a local-time Date, so this
 *  is immune to the UTC+4 off-by-one in Georgia. Nights, not inclusive days. */
function nightsOf(checkIn: string, checkOut: string): number {
  const a = parseISODate(checkIn);
  const b = parseISODate(checkOut);
  return a && b ? Math.max(0, differenceInDays(b, a)) : 0;
}

/**
 * Render the stored visit_dates value for the fallback entry. New guest records
 * store "checkIn/checkOut" ISO; legacy ones a single ISO date or free text.
 * Duplicated from the guests page (kept tiny) to avoid a page<->component cycle.
 */
function formatVisit(raw: string | null, locale: string): string {
  const isISO = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const [a, b] = (raw ?? "").split("/");
  if (isISO(a) && isISO(b))
    return formatDateRange(parseISODate(a)!, parseISODate(b)!, locale);
  if (isISO(a)) return formatDate(parseISODate(a), locale);
  return raw || "—";
}

type ReviewLinkErrorCode =
  | "not_consented"
  | "already_reviewed"
  | "not_past_checkout"
  | "cancelled_booking"
  | "generic";

/** Inline "generate a review link" action for a completed manual stay — mints
 *  a one-off token via sms_create_manual_review_token (owner-triggered,
 *  independent of the SMS-automation opt-in toggle) and shows the resulting
 *  /review/<token> URL to copy and hand to the guest. */
function ReviewLinkAction({ manualBookingId }: { manualBookingId: string }) {
  const t = useTranslations("RenterGuests.reviewLink");
  const locale = useLocale();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<ReviewLinkErrorCode | null>(null);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/renter/manual-bookings/${manualBookingId}/review-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.url) {
        const code = payload?.error;
        setError(
          code === "not_consented" ||
            code === "already_reviewed" ||
            code === "not_past_checkout" ||
            code === "cancelled_booking"
            ? code
            : "generic",
        );
        return;
      }
      setUrl(payload.url);
    } catch {
      setError("generic");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (url) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5">
        <p className="min-w-0 flex-1 truncate text-[11px] text-[#475569]">
          {url}
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#F1F5F9] px-2 py-1 text-[10px] font-bold text-[#334155]"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => void generate()}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-bold text-[#1D4ED8] disabled:opacity-60"
      >
        {loading ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Link2 className="size-3.5" />
        )}
        {t("generate")}
      </button>
      {error && (
        <p className="mt-1 text-[11px] font-semibold text-[#B91C1C]">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}

export default function GuestHistoryPanel({
  guest,
  stays,
}: {
  guest: Guest;
  stays: VisitHistory[];
}) {
  const t = useTranslations("RenterGuests");
  const locale = useLocale();

  const summary = useMemo(() => {
    let nights = 0;
    let paid = 0;
    for (const s of stays) {
      nights += nightsOf(s.checkIn, s.checkOut);
      if (s.amount != null) paid += s.amount;
    }
    return { visits: stays.length, nights, paid };
  }, [stays]);

  // No linked stays: surface the manually-entered visit_dates if present.
  if (stays.length === 0) {
    if (guest.visit_dates) {
      return (
        <div className="px-4 pb-5 pt-1 sm:px-6">
          <ul className="space-y-2">
            <li className="rounded-xl border border-[#EEF1F4] bg-[#F8FAFC] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-extrabold text-[#0F172A]">
                  {formatVisit(guest.visit_dates, locale)}
                </p>
                <span className="inline-flex items-center rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                  {t("manuallyAdded")}
                </span>
              </div>
            </li>
          </ul>
        </div>
      );
    }
    return (
      <div className="px-4 pb-5 pt-2 text-center text-[13px] text-[#94A3B8] sm:px-6">
        {t("historyEmpty")}
      </div>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="px-4 pb-5 pt-1 sm:px-6">
      <p className="mb-2.5 text-[12px] font-bold text-[#64748B]">
        {t("historySummary", {
          visits: summary.visits,
          nights: summary.nights,
          total: formatPrice(summary.paid),
        })}
      </p>
      <ul className="space-y-2">
        {stays.map((s) => {
          const statusCls = s.status ? STATUS_META[s.status] : undefined;
          const canReview =
            s.source === "manual" &&
            s.status !== "cancelled" &&
            s.checkOut < todayIso;
          return (
            <li
              key={`${s.source}-${s.id}`}
              className="rounded-xl border border-[#EEF1F4] bg-[#F8FAFC] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Home
                    className="h-4 w-4 shrink-0 text-[#94A3B8]"
                    strokeWidth={2.2}
                    aria-hidden
                  />
                  <span className="truncate text-[13px] font-extrabold text-[#0F172A]">
                    {s.propertyTitle || "—"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      s.source === "platform"
                        ? "bg-[#DBEAFE] text-[#2563EB]"
                        : "bg-[#FEF3C7] text-[#D97706]"
                    }`}
                  >
                    {s.source === "platform"
                      ? t("sourcePlatform")
                      : t("sourceManual")}
                  </span>
                  {statusCls && (
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusCls}`}
                    >
                      {t(`status.${s.status}` as "status.pending")}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#475569]">
                <span>
                  {formatDateRange(
                    parseISODate(s.checkIn)!,
                    parseISODate(s.checkOut)!,
                    locale,
                  )}
                </span>
                <span className="text-[#94A3B8]">
                  ·{" "}
                  {t("nightsLabel", { count: nightsOf(s.checkIn, s.checkOut) })}
                </span>
                <span className="font-extrabold text-[#0F172A]">
                  {s.amount != null ? formatPrice(s.amount) : "—"}
                </span>
              </div>
              {canReview && <ReviewLinkAction manualBookingId={s.id} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
