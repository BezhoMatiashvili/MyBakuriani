"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Star,
  Clock,
  Users,
  Zap,
  ImageIcon,
  Info,
} from "lucide-react";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { formatPrice } from "@/lib/utils/format";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import ZoneLocationLink from "@/components/maps/ZoneLocationLink";
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

export default function EntertainmentDetailClient({
  service,
  isMock = false,
}: Props) {
  const router = useRouter();
  const photos = service.photos ?? [];
  const mainPhoto = photos[0];

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
      {/* Hero photo with floating back button */}
      <motion.div
        {...fadeIn}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-[24px] bg-[#F8FAFC]"
      >
        {mainPhoto && (
          <Image
            src={mainPhoto}
            alt={service.title}
            fill
            className="object-cover"
            priority
          />
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#1E293B] shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          უკან დაბრუნება
        </button>
        {photos.length > 0 && (
          <button
            type="button"
            className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#1E293B] shadow-sm backdrop-blur transition-colors hover:bg-white"
          >
            <ImageIcon className="h-4 w-4" />
            ფოტო გალერია ({photos.length})
          </button>
        )}
      </motion.div>

      {/* Category + title */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="mt-6"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-md bg-[#FFF7ED] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-[#EA580C]">
            გართობა
          </span>
          <span className="rounded-md bg-[#F1F5F9] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
            ტური
          </span>
        </div>
        <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[36px] sm:leading-[44px]">
          {service.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[14px] text-[#64748B]">
          <span className="flex items-center gap-1.5 font-medium">
            <Star className="h-4 w-4 fill-[#FBBF24] text-[#FBBF24]" />
            <span className="font-black text-[#1E293B]">5.0</span>
            <span>| 12 შეფასება</span>
          </span>
          {service.location && (
            <ZoneLocationLink
              location={service.location}
              className="font-medium"
            />
          )}
        </div>
      </motion.div>

      {/* What to expect / description */}
      {service.description && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-8"
        >
          <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
            რას გვთავაზობთ
          </h2>
          <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
            {service.description}
          </p>
        </motion.div>
      )}

      {/* Stats grid — four separate cards */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E8F0] bg-white p-5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Clock className="h-3.5 w-3.5" />
            ხანგრძლივობა
          </span>
          <span className="text-[16px] font-black text-[#1E293B]">1 საათი</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E8F0] bg-white p-5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Users className="h-3.5 w-3.5" />
            ასაკი
          </span>
          <span className="text-[16px] font-black text-[#1E293B]">16+</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E8F0] bg-white p-5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Zap className="h-3.5 w-3.5" />
            ექსტრემის დონე
          </span>
          <span className="text-[16px] font-black text-[#1E293B]">
            ექსტრემის მოყვარულთა
          </span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[16px] border border-[#E2E8F0] bg-white p-5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Clock className="h-3.5 w-3.5" />
            საათები
          </span>
          <span className="text-[16px] font-black text-[#1E293B]">
            {service.operating_hours ?? "10:00 - 18:00"}
          </span>
        </div>
      </motion.div>

      {/* Safety callout */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mt-6 rounded-[16px] border border-[#DBEAFE] bg-[#F0F7FF] p-5"
      >
        <h3 className="flex items-center gap-2 text-[13px] font-bold text-[#2563EB]">
          <Info className="h-4 w-4" />
          უსაფრთხოება და პირობები
        </h3>
        <p className="mt-2 text-[13px] leading-[20px] text-[#475569]">
          ჩაცმა შედის ფასში, მოყვება ინსტრუქტორი
        </p>
      </motion.div>

      {/* Price + CTA row */}
      <motion.div
        id="contact-sidebar"
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="mt-8 flex flex-col items-stretch justify-between gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-6 sm:flex-row sm:items-center"
      >
        <div>
          {service.price != null && (
            <div>
              <span className="text-[32px] font-black leading-[32px] text-[#1E293B]">
                {formatPrice(service.price)}
              </span>
              <span className="ml-1 text-sm text-[#94A3B8]">
                / {service.price_unit ?? "1 საათი"}
              </span>
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
            className="h-12 flex-1 gap-2 rounded-full bg-[#1E293B] px-8 text-[15px] font-bold text-white hover:bg-[#0F172A] sm:flex-none"
            label="დარეკვა / დაჯავშნა"
            onNoPhoneClick={() => router.push("/auth/login")}
            serviceId={service.id}
          />
        </div>
      </motion.div>

      {service.price != null && (
        <MobileStickyCTA
          primary={`${formatPrice(service.price)} / ${service.price_unit ?? "1 საათი"}`}
          secondary={service.location ?? undefined}
          ctaLabel="დარეკვა"
          onClick={() =>
            document
              .getElementById("contact-sidebar")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          ctaClassName="shrink-0 rounded-xl bg-[#1E293B] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#0F172A]"
        />
      )}
    </div>
  );
}
