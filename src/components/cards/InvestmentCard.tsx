"use client";

import { motion } from "framer-motion";
import { Heart, MapPin, Tag } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils/format";
import { useFavorite } from "@/lib/hooks/useFavorite";
import { applyDiscount, isDiscountActive } from "@/lib/utils/pricing";
import { FALLBACK_ZONES } from "@/lib/zones/types";
import {
  optionKeyFor,
  type OptionGroup,
} from "@/lib/constants/listing-options";
import { cn } from "@/lib/utils";

// Seeded zone names get translated display labels (Zones.<slug>.name);
// free-text / non-seeded locations pass through raw. Display only — the
// stored location value itself must stay Georgian (zone matching uses it).
const ZONE_SLUG_BY_NAME_KA = new Map(
  FALLBACK_ZONES.map((z) => [z.name_ka, z.slug]),
);

// Data values matched against the free-text construction_status DB column —
// intentionally kept Georgian (not UI copy).
const COMPLETED_STATUSES = new Set([
  "დასრულებული",
  "completed",
  "ready",
  "მზადაა",
]);

interface InvestmentCardProps {
  id: string;
  title: string;
  location: string;
  photo: string;
  salePrice: number | null;
  /** `properties.type` — only used to render land plots as plots, not houses. */
  type?: string | null;
  areaSqm: number | null;
  roiPercent: number | null;
  constructionStatus: string | null;
  frameType?: string | null;
  /** house_rules.payment_options codes; read via readPaymentOptions(). */
  paymentOptions?: string[];
  discountPercent: number;
  discountExpiresAt: string | null;
  mobilePresentation?: "default" | "compact-grid";
}

