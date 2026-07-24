"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Users,
  Gauge,
  Languages,
  Palette,
  Share2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { shareListing } from "@/lib/share";
import { formatPrice } from "@/lib/utils/format";
import { TransportContactFooter } from "@/components/shared/TransportContactFooter";
import ZoneLocationLink from "@/components/maps/ZoneLocationLink";
import {
  optionKeyFor,
  parseRoutePricing,
  priceUnitPathFor,
  type OptionGroup,
} from "@/lib/constants/listing-options";
import type { Tables } from "@/lib/types/database";
import PendingReviewBanner from "@/components/listing/PendingReviewBanner";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
};

interface Props {
  service: ServiceWithOwner;
  isMock?: boolean;
  isPending?: boolean;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function TransportDetailClient({
  service,
  isMock = false,
  isPending = false,
}: Props) {
  const router = useRouter();
  const t = useTranslations("TransportDetail");
  const tShared = useTranslations("Shared");
  const tShare = useTranslations("ShareListing");
  const tCard = useTranslations("ServiceCard");
  const tOpts = useTranslations("ListingOptions");
  // Translates a stored DB option value; falls through to the raw value for
  // custom/free-text entries.
  const optionLabel = (group: OptionGroup, value: string) => {
    const key = optionKeyFor(group, value);
    return key ? tOpts(`${group}.${key}`) : value;
  };
  const priceUnitPath = priceUnitPathFor(service.price_unit);
  const owner = service.profiles;
  const photos = service.photos ?? [];
  const mainPhoto = photos[0];
  const driverName =
    service.driver_name ?? owner?.display_name ?? t("driverFallback");
  const vehicleSubtitle = service.vehicle_make ?? service.title;
  const languagesText =
    service.languages && service.languages.length > 0
      ? service.languages.map((l) => optionLabel("languages", l)).join(", ")
      : null;
  const routes =
    service.routes && service.routes.length > 0
      ? service.routes
      : service.route
        ? [service.route]
        : [];
  // Per-route pricing is the source of truth when present; otherwise fall back
  // to the legacy single-price card below.
  const routePricing = parseRoutePricing(service.route_pricing);
  const routeUnitLabel = (unit: string) => {
    const path = priceUnitPathFor(unit);
    return path ? tOpts(path) : unit;
  };

  useEffect(() => {
    if (isMock) return;
    void fetch(`/api/listings/service/${service.id}/view`, { method: "POST" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, isMock]);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))] sm:pt-8">
      {isPending && <PendingReviewBanner />}
      {/* Hero photo with floating back button + status pill */}
      <motion.div
        {...fadeIn}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-[20px] bg-gradient-to-br from-[#E2E8F0] to-[#CBD5E1]"
      >
        {mainPhoto ? (
          <Image
            src={mainPhoto}
            alt={service.title}
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#94A3B8]">
            <svg
              className="h-24 w-24"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 17l-5-5 5-5M21 12H3M16 7l5 5-5 5"
              />
            </svg>
          </div>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#1E293B] shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {tShared("back")}
        </button>
        <button
          type="button"
          onClick={() =>
            shareListing(service.title, {
              copied: tShare("copied"),
              error: tShare("error"),
            })
          }
          aria-label={tShare("label")}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#1E293B] shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          <Share2 className="h-[18px] w-[18px]" />
        </button>
      </motion.div>

      {/* Driver + vehicle header (avatar overlaps hero) */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="mt-4 flex flex-wrap items-end justify-between gap-4"
      >
        <div className="flex items-end gap-4">
          <div className="relative -mt-12 size-20 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC] shadow-md ring-4 ring-white sm:-mt-14 sm:size-24">
            {owner?.avatar_url ? (
              <Image
                src={owner.avatar_url}
                alt={driverName}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-2xl font-medium text-[#94A3B8]">
                {driverName.charAt(0)}
              </div>
            )}
          </div>
          <div className="pb-1">
            <p className="flex items-center gap-1.5 text-[20px] font-black leading-tight text-[#1E293B] sm:text-[22px]">
              {driverName}
              {(owner?.is_verified ?? isMock) && (
                <BadgeCheck className="h-5 w-5 text-[#22C55E]" />
              )}
            </p>
            <p className="mt-0.5 text-[14px] text-[#64748B]">
              {vehicleSubtitle}
            </p>
            {service.location && (
              <ZoneLocationLink
                location={service.location}
                className="mt-1 text-[13px] font-medium text-[#64748B]"
              />
            )}
          </div>
        </div>
      </motion.div>

      {/* Stats row (flat, no card) */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-8 grid grid-cols-1 gap-6 border-t border-b border-[#E2E8F0] py-6 sm:grid-cols-3"
      >
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Users className="h-3.5 w-3.5" />
            {t("seats")}
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            {t("seatsCount", { count: service.vehicle_capacity ?? 8 })}
          </span>
        </div>
        {service.transport_type && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <Gauge className="h-3.5 w-3.5" />
              {t("type")}
            </span>
            <span className="text-[15px] font-black text-[#1E293B]">
              {service.transport_type &&
              tCard.has(`transportTypes.${service.transport_type}`)
                ? tCard(`transportTypes.${service.transport_type}`)
                : service.transport_type}
            </span>
          </div>
        )}
        {service.vehicle_color && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <Palette className="h-3.5 w-3.5" />
              {t("color")}
            </span>
            <span className="text-[15px] font-black text-[#1E293B]">
              {optionLabel("vehicleColors", service.vehicle_color)}
            </span>
          </div>
        )}
        {languagesText && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              <Languages className="h-3.5 w-3.5" />
              {t("languages")}
            </span>
            <span className="text-[15px] font-black text-[#1E293B]">
              {languagesText}
            </span>
          </div>
        )}
      </motion.div>

      {/* Services and features */}
      {service.equipment && service.equipment.length > 0 && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="mt-6"
        >
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            {t("equipmentAndSafety")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {service.equipment.map((item) => (
              <span
                key={item}
                className="rounded-[14px] border border-[#DBEAFE] bg-[#EFF6FF] px-4 py-2 text-[13px] font-semibold text-[#2563EB]"
              >
                {optionLabel("vehicleEquipment", item)}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Comfort & services (features) */}
      {service.features && service.features.length > 0 && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.27 }}
          className="mt-6"
        >
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            {t("comfortAndServices")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {service.features.map((item) => (
              <span
                key={item}
                className="rounded-[14px] border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-2 text-[13px] font-semibold text-[#16A34A]"
              >
                {optionLabel("transportFeatures", item)}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Description */}
      {service.description && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-8"
        >
          <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
            {t("description")}
          </h2>
          <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
            {service.description}
          </p>
        </motion.div>
      )}

      {/* Routes with price */}
      {routePricing.length > 0 ? (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mt-8"
        >
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            {t("routeAndPrice")}
          </h2>
          <div className="rounded-[20px] border border-[#E2E8F0] bg-white">
            {routePricing.map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-4 p-6 ${
                  i > 0 ? "border-t border-[#E2E8F0]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[18px] font-black leading-tight text-[#1E293B] sm:text-[20px]">
                    {optionLabel("transportRoutes", row.route)}
                  </p>
                  {row.subtitle && (
                    <p className="mt-1 text-[12px] font-medium text-[#94A3B8]">
                      {row.subtitle}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[22px] font-black leading-tight text-[#1E293B] sm:text-[26px]">
                    {formatPrice(row.price)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#94A3B8]">
                    ({routeUnitLabel(row.unit)})
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        routes.length > 0 && (
          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mt-8"
          >
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              {t("routeAndPrice")}
            </h2>
            <div className="flex flex-col gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <ul className="flex flex-col gap-1">
                  {routes.map((r) => (
                    <li
                      key={r}
                      className="text-[18px] font-black leading-tight text-[#1E293B] sm:text-[20px]"
                    >
                      {optionLabel("transportRoutes", r)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[12px] font-medium text-[#94A3B8]">
                  {t("startingPrice")}
                </p>
              </div>
              {service.price != null && (
                <div className="shrink-0 sm:text-right">
                  <p className="text-[26px] font-black leading-tight text-[#1E293B] sm:text-[28px]">
                    {formatPrice(service.price)}
                  </p>
                  {service.price_unit && (
                    <p className="mt-0.5 text-[12px] text-[#94A3B8]">
                      (
                      {priceUnitPath
                        ? tOpts(priceUnitPath)
                        : service.price_unit}
                      )
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )
      )}

      <TransportContactFooter phone={service.phone} serviceId={service.id} />
    </div>
  );
}
