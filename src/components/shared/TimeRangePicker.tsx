"use client";

import { useTranslations } from "next-intl";
import TimeField from "@/components/shared/TimeField";

type Accent = "blue" | "green" | "orange";

interface TimeRangePickerProps {
  /** "HH:MM - HH:MM" — the exact format persisted to schedule/operating_hours. */
  value: string;
  onChange: (value: string) => void;
  accent?: Accent;
  disabled?: boolean;
  error?: boolean;
}

/** Extract the first valid 24h "HH:MM" from a (possibly messy) string, else "". */
function extractTime(part: string): string {
  const m = (part || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Tolerant parse of "HH:MM - HH:MM" (also accepts "HH:MM-HH:MM", legacy junk). */
export function parseTimeRange(value: string): { start: string; end: string } {
  if (!value) return { start: "", end: "" };
  const idx = value.indexOf("-");
  if (idx === -1) return { start: extractTime(value), end: "" };
  return {
    start: extractTime(value.slice(0, idx)),
    end: extractTime(value.slice(idx + 1)),
  };
}

/** Both ends present and end strictly after start. */
export function isValidTimeRange(value: string): boolean {
  const { start, end } = parseTimeRange(value);
  if (!start || !end) return false;
  return end > start; // zero-padded "HH:MM" compares lexicographically
}

export default function TimeRangePicker({
  value,
  onChange,
  accent = "blue",
  disabled,
  error,
}: TimeRangePickerProps) {
  const t = useTranslations("Calendar");
  const { start, end } = parseTimeRange(value);

  const emit = (s: string, e: string) => onChange(`${s} - ${e}`);
  const rangeError = Boolean(start && end && end <= start);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TimeField
            value={start}
            onChange={(s) => emit(s, end)}
            accent={accent}
            disabled={disabled}
            error={error || rangeError}
            placeholder={t("from")}
          />
        </div>
        <span className="shrink-0 text-sm font-semibold text-[#94A3B8]">–</span>
        <div className="flex-1">
          <TimeField
            value={end}
            onChange={(e) => emit(start, e)}
            accent={accent}
            disabled={disabled}
            error={error || rangeError}
            placeholder={t("to")}
          />
        </div>
      </div>
      {rangeError && (
        <p className="mt-1.5 text-xs text-[#EF4444]">{t("endAfterStart")}</p>
      )}
    </div>
  );
}
