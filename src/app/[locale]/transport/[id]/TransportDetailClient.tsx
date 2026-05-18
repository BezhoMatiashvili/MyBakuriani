"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Star,
  Users,
  Gauge,
  Languages,
} from "lucide-react";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { formatPrice } from "@/lib/utils/format";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
};

interface Props {
  service: ServiceWithOwner;
  isMock?: boolean;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

const FEATURE_PILLS = [
  "ხალით სახელდი",
  "მოგროვების უანი",
  "ორიენტირებული სახელიდან",
  "დაუშვებიდის სახელიდან",
  "სამრიე ხაზინახილი",
];

const STATUS_LABEL = "სტატუსი: ხელმისაწვდომი";

export default function TransportDetailClient({
  service,
  isMock = false,
}: Props) {
  const router = useRouter();
  const owner = service.profiles;
  const photos = service.photos ?? [];
  const mainPhoto = photos[0];
  const driverName = service.driver_name ?? owner?.display_name ?? "მძღოლი";
  const vehicleSubtitle = service.vehicle_make ?? service.title;
  const languagesText =
    service.languages && service.languages.length > 0
      ? service.languages.join(", ")
      : "ქართული, English, Русский";

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-[88px] sm:py-8 md:pb-8">
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
          უკან დაბრუნება
        </button>
        <span className="absolute right-4 top-4 rounded-full bg-[#2563EB] px-4 py-2 text-[13px] font-bold text-white shadow-sm">
          {STATUS_LABEL}
        </span>
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
          </div>
        </div>
        <div className="pb-1 text-right">
          <p className="flex items-center justify-end gap-1.5 text-[16px] font-black text-[#1E293B]">
            <Star className="h-4 w-4 fill-[#FBBF24] text-[#FBBF24]" />
            5.0
          </p>
          <p className="mt-0.5 text-[12px] text-[#94A3B8]">
            34 შეფასებული მძღოლი
          </p>
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
            ადგილები
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            {service.vehicle_capacity ?? 8} ადგილი
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Gauge className="h-3.5 w-3.5" />
            ტიპი
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            {service.transport_type ?? "კლიმატ კონტროლი"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Languages className="h-3.5 w-3.5" />
            ენები
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            {languagesText}
          </span>
        </div>
      </motion.div>

      {/* Services and features */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="mt-6"
      >
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
          სერვისები და შესაძლებლობები
        </h2>
        <div className="flex flex-wrap gap-2">
          {FEATURE_PILLS.map((pill) => (
            <span
              key={pill}
              className="rounded-full bg-[#F0F7FF] px-4 py-1.5 text-[13px] font-medium text-[#2563EB]"
            >
              {pill}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Description */}
      {service.description && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-8"
        >
          <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
            აღწერა
          </h2>
          <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
            {service.description}
          </p>
        </motion.div>
      )}

      {/* Route with price */}
      {service.route && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mt-8"
        >
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            მარშრუტი და ფასი
          </h2>
          <div className="flex items-center justify-between rounded-[20px] border border-[#E2E8F0] bg-white p-6">
            <div>
              <p className="text-[16px] font-black text-[#1E293B]">
                {service.route}
              </p>
              <p className="text-[13px] text-[#94A3B8]">საშუალო დრო</p>
            </div>
            {service.price != null && (
              <div className="text-right">
                <p className="text-[24px] font-black text-[#1E293B]">
                  {formatPrice(service.price)}
                </p>
                <p className="text-[12px] text-[#94A3B8]">(მთლიანი მანძილი)</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Price + CTA row (flat, no card) */}
      <motion.div
        id="contact-sidebar"
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="mt-8 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center"
      >
        <div>
          {service.price != null && (
            <div>
              <span className="text-[28px] font-black leading-[32px] text-[#1E293B] sm:text-[32px]">
                {formatPrice(service.price)}
              </span>
              {service.price_unit && (
                <span className="ml-1 text-sm text-[#94A3B8]">
                  / {service.price_unit} ფასი
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <WhatsAppButton
            phone={service.whatsapp ?? service.phone}
            serviceId={service.id}
          />
          <CallButton
            phone={service.phone}
            className="h-12 flex-1 gap-2 rounded-full bg-[#22C55E] px-8 text-[15px] font-bold text-white hover:bg-[#16A34A] sm:flex-none"
            label="დარეკვა"
            onNoPhoneClick={() => router.push("/auth/login")}
            serviceId={service.id}
          />
        </div>
      </motion.div>

      {service.price != null && (
        <MobileStickyCTA
          primary={`${formatPrice(service.price)}${service.price_unit ? ` / ${service.price_unit}` : ""}`}
          secondary={service.location ?? undefined}
          ctaLabel="დარეკვა"
          onClick={() =>
            document
              .getElementById("contact-sidebar")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          ctaClassName="shrink-0 rounded-xl bg-[#22C55E] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#16A34A]"
        />
      )}
    </div>
  );
}
