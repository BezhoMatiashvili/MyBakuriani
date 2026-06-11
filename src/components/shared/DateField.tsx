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
import { getDateFnsLocale } from "@/lib/utils/format";
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
}: DateFieldProps) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEscapeToClose(open, () => setOpen(false));
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const selected = parseISODate(value);
  const minDate = min ? parseISODate(min) : undefined;
  const maxDate = max ? parseISODate(max) : undefined;
  const thisYear = new Date().getFullYear();
  const showClear = Boolean(clearable && value && !disabled);

  return (
    <div className="relative">
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
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            classNames={{
              day_button: "active:scale-90 transition-transform duration-100",
            }}
            onSelect={(d) => {
              if (!d) return;
              onChange(toISODate(d));
              // Let the blue selection fill register before the zoom-out.
              closeTimer.current = setTimeout(() => setOpen(false), 120);
            }}
          />
        </PopoverContent>
      </Popover>
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
