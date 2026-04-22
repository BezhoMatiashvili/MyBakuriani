"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, Eye, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import SalesBoard from "@/components/seller/SalesBoard";
import type { Tables } from "@/lib/types/database";

const statusLabels: Record<string, string> = {
  active: "აქტიური",
  blocked: "დაბლოკილი",
  pending: "მოლოდინში",
  draft: "დრაფტი",
};

const statusColors: Record<string, string> = {
  active: "bg-[#DCFCE7] text-[#15803D]",
  blocked: "bg-[#FEE2E2] text-[#B91C1C]",
  pending: "bg-[#FEF3C7] text-[#A16207]",
  draft: "bg-[#F1F5F9] text-[#475569]",
};

export default function SellerDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Tables<"properties">[]>([]);

  useEffect(() => {
    if (!user) return;

    async function fetchProperties() {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .eq("owner_id", user!.id)
        .eq("is_for_sale", true)
        .order("created_at", { ascending: false })
        .limit(4);

      if (data) setProperties(data);
      setLoading(false);
    }

    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="space-y-10">
      <SalesBoard />

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
              ჩემი განცხადებები
            </h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              {properties.length} აქტიური განცხადება
            </p>
          </div>
          <Link
            href="/create/sale"
            className="flex items-center gap-2 self-start rounded-xl bg-[#2563EB] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(37,99,235,0.35)] hover:bg-[#1D4ED8]"
          >
            <Plus className="h-4 w-4" />
            დამატება
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <div className="flex gap-4">
                  <Skeleton className="h-24 w-24 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            ))
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#CBD5E1] bg-white py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EFF6FF]">
                <Building2 className="h-6 w-6 text-[#2563EB]" />
              </span>
              <p className="mt-4 text-sm font-semibold text-[#0F172A]">
                გასაყიდი ობიექტები ჯერ არ გაქვთ
              </p>
              <p className="mt-1 text-xs text-[#94A3B8]">
                დაამატეთ პირველი ობიექტი და დაიწყეთ გაყიდვა
              </p>
              <Link
                href="/create/sale"
                className="mt-4 flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#1D4ED8]"
              >
                <Plus className="h-3.5 w-3.5" />
                დაამატეთ ობიექტი
              </Link>
            </div>
          ) : (
            properties.map((property) => (
              <Link
                key={property.id}
                href="/dashboard/seller/listings"
                className="block rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0px_8px_24px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-[#F8FAFC] sm:w-24">
                    {(property.photos ?? [])[0] && (
                      <Image
                        src={(property.photos ?? [])[0]}
                        alt={property.title}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-bold text-[#1E293B]">
                        {property.title}
                      </h3>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusColors[property.status ?? "draft"] ?? ""}`}
                      >
                        {statusLabels[property.status ?? "draft"] ??
                          property.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#94A3B8]">
                      {property.location}
                    </p>
                    <div className="mt-2 flex items-center gap-4">
                      <span className="text-[17px] font-black text-[#2563EB]">
                        {formatPrice(Number(property.sale_price ?? 0))}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-[#94A3B8]">
                        <Eye className="h-3 w-3" />
                        {property.views_count}
                      </span>
                      {property.area_sqm && (
                        <span className="text-xs text-[#94A3B8]">
                          {property.area_sqm} მ²
                        </span>
                      )}
                      {property.is_vip && (
                        <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#A16207]">
                          VIP
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </motion.section>
    </div>
  );
}
