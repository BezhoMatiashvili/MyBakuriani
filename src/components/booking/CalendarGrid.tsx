"use client";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/utils/format";

export type DateStatus = "available" | "booked" | "blocked";
export interface CalendarDate {
  date: Date;
  status: DateStatus;
}

const DAY_KEYS = [
  "day1",
  "day2",
  "day3",
  "day4",
  "day5",
  "day6",
  "day7",
] as const;
const DAY_SHORT_KEYS = [
  "day1Short",
  "day2Short",
  "day3Short",
  "day4Short",
  "day5Short",
  "day6Short",
  "day7Short",
] as const;
const statusClasses: Record<DateStatus, string> = {
  available:
    "bg-green-50 text-[#1E293B] hover:bg-green-200 cursor-pointer transition-colors",
  booked: "bg-red-50 text-red-500 cursor-not-allowed",
  blocked: "bg-gray-100 text-[#94A3B8] cursor-not-allowed",
};

export function CalendarGrid({
  year,
  month,
  dates,
  onDateClick,
}: {
  year: number;
  month: number;
  dates: CalendarDate[];
  onDateClick: (date: Date) => void;
}) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const monthDate = new Date(year, month);
  const allDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }),
  });
  const getStatus = (day: Date): DateStatus | null =>
    dates.find((d) => isSameDay(d.date, day))?.status ?? null;
  return (
    <div>
      <h3 className="mb-3 text-center text-[14px] font-bold capitalize text-[#1E293B]">
        {format(monthDate, "LLLL yyyy", { locale: getDateFnsLocale(locale) })}
      </h3>
      <div className="grid grid-cols-7 gap-1">
        {DAY_KEYS.map((d, i) => (
          <div
            key={d}
            className="py-1 text-center text-[11px] font-bold uppercase text-[#94A3B8]"
          >
            <span className="md:hidden">{t(DAY_SHORT_KEYS[i])}</span>
            <span className="hidden md:inline">{t(d)}</span>
          </div>
        ))}
        {allDays.map((day) => {
          const inMonth = isSameMonth(day, monthDate);
          const status = inMonth ? getStatus(day) : null;
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={status !== "available"}
              onClick={() => status === "available" && onDateClick(day)}
              className={cn(
                "flex h-9 items-center justify-center rounded-full text-[13px]",
                !inMonth && "invisible",
                status && statusClasses[status],
                !status && inMonth && "text-[#1E293B] hover:bg-[#F1F5F9]",
              )}
            >
              {inMonth ? day.getDate() : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
