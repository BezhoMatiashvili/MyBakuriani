"use client";
import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isAfter,
  isBefore,
  addMonths,
  subMonths,
  format,
} from "date-fns";
import { ka } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarDate } from "./CalendarGrid";

const DAY_HEADERS = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];

interface Props {
  dates: CalendarDate[];
  selectedRange: { start: Date | null; end: Date | null };
  onDateClick: (date: Date) => void;
  initialMonth?: Date;
}

export function AvailabilityCalendar({
  dates,
  selectedRange,
  onDateClick,
  initialMonth,
}: Props) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState<Date>(
    initialMonth ?? startOfMonth(today),
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const getStatus = (day: Date) =>
    dates.find((d) => isSameDay(d.date, day))?.status ?? null;

  const lastAvailableMonth =
    dates.length > 0
      ? startOfMonth(
          dates.reduce(
            (max, d) => (d.date > max ? d.date : max),
            dates[0].date,
          ),
        )
      : null;

  const canGoPrev = isAfter(monthStart, startOfMonth(today));
  const canGoNext = lastAvailableMonth
    ? isBefore(monthStart, lastAvailableMonth)
    : true;

  const { start, end } = selectedRange;

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[15px] font-bold capitalize text-[#1E293B]">
          {format(currentMonth, "LLLL yyyy", { locale: ka })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="flex size-8 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="flex size-8 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]"
          >
            {d}
          </div>
        ))}
        {allDays.map((day, idx) => {
          const inMonth = isSameMonth(day, currentMonth);
          const status = inMonth ? getStatus(day) : null;
          const unavailable =
            !inMonth || status === "booked" || status === "blocked";

          const isStart = !!start && isSameDay(day, start);
          const isEnd = !!end && isSameDay(day, end);
          const inRange =
            !!start && !!end && isAfter(day, start) && isBefore(day, end);

          const hasRangeFill =
            (isStart && !!end) || (isEnd && !!start) || inRange;

          const col = idx % 7;
          const isRowStart = col === 0;
          const isRowEnd = col === 6;

          const roundedLeft =
            (isStart && !!end) ||
            (inRange && isRowStart) ||
            (isEnd && isRowStart);
          const roundedRight =
            (isEnd && !!start) ||
            (inRange && isRowEnd) ||
            (isStart && isRowEnd);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "relative flex h-12 items-center justify-center",
                hasRangeFill && "bg-[#EFF6FF]",
                roundedLeft && "rounded-l-full",
                roundedRight && "rounded-r-full",
              )}
            >
              <button
                type="button"
                disabled={unavailable}
                onClick={() => !unavailable && onDateClick(day)}
                className={cn(
                  "relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-bold transition-colors",
                  !inMonth && "invisible",
                  inMonth &&
                    !unavailable &&
                    !isStart &&
                    !isEnd &&
                    !inRange &&
                    "text-[#1E293B] hover:bg-[#F1F5F9]",
                  inMonth &&
                    (status === "booked" || status === "blocked") &&
                    "text-[#CBD5E1] cursor-not-allowed",
                  inRange && "text-[#2563EB]",
                  (isStart || isEnd) &&
                    "bg-[#2563EB] text-white hover:bg-[#2563EB]",
                )}
              >
                {inMonth ? day.getDate() : ""}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-6 border-t border-[#E2E8F0] pt-4 text-[12px] font-medium">
        <span className="flex items-center gap-2 text-[#1E293B]">
          <span className="size-2 rounded-full bg-[#1E293B]" />
          თავისუფალი
        </span>
        <span className="flex items-center gap-2 text-[#94A3B8]">
          <span className="size-2 rounded-full bg-[#E2E8F0]" />
          დაკავებული
        </span>
        <span className="flex items-center gap-2 text-[#1E293B]">
          <span className="size-2 rounded-full bg-[#2563EB]" />
          არჩეული
        </span>
      </div>
    </div>
  );
}
