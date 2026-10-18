"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GRANULARITIES,
  LEAD_EVENTS,
  TRAFFIC_SOURCES,
  type AnalyticsQuery,
  type Granularity,
  type TrafficSource,
} from "@/lib/analytics/model";
import {
  percentValue,
  type SourceRow,
  type TrafficData,
  type TrafficKpis,
  type TrafficPoint,
} from "@/lib/analytics/report";
import {
  formatDateShort,
  formatNumber,
  getDateFnsLocale,
} from "@/lib/utils/format";
import {
  BlockCard,
  Delta,
  MetricTile,
  Notes,
  TileSkeletons,
  formatValue,
  type BlockState,
  type ValueFormat,
} from "./BlockCard";

const KPIS: {
  key: string;
  pick: (k: TrafficKpis) => number | null;
  format?: ValueFormat;
}[] = [
  { key: "uniqueUsers", pick: (k) => k.unique_users },
  { key: "activeUsers", pick: (k) => k.active_users },
  { key: "newUsers", pick: (k) => k.new_users },
  { key: "returningUsers", pick: (k) => k.returning_users },
  { key: "sessions", pick: (k) => k.sessions },
  { key: "pageviews", pick: (k) => k.pageviews },
  {
    key: "engagementRate",
    pick: (k) => percentValue(k.engagement_rate),
    format: "percent",
  },
  { key: "keyActions", pick: (k) => k.key_actions },
];

/** Spec §2: the eight KPI cards. */
export function KpiBlock({
  state,
  query,
}: {
  state: BlockState<TrafficData>;
  query: AnalyticsQuery;
}) {
  const t = useTranslations("AdminAnalytics");
  const current = state.data?.current.kpis;
  const previous = state.data?.previous?.kpis ?? null;
  return (
    <BlockCard
      id="analytics-kpis"
      block="kpis"
      title={t("blocks.kpis")}
      query={query}
      loading={state.loading}
      error={state.error}
      onRetry={state.reload}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!current ? (
          <TileSkeletons count={KPIS.length} />
        ) : (
          KPIS.map((kpi) => (
            <MetricTile
              key={kpi.key}
              testId={`analytics-kpi-${kpi.key}`}
              label={t(`kpis.${kpi.key}`)}
              value={kpi.pick(current)}
              previous={
                query.compare
                  ? previous
                    ? kpi.pick(previous)
                    : null
                  : undefined
              }
              hint={t(`kpis.hint.${kpi.key}`)}
              format={kpi.format}
            />
          ))
        )}
      </div>
      {current ? (
        <p className="mt-3 text-[12px] font-semibold text-[#475569]">
          {t("kpis.keyActions")}:{" "}
          {LEAD_EVENTS.map(
            (name) =>
              `${t(`keyActionNames.${name}`)} ${formatNumber(
                current.key_actions_by_name[name] ?? 0,
              )}`,
          ).join(" · ")}
        </p>
      ) : null}
      <Notes lines={[t("kpis.definitions"), t("kpis.keyActionsNote")]} />
    </BlockCard>
  );
}

const SERIES: {
  key: keyof Omit<TrafficPoint, "bucket">;
  label: string;
  color: string;
}[] = [
  { key: "unique_users", label: "kpis.uniqueUsers", color: "#2563EB" },
  { key: "active_users", label: "kpis.activeUsers", color: "#7C3AED" },
  { key: "sessions", label: "kpis.sessions", color: "#0EA5E9" },
  { key: "pageviews", label: "kpis.pageviews", color: "#F59E0B" },
  { key: "new_users", label: "kpis.newUsers", color: "#10B981" },
  { key: "returning_users", label: "kpis.returningUsers", color: "#EF4444" },
];

function bucketText(bucket: string, granularity: Granularity, locale: string) {
  const date = `${bucket.slice(0, 10)}T00:00:00`;
  return granularity === "month"
    ? format(new Date(date), "LLL yyyy", { locale: getDateFnsLocale(locale) })
    : formatDateShort(date, locale);
}

