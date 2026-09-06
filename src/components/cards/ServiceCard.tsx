"use client";

import { motion } from "framer-motion";
import { Car, Check, Clock, MapPin, Star, Users } from "lucide-react";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils/format";
import { applyDiscount, isDiscountActive } from "@/lib/utils/pricing";
import {
  optionKeyFor,
  priceUnitPathFor,
} from "@/lib/constants/listing-options";
import { useFavorite } from "@/lib/hooks/useFavorite";
import { Badge } from "@/components/ui/badge";
import { FavoriteButton } from "@/components/shared/FavoriteButton";
import { ListingBadge } from "@/components/shared/ListingBadge";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { cn } from "@/lib/utils";
import {
  ListingAgeBadge,
  NewlyAddedBadge,
} from "@/components/shared/ListingRecency";

interface ServiceCardProps {
  id: string;
  title: string;
  category: string;
  location: string | null;
  photos: string[];
  price: number | null;
  priceUnit: string | null;
  discountPercent: number;
  discountExpiresAt: string | null;
  isVip: boolean;
  variant?: "photo" | "avatar" | "overlay";
  schedule?: string | null;
  operatingHours?: string | null;
  phone?: string | null;
  hasWhatsapp?: boolean;
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
  isVerified?: boolean;
  description?: string | null;
  mobilePresentation?: "default" | "compact-grid";
  createdAt: string | null;
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
  discountExpiresAt,
  isVip,
  variant = "photo",
  schedule,
  operatingHours,
  phone,
  hasWhatsapp = false,
  providerName,
  experienceYears,
  availabilityStatus,
  vehicleCapacity,
  transportType,
  vehicleMake,
  route,
  routes,
  isVerified = false,
  description,
  mobilePresentation = "default",
  createdAt,
}: ServiceCardProps) {
  const compactGrid = mobilePresentation === "compact-grid";
  const isFood = category === "food";
  const isTransport = category === "transport";
  const t = useTranslations("ServiceCard");
  const tOpts = useTranslations("ListingOptions");
  const router = useRouter();
  const priceUnitPath = priceUnitPathFor(priceUnit);
  const basePath = categoryRouteMap[category] ?? `/services/${category}`;
  const href = `${basePath}/${id}`;
  const photoUrl = photos[0] ?? "/placeholder-service.jpg";

  // Expiry-aware: a lapsed discount must stop showing its badge and stop
  // discounting the price, exactly as the property cards already behave.
  const discountActive = isDiscountActive(discountPercent, discountExpiresAt);

  const goToDetail = () => router.push(href);
  // The card body is a <div role="link"> rather than an <a>, because it contains
  // its own anchors and buttons and nesting those inside an anchor is invalid.
  // The cost is that Next never prefetches it on viewport entry the way a <Link>
  // would. Every target here is a force-dynamic route whose response is
  // `private, no-store`, so an unprefetched click pays a full origin round trip
  // plus a cold render. Warm it on hover/focus instead — prefetch() is a no-op
  // once the payload is already in the router cache.
  const prefetchDetail = () => router.prefetch(href);
  const onCardKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToDetail();
    }
  };
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const {
    isFavorited,
    busy: favoriteBusy,
    toggle: toggleFavorite,
  } = useFavorite({ serviceId: id });

  if (variant === "avatar") {
    const isBusy = availabilityStatus === "busy";
    const hoursValue = operatingHours ?? schedule;
    const showWhatsApp = !isBusy && hasWhatsapp;
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={{ scale: 1.02 }}
        className="group h-full"
      >
        <div
          data-service-card
          role="link"
          tabIndex={0}
          aria-label={title}
          onClick={goToDetail}
          onKeyDown={onCardKey}
          onMouseEnter={prefetchDetail}
          onFocus={prefetchDetail}
          data-mobile-presentation={mobilePresentation}
          className={cn(
            "flex h-full min-h-[260px] cursor-pointer flex-col overflow-hidden border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] focus-visible:ring-offset-2 md:h-auto lg:h-[300px] lg:min-h-0 lg:p-5",
            compactGrid
              ? "rounded-[16px] p-2.5 sm:rounded-[20px] sm:p-4"
              : "rounded-[20px] p-4",
          )}
        >
          <div className="flex items-start justify-between gap-1 sm:gap-3">
            <span
              className={cn(
                "relative block shrink-0 overflow-hidden rounded-full border border-[#E2E8F0] bg-[#F8FAFC]",
                compactGrid ? "size-10 sm:size-[64px]" : "size-[64px]",
              )}
            >
              <Image
                src={photoUrl}
                alt={title}
                fill
                sizes="64px"
                className="object-cover"
              />
            </span>
            <div className="flex min-w-0 flex-col items-end gap-1.5">
              <div
                className={cn(
                  "flex items-center",
                  compactGrid ? "gap-0" : "gap-1.5",
                )}
              >
                <span
                  className={cn(
                    `inline-flex items-center rounded-full font-bold ${
                      isBusy
                        ? "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"
                        : "bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]"
                    }`,
                    compactGrid
                      ? "px-1.5 py-0.5 text-[8px] sm:px-2.5 sm:text-[11px]"
                      : "px-2.5 py-0.5 text-[11px]",
                  )}
                >
                  {isBusy ? t("statusBusy") : t("statusActive")}
                </span>
                <FavoriteButton
                  pressed={isFavorited}
                  onPressedChange={toggleFavorite}
                  disabled={favoriteBusy}
                  ariaLabel={t("addToFavorites")}
                  size={compactGrid ? "card" : "compact"}
                />
              </div>
              <div className="flex items-center gap-1">
                <NewlyAddedBadge
                  createdAt={createdAt}
                  className={
                    compactGrid
                      ? "max-w-[72px] truncate px-1.5 text-[7px] sm:max-w-none sm:px-2.5 sm:text-[9px]"
                      : undefined
                  }
                />
                <span className="flex items-center gap-1 text-[12px] font-bold text-[#1E293B]">
                  <Star className="h-3.5 w-3.5 fill-[#F97316] text-[#F97316]" />
                  4.9
                </span>
              </div>
            </div>
          </div>
          <h3
            className={cn(
              "mt-3 font-black text-[#1E293B] line-clamp-2",
              compactGrid
                ? "text-[14px] leading-[18px] sm:text-[16px] sm:leading-[20px]"
                : "text-[16px] leading-[20px]",
            )}
          >
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
          </div>
          <div className="mt-2 flex min-w-0 items-center justify-between gap-1.5">
            {hoursValue ? (
              compactGrid ? (
                <p className="flex min-w-0 items-center gap-1 text-[9px] font-bold text-[#334155] sm:text-[12px]">
                  <Clock className="size-3 shrink-0 text-[#94A3B8]" />
                  <span className="truncate">{hoursValue}</span>
                </p>
              ) : (
                <p className="min-w-0 truncate text-[12px] font-bold text-[#334155]">
                  <span className="text-[#94A3B8] font-medium">
                    {t("workingHoursLabel")}:{" "}
                  </span>
                  <span className="text-[#1E293B]">{hoursValue}</span>
                </p>
              )
            ) : (
              <span />
            )}
            <ListingAgeBadge
              createdAt={createdAt}
              className={
                compactGrid
                  ? "px-1.5 text-[8px] sm:px-2 sm:text-[10px]"
                  : undefined
              }
            />
          </div>
          <div
            className={cn(
              "mt-auto gap-2 border-t border-[#E2E8F0] pt-3",
              compactGrid ? "flex items-center gap-1" : "grid grid-cols-2",
            )}
          >
            <Link
              href={href}
              onClick={stop}
              className={cn(
                `flex min-w-0 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-2.5 text-[12px] font-bold transition-colors ${
                  isBusy
                    ? "text-[#94A3B8]"
                    : "text-[#334155] group-hover:bg-[#F8FAFC]"
                }`,
                compactGrid &&
                  "h-11 flex-1 px-1 text-[10px] sm:px-2 sm:text-[12px]",
              )}
            >
              {t("details")}
            </Link>
            <div
              className={cn(
                "flex min-w-0 items-center",
                compactGrid ? "gap-1" : "gap-2",
              )}
            >
              <CallButton
                phone={phone}
                serviceId={id}
                label={t("call")}
                alwaysShowLabel={!showWhatsApp}
                iconOnly={showWhatsApp}
                layout="card"
                size="default"
                onClick={stop}
                className={cn(
                  "min-w-0 flex-1 rounded-[12px] px-2",
                  showWhatsApp && "size-11 min-h-11 flex-none px-0",
                )}
              />
              {showWhatsApp && (
                <WhatsAppButton
                  hasWhatsApp={hasWhatsapp}
                  whatsapp={null}
                  serviceId={id}
                  onClick={stop}
                  className="size-11 rounded-[12px]"
                />
              )}
            </div>
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
          onMouseEnter={prefetchDetail}
          onFocus={prefetchDetail}
          data-mobile-presentation={mobilePresentation}
          className={cn(
            "relative flex cursor-pointer flex-col overflow-hidden shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] focus-visible:ring-offset-2 lg:min-h-[420px] lg:rounded-[24px]",
            compactGrid
              ? "min-h-[320px] rounded-[16px] sm:min-h-[360px] sm:rounded-[20px]"
              : "min-h-[360px] rounded-[20px]",
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
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/20" />
          <div
            className={cn(
              "relative z-10 flex h-full flex-1 flex-col lg:p-5",
              compactGrid ? "p-2.5 sm:p-4" : "p-4",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex gap-2">
                {isVip && (
                  <ListingBadge
                    variant="vip"
                    className="rounded-md px-2.5 py-1 text-[11px]"
                  >
                    VIP {t("partner")}
                  </ListingBadge>
                )}
                {discountActive && (
                  <ListingBadge
                    variant="discount"
                    className="rounded-md px-2.5 py-1 text-[11px]"
                  >
                    -{discountPercent}%
                  </ListingBadge>
                )}
                <NewlyAddedBadge createdAt={createdAt} />
                <ListingAgeBadge
                  createdAt={createdAt}
                  className="bg-white/90 text-[#64748B] backdrop-blur-sm"
                />
              </div>
              <div className="flex flex-col items-end gap-2">
                <FavoriteButton
                  pressed={isFavorited}
                  onPressedChange={toggleFavorite}
                  disabled={favoriteBusy}
                  ariaLabel={t("addToFavorites")}
                  size="compact"
                  className="border-0 bg-white/90 backdrop-blur-sm"
                />
                <span className="inline-flex items-center gap-1 rounded-[6px] bg-[#0F172A]/70 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                  <Star className="h-3 w-3 fill-[#F97316] text-[#F97316]" />
                  4.9
                </span>
              </div>
            </div>
            <div className="mt-auto">
              <h3
                className={cn(
                  "font-black text-white line-clamp-2",
                  compactGrid
                    ? "text-[16px] leading-[21px] sm:text-[20px] sm:leading-[26px]"
                    : "text-[20px] leading-[26px]",
                )}
              >
                {title}
              </h3>
              {description && (
                <p className="mt-2 text-[13px] leading-[18px] text-white/85 line-clamp-3">
                  {description}
                </p>
              )}
              <div
                className={cn(
                  "mt-4 grid gap-2",
                  compactGrid ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2",
                )}
              >
                <Link
                  href={href}
                  onClick={stop}
                  className="flex items-center justify-center rounded-[12px] bg-listing-action px-2 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-listing-action-hover"
                >
                  {t("details")}
                </Link>
                <CallButton
                  phone={phone}
                  serviceId={id}
                  label={t("call")}
                  alwaysShowLabel
                  layout="card"
                  size="default"
                  onClick={stop}
                  className="w-full px-2"
                />
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
        data-service-card
        role="link"
        tabIndex={0}
        aria-label={title}
        onClick={goToDetail}
        onKeyDown={onCardKey}
        onMouseEnter={prefetchDetail}
        onFocus={prefetchDetail}
        data-mobile-presentation={mobilePresentation}
        className={cn(
          "flex h-full cursor-pointer flex-col overflow-hidden border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] focus-visible:ring-offset-2 md:h-auto lg:h-[420px] lg:rounded-[24px]",
          compactGrid ? "rounded-[16px] sm:rounded-[20px]" : "rounded-[20px]",
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden lg:h-[200px] lg:aspect-auto lg:rounded-t-[24px]",
            compactGrid
              ? "aspect-[4/3] rounded-t-[16px] sm:aspect-[8/5] sm:rounded-t-[20px]"
              : "aspect-[8/5] rounded-t-[20px]",
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
          />
          <div
            className={cn(
              "absolute flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5",
              compactGrid ? "left-2 top-2 sm:left-3 sm:top-3" : "left-3 top-3",
            )}
          >
            {isVip && <ListingBadge variant="vip">VIP</ListingBadge>}
            {isVerified && !isTransport && (
              <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#2563EB] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                <Check className="h-3 w-3" strokeWidth={3} />
                {t("verifiedBadge")}
              </span>
            )}
            {discountActive && (
              <ListingBadge variant="discount">
                -{discountPercent}%
              </ListingBadge>
            )}
          </div>
          <FavoriteButton
            pressed={isFavorited}
            onPressedChange={toggleFavorite}
            disabled={favoriteBusy}
            ariaLabel={t("addToFavorites")}
            className={cn(
              "absolute bg-white/90 backdrop-blur-sm",
              compactGrid
                ? "right-1 top-1 sm:right-3 sm:top-3"
                : "right-3 top-3",
            )}
          />
          <div
            className={cn(
              "absolute flex flex-col items-start gap-1",
              compactGrid ? "bottom-2 left-2" : "bottom-3 left-3",
            )}
          >
            <NewlyAddedBadge
              createdAt={createdAt}
              className={
                compactGrid
                  ? "max-w-[calc(100%-0.5rem)] truncate px-1.5 text-[8px] sm:px-2.5 sm:text-[9px]"
                  : undefined
              }
            />
            {!isFood && !isTransport && (
              <Badge
                variant="secondary"
                className="bg-white/90 text-[#1E293B] backdrop-blur-sm"
              >
                {t.has(`categories.${category}`)
                  ? t(`categories.${category}`)
                  : category}
              </Badge>
            )}
          </div>
        </div>
        <div
          className={cn(
            "flex flex-1 flex-col lg:p-5",
            compactGrid ? "p-2.5 sm:p-4" : "p-4",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                "min-w-0 flex-1 font-black text-[#1E293B] line-clamp-2 lg:min-h-[44px] lg:text-[18px] lg:leading-[22px]",
                compactGrid
                  ? "text-[14px] leading-[18px] sm:text-[17px] sm:leading-[21px]"
                  : "text-[17px] leading-[21px]",
              )}
            >
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
              <div className="flex justify-end">
                <ListingAgeBadge
                  createdAt={createdAt}
                  className={
                    compactGrid
                      ? "px-1.5 text-[8px] sm:px-2 sm:text-[10px]"
                      : undefined
                  }
                />
              </div>
              {vehicleMake && (
                <p className="flex items-center gap-1.5 text-[13px] text-[#334155]">
                  <Car aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium text-[#94A3B8]">
                    {t("makeLabel")}:{" "}
                  </span>
                  <span className="line-clamp-1 font-bold text-[#1E293B]">
                    {vehicleMake}
                  </span>
                </p>
              )}
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
              <div className="mt-1 flex min-w-0 items-center justify-between gap-1.5 lg:min-h-[18px]">
                {location ? (
                  <p className="flex min-w-0 items-center gap-1 text-[12px] font-medium leading-[18px] text-[#64748B]">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{location}</span>
                  </p>
                ) : (
                  <span />
                )}
                <ListingAgeBadge
                  createdAt={createdAt}
                  className={
                    compactGrid
                      ? "px-1.5 text-[8px] sm:px-2 sm:text-[10px]"
                      : undefined
                  }
                />
              </div>
              <div className="mt-2 lg:mt-3 lg:min-h-[33px]">
                {isFood
                  ? (schedule || operatingHours) && (
                      <span className="flex items-center gap-1.5 text-[14px] font-bold text-[#334155]">
                        <Clock className="h-4 w-4 text-[#F97316]" />
                        {schedule ?? operatingHours}
                      </span>
                    )
                  : price != null && (
                      // The original stays on the SAME baseline row rather than
                      // above it: this card is md:h-[420px] overflow-hidden and
                      // already near its budget, so an extra line would clip the
                      // button row on every discounted card.
                      <span className="flex items-baseline gap-1">
                        {discountActive && (
                          <span className="text-[13px] font-bold text-[#94A3B8] line-through">
                            {formatPrice(price)}
                          </span>
                        )}
                        <span className="text-[22px] font-black text-[#1E293B]">
                          {formatPrice(
                            Math.round(
                              applyDiscount(
                                price,
                                discountPercent,
                                discountExpiresAt,
                              ),
                            ),
                          )}
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
          <div
            className={cn(
              "mt-auto grid grid-cols-2 pt-3 lg:gap-2 lg:pt-4",
              compactGrid ? "gap-1" : "gap-2",
            )}
          >
            <Link
              href={href}
              onClick={stop}
              className={cn(
                "flex min-w-0 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-white px-2 py-2.5 text-[12px] font-bold text-[#334155] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors group-hover:bg-[#F8FAFC]",
                compactGrid && "h-11 px-1 text-[9px] sm:px-2 sm:text-[12px]",
              )}
            >
              {t("details")}
            </Link>
            {isFood ? (
              <CallButton
                phone={phone}
                serviceId={id}
                label={t("call")}
                alwaysShowLabel
                layout="card"
                size="default"
                onClick={stop}
                className={cn(
                  "w-full min-w-0 px-2 shadow-[0px_4px_6px_-1px_rgba(34,197,94,0.2)]",
                  compactGrid &&
                    "h-11 min-h-11 gap-1 px-1 text-[9px] sm:gap-2 sm:px-2 sm:text-[12px]",
                )}
              />
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <CallButton
                  phone={phone}
                  serviceId={id}
                  label={t("call")}
                  alwaysShowLabel
                  layout="card"
                  size="default"
                  onClick={stop}
                  className="min-w-0 flex-1 px-2 shadow-[0px_4px_6px_-1px_rgba(34,197,94,0.2)]"
                />
                {!(isTransport && isBusy) && (
                  <WhatsAppButton
                    hasWhatsApp={hasWhatsapp}
                    whatsapp={null}
                    serviceId={id}
                    onClick={stop}
                    className="shadow-[0px_4px_6px_-1px_rgba(37,211,102,0.2)]"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
