"use client";

import { useTranslations } from "next-intl";
import { ListingBadge } from "@/components/shared/ListingBadge";
import { cn } from "@/lib/utils";
import {
  daysRemaining,
  isDiscountActive,
  isSuperVipActive,
} from "@/lib/utils/pricing";

interface ListingPromotionBadgesProps {
  isVip?: boolean | null;
  isSuperVip?: boolean | null;
  vipExpiresAt?: string | null;
  discountPercent?: number | null;
  discountExpiresAt?: string | null;
  presentation?: "inline" | "overlay";
  className?: string;
}

/** Owner-dashboard promotion state shared by property and service cards. */
export default function ListingPromotionBadges({
  isVip,
  isSuperVip,
  vipExpiresAt,
  discountPercent,
  discountExpiresAt,
  presentation = "inline",
  className,
}: ListingPromotionBadgesProps) {
  const t = useTranslations("DashboardShared");
  const vipDays = daysRemaining(vipExpiresAt);
  const discountDays = daysRemaining(discountExpiresAt);
  const hasActiveSuperVip = isSuperVipActive(isSuperVip, vipExpiresAt);
  const hasActiveStandardVip =
    Boolean(isVip) && (!vipExpiresAt || vipDays !== null);
  const hasActiveVip = hasActiveSuperVip || hasActiveStandardVip;
  const hasActiveDiscount = isDiscountActive(
    discountPercent,
    discountExpiresAt,
  );

  if (!hasActiveVip && !hasActiveDiscount) return null;

  const overlay = presentation === "overlay";
  const vipTier = hasActiveSuperVip ? "super-vip" : "vip";

  return (
    <div
      data-testid="listing-promotion-status"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {hasActiveVip && (
        <span
          data-promotion-tier={vipTier}
          className={cn(
            "inline-flex items-center bg-[#FEF3C7] font-bold text-[#A16207]",
            overlay
              ? "rounded-md px-3 py-1.5 text-[11px] font-black uppercase"
              : "rounded-full px-2 py-0.5 text-[10px]",
            hasActiveSuperVip && "bg-[#F3E8FF] text-[#7E22CE]",
          )}
        >
          {hasActiveSuperVip ? "SUPER VIP" : "VIP"}
          {vipDays !== null && (
            <span className="ml-1">
              · {t("daysRemaining", { count: vipDays })}
            </span>
          )}
        </span>
      )}

      {hasActiveDiscount && (
        <span data-promotion-tier="discount">
          <ListingBadge
            variant="discount"
            className={cn(
              "normal-case",
              overlay && "rounded-md px-3 py-1.5 text-[11px]",
            )}
          >
            −{discountPercent}%
            {discountDays !== null && (
              <span>· {t("daysRemaining", { count: discountDays })}</span>
            )}
          </ListingBadge>
        </span>
      )}
    </div>
  );
}
