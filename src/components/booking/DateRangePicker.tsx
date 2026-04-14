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

  const buildDates = (year: number, month: number): CalendarDate[] => {
    const days = eachDayOfInterval({
      start: startOfMonth(new Date(year, month)),
      end: endOfMonth(new Date(year, month)),
    });
    return days.map((day) => {
      let status: DateStatus = "available";
      if (isBooked(day)) status = "booked";
      else if (isBlocked(day)) status = "blocked";
      return { date: day, status };
    });
  };

  const handleDateClick = (date: Date) => {
    if (isBlocked(date) || isBooked(date)) return;
    const { start, end } = selectedRange;
    if (!start || (start && end)) {
      onRangeChange({ start: date, end: null });
    } else {
      onRangeChange(
        isBefore(date, start)
          ? { start: date, end: start }
          : { start, end: date },
      );
    }
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-[#F8FAFC]"
        >
          <ChevronLeft className="size-4 text-[#94A3B8]" />
        </button>
        <div className="flex gap-8 text-[14px] font-bold capitalize text-[#1E293B]">
          <span>{format(currentMonth, "LLLL yyyy", { locale: ka })}</span>
          <span className="hidden md:inline">
            {format(nextMonth, "LLLL yyyy", { locale: ka })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-[#F8FAFC]"
        >
          <ChevronRight className="size-4 text-[#94A3B8]" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <CalendarGrid
          year={currentMonth.getFullYear()}
          month={currentMonth.getMonth()}
          dates={buildDates(
            currentMonth.getFullYear(),
            currentMonth.getMonth(),
          )}
          onDateClick={handleDateClick}
        />
        <div className="hidden md:block">
          <CalendarGrid
            year={nextMonth.getFullYear()}
            month={nextMonth.getMonth()}
            dates={buildDates(nextMonth.getFullYear(), nextMonth.getMonth())}
            onDateClick={handleDateClick}
          />
        </div>
      </div>
    </div>
  );
}