/** Spec §3: the main chart, six series, day / week / month. */
export function ChartBlock({
  state,
  query,
  onGranularity,
}: {
  state: BlockState<TrafficData>;
  query: AnalyticsQuery;
  onGranularity: (granularity: Granularity) => void;
}) {
  const t = useTranslations("AdminAnalytics");
  const locale = useLocale();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const current = state.data?.current ?? null;
  const previous = state.data?.previous ?? null;
  const granularity = current?.granularity ?? query.granularity;

  const rows = (current?.series ?? []).map((point, i) => {
    const prior = previous?.series[i];
    const row: Record<string, string | number | null> = {
      bucket: point.bucket,
    };
    for (const s of SERIES) {
      row[s.key] = point[s.key];
      row[`prev_${s.key}`] = prior ? prior[s.key] : null;
    }
    return row;
  });
  const empty =
    current !== null &&
    current.series.every((p) => p.pageviews === 0 && p.sessions === 0);
  const visible = SERIES.filter((s) => !hidden.has(s.key));

  return (
    <BlockCard
      id="analytics-chart"
      block="chart"
      title={t("blocks.chart")}
      subtitle={
        query.compare && state.data?.previousRange
          ? t("period.compareRange", state.data.previousRange)
          : undefined
      }
      query={query}
      loading={state.loading}
      error={state.error}
      onRetry={state.reload}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t("chart.series")}
        >
          {SERIES.map((s) => {
            const on = !hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.key)) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  })
                }
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[12px] font-bold transition-colors ${
                  on
                    ? "bg-[#F1F5F9] text-[#0F172A]"
                    : "bg-white text-[#94A3B8] ring-1 ring-[#E2E8F0]"
                }`}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: on ? s.color : "#CBD5E1" }}
                />
                {t(s.label)}
              </button>
            );
          })}
        </div>
        <div
          className="flex items-center gap-1 rounded-xl bg-[#F8FAFC] p-1"
          role="group"
          aria-label={t("granularity.label")}
        >
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={granularity === g}
              data-testid={`analytics-granularity-${g}`}
              onClick={() => onGranularity(g)}
              className={`min-h-11 rounded-lg px-3 text-[12px] font-bold transition-colors ${
                granularity === g
                  ? "bg-[#0F172A] text-white"
                  : "text-[#64748B] hover:bg-[#F1F5F9]"
              }`}
            >
              {t(`granularity.${g}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-4 h-[260px] lg:h-[320px]">
        {!current ? (
          <Skeleton className="h-full w-full rounded-2xl" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#EEF1F4" vertical={false} />
              <XAxis
                dataKey="bucket"
                tickFormatter={(value: string) =>
                  bucketText(value, granularity, locale)
                }
                tick={{ fontSize: 10, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                width={36}
                tick={{ fontSize: 10, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatNumber(Number(value ?? 0)),
                  String(name),
                ]}
                labelFormatter={(value) =>
                  bucketText(String(value), granularity, locale)
                }
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #EEF1F4",
                  fontSize: 12,
                }}
              />
              {visible.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={t(s.label)}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
              {query.compare && previous
                ? visible.map((s) => (
                    <Line
                      key={`prev_${s.key}`}
                      type="monotone"
                      dataKey={`prev_${s.key}`}
                      name={`${t(s.label)} (${t("chart.previous")})`}
                      stroke={s.color}
                      strokeOpacity={0.5}
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))
                : null}
            </LineChart>
          </ResponsiveContainer>
        )}
        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-[#94A3B8] shadow-sm">
              {t("chart.empty")}
            </span>
          </div>
        ) : null}
      </div>
      <Notes lines={[t("chart.note")]} />
    </BlockCard>
  );
}

