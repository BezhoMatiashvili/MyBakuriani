"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

import { FoodPhotoGallery } from "@/components/detail/FoodPhotoGallery";
import { FoodInfoCard } from "@/components/food-detail/FoodInfoCard";
import { FoodContactCard } from "@/components/food-detail/FoodContactCard";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import {
  FOOD_AMENITIES,
  SERVICE_CATEGORY_LABELS,
  labelForRestaurantType,
  labelForCuisineType,
} from "@/lib/constants/listing-options";

interface Props {
  service: ServiceWithFoodExtras;
  isMock?: boolean;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

// "10:30 - 21:00" → "10:30-დან 21:00-მდე"; falls back to the raw string.
function formatHoursRange(hours: string | null): string | null {
  if (!hours) return null;
  const match = hours.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (match) return `${match[1]}-დან ${match[2]}-მდე`;
  return hours;
}

export default function FoodDetailClient({ service, isMock = false }: Props) {
  const router = useRouter();

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

  const categoryLabel = SERVICE_CATEGORY_LABELS[service.category] ?? null;

  const subtitleZone = service.location ?? null;
  const subtitleHours = formatHoursRange(service.operating_hours);

  const formatAvgCheck = (value: string | null): string | null => {
    if (!value) return null;
    if (value.includes("₾")) return value;
    if (value === "100+") return "100 ₾+";
    return `${value} ₾`;
  };

  const avgCheckLabel =
    formatAvgCheck(service.avg_check) ??
    (service.price != null
      ? `${formatPrice(service.price)}${
          service.price_unit ? ` / ${service.price_unit}` : ""
        }`
      : null);

  const amenityTags = FOOD_AMENITIES.filter(
    (a) => (service as unknown as Record<string, unknown>)[a.key] === true,
  ).map((a) => a.label);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-[88px] sm:py-8 md:pb-8">
      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან დაბრუნება
      </motion.button>

      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.1 }}>
        <FoodPhotoGallery photos={service.photos ?? []} title={service.title} />
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
                აღწერა
              </h2>
              <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
                {service.description}
              </p>
            </motion.div>
          )}

          {amenityTags.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                სერვისები და დეტალები
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
              establishmentType={labelForRestaurantType(
                service.restaurant_type,
              )}
              cuisineType={labelForCuisineType(service.cuisine_type)}
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
        ctaLabel="კონტაქტი"
        onClick={() =>
          document
            .getElementById("contact-sidebar")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      />
    </div>
  );
}
