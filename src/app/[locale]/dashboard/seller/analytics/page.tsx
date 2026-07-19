"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveOrgScope } from "@/lib/dashboard/orgScope";
import { leadsClient } from "@/lib/supabase/leads";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils/format";
import { useStatsFilter } from "@/lib/hooks/useStatsFilter";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import {
  ListingScopeSelect,
  type ListingOption,
} from "@/components/dashboard/ListingScopeSelect";

interface FunnelStage {
  label: string;
  value: number;
  color: string;
  textColor: string;
}

interface SourceRow {
  label: string;
  value: number;
  percent: number;
  color: string;
}

export default function SellerAnalyticsPage() {
  const t = useTranslations("SellerAnalytics");
  const { user } = useAuth();
  const supabase = createClient();
  const scope = useActiveOrgScope();

  const { range, preset, label, listingIds, setRange, setListingIds } =
    useStatsFilter();

  const [loading, setLoading] = useState(true);
  const [listingOptions, setListingOptions] = useState<ListingOption[]>([]);
  const [views, setViews] = useState(0);
  const [favorites, setFavorites] = useState(0);
  const [contactReveals, setContactReveals] = useState(0);
  const [realContacts, setRealContacts] = useState(0);
  const [closed, setClosed] = useState(0);

  useEffect(() => {
    if (!user) return;

    async function fetchListings() {
      let query = supabase
        .from("properties")
        .select("id, title")
        .eq("is_for_sale", true);

      if (scope.mode === "org" && scope.organizationId) {
        query = query.eq("organization_id", scope.organizationId);
      } else {
        query = query.eq("owner_id", user!.id);
      }

      const { data } = await query.order("created_at", { ascending: false });

      if (data) setListingOptions(data);
    }

    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, scope.mode, scope.organizationId]);

  useEffect(() => {
    if (!user) return;

    async function fetch() {
      let leadsQuery = leadsClient(supabase)
        .from("leads")
        .select("stage", { count: "exact" })
        .gte("created_at", range.from.toISOString())
        .lt("created_at", range.to.toISOString());
      if (scope.mode === "org" && scope.organizationId) {
        leadsQuery = leadsQuery.eq("organization_id", scope.organizationId);
      } else {
        leadsQuery = leadsQuery.eq("owner_id", user!.id);
      }
      if (listingIds.length) {
        leadsQuery = leadsQuery.in("property_id", listingIds);
      }

      const [statsRes, leadsRes] = await Promise.all([
        supabase.rpc("seller_dashboard_stats", {
          p_from: range.from.toISOString(),
          p_to: range.to.toISOString(),
          p_property_ids: listingIds.length ? listingIds : undefined,
          p_organization_id:
            scope.mode === "org"
              ? (scope.organizationId ?? undefined)
              : undefined,
        }),
        leadsQuery,
      ]);

      const s = statsRes.data?.[0];
      if (s) {
        setViews(Number(s.views_total));
        setFavorites(Number(s.favorites));
        setContactReveals(Number(s.contact_reach));
        setClosed(Number(s.sold));
      }
      if (!leadsRes.error && leadsRes.data) {
        const rows = leadsRes.data as { stage: string }[];
        setRealContacts(
          rows.filter(
            (r) =>
              r.stage === "contacted" ||
              r.stage === "shown" ||
              r.stage === "negotiating",
          ).length,
        );
      }
      setLoading(false);
    }

    fetch();
    /* eslint-disable react-hooks/exhaustive-deps */
  }, [
    user,
    range.from.getTime(),
    range.to.getTime(),
    listingIds.join(","),
    scope.mode,
    scope.organizationId,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const funnel: FunnelStage[] = [
    {
      label: t("funnelViews"),
      value: views,
      color: "bg-[#E2E8F0]",
      textColor: "text-[#0F172A]",
    },
    {
      label: t("funnelFavorites"),
      value: favorites,
      color: "bg-[#60A5FA]",
      textColor: "text-white",
    },
    {
      label: t("funnelContact"),
      value: contactReveals,
      color: "bg-[#2563EB]",
      textColor: "text-white",
    },
    {
      label: t("funnelRealContact"),
      value: realContacts,
      color: "bg-[#10B981]",
      textColor: "text-white",
    },
    {
      label: t("funnelClosed"),
      value: closed,
      color: "bg-[#047857]",
      textColor: "text-white",
    },
  ];

  const maxValue = Math.max(1, ...funnel.map((s) => s.value));

  const sources: SourceRow[] = [
    { label: "Smart Match", value: 0, percent: 0, color: "bg-[#2563EB]" },
    { label: t("sourceDirect"), value: 0, percent: 0, color: "bg-[#10B981]" },
    { label: t("sourceReferral"), value: 0, percent: 0, color: "bg-[#F59E0B]" },
    { label: t("sourceOther"), value: 0, percent: 0, color: "bg-[#94A3B8]" },
  ];

  const metrics: { label: string; value: string; sub: string }[] = [
    {
      label: t("metricAvgViews"),
      value: views
        ? Math.round(views / Math.max(1, funnel.length)).toString()
        : "0",
      sub: label,
    },
    {
      label: t("metricConversion"),
      value: views ? `${((realContacts / views) * 100).toFixed(1)}%` : "0%",
      sub: label,
    },
    {
      label: t("metricResponseTime"),
      value: "—",
      sub: t("insufficientData"),
    },
    {
      label: t("metricCloseRate"),
      value: realContacts
        ? `${((closed / realContacts) * 100).toFixed(1)}%`
        : "0%",
      sub: label,
    },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          {t("subtitle")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DateRangeFilter range={range} preset={preset} onChange={setRange} />
          <ListingScopeSelect
            listings={listingOptions}
            selectedIds={listingIds}
            onChange={setListingIds}
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-8"
      >
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.15em] text-[#94A3B8]">
          {t("funnelTitle")}
        </p>
        <div className="mx-auto mt-8 max-w-2xl">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {funnel.map((stage, idx) => {
                const widthPct = Math.max(
                  12,
                  Math.round((stage.value / maxValue) * 100),
                );
                return (
                  <div
                    key={stage.label}
                    className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(120px,1fr)_2fr] sm:items-center sm:gap-4"
                  >
                    <p className="text-left text-[12px] font-semibold text-[#0F172A] sm:text-right">
                      {stage.label}
                    </p>
                    <motion.div
                      initial={{ scaleX: 0, transformOrigin: "left" }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.05 * idx, duration: 0.4 }}
                      className={`flex h-11 items-center rounded-xl ${stage.color} px-2 sm:px-4`}
                      style={{ width: `${widthPct}%` }}
                    >
                      <span
                        className={`text-[13px] font-black ${stage.textColor}`}
                      >
                        {formatNumber(stage.value)}
                      </span>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h3 className="text-[14px] font-black text-[#0F172A]">
            {t("leadSources")}
          </h3>
          <div className="mt-5 space-y-4">
            {sources.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-[12px] font-bold">
                  <span className="text-[#0F172A]">{s.label}</span>
                  <span className="text-[#64748B]">
                    {s.value} ({s.percent}%)
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                  <div
                    className={`h-full ${s.color}`}
                    style={{ width: `${s.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#94A3B8]">
            {t("metricsTitle")}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-2xl border border-[#EEF1F4] bg-[#F8FAFC] p-4"
              >
                <p className="text-[11px] font-semibold text-[#64748B]">
                  {m.label}
                </p>
                <p className="mt-2 text-[22px] font-black leading-none text-[#0F172A]">
                  {m.value}
                </p>
                <p className="mt-1.5 text-[10px] text-[#94A3B8]">{m.sub}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
