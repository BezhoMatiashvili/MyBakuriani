"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { hasDimensionFilter, type AnalyticsQuery } from "@/lib/analytics/model";
import {
  ctrValue,
  percentValue,
  type AdsData,
  type ListingTotals,
  type ListingsData,
  type SmartMatchData,
} from "@/lib/analytics/report";
import { formatNumber } from "@/lib/utils/format";
import {
  BlockCard,
  MetricTile,
  Notes,
  TileSkeletons,
  formatValue,
  useAnalyticsLabels,
  type BlockState,
  type ValueFormat,
} from "./BlockCard";

function previousOf<T>(
  query: AnalyticsQuery,
  previous: T | null | undefined,
  pick: (x: T) => number | null,
): number | null | undefined {
  if (!query.compare) return undefined;
  return previous ? pick(previous) : null;
}

const LISTING_TILES: {
  key: string;
  pick: (x: ListingTotals) => number;
  /** A count of right now: the previous period has none. */
  now?: boolean;
}[] = [
  { key: "active", pick: (x) => x.active, now: true },
  { key: "new", pick: (x) => x.new },
  { key: "views", pick: (x) => x.views },
  { key: "saves", pick: (x) => x.saves },
  { key: "calls", pick: (x) => x.calls },
  { key: "messages", pick: (x) => x.messages },
  { key: "smartMatch", pick: (x) => x.smart_match_requests },
];

