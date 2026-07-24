"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import ConstructionProgressBar from "@/components/shared/ConstructionProgressBar";
import { formatNumber } from "@/lib/utils/format";
import { useFavorite } from "@/lib/hooks/useFavorite";
import { isDiscountActive, applyDiscount } from "@/lib/utils/pricing";
import { FavoriteButton } from "@/components/shared/FavoriteButton";
import { ListingBadge } from "@/components/shared/ListingBadge";
import { ListingCardAction } from "@/components/shared/ListingCardAction";

interface SalePropertyCardProps {
  id: string;
  title: string;
  location: string;
  photos: string[];
  priceUsd: number;
  /** `properties.type` — only used to render land plots as plots, not houses. */
  type?: string | null;
  area?: number | null;
  rooms?: number | null;
  isVip?: boolean;
  roi?: number;
  constructionStatus?: string | null;
  constructionProgressPercent?: number | null;
  discountPercent: number;
  discountExpiresAt: string | null;
}

function formatUsd(n: number): string {
  return `$${formatNumber(n)}`;
}

export default function SalePropertyCard({
  id,
  title,
  location,
  photos,
  priceUsd,
  type,
  area,
  rooms,
  isVip,
  roi,
  constructionStatus,
  constructionProgressPercent,
  discountPercent,
  discountExpiresAt,
}: SalePropertyCardProps) {
  const t = useTranslations("SalePropertyCard");
  const {
    isFavorited,
    busy: favoriteBusy,
    toggle: toggleFavorite,
  } = useFavorite({ propertyId: id });
  const isLand = type === "land";
  const showProgress =
    !isLand &&
    constructionStatus === "under_construction" &&
    constructionProgressPercent != null;
  const href = `/sales/${id}`;
  const photoUrl = photos[0] ?? "/placeholder-property.jpg";

  const areaText = area
    ? t(isLand ? "plotAreaSqm" : "areaSqm", { area })
    : null;
  const roomsText = !isLand && rooms ? t("rooms", { count: rooms }) : null;
  const sizePill = areaText
    ? `${areaText}${roomsText ? ` • ${roomsText}` : ""}`
    : roomsText;

  const discountActive = isDiscountActive(discountPercent, discountExpiresAt);
  const displayPriceUsd = applyDiscount(
    priceUsd,
    discountPercent,
    discountExpiresAt,
  );
  const pricePerSqm =
    !isLand && area && displayPriceUsd
      ? Math.round(displayPriceUsd / area)
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
        href={href}
        className="flex h-full flex-col overflow-hidden rounded-[20px] border border-[#E7EEE9] bg-white shadow-[0px_4px_16px_-2px_rgba(15,61,46,0.08)] transition-shadow hover:shadow-[0px_12px_28px_-6px_rgba(15,61,46,0.18)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />

          <ListingBadge
            variant="sale"
            className="absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] tracking-[0.5px]"
          >
            {t("forSale")}
          </ListingBadge>

          {isVip && (
            <ListingBadge variant="vip" className="absolute left-3 top-12">
              VIP
            </ListingBadge>
          )}

          {discountActive && (
            <ListingBadge
              variant="discount"
              className={`absolute left-3 ${isVip ? "top-20" : "top-12"}`}
            >
              -{discountPercent}%
            </ListingBadge>
          )}

          <FavoriteButton
            pressed={isFavorited}
            onPressedChange={toggleFavorite}
            disabled={favoriteBusy}
            ariaLabel={t("favoriteAria")}
            className="absolute right-3 top-3"
          />
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[11px] font-bold leading-[16px] text-[#94A3B8]">
              <MapPin className="h-[11px] w-[11px] text-[#CBD5E1]" />
              {location}
            </p>
            {roi !== undefined && (
              <span className="shrink-0 rounded-full bg-[#F0FDF4] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.5px] text-[#16A34A]">
                ROI {roi}%
              </span>
            )}
          </div>

          <h3 className="mt-1 line-clamp-2 text-[16px] font-black leading-[20px] text-[#1E293B]">
            {title}
          </h3>

          {sizePill && (
            <p className="mt-2 text-[12px] font-medium text-[#64748B]">
              {sizePill}
            </p>
          )}

          {showProgress && (
            <div className="mt-3">
              <ConstructionProgressBar
                percent={constructionProgressPercent!}
                label={t("construction")}
                size="sm"
              />
            </div>
          )}

          <div className="mt-auto flex items-end justify-between gap-3 pt-4">
            <div>
              {discountActive && (
                <span className="block whitespace-nowrap text-[12px] font-bold leading-[16px] text-[#94A3B8] line-through">
                  {formatUsd(priceUsd)}
                </span>
              )}
              <span className="block whitespace-nowrap text-[22px] font-black leading-[28px] text-[#16A34A]">
                {formatUsd(displayPriceUsd)}
              </span>
              {pricePerSqm && (
                <span className="block text-[11px] font-medium text-[#94A3B8]">
                  {t("pricePerSqm", { price: `$${formatNumber(pricePerSqm)}` })}
                </span>
              )}
            </div>
            <ListingCardAction className="rounded-full px-4 py-2">
              {t("details")}
            </ListingCardAction>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
