"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Phone, Heart, RefreshCw } from "lucide-react";
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
import { formatDateShort } from "@/lib/utils/format";

type Metric = "views" | "reveals" | "favorites";

type AnalyticsResponse = {
  totals: { views: number; reveals: number; favorites: number };
  series: {
    date: string;
    views: number;
    reveals: number;
    favorites: number;
  }[];
};

const METRIC_COLOR: Record<Metric, string> = {
  views: "#2563EB",
  reveals: "#F97316",
  favorites: "#10B981",
};

const METRIC_ICON: Record<Metric, typeof Eye> = {
  views: Eye,
  reveals: Phone,
  favorites: Heart,
};

const METRICS: Metric[] = ["views", "reveals", "favorites"];
const PERIODS = [7, 30] as const;

/**
 * Expandable per-listing analytics panel, shared by the renter (rentals) and
 * seller (individually-owned sale listings) dashboards. Every number comes
 * from /api/listings/[kind]/[id]/analytics — no fabricated metrics.
 */
export default function ListingAnalyticsPanel({
  listingId,
  listingType,
}: {
  listingId: string;
  listingType: "property" | "service";
}) {
  const t = useTranslations("DashboardShared.analytics");
  const locale = useLocale();
  const gradientId = useId();

  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const [metric, setMetric] = useState<Metric>("views");
  const [entries, setEntries] = useState<Record<number, AnalyticsResponse>>({});
  const [loading, setLoading] = useState(false);
  const [errorDays, setErrorDays] = useState<number | null>(null);
  const fetchedRef = useRef<Set<number>>(new Set());

  const fetchDays = useCallback(
    async (targetDays: number) => {
      fetchedRef.current.add(targetDays);
      setLoading(true);
      setErrorDays(null);
      try {
        const res = await fetch(
          `/api/listings/${listingType}/${listingId}/analytics?days=${targetDays}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as AnalyticsResponse;
        setEntries((prev) => ({ ...prev, [targetDays]: data }));
      } catch {
        fetchedRef.current.delete(targetDays);
        setErrorDays(targetDays);
        toast.error(t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [listingId, listingType, t],
  );

  useEffect(() => {
    if (fetchedRef.current.has(days) || entries[days]) return;
    fetchDays(days);
  }, [days, entries, fetchDays]);

  const data = entries[days];
  const series = data?.series ?? [];
  const isEmpty =
    series.length > 0 && series.every((point) => point[metric] === 0);

  return (
    <div className="mt-3 rounded-2xl border border-[#EEF1F4] bg-[#F8FAFC] p-3 sm:mt-4 sm:p-4">
      <div className="grid grid-cols-3 gap-2">
        {METRICS.map((m) => {
          const TileIcon = METRIC_ICON[m];
          const active = metric === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => setMetric(m)}
              className={`flex min-h-11 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-current bg-white shadow-sm"
                  : "border-[#E2E8F0] bg-white/60 hover:border-[#CBD5E1]"
              }`}
              style={{ color: active ? METRIC_COLOR[m] : undefined }}
            >
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                <TileIcon className="h-3 w-3" />
                {t(m)}
              </span>
              <span
                className="text-[16px] font-black"
                style={{ color: active ? METRIC_COLOR[m] : "#0F172A" }}
              >
                {loading && !data
                  ? "—"
                  : (data?.totals[m] ?? 0).toLocaleString(locale)}
              </span>
            </button>
          );
        })}
      </div>
      {metric === "views" && (
        <p className="mt-2 text-[11px] text-[#94A3B8]">{t("viewsCaveat")}</p>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        {PERIODS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`min-h-11 rounded-lg px-3 text-[11px] font-bold transition-colors sm:min-h-0 sm:py-1.5 ${
              days === d
                ? "bg-[#0F172A] text-white"
                : "bg-white text-[#64748B] hover:bg-[#F1F5F9]"
            }`}
          >
            {t(d === 7 ? "period7" : "period30")}
          </button>
        ))}
      </div>

      <div className="relative mt-3 h-[140px] sm:h-[170px] lg:h-[200px]">
        {loading && !data ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : errorDays === days && !data ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#E2E8F0] bg-white">
            <p className="text-[12px] font-semibold text-[#94A3B8]">
              {t("loadError")}
            </p>
            <button
              type="button"
              onClick={() => fetchDays(days)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
            >
              <RefreshCw className="h-3 w-3" />
              {t("retry")}
            </button>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
                  dataKey="date"
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
                    t(metric),
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
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            {isEmpty && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-[#94A3B8] shadow-sm">
                  {t("noDataYet")}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