/** Spec §5: listing activity, in total and per category. */
export function ListingsBlock({
  state,
  query,
  trackedSince,
}: {
  state: BlockState<ListingsData>;
  query: AnalyticsQuery;
  trackedSince: string | null;
}) {
  const t = useTranslations("AdminAnalytics");
  const data = state.data?.current ?? null;
  const previous = state.data?.previous?.totals ?? null;
  return (
    <BlockCard
      id="analytics-listings"
      block="listings"
      title={t("blocks.listings")}
      subtitle={
        data?.filtered && trackedSince
          ? t("filters.trackedOnly", { date: trackedSince })
          : undefined
      }
      query={query}
      loading={state.loading}
      error={state.error}
      onRetry={state.reload}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {!data ? (
          <TileSkeletons count={LISTING_TILES.length} />
        ) : (
          LISTING_TILES.map((tile) => (
            <MetricTile
              key={tile.key}
              testId={`analytics-listings-${tile.key}`}
              label={
                tile.now
                  ? `${t(`listings.${tile.key}`)} (${t("listings.now")})`
                  : t(`listings.${tile.key}`)
              }
              value={tile.pick(data.totals)}
              previous={
                tile.now ? undefined : previousOf(query, previous, tile.pick)
              }
            />
          ))
        )}
      </div>
      {data && data.totals.unsplit_contacts > 0 ? (
        <p className="mt-3 text-[12px] font-semibold text-[#475569]">
          {t("listings.unsplit")}: {formatNumber(data.totals.unsplit_contacts)}
        </p>
      ) : null}

      {data ? (
        <div className="-mx-1 mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <caption className="px-1 pb-2 text-left text-[13px] font-black text-[#1E293B]">
              {t("listings.byKind")}
            </caption>
            <thead>
              <tr className="text-[11px] font-bold text-[#94A3B8]">
                <th className="px-1 pb-2 font-bold">{t("listings.kind")}</th>
                {[
                  "active",
                  "new",
                  "views",
                  "saves",
                  "calls",
                  "messages",
                  "unsplit",
                ].map((key) => (
                  <th key={key} className="px-1 pb-2 text-right font-bold">
                    {t(`listings.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_kind.map((row) => (
                <tr
                  key={row.kind}
                  data-testid={`analytics-kind-${row.kind}`}
                  className="border-t border-[#F1F5F9]"
                >
                  <td className="px-1 py-2 font-bold text-[#1E293B]">
                    {t(`kinds.${row.kind}`)}
                  </td>
                  {[
                    row.active,
                    row.new,
                    row.views,
                    row.saves,
                    row.calls,
                    row.messages,
                    row.unsplit_contacts,
                  ].map((value, i) => (
                    <td
                      key={i}
                      className="px-1 py-2 text-right font-semibold text-[#334155]"
                    >
                      {formatNumber(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Skeleton className="mt-4 h-40 rounded-2xl" />
      )}
      <Notes
        lines={[
          data?.filtered ? t("listings.filteredNote") : null,
          t("listings.inventoryNote"),
          t("listings.unsplitNote"),
        ]}
      />
    </BlockCard>
  );
}

const SMART_MATCH_TILES: {
  key: string;
  pick: (x: SmartMatchData) => number | null;
  format?: ValueFormat;
}[] = [
  { key: "requests", pick: (x) => x.requests },
  { key: "requestsWithOffer", pick: (x) => x.requests_with_offer },
  {
    key: "matchRate",
    pick: (x) => percentValue(x.match_rate),
    format: "percent",
  },
  { key: "matching", pick: (x) => x.matching_listings },
  { key: "responses", pick: (x) => x.responses },
  { key: "leads", pick: (x) => x.leads },
];

/** Spec §6: Smart Match requests, matches, answers and leads. */
export function SmartMatchBlock({
  state,
  query,
  trackedSince,
}: {
  state: BlockState<SmartMatchData>;
  query: AnalyticsQuery;
  trackedSince: string | null;
}) {
  const t = useTranslations("AdminAnalytics");
  const data = state.data?.current ?? null;
  const previous = state.data?.previous ?? null;
  return (
    <BlockCard
      id="analytics-smartmatch"
      block="smartmatch"
      title={t("blocks.smartmatch")}
      subtitle={
        data?.filtered && trackedSince
          ? t("filters.trackedOnly", { date: trackedSince })
          : undefined
      }
      query={query}
      loading={state.loading}
      error={state.error}
      onRetry={state.reload}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {!data ? (
          <TileSkeletons count={SMART_MATCH_TILES.length} />
        ) : (
          SMART_MATCH_TILES.map((tile) => (
            <MetricTile
              key={tile.key}
              testId={`analytics-smartmatch-${tile.key}`}
              label={t(`smartmatch.${tile.key}`)}
              value={tile.pick(data)}
              previous={previousOf(query, previous, tile.pick)}
              format={tile.format}
            />
          ))
        )}
      </div>
      <Notes
        lines={[
          data?.filtered ? t("smartmatch.filteredNote") : null,
          t("smartmatch.definitions"),
        ]}
      />
    </BlockCard>
  );
}

/** Spec §7: advertising, in total and per placement (period only). */
export function AdsBlock({
  state,
  query,
}: {
  state: BlockState<AdsData>;
  query: AnalyticsQuery;
}) {
  const t = useTranslations("AdminAnalytics");
  const labels = useAnalyticsLabels();
  const data = state.data?.current ?? null;
  const previous = state.data?.previous ?? null;
  const tiles: {
    key: string;
    pick: (x: AdsData) => number | null;
    format?: ValueFormat;
    now?: boolean;
  }[] = [
    { key: "impressions", pick: (x) => x.totals.impressions },
    { key: "reach", pick: (x) => x.totals.reach },
    { key: "clicks", pick: (x) => x.totals.clicks },
    {
      key: "ctr",
      pick: (x) => ctrValue(x.totals.clicks, x.totals.impressions),
      format: "percent",
    },
    { key: "activeAds", pick: (x) => x.active_ads, now: true },
    { key: "advertisers", pick: (x) => x.active_advertisers, now: true },
    { key: "revenue", pick: (x) => x.revenue, format: "money" },
  ];
  return (
    <BlockCard
      id="analytics-ads"
      block="ads"
      title={t("blocks.ads")}
      subtitle={
        hasDimensionFilter(query.dims) ? t("ads.filtersNote") : undefined
      }
      query={query}
      loading={state.loading}
      error={state.error}
      onRetry={state.reload}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {!data ? (
          <TileSkeletons count={tiles.length} />
        ) : (
          tiles.map((tile) => (
            <MetricTile
              key={tile.key}
              testId={`analytics-ads-${tile.key}`}
              label={t(`ads.${tile.key}`)}
              value={tile.pick(data)}
              previous={
                tile.now ? undefined : previousOf(query, previous, tile.pick)
              }
              format={tile.format}
              hint={
                tile.key === "advertisers" && data.ads_without_advertiser > 0
                  ? t("ads.missingAdvertiser", {
                      count: data.ads_without_advertiser,
                    })
                  : undefined
              }
            />
          ))
        )}
      </div>

      {data ? (
        data.by_placement.length === 0 ? (
          <p className="mt-4 text-[13px] font-medium text-[#94A3B8]">
            {t("ads.noPlacements")}
          </p>
        ) : (
          <div className="-mx-1 mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <caption className="px-1 pb-2 text-left text-[13px] font-black text-[#1E293B]">
                {t("ads.byPlacement")}
              </caption>
              <thead>
                <tr className="text-[11px] font-bold text-[#94A3B8]">
                  <th className="px-1 pb-2 font-bold">{t("ads.placement")}</th>
                  {["impressions", "reach", "clicks", "ctr", "creatives"].map(
                    (key) => (
                      <th key={key} className="px-1 pb-2 text-right font-bold">
                        {t(`ads.${key}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.by_placement.map((row) => (
                  <tr
                    key={row.placement}
                    data-testid={`analytics-placement-${row.placement}`}
                    className="border-t border-[#F1F5F9]"
                  >
                    <td className="px-1 py-2 font-bold text-[#1E293B]">
                      {labels.placement(row.placement)}
                    </td>
                    <td className="px-1 py-2 text-right font-semibold text-[#334155]">
                      {formatNumber(row.impressions)}
                    </td>
                    <td className="px-1 py-2 text-right font-semibold text-[#334155]">
                      {formatNumber(row.reach)}
                    </td>
                    <td className="px-1 py-2 text-right font-semibold text-[#334155]">
                      {formatNumber(row.clicks)}
                    </td>
                    <td className="px-1 py-2 text-right font-semibold text-[#334155]">
                      {formatValue(
                        ctrValue(row.clicks, row.impressions),
                        "percent",
                      )}
                    </td>
                    <td className="px-1 py-2 text-right font-semibold text-[#334155]">
                      {formatNumber(row.creatives)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Skeleton className="mt-4 h-32 rounded-2xl" />
      )}
      <div className="mt-3">
        <Link
          href="/dashboard/admin/ad-analytics"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-1 text-[13px] font-bold text-[#2563EB] hover:underline"
        >
          {t("ads.details")}
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <Notes lines={[t("ads.reachNote"), t("ads.nowNote")]} />
    </BlockCard>
  );
}
