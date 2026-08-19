"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, CalendarDays, Users } from "lucide-react";
import { formatDateRange, formatNumber } from "@/lib/utils/format";
import type { MyRequest } from "@/app/[locale]/dashboard/guest/loadData";

export default function MyRequestCard({
  request,
  locale,
  allZonesLabel,
  expired,
  onCancel,
}: {
  request: MyRequest;
  locale: string;
  allZonesLabel: string;
  /** isStale(request, today) — check-out date has passed. */
  expired: boolean;
  onCancel: (id: string) => void;
}) {
  const t = useTranslations("GuestDashboard.myRequests");
  const [confirming, setConfirming] = useState(false);

  const cancelled = request.status === "cancelled";
  const zoneLabel = request.zone ?? allZonesLabel;

  const dateRange =
    request.checkIn && request.checkOut
      ? formatDateRange(request.checkIn, request.checkOut, locale)
      : "—";

  const budgetAmount =
    request.budgetMin != null && request.budgetMax != null
      ? `${formatNumber(request.budgetMin)}–${formatNumber(request.budgetMax)} ₾`
      : request.budgetMax != null
        ? `≤ ${formatNumber(request.budgetMax)} ₾`
        : request.budgetMin != null
          ? `≥ ${formatNumber(request.budgetMin)} ₾`
          : null;
  const budget = budgetAmount
    ? `${budgetAmount} ${t("perNight")}`
    : t("anyBudget");

  // Status badge: cancelled and expired both read as inactive (gray); only a
  // live request is green and cancellable.
  const status = cancelled
    ? { label: t("statusCancelled"), cls: "bg-[#F1F5F9] text-[#64748B]" }
    : expired
      ? { label: t("statusExpired"), cls: "bg-[#F1F5F9] text-[#64748B]" }
      : { label: t("statusActive"), cls: "bg-[#ECFDF5] text-[#10B981]" };

  const canCancel = !cancelled && !expired;

  return (
    <div className="flex flex-col rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[14px] font-extrabold text-[#0F172A]">
          <MapPin className="h-4 w-4 shrink-0 text-[#0F8F60]" />
          {zoneLabel}
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${status.cls}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-medium text-[#64748B]">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {dateRange}
        </span>
        {request.guestsCount != null && (
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {t("guests", { count: request.guestsCount })}
          </span>
        )}
        <span className="font-bold text-[#0F172A]">{budget}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EEF1F4] pt-3">
        <span className="text-[12px] font-bold text-[#0F8F60]">
          {t("offerCount", { count: request.offerCount })}
        </span>
        {canCancel &&
          (confirming ? (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onCancel(request.id);
                }}
                className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2]"
              >
                {t("cancelConfirm")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg px-2.5 py-2 text-[12px] font-bold text-[#64748B] transition-colors hover:text-[#0F172A]"
              >
                {t("cancelBack")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-lg px-3 py-2 text-[12px] font-bold text-[#94A3B8] transition-colors hover:text-[#DC2626]"
            >
              {t("cancel")}
            </button>
          ))}
      </div>
    </div>
  );
}
