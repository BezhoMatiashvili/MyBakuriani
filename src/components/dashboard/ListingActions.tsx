"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Eye,
  Pencil,
  Percent,
  Rocket,
  Star,
  Ticket,
  Zap,
} from "lucide-react";
import type { VipInfoTier } from "@/components/renter/VipInfoModal";

interface ListingActionsProps {
  /** Public guest-view URL — opened in a new tab. */
  viewUrl: string;
  /** Create-form edit URL. */
  editUrl: string;
  /** When provided, renders the promote tier row. */
  onPromote?: (tier: VipInfoTier) => void;
  /** Active SUPER VIP makes buying standard VIP invalid. */
  standardVipDisabled?: boolean;
  /** Extra buttons rendered inline after Edit (e.g. delete, construction). */
  children?: ReactNode;
  className?: string;
  /** Opt-in phone layout used by the compact seller-overview cards. */
  mobilePresentation?: "default" | "seller-overview";
}

/**
 * Shared action row for dashboard listing cards: view (new tab) +
 * edit + optional promote tier row.
 */
export default function ListingActions({
  viewUrl,
  editUrl,
  onPromote,
  standardVipDisabled = false,
  children,
  className,
  mobilePresentation = "default",
}: ListingActionsProps) {
  const t = useTranslations("ListingActions");
  const tShared = useTranslations("DashboardShared");
  const sellerOverview = mobilePresentation === "seller-overview";
  const vipDisabledReason = tShared("superVipBlocksVip");

  return (
    <div className={className}>
      {sellerOverview && (
        <div className="sm:hidden">
          {onPromote && (
            <div
              data-testid="seller-mobile-promotions"
              className="grid grid-cols-3 gap-2 border-t border-[#F1F5F9] pt-3"
            >
              <button
                type="button"
                onClick={() => onPromote("super-vip")}
                className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] px-1.5 text-[10px] font-black uppercase tracking-tight text-[#EA580C] transition-colors hover:bg-[#FFEDD5]"
              >
                <Zap className="size-3 shrink-0" />
                <span className="truncate">SUPER VIP</span>
              </button>
              <button
                type="button"
                disabled={standardVipDisabled}
                onClick={() => onPromote("vip")}
                aria-label={standardVipDisabled ? `VIP — ${vipDisabledReason}` : "VIP"}
                title={standardVipDisabled ? vipDisabledReason : undefined}
                className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#FBCFE8] bg-[#FCE7F3] px-1.5 text-[10px] font-black uppercase tracking-tight text-[#BE185D] transition-colors hover:bg-[#FBCFE8] disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-0"
              >
                <Star className="size-3 shrink-0" />
                VIP
              </button>
              <button
                type="button"
                onClick={() => onPromote("discount")}
                className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#86EFAC] bg-[#DCFCE7] px-1.5 text-[10px] font-black text-[#15803D] transition-colors hover:bg-[#BBF7D0]"
              >
                <Percent className="size-3 shrink-0" />
                <span className="truncate">{t("discount")}</span>
              </button>
            </div>
          )}
          <div
            data-testid="seller-mobile-actions"
            className="mt-3 grid grid-cols-2 gap-2 border-t border-[#F1F5F9] pt-3"
          >
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#2563EB] transition-colors hover:border-[#2563EB] hover:bg-[#EFF6FF]"
            >
              <Eye className="size-3.5" />
              {t("view")}
            </a>
            <Link
              href={editUrl}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
            >
              <Pencil className="size-3.5" />
              {t("edit")}
            </Link>
            {children}
          </div>
        </div>
      )}

      <div className={sellerOverview ? "hidden sm:block" : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[12px] font-bold text-[#2563EB] transition-colors hover:border-[#2563EB] hover:bg-[#EFF6FF]"
          >
            <Eye className="h-3.5 w-3.5" />
            {t("view")}
          </a>
          <Link
            href={editUrl}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("edit")}
          </Link>
          {children}
        </div>

        {onPromote && (
          <div
            data-testid="listing-promotions"
            className="mt-3 grid grid-cols-3 gap-2 border-t border-[#F1F5F9] pt-3 sm:flex sm:flex-wrap sm:items-center"
          >
            <span className="col-span-3 w-full text-[12px] font-semibold text-[#64748B] sm:mr-auto sm:w-auto">
              {t("promote")}
            </span>
            <button
              type="button"
              onClick={() => onPromote("super-vip")}
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] px-1.5 text-[10px] font-black uppercase tracking-tight text-[#EA580C] transition-colors hover:bg-[#FFEDD5] sm:min-h-0 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-wide"
            >
              <Rocket className="size-3 shrink-0" />
              <span className="truncate">SUPER VIP</span>
            </button>
            <button
              type="button"
              disabled={standardVipDisabled}
              onClick={() => onPromote("vip")}
              aria-label={standardVipDisabled ? `VIP — ${vipDisabledReason}` : "VIP"}
              title={standardVipDisabled ? vipDisabledReason : undefined}
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#FBCFE8] bg-[#FCE7F3] px-1.5 text-[10px] font-black uppercase tracking-tight text-[#BE185D] transition-colors hover:bg-[#FBCFE8] disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-0 sm:min-h-0 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-wide"
            >
              <Ticket className="size-3 shrink-0" />
              VIP
            </button>
            <button
              type="button"
              onClick={() => onPromote("discount")}
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#86EFAC] bg-[#DCFCE7] px-1.5 text-[10px] font-black tracking-tight text-[#15803D] transition-colors hover:bg-[#BBF7D0] sm:min-h-0 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-wide"
            >
              <Percent className="size-3 shrink-0" />
              <span className="truncate">{t("discount")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
