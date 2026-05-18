"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";

import { FoodPhotoGallery } from "@/components/detail/FoodPhotoGallery";
import { FoodInfoCard } from "@/components/food-detail/FoodInfoCard";
import { FoodContactCard } from "@/components/food-detail/FoodContactCard";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";

interface MenuItem {
  name: string;
  price: number;
  description?: string;
}

interface Props {
  service: ServiceWithFoodExtras;
  isMock?: boolean;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function FoodDetailClient({ service, isMock = false }: Props) {
  const router = useRouter();
  const extras = service.food_extras;

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

  const menuItems: MenuItem[] = Array.isArray(service.menu)
    ? (service.menu as unknown as MenuItem[])
    : [];

  const subtitleZone = extras?.zone ?? null;
  const subtitleHours = service.operating_hours ?? null;

  const fallbackAvgCheck =
    service.avg_check ??
    (service.price != null
      ? `${formatPrice(service.price)}${
          service.price_unit ? ` / ${service.price_unit}` : ""
        }`
      : null);

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
            {extras?.is_open && (
              <span className="mb-3 inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                ღია
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

          {extras?.service_tags && extras.service_tags.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                სერვისები და დეტალები
              </h2>
              <div className="flex flex-wrap gap-2">
                {extras.service_tags.map((tag) => (
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

          {menuItems.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.3 }}>
              <h2 className="mb-4 flex items-center gap-2 text-[20px] font-black leading-[30px] text-[#0F172A]">
                <UtensilsCrossed className="h-5 w-5" />
                მენიუ
              </h2>
              <div className="divide-y divide-[#E2E8F0] overflow-hidden rounded-xl border border-[#E2E8F0]">
                {menuItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#F8FAFC]/60"
                  >
                    <div>
                      <p className="font-medium text-[#1E293B]">{item.name}</p>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-[#94A3B8]">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold text-[#1E293B]">
                      {formatPrice(item.price)}
                    </span>
                  </div>
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
                extras?.establishment_type ?? service.cuisine_type
              }
              cuisineType={service.cuisine_type}
              zone={extras?.zone ?? service.location}
              rating={extras?.rating ?? null}
              avgCheck={fallbackAvgCheck}
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
        primary={fallbackAvgCheck ?? service.title}
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
