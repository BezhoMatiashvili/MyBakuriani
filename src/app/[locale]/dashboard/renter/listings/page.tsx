"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Eye,
  Edit,
  Building,
  Search,
  Rocket,
  Ticket,
  Percent,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRealtimeList } from "@/lib/hooks/useRealtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import { propertyViewUrl, propertyEditUrl } from "@/lib/utils/listingUrls";
import VipPropertyPickerModal from "@/components/renter/VipPropertyPickerModal";
import type { VipInfoTier } from "@/components/renter/VipInfoModal";
import type { Tables } from "@/lib/types/database";

const STATUS_KEYS = ["active", "blocked", "pending", "draft"] as const;

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  draft: "bg-gray-100 text-gray-700",
};

const FILTER_KEYS = ["all", "active", "pending", "blocked"] as const;

export default function RenterListingsPage() {
  const t = useTranslations("RenterListings");
  const tDash = useTranslations("RenterDashboard");
  const tShared = useTranslations("DashboardShared");
  const tError = useTranslations("Error");
  const { user } = useAuth();
  const supabase = createClient();

  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });

  const {
    rows: properties,
    loading,
    error,
    refetch,
  } = useRealtimeList<Tables<"properties">>({
    table: "properties",
    enabled: !!user,
    filter: user ? `owner_id=eq.${user.id}` : undefined,
    sort: (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    fetcher: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false });
      // Surface the failure so the hook exposes `error` and the page shows a
      // retry — the owner's listings must not silently vanish into the empty
      // "no listings" state on a transient timeout under load.
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredProperties = properties
    .filter((p) => activeFilter === "all" || p.status === activeFilter)
    .filter(
      (p) =>
        !searchQuery ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const counts = {
    all: properties.length,
    active: properties.filter((p) => p.status === "active").length,
    pending: properties.filter((p) => p.status === "pending").length,
    blocked: properties.filter((p) => p.status === "blocked").length,
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>
        <Link href="/create/rental">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            {t("newProperty")}
          </Button>
        </Link>
      </motion.div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 pl-10 pr-4 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] placeholder:text-[#94A3B8] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_KEYS.map((key) => (
          <Button
            key={key}
            variant={activeFilter === key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(key)}
          >
            {key === "all"
              ? t("filterAll")
              : tDash(`statuses.${key as (typeof STATUS_KEYS)[number]}`)}
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-[10px]">
              {counts[key as keyof typeof counts]}
            </span>
          </Button>
        ))}
      </div>

      {/* Listings table/cards */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
            >
              <div className="flex gap-4">
                <Skeleton className="h-20 w-20 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 text-center shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <Building className="h-12 w-12 text-[#94A3B8]" />
            <p className="mt-3 max-w-sm text-sm font-medium text-[#64748B]">
              {tError("description")}
            </p>
            <Button size="sm" className="mt-4" onClick={() => refetch()}>
              {tError("retry")}
            </Button>
          </div>
        ) : filteredProperties.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
          >
            <Building className="h-12 w-12 text-[#94A3B8]" />
            <p className="mt-3 text-sm text-[#94A3B8]">{t("notFound")}</p>
            <Link href="/create/rental" className="mt-4">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                {t("addProperty")}
              </Button>
            </Link>
          </motion.div>
        ) : (
          filteredProperties.map((property, index) => (
            <motion.div
              key={property.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* Image */}
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#F8FAFC]">
                  {(property.photos ?? [])[0] && (
                    <Image
                      src={(property.photos ?? [])[0]}
                      alt={property.title}
                      fill
                      className="object-cover"
                    />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="truncate text-sm font-semibold text-[#1E293B]">
                        {property.title}
                      </h3>
                      <p className="text-xs text-[#94A3B8]">
                        {property.location}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[property.status ?? "draft"] ?? ""}`}
                    >
                      {STATUS_KEYS.includes(
                        (property.status ??
                          "draft") as (typeof STATUS_KEYS)[number],
                      )
                        ? tDash(
                            `statuses.${property.status as (typeof STATUS_KEYS)[number]}`,
                          )
                        : property.status}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[#94A3B8]">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {tDash("views", { count: property.views_count ?? 0 })}
                    </span>
                    <span>
                      {tShared("roomsGuests", {
                        rooms: property.rooms ?? 0,
                        guests: property.capacity ?? 0,
                      })}
                    </span>
                    <span className="font-bold text-brand-accent">
                      {formatPrice(Number(property.price_per_night ?? 0))}
                      {tShared("perNight")}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    {property.is_vip && (
                      <Badge className="bg-amber-500 text-white">VIP</Badge>
                    )}
                    {property.is_super_vip && (
                      <Badge className="bg-purple-500 text-white">
                        Super VIP
                      </Badge>
                    )}
                    {(property.discount_percent ?? 0) > 0 && (
                      <Badge variant="secondary">
                        -{property.discount_percent}%
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-2">
                  <a
                    href={propertyViewUrl(property)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="icon-sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </a>
                  <Link href={propertyEditUrl(property)}>
                    <Button variant="outline" size="icon-sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Promote tier row */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] pt-3">
                <span className="mr-auto text-[12px] font-semibold text-[#64748B]">
                  {t("promote")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPickerModal({ open: true, tier: "super-vip" })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#EA580C] transition-colors hover:bg-[#FFEDD5]"
                >
                  <Rocket className="h-3 w-3" />
                  SUPER VIP
                </button>
                <button
                  type="button"
                  onClick={() => setPickerModal({ open: true, tier: "vip" })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#FBCFE8] bg-[#FCE7F3] px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#BE185D] transition-colors hover:bg-[#FBCFE8]"
                >
                  <Ticket className="h-3 w-3" />
                  VIP
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPickerModal({ open: true, tier: "discount" })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#86EFAC] bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-black tracking-wide text-[#15803D] transition-colors hover:bg-[#BBF7D0]"
                >
                  <Percent className="h-3 w-3" />
                  {tDash("discount")}
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

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
          // `properties` is no longer in the realtime publication, so refresh
          // the list explicitly to reflect the new VIP/discount badge.
          await refetch();
        }}
      />
    </div>
  );
}
