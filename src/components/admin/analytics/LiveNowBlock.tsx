"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsQuery } from "@/lib/analytics/model";
import type { LiveData } from "@/lib/analytics/report";
import { formatNumber } from "@/lib/utils/format";
import {
  BlockCard,
  Notes,
  useAnalyticsLabels,
  type BlockState,
} from "./BlockCard";

/** HH:MM:SS in Tbilisi (UTC+4) for a stored timestamp. */
function tbilisiClock(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms)
    ? new Date(ms + 4 * 60 * 60 * 1000).toISOString().slice(11, 19)
    : "";
}

/** Spec §9: who is on the site right now, and on which pages. */
export function LiveNowBlock({
  state,
  query,
}: {
  state: BlockState<LiveData>;
  query: AnalyticsQuery;
}) {
  const t = useTranslations("AdminAnalytics");
  const labels = useAnalyticsLabels();
  const data = state.data?.current ?? null;
  const maxPage = Math.max(1, ...(data?.pages ?? []).map((p) => p.visitors));
  const place = (country: string | null, city: string | null) =>
    [country ? labels.country(country) : null, city ? labels.city(city) : null]
      .filter(Boolean)
      .join(", ") || t("notRecorded");

  return (
    <BlockCard
      id="analytics-live"
      block="live"
      title={t("blocks.live")}
      subtitle={
        data ? t("live.updated", { time: tbilisiClock(data.at) }) : undefined
      }
      query={query}
      loading={state.loading && !data}
      error={state.error && !data}
      onRetry={state.reload}
    >
      {!data ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[#10B981]" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold leading-4 text-[#64748B]">
                {t("live.visitors")}
              </p>
              <p
                data-testid="analytics-live-visitors"
                className="text-[40px] font-black leading-[48px] text-[#0F172A]"
              >
                {formatNumber(data.visitors)}
              </p>
            </div>
          </div>

          {data.visitors === 0 ? (
            <p className="mt-3 text-[13px] font-medium text-[#94A3B8]">
              {t("live.none")}
            </p>
          ) : (
            <>
              <h4 className="mt-4 text-[13px] font-black text-[#1E293B]">
                {t("live.pages")}
              </h4>
              <ul className="mt-2 space-y-2">
                {data.pages.slice(0, 10).map((page) => (
                  <li
                    key={page.path}
                    data-testid="analytics-live-page"
                    className="min-w-0"
                  >
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate font-semibold text-[#1E293B]">
                        {page.path}
                        <span className="ml-2 text-[11px] font-medium text-[#94A3B8]">
                          {t(`pageTypes.${page.page_type}`)}
                        </span>
                      </span>
                      <span className="shrink-0 font-black text-[#0F172A]">
                        {formatNumber(page.visitors)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F1F5F9]">
                      <div
                        className="h-full rounded-full bg-[#10B981]"
                        style={{
                          width: `${(page.visitors / maxPage) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="-mx-1 mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[12px]">
                  <caption className="px-1 pb-2 text-left text-[13px] font-black text-[#1E293B]">
                    {t("live.visitorsList")}
                  </caption>
                  <thead>
                    <tr className="text-[11px] font-bold text-[#94A3B8]">
                      <th className="px-1 pb-2 font-bold">{t("live.page")}</th>
                      <th className="px-1 pb-2 font-bold">
                        {t("filters.device")}
                      </th>
                      <th className="px-1 pb-2 font-bold">
                        {t("filters.country")}
                      </th>
                      <th className="px-1 pb-2 font-bold">
                        {t("filters.source")}
                      </th>
                      <th className="px-1 pb-2 text-right font-bold">
                        {t("live.lastSeen")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-t border-[#F1F5F9]">
                        <td className="max-w-[200px] truncate px-1 py-1.5 font-semibold text-[#1E293B]">
                          {row.path}
                        </td>
                        <td className="px-1 py-1.5 text-[#334155]">
                          {row.device
                            ? t(`devices.${row.device}`)
                            : t("notRecorded")}
                        </td>
                        <td className="px-1 py-1.5 text-[#334155]">
                          {place(row.country, row.city)}
                        </td>
                        <td className="px-1 py-1.5 text-[#334155]">
                          {row.source
                            ? t(`sources.${row.source}`)
                            : t("notRecorded")}
                        </td>
                        <td className="px-1 py-1.5 text-right text-[#334155]">
                          {tbilisiClock(row.seen_at).slice(0, 5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Notes lines={[t("live.window", { minutes: data.window_minutes })]} />
        </>
      )}
    </BlockCard>
  );
}
