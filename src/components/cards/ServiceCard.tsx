"use client";

import { motion } from "framer-motion";
import { Heart, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";

interface ServiceCardProps {
  id: string;
  title: string;
  category: string;
  location: string | null;
  photos: string[];
  price: number | null;
  priceUnit: string | null;
  discountPercent: number;
  isVip: boolean;
}

const categoryRouteMap: Record<string, string> = {
  cleaner: "/services",
  cleaning: "/services",
  food: "/food",
  entertainment: "/entertainment",
  transport: "/transport",
  handyman: "/services",
  employment: "/employment",
};

const categoryLabelMap: Record<string, string> = {
  cleaner: "დალაგება",
  cleaning: "დალაგება",
  food: "კვება",
  entertainment: "გართობა",
  transport: "ტრანსპორტი",
  handyman: "ხელოსანი",
  employment: "დასაქმება",
};

export default function ServiceCard({
  id,
  title,
  category,
  location,
  photos,
  price,
  priceUnit,
  discountPercent,
  isVip,
}: ServiceCardProps) {
  const basePath = categoryRouteMap[category] ?? `/services/${category}`;
  const href = `${basePath}/${id}`;
  const photoUrl = photos[0] ?? "/placeholder-service.jpg";

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
        className="flex h-full flex-col overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
      >
        <div className="relative h-[200px] overflow-hidden rounded-t-[24px]">
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="absolute top-3 left-3 flex gap-2">
            {isVip && (
              <span className="rounded-[4px] bg-[#FEE2E2] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-[#B45309] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                VIP
              </span>
            )}
            {discountPercent > 0 && (
              <span className="flex items-center gap-1 rounded-[4px] bg-[#E11D48] px-2 py-1 text-[10px] font-black text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                -{discountPercent}%
              </span>
            )}
          </div>
          <button
            type="button"
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-colors hover:bg-white"
            onClick={(e) => e.preventDefault()}
            aria-label="ფავორიტებში დამატება"
          >
            <Heart className="h-4 w-4 text-[#1E293B]" />
          </button>
          <Badge
            variant="secondary"
            className="absolute bottom-3 left-3 bg-white/90 text-[#1E293B] backdrop-blur-sm"
          >
            {categoryLabelMap[category] ?? category}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 flex-1 text-[18px] font-black leading-[22px] text-[#1E293B] line-clamp-2">
              {title}
            </h3>
            <span className="flex shrink-0 items-center gap-1 rounded-[6px] bg-[#0F172A] px-2 py-1 text-[11px] font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              <Star className="h-3 w-3 fill-white text-white" />
              4.9
            </span>
          </div>
          {location && (
            <p className="mt-1 flex items-center gap-1 text-[12px] font-medium leading-[18px] text-[#64748B]">
              <MapPin className="h-3 w-3" />
              {location}
            </p>
          )}
          {price != null && (
            <div className="mt-3">
              <span className="flex items-baseline gap-0.5">
                <span className="text-[22px] font-black text-[#1E293B]">
                  {formatPrice(price)}
                </span>
                {priceUnit && (
                  <span className="text-[13px] font-bold text-[#94A3B8]">
                    / {priceUnit}
                  </span>
                )}
              </span>
            </div>
          )}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
            <span className="flex min-w-0 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-white px-2 py-2.5 text-[12px] font-bold text-[#334155] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors group-hover:bg-[#F8FAFC]">
              დეტალები
            </span>
            <span className="flex min-w-0 items-center justify-center whitespace-nowrap rounded-[12px] bg-[#22C55E] px-2 py-2.5 text-[12px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(34,197,94,0.2),0px_2px_4px_-2px_rgba(34,197,94,0.2)]">
              WhatsApp
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
