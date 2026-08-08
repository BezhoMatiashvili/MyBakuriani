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
import {
  ListingAgeBadge,
  NewlyAddedBadge,
} from "@/components/shared/ListingRecency";

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
  /** house_rules.payment_options codes; read via readPaymentOptions(). */
  paymentOptions?: string[];
  createdAt: string | null;
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
  paymentOptions,
  createdAt,
}: SalePropertyCardProps) {
  const t = useTranslations("SalePropertyCard");
  const tOpts = useTranslations("ListingOptions");
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
        <div className="relative aspect-[8/5] overflow-hidden lg:aspect-[4/3]">
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

          <NewlyAddedBadge
            createdAt={createdAt}
            className="absolute bottom-3 left-3"
          />
        </div>

        <div className="flex flex-1 flex-col p-4 lg:p-5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 text-[11px] font-bold leading-[16px] text-[#94A3B8]">
              <MapPin className="h-[11px] w-[11px] shrink-0 text-[#CBD5E1]" />
              <span className="truncate">{location}</span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <ListingAgeBadge createdAt={createdAt} />
              {roi !== undefined && (
                <span className="shrink-0 rounded-full bg-[#F0FDF4] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.5px] text-[#16A34A]">
                  ROI {roi}%
                </span>
              )}
            </div>
          </div>

          <h3 className="mt-1 line-clamp-2 text-[16px] font-black leading-[20px] text-[#1E293B]">
            {title}
          </h3>

          {sizePill && (
            <p className="mt-2 text-[12px] font-medium text-[#64748B]">
              {sizePill}
            </p>
          )}

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
