"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Heart, MapPin, Clock } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";

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
  distanceToSlopeM?: number | null;
}

function formatLocationWithDistance(
  location: string,
  distanceToSlopeM?: number | null,
): string {
  const zone = location.includes(",")
    ? location.split(",").pop()?.trim() || location
    : location;
  if (distanceToSlopeM != null && distanceToSlopeM > 0) {
    return `${zone} • ${distanceToSlopeM}მ ტრასამდე`;
  }
  return location;
}

export default function PropertyCard(props: PropertyCardProps) {
  const t = useTranslations("PropertyCard");
  const { user } = useAuth();
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
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
    distanceToSlopeM,
  } = props;
  const displayLocation = isHotel
    ? location
    : formatLocationWithDistance(location, distanceToSlopeM);
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

  useEffect(() => {
    if (!user) {
      setFavoriteId(null);
      return;
    }
    const supabase = createClient();
    let alive = true;
    async function loadFavorite() {
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user!.id)
        .eq("property_id", id)
        .maybeSingle();
      if (alive) setFavoriteId(data?.id ?? null);
    }
    loadFavorite();
    return () => {
      alive = false;
    };
  }, [id, user]);

  async function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (favoriteBusy) return;
    if (!user) {
      window.location.href = "/auth/login";
      return;
    }
    setFavoriteBusy(true);
    try {
      const supabase = createClient();
      if (favoriteId) {
        await supabase.from("favorites").delete().eq("id", favoriteId);
        setFavoriteId(null);
      } else {
        const { data } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, property_id: id })
          .select("id")
          .single();
        if (data) setFavoriteId(data.id);
      }
    } finally {
      setFavoriteBusy(false);
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
            onClick={toggleFavorite}
            disabled={favoriteBusy}
            aria-label={favoriteId ? "რჩეულებიდან წაშლა" : "რჩეულებში დამატება"}
            aria-pressed={favoriteId != null}
            className={`absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors ${
              favoriteId
                ? "bg-[#F97316] text-white"
                : "bg-white text-[#F97316] hover:bg-[#F97316] hover:text-white"
            } disabled:opacity-60`}
          >
            <Heart className={`h-4 w-4 ${favoriteId ? "fill-current" : ""}`} />
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
