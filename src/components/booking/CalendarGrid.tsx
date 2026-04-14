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

const DAY_HEADERS = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];
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
        {format(monthDate, "LLLL yyyy", { locale: ka })}
      </h3>
      <div className="grid grid-cols-7 gap-1">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-[11px] font-bold uppercase text-[#94A3B8]"
          >
            {d}
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
