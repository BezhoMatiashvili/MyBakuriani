"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Edit, Building2, Search, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveOrgScope } from "@/lib/dashboard/orgScope";
import { useRealtimeList } from "@/lib/hooks/useRealtime";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";
import ConstructionProgressBar from "@/components/shared/ConstructionProgressBar";
import MultiSegmentBar from "@/components/shared/MultiSegmentBar";
import ConstructionManagementModal from "@/components/seller/ConstructionManagementModal";
import { getUnitsBreakdown } from "@/lib/constants/construction";
import { formatRelativeGe } from "@/lib/utils/format";
import ListingActions from "@/components/dashboard/ListingActions";
import { propertyViewUrl, propertyEditUrl } from "@/lib/utils/listingUrls";
import VipPropertyPickerModal from "@/components/renter/VipPropertyPickerModal";
import type { VipInfoTier } from "@/components/renter/VipInfoModal";

const constructionStatusLabel: Record<string, string> = {
  under_construction: "მშენებარე",
  completed: "დასრულებული",
  old_built: "ძველი აშენებული",
  ready: "მზა",
};

export default function SellerListingsPage() {
  const { user } = useAuth();
  const scope = useActiveOrgScope();
  const isOrgScope = scope.mode === "org" && !!scope.organizationId;
  const supabase = createClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [editingProperty, setEditingProperty] =
    useState<Tables<"properties"> | null>(null);
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });

  // Live sale listings — status / progress / VIP changes arrive without refresh.
  // The list is scoped by owner_id (or organization_id in org scope) AND is_for_sale,
  // but a postgres_changes filter only takes one condition, so we refetch on any
  // change to the scoped properties.
  const {
    rows: properties,
    setRows: setProperties,
    loading,
    refetch,
  } = useRealtimeList<Tables<"properties">>({
    table: "properties",
    mode: "refetch",
    enabled: !!user,
    filter: isOrgScope
      ? `organization_id=eq.${scope.organizationId}`
      : user
        ? `owner_id=eq.${user.id}`
        : undefined,
    fetcher: async () => {
      let query = supabase
        .from("properties")
        .select("*")
        .eq("is_for_sale", true);
      query = isOrgScope
        ? query.eq("organization_id", scope.organizationId!)
        : query.eq("owner_id", user!.id);
      const { data } = await query.order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // The subscription filter re-subscribes automatically when it changes, but the
  // initial `useRealtimeList` fetch effect only runs once on mount — force a refetch
  // whenever the active scope switches so the list reflects the new owner/organization.
  useEffect(() => {
    void refetch();
  }, [isOrgScope, scope.organizationId, refetch]);

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
            const isUnderConstruction =
              property.construction_status === "under_construction";
            const progressPercent = property.construction_progress_percent ?? 0;
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
            const lastNote = property.progress_note ?? "";
            const units = getUnitsBreakdown(property);

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
                  {units.total > 0 ? (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
                        <span className="font-bold text-[#64748B]">
                          გაყიდვების პროგრესი
                        </span>
                        <span className="font-black text-[#0F172A]">
                          {units.soldPct}% ({units.sold + units.reserved}/
                          {units.total})
                        </span>
                      </div>
                      <MultiSegmentBar
                        total={units.total}
                        sold={units.sold}
                        reserved={units.reserved}
                      />
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <LegendDot color="#16A34A" label="გაყიდული" />
                        <LegendDot color="#F59E0B" label="ჯავშანი" />
                        <LegendDot color="#E2E8F0" label="თავისუფალი" />
                      </div>
                    </div>
                  ) : isUnderConstruction ? (
                    <ConstructionProgressBar
                      percent={progressPercent}
                      hint={
                        property.completion_year
                          ? `მზადყოფნა • ${property.completion_year}`
                          : undefined
                      }
                    />
                  ) : (
                    <div className="rounded-xl border border-[#DCFCE7] bg-[#F0FDF4] px-3 py-2.5 text-center text-[12px] font-bold text-[#15803D]">
                      ობიექტი დასრულებულია
                    </div>
                  )}

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

                  <ListingActions
                    className="mt-4"
                    viewUrl={propertyViewUrl(property)}
                    editUrl={propertyEditUrl(property)}
                    onPromote={(tier) => setPickerModal({ open: true, tier })}
                  >
                    <button
                      type="button"
                      onClick={() => setEditingProperty(property)}
                      className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,23,42,0.3)] hover:bg-[#1E293B]"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      პროგრესის / სტატუსის განახლება
                    </button>
                  </ListingActions>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <ConstructionManagementModal
        property={editingProperty}
        onClose={() => setEditingProperty(null)}
        onSaved={(updated) =>
          setProperties((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          )
        }
      />

      <VipPropertyPickerModal
        isOpen={pickerModal.open}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        tier={pickerModal.tier}
        properties={properties.map((p) => ({
          id: p.id,
          title: p.title,
          subtitle: p.location ?? undefined,
          photoUrl: (p.photos ?? [])[0] ?? null,
          isForSale: p.is_for_sale ?? false,
        }))}
        onConfirm={async (propertyId) => {
          const { error } = await supabase.functions.invoke("purchase-vip", {
            body: {
              purchase_type:
                pickerModal.tier === "super-vip"
                  ? "super_vip"
                  : pickerModal.tier === "vip"
                    ? "vip_boost"
                    : pickerModal.tier === "discount"
                      ? "discount_badge"
                      : "sms_package",
              days: 1,
              property_id: propertyId,
            },
          });
          if (error) throw error;
        }}
      />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[12px] font-medium text-[#475569]">{label}</span>
    </span>
  );
}
