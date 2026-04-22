"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Phone,
  BadgeCheck,
  Star,
  Users,
  Gauge,
  Languages,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
};

interface Props {
  service: ServiceWithOwner;
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

export default function TransportDetailClient({ service }: Props) {
  const router = useRouter();
  const owner = service.profiles;
  const photos = service.photos ?? [];
  const mainPhoto = photos[0];

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("services")
      .update({ views_count: (service.views_count ?? 0) + 1 })
      .eq("id", service.id)
      .then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან დაბრუნება
      </motion.button>

      {/* Hero photo */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.1 }}
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
        {photos.length > 1 && (
          <button
            type="button"
            className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#1E293B] shadow-sm backdrop-blur transition-colors hover:bg-white"
          >
            <ImageIcon className="h-4 w-4" />
            ყველა ფოტოს ჩვენება
          </button>
        )}
      </motion.div>

      {/* Driver + vehicle header */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="mt-6 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC]">
            {owner?.avatar_url ? (
              <Image
                src={owner.avatar_url}
                alt={owner.display_name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-sm font-medium text-[#94A3B8]">
                {(service.driver_name ?? owner?.display_name ?? "მ").charAt(0)}
              </div>
            )}
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[16px] font-black text-[#1E293B]">
              {service.driver_name ?? owner?.display_name ?? "მძღოლი"}
              {owner?.is_verified && (
                <BadgeCheck className="h-4 w-4 text-[#2563EB]" />
              )}
            </p>
            <p className="text-[13px] text-[#64748B]">{service.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[14px]">
          <Star className="h-4 w-4 fill-[#FBBF24] text-[#FBBF24]" />
          <span className="font-black text-[#1E293B]">5.0</span>
          <span className="text-[#94A3B8]">34 შეფასებული წევრი</span>
        </div>
      </motion.div>

      {/* Stats grid */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-6 grid grid-cols-1 gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-6 sm:grid-cols-3"
      >
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Users className="h-3.5 w-3.5" />
            ტევადობა
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            {service.vehicle_capacity ?? 8} ადგილი
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Gauge className="h-3.5 w-3.5" />
            გზა
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            კლიმატ კონტროლი
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Languages className="h-3.5 w-3.5" />
            ენები
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            ქართული, English, Русский
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
                <p className="text-[12px] text-[#94A3B8]">ერთი მგზავრი</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Price + CTA row */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="mt-8 flex flex-col items-stretch justify-between gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-6 sm:flex-row sm:items-center"
      >
        <div>
          {service.price != null && (
            <div>
              <span className="text-[32px] font-black leading-[32px] text-[#1E293B]">
                {formatPrice(service.price)}
              </span>
              {service.price_unit && (
                <span className="ml-1 text-sm text-[#94A3B8]">
                  / {service.price_unit}
                </span>
              )}
            </div>
          )}
          <p className="text-[12px] text-[#64748B]">ერთი მგზავრი</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={service.phone ? `https://wa.me/${service.phone}` : "#"}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white transition-colors hover:bg-[#1EB453]"
            aria-label="WhatsApp"
          >
            <svg
              className="h-5 w-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </a>
          <Button
            onClick={() => router.push("/auth/login")}
            className="h-12 flex-1 gap-2 rounded-full bg-[#22C55E] px-8 text-[15px] font-bold text-white hover:bg-[#16A34A] sm:flex-none"
          >
            <Phone className="h-4 w-4" />
            დარეკვა
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
