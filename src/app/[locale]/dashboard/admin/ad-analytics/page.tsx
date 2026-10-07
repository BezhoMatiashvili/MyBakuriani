"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import DateField from "@/components/shared/DateField";
import { formatDateShort, formatNumber } from "@/lib/utils/format";
import { BANNER_PLACEMENTS } from "@/lib/banner-placements";
import { addDays, tbilisiToday } from "@/lib/admin-statuses";
import {
  BANNER_ANALYTICS_DEFAULT_DAYS,
  BANNER_ANALYTICS_PRESETS,
  actualSovPercent,
  ctrPercent,
  isBannerSource,
  type BannerAnalytics,
  type BannerAnalyticsCreative,
  type BannerSource,
} from "@/lib/banner-analytics";
import { rotationModeFor } from "@/lib/ad-rotation";

// The media plan's report (C47, §6): impressions, reach, clicks, CTR =
// clicks / impressions, the campaign period and planned vs actual SOV.
type Metric = "impressions" | "opens" | "clicks";
type SortKey = "impressions" | "reach" | "clicks" | "ctr";

const METRICS: Metric[] = ["impressions", "opens", "clicks"];
const METRIC_COLOR: Record<Metric, string> = {
  impressions: "#2563EB",
  opens: "#F59E0B",
  clicks: "#10B981",
};
const STATUS_COLOR: Record<string, string> = {
  live: "#10B981",
  scheduled: "#2563EB",
  paused: "#F59E0B",
  off: "#94A3B8",
  expired: "#94A3B8",
  deleted: "#EF4444",
};

function formatCtr(clicks: number, impressions: number): string {
  const ctr = ctrPercent(clicks, impressions);
  return ctr === null ? "—" : `${ctr.toFixed(1)}%`;
}

function formatActualSov(c: BannerAnalyticsCreative): string {
  const actual = actualSovPercent(c.impressions, c.slot_impressions);
  return actual === null ? "—" : `${actual.toFixed(1)}%`;
}

