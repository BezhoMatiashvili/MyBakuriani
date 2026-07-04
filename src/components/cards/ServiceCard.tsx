"use client";

import { motion } from "framer-motion";
import {
  Car,
  Check,
  Clock,
  Heart,
  MapPin,
  Phone,
  Star,
  Users,
} from "lucide-react";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils/format";
import {
  optionKeyFor,
  priceUnitPathFor,
} from "@/lib/constants/listing-options";
import { Badge } from "@/components/ui/badge";
import { trackContactClick } from "@/lib/contact-tracking";

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
  variant?: "photo" | "avatar" | "overlay";
  schedule?: string | null;
  operatingHours?: string | null;
  phone?: string | null;
  providerName?: string | null;
  experienceYears?: number | null;
  availabilityStatus?: "active" | "busy" | null;
  driverName?: string | null;
  vehicleCapacity?: number | null;
  route?: string | null;
  routes?: string[] | null;
  transportType?: string | null;
  vehicleMake?: string | null;
  vehicleColor?: string | null;
  features?: string[] | null;
  isNew?: boolean;
  isVerified?: boolean;
  description?: string | null;
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
  phone,
  providerName,
  experienceYears,
  availabilityStatus,
  vehicleCapacity,
  transportType,
  route,
  routes,
  isNew = false,
  isVerified = false,
  description,
}: ServiceCardProps) {
  const isFood = category === "food";
  const isTransport = category === "transport";
  const t = useTranslations("ServiceCard");
  const tOpts = useTranslations("ListingOptions");
  const router = useRouter();
  const priceUnitPath = priceUnitPathFor(priceUnit);
  const basePath = categoryRouteMap[category] ?? `/services/${category}`;
  const href = `${basePath}/${id}`;
  const photoUrl = photos[0] ?? "/placeholder-service.jpg";
  const whatsappDigits = phone ? phone.replace(/\D/g, "") : "";
  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}`
    : undefined;
  const telHref = phone ? `tel:${phone}` : undefined;

  const goToDetail = () => router.push(href);
  const onCardKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToDetail();
    }
  };
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const onCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    trackContactClick({ channel: "call", serviceId: id });
  };
  const onWhatsappClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    trackContactClick({ channel: "whatsapp", serviceId: id });
  };

  if (variant === "avatar") {
    const isBusy = availabilityStatus === "busy";
    const hoursValue = operatingHours ?? schedule;
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={{ scale: 1.02 }}
        className="group h-full"
      >
        <div
          role="link"
          tabIndex={0}
          aria-label={title}
          onClick={goToDetail}
          onKeyDown={onCardKey}
          className="flex h-auto min-h-[280px] md:h-[300px] cursor-pointer flex-col overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] focus-visible:ring-offset-2"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="relative block size-[64px] shrink-0 overflow-hidden rounded-full border border-[#E2E8F0] bg-[#F8FAFC]">
              <Image
                src={photoUrl}
                alt={title}
                fill
                sizes="64px"
                className="object-cover"
              />
            </span>
            <div className="flex flex-col items-end gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  isBusy
                    ? "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"
                    : "bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]"
                }`}
              >
                {isBusy ? t("statusBusy") : t("statusActive")}
              </span>
              <span className="flex items-center gap-1 text-[12px] font-bold text-[#1E293B]">
                <Star className="h-3.5 w-3.5 fill-[#F97316] text-[#F97316]" />
                4.9
              </span>
            </div>
          </div>
          <h3 className="mt-3 text-[16px] font-black leading-[20px] text-[#1E293B] line-clamp-2">
            {title}
          </h3>
          <div className="mt-2 space-y-1">
            {providerName && (
              <p className="text-[12px] font-bold text-[#334155]">
                <span className="text-[#94A3B8] font-medium">
                  {t("providerNameLabel")}:{" "}
                </span>
                <span className="text-[#1E293B]">{providerName}</span>
              </p>
            )}
            {experienceYears != null && (
              <p className="text-[12px] font-bold text-[#334155]">
                <span className="text-[#94A3B8] font-medium">
                  {t("experienceLabel")}:{" "}
                </span>
                <span className="text-[#1E293B]">
                  {experienceYears} {t("experienceYearsUnit")}
                </span>
              </p>
            )}
            {hoursValue && (
              <p className="text-[12px] font-bold text-[#334155]">
                <span className="text-[#94A3B8] font-medium">
                  {t("workingHoursLabel")}:{" "}
                </span>
                <span className="text-[#1E293B]">{hoursValue}</span>
              </p>
            )}
          </div>
          <div className="mt-auto flex flex-col gap-2 pt-3 md:grid md:grid-cols-2">
            <Link
              href={href}
              onClick={stop}
              className={`flex items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-white px-2 py-2.5 text-[12px] font-bold transition-colors ${
                isBusy
                  ? "text-[#94A3B8]"
                  : "text-[#334155] group-hover:bg-[#F8FAFC]"
              }`}
            >
              {t("details")}
            </Link>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onWhatsappClick}
                aria-label="WhatsApp"
                className={`flex items-center justify-center whitespace-nowrap rounded-[12px] px-2 py-2.5 text-[12px] font-bold transition-colors ${
                  isBusy
                    ? "bg-[#BBF7D0] text-[#166534]"
                    : "bg-[#22C55E] text-white hover:bg-[#16A34A]"
                }`}
              >
                WhatsApp
              </a>
            ) : (
              <span
                onClick={stop}
                aria-disabled="true"
                aria-label="WhatsApp"
                className="flex cursor-not-allowed items-center justify-center whitespace-nowrap rounded-[12px] bg-[#BBF7D0] px-2 py-2.5 text-[12px] font-bold text-[#166534]"
              >
                WhatsApp
              </span>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (variant === "overlay") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={{ scale: 1.02 }}
        className="group h-full"
      >
        <div
          role="link"
          tabIndex={0}
          aria-label={title}
          onClick={goToDetail}
          onKeyDown={onCardKey}
          className="relative flex h-auto min-h-[420px] cursor-pointer flex-col overflow-hidden rounded-[24px] shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] focus-visible:ring-offset-2"
        >
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/20" />
          <div className="relative z-10 flex h-full flex-1 flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex gap-2">
                {isVip && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#F97316] px-2.5 py-1 text-[11px] font-black uppercase text-white shadow-[0px_1px_2px_rgba(0,0,0,0.15)]">
                    <Star className="h-3 w-3 fill-white" />
                    VIP {t("partner")}
                  </span>
                )}
                {discountPercent > 0 && (
                  <span className="inline-flex items-center rounded-md bg-[#E11D48] px-2.5 py-1 text-[11px] font-black uppercase text-white">
                    -{discountPercent}%
                  </span>
                )}
                {!isVip && discountPercent === 0 && (
                  <span className="inline-flex items-center rounded-md bg-[#2563EB] px-2.5 py-1 text-[11px] font-black uppercase text-white">
                    {t("statusNew")}
                  </span>
                )}
              </div>
              <span className="inline-flex items-center gap-1 rounded-[6px] bg-[#0F172A]/70 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                <Star className="h-3 w-3 fill-[#F97316] text-[#F97316]" />
                4.9
              </span>
            </div>
            <div className="mt-auto">
              <h3 className="text-[20px] font-black leading-[26px] text-white line-clamp-2">
                {title}
              </h3>
              {description && (
                <p className="mt-2 text-[13px] leading-[18px] text-white/85 line-clamp-3">
                  {description}
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={href}
                  onClick={stop}
                  className="flex items-center justify-center rounded-[12px] bg-[#2563EB] px-2 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
                >
                  {t("details")}
                </Link>
                {telHref ? (
                  <a
                    href={telHref}
                    onClick={onCallClick}
                    className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] bg-[#22C55E] px-2 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#16A34A]"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {t("call")}
                  </a>
                ) : (
                  <span
                    onClick={stop}
                    aria-disabled="true"
                    className="flex cursor-not-allowed items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] bg-[#BBF7D0] px-2 py-2.5 text-[13px] font-bold text-[#166534]"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {t("call")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // variant === "photo" (default)
  const isBusy = availabilityStatus === "busy";
  const routeValue = route ?? routes?.[0];
  const routeKey = optionKeyFor("transportRoutes", routeValue);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
      className="group h-full"
    >
      <div
        role="link"
        tabIndex={0}
        aria-label={title}
        onClick={goToDetail}
        onKeyDown={onCardKey}
        className="flex h-auto min-h-[400px] md:h-[420px] cursor-pointer flex-col overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] focus-visible:ring-offset-2"
      >
        <div className="relative h-[200px] overflow-hidden rounded-t-[24px]">
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {isVip && (
              <span className="rounded-[4px] bg-[#DC2626] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                VIP
              </span>
            )}
            {isVerified && !isTransport && (
              <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#2563EB] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                <Check className="h-3 w-3" strokeWidth={3} />
                {t("verifiedBadge")}
              </span>
            )}
            {isNew && !isTransport && (
              <span className="rounded-[4px] bg-[#FCD34D] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-[#78350F] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                {t("statusNew")}
              </span>
            )}
            {discountPercent > 0 && (
              <span className="flex items-center gap-1 rounded-[4px] bg-[#E11D48] px-2 py-1 text-[10px] font-black text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                -{discountPercent}%
              </span>
            )}
          </div>
          {!isTransport && (
            <button
              type="button"
              className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-colors hover:bg-white"
              onClick={stop}
              aria-label={t("addToFavorites")}
            >
              <Heart className="h-4 w-4 text-[#1E293B]" />
            </button>
          )}
          {!isFood && !isTransport && (
            <Badge
              variant="secondary"
              className="absolute bottom-3 left-3 bg-white/90 text-[#1E293B] backdrop-blur-sm"
            >
              {t.has(`categories.${category}`)
                ? t(`categories.${category}`)
                : category}
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-h-[44px] min-w-0 flex-1 text-[18px] font-black leading-[22px] text-[#1E293B] line-clamp-2">
              {title}
            </h3>
            {!isTransport && (
              <span className="flex shrink-0 items-center gap-1 rounded-[6px] bg-[#0F172A] px-2 py-1 text-[11px] font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                <Star className="h-3 w-3 fill-white text-white" />
                4.9
              </span>
            )}
          </div>
          {isTransport ? (
            <div className="mt-2 space-y-1">
              {transportType && (
                <p className="flex items-center gap-1.5 text-[13px] text-[#334155]">
                  <Car aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-[#94A3B8] font-medium">
                    {t("typeLabel")}:{" "}
                  </span>
                  <span className="text-[#1E293B] font-bold line-clamp-1">
                    {t.has(`transportTypes.${transportType}`)
                      ? t(`transportTypes.${transportType}`)
                      : transportType}
                  </span>
                </p>
              )}
              {vehicleCapacity != null && (
                <p className="flex items-center gap-1.5 text-[13px] text-[#334155]">
                  <Users aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-[#94A3B8] font-medium">
                    {t("seatsLabel")}:{" "}
                  </span>
                  <span className="text-[#1E293B] font-bold">
                    {vehicleCapacity}
                  </span>
                </p>
              )}
              {routeValue && (
                <p className="flex items-center gap-1.5 text-[13px] text-[#334155]">
                  <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-[#94A3B8] font-medium">
                    {t("routeLabel")}:{" "}
                  </span>
                  <span className="text-[#1E293B] font-bold line-clamp-1">
                    {routeKey
                      ? tOpts(`transportRoutes.${routeKey}`)
                      : routeValue}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="mt-1 min-h-[18px]">
                {location && (
                  <p className="flex items-center gap-1 text-[12px] font-medium leading-[18px] text-[#64748B]">
                    <MapPin className="h-3 w-3" />
                    {location}
                  </p>
                )}
              </div>
              <div className="mt-3 min-h-[33px]">
                {isFood
                  ? (schedule || operatingHours) && (
                      <span className="flex items-center gap-1.5 text-[14px] font-bold text-[#334155]">
                        <Clock className="h-4 w-4 text-[#F97316]" />
                        {schedule ?? operatingHours}
                      </span>
                    )
                  : price != null && (
                      <span className="flex items-baseline gap-0.5">
                        <span className="text-[22px] font-black text-[#1E293B]">
                          {formatPrice(price)}
                        </span>
                        {priceUnit && (
                          <span className="text-[13px] font-bold text-[#94A3B8]">
                            / {priceUnitPath ? tOpts(priceUnitPath) : priceUnit}
                          </span>
                        )}
                      </span>
                    )}
              </div>
            </>
          )}
          <div className="mt-auto flex flex-col gap-2 pt-4 md:grid md:grid-cols-2">
            <Link
              href={href}
              onClick={stop}
              className="flex min-w-0 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-white px-2 py-2.5 text-[12px] font-bold text-[#334155] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors group-hover:bg-[#F8FAFC]"
            >
              {t("details")}
            </Link>
            {isFood ? (
              telHref ? (
                <a
                  href={telHref}
                  onClick={onCallClick}
                  className="flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] bg-[#22C55E] px-2 py-2.5 text-[12px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(34,197,94,0.2),0px_2px_4px_-2px_rgba(34,197,94,0.2)] transition-colors hover:bg-[#16A34A]"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {t("call")}
                </a>
              ) : (
                <span
                  onClick={stop}
                  aria-disabled="true"
                  className="flex min-w-0 cursor-not-allowed items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] bg-[#BBF7D0] px-2 py-2.5 text-[12px] font-bold text-[#166534]"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {t("call")}
                </span>
              )
            ) : isTransport && isBusy ? (
              <span
                onClick={stop}
                aria-disabled="true"
                aria-label="WhatsApp"
                className="flex min-w-0 cursor-not-allowed items-center justify-center whitespace-nowrap rounded-[12px] bg-[#BBF7D0] px-2 py-2.5 text-[12px] font-bold text-[#166534]"
              >
                WhatsApp
              </span>
            ) : whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onWhatsappClick}
                aria-label="WhatsApp"
                className="flex min-w-0 items-center justify-center whitespace-nowrap rounded-[12px] bg-[#22C55E] px-2 py-2.5 text-[12px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(34,197,94,0.2),0px_2px_4px_-2px_rgba(34,197,94,0.2)] transition-colors hover:bg-[#16A34A]"
              >
                WhatsApp
              </a>
            ) : (
              <span
                onClick={stop}
                aria-disabled="true"
                aria-label="WhatsApp"
                className="flex min-w-0 cursor-not-allowed items-center justify-center whitespace-nowrap rounded-[12px] bg-[#BBF7D0] px-2 py-2.5 text-[12px] font-bold text-[#166534]"
              >
                WhatsApp
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
