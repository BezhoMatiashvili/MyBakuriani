"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { FoodPhotoGallery } from "@/components/detail/FoodPhotoGallery";
import { FoodInfoCard } from "@/components/food-detail/FoodInfoCard";
import { FoodContactCard } from "@/components/food-detail/FoodContactCard";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import PendingReviewBanner from "@/components/listing/PendingReviewBanner";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import {
  FOOD_AMENITIES,
  optionKeyFor,
  priceUnitPathFor,
} from "@/lib/constants/listing-options";

interface Props {
  service: ServiceWithFoodExtras;
  isMock?: boolean;
  isPending?: boolean;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function FoodDetailClient({
  service,
  isMock = false,
  isPending = false,
}: Props) {
  const router = useRouter();
  const t = useTranslations("FoodDetail");
  const tShared = useTranslations("Shared");
  const tOpts = useTranslations("ListingOptions");

  // "10:30 - 21:00" → localized "from 10:30 to 21:00"; falls back to the raw string.
  const formatHoursRange = (hours: string | null): string | null => {
    if (!hours) return null;
    const match = hours.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if (match) return t("hoursRange", { from: match[1], to: match[2] });
    return hours;
  };

  useEffect(() => {
    if (isMock) return;
    const supabase = createClient();
    supabase
      .from("services")
      .update({ views_count: (service.views_count ?? 0) + 1 })
      .eq("id", service.id)
      .then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, isMock]);

  const categoryKey = optionKeyFor("serviceCategories", service.category);
  const categoryLabel = categoryKey
    ? tOpts(`serviceCategories.${categoryKey}`)
    : null;

  // null key → unknown custom DB value, rendered as-is (passthrough).
  const restaurantTypeKey = optionKeyFor(
    "restaurantTypes",
    service.restaurant_type,
  );
  const cuisineTypeKey = optionKeyFor("cuisineTypes", service.cuisine_type);

  const subtitleZone = service.location ?? null;
  const subtitleHours = formatHoursRange(service.operating_hours);

  const formatAvgCheck = (value: string | null): string | null => {
    if (!value) return null;
    if (value.includes("₾")) return value;
    if (value === "100+") return "100 ₾+";
    return `${value} ₾`;
  };

  const priceUnitPath = priceUnitPathFor(service.price_unit);
  const priceUnitLabel = priceUnitPath
    ? tOpts(priceUnitPath)
    : service.price_unit;

  const avgCheckLabel =
    formatAvgCheck(service.avg_check) ??
    (service.price != null
      ? `${formatPrice(service.price)}${
          priceUnitLabel ? ` / ${priceUnitLabel}` : ""
        }`
      : null);

  const amenityTags = FOOD_AMENITIES.filter(
    (a) => (service as unknown as Record<string, unknown>)[a.key] === true,
  ).map((a) => tOpts(`foodAmenities.${a.key}`));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-[calc(88px+env(safe-area-inset-bottom))] sm:py-8 lg:pb-8">
      {isPending && <PendingReviewBanner />}
      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        {tShared("back")}
      </motion.button>

      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.1 }}>
        <FoodPhotoGallery
          photos={service.photos ?? []}
          title={service.title}
          serviceId={service.id}
        />
      </motion.div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
            {categoryLabel && (
              <span className="mb-3 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700">
                {categoryLabel}
              </span>
            )}
            <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[34px] sm:leading-[42px]">
              {service.title}
            </h1>
            {(subtitleZone || subtitleHours) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-[#64748B]">
                {subtitleZone && <span>{subtitleZone}</span>}
                {subtitleZone && subtitleHours && (
                  <span className="text-[#CBD5E1]">•</span>
                )}
                {subtitleHours && <span>{subtitleHours}</span>}
              </div>
            )}
          </motion.div>

          {service.description && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.2 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                {t("description")}
              </h2>
              <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
                {service.description}
              </p>
            </motion.div>
          )}

          {amenityTags.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                {t("servicesAndDetails")}
              </h2>
              <div className="flex flex-wrap gap-2">
                {amenityTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-sky-50 px-4 py-2 text-[13px] font-medium text-sky-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        <motion.aside
          id="contact-sidebar"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:col-span-1"
        >
          <div className="sticky top-24 space-y-4">
            <FoodInfoCard
              establishmentType={
                restaurantTypeKey
                  ? tOpts(`restaurantTypes.${restaurantTypeKey}`)
                  : service.restaurant_type
              }
              cuisineType={
                cuisineTypeKey
                  ? tOpts(`cuisineTypes.${cuisineTypeKey}`)
                  : service.cuisine_type
              }
              zone={service.location}
              rating={null}
              avgCheck={avgCheckLabel}
              operatingHours={service.operating_hours}
            />
            <FoodContactCard
              phone={service.phone}
              menuUrl={service.menu_url}
              location={service.location}
              serviceId={service.id}
            />
          </div>
        </motion.aside>
      </div>

      <MobileStickyCTA
        primary={avgCheckLabel ?? service.title}
        secondary={service.location ?? undefined}
        ctaLabel={t("contact")}
        onClick={() =>
          document
            .getElementById("contact-sidebar")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      />
    </div>
  );
}
