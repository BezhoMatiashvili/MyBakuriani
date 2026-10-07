"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cityDisplayName } from "@/lib/analytics/cities";
import type { AnalyticsQuery, ExportBlock } from "@/lib/analytics/model";
import {
  changePercent,
  type BlockPayload,
  type ReportLabels,
} from "@/lib/analytics/report";
import { formatNumber, formatPrice } from "@/lib/utils/format";
import ExportMenu from "./ExportMenu";

/** One block's fetch: the last answer stays on screen while the next loads. */
export type BlockState<T> = {
  data: BlockPayload<T> | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
};

/** Country names from the server (cities.ts:countryNames). */
export const CountryNamesContext = createContext<
  Readonly<Record<string, string>>
>({});

/** The same labels the export uses, in the dashboard's language. */
export function useAnalyticsLabels(): ReportLabels {
  const t = useTranslations("AdminAnalytics");
  const tShared = useTranslations("AdminShared");
  const locale = useLocale();
  const countryNames = useContext(CountryNamesContext);
  return useMemo(() => {
    let regions: Intl.DisplayNames | null = null;
    try {
      regions = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      regions = null;
    }
    return {
      t: (key, values) => t(key as never, values as never),
      placement: (id) =>
        tShared.has(`placements.${id}` as never)
          ? tShared(`placements.${id}` as never)
          : id,
      country: (code) => {
        if (Object.prototype.hasOwnProperty.call(countryNames, code)) {
          return countryNames[code];
        }
        try {
          return regions?.of(code) ?? code;
        } catch {
          return code;
        }
      },
      city: (name) => cityDisplayName(name, locale),
    };
  }, [t, tShared, locale, countryNames]);
}

export type ValueFormat = "number" | "percent" | "money";

export function formatValue(
  value: number | null | undefined,
  format: ValueFormat = "number",
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "money") return formatPrice(value);
  return formatNumber(value);
}

/** Change against the previous period; renders nothing while not comparing. */
export function Delta({
  current,
  previous,
}: {
  current: number | null;
  /** undefined = compare is off. */
  previous: number | null | undefined;
}) {
  const t = useTranslations("AdminAnalytics");
  if (previous === undefined) return null;
  const change = changePercent(current, previous);
  if (change === null) {
    return (
      <span className="text-[11px] font-bold text-[#94A3B8]">
        — {t("kpis.vsPrevious")}
      </span>
    );
  }
  const tone =
    change > 0
      ? "text-[#059669]"
      : change < 0
        ? "text-[#DC2626]"
        : "text-[#64748B]";
  return (
    <span className={`text-[11px] font-bold ${tone}`}>
      {change > 0 ? "+" : ""}
      {change.toFixed(1)}% {t("kpis.vsPrevious")}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  previous,
  hint,
  format = "number",
  testId,
}: {
  label: string;
  value: number | null;
  previous?: number | null;
  hint?: string;
  format?: ValueFormat;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-value={value ?? ""}
      className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[#EEF1F4] bg-[#F8FAFC] px-4 py-3"
    >
      <p className="text-[12px] font-semibold leading-4 text-[#64748B]">
        {label}
      </p>
      <p className="text-[26px] font-black leading-8 text-[#0F172A] sm:text-[30px]">
        {formatValue(value, format)}
      </p>
      <Delta current={value} previous={previous} />
      {hint ? (
        <p className="text-[11px] font-medium leading-4 text-[#94A3B8]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TileSkeletons({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[104px] rounded-2xl" />
      ))}
    </>
  );
}

export function Notes({ lines }: { lines: (string | null | false)[] }) {
  const shown = lines.filter((l): l is string => Boolean(l));
  if (shown.length === 0) return null;
  return (
    <div className="mt-3 space-y-1">
      {shown.map((line) => (
        <p
          key={line}
          className="text-[11px] font-medium leading-[17px] text-[#94A3B8]"
        >
          {line}
        </p>
      ))}
    </div>
  );
}

/** One dashboard block: title, its own Export menu, loading and error states. */
export function BlockCard({
  id,
  block,
  title,
  subtitle,
  query,
  loading,
  error,
  onRetry,
  children,
}: {
  id: string;
  block: ExportBlock;
  title: string;
  subtitle?: ReactNode;
  query: AnalyticsQuery;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("AdminAnalytics");
  return (
    <section
      aria-labelledby={id}
      aria-busy={loading}
      data-testid={`analytics-block-${block}`}
      className="min-w-0 rounded-3xl border border-[#E2E8F0] bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={id} className="text-[16px] font-black text-[#1E293B]">
            {title}
          </h3>
          {subtitle ? (
            <div className="mt-1 text-[12px] font-medium leading-[18px] text-[#64748B]">
              {subtitle}
            </div>
          ) : null}
        </div>
        <ExportMenu block={block} query={query} />
      </div>
      <div className={`mt-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#E2E8F0] py-10">
            <p className="text-sm font-semibold text-[#94A3B8]">
              {t("loadFailed")}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F8FAFC] px-4 text-[13px] font-bold text-[#2563EB] hover:bg-[#EFF6FF]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("retry")}
            </button>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
