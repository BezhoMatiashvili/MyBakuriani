"use client";

import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { startOfDay, addDays, subDays } from "date-fns";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDateRange, getDateFnsLocale } from "@/lib/utils/format";
import {
  lastWeek,
  last30Days,
  thisMonth,
  monthRange,
  type RangePreset,
  type StatsRange,
} from "@/lib/utils/dateRange";

export interface DateRangeFilterProps {
  range: StatsRange;
  preset: RangePreset;
  onChange: (range: StatsRange, preset: RangePreset) => void;
  className?: string;
}

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

function useRangeLabel(
  range: StatsRange,
  preset: RangePreset,
  locale: string,
): string {
  const t = useTranslations("DateRangeFilter");

  return useMemo(() => {
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
        return formatDateRange(range.from, subDays(range.to, 1), locale);
    }
  }, [range, preset, locale, t]);
}

export function DateRangeFilter({
  range,
  preset,
  onChange,
  className,
}: DateRangeFilterProps): React.ReactElement {
  const t = useTranslations("DateRangeFilter");
  const locale = useLocale();
  const dateFnsLocale = getDateFnsLocale(locale);
  const rangeLabel = useRangeLabel(range, preset, locale);

  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(range.from.getFullYear());
  // In-progress custom range: the first click only renders locally; the range
  // is applied (and the popover closed) once both ends are picked.
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const presets = useMemo(
    () =>
      [
        {
          preset: "last_week" as const,
          label: t("presets.lastWeek"),
          build: lastWeek,
        },
        {
          preset: "last_30" as const,
          label: t("presets.last30"),
          build: last30Days,
        },
        {
          preset: "this_month" as const,
          label: t("presets.thisMonth"),
          build: thisMonth,
        },
      ] as const,
    [t],
  );

  function apply(next: StatsRange, nextPreset: RangePreset) {
    onChange(next, nextPreset);
    setPendingRange(undefined);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setPendingRange(undefined);
      }}
    >
      <PopoverTrigger
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC] data-[popup-open]:bg-[#F8FAFC]",
          className,
        )}
      >
        <CalendarDays className="size-4 text-[#94A3B8]" aria-hidden />
        <span>{rangeLabel}</span>
        <ChevronDown
          className={cn(
            "size-3.5 text-[#94A3B8] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-[80dvh] w-[330px] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-0 md:w-[330px] lg:max-h-none"
      >
        <div className="flex flex-wrap gap-2 p-3">
          {presets.map((p) => (
            <button
              key={p.preset}
              type="button"
              onClick={() => apply(p.build(), p.preset)}
              className={cn(
                "min-h-11 rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-colors lg:min-h-0",
                preset === p.preset
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                  : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="border-t border-[#EEF1F4] p-3">
          <p className="text-[12px] font-extrabold text-[#0F172A]">
            {t("byMonth")}
          </p>
          <div className="mt-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label={t("prevYear")}
              className="inline-flex size-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] lg:size-7"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="text-[13px] font-bold text-[#0F172A]">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              aria-label={t("nextYear")}
              className="inline-flex size-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-40 lg:size-7"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 min-[360px]:grid-cols-3">
            {MONTH_KEYS.map((monthKey, i) => {
              const isFuture = year === currentYear && i > currentMonth;
              const isActive =
                preset === "month" &&
                range.from.getFullYear() === year &&
                range.from.getMonth() === i;
              return (
                <button
                  key={monthKey}
                  type="button"
                  disabled={isFuture}
                  onClick={() => apply(monthRange(year, i), "month")}
                  className={cn(
                    "min-h-11 rounded-lg px-2 py-1.5 text-[12px] font-bold transition-colors lg:min-h-0",
                    isActive
                      ? "bg-[#EFF6FF] text-[#2563EB]"
                      : "text-[#334155] hover:bg-[#F1F5F9]",
                    "disabled:cursor-not-allowed disabled:text-[#CBD5E1] disabled:hover:bg-transparent",
                  )}
                >
                  {t(`months.${monthKey}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-[#EEF1F4] p-3">
          <p className="text-[12px] font-extrabold text-[#0F172A]">
            {t("customPeriod")}
          </p>
          <div className="mt-1 flex justify-center">
            <Calendar
              mode="range"
              locale={dateFnsLocale}
              numberOfMonths={1}
              defaultMonth={range.from}
              selected={
                pendingRange ?? { from: range.from, to: subDays(range.to, 1) }
              }
              onSelect={(r) => {
                setPendingRange(r);
                if (r?.from && r?.to) {
                  apply(
                    {
                      from: startOfDay(r.from),
                      to: startOfDay(addDays(r.to, 1)),
                    },
                    "custom",
                  );
                }
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