export default function AdminAdAnalyticsPage() {
  const t = useTranslations("AdminAdAnalytics");
  const tShared = useTranslations("AdminShared");
  const locale = useLocale();
  const searchParams = useSearchParams();

  // Deep links from the ads and banners pages: ?source=ad&creative=<id>.
  const initialSource = searchParams.get("source");
  const [source, setSource] = useState<BannerSource | "">(
    isBannerSource(initialSource) ? initialSource : "",
  );
  const [creative, setCreative] = useState<string | null>(
    isBannerSource(initialSource) ? searchParams.get("creative") : null,
  );
  const [placement, setPlacement] = useState("");
  const [preset, setPreset] = useState<number | "custom">(
    BANNER_ANALYTICS_DEFAULT_DAYS,
  );
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [metric, setMetric] = useState<Metric>("impressions");
  const [sortKey, setSortKey] = useState<SortKey>("impressions");

  const [today] = useState(() => tbilisiToday());
  const [data, setData] = useState<BannerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (preset === "custom") {
      if (!customFrom || !customTo) return null;
      params.set("from", customFrom);
      params.set("to", customTo);
    } else {
      params.set("from", addDays(today, -(preset - 1)));
      params.set("to", today);
    }
    if (source) params.set("source", source);
    if (placement) params.set("placement", placement);
    if (creative && source) params.set("creative", creative);
    return params.toString();
  }, [preset, customFrom, customTo, today, source, placement, creative]);

  const load = useCallback(
    async (qs: string) => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/admin/banner-analytics?${qs}`, {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.analytics) {
          // Older numbers may still be on screen, so say why they didn't change.
          toast.error(
            payload?.error === "invalid_range"
              ? t("rangeInvalid")
              : tShared("loadFailed"),
          );
          setFailed(true);
          return;
        }
        setData(payload.analytics as BannerAnalytics);
      } catch {
        toast.error(tShared("loadFailed"));
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [t, tShared],
  );

  useEffect(() => {
    if (query !== null) void load(query);
  }, [query, load]);

  const placementLabel = useCallback(
    (id: string | null) =>
      id && BANNER_PLACEMENTS.some((p) => p.id === id)
        ? tShared(`placements.${id}`)
        : (id ?? "—"),
    [tShared],
  );

  const creatives = useMemo(() => {
    const rows = [...(data?.creatives ?? [])];
    const score = (c: BannerAnalyticsCreative) =>
      sortKey === "ctr"
        ? (ctrPercent(c.clicks, c.impressions) ?? -1)
        : c[sortKey];
    return rows.sort((a, b) => score(b) - score(a));
  }, [data, sortKey]);

  const totals = data?.totals ?? {
    views: 0,
    opens: 0,
    clicks: 0,
    impressions: 0,
    reach: 0,
  };
  const isEmpty = (data?.daily ?? []).every((d) => d[metric] === 0);
  const focused =
    creative && data
      ? (data.creatives.find((c) => c.id === creative) ?? null)
      : null;

  function creativeName(c: BannerAnalyticsCreative): string {
    return c.title ?? t("deletedTitle", { source: t(`sources.${c.source}`) });
  }

  function plannedSov(c: BannerAnalyticsCreative): string {
    if (c.source !== "ad" || c.sov_percent === null) return "—";
    return c.placement && rotationModeFor(c.placement) === "rotation"
      ? t("sovRotation")
      : `${c.sov_percent}%`;
  }

  function period(c: BannerAnalyticsCreative): string {
    const day = (iso: string | null) =>
      iso ? formatDateShort(iso, locale) : "…";
    return c.start_at || c.end_at
      ? `${day(c.start_at)} – ${day(c.end_at)}`
      : "—";
  }

  const selectCls =
    "h-11 min-h-[44px] max-w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold text-[#1E293B] outline-none focus:border-[#2563EB]";

  return (
    <div className="relative h-full w-full overflow-x-auto">
      <div className="flex min-h-full flex-col gap-6 pb-10">
        <div className="space-y-2 pb-2">
          <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
            {t("subtitle")}
          </p>
          <p className="max-w-[880px] text-[12px] font-medium leading-[18px] text-[#94A3B8]">
            {t("definitions")}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-[#E2E8F0] bg-white p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {BANNER_ANALYTICS_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={preset === days}
                onClick={() => setPreset(days)}
                className={`min-h-11 rounded-xl px-4 text-[12px] font-bold transition-colors ${
                  preset === days
                    ? "bg-[#0F172A] text-white"
                    : "bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9]"
                }`}
              >
                {t("days", { count: days })}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={preset === "custom"}
              onClick={() => {
                if (data && !customFrom) {
                  setCustomFrom(data.from);
                  setCustomTo(data.to);
                }
                setPreset("custom");
              }}
              className={`min-h-11 rounded-xl px-4 text-[12px] font-bold transition-colors ${
                preset === "custom"
                  ? "bg-[#0F172A] text-white"
                  : "bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              {t("customRange")}
            </button>
          </div>

          {preset === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <DateField
                id="analytics-from"
                value={customFrom}
                onChange={setCustomFrom}
                max={customTo || today}
                placeholder={t("from")}
                className="w-[160px]"
              />
              <span className="text-[#94A3B8]">—</span>
              <DateField
                id="analytics-to"
                value={customTo}
                onChange={setCustomTo}
                min={customFrom || undefined}
                max={today}
                placeholder={t("to")}
                className="w-[160px]"
              />
            </div>
          ) : null}

          <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              {t("source")}
            </span>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value as BannerSource | "");
                setCreative(null);
              }}
              className={selectCls}
            >
              <option value="">{t("allSources")}</option>
              <option value="ad">{t("sources.adPlural")}</option>
              <option value="banner">{t("sources.bannerPlural")}</option>
            </select>
          </label>

          <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
              {tShared("placement")}
            </span>
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              className={selectCls}
            >
              <option value="">{t("allPlacements")}</option>
              {BANNER_PLACEMENTS.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {tShared(`placements.${spec.id}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {creative ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
            <p className="text-[13px] font-bold text-[#1E3A8A]">
              {t("creativeReport", {
                title: focused ? creativeName(focused) : "…",
              })}
            </p>
            <button
              type="button"
              onClick={() => setCreative(null)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-[12px] font-bold text-[#2563EB]"
            >
              <X className="h-3.5 w-3.5" />
              {t("showAll")}
            </button>
          </div>
        ) : null}

        {failed && !data ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[#E2E8F0] bg-white py-16">
            <p className="text-sm font-semibold text-[#94A3B8]">
              {tShared("loadFailed")}
            </p>
            {query !== null ? (
              <button
                type="button"
                onClick={() => void load(query)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-4 text-[12px] font-bold text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("retry")}
              </button>
            ) : null}
          </div>
        ) : !data ? (
          <div className="space-y-4">
            <Skeleton className="h-[96px] w-full rounded-3xl" />
            <Skeleton className="h-[280px] w-full rounded-3xl" />
          </div>
        ) : (
          <div
            className={`flex flex-col gap-6 transition-opacity ${loading ? "opacity-60" : ""}`}
            aria-busy={loading}
          >
            {/* KPI tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi
                label={t("metrics.impressions")}
                value={formatNumber(totals.impressions)}
                color={METRIC_COLOR.impressions}
              />
              <Kpi
                label={t("metrics.reach")}
                value={formatNumber(totals.reach)}
                color="#7C3AED"
              />
              <Kpi
                label={t("metrics.clicks")}
                value={formatNumber(totals.clicks)}
                color={METRIC_COLOR.clicks}
              />
              <Kpi
                label={t("metrics.ctr")}
                value={formatCtr(totals.clicks, totals.impressions)}
                color="#0F172A"
              />
              <Kpi
                label={t("metrics.opens")}
                value={formatNumber(totals.opens)}
                color={METRIC_COLOR.opens}
              />
              <Kpi
                label={t("metrics.live")}
                value={formatNumber(data.live_now)}
                color="#64748B"
              />
            </div>

            {/* One campaign's report: its period and planned vs actual SOV. */}
            {focused ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Kpi
                  label={t("columns.period")}
                  value={period(focused)}
                  color="#1E293B"
                  small
                />
                <Kpi
                  label={t("metrics.sovPlanned")}
                  value={plannedSov(focused)}
                  color="#1E293B"
                  small
                />
                <Kpi
                  label={t("metrics.sovActual")}
                  value={formatActualSov(focused)}
                  color="#1E293B"
                  small
                />
              </div>
            ) : null}

            {/* Daily chart */}
            <section className="rounded-3xl border border-[#E2E8F0] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[16px] font-black text-[#1E293B]">
                  {t("chartTitle")}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {METRICS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={metric === m}
                      onClick={() => setMetric(m)}
                      className={`min-h-11 rounded-lg px-3 text-[11px] font-bold transition-colors ${
                        metric === m
                          ? "text-white"
                          : "bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9]"
                      }`}
                      style={
                        metric === m
                          ? { backgroundColor: METRIC_COLOR[m] }
                          : undefined
                      }
                    >
                      {t(`metrics.${m}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative mt-4 h-[220px] lg:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.daily}
                    margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="ad-analytics-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={METRIC_COLOR[metric]}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor={METRIC_COLOR[metric]}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#EEF1F4" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(value: string) =>
                        formatDateShort(`${value}T00:00:00`, locale)
                      }
                      tick={{ fontSize: 10, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={28}
                    />
                    <Tooltip
                      formatter={(value) => [
                        Number(value ?? 0).toLocaleString(locale),
                        t(`metrics.${metric}`),
                      ]}
                      labelFormatter={(value) =>
                        formatDateShort(`${value}T00:00:00`, locale)
                      }
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #EEF1F4",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={metric}
                      stroke={METRIC_COLOR[metric]}
                      strokeWidth={2}
                      fill="url(#ad-analytics-fill)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                {isEmpty ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-[#94A3B8] shadow-sm">
                      {t("empty")}
                    </span>
                  </div>
                ) : null}
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#94A3B8]">
                {data.tracked_since
                  ? t("trackedSince", { date: data.tracked_since })
                  : t("notTrackedYet")}
              </p>
            </section>

            {/* By placement — hidden for a single creative (one placement). */}
            {!creative ? (
              <section className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white">
                <h2 className="px-5 pt-5 text-[16px] font-black text-[#1E293B]">
                  {t("byPlacementTitle")}
                </h2>
                {data.by_placement.length === 0 ? (
                  <p className="px-5 py-8 text-sm font-medium text-[#94A3B8]">
                    {t("empty")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="mt-3 w-full min-w-[640px] text-left text-[13px]">
                      <thead className="bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                        <tr>
                          <th className="px-5 py-3">{tShared("placement")}</th>
                          <th className="px-3 py-3 text-right">
                            {t("columns.creatives")}
                          </th>
                          {METRICS.map((m) => (
                            <th key={m} className="px-3 py-3 text-right">
                              {t(`metrics.${m}`)}
                            </th>
                          ))}
                          <th className="px-3 py-3 text-right">
                            {t("metrics.reach")}
                          </th>
                          <th className="px-5 py-3 text-right">
                            {t("metrics.ctr")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_placement.map((row) => (
                          <tr
                            key={row.placement}
                            className="border-t border-[#F1F5F9]"
                          >
                            <td className="px-5 py-3 font-bold text-[#1E293B]">
                              {placementLabel(row.placement)}
                            </td>
                            <td className="px-3 py-3 text-right text-[#64748B]">
                              {formatNumber(row.creatives)}
                            </td>
                            {METRICS.map((m) => (
                              <td
                                key={m}
                                className="px-3 py-3 text-right font-semibold text-[#1E293B]"
                              >
                                {formatNumber(row[m])}
                              </td>
                            ))}
                            <td className="px-3 py-3 text-right font-semibold text-[#1E293B]">
                              {formatNumber(row.reach)}
                            </td>
                            <td className="px-5 py-3 text-right font-black text-[#1E293B]">
                              {formatCtr(row.clicks, row.impressions)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}

            {/* By creative */}
            <section className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
                <h2 className="text-[16px] font-black text-[#1E293B]">
                  {t("byCreativeTitle")}
                </h2>
                <label className="flex items-center gap-2 text-[12px] font-bold text-[#64748B]">
                  {t("sortBy")}
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className={selectCls}
                  >
                    <option value="impressions">
                      {t("metrics.impressions")}
                    </option>
                    <option value="reach">{t("metrics.reach")}</option>
                    <option value="clicks">{t("metrics.clicks")}</option>
                    <option value="ctr">{t("metrics.ctr")}</option>
                  </select>
                </label>
              </div>
              {creatives.length === 0 ? (
                <p className="px-5 py-8 text-sm font-medium text-[#94A3B8]">
                  {t("noCreatives")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="mt-3 w-full min-w-[1040px] text-left text-[13px]">
                    <thead className="bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                      <tr>
                        <th className="px-5 py-3">{t("columns.title")}</th>
                        <th className="px-3 py-3">{tShared("placement")}</th>
                        <th className="px-3 py-3">{t("columns.status")}</th>
                        {METRICS.map((m) => (
                          <th key={m} className="px-3 py-3 text-right">
                            {t(`metrics.${m}`)}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-right">
                          {t("metrics.reach")}
                        </th>
                        <th className="px-3 py-3 text-right">
                          {t("metrics.ctr")}
                        </th>
                        <th className="px-3 py-3 text-right">
                          {t("columns.sov")}
                        </th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {creatives.map((c) => (
                        <tr
                          key={`${c.source}:${c.id}`}
                          className="border-t border-[#F1F5F9] align-top"
                        >
                          <td className="max-w-[280px] px-5 py-3">
                            <span
                              className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.5px] ${
                                c.source === "ad"
                                  ? "bg-[#FFF7ED] text-[#C2410C]"
                                  : "bg-[#EFF6FF] text-[#1D4ED8]"
                              }`}
                            >
                              {t(`sources.${c.source}`)}
                            </span>
                            <span className="font-bold text-[#1E293B]">
                              {creativeName(c)}
                            </span>
                            {c.all_time_views !== null ? (
                              <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">
                                {t("allTime", {
                                  views: formatNumber(c.all_time_views),
                                  clicks: formatNumber(c.all_time_clicks ?? 0),
                                })}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-[#64748B]">
                            {placementLabel(c.placement)}
                            <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">
                              {period(c)}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className="inline-flex items-center gap-1.5 text-[12px] font-bold"
                              style={{ color: STATUS_COLOR[c.status] }}
                            >
                              <span
                                aria-hidden
                                className="h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor: STATUS_COLOR[c.status],
                                }}
                              />
                              {t(`status.${c.status}`)}
                            </span>
                          </td>
                          {METRICS.map((m) => (
                            <td
                              key={m}
                              className="px-3 py-3 text-right font-semibold text-[#1E293B]"
                            >
                              {formatNumber(c[m])}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right font-semibold text-[#1E293B]">
                            {formatNumber(c.reach)}
                          </td>
                          <td className="px-3 py-3 text-right font-black text-[#1E293B]">
                            {formatCtr(c.clicks, c.impressions)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[#1E293B]">
                            {plannedSov(c)}
                            <span className="text-[#94A3B8]"> / </span>
                            {formatActualSov(c)}
                          </td>
                          <td className="px-5 py-2 text-right">
                            {creative !== c.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSource(c.source);
                                  setCreative(c.id);
                                  window.scrollTo({
                                    top: 0,
                                    behavior: "smooth",
                                  });
                                }}
                                className="inline-flex min-h-11 items-center rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#2563EB] hover:border-[#2563EB]"
                              >
                                {t("report")}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
  small = false,
}: {
  label: string;
  value: string;
  color: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-4">
      <p className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-[#94A3B8]">
        {label}
      </p>
      <p
        className={`mt-1 font-black ${small ? "text-[16px] leading-6" : "text-[24px] leading-8"}`}
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}