export default function InvestmentCard({
  id,
  title,
  location,
  photo,
  salePrice,
  type,
  areaSqm,
  roiPercent,
  constructionStatus,
  frameType,
  paymentOptions,
  discountPercent,
  discountExpiresAt,
  mobilePresentation = "default",
}: InvestmentCardProps) {
  const compactGrid = mobilePresentation === "compact-grid";
  const t = useTranslations("InvestmentCard");
  const tZones = useTranslations("Zones");
  const tOpts = useTranslations("ListingOptions");
  const {
    isFavorited,
    busy: favoriteBusy,
    toggle: toggleFavorite,
  } = useFavorite({ propertyId: id });
  const zoneSlug = ZONE_SLUG_BY_NAME_KA.get(location);
  const locationLabel = zoneSlug ? tZones(`${zoneSlug}.name`) : location;
  const isCompleted =
    constructionStatus != null &&
    (COMPLETED_STATUSES.has(constructionStatus.trim()) ||
      COMPLETED_STATUSES.has(constructionStatus.trim().toLowerCase()));

  // DB stores Georgian labels / panel codes; translate known values, pass
  // free text through raw.
  const optLabel = (group: OptionGroup, value: string) => {
    const key = optionKeyFor(group, value.trim());
    return key ? tOpts(`${group}.${key}`) : value;
  };

  const isLand = type === "land";

  const subtitleParts: string[] = [];
  if (frameType) subtitleParts.push(optLabel("renovationStatuses", frameType));
  if (constructionStatus && !isCompleted && !isLand)
    subtitleParts.push(optLabel("constructionStatuses", constructionStatus));
  if (areaSqm)
    subtitleParts.push(
      t(isLand ? "plotAreaSqm" : "areaSqm", { area: areaSqm }),
    );
  const subtitle = subtitleParts.join(" • ");

  const discountActive = isDiscountActive(discountPercent, discountExpiresAt);
  const displayPrice =
    salePrice != null
      ? applyDiscount(salePrice, discountPercent, discountExpiresAt)
      : null;

  // Derived from the DISCOUNTED price so the ₾/m² line cannot contradict the
  // headline above it — same as SalePropertyCard and the sale detail sidebar.
  const pricePerSqm =
    !isLand && displayPrice != null && areaSqm && areaSqm > 0
      ? Math.round(displayPrice / areaSqm)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
      className="group h-full"
    >
      <Link
        href={`/sales/${id}`}
        data-mobile-presentation={mobilePresentation}
        className={cn("flex h-full flex-col overflow-hidden border border-[#F1F5F9] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0px_10px_30px_-4px_rgba(0,0,0,0.08)]", compactGrid ? "rounded-[16px] sm:rounded-[20px]" : "rounded-[20px]")}
      >
        <div className={cn("relative overflow-hidden lg:aspect-[4/3]", compactGrid ? "aspect-[4/3] sm:aspect-[8/5]" : "aspect-[8/5]")}>
          <Image
            src={photo}
            alt={title}
            fill
            sizes={compactGrid ? "(max-width: 639px) 50vw, (max-width: 1024px) 50vw, 33vw" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />

          <span className={cn("absolute flex items-center rounded-full bg-[#16A34A] font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.1)]", compactGrid ? "left-2 top-2 gap-1 px-2 py-1 text-[9px] sm:left-4 sm:top-4 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[12px]" : "left-4 top-4 gap-1.5 px-3 py-1.5 text-[12px]")}>
            <Tag className="h-3 w-3" />
            {t("forSale")}
          </span>

          {/* Same pill geometry as the sale badge above (no icon => same 30px
              height), so top-14 stacks flush under it. */}
          {discountActive && salePrice != null && (
            <span className="absolute left-4 top-14 inline-flex items-center rounded-full bg-[#F97316] px-3 py-1.5 text-[12px] font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.1)]">
              -{discountPercent}%
            </span>
          )}

          <button
            type="button"
            onClick={toggleFavorite}
            disabled={favoriteBusy}
            aria-label={t("favoriteAria")}
            aria-pressed={isFavorited}
            className={`absolute flex h-11 w-11 items-center justify-center rounded-full shadow-[0px_1px_2px_rgba(0,0,0,0.1)] transition-colors ${compactGrid ? "right-1 top-1 sm:right-4 sm:top-4" : "right-4 top-4"} ${
              isFavorited
                ? "bg-[#F97316] text-white"
                : "bg-white text-[#94A3B8] hover:text-[#F97316]"
            } disabled:opacity-60`}
          >
            <Heart className={`h-5 w-5 ${isFavorited ? "fill-current" : ""}`} />
          </button>
        </div>

        <div className={cn("flex flex-1 flex-col lg:p-5", compactGrid ? "p-2.5 sm:p-4" : "p-4")}>
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 text-[12px] font-medium text-[#94A3B8]">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
              <span className="truncate">{locationLabel}</span>
            </p>
            {roiPercent != null && roiPercent > 0 ? (
              <span className="shrink-0 rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[11px] font-bold text-[#16A34A]">
                ROI {Number(roiPercent).toFixed(0)}%
              </span>
            ) : isCompleted ? (
              <span className="shrink-0 rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
                {t("completed")}
              </span>
            ) : null}
          </div>

          <h3 className={cn("mt-2 truncate font-black text-[#1E293B]", compactGrid ? "text-[14px] leading-[18px] sm:text-[17px] sm:leading-[22px]" : "text-[17px] leading-[22px]")}>
            {title}
          </h3>

          {subtitle && (
            <p className="mt-1 truncate text-[13px] leading-[20px] text-[#64748B]">
              {subtitle}
            </p>
          )}

          {/* Own row: the subtitle above is a dot-joined truncated line. */}
          {paymentOptions && paymentOptions.length > 0 && (
            <div className="mt-2.5 flex flex-nowrap gap-1.5 overflow-hidden">
              {paymentOptions.slice(0, 2).map((code) => (
                <span
                  key={code}
                  className="inline-flex shrink-0 items-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[10px] font-bold leading-[14px] text-[#475569]"
                >
                  {tOpts(`paymentOptions.${code}`)}
                </span>
              ))}
              {paymentOptions.length > 2 && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[10px] font-bold text-[#475569]">
                  +{paymentOptions.length - 2}
                </span>
              )}
            </div>
          )}

          <div className={cn("mt-auto gap-3 pt-5", compactGrid ? "flex flex-col items-stretch sm:flex-row sm:items-end sm:justify-between" : "flex items-end justify-between")}>
            <div className="min-w-0">
              {salePrice != null ? (
                <>
                  {discountActive && (
                    <span className="block whitespace-nowrap text-[12px] font-bold leading-[16px] text-[#94A3B8] line-through">
                      {formatPrice(salePrice)}
                    </span>
                  )}
                  <span className={cn("block whitespace-nowrap font-black text-[#0F172A]", compactGrid ? "text-[18px] leading-[24px] sm:text-[24px] sm:leading-[30px]" : "text-[24px] leading-[30px]")}>
                    {formatPrice(displayPrice!)}
                  </span>
                </>
              ) : null}
              {pricePerSqm != null && (
                <span className="mt-0.5 block text-[12px] font-medium text-[#94A3B8]">
                  {t("pricePerSqm", { price: formatPrice(pricePerSqm) })}
                </span>
              )}
            </div>
            <span className={cn("shrink-0 rounded-[12px] bg-[#16A34A] font-bold text-white transition-colors group-hover:bg-[#15803D]", compactGrid ? "flex min-h-11 w-full items-center justify-center px-2 py-2 text-[11px] sm:min-h-0 sm:w-auto sm:px-5 sm:text-[13px]" : "px-5 py-2 text-[13px]")}>
              {t("details")}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
