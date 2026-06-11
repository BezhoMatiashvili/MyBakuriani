"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { subDays } from "date-fns";

import {
  last30Days,
  type RangePreset,
  type StatsRange,
} from "@/lib/utils/dateRange";
import { formatDateRange } from "@/lib/utils/format";

const MONTH_KEYS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

export interface StatsFilterState {
  range: StatsRange;
  preset: RangePreset;
  label: string;
  listingIds: string[]; // [] === all listings
  setRange: (range: StatsRange, preset: RangePreset) => void;
  setListingIds: (ids: string[]) => void;
}

export function useStatsFilter(): StatsFilterState {
  const t = useTranslations("DateRangeFilter");
  const locale = useLocale();
  const [{ range, preset }, setRangeState] = useState<{
    range: StatsRange;
    preset: RangePreset;
  }>(() => ({ range: last30Days(), preset: "last_30" }));
  const [listingIds, setListingIds] = useState<string[]>([]);

  const setRange = useCallback((next: StatsRange, nextPreset: RangePreset) => {
    setRangeState({ range: next, preset: nextPreset });
  }, []);

  const label = useMemo(() => {
    switch (preset) {
      case "last_week":
        return t("presets.lastWeek");
      case "last_30":
        return t("presets.last30");
      case "this_month":
        return t("presets.thisMonth");
      case "month":
        return `${t(`months.${MONTH_KEYS[range.from.getMonth()]}`)} ${range.from.getFullYear()}`;
      case "custom":
        // `to` is exclusive, so display the last INCLUDED day.
        return formatDateRange(range.from, subDays(range.to, 1), locale);
    }
  }, [range, preset, t, locale]);

  return { range, preset, label, listingIds, setRange, setListingIds };
}
