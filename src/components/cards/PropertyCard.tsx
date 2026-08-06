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
import { cn } from "@/lib/utils";

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
  /** Sale-only: house_rules.payment_options codes via readPaymentOptions(). */
  paymentOptions?: string[];
  // Set on the first 1–2 cards of the first visible section so Next/Image
  // preloads them — improves landing LCP. Default false (lazy).
  priority?: boolean;
  mobilePresentation?: "default" | "compact-grid";
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
    paymentOptions,
    priority,
    mobilePresentation = "default",
  } = props;
  const compactGrid = mobilePresentation === "compact-grid";
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

  // Sale-only. The tag row below is flex-nowrap + overflow-hidden inside a card
  // that is md:h-[440px] (an extra row would be paid for by compressing the
  // photo), so payment terms share that one row: they render FIRST and push the
  // generic tags down to one, or a 375px card clips them out of existence.
  const paymentChips = isForSale ? (paymentOptions ?? []) : [];
  const shownPaymentChips = paymentChips.slice(0, 2);
  const hiddenPaymentCount = paymentChips.length - shownPaymentChips.length;
  const shownTags = shownPaymentChips.length > 0 ? tags.slice(0, 1) : tags;

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
        data-listing-card
        data-mobile-presentation={mobilePresentation}
        className={cn(
          "flex h-full flex-col overflow-hidden border border-[#F1F5F9] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)] md:h-auto lg:h-[440px] lg:rounded-[24px]",
          compactGrid
            ? "rounded-[16px] sm:rounded-[20px]"
            : "rounded-[20px]",
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden lg:aspect-[4/3]",
            compactGrid
              ? "aspect-[4/3] sm:aspect-[8/5]"
              : "aspect-[8/5]",
          )}
        >
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes={
              compactGrid
                ? "(max-width: 639px) 50vw, (max-width: 1024px) 50vw, 33vw"
                : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            }
            className="object-cover transition-transform duration-300 group-hover:scale-110"
            priority={priority}
          />

          {showHotelStars && (
            <span
              className={cn(
                "absolute flex items-center gap-0.5 text-[#F59E0B] drop-shadow-sm",
                compactGrid ? "left-2 top-2 sm:left-4 sm:top-4" : "left-4 top-4",
              )}
            >
              {Array.from({ length: hotelStars! }, (_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-current" />
              ))}
            </span>
          )}

          {showHotelDiscount && (
            <ListingBadge
              variant="discount"
              className={cn(
                "absolute rounded-full normal-case",
                compactGrid
                  ? "left-2 top-2 px-2 py-1 text-[9px] sm:left-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-[11px]"
                  : "left-4 top-4 px-3 py-1.5 text-[11px]",
              )}
            >
              <Clock className="h-3 w-3" />-{discountPercent}%
            </ListingBadge>
          )}

          {!isHotel && active && (
            <ListingBadge
              variant="discount"
              className={cn(
                "absolute rounded-full normal-case",
                compactGrid
                  ? "left-2 top-2 px-2 py-1 text-[9px] sm:left-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-[11px]"
                  : "left-4 top-4 px-3 py-1.5 text-[11px]",
              )}
            >
              <Clock className="h-3 w-3" />-{discountPercent}%
            </ListingBadge>
          )}

          {!isHotel && !active && (isSuperVip || isVip) && (
            <ListingBadge
              variant="vip"
              className={cn(
                "absolute",
                compactGrid
                  ? "left-2 top-2 max-w-[calc(100%-3.5rem)] truncate px-2 text-[9px] sm:left-4 sm:top-4 sm:max-w-none sm:px-2.5 sm:text-[10px]"
                  : "left-4 top-4",
              )}
            >
              {isSuperVip ? "SUPER VIP" : "VIP"}
            </ListingBadge>
          )}

          <FavoriteButton
            pressed={isFavorited}
            onPressedChange={toggleFavorite}
            disabled={favoriteBusy}
            ariaLabel={isFavorited ? t("favoriteRemove") : t("favoriteAdd")}
            className={cn(
              "absolute",
              compactGrid ? "right-1 top-1 sm:right-4 sm:top-4" : "right-4 top-4",
            )}
          />

          {isHotel && isB2BPartner && (
            <span className={cn("absolute rounded-lg bg-[#F97316] font-bold uppercase text-white", compactGrid ? "bottom-2 right-2 px-2 py-1 text-[8px] sm:bottom-4 sm:right-4 sm:px-3 sm:text-[10px]" : "bottom-4 right-4 px-3 py-1 text-[10px]") }>
              {t("b2bPartner")}
            </span>
          )}

          {!isHotel && isSuperVip && (
            <span className={cn("absolute rounded-full bg-[#22C55E] font-bold text-white", compactGrid ? "bottom-2 left-2 px-2 py-1 text-[8px] sm:bottom-4 sm:left-4 sm:px-2.5 sm:text-[9px]" : "bottom-4 left-4 px-2.5 py-1 text-[9px]") }>
              {t("newlyBooked")}
            </span>
          )}
        </div>

        <div
          className={cn(
            "flex flex-1 flex-col lg:p-5",
            compactGrid ? "p-2.5 sm:p-4" : "p-4",
          )}
        >
          {isHotel ? (
            <div className="lg:min-h-[44px]">
              <div className="flex items-center justify-between gap-2">
                <h3 className={cn("min-w-0 flex-1 truncate font-black text-[#1E293B]", compactGrid ? "text-[14px] leading-[18px] sm:text-[17px] sm:leading-[21px]" : "text-[17px] leading-[21px]")}>
                  {title}
                </h3>
                {numericRating != null && (
                  <span className={cn("shrink-0 rounded-[6px] bg-[#DCFCE7] font-black text-[#15803D]", compactGrid ? "px-1.5 py-0.5 text-[10px] sm:px-2 sm:text-[12px]" : "px-2 py-0.5 text-[12px]")}>
                    {numericRating.toFixed(1)}
                  </span>
                )}
              </div>
              <p className={cn("mt-1 truncate font-bold text-[#94A3B8]", compactGrid ? "text-[9px] leading-[13px] sm:text-[11px] sm:leading-[16px]" : "text-[11px] leading-[16px]")}>
                {amenities || location}
              </p>
            </div>
          ) : (
            <div className="lg:min-h-[44px]">
              <p className={cn("flex min-w-0 items-center gap-1 font-bold text-[#94A3B8]", compactGrid ? "text-[9px] leading-[13px] sm:text-[11px] sm:leading-[16px]" : "text-[11px] leading-[16px]")}>
                <MapPin className="h-[11px] w-[11px] text-[#CBD5E1]" />
                <span className="truncate">{displayLocation}</span>
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h3 className={cn("truncate font-black text-[#1E293B]", compactGrid ? "text-[14px] leading-[18px] sm:text-[17px] sm:leading-[21px]" : "text-[17px] leading-[21px]")}>
                  {title}
                </h3>
              </div>
            </div>
          )}

          <div className="mt-2 lg:mt-3 lg:min-h-[30px]">
            {(shownTags.length > 0 || shownPaymentChips.length > 0) && (
              <div className="flex flex-nowrap gap-1.5 overflow-hidden">
                {shownPaymentChips.map((code) => (
                  <span
                    key={code}
                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[10px] font-bold leading-[14px] text-[#475569]"
                  >
                    {tOpts(`paymentOptions.${code}`)}
                  </span>
                ))}
                {hiddenPaymentCount > 0 && (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[10px] font-bold leading-[14px] text-[#475569]">
                    +{hiddenPaymentCount}
                  </span>
                )}
                {shownTags.map((tag) => (
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
            <p className="mt-2 truncate text-[11px] uppercase tracking-wider text-[#94A3B8] lg:mt-3 lg:min-h-[16px]">
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

          <div className={cn("mt-auto gap-2 pt-3 lg:pt-4", compactGrid ? "flex flex-col items-stretch sm:flex-row sm:items-end sm:justify-between" : "flex items-end justify-between")}>
            <div className="min-w-0">
              {originalPrice != null ? (
                <span className="block text-[11px] font-bold leading-[16px] text-[#94A3B8] line-through">
                  {formatPrice(originalPrice)}
                </span>
              ) : (
                <span className="hidden h-[16px] lg:block" aria-hidden="true" />
              )}
              {isForSale && displayPrice != null ? (
                <span className={cn("whitespace-nowrap font-black text-[#1E293B]", compactGrid ? "text-[18px] leading-[24px] sm:text-[24px] sm:leading-[32px]" : "text-[24px] leading-[32px]")}>
                  {formatPrice(Math.round(displayPrice))}
                </span>
              ) : displayPrice != null ? (
                <span className="flex items-baseline gap-1">
                  <span className={cn("font-black text-[#1E293B]", compactGrid ? "text-[18px] leading-[24px] sm:text-[24px] sm:leading-[32px]" : "text-[24px] leading-[32px]")}>
                    {formatNum(Math.round(displayPrice))}
                  </span>
                  <span className={cn("font-black text-[#64748B]", compactGrid ? "text-[10px] leading-[14px] sm:text-[14px] sm:leading-[20px]" : "text-[14px] leading-[20px]")}>
                    {t("perNight")}
                  </span>
                </span>
              ) : null}
            </div>
            <ListingCardAction
              className={cn(
                compactGrid && "min-h-11 w-full px-2 py-2 text-[11px] sm:min-h-0 sm:w-auto sm:px-5 sm:text-[13px]",
                isForSale
                  ? !compactGrid && "px-5 py-2 text-[13px]"
                  : compactGrid
                    ? "bg-[#1E293B] group-hover:bg-[#334155]"
                    : "bg-[#1E293B] px-5 py-2 text-[13px] group-hover:bg-[#334155]",
              )}
            >
              {isForSale ? t("details") : t("view")}
            </ListingCardAction>
          </div>
        </div>
      </Link>
    </div>
  );
}
