"use client";

import { MapPin, Clock, Star } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils/format";
import { isDiscountActive, applyDiscount } from "@/lib/utils/pricing";
import { useFavorite } from "@/lib/hooks/useFavorite";
import ConstructionProgressBar from "@/components/shared/ConstructionProgressBar";
import { optionKeyFor } from "@/lib/constants/listing-options";
import { FavoriteButton } from "@/components/shared/FavoriteButton";
import { ListingBadge } from "@/components/shared/ListingBadge";
import { ListingCardAction } from "@/components/shared/ListingCardAction";

function formatNum(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

interface PropertyCardProps {
  id: string;
  title: string;
  location: string;
  photos: string[];
  pricePerNight: number | null;
  salePrice: number | null;
  rating: number | null;
  capacity: number | null;
  rooms: number | null;
  isVip: boolean;
  isSuperVip: boolean;
  discountPercent: number;
  discountExpiresAt: string | null;
  isForSale: boolean;
  isHotel?: boolean;
  numericRating?: number;
  isB2BPartner?: boolean;
  hotelStars?: number;
  roomType?: string;
  amenities?: string;
  amenityTags?: string[];
  distanceToSlopeM?: number | null;
  constructionStatus?: string | null;
  constructionProgressPercent?: number | null;
  // Set on the first 1–2 cards of the first visible section so Next/Image
  // preloads them — improves landing LCP. Default false (lazy).
  priority?: boolean;
}

function extractZone(location: string): string {
  return location.includes(",")
    ? location.split(",").pop()?.trim() || location
    : location;
}

export default function PropertyCard(props: PropertyCardProps) {
  const t = useTranslations("PropertyCard");
  const tOpts = useTranslations("ListingOptions");
  const {
    id,
    title,
    location,
    photos,
    pricePerNight,
    salePrice,
    capacity,
    rooms,
    isVip,
    isSuperVip,
    discountPercent,
    discountExpiresAt,
    isForSale,
    isHotel,
    numericRating,
    isB2BPartner,
    hotelStars,
    roomType,
    amenities,
    amenityTags,
    distanceToSlopeM,
    constructionStatus,
    constructionProgressPercent,
    priority,
  } = props;
  const {
    isFavorited,
    busy: favoriteBusy,
    toggle: toggleFavorite,
  } = useFavorite({ propertyId: id });
  const showConstructionBar =
    isForSale &&
    constructionStatus === "under_construction" &&
    constructionProgressPercent != null;
  const displayLocation = isHotel
    ? location
    : distanceToSlopeM != null && distanceToSlopeM > 0
      ? `${extractZone(location)} • ${t("distanceToSlope", { distance: distanceToSlopeM })}`
      : location;
  const href = isHotel
    ? `/hotels/${id}`
    : isForSale
      ? `/sales/${id}`
      : `/apartments/${id}`;
  const photoUrl = photos[0] ?? "/placeholder-property.jpg";

  const tags: string[] = [];
  if (!isHotel) {
    if (rooms) tags.push(t("rooms", { count: rooms }));
    if (capacity) tags.push(t("guests", { count: capacity }));
    if (amenityTags?.length) {
      const amenityLabels = amenityTags
        .map((v) => optionKeyFor("amenities", v))
        .filter((k): k is string => k !== null && k !== "no_balcony")
        .map((k) => tOpts(`amenities.${k}`));
      tags.push(...amenityLabels.slice(0, 2));
    }
  }

  const active = isDiscountActive(discountPercent, discountExpiresAt);
  const currentPrice = isForSale ? salePrice : pricePerNight;
  const displayPrice =
    active && currentPrice != null
      ? applyDiscount(currentPrice, discountPercent, discountExpiresAt)
      : currentPrice;
  const originalPrice = active && currentPrice != null ? currentPrice : null;

  // For hotels: show discount badge when discount is active, stars when not
  const showHotelDiscount = isHotel && active;
  const showHotelStars =
    isHotel && !showHotelDiscount && hotelStars != null && hotelStars > 0;

  return (
    <div className="group h-full animate-in fade-in slide-in-from-bottom-4 duration-300 transition-transform hover:scale-[1.02]">
      <Link
        href={href}
        className="flex h-auto min-h-[420px] md:h-[440px] flex-col overflow-hidden rounded-[24px] border border-[#F1F5F9] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
            priority={priority}
          />

          {showHotelStars && (
            <span className="absolute top-4 left-4 flex items-center gap-0.5 text-[#F59E0B] drop-shadow-sm">
              {Array.from({ length: hotelStars! }, (_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-current" />
              ))}
            </span>
          )}

          {showHotelDiscount && (
            <ListingBadge variant="discount" className="absolute top-4 left-4 rounded-full px-3 py-1.5 text-[11px] normal-case">
              <Clock className="h-3 w-3" />-{discountPercent}%
            </ListingBadge>
          )}

          {!isHotel && active && (
            <ListingBadge variant="discount" className="absolute top-4 left-4 rounded-full px-3 py-1.5 text-[11px] normal-case">
              <Clock className="h-3 w-3" />-{discountPercent}%
            </ListingBadge>
          )}

          {!isHotel && !active && (isSuperVip || isVip) && (
            <ListingBadge variant="vip" className="absolute top-4 left-4">
              {isSuperVip ? "SUPER VIP" : "VIP"}
            </ListingBadge>
          )}

          <FavoriteButton pressed={isFavorited} onPressedChange={toggleFavorite} disabled={favoriteBusy} ariaLabel={isFavorited ? t("favoriteRemove") : t("favoriteAdd")} className="absolute top-4 right-4" />

          {isHotel && isB2BPartner && (
            <span className="absolute bottom-4 right-4 rounded-lg bg-[#F97316] px-3 py-1 text-[10px] font-bold uppercase text-white">
              {t("b2bPartner")}
            </span>
          )}

          {!isHotel && isSuperVip && (
            <span className="absolute bottom-4 left-4 rounded-full bg-[#22C55E] px-2.5 py-1 text-[9px] font-bold text-white">
              {t("newlyBooked")}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5">
          {isHotel ? (
            <div className="min-h-[44px]">
              <div className="flex items-center justify-between gap-2">
                <h3 className="min-w-0 flex-1 truncate text-[17px] font-black leading-[21px] text-[#1E293B]">
                  {title}
                </h3>
                {numericRating != null && (
                  <span className="shrink-0 rounded-[6px] bg-[#DCFCE7] px-2 py-0.5 text-[12px] font-black text-[#15803D]">
                    {numericRating.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[11px] font-bold leading-[16px] text-[#94A3B8]">
                {amenities || location}
              </p>
            </div>
          ) : (
            <div className="min-h-[44px]">
              <p className="flex items-center gap-1 text-[11px] font-bold leading-[16px] text-[#94A3B8]">
                <MapPin className="h-[11px] w-[11px] text-[#CBD5E1]" />
                {displayLocation}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h3 className="truncate text-[17px] font-black leading-[21px] text-[#1E293B]">
                  {title}
                </h3>
              </div>
            </div>
          )}

          <div className="mt-3 min-h-[30px]">
            {tags.length > 0 && (
              <div className="flex flex-nowrap gap-1.5 overflow-hidden">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="truncate whitespace-nowrap rounded-full border border-[#E2E8F0] px-2.5 py-1 text-[11px] font-bold text-[#475569]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {isHotel && (
            <p className="mt-3 min-h-[16px] truncate text-[11px] uppercase tracking-wider text-[#94A3B8]">
              {roomType ?? ""}
            </p>
          )}

          {showConstructionBar && (
            <div className="mt-3">
              <ConstructionProgressBar
                percent={constructionProgressPercent!}
                label={t("construction")}
                size="sm"
              />
            </div>
          )}

          <div className="mt-auto flex items-end justify-between pt-4">
            <div>
              {originalPrice != null ? (
                <span className="block text-[11px] font-bold leading-[16px] text-[#94A3B8] line-through">
                  {formatPrice(originalPrice)}
                </span>
              ) : (
                <span className="block h-[16px]" aria-hidden="true" />
              )}
              {isForSale && displayPrice != null ? (
                <span className="whitespace-nowrap text-[24px] font-black leading-[32px] text-[#1E293B]">
                  {formatPrice(Math.round(displayPrice))}
                </span>
              ) : displayPrice != null ? (
                <span className="flex items-baseline gap-1">
                  <span className="text-[24px] font-black leading-[32px] text-[#1E293B]">
                    {formatNum(Math.round(displayPrice))}
                  </span>
                  <span className="text-[14px] font-black leading-[20px] text-[#64748B]">
                    {t("perNight")}
                  </span>
                </span>
              ) : null}
            </div>
            <ListingCardAction className={isForSale ? "px-5 py-2 text-[13px]" : "bg-[#1E293B] px-5 py-2 text-[13px] group-hover:bg-[#334155]"}>
              {isForSale ? t("details") : t("view")}
            </ListingCardAction>
          </div>
        </div>
      </Link>
    </div>
  );
}
