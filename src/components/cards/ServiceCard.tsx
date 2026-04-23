"use client";

import { motion } from "framer-motion";
import { Heart, MapPin, Star } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
  variant?: "photo" | "avatar";
  schedule?: string | null;
  operatingHours?: string | null;
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

// Category labels are now in translations

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
  variant = "photo",
  schedule,
  operatingHours,
}: ServiceCardProps) {
  const t = useTranslations("ServiceCard");
  const basePath = categoryRouteMap[category] ?? `/services/${category}`;
  const href = `${basePath}/${id}`;
  const photoUrl = photos[0] ?? "/placeholder-service.jpg";

  if (variant === "avatar") {
    const categoryLabel = t.has(`categories.${category}`)
      ? t(`categories.${category}`)
      : "ხელოსანი";
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
          className="flex h-[260px] flex-col overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative block size-[56px] shrink-0 overflow-hidden rounded-full border border-[#E2E8F0] bg-[#F8FAFC]">
                <Image
                  src={photoUrl}
                  alt={title}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </span>
              <div>
                <span className="inline-flex rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                  {categoryLabel}
                </span>
                {isVip && (
                  <span className="mt-1 ml-1 inline-flex rounded-[4px] bg-[#FEE2E2] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#B45309]">
                    VIP
                  </span>
                )}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-[6px] bg-[#0F172A] px-2 py-1 text-[11px] font-bold text-white">
              <Star className="h-3 w-3 fill-white text-white" />
              4.9
            </span>
          </div>
          <h3 className="mt-3 text-[16px] font-black leading-[20px] text-[#1E293B] line-clamp-2">
            {title}
          </h3>
          <div className="mt-2 min-h-[40px] space-y-1">
            {location && (
              <p className="flex items-center gap-1 text-[11px] font-medium text-[#64748B]">
                <MapPin className="h-3 w-3" />
                {location}
              </p>
            )}
            {schedule || operatingHours ? (
              <p className="text-[12px] font-bold text-[#334155]">
                <span className="text-[#94A3B8] font-medium">საათები: </span>
                <span className="text-[#1E293B]">
                  {schedule ?? operatingHours}
                </span>
              </p>
            ) : (
              price != null && (
                <p className="text-[12px] font-bold text-[#334155]">
                  <span className="text-[#94A3B8] font-medium">ფასი: </span>
                  <span className="text-[#1E293B]">{formatPrice(price)}</span>
                  {priceUnit && (
                    <span className="text-[#94A3B8] font-medium">
                      {" "}
                      / {priceUnit}
                    </span>
                  )}
                </p>
              )
            )}
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
            <span className="flex items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-white px-2 py-2.5 text-[12px] font-bold text-[#334155] transition-colors group-hover:bg-[#F8FAFC]">
              {t("details")}
            </span>
            <span className="flex items-center justify-center whitespace-nowrap rounded-[12px] bg-[#22C55E] px-2 py-2.5 text-[12px] font-bold text-white">
              WhatsApp
            </span>
          </div>
        </Link>
      </motion.div>
    );
  }

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
        className="flex h-[420px] flex-col overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
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
            aria-label={t("addToFavorites")}
          >
            <Heart className="h-4 w-4 text-[#1E293B]" />
          </button>
          <Badge
            variant="secondary"
            className="absolute bottom-3 left-3 bg-white/90 text-[#1E293B] backdrop-blur-sm"
          >
            {t.has(`categories.${category}`)
              ? t(`categories.${category}`)
              : category}
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
          <div className="mt-1 min-h-[18px]">
            {location && (
              <p className="flex items-center gap-1 text-[12px] font-medium leading-[18px] text-[#64748B]">
                <MapPin className="h-3 w-3" />
                {location}
              </p>
            )}
          </div>
          <div className="mt-3 min-h-[33px]">
            {price != null && (
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
            )}
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
            <span className="flex min-w-0 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-white px-2 py-2.5 text-[12px] font-bold text-[#334155] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors group-hover:bg-[#F8FAFC]">
              {t("details")}
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
