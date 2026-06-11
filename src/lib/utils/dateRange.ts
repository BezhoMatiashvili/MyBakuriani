import { startOfDay, startOfMonth, addDays, subDays } from "date-fns";

export type RangePreset =
  | "last_week"
  | "last_30"
  | "this_month"
  | "month"
  | "custom";

/** `to` is the EXCLUSIVE upper bound (start of the day AFTER the last included day). */
export interface StatsRange {
  from: Date;
  to: Date;
}

export function lastWeek(now: Date = new Date()): StatsRange {
  return { from: startOfDay(subDays(now, 6)), to: startOfDay(addDays(now, 1)) };
}

export function last30Days(now: Date = new Date()): StatsRange {
  return {
    from: startOfDay(subDays(now, 29)),
    to: startOfDay(addDays(now, 1)),
  };
}

export function thisMonth(now: Date = new Date()): StatsRange {
  return { from: startOfMonth(now), to: startOfDay(addDays(now, 1)) };
}

export function monthRange(year: number, monthIdx: number): StatsRange {
  return {
    from: new Date(year, monthIdx, 1),
    to: new Date(year, monthIdx + 1, 1),
  };
}
