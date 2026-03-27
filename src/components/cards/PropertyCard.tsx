"use client";

import { motion } from "framer-motion";
import { Star, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice, formatPricePerNight } from "@/lib/utils/format";

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
}

export default function PropertyCard(props: PropertyCardProps) {
  const {
    id,
    title,
    location,
    photos,
    pricePerNight,
    salePrice,
    rating,
    capacity,
    isVip,
    isSuperVip,
    discountPercent,
    isForSale,
  } = props;
  const href = isForSale ? `/sales/${id}` : `/apartments/${id}`;
  const photoUrl = photos[0] ?? "/placeholder-property.jpg";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
      className="group"
    >
      <Link
        href={href}
        className="block overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white transition-shadow hover:shadow-[var(--shadow-card-hover)]"
      >
        {/* Photo area */}
        <div className="relative h-[190px] overflow-hidden">
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />

          {/* VIP / Super VIP badge */}
          <div className="absolute top-3 left-3 flex gap-2">
            {isSuperVip && (
              <span className="rounded bg-[#FEE2E2] border border-[#FEF08A] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-[#B45309] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                Super VIP
              </span>
            )}
            {isVip && !isSuperVip && (
              <span className="rounded bg-[#FEE2E2] border border-[#FEF08A] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-[#B45309] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                VIP
              </span>
            )}
          </div>

          {/* Discount badge */}
          {discountPercent > 0 && (
            <span className="absolute top-3 right-3 rounded-md bg-brand-error px-2 py-0.5 text-xs font-bold text-white">
              -{discountPercent}%
            </span>
          )}

          {/* Carousel dots */}
          {photos.length > 1 && (
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {photos.map((_, i) => (
                <span
                  key={i}
                  className={`block h-1.5 w-1.5 rounded-full ${
                    i === 0 ? "bg-white" : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-lg font-black leading-[22px] text-[#1E293B]">
              {title}
            </h3>
            {rating != null && (
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-[#0F172A] px-2 py-1 text-[11px] font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                <Star className="h-3 w-3 fill-white text-white" />
                {rating.toFixed(1)}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {location}
          </p>

          <div className="mt-4 flex items-center justify-between">
            {/* Price */}
            <span className="text-sm font-bold text-foreground">
              {isForSale && salePrice != null
                ? formatPrice(salePrice)
                : pricePerNight != null
                  ? formatPricePerNight(pricePerNight)
                  : ""}
            </span>

            {/* Capacity */}
            {capacity != null && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {capacity} სტუმარი
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
