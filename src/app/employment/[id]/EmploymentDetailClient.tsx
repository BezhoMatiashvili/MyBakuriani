"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Eye,
  BadgeCheck,
  Briefcase,
  Clock,
  Banknote,
  GraduationCap,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "@/components/detail/PhotoGallery";
import { formatPhone } from "@/lib/utils/format";
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

export default function EmploymentDetailClient({ service }: Props) {
  const router = useRouter();
  const owner = service.profiles;

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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან დაბრუნება
      </motion.button>

      {(service.photos ?? []).length > 0 && (
        <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.1 }}>
          <PhotoGallery photos={service.photos ?? []} title={service.title} />
        </motion.div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {/* Title */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                ვაკანსია
              </span>
              {service.is_vip && (
                <span className="rounded bg-brand-vip px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-white">
                  VIP
                </span>
              )}
            </div>
            <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[34px] sm:leading-[42px]">
              {service.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-[14px] text-[#64748B]">
              {service.location && (
                <span className="flex items-center gap-1.5 font-medium">
                  <MapPin className="h-4 w-4 text-[#2563EB]" />
                  {service.location}
                </span>
              )}
              <span className="flex items-center gap-1.5 font-medium">
                <Eye className="h-4 w-4" />
                {service.views_count} ნახვა
              </span>
            </div>
          </motion.div>

          {/* Job details grid */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.2 }}>
            <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
              ვაკანსიის დეტალები
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {service.position && (
                <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Briefcase className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-xs text-[#94A3B8]">პოზიცია</p>
                    <p className="font-medium">{service.position}</p>
                  </div>
                </div>
              )}
              {service.salary_range && (
                <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Banknote className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-xs text-[#94A3B8]">ანაზღაურება</p>
                    <p className="font-medium">{service.salary_range}</p>
                  </div>
                </div>
              )}
              {service.experience_required && (
                <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <GraduationCap className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-xs text-[#94A3B8]">გამოცდილება</p>
                    <p className="font-medium">{service.experience_required}</p>
                  </div>
                </div>
              )}
              {service.employment_schedule && (
                <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <CalendarDays className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-xs text-[#94A3B8]">სამუშაო განრიგი</p>
                    <p className="font-medium">{service.employment_schedule}</p>
                  </div>
                </div>
              )}
              {service.schedule && (
                <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Clock className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-xs text-[#94A3B8]">განრიგი</p>
                    <p className="font-medium">{service.schedule}</p>
                  </div>
                </div>
              )}
              {service.phone && (
                <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-medium text-[#334155]">
                  <Phone className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-xs text-[#94A3B8]">ტელეფონი</p>
                    <p className="font-medium">{formatPhone(service.phone)}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Description */}
          {service.description && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                სრული აღწერა
              </h2>
              <p className="text-[15px] font-medium leading-[27px] text-[#475569] whitespace-pre-line">
                {service.description}
              </p>
            </motion.div>
          )}
        </div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="sticky top-24 rounded-[20px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
            {/* Salary */}
            {service.salary_range && (
              <div className="mb-4">
                <p className="text-xs text-[#94A3B8]">ანაზღაურება</p>
                <span className="text-[32px] font-black leading-[32px] text-[#1E293B]">
                  {service.salary_range}
                </span>
              </div>
            )}

            {/* Position highlight */}
            {service.position && (
              <div className="mb-4 rounded-lg bg-indigo-50 p-3">
                <p className="text-xs text-[#94A3B8]">პოზიცია</p>
                <p className="font-semibold text-indigo-700">
                  {service.position}
                </p>
              </div>
            )}

            <div className="my-4 border-t border-[#E2E8F0]" />

            {/* Employer */}
            <div className="mb-4 flex items-center gap-3">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-[#F8FAFC]">
                {owner?.avatar_url ? (
                  <Image
                    src={owner.avatar_url}
                    alt={owner.display_name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-sm font-medium text-[#94A3B8]">
                    {owner?.display_name?.charAt(0) ?? "დ"}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-[#1E293B]">
                  {owner?.display_name ?? "დამსაქმებელი"}
                </p>
                {owner?.is_verified && (
                  <div className="flex items-center gap-1 text-xs text-brand-accent">
                    <BadgeCheck className="size-3.5" />
                    ვერიფიცირებული
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={() => router.push("/auth/login")}
              className="h-[55px] w-full gap-2 rounded-2xl bg-indigo-600 text-[15px] font-bold tracking-[0.375px] text-white hover:bg-indigo-700"
            >
              <Briefcase className="h-4 w-4" />
              გამოხმაურება
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
