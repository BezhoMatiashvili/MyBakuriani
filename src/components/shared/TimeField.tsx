"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useEscapeToClose } from "@/components/shared/DateField";
import BottomSheet from "@/components/shared/BottomSheet";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0"),
);

type Accent = "blue" | "green" | "orange";

const ACCENT: Record<
  Accent,
  { trigger: string; selectedBg: string; doneBg: string }
> = {
  blue: {
    trigger:
      "data-[popup-open]:border-[#2563EB] data-[popup-open]:ring-2 data-[popup-open]:ring-[#DBEAFE]",
    selectedBg: "bg-[#2563EB]",
    doneBg: "bg-[#2563EB] hover:bg-[#1D4ED8]",
  },
  green: {
    trigger:
      "data-[popup-open]:border-[#16A34A] data-[popup-open]:ring-2 data-[popup-open]:ring-[#DCFCE7]",
    selectedBg: "bg-[#16A34A]",
    doneBg: "bg-[#16A34A] hover:bg-[#15803D]",
  },
  orange: {
    trigger:
      "data-[popup-open]:border-[#F97316] data-[popup-open]:ring-2 data-[popup-open]:ring-[#FFEDD5]",
    selectedBg: "bg-[#F97316]",
    doneBg: "bg-[#F97316] hover:bg-[#EA580C]",
  },
};

interface TimeFieldProps {
  value: string; // "HH:MM" | ""
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  accent?: Accent;
  className?: string;
}

export default function TimeField({
  value,
  onChange,
  placeholder,
  error,
  disabled,
  accent = "blue",
  className,
}: TimeFieldProps) {
  const t = useTranslations("Calendar");
  const [open, setOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minuteColRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(open, () => setOpen(false));
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const [hour = "", minute = ""] = value ? value.split(":") : [];
  // Keep off-step prefilled minutes (e.g. "14:37") selectable/visible.
  const minuteOptions =
    minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES;

  // Center the selected (or current-time) rows when the popup opens. Manual
  // scrollTop math — scrollIntoView would also scroll the modal behind.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const now = new Date();
      const centerOn = (
        col: HTMLDivElement | null,
        options: string[],
        selected: string,
        fallback: string,
      ) => {
        if (!col) return;
        const index = options.indexOf(selected !== "" ? selected : fallback);
        if (index < 0) return;
        const row = col.children[index] as HTMLElement | undefined;
        if (!row) return;
        col.scrollTop =
          row.offsetTop - col.clientHeight / 2 + row.clientHeight / 2;
      };
      centerOn(
        hourColRef.current,
        HOURS,
        hour,
        String(now.getHours()).padStart(2, "0"),
      );
      centerOn(
        minuteColRef.current,
        minuteOptions,
        minute,
        String((Math.round(now.getMinutes() / 5) * 5) % 60).padStart(2, "0"),
      );
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (isPhone) {
    return (
      <>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={cn(
            "flex h-12 w-full items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-[16px] font-semibold text-[#0F172A] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none transition-colors hover:border-[#CBD5E1] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
            error && "border-[#EF4444]",
            className,
          )}
        >
          <Clock className="size-4 shrink-0 text-[#94A3B8]" />
          <span className={cn("flex-1 truncate", !value && "text-[#94A3B8]")}>
            {value || (placeholder ?? t("selectTime"))}
          </span>
        </button>
        <BottomSheet
          isOpen={open}
          onClose={() => setOpen(false)}
          title={placeholder ?? t("selectTime")}
        >
          <div className="flex gap-1">
            <TimeColumn
              label={t("hours")}
              colRef={hourColRef}
              options={HOURS}
              selected={hour}
              accent={accent}
              fluid
              onSelect={(hh) => onChange(`${hh}:${minute || "00"}`)}
            />
            <TimeColumn
              label={t("minutes")}
              colRef={minuteColRef}
              options={minuteOptions}
              selected={minute}
              accent={accent}
              fluid
              onSelect={(mm) => onChange(`${hour || "12"}:${mm}`)}
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn(
              "mt-3 h-11 w-full rounded-lg text-[13px] font-bold text-white transition-colors",
              ACCENT[accent].doneBg,
            )}
          >
            {t("done")}
          </button>
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-[13px] font-semibold text-[#0F172A] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none transition-colors hover:border-[#CBD5E1] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
          ACCENT[accent].trigger,
          error && "border-[#EF4444]",
          className,
        )}
      >
        <Clock className="size-4 shrink-0 text-[#94A3B8]" />
        <span className={cn("flex-1 truncate", !value && "text-[#94A3B8]")}>
          {value || (placeholder ?? t("selectTime"))}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-auto max-w-none p-2 md:w-auto"
      >
        <div className="flex gap-1">
          <TimeColumn
            label={t("hours")}
            colRef={hourColRef}
            options={HOURS}
            selected={hour}
            accent={accent}
            onSelect={(hh) => onChange(`${hh}:${minute || "00"}`)}
          />
          <TimeColumn
            label={t("minutes")}
            colRef={minuteColRef}
            options={minuteOptions}
            selected={minute}
            accent={accent}
            onSelect={(mm) => onChange(`${hour || "12"}:${mm}`)}
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={cn(
            "h-9 w-full rounded-lg text-[13px] font-bold text-white transition-colors",
            ACCENT[accent].doneBg,
          )}
        >
          {t("done")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
  label,
  colRef,
  options,
  selected,
  accent,
  fluid,
  onSelect,
}: {
  label: string;
  colRef: React.RefObject<HTMLDivElement | null>;
  options: string[];
  selected: string;
  accent: Accent;
  /** Fill the available width (mobile bottom sheet); desktop keeps w-16. */
  fluid?: boolean;
  onSelect: (option: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="text-center text-[11px] font-bold uppercase tracking-[0.275px] text-[#94A3B8] select-none">
        {label}
      </span>
      <div
        ref={colRef}
        className={cn(
          "max-h-[224px] w-16 overflow-y-auto overscroll-contain pr-0.5",
          fluid && "w-full",
        )}
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={cn(
              "flex h-11 w-full items-center justify-center rounded-lg text-[13px] font-semibold transition-colors",
              option === selected
                ? cn(ACCENT[accent].selectedBg, "text-white")
                : "text-[#1E293B] hover:bg-[#F1F5F9]",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
