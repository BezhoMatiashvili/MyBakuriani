"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import BottomSheet from "@/components/shared/BottomSheet";
import { getDateFnsLocale } from "@/lib/utils/format";
import type { OccupiedMap } from "@/lib/utils/availability";
import { cn } from "@/lib/utils";

/**
 * Parse "YYYY-MM-DD" into a local-midnight Date. Never use
 * `new Date("YYYY-MM-DD")` — it parses as UTC midnight and renders the
 * previous day in Georgia (UTC+4) before 04:00.
 */
export function parseISODate(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** Format a Date as "YYYY-MM-DD" from local components (timezone-safe). */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Close the popover (not the host modal) on Escape. Host modals listen for
 * Escape on window in the bubble phase, so a capture-phase listener runs
 * first and stops the event from reaching them.
 */
export function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [open, onClose]);
}

interface DateFieldProps {
  value: string; // "YYYY-MM-DD" | ""
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  error?: boolean;
  /** Month + year dropdowns in the caption (e.g. birth dates, decades back). */
  withYearDropdown?: boolean;
  startYear?: number;
  endYear?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  /**
   * Nights that cannot be picked, mapped to why. Those days render colour-coded
   * (booked = red, owner-blocked = amber), become unselectable, and switch on a
   * legend under the grid. Omit it and the field behaves exactly as before.
   */
  occupied?: OccupiedMap;
}

export default function DateField({
  value,
  onChange,
  min,
  max,
  placeholder,
  clearable,
  error,
  withYearDropdown,
  startYear,
  endYear,
  disabled,
  id,
  className,
  occupied,
}: DateFieldProps) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEscapeToClose(open, () => setOpen(false));
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const selected = parseISODate(value);
  const minDate = min ? parseISODate(min) : undefined;
  const maxDate = max ? parseISODate(max) : undefined;
  const thisYear = new Date().getFullYear();
  const showClear = Boolean(clearable && value && !disabled);
  const hasOccupied = Boolean(occupied && occupied.size > 0);

  // An occupied night is unpickable, not merely discouraged — the manual-booking
  // RPCs reject it anyway, so letting it be selected only defers the error.
  const disabledMatchers = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
    ...(occupied ? [(d: Date) => occupied.has(toISODate(d))] : []),
  ];

  // Custom modifiers reach CalendarDayButton, which turns them into
  // data-booked / data-blocked attributes for styling.
  const modifiers = occupied
    ? {
        booked: (d: Date) => occupied.get(toISODate(d)) === "booked",
        blocked: (d: Date) => occupied.get(toISODate(d)) === "blocked",
      }
    : undefined;

  return (
    <div className="relative">
      {isPhone ? (
        <>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className={cn(
              "flex h-12 w-full items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-[16px] font-semibold text-[#0F172A] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none transition-colors hover:border-[#CBD5E1] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
              error && "border-[#EF4444]",
              showClear && "pr-10",
              className,
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-[#94A3B8]" />
            <span
              className={cn("flex-1 truncate", !selected && "text-[#94A3B8]")}
            >
              {selected
                ? format(selected, "d MMM, yyyy", {
                    locale: getDateFnsLocale(locale),
                  })
                : (placeholder ?? t("selectDate"))}
            </span>
          </button>
          <BottomSheet
            isOpen={open}
            onClose={() => setOpen(false)}
            title={placeholder ?? t("selectDate")}
          >
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected ?? minDate}
              locale={getDateFnsLocale(locale)}
              captionLayout={withYearDropdown ? "dropdown" : "label"}
              startMonth={
                withYearDropdown
                  ? new Date(startYear ?? thisYear - 100, 0)
                  : undefined
              }
              endMonth={
                withYearDropdown ? new Date(endYear ?? thisYear, 11) : undefined
              }
              disabled={disabledMatchers}
              modifiers={modifiers}
              className="w-full [--cell-size:36px] min-[360px]:[--cell-size:40px]"
              classNames={{
                day_button: "active:scale-90 transition-transform duration-100",
              }}
              onSelect={(d) => {
                if (!d) return;
                onChange(toISODate(d));
                closeTimer.current = setTimeout(() => setOpen(false), 120);
              }}
            />
            {hasOccupied && <OccupancyLegend t={t} />}
          </BottomSheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            id={id}
            disabled={disabled}
            className={cn(
              "flex h-12 w-full items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-[13px] font-semibold text-[#0F172A] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none transition-colors hover:border-[#CBD5E1] data-[popup-open]:border-[#2563EB] data-[popup-open]:ring-2 data-[popup-open]:ring-[#DBEAFE] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
              error && "border-[#EF4444]",
              showClear && "pr-10",
              className,
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-[#94A3B8]" />
            <span
              className={cn("flex-1 truncate", !selected && "text-[#94A3B8]")}
            >
              {selected
                ? format(selected, "d MMM, yyyy", {
                    locale: getDateFnsLocale(locale),
                  })
                : (placeholder ?? t("selectDate"))}
            </span>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-auto max-w-none p-2 md:w-auto"
          >
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected ?? minDate}
              locale={getDateFnsLocale(locale)}
              captionLayout={withYearDropdown ? "dropdown" : "label"}
              startMonth={
                withYearDropdown
                  ? new Date(startYear ?? thisYear - 100, 0)
                  : undefined
              }
              endMonth={
                withYearDropdown ? new Date(endYear ?? thisYear, 11) : undefined
              }
              disabled={disabledMatchers}
              modifiers={modifiers}
              classNames={{
                day_button: "active:scale-90 transition-transform duration-100",
              }}
              onSelect={(d) => {
                if (!d) return;
                onChange(toISODate(d));
                closeTimer.current = setTimeout(() => setOpen(false), 120);
              }}
            />
            {hasOccupied && <OccupancyLegend t={t} />}
          </PopoverContent>
        </Popover>
      )}
      {showClear && (
        <button
          type="button"
          aria-label={t("clear")}
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#64748B]"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Explains the colour coding, so a greyed-out day doesn't read as a bug. */
function OccupancyLegend({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#F1F5F9] px-1 pt-2">
      <LegendSwatch className="bg-[#FEE2E2]" label={t("legendBooked")} />
      <LegendSwatch className="bg-[#FEF3C7]" label={t("legendBlocked")} />
      <LegendSwatch
        className="ring-1 ring-inset ring-[#2563EB]"
        label={t("today")}
      />
    </div>
  );
}

function LegendSwatch({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748B]">
      <span className={cn("size-3 shrink-0 rounded-full", className)} />
      {label}
    </span>
  );
}
