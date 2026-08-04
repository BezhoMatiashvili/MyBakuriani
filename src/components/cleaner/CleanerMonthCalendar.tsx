"use client";

import { useMemo } from "react";
import { CalendarClock, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  toLocalDateKey,
  type CleanerTaskItem,
} from "@/lib/cleaner/tasks";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface DayCell {
  date: Date;
  dateKey: string;
  day: number;
  inMonth: boolean;
  weekdayIndex: number;
}

interface DayTaskCounts {
  active: number;
  completed: number;
}

interface CleanerMonthCalendarProps {
  tasks: CleanerTaskItem[];
  selectedDate: Date;
  visibleMonth: Date;
  onSelectDate: (date: Date) => void;
  onVisibleMonthChange: (month: Date) => void;
}

function buildMonthCells(year: number, month: number): DayCell[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const mondayOffset = firstWeekday === 0 ? 6 : firstWeekday - 1;

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - mondayOffset + 1);
    return {
      date,
      dateKey: toLocalDateKey(date),
      day: date.getDate(),
      inMonth: date.getFullYear() === year && date.getMonth() === month,
      weekdayIndex: index % 7,
    };
  });
}

export default function CleanerMonthCalendar({
  tasks,
  selectedDate,
  visibleMonth,
  onSelectDate,
  onVisibleMonthChange,
}: CleanerMonthCalendarProps) {
  const t = useTranslations("CleanerSchedule");
  const locale = useLocale();
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const todayKey = toLocalDateKey(new Date());
  const selectedKey = toLocalDateKey(selectedDate);

  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
  const countsByDate = useMemo(() => {
    const counts = new Map<string, DayTaskCounts>();
    for (const task of tasks) {
      const dateKey = toLocalDateKey(task.scheduledAt);
      const current = counts.get(dateKey) ?? { active: 0, completed: 0 };
      if (task.status === "completed") current.completed += 1;
      else if (task.status === "accepted" || task.status === "in_progress") {
        current.active += 1;
      }
      counts.set(dateKey, current);
    }
    return counts;
  }, [tasks]);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);
  const fullDateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function selectMonth(offset: number) {
    const nextMonth = new Date(year, month + offset, 1);
    onVisibleMonthChange(nextMonth);
    onSelectDate(nextMonth);
  }

  function selectToday() {
    const today = new Date();
    onVisibleMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));
    onSelectDate(today);
  }

  return (
    <section
      data-testid="cleaner-month-calendar"
      className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div className="flex flex-col gap-3 border-b border-[#EEF1F4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-[17px] font-black capitalize text-[#0F172A]">
            {monthLabel}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[#64748B]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-[#2563EB]" />
              {t("activeLegend")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]" />
              {t("completedLegend")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={selectToday}
            data-testid="cleaner-calendar-today"
            className="min-h-11 rounded-xl border border-[#E2E8F0] px-3 text-[12px] font-bold text-[#2563EB] transition-colors hover:bg-[#EFF6FF]"
          >
            {t("goToday")}
          </button>
          <div className="flex items-center rounded-xl border border-[#E2E8F0] bg-white p-1">
            <button
              type="button"
              onClick={() => selectMonth(-1)}
              data-testid="cleaner-calendar-prev-month"
              aria-label={t("prevMonth")}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => selectMonth(1)}
              data-testid="cleaner-calendar-next-month"
              aria-label={t("nextMonth")}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[#EEF1F4] bg-[#F8FAFC]">
        {DAY_KEYS.map((key, index) => (
          <div
            key={key}
            className={cn(
              "py-2.5 text-center text-[10px] font-black uppercase tracking-[0.08em] text-[#94A3B8] sm:text-[11px]",
              index >= 5 && "text-[#EF4444]",
            )}
          >
            {t(`daysShort.${key}`)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const counts = countsByDate.get(cell.dateKey) ?? {
            active: 0,
            completed: 0,
          };
          const selected = cell.inMonth && cell.dateKey === selectedKey;
          const today = cell.inMonth && cell.dateKey === todayKey;
          const active = counts.active > 0;
          const completed = counts.completed > 0;

          return (
            <button
              key={cell.dateKey}
              type="button"
              disabled={!cell.inMonth}
              onClick={() => onSelectDate(cell.date)}
              aria-label={fullDateFormatter.format(cell.date)}
              data-testid={`cleaner-calendar-day-${cell.dateKey}`}
              data-selected={selected ? "true" : undefined}
              data-active-count={counts.active}
              data-completed-count={counts.completed}
              className={cn(
                "relative flex min-h-[56px] min-w-0 flex-col border-b border-r border-[#EEF1F4] p-1.5 text-left transition-colors sm:min-h-[82px] sm:p-2.5 lg:min-h-[96px]",
                cell.weekdayIndex === 6 && "border-r-0",
                !cell.inMonth && "cursor-default bg-[#FAFBFC] text-[#CBD5E1]",
                cell.inMonth && "bg-white hover:bg-[#F8FAFC]",
                active && cell.inMonth && "bg-[#EFF6FF] hover:bg-[#DBEAFE]",
                !active && completed && cell.inMonth && "bg-[#F0FDF4] hover:bg-[#DCFCE7]",
                selected && "z-10 ring-2 ring-inset ring-[#2563EB]",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 min-w-6 self-start items-center justify-center rounded-full px-1 text-[12px] font-black sm:text-[13px]",
                  !cell.inMonth && "text-[#CBD5E1]",
                  cell.inMonth && !today && "text-[#0F172A]",
                  today && "bg-[#2563EB] text-white",
                )}
              >
                {cell.day}
              </span>

              {cell.inMonth && (active || completed) && (
                <span className="mt-auto flex w-full min-w-0 items-end justify-between gap-1 pt-1">
                  {active ? (
                    <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-[#2563EB] px-1.5 py-1 text-[9px] font-black leading-none text-white sm:text-[10px]">
                      <CalendarClock className="hidden h-3 w-3 shrink-0 sm:block" />
                      <span className="sm:hidden">{counts.active}</span>
                      <span className="hidden truncate sm:inline">
                        {t("taskCount", { count: counts.active })}
                      </span>
                    </span>
                  ) : (
                    <span />
                  )}
                  {completed && (
                    <span
                      aria-label={t("completedCount", {
                        count: counts.completed,
                      })}
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#16A34A] px-1 py-0.5 text-[9px] font-black text-white sm:px-1.5"
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      {counts.completed}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
