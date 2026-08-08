"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Building2, Eye, Plus, Heart, BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveOrgScope } from "@/lib/dashboard/orgScope";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatNumber } from "@/lib/utils/format";
import { useStatsFilter } from "@/lib/hooks/useStatsFilter";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import {
  ListingScopeSelect,
  type ListingOption,
} from "@/components/dashboard/ListingScopeSelect";
import ListingActions from "@/components/dashboard/ListingActions";
import { propertyViewUrl, propertyEditUrl } from "@/lib/utils/listingUrls";
import PackagePromotionPicker from "@/components/dashboard/PackagePromotionPicker";
import ListingPromotionBadges from "@/components/dashboard/ListingPromotionBadges";
import { type VipInfoTier } from "@/components/renter/VipInfoModal";
import type { Database, Tables } from "@/lib/types/database";
import { loadSellerData, type SellerData } from "./loadData";

const ListingAnalyticsPanel = dynamic(
  () => import("@/components/renter/ListingAnalyticsPanel"),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="mt-3 h-[180px] w-full rounded-2xl sm:mt-4" />
    ),
  },
);

type SellerStats =
  Database["public"]["Functions"]["owner_dashboard_stats"]["Returns"][number];

const statusLabelKeys: Record<string, string> = {
  active: "statuses.active",
  blocked: "statuses.blocked",
  pending: "statuses.pending",
  draft: "statuses.draft",
};

const statusColors: Record<string, string> = {
  active: "bg-[#DCFCE7] text-[#15803D]",
  blocked: "bg-[#FEE2E2] text-[#B91C1C]",
  pending: "bg-[#FEF3C7] text-[#A16207]",
  draft: "bg-[#F1F5F9] text-[#475569]",
};

