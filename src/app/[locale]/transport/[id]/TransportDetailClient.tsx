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
import { applyDiscount, isDiscountActive } from "@/lib/utils/pricing";
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
  has_whatsapp?: boolean;
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
  // ServiceCard's isTransport branch renders a discount BADGE but no price, so
  // the card advertised a discount that this page then contradicted with full
  // prices. The two price blocks below are mutually exclusive — a listing with
  // route pricing never renders the single-price one — so the discount has to
  // reach BOTH, or the contradiction survives for whichever branch a given
  // listing takes.
  const discountActive = isDiscountActive(
    service.discount_percent,
    service.discount_expires_at,
  );
  const discounted = (value: number) =>
    Math.round(
      applyDiscount(
        value,
        service.discount_percent,
        service.discount_expires_at,
      ),
    );

  useEffect(() => {
    if (isMock) return;
    void fetch(`/api/listings/service/${service.id}/view`, { method: "POST" });
  }, [service.id, isMock]);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-[calc(var(--mobile-detail-clearance)+env(safe-area-inset-bottom))] sm:pt-8 lg:pb-[96px]">
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

      {/* Compact mobile spec tiles; flat four-column row on wider screens. */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.2 }}
        data-testid="transport-detail-stats"
        className="mt-6 grid grid-cols-2 gap-2 border-b border-[#E2E8F0] pb-6 md:mt-8 md:grid-cols-4 md:gap-6 md:border-t md:py-6"
      >
        {service.vehicle_capacity != null && (
          <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-[#E2E8F0] bg-white px-3 py-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.5px] text-[#94A3B8] md:text-[11px]">
              <Users className="h-3.5 w-3.5" />
              {t("seats")}
            </span>
            <span className="break-words text-[13px] font-black text-[#1E293B] md:text-[15px]">
              {t("seatsCount", { count: service.vehicle_capacity })}
            </span>
          </div>
        )}
        {service.transport_type && (
          <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-[#E2E8F0] bg-white px-3 py-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.5px] text-[#94A3B8] md:text-[11px]">
              <Gauge className="h-3.5 w-3.5" />
              {t("type")}
            </span>
            <span className="break-words text-[13px] font-black text-[#1E293B] md:text-[15px]">
              {service.transport_type &&
              tCard.has(`transportTypes.${service.transport_type}`)
                ? tCard(`transportTypes.${service.transport_type}`)
                : service.transport_type}
            </span>
          </div>
        )}
        {service.vehicle_color && (
          <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-[#E2E8F0] bg-white px-3 py-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.5px] text-[#94A3B8] md:text-[11px]">
              <Palette className="h-3.5 w-3.5" />
              {t("color")}
            </span>
            <span className="break-words text-[13px] font-black text-[#1E293B] md:text-[15px]">
              {optionLabel("vehicleColors", service.vehicle_color)}
            </span>
          </div>
        )}
        {languagesText && (
          <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-[#E2E8F0] bg-white px-3 py-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.5px] text-[#94A3B8] md:text-[11px]">
              <Languages className="h-3.5 w-3.5" />
              {t("languages")}
            </span>
            <span className="break-words text-[13px] font-black text-[#1E293B] md:text-[15px]">
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
          className="mt-5 md:mt-6"
        >
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8] md:mb-4">
            {t("equipmentAndSafety")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {service.equipment.map((item) => (
              <span
                key={item}
                className="rounded-[12px] border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-1.5 text-[12px] font-semibold text-[#2563EB] md:rounded-[14px] md:px-4 md:py-2 md:text-[13px]"
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
          className="mt-5 md:mt-6"
        >
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8] md:mb-4">
            {t("comfortAndServices")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {service.features.map((item) => (
              <span
                key={item}
                className="rounded-[12px] border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-1.5 text-[12px] font-semibold text-[#16A34A] md:rounded-[14px] md:px-4 md:py-2 md:text-[13px]"
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
          className="mt-6 md:mt-8"
        >
          <h2 className="mb-3 text-[15px] font-black leading-6 text-[#0F172A] md:text-[20px] md:leading-[30px]">
            {t("description")}
          </h2>
          <p className="whitespace-pre-line rounded-[14px] border border-[#E2E8F0] bg-white px-4 py-3 text-[14px] font-medium leading-6 text-[#475569] md:rounded-none md:border-0 md:bg-transparent md:p-0 md:text-[15px] md:leading-[27px]">
            {service.description}
          </p>
        </motion.div>
      )}

      {/* Routes with price */}
      {routePricing.length > 0 ? (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mt-6 md:mt-8"
        >
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            {t("routeAndPrice")}
          </h2>
          <div className="rounded-[20px] border border-[#E2E8F0] bg-white">
            {routePricing.map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-3 p-4 md:gap-4 md:p-6 ${
                  i > 0 ? "border-t border-[#E2E8F0]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-black leading-tight text-[#1E293B] md:text-[20px]">
                    {optionLabel("transportRoutes", row.route)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {discountActive && (
                    <p className="text-[13px] font-bold text-[#94A3B8] line-through">
                      {formatPrice(row.price)}
                    </p>
                  )}
                  <p className="text-[20px] font-black leading-tight text-[#1E293B] md:text-[26px]">
                    {formatPrice(discounted(row.price))}
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
            className="mt-6 md:mt-8"
          >
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              {t("routeAndPrice")}
            </h2>
            <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[#E2E8F0] bg-white p-4 md:gap-4 md:p-6">
              <div className="min-w-0">
                <ul className="flex flex-col gap-1">
                  {routes.map((r) => (
                    <li
                      key={r}
                      className="text-[14px] font-black leading-tight text-[#1E293B] md:text-[20px]"
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
                <div className="shrink-0 text-right">
                  {discountActive && (
                    <p className="text-[13px] font-bold text-[#94A3B8] line-through">
                      {formatPrice(service.price)}
                    </p>
                  )}
                  <p className="text-[20px] font-black leading-tight text-[#1E293B] md:text-[28px]">
                    {formatPrice(discounted(service.price))}
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

      <TransportContactFooter
        phone={null}
        hasWhatsapp={service.has_whatsapp ?? false}
        whatsapp={null}
        serviceId={service.id}
      />
    </div>
  );
}
