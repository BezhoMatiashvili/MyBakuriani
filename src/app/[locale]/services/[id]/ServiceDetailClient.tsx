"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Phone,
  Eye,
  BadgeCheck,
  Star,
  ChevronRight,
  Languages,
  Briefcase,
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

const CATEGORY_LABELS: Record<string, string> = {
  cleaning: "დალაგება",
  handyman: "ხელოსანი",
  entertainment: "გართობა",
  transport: "ტრანსპორტი",
  food: "კვება",
  employment: "დასაქმება",
};

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function ServiceDetailClient({ service }: Props) {
  const router = useRouter();
  const owner = service.profiles;
  const categoryLabel = CATEGORY_LABELS[service.category] ?? service.category;

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
      {/* Breadcrumb */}
      <motion.nav
        {...fadeIn}
        className="mb-4 flex items-center gap-1.5 text-[12px] text-[#94A3B8]"
      >
        <span>სერვისი</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[#64748B]">{categoryLabel}</span>
      </motion.nav>

      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან დაბრუნება
      </motion.button>

      {/* Title */}
      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
        <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[36px] sm:leading-[44px]">
          {service.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[14px] text-[#64748B]">
          <span className="flex items-center gap-1.5 font-medium">
            {owner?.display_name ?? "სერვისის მომწოდებელი"}
            {owner?.is_verified && (
              <BadgeCheck className="h-4 w-4 text-[#2563EB]" />
            )}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <Star className="h-4 w-4 fill-[#FBBF24] text-[#FBBF24]" />
            4.9 (34 შეფასება)
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <Eye className="h-4 w-4" />
            {service.views_count ?? 0} ნახვა
          </span>
        </div>
      </motion.div>

      {/* Description */}
      {service.description && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.2 }}
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

      {/* Stats grid */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="mt-8 grid grid-cols-2 gap-4 rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-6 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Briefcase className="h-3.5 w-3.5" />
            ჩვენთან
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">5+ წელი</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Languages className="h-3.5 w-3.5" />
            ენები
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            ქართული, Русский
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <Clock className="h-3.5 w-3.5" />
            სამუშაო საათები
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">
            {service.schedule ?? "09:00 - 19:00"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            <BadgeCheck className="h-3.5 w-3.5" />
            გამოცდილება
          </span>
          <span className="text-[15px] font-black text-[#1E293B]">8 წელი</span>
        </div>
      </motion.div>

      {/* Verified specialist callout */}
      {owner?.is_verified && (
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-6 flex items-start gap-4 rounded-[20px] border border-[#DBEAFE] bg-[#F0F7FF] p-6"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white">
            <BadgeCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-black text-[#1E293B]">
              ვერიფიცირებული სპეციალისტი
            </h3>
            <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
              ყველა მონაცემი გადამოწმებულია MyBakuriani-ის მიერ. ჩვენ
              ვერიფიცირებულ სერვისებს მხოლოდ საიმედო სპეციალისტებს ვაცნობებთ.
            </p>
          </div>
        </motion.div>
      )}

      {/* Price + CTA row */}
      <motion.div
        {...fadeIn}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="mt-8 flex flex-col items-stretch justify-between gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-6 sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3">
          {owner && (
            <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC]">
              {owner.avatar_url ? (
                <Image
                  src={owner.avatar_url}
                  alt={owner.display_name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-sm font-medium text-[#94A3B8]">
                  {owner.display_name?.charAt(0) ?? "ს"}
                </div>
              )}
            </div>
          )}
          <div>
            {service.price != null && (
              <div>
                <span className="text-[28px] font-black leading-[32px] text-[#1E293B]">
                  {formatPrice(service.price)}
                </span>
                {service.price_unit && (
                  <span className="ml-1 text-sm text-[#94A3B8]">
                    / {service.price_unit}
                  </span>
                )}
              </div>
            )}
            <p className="text-[12px] text-[#64748B]">ფასდატვირთი ფასი</p>
          </div>
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
