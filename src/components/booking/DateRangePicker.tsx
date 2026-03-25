"use client";

import { useState } from "react";
import {
  addMonths,
  subMonths,
  isSameDay,
  isAfter,
  isBefore,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  format,
} from "date-fns";
import { ka } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CalendarGrid,
  type CalendarDate,
  type DateStatus,
} from "./CalendarGrid";

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface DateRangePickerProps {
  selectedRange: DateRange;
  onRangeChange: (range: DateRange) => void;
  blockedDates?: Date[];
  bookedDates?: Date[];
}

export function DateRangePicker({
  selectedRange,
  onRangeChange,
  blockedDates = [],
  bookedDates = [],
}: DateRangePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const nextMonth = addMonths(currentMonth, 1);

  const isBlocked = (date: Date) =>
    blockedDates.some((d) => isSameDay(d, date));

  const isBooked = (date: Date) => bookedDates.some((d) => isSameDay(d, date));

  const isSelected = (date: Date) => {
    const { start, end } = selectedRange;
    if (start && isSameDay(date, start)) return true;
    if (end && isSameDay(date, end)) return true;
    if (start && end && isAfter(date, start) && isBefore(date, end))
      return true;
    return false;
  };

  const buildDates = (year: number, month: number): CalendarDate[] => {
    const monthStart = startOfMonth(new Date(year, month));
    const monthEnd = endOfMonth(new Date(year, month));
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return days.map((day) => {
      let status: DateStatus = "available";
      if (isBlocked(day) || isBooked(day)) {
        status = isBooked(day) ? "booked" : "blocked";
      }
      return { date: day, status };
    });
  };

  const handleDateClick = (date: Date) => {
    if (isBlocked(date) || isBooked(date)) return;

    const { start, end } = selectedRange;

    if (!start || (start && end)) {
      // Start a new selection
      onRangeChange({ start: date, end: null });
    } else {
      // Complete the range
      if (isBefore(date, start)) {
        onRangeChange({ start: date, end: start });
      } else {
        onRangeChange({ start, end: date });
      }
    }
  };

  // Override statuses to show selected state
  const patchSelected = (dates: CalendarDate[]): CalendarDate[] =>
    dates.map((d) => {
      if (d.status !== "available") return d;
      if (isSelected(d.date)) {
        // We use a custom rendering approach via className override
        return d;
      }
      return d;
    });

  const currentDates = patchSelected(
    buildDates(currentMonth.getFullYear(), currentMonth.getMonth()),
  );
  const nextDates = patchSelected(
    buildDates(nextMonth.getFullYear(), nextMonth.getMonth()),
  );

  const currentLabel = format(currentMonth, "LLLL yyyy", { locale: ka });
  const nextLabel = format(nextMonth, "LLLL yyyy", { locale: ka });

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      {/* Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex gap-8 text-sm font-semibold capitalize text-foreground">
          <span>{currentLabel}</span>
          <span className="hidden md:inline">{nextLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Calendar grids */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <CalendarGrid
          year={currentMonth.getFullYear()}
          month={currentMonth.getMonth()}
          dates={currentDates}
          onDateClick={handleDateClick}
        />
        <div className="hidden md:block">
          <CalendarGrid
            year={nextMonth.getFullYear()}
            month={nextMonth.getMonth()}
            dates={nextDates}
            onDateClick={handleDateClick}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-green-100" />
          <span className="text-xs text-muted-foreground">თავისუფალი</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-red-100" />
          <span className="text-xs text-muted-foreground">დაკავებული</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-blue-500" />
          <span className="text-xs text-muted-foreground">არჩეული</span>
        </div>
      </div>
    </div>
  );
}
