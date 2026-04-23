"use client";

import { motion } from "framer-motion";
import { Heart, MapPin, Clock } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils/format";

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
  isForSale: boolean;
  isHotel?: boolean;
  numericRating?: number;
  isB2BPartner?: boolean;
  hotelStars?: number;
  roomType?: string;
  amenities?: string;
  amenityTags?: string[];
}

export default function PropertyCard(props: PropertyCardProps) {
  const t = useTranslations("PropertyCard");
  const {
    id,
    title,
    location,
    photos,
    pricePerNight,
    salePrice,
    rating,
    capacity,
    rooms,
    isVip,
    isSuperVip,
    discountPercent,
    isForSale,
    isHotel,
    numericRating,
    isB2BPartner,
    hotelStars,
    roomType,
    amenities,
    amenityTags,
  } = props;
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
      tags.push(...amenityTags.slice(0, 2));
    }
  }

  const currentPrice = isForSale ? salePrice : pricePerNight;
  const originalPrice =
    discountPercent > 0 && currentPrice != null
      ? Math.round(currentPrice / (1 - discountPercent / 100))
      : null;

  // For hotels: show discount badge when discount > 0, stars when no discount
  const showHotelDiscount = isHotel && discountPercent > 0;
  const showHotelStars =
    isHotel && !showHotelDiscount && hotelStars != null && hotelStars > 0;

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
        className="flex h-[440px] flex-col overflow-hidden rounded-[24px] border border-[#F1F5F9] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />

          {showHotelStars && (
            <span className="absolute top-4 left-4 flex items-center gap-0.5 text-[#F59E0B] drop-shadow-sm">
              {Array.from({ length: hotelStars! }, (_, i) => (
                <span key={i} className="text-[14px] leading-none">
                  ★
                </span>
              ))}
            </span>
          )}

          {showHotelDiscount && (
            <span className="absolute top-4 left-4 flex items-center gap-1 rounded-full bg-[#F97316] px-3 py-1.5 text-[11px] font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              <Clock className="h-3 w-3" />-{discountPercent}%
            </span>
          )}

          {!isHotel && discountPercent > 0 && (
            <span className="absolute top-4 left-4 flex items-center gap-1 rounded-full bg-[#F97316] px-3 py-1.5 text-[11px] font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              <Clock className="h-3 w-3" />-{discountPercent}%
            </span>
          )}

          {!isHotel && discountPercent === 0 && (isSuperVip || isVip) && (
            <span className="absolute top-4 left-4 rounded-[4px] bg-[#F97316] px-2 py-1 text-[10px] font-black text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              {isSuperVip ? "SUPER VIP" : "VIP"}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => e.preventDefault()}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#F97316] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#F97316] hover:text-white"
          >
            <Heart className="h-4 w-4 fill-current" />
          </button>

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
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[17px] font-black leading-[21px] text-[#1E293B]">
                  {title}
                </h3>
                {numericRating != null && (
                  <span className="shrink-0 text-[14px] font-bold text-[#1E293B]">
                    {numericRating}
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
                {location}
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

          <div className="mt-auto flex items-end justify-between pt-4">
            <div>
              {originalPrice != null ? (
                <span className="block text-[11px] font-bold leading-[16px] text-[#94A3B8] line-through">
                  {formatPrice(originalPrice)}
                </span>
              ) : (
                <span className="block h-[16px]" aria-hidden="true" />
              )}
              {isForSale && salePrice != null ? (
                <span className="whitespace-nowrap text-[24px] font-black leading-[32px] text-[#1E293B]">
                  {formatPrice(salePrice)}
                </span>
              ) : pricePerNight != null ? (
                <span className="flex items-baseline gap-1">
                  <span className="text-[24px] font-black leading-[32px] text-[#1E293B]">
                    {formatNum(pricePerNight)}
                  </span>
                  <span className="text-[14px] font-black leading-[20px] text-[#64748B]">
                    {t("perNight")}
                  </span>
                </span>
              ) : null}
            </div>
            <span
              className={`rounded-[12px] px-5 py-2 text-[13px] font-bold text-white transition-colors ${
                isForSale
                  ? "bg-[#16A34A] hover:bg-[#15803D]"
                  : "bg-[#1E293B] hover:bg-[#334155]"
              }`}
            >
              {isForSale ? t("details") : t("view")}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
