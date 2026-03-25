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
  cleaner: "/services/cleaning",
  food: "/services/food",
  entertainment: "/services/entertainment",
  transport: "/services/transport",
  handyman: "/services/handyman",
  employment: "/services/employment",
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
        className="block overflow-hidden rounded-[var(--radius-card)] bg-brand-surface shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
      >
        {/* Photo area */}
        <div className="relative aspect-[4/3] overflow-hidden">
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
            {category}
          </Badge>

          {/* VIP badge */}
          {isVip && (
            <span className="absolute top-3 right-3 rounded-md bg-brand-vip px-2 py-0.5 text-xs font-bold text-white">
              VIP
            </span>
          )}

          {/* Discount badge */}
          {discountPercent > 0 && (
            <span className="absolute top-3 left-3 rounded-md bg-brand-error px-2 py-0.5 text-xs font-bold text-white">
              -{discountPercent}%
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {title}
          </h3>

          {location && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {location}
            </p>
          )}

          {price != null && (
            <p className="mt-2 text-sm font-bold text-foreground">
              {formatPrice(price)}
              {priceUnit && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
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
