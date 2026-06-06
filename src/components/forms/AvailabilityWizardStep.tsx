"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, X, RotateCcw, Lock, Unlock } from "lucide-react";
import BulkActionBar from "@/components/calendar/BulkActionBar";
import {
  AvailabilityStatus,
  datesInRange,
  isoDate,
  monIndex,
  parseIsoDate,
} from "@/lib/utils/availability";

interface AvailabilityWizardStepProps {
  value: Map<string, AvailabilityStatus>;
  onChange: (next: Map<string, AvailabilityStatus>) => void;
  /** Per-day absolute price overrides (date → price). Absent = use basePrice. */
  priceOverrides: Map<string, number>;
  onPriceOverridesChange: (next: Map<string, number>) => void;
  /** Default nightly price shown on every day with no override. */
  basePrice: number;
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
  priceOverrides,
  onPriceOverridesChange,
  basePrice,
  bookedDates,
}: AvailabilityWizardStepProps) {
  const windowDates = useMemo(() => Array.from(value.keys()).sort(), [value]);

  const windowSet = useMemo(() => new Set(windowDates), [windowDates]);

  const isBooked = useCallback(
    (iso: string) => bookedDates?.has(iso) ?? false,
    [bookedDates],
  );

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

  // ── Multi-day selection (mirrors dashboard/renter/calendar) ────────────
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [dragHover, setDragHover] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMoved, setDragMoved] = useState(false);
  const suppressClickRef = useRef(false);
  const [priceInput, setPriceInput] = useState("");

  const clearSelection = useCallback(() => {
    setSelectedSet(new Set());
    setDragAnchor(null);
    setDragHover(null);
    setIsDragging(false);
    setDragMoved(false);
    suppressClickRef.current = false;
    setPriceInput("");
  }, []);

  // Live preview of the in-flight drag range, restricted to selectable cells.
  const dragRange = useMemo<string[]>(() => {
    if (!isDragging || !dragAnchor) return [];
    return datesInRange(dragAnchor, dragHover ?? dragAnchor);
  }, [isDragging, dragAnchor, dragHover]);

  // What renders as "selected": committed set ∪ drag preview.
  const displaySet = useMemo(() => {
    if (dragRange.length === 0) return selectedSet;
    const merged = new Set(selectedSet);
    for (const d of dragRange) {
      if (windowSet.has(d) && !isBooked(d)) merged.add(d);
    }
    return merged;
  }, [selectedSet, dragRange, windowSet, isBooked]);

  // Selected free days (pricing + block act on these) vs. selected blocked days.
  const selectedAvailable = useMemo(
    () =>
      Array.from(displaySet).filter(
        (d) => windowSet.has(d) && !isBooked(d) && value.get(d) !== "blocked",
      ),
    [displaySet, windowSet, value, isBooked],
  );
  const selectedBlocked = useMemo(
    () =>
      Array.from(displaySet).filter(
        (d) => windowSet.has(d) && !isBooked(d) && value.get(d) === "blocked",
      ),
    [displaySet, windowSet, value, isBooked],
  );
  const hasActionable = selectedAvailable.length + selectedBlocked.length > 0;

  const avgSelectedPrice = useMemo(() => {
    if (selectedAvailable.length === 0) return basePrice;
    const sum = selectedAvailable.reduce(
      (acc, d) => acc + (priceOverrides.get(d) ?? basePrice),
      0,
    );
    return Math.round(sum / selectedAvailable.length);
  }, [selectedAvailable, priceOverrides, basePrice]);

  // Commit drag on mouseup/touchend anywhere. A moved drag adds the whole range
  // to `selectedSet` and suppresses the trailing click; a pure click without
  // movement falls through to `handleCellClick` for toggling.
  useEffect(() => {
    if (!isDragging) return;
    const handler = () => {
      if (dragAnchor && dragMoved) {
        const range = datesInRange(dragAnchor, dragHover ?? dragAnchor);
        setSelectedSet((prev) => {
          const next = new Set(prev);
          for (const d of range) {
            if (!windowSet.has(d) || isBooked(d)) continue;
            next.add(d);
          }
          return next;
        });
        suppressClickRef.current = true;
      }
      setIsDragging(false);
      setDragAnchor(null);
      setDragHover(null);
      setDragMoved(false);
    };
    document.addEventListener("mouseup", handler);
    document.addEventListener("touchend", handler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("touchend", handler);
    };
  }, [isDragging, dragAnchor, dragHover, dragMoved, windowSet, isBooked]);

  function handleCellMouseDown(iso: string) {
    if (!windowSet.has(iso) || isBooked(iso)) return;
    suppressClickRef.current = false;
    setIsDragging(true);
    setDragAnchor(iso);
    setDragHover(iso);
    setDragMoved(false);
  }

  function handleCellMouseEnter(iso: string) {
    if (!isDragging || !dragAnchor) return;
    if (iso !== dragAnchor) setDragMoved(true);
    setDragHover(iso);
  }

  function handleCellClick(iso: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!windowSet.has(iso) || isBooked(iso)) return;
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  // ── Selection actions — mutate the lifted Maps, never the DB ───────────
  function applyPrice() {
    const v = Number(priceInput);
    if (selectedAvailable.length === 0 || !Number.isFinite(v) || v < 0) return;
    const next = new Map(priceOverrides);
    for (const d of selectedAvailable) next.set(d, v);
    onPriceOverridesChange(next);
    clearSelection();
  }

  function resetPrice() {
    if (selectedAvailable.length === 0) return;
    const next = new Map(priceOverrides);
    for (const d of selectedAvailable) next.delete(d);
    onPriceOverridesChange(next);
    clearSelection();
  }

  function blockSelected() {
    if (selectedAvailable.length === 0) return;
    const next = new Map(value);
    for (const d of selectedAvailable) next.set(d, "blocked");
    onChange(next);
    clearSelection();
  }

  function unblockSelected() {
    if (selectedBlocked.length === 0) return;
    const next = new Map(value);
    for (const d of selectedBlocked) next.set(d, "available");
    onChange(next);
    clearSelection();
  }

  const priceValid =
    !!priceInput &&
    Number.isFinite(Number(priceInput)) &&
    Number(priceInput) >= 0;

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
        <p className="text-sm font-semibold text-[#0F172A]">
          მონიშნე დღეები და დააყენე ფასი მომდევნო 30 დღისთვის.
        </p>
        <p className="mt-1 text-[13px] text-[#475569]">
          დააწექი ან გადაიტანე მაუსი დღეების ასარჩევად, შემდეგ დააყენე ფასი ან
          გათიშე ისინი. ნაგულისხმევად ყველა დღე ხელმისაწვდომია ძირითადი ფასით —{" "}
          <span className="font-semibold text-[#F97316]">ნარინჯისფერი</span>{" "}
          ფასი ნიშნავს, რომ ის შეცვლილია.
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
          clearSelection();
        }}
      />

      {/* Month grid(s) */}
      <div className="space-y-5 select-none">
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
                  if (!cell) return <div key={idx} className="h-16 sm:h-20" />;
                  const inWindow = windowSet.has(cell.iso);
                  const status = value.get(cell.iso);
                  const cellBooked = isBooked(cell.iso);
                  const override = priceOverrides.get(cell.iso);
                  return (
                    <DayCell
                      key={cell.iso}
                      day={cell.day}
                      inWindow={inWindow}
                      status={status}
                      isBooked={cellBooked}
                      isSelected={displaySet.has(cell.iso)}
                      price={override ?? basePrice}
                      hasOverride={override != null}
                      onMouseDown={() => handleCellMouseDown(cell.iso)}
                      onMouseEnter={() => handleCellMouseEnter(cell.iso)}
                      onClick={() => handleCellClick(cell.iso)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection action card — inline (the wizard footer is also inline) */}
      {hasActionable && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-[0px_4px_16px_-8px_rgba(15,23,42,0.18)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={clearSelection}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
                aria-label="გაუქმება"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="text-[13px]">
                <div className="font-black text-[#0F172A]">
                  {selectedAvailable.length > 0 && selectedBlocked.length > 0
                    ? `${selectedAvailable.length} ხელმისაწვდომი • ${selectedBlocked.length} დაკავებული`
                    : selectedAvailable.length > 0
                      ? `${selectedAvailable.length} დღე არჩეული`
                      : `${selectedBlocked.length} დაკავებული არჩეული`}
                </div>
                {selectedAvailable.length > 0 && (
                  <div className="text-[11px] font-semibold text-[#64748B]">
                    საშუალო ფასი: {avgSelectedPrice}₾
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2 md:justify-end">
              {selectedBlocked.length > 0 && (
                <button
                  type="button"
                  onClick={unblockSelected}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#16A34A] bg-white px-4 text-[13px] font-black text-[#16A34A] transition-colors hover:bg-[#F0FDF4]"
                >
                  <Unlock className="h-4 w-4" strokeWidth={2.4} />
                  ჩართვა ({selectedBlocked.length})
                </button>
              )}
              {selectedAvailable.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={blockSelected}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#D97706] px-4 text-[13px] font-black text-white shadow-[0_1px_2px_rgba(217,119,6,0.3)] transition-colors hover:bg-[#B45309]"
                  >
                    <Lock className="h-4 w-4" strokeWidth={2.4} />
                    გათიშვა ({selectedAvailable.length})
                  </button>
                  <div className="relative flex-1 md:max-w-[160px]">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      placeholder="ახალი ფასი"
                      className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pl-3 pr-8 text-[14px] font-semibold text-[#0F172A] outline-none focus:border-[#F97316]"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[#94A3B8]">
                      ₾
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!priceValid}
                    onClick={applyPrice}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#F97316] px-4 text-[13px] font-black text-white transition-colors hover:bg-[#EA580C] disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" strokeWidth={2.6} />
                    გადატარება
                  </button>
                  <button
                    type="button"
                    onClick={resetPrice}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
                    title="ფასი ნაგულისხმევზე დაბრუნება"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    ნაგულისხმევზე
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Helper text */}
      <p className="text-center text-xs text-[#64748B]">
        შეგიძლიათ მოგვიანებით განაახლოთ კალენდარი და ფასები თქვენი დაშბორდიდან.
      </p>
    </div>
  );
}

function DayCell({
  day,
  inWindow,
  status,
  isBooked,
  isSelected,
  price,
  hasOverride,
  onMouseDown,
  onMouseEnter,
  onClick,
}: {
  day: number;
  inWindow: boolean;
  status: AvailabilityStatus | undefined;
  isBooked: boolean;
  isSelected: boolean;
  price: number;
  hasOverride: boolean;
  onMouseDown: () => void;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  if (!inWindow) {
    return (
      <div className="flex h-16 items-start justify-start rounded-xl bg-[#F8FAFC] px-2 py-1.5 text-[13px] font-medium text-[#CBD5E1] sm:h-20">
        {day}
      </div>
    );
  }

  if (isBooked) {
    return (
      <div className="flex h-16 cursor-not-allowed flex-col items-start justify-between rounded-xl border border-[#FEE2E2] bg-[#FEE2E2] px-2 py-1.5 text-[#991B1B] sm:h-20">
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
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`relative flex h-16 flex-col items-start justify-between rounded-xl border px-2 py-1.5 text-left transition-colors active:scale-[0.98] sm:h-20 ${
        isBlocked
          ? "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B] hover:border-[#EF4444]"
          : "border-[#BBF7D0] bg-[#DCFCE7] text-[#15803D] hover:border-[#16A34A]"
      } ${isSelected ? "ring-2 ring-inset ring-[#2563EB]" : ""}`}
      aria-label={`${day} — ${
        isBlocked
          ? "დაკავებული, დააწექი რომ აირჩიო"
          : `ხელმისაწვდომი, ${price}₾`
      }`}
    >
      <span className="text-[13px] font-bold leading-none">{day}</span>
      {isBlocked ? (
        <X className="ml-auto size-3" strokeWidth={3} />
      ) : (
        <span
          className={`ml-auto inline-flex items-center gap-1 text-[10px] font-bold leading-none ${
            hasOverride ? "text-[#F97316]" : "text-[#16A34A]"
          }`}
        >
          {hasOverride && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />
          )}
          {price}₾
        </span>
      )}
    </button>
  );
}
