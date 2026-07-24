"use client";

import { motion } from "framer-motion";
import { Heart, MapPin, Tag } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/lib/utils/format";
import { useFavorite } from "@/lib/hooks/useFavorite";
import { FALLBACK_ZONES } from "@/lib/zones/types";
import {
  optionKeyFor,
  type OptionGroup,
} from "@/lib/constants/listing-options";

function formatUsd(n: number): string {
  return `$${formatNumber(n)}`;
}

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
}: InvestmentCardProps) {
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

  const pricePerSqm =
    !isLand && salePrice != null && areaSqm && areaSqm > 0
      ? Math.round(salePrice / areaSqm)
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
        className="flex h-full flex-col overflow-hidden rounded-[20px] border border-[#F1F5F9] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0px_10px_30px_-4px_rgba(0,0,0,0.08)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={photo}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />

          <span className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-[#16A34A] px-3 py-1.5 text-[12px] font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.1)]">
            <Tag className="h-3 w-3" />
            {t("forSale")}
          </span>

          <button
            type="button"
            onClick={toggleFavorite}
            disabled={favoriteBusy}
            aria-label={t("favoriteAria")}
            aria-pressed={isFavorited}
            className={`absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full shadow-[0px_1px_2px_rgba(0,0,0,0.1)] transition-colors ${
              isFavorited
                ? "bg-[#F97316] text-white"
                : "bg-white text-[#94A3B8] hover:text-[#F97316]"
            } disabled:opacity-60`}
          >
            <Heart className={`h-5 w-5 ${isFavorited ? "fill-current" : ""}`} />
          </button>
        </div>

        <div className="flex flex-1 flex-col p-5">
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

          <h3 className="mt-2 truncate text-[17px] font-black leading-[22px] text-[#1E293B]">
            {title}
          </h3>

          {subtitle && (
            <p className="mt-1 truncate text-[13px] leading-[20px] text-[#64748B]">
              {subtitle}
            </p>
          )}

          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <div className="min-w-0">
              {salePrice != null ? (
                <span className="block whitespace-nowrap text-[24px] font-black leading-[30px] text-[#0F172A]">
                  {formatUsd(salePrice)}
                </span>
              ) : null}
              {pricePerSqm != null && (
                <span className="mt-0.5 block text-[12px] font-medium text-[#94A3B8]">
                  {t("pricePerSqm", { price: formatUsd(pricePerSqm) })}
                </span>
              )}
            </div>
            <span className="shrink-0 rounded-[12px] bg-[#16A34A] px-5 py-2 text-[13px] font-bold text-white transition-colors group-hover:bg-[#15803D]">
              {t("details")}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
