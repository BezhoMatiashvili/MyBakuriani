"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import BulkActionBar from "@/components/calendar/BulkActionBar";
import {
  AvailabilityStatus,
  isoDate,
  monIndex,
  parseIsoDate,
} from "@/lib/utils/availability";

interface AvailabilityWizardStepProps {
  value: Map<string, AvailabilityStatus>;
  onChange: (next: Map<string, AvailabilityStatus>) => void;
  /** Dates that already have server-side bookings — render as red & disabled */
  bookedDates?: ReadonlySet<string>;
}

const DAY_NAMES = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];
const MONTH_NAMES = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
];

interface MonthCell {
  iso: string;
  day: number;
  inWindow: boolean;
}

function buildMonthGrid(year: number, month: number): (MonthCell | null)[] {
  const firstOfMonth = new Date(year, month, 1);
  const lead = monIndex(firstOfMonth); // blank cells before day 1
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (MonthCell | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ iso: isoDate(date), day: d, inWindow: false });
  }
  // Pad to a multiple of 7 so the grid stays rectangular
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function AvailabilityWizardStep({
  value,
  onChange,
  bookedDates,
}: AvailabilityWizardStepProps) {
  const windowDates = useMemo(() => Array.from(value.keys()).sort(), [value]);

  const windowSet = useMemo(() => new Set(windowDates), [windowDates]);

  const availableCount = useMemo(() => {
    let n = 0;
    for (const v of value.values()) if (v === "available") n++;
    return n;
  }, [value]);

  const blockedCount = windowDates.length - availableCount;
  const totalDays = windowDates.length;
  const availableFraction = totalDays === 0 ? 0 : availableCount / totalDays;

  // Render the month(s) that the window spans — usually 1-2 months
  const months = useMemo(() => {
    if (windowDates.length === 0)
      return [] as { year: number; month: number }[];
    const seen = new Set<string>();
    const out: { year: number; month: number }[] = [];
    for (const iso of windowDates) {
      const d = parseIsoDate(iso);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ year: d.getFullYear(), month: d.getMonth() });
      }
    }
    return out;
  }, [windowDates]);

  function toggle(iso: string) {
    if (!windowSet.has(iso)) return;
    if (bookedDates?.has(iso)) return;
    const next = new Map(value);
    next.set(iso, value.get(iso) === "blocked" ? "available" : "blocked");
    onChange(next);
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
        <p className="text-sm font-semibold text-[#0F172A]">
          მონიშნე როდის ხარ თავისუფალი მომდევნო 30 დღის განმავლობაში.
        </p>
        <p className="mt-1 text-[13px] text-[#475569]">
          ნაგულისხმევად ყველა დღე ხელმისაწვდომია. დააწექი დღეს რომ მონიშნო
          დაკავებულად, ან გამოიყენე სწრაფი მონიშვნის ღილაკები ქვემოთ.
        </p>
      </div>

      {/* Counter card */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-bold">
            <span className="inline-flex items-center gap-2 text-[#16A34A]">
              <span className="size-2.5 rounded-full bg-[#16A34A]" />
              {availableCount} ხელმისაწვდომი
            </span>
            <span className="inline-flex items-center gap-2 text-[#EF4444]">
              <span className="size-2.5 rounded-full bg-[#EF4444]" />
              {blockedCount} დაკავებული
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-[12px] font-bold text-[#15803D]">
            <Check className="size-3.5" />
            {totalDays} / 30 დღე დადასტურებულია
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
          <div
            className="h-full rounded-full bg-[#16A34A] transition-all"
            style={{ width: `${availableFraction * 100}%` }}
          />
        </div>
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        windowDates={windowDates}
        skipDates={bookedDates}
        onApply={({ available, blocked }) => {
          const next = new Map(value);
          for (const d of available) next.set(d, "available");
          for (const d of blocked) next.set(d, "blocked");
          onChange(next);
        }}
      />

      {/* Month grid(s) */}
      <div className="space-y-5">
        {months.map(({ year, month }) => {
          const cells = buildMonthGrid(year, month);
          return (
            <div
              key={`${year}-${month}`}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-4"
            >
              <div className="mb-3 text-center text-[15px] font-black text-[#0F172A]">
                {MONTH_NAMES[month]} {year}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[#64748B]">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
                {cells.map((cell, idx) => {
                  if (!cell) return <div key={idx} className="h-12 sm:h-14" />;
                  const inWindow = windowSet.has(cell.iso);
                  const status = value.get(cell.iso);
                  const isBooked = bookedDates?.has(cell.iso) ?? false;
                  return (
                    <DayCell
                      key={cell.iso}
                      day={cell.day}
                      inWindow={inWindow}
                      status={status}
                      isBooked={isBooked}
                      onClick={() => toggle(cell.iso)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Helper text */}
      <p className="text-center text-xs text-[#64748B]">
        შეგიძლიათ მოგვიანებით განაახლოთ კალენდარი თქვენი დაშბორდიდან.
      </p>
    </div>
  );
}

function DayCell({
  day,
  inWindow,
  status,
  isBooked,
  onClick,
}: {
  day: number;
  inWindow: boolean;
  status: AvailabilityStatus | undefined;
  isBooked: boolean;
  onClick: () => void;
}) {
  if (!inWindow) {
    return (
      <div className="flex h-12 items-center justify-center rounded-xl bg-[#F8FAFC] text-[13px] font-medium text-[#CBD5E1] sm:h-14">
        {day}
      </div>
    );
  }

  if (isBooked) {
    return (
      <div className="flex h-12 cursor-not-allowed flex-col items-center justify-center rounded-xl border border-[#FEE2E2] bg-[#FEE2E2] text-[#991B1B] sm:h-14">
        <span className="text-[13px] font-bold">{day}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide">
          დაჯავშნა
        </span>
      </div>
    );
  }

  const isBlocked = status === "blocked";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 flex-col items-center justify-center rounded-xl border text-[13px] font-bold transition-colors active:scale-95 sm:h-14 ${
        isBlocked
          ? "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B] hover:border-[#EF4444]"
          : "border-[#BBF7D0] bg-[#DCFCE7] text-[#15803D] hover:border-[#16A34A]"
      }`}
      aria-label={`${day} — ${isBlocked ? "დაკავებული, დააწექი რომ გახსნა" : "ხელმისაწვდომი, დააწექი რომ დაკავო"}`}
    >
      <span>{day}</span>
      {isBlocked ? (
        <X className="size-3" strokeWidth={3} />
      ) : (
        <Check className="size-3" strokeWidth={3} />
      )}
    </button>
  );
}
