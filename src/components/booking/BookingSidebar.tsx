"use client";
import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { formatPrice } from "@/lib/utils/format";
import {
  differenceInDays,
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isBefore,
} from "date-fns";
import { ka } from "date-fns/locale";

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface BlockedDate {
  date: Date;
  status: "available" | "booked" | "blocked";
}

interface BookingSidebarProps {
  pricePerNight: number;
  minBookingDays: number;
  ownerName: string;
  ownerAvatar: string | null;
  isOwnerVerified: boolean;
  ownerPhone?: string | null;
  selectedRange: DateRange;
  onRangeChange?: (range: DateRange) => void;
  onBook: () => void;
  rating?: number | null;
  calendarDates?: BlockedDate[];
  maxGuests?: number;
  perPersonPricing?: boolean;
}

/* ── Inline mini-calendar (rendered inside the sidebar dropdown) ── */
const MINI_CAL_DAYS = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];
const MINI_CAL_DAYS_SHORT = ["ო", "ს", "ო", "ხ", "პ", "შ", "კ"];

function MiniCalendar({
  selectedRange,
  onDateClick,
  calendarDates = [],
}: {
  selectedRange: DateRange;
  onDateClick: (date: Date) => void;
  calendarDates?: BlockedDate[];
}) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today);
  const monthDate = currentMonth;
  const allDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }),
  });

  const canGoPrev =
    monthDate.getFullYear() > today.getFullYear() ||
    (monthDate.getFullYear() === today.getFullYear() &&
      monthDate.getMonth() > today.getMonth());

  const getStatus = (day: Date) =>
    calendarDates.find((d) => isSameDay(d.date, day))?.status ?? null;

  const isPast = (day: Date) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d < t;
  };

  const isInRange = (day: Date) => {
    const { start, end } = selectedRange;
    if (!start || !end) return false;
    return day > start && day < end;
  };

  const isRangeEnd = (day: Date) => {
    const { start, end } = selectedRange;
    return (start && isSameDay(day, start)) || (end && isSameDay(day, end));
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            canGoPrev && setCurrentMonth(subMonths(currentMonth, 1))
          }
          className={`flex size-7 items-center justify-center rounded-lg ${canGoPrev ? "hover:bg-[#F8FAFC]" : "opacity-30 cursor-not-allowed"}`}
        >
          <ChevronLeft className="size-4 text-[#94A3B8]" />
        </button>
        <span className="text-[13px] font-bold capitalize text-[#1E293B]">
          {format(monthDate, "LLLL yyyy", { locale: ka })}
        </span>
        <button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="flex size-7 items-center justify-center rounded-lg hover:bg-[#F8FAFC]"
        >
          <ChevronRight className="size-4 text-[#94A3B8]" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {MINI_CAL_DAYS.map((d, i) => (
          <div
            key={d}
            className="py-1 text-center text-[10px] font-bold uppercase text-[#94A3B8]"
          >
            <span className="md:hidden">{MINI_CAL_DAYS_SHORT[i]}</span>
            <span className="hidden md:inline">{d}</span>
          </div>
        ))}
        {allDays.map((day) => {
          const inMonth = isSameMonth(day, monthDate);
          const status = inMonth ? getStatus(day) : null;
          const blocked =
            status === "booked" || status === "blocked" || isPast(day);
          const rangeEnd = isRangeEnd(day);
          const inRange = isInRange(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!inMonth || blocked}
              onClick={() => !blocked && inMonth && onDateClick(day)}
              className={`flex h-8 items-center justify-center rounded-full text-[12px] transition-colors ${
                !inMonth
                  ? "invisible"
                  : rangeEnd
                    ? "bg-[#F97316] font-bold text-white"
                    : inRange
                      ? "bg-[#FFF7ED] text-[#F97316]"
                      : blocked
                        ? "text-[#CBD5E1] cursor-not-allowed"
                        : "text-[#1E293B] hover:bg-[#F1F5F9] cursor-pointer"
              }`}
            >
              {inMonth ? day.getDate() : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BookingSidebar({
  pricePerNight,
  minBookingDays,
  ownerName,
  ownerAvatar,
  isOwnerVerified,
  ownerPhone,
  selectedRange,
  onRangeChange,
  onBook,
  rating,
  calendarDates = [],
  maxGuests = 10,
  perPersonPricing = false,
}: BookingSidebarProps) {
  const { start, end } = selectedRange;
  const nights = start && end ? differenceInDays(end, start) : 0;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [guestCount, setGuestCount] = useState(1);
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
  const guestMultiplier = perPersonPricing ? guestCount : 1;
  const subtotal = nights > 0 ? nights * pricePerNight * guestMultiplier : 0;
  const total = subtotal;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const guestRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setCalendarOpen(false);
      }
      if (guestRef.current && !guestRef.current.contains(e.target as Node)) {
        setGuestDropdownOpen(false);
      }
    }
    if (calendarOpen || guestDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [calendarOpen, guestDropdownOpen]);

  const handleDateClick = (date: Date) => {
    if (!onRangeChange) return;
    if (!start || (start && end)) {
      onRangeChange({ start: date, end: null });
    } else {
      if (isBefore(date, start)) {
        onRangeChange({ start: date, end: start });
      } else {
        onRangeChange({ start, end: date });
        setCalendarOpen(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[32px] font-black leading-[32px] text-[#1E293B]">
              {formatPrice(pricePerNight)}
            </span>
            <span className="text-[15px] font-medium text-[#64748B]">
              {" "}
              / ღამე
            </span>
          </div>
          {rating != null && (
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-[#1E293B]">
              <span className="text-[#EAB308]">★</span> {rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => onRangeChange && setCalendarOpen(!calendarOpen)}
            className={`mt-5 grid w-full grid-cols-2 overflow-hidden rounded-2xl border text-left transition-colors ${calendarOpen ? "border-[#F97316]" : "border-[#CBD5E1]"} ${onRangeChange ? "cursor-pointer hover:border-[#F97316]" : ""}`}
          >
            <div className="border-r border-[#CBD5E1] px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#F97316]">
                შესვლა
              </span>
              <p className="mt-0.5 text-[13px] font-bold text-[#1E293B]">
                {start
                  ? format(start, "d MMM, yyyy", { locale: ka })
                  : "თარიღი"}
              </p>
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#F97316]">
                გამოსვლა
              </span>
              <p className="mt-0.5 text-[13px] font-bold text-[#1E293B]">
                {end ? format(end, "d MMM, yyyy", { locale: ka }) : "თარიღი"}
              </p>
            </div>
          </button>
          {calendarOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-[#E2E8F0] bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
              <MiniCalendar
                selectedRange={selectedRange}
                onDateClick={handleDateClick}
                calendarDates={calendarDates}
              />
            </div>
          )}
        </div>
        <div className="relative" ref={guestRef}>
          <button
            type="button"
            onClick={() => setGuestDropdownOpen(!guestDropdownOpen)}
            className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${guestDropdownOpen ? "border-[#F97316]" : "border-[#CBD5E1]"} cursor-pointer hover:border-[#F97316]`}
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                რაოდენობა
              </span>
              <p className="mt-0.5 text-[13px] font-bold text-[#1E293B]">
                {guestCount} ადამიანი
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-[#94A3B8] transition-transform ${guestDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>
          {guestDropdownOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[200px] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white py-1 shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setGuestCount(n);
                    setGuestDropdownOpen(false);
                  }}
                  className={`flex w-full items-center px-4 py-2.5 text-[13px] font-medium transition-colors ${
                    n === guestCount
                      ? "bg-[#FFF7ED] font-bold text-[#F97316]"
                      : "text-[#1E293B] hover:bg-[#F8FAFC]"
                  }`}
                >
                  {n} ადამიანი
                </button>
              ))}
            </div>
          )}
        </div>
        {nights > 0 && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#64748B]">
                {formatPrice(pricePerNight)} x {nights} ღამე
                {perPersonPricing ? ` x ${guestCount} ადამიანი` : ""}
              </span>
              <span className="font-bold text-[#1E293B]">
                {formatPrice(subtotal)}
              </span>
            </div>
            <div className="border-t border-[#E2E8F0] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-black italic text-[#1E293B]">
                  ჯამში
                </span>
                <span className="text-[22px] font-black text-[#1E293B]">
                  {formatPrice(total)}
                </span>
              </div>
            </div>
          </div>
        )}
        <p className="mt-3 text-center text-[11px] font-medium text-[#94A3B8]">
          მინ. ჯავშანი: {minBookingDays} დღე
        </p>
        <div className="mt-5 flex gap-2">
          <CallButton
            phone={ownerPhone}
            className="h-12 flex-1 gap-2 rounded-full bg-[#F97316] text-[14px] font-bold text-white shadow-[0px_8px_20px_rgba(249,115,22,0.25)] hover:bg-[#EA580C]"
            label="დარეკვა მესაკუთრეთან"
            onNoPhoneClick={onBook}
          />
          <WhatsAppButton phone={ownerPhone} />
        </div>
      </div>
      <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
        <div className="flex items-center gap-3">
          <div className="relative size-12 shrink-0">
            <div className="size-full overflow-hidden rounded-full bg-[#F8FAFC]">
              {ownerAvatar ? (
                <Image
                  src={ownerAvatar}
                  alt={ownerName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-sm font-medium text-[#64748B]">
                  {ownerName.charAt(0)}
                </div>
              )}
            </div>
            {isOwnerVerified && (
              <BadgeCheck className="absolute -bottom-0.5 -right-0.5 size-4 text-[#10B981]" />
            )}
          </div>
          <div>
            {isOwnerVerified && (
              <p className="text-[9px] font-bold uppercase tracking-[0.5px] text-[#10B981]">
                ვერიფიცირებული მესაკუთრე
              </p>
            )}
            <p className="text-[15px] font-black text-[#1E293B]">{ownerName}</p>
            <p className="text-[11px] text-[#64748B]">
              Host for 3 years &bull; Response: 1hr
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
