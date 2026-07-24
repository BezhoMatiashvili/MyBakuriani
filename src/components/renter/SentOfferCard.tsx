"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, Eye, EyeOff, Home, Users } from "lucide-react";
import { formatDateRange, formatNumber } from "@/lib/utils/format";
import { formatRelativeTime } from "@/lib/i18n/relativeTime";
import type { Tables } from "@/lib/types/database";

export type SentOffer = Tables<"smart_match_offers"> & {
  properties: Pick<Tables<"properties">, "title"> | null;
  smart_match_requests:
    | (Pick<
        Tables<"smart_match_requests">,
        | "zone"
        | "check_in"
        | "check_out"
        | "budget_min"
        | "budget_max"
        | "guests_count"
      > & { profiles: Pick<Tables<"profiles">, "display_name"> | null })
    | null;
};

export default function SentOfferCard({
  offer,
  allZonesLabel,
  onCancel,
}: {
  offer: SentOffer;
  allZonesLabel: string;
  onCancel: (id: string) => void;
}) {
  const t = useTranslations("RenterSmartMatch");
  const tShared = useTranslations("DashboardShared");
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);

  const cancelled = offer.status === "cancelled";
  const canCancel = offer.status === "pending";
  const request = offer.smart_match_requests;
  const guestName = request?.profiles?.display_name ?? tShared("defaultGuest");
  const zoneLabel = request?.zone ?? allZonesLabel;
  const dateRange =
    request?.check_in && request?.check_out
      ? formatDateRange(request.check_in, request.check_out, locale)
      : null;

  return (
    <div className="flex flex-col rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[14px] font-extrabold text-[#0F172A]">
          <Home className="h-4 w-4 shrink-0 text-[#0F8F60]" />
          {offer.properties?.title ?? "—"}
        </span>
        {cancelled ? (
          <span className="shrink-0 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-bold text-[#64748B]">
            {t("sentOffersCancelled")}
          </span>
        ) : (
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              offer.guest_seen
                ? "bg-[#ECFDF5] text-[#10B981]"
                : "bg-[#F1F5F9] text-[#64748B]"
            }`}
          >
            {offer.guest_seen ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
            {offer.guest_seen ? t("sentOffersSeen") : t("sentOffersNotSeen")}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-medium text-[#64748B]">
        <span className="font-bold text-[#0F8F60]">
          {guestName} · {zoneLabel}
        </span>
        {dateRange && (
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {dateRange}
          </span>
        )}
        {request?.guests_count != null && (
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {t("guestsCount", { count: request.guests_count })}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EEF1F4] pt-3">
        <span className="text-[13px] font-black text-[#0F172A]">
          {formatNumber(Number(offer.offered_price))} ₾
        </span>
        {canCancel ? (
          confirming ? (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onCancel(offer.id);
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
          )
        ) : (
          <span className="text-[11px] font-medium text-[#94A3B8]">
            {formatRelativeTime(tShared, offer.created_at)}
          </span>
        )}
      </div>
    </div>
  );
}