export default function SellerDashboardClient({
  userId,
  initial,
}: {
  userId: string;
  initial: SellerData;
}) {
  const t = useTranslations("SellerDashboard");
  const tShared = useTranslations("CreateShared");
  const tStats = useTranslations("DashboardShared");
  const supabase = createClient();
  const scope = useActiveOrgScope();
  const { range, preset, listingIds, setRange, setListingIds } =
    useStatsFilter();

  // Seeded from the server render — content is present on first paint, so there
  // is no loading skeleton on initial load. Realtime updates refresh silently.
  const [loading] = useState(false);
  const [properties, setProperties] = useState<Tables<"properties">[]>(
    initial.properties,
  );
  const [listingOptions, setListingOptions] = useState<ListingOption[]>([]);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });
  const [openAnalytics, setOpenAnalytics] = useState<Set<string>>(new Set());

  // Tracks whether the properties effect below has already run once, so the
  // very first run (server-seeded `initial.properties`) never triggers an
  // extra client fetch — only a later scope switch does.
  const scopeInitialized = useRef(false);

  useEffect(() => {
    function applyData(data: SellerData) {
      setProperties(data.properties);
    }

    // Coarse single-condition realtime filter; in personal scope events for
    // the user's org-linked rows still fire, but loadSellerData excludes them
    // (organization_id IS NULL) so they only cause a harmless refetch.
    const filter =
      scope.mode === "org" && scope.organizationId
        ? `organization_id=eq.${scope.organizationId}`
        : `owner_id=eq.${userId}`;

    if (scopeInitialized.current) {
      // The active scope changed after mount — refresh immediately so the
      // preview reflects the newly selected personal/org view without
      // waiting for a live DB write to trigger the subscription below.
      loadSellerData(supabase, userId, scope).then(applyData);
    } else {
      scopeInitialized.current = true;
    }

    // Live: status / VIP changes on the owner's (or, in org scope, the
    // company's) listings refresh the preview.
    const channel = supabase
      .channel("seller-overview-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "properties",
          filter,
        },
        () => loadSellerData(supabase, userId, scope).then(applyData),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scope.mode, scope.organizationId]);

  // All sale listings (id + title only) for the stats scope selector.
  useEffect(() => {
    async function fetchListingOptions() {
      let query = supabase
        .from("properties")
        .select("id,title")
        .eq("is_for_sale", true);

      if (scope.mode === "org" && scope.organizationId) {
        query = query.eq("organization_id", scope.organizationId);
      } else {
        query = query.eq("owner_id", userId).is("organization_id", null);
      }

      const { data } = await query.order("created_at", { ascending: false });

      if (data) setListingOptions(data);
    }

    fetchListingOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scope.mode, scope.organizationId]);

  useEffect(() => {
    async function fetchStats() {
      setStatsLoading(true);
      const { data, error } = await supabase.rpc("owner_dashboard_stats", {
        p_scope: "sale",
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        // omitted (undefined) -> SQL default NULL -> all listings
        p_listing_ids: listingIds.length ? listingIds : undefined,
        p_organization_id:
          scope.mode === "org" && scope.organizationId
            ? scope.organizationId
            : undefined,
      });

      if (!error) setStats(data?.[0] ?? null);
      setStatsLoading(false);
    }

    fetchStats();
    // Primitive keys keep the dep array stable across object/array re-creates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userId,
    range.from.getTime(),
    range.to.getTime(),
    listingIds.join(","),
    scope.mode,
    scope.organizationId,
  ]);

  const activeCount = properties.filter((p) => p.status === "active").length;

  return (
    <div className="space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h1 className="text-[28px] font-black leading-[34px] text-[#0F172A]">
            {t("kpiTitle")}
          </h1>
          <div
            data-testid="seller-kpi-filters"
            className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end"
          >
            <ListingScopeSelect
              listings={listingOptions}
              selectedIds={listingIds}
              onChange={setListingIds}
              className="min-h-11 w-full min-w-0 justify-between overflow-hidden rounded-xl px-3 sm:w-auto sm:rounded-full sm:px-4"
            />
            <DateRangeFilter
              range={range}
              preset={preset}
              onChange={setRange}
              className="min-h-11 w-full min-w-0 justify-between overflow-hidden rounded-xl px-3 sm:w-auto sm:rounded-full sm:px-4"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <MetricCard
            label={tStats("stats.views")}
            value={formatNumber(stats?.views_total ?? 0)}
            badge={t("badgeTotal")}
            badgeColor="slate"
            loading={statsLoading}
          />
          <MetricCard
            label={tStats("stats.calls")}
            value={formatNumber(stats?.calls ?? 0)}
            loading={statsLoading}
          />
          <MetricCard
            label={tStats("stats.spent")}
            value={formatPrice(Number(stats?.spent ?? 0))}
            loading={statsLoading}
          />
          <MetricCard
            label={tStats("stats.favorites")}
            value={formatNumber(stats?.favorites_total ?? 0)}
            icon={<Heart className="h-5 w-5 fill-[#EF4444] text-[#EF4444]" />}
            loading={statsLoading}
          />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-start justify-between gap-3 sm:items-end">
          <div className="min-w-0">
            <h2 className="text-[24px] font-black leading-[32px] text-[#0F172A] sm:text-[28px] sm:leading-[38px]">
              {t("listingsTitle")}
            </h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              {t("activeCount", { count: activeCount })}
            </p>
          </div>
          <Link
            href="/create/sale"
            className="flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-xl bg-[#2563EB] px-3 text-[12px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(37,99,235,0.35)] hover:bg-[#1D4ED8] sm:gap-2 sm:px-5 sm:text-[13px]"
          >
            <Plus className="h-4 w-4" />
            {t("add")}
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
                {t("emptyTitle")}
              </p>
              <p className="mt-1 text-xs text-[#94A3B8]">{t("emptyDesc")}</p>
              <Link
                href="/create/sale"
                className="mt-4 flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#1D4ED8]"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addProperty")}
              </Link>
            </div>
          ) : (
            properties.map((property) => (
              <div
                key={property.id}
                data-testid="seller-overview-listing"
                data-listing-id={property.id}
                className="block rounded-[20px] border border-[#EEF1F4] bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0px_8px_24px_rgba(15,23,42,0.06)] sm:p-4"
              >
                <div className="flex gap-3 sm:gap-4">
                  <div
                    data-testid="seller-listing-thumbnail"
                    className="relative size-[88px] shrink-0 overflow-hidden rounded-xl bg-[#F8FAFC] sm:size-24 sm:rounded-lg"
                  >
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
                        {t(
                          statusLabelKeys[property.status ?? "draft"] ??
                            "statuses.draft",
                        )}
                      </span>
                    </div>
                    {property.location && (
                      <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                        {property.location}
                      </p>
                    )}
                    <span className="mt-1.5 inline-block rounded-md bg-[#FFEDD5] px-2 py-0.5 text-[11px] font-bold text-[#EA580C]">
                      {t("forSale")}
                    </span>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[16px] font-black text-[#2563EB] sm:text-[17px]">
                        {formatPrice(Number(property.sale_price ?? 0))}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-[#94A3B8]">
                        <Eye className="h-3 w-3" />
                        {property.views_count}
                      </span>
                      {property.area_sqm && (
                        <span className="text-xs text-[#94A3B8]">
                          {property.area_sqm} {tShared("sqm")}
                        </span>
                      )}
                      <ListingPromotionBadges
                        isVip={property.is_vip}
                        isSuperVip={property.is_super_vip}
                        vipExpiresAt={property.vip_expires_at}
                        discountPercent={property.discount_percent}
                        discountExpiresAt={property.discount_expires_at}
                      />
                    </div>
                  </div>
                </div>
                <ListingActions
                  viewUrl={propertyViewUrl(property)}
                  editUrl={propertyEditUrl(property)}
                  onPromote={(tier) => setPickerModal({ open: true, tier })}
                  mobilePresentation="seller-overview"
                  className="mt-3 sm:mt-4 sm:border-t sm:border-[#F1F5F9] sm:pt-4"
                >
                  <button
                    type="button"
                    aria-expanded={openAnalytics.has(property.id)}
                    aria-controls={`seller-analytics-panel-${property.id}`}
                    onClick={() =>
                      setOpenAnalytics((prev) => {
                        const next = new Set(prev);
                        if (next.has(property.id)) next.delete(property.id);
                        else next.add(property.id);
                        return next;
                      })
                    }
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB] sm:min-h-0 sm:px-3.5 sm:py-2.5"
                  >
                    <BarChart3 className="size-3.5" />
                    {tStats("analytics.button")}
                  </button>
                </ListingActions>

                {openAnalytics.has(property.id) && (
                  <motion.div
                    id={`seller-analytics-panel-${property.id}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <ListingAnalyticsPanel
                      listingId={property.id}
                      listingType="property"
                    />
                  </motion.div>
                )}
              </div>
            ))
          )}
        </div>
      </motion.section>

      <PackagePromotionPicker
        isOpen={pickerModal.open}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        tier={pickerModal.tier}
        listings={properties.map((p) => ({
          id: p.id,
          title: p.title,
          subtitle: p.location ?? undefined,
          photoUrl: (p.photos ?? [])[0] ?? null,
          isForSale: p.is_for_sale ?? true,
          price: (p.is_for_sale ? p.sale_price : p.price_per_night) ?? null,
        }))}
        target="property"
        onPurchased={async () => {
          const data = await loadSellerData(supabase, userId, scope);
          setProperties(data.properties);
        }}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  badge,
  badgeColor,
  icon,
  valueColor,
  loading,
}: {
  label: string;
  value: string;
  badge?: string;
  badgeColor?: "green" | "slate";
  icon?: React.ReactNode;
  valueColor?: string;
  loading?: boolean;
}) {
  const badgeClass =
    badgeColor === "green"
      ? "bg-[#DCFCE7] text-[#15803D]"
      : "bg-[#F1F5F9] text-[#64748B]";
  return (
    <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]">
      <p className="text-[12px] font-medium text-[#64748B]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <span
            className="text-[22px] lg:text-[32px] font-black leading-none"
            style={{ color: valueColor ?? "#0F172A" }}
          >
            {value}
          </span>
        )}
        {icon
          ? icon
          : badge && (
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${badgeClass}`}
              >
                {badge}
              </span>
            )}
      </div>
    </div>
  );
}