/** Spec §4: Google / Facebook / Instagram / Direct / Referral. */
export function SourcesBlock({
  state,
  query,
  onSource,
}: {
  state: BlockState<TrafficData>;
  query: AnalyticsQuery;
  onSource: (source: TrafficSource | null) => void;
}) {
  const t = useTranslations("AdminAnalytics");
  const current = state.data?.current ?? null;
  const previous = state.data?.previous ?? null;

  const byKey = (list: SourceRow[] | undefined) =>
    new Map((list ?? []).map((row) => [row.source, row]));
  const now = byKey(current?.sources);
  const before = byKey(previous?.sources);
  const zero = (source: SourceRow["source"]): SourceRow => ({
    source,
    users: 0,
    sessions: 0,
    engaged_sessions: 0,
    engagement_rate: null,
  });
  // All five of the owner's buckets, then sessions recorded before sources.
  const rows: SourceRow[] = [
    ...TRAFFIC_SOURCES.map((s) => now.get(s) ?? zero(s)),
    ...(now.has("unknown") ? [now.get("unknown") as SourceRow] : []),
  ];
  const maxUsers = Math.max(1, ...rows.map((r) => r.users));

  return (
    <BlockCard
      id="analytics-sources"
      block="sources"
      title={t("blocks.sources")}
      query={query}
      loading={state.loading}
      error={state.error}
      onRetry={state.reload}
    >
      {!current ? (
        <div className="space-y-2">
          {TRAFFIC_SOURCES.map((s) => (
            <Skeleton key={s} className="h-11 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left">
            <thead>
              <tr className="text-[11px] font-bold text-[#94A3B8]">
                <th className="px-1 pb-2 font-bold">{t("sources.column")}</th>
                <th className="px-1 pb-2 font-bold">{t("sources.users")}</th>
                <th className="px-1 pb-2 text-right font-bold">
                  {t("kpis.sessions")}
                </th>
                <th className="px-1 pb-2 text-right font-bold">
                  {t("sources.engagement")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selectable = row.source !== "unknown";
                const active = query.dims.source === row.source;
                const prior = before.get(row.source);
                return (
                  <tr
                    key={row.source}
                    data-testid={`analytics-source-${row.source}`}
                    data-users={row.users}
                    className="border-t border-[#F1F5F9] text-[13px]"
                  >
                    <td className="px-1 py-1.5">
                      {selectable ? (
                        <button
                          type="button"
                          aria-pressed={active}
                          aria-label={t("sources.filterBy", {
                            source: t(`sources.${row.source}`),
                          })}
                          onClick={() =>
                            onSource(
                              active ? null : (row.source as TrafficSource),
                            )
                          }
                          className={`min-h-11 rounded-lg px-2 text-left font-bold transition-colors ${
                            active
                              ? "bg-[#0F172A] text-white"
                              : "text-[#1E293B] hover:bg-[#F1F5F9]"
                          }`}
                        >
                          {t(`sources.${row.source}`)}
                        </button>
                      ) : (
                        <span className="px-2 font-bold text-[#94A3B8]">
                          {t(`sources.${row.source}`)}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-[#F1F5F9] sm:w-24">
                          <div
                            className="h-full rounded-full bg-[#2563EB]"
                            style={{
                              width: `${(row.users / maxUsers) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="font-black text-[#0F172A]">
                          {formatNumber(row.users)}
                        </span>
                      </div>
                      <Delta
                        current={row.users}
                        previous={
                          query.compare ? (prior?.users ?? 0) : undefined
                        }
                      />
                    </td>
                    <td className="px-1 py-1.5 text-right font-semibold text-[#334155]">
                      {formatNumber(row.sessions)}
                    </td>
                    <td className="px-1 py-1.5 text-right font-semibold text-[#334155]">
                      {formatValue(
                        percentValue(row.engagement_rate),
                        "percent",
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Notes lines={[t("sources.note")]} />
    </BlockCard>
  );
}
