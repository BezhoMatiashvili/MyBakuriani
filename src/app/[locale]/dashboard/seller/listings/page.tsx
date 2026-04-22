"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Edit, Building2, Search, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

const constructionStatusLabel: Record<string, string> = {
  under_construction: "მშენებარე",
  completed: "დასრულებული",
  ready: "მზა",
};

function formatRelativeGe(iso: string | null | undefined) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ახლახან";
  if (diffMin < 60) return `${diffMin} წთ წინ`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} სთ წინ`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} დღის წინ`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo} თვის წინ`;
}

export default function SellerListingsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [properties, setProperties] = useState<Tables<"properties">[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) return;

    async function fetchProperties() {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .eq("owner_id", user!.id)
        .eq("is_for_sale", true)
        .order("created_at", { ascending: false });

      if (data) setProperties(data);
      setLoading(false);
    }

    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredProperties = useMemo(
    () =>
      properties.filter(
        (p) =>
          !searchQuery ||
          p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.location.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [properties, searchQuery],
  );

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
            ობიექტები / პროექტები
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            მართეთ თქვენი პორთფოლიო, სტატუსები და განახლებები.
          </p>
        </div>
        <Link
          href="/create/sale"
          className="flex items-center gap-2 self-start rounded-xl bg-[#0F172A] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,23,42,0.3)] hover:bg-[#1E293B]"
        >
          <Plus className="h-4 w-4" />
          ობიექტის დამატება
        </Link>
      </motion.div>

      <div className="relative max-w-lg">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
        <input
          type="text"
          placeholder="ობიექტის ძებნა..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-4 text-[13px] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
            >
              <Skeleton className="mb-4 h-44 w-full rounded-xl" />
              <Skeleton className="mb-2 h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))
        ) : filteredProperties.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#CBD5E1] bg-white py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EFF6FF]">
              <Building2 className="h-6 w-6 text-[#2563EB]" />
            </span>
            <p className="mt-4 text-sm font-semibold text-[#0F172A]">
              ობიექტები ვერ მოიძებნა
            </p>
          </div>
        ) : (
          filteredProperties.map((property, index) => {
            const photos = property.photos ?? [];
            const coverPhoto = photos[0];
            const totalUnits = property.capacity ?? 60;
            const soldUnits = Math.min(
              Math.round((property.views_count ?? 0) / 300),
              totalUnits,
            );
            const reserveUnits = Math.min(
              Math.round(totalUnits * 0.13),
              totalUnits - soldUnits,
            );
            const freeUnits = Math.max(
              totalUnits - soldUnits - reserveUnits,
              0,
            );
            const soldPercent = Math.round((soldUnits / totalUnits) * 100) || 0;
            const reservePercent =
              Math.round((reserveUnits / totalUnits) * 100) || 0;
            const freePercent = Math.max(100 - soldPercent - reservePercent, 0);
            const constrLabel = property.construction_status
              ? (constructionStatusLabel[property.construction_status] ??
                property.construction_status)
              : null;
            const constrChipText =
              constrLabel && property.completion_year
                ? `${constrLabel} (${property.completion_year})`
                : constrLabel;
            const updatedAt =
              property.progress_note_updated_at ??
              property.updated_at ??
              property.created_at;
            const lastNote =
              property.progress_note ?? property.description ?? "";

            return (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <div className="relative h-[210px] w-full overflow-hidden bg-[#0F172A]">
                  {coverPhoto ? (
                    <Image
                      src={coverPhoto}
                      alt={property.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#CBD5E1]">
                      <Building2 className="h-10 w-10" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(2,6,14,0.85)] via-[rgba(2,6,14,0.25)] to-transparent" />
                  <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                    {constrChipText && (
                      <span className="rounded-md bg-[#0F172A] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.06em] text-white">
                        {constrChipText}
                      </span>
                    )}
                    {property.is_vip && (
                      <span className="rounded-md bg-[#FEF3C7] px-3 py-1.5 text-[11px] font-black uppercase text-[#A16207]">
                        VIP
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-[22px] font-black leading-[28px] text-white">
                      {property.title}
                    </h3>
                    <p className="mt-1 text-[12px] font-semibold text-white/80">
                      {property.developer
                        ? `${property.developer} • მრავალბინიანი პროექტი`
                        : "მრავალბინიანი პროექტი"}
                    </p>
                  </div>
                </div>

                <div className="p-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[12px] font-bold">
                      <span className="text-[#64748B]">
                        გაყიდვების პროგრესი
                      </span>
                      <span className="text-[#0F172A]">
                        {soldPercent}% ({soldUnits}/{totalUnits})
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                      <div
                        className="h-full bg-[#10B981]"
                        style={{ width: `${soldPercent}%` }}
                      />
                      <div
                        className="h-full bg-[#F59E0B]"
                        style={{ width: `${reservePercent}%` }}
                      />
                      <div
                        className="h-full bg-[#CBD5E1]"
                        style={{ width: `${freePercent}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold">
                      <span className="flex items-center gap-1 text-[#10B981]">
                        <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                        {soldUnits} გაყიდული
                      </span>
                      <span className="flex items-center gap-1 text-[#F59E0B]">
                        <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                        {reserveUnits} რეზერვი
                      </span>
                      <span className="flex items-center gap-1 text-[#64748B]">
                        <span className="h-2 w-2 rounded-full bg-[#94A3B8]" />
                        {freeUnits} თავისუფალი
                      </span>
                    </div>
                  </div>

                  {lastNote && (
                    <div className="mt-4 rounded-xl border border-[#EEF1F4] bg-[#F8FAFC] p-3">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                          <Target className="h-3.5 w-3.5 text-[#F97316]" />
                          ბოლო განახლება
                        </span>
                        <span className="text-[10px] font-semibold text-[#94A3B8]">
                          {formatRelativeGe(updatedAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[12px] italic text-[#475569]">
                        &ldquo;{lastNote}&rdquo;
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,23,42,0.3)] hover:bg-[#1E293B]"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    პროგრესის / სტატუსის განახლება
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
