"use client";

import { motion } from "framer-motion";
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
      className="group"
    >
      <Link
        href={href}
        className="block overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
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

          {/* Category badge */}
          <Badge
            variant="secondary"
            className="absolute bottom-3 left-3 bg-white/90 text-foreground backdrop-blur-sm"
          >
            {categoryLabelMap[category] ?? category}
          </Badge>

          {/* VIP badge */}
          {isVip && (
            <span className="absolute top-3 left-3 rounded bg-[#FEE2E2] border border-[#FEF08A] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-[#B45309] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              VIP
            </span>
          )}

          {/* Discount badge */}
          {discountPercent > 0 && (
            <span className="absolute top-3 right-3 rounded bg-[#E11D48] px-2 py-1 text-[10px] font-black text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              -{discountPercent}%
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className="truncate text-[18px] font-black leading-[22px] text-[#1E293B]">
            {title}
          </h3>

          {location && (
            <p className="mt-1 truncate text-[11px] font-bold text-muted-foreground">
              {location}
            </p>
          )}

          {price != null && (
            <p className="mt-3 flex items-baseline gap-0.5">
              <span className="text-[15px] font-black text-[#1E293B]">
                {formatPrice(price)}
              </span>
              {priceUnit && (
                <span className="text-xs font-normal text-muted-foreground">
                  / {priceUnit}
                </span>
              )}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
