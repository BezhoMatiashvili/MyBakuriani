"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  analyticsQueryToParams,
  parseAnalyticsQuery,
  withoutDimensions,
  type AnalyticsQuery,
  type DataBlock,
} from "@/lib/analytics/model";
import {
  activeFilters,
  tbilisiStamp,
  type AdsData,
  type BlockPayload,
  type ListingsData,
  type LiveData,
  type SmartMatchData,
  type TrafficData,
} from "@/lib/analytics/report";
import AnalyticsToolbar from "./AnalyticsToolbar";
import { AdsBlock, ListingsBlock, SmartMatchBlock } from "./ActivityBlocks";
import { LiveNowBlock } from "./LiveNowBlock";
import { ChartBlock, KpiBlock, SourcesBlock } from "./TrafficBlocks";
import { CountryNamesContext, type BlockState } from "./BlockCard";

/** Live Now refreshes this often while the tab is visible. */
const LIVE_REFRESH_MS = 15_000;

function useAnalyticsBlock<T>(
  block: DataBlock,
  params: string,
  refreshMs?: number,
): BlockState<T> {
  const [data, setData] = useState<BlockPayload<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch(`/api/admin/analytics?block=${block}${params ? `&${params}` : ""}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as BlockPayload<T>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [block, params, tick]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, error, reload };
}

/**
 * The admin analytics dashboard (owner spec "Admin Dashboard", C49). The
 * period and filters live in the URL, so a view can be shared and the page,
 * the data route and every export read it with the same parser.
 */
export default function AnalyticsDashboard({
  countryNames,
}: {
  /** cities.ts:countryNames for the page's language, built on the server. */
  countryNames: Readonly<Record<string, string>>;
}) {
  const t = useTranslations("AdminAnalytics");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => parseAnalyticsQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // history.replaceState updates useSearchParams without a server round trip
  // (router.replace re-rendered the page and its business stats on every
  // click, and a controlled checkbox snapped back until that finished).
  const setQuery = useCallback(
    (next: AnalyticsQuery) => {
      const params = analyticsQueryToParams(next).toString();
      window.history.replaceState(null, "", `${pathname}?${params}`);
    },
    [pathname],
  );

  const params = analyticsQueryToParams(query).toString();
  // Ads follow the period only, Live Now the filters only: neither refetches
  // for what does not apply to it.
  const adsParams = analyticsQueryToParams(withoutDimensions(query)).toString();
  const liveParams = new URLSearchParams(
    activeFilters(query.dims).map((f) => [f.key, f.value]),
  ).toString();

  const traffic = useAnalyticsBlock<TrafficData>("traffic", params);
  const listings = useAnalyticsBlock<ListingsData>("listings", params);
  const smartmatch = useAnalyticsBlock<SmartMatchData>("smartmatch", params);
  const ads = useAnalyticsBlock<AdsData>("ads", adsParams);
  const live = useAnalyticsBlock<LiveData>("live", liveParams, LIVE_REFRESH_MS);

  const dimensionsSince = traffic.data?.current.dimensions_since
    ? tbilisiStamp(traffic.data.current.dimensions_since).slice(0, 10)
    : null;

  return (
    <CountryNamesContext.Provider value={countryNames}>
      <section
        aria-labelledby="admin-analytics-title"
        data-testid="admin-analytics"
        className="space-y-5"
      >
        <div>
          <h2
            id="admin-analytics-title"
            className="text-[24px] font-black leading-8 tracking-[-0.4px] text-[#0F172A]"
          >
            {t("title")}
          </h2>
          <p className="mt-1 text-[14px] font-medium leading-[21px] text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>

        <AnalyticsToolbar
          // Remount on an outside URL change so the custom-range draft follows.
          key={`${query.period}:${query.range.from}:${query.range.to}`}
          query={query}
          onChange={setQuery}
          options={traffic.data?.current.options ?? null}
          dimensionsSince={dimensionsSince}
        />

        <KpiBlock state={traffic} query={query} />
        <ChartBlock
          state={traffic}
          query={query}
          onGranularity={(granularity) => setQuery({ ...query, granularity })}
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SourcesBlock
            state={traffic}
            query={query}
            onSource={(source) =>
              setQuery({ ...query, dims: { ...query.dims, source } })
            }
          />
          <LiveNowBlock state={live} query={query} />
        </div>
        <ListingsBlock
          state={listings}
          query={query}
          trackedSince={dimensionsSince}
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SmartMatchBlock
            state={smartmatch}
            query={query}
            trackedSince={dimensionsSince}
          />
          <AdsBlock state={ads} query={query} />
        </div>

        <footer className="space-y-1 text-[11px] font-medium leading-[17px] text-[#94A3B8]">
          <p>{t("privacyNote")}</p>
          <p>
            <a
              href="https://db-ip.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#64748B] underline-offset-2 hover:underline"
            >
              {t("geoAttribution")}
            </a>
          </p>
        </footer>
      </section>
    </CountryNamesContext.Provider>
  );
}
