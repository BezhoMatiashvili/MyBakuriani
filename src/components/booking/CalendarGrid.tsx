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
import { ka } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type DateStatus = "available" | "booked" | "blocked";

export interface CalendarDate {
  date: Date;
  status: DateStatus;
}

interface CalendarGridProps {
  year: number;
  month: number;
  dates: CalendarDate[];
  onDateClick: (date: Date) => void;
}

const DAY_HEADERS = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];

const statusClasses: Record<DateStatus, string> = {
  available:
    "bg-green-50 text-foreground hover:bg-green-200 cursor-pointer transition-colors",
  booked: "bg-red-50 text-red-500 cursor-not-allowed",
  blocked: "bg-gray-100 text-muted-foreground cursor-not-allowed",
};

export function CalendarGrid({
  year,
  month,
  dates,
  onDateClick,
}: CalendarGridProps) {
  const monthDate = new Date(year, month);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getStatus = (day: Date): DateStatus | null => {
    const found = dates.find((d) => isSameDay(d.date, day));
    return found?.status ?? null;
  };

  const monthLabel = format(monthDate, "LLLL yyyy", { locale: ka });

  return (
    <div>
      <h3 className="mb-3 text-center text-sm font-semibold capitalize text-foreground">
        {monthLabel}
      </h3>
      <div className="grid grid-cols-7 gap-1">
        {/* Day headers */}
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}

        {/* Day cells */}
        {allDays.map((day) => {
          const inMonth = isSameMonth(day, monthDate);
          const status = inMonth ? getStatus(day) : null;
          const isClickable = status === "available";

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onDateClick(day)}
              className={cn(
                "flex h-9 items-center justify-center rounded-md text-sm",
                !inMonth && "invisible",
                status && statusClasses[status],
                !status && inMonth && "text-foreground",
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
