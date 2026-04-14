"use client";
import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  selectedRange: DateRange;
  onRangeChange?: (range: DateRange) => void;
  onBook: () => void;
  rating?: number | null;
  cleaningFee?: number;
  calendarDates?: BlockedDate[];
  maxGuests?: number;
}

/* ── Inline mini-calendar (rendered inside the sidebar dropdown) ── */
const MINI_CAL_DAYS = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];

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
        {MINI_CAL_DAYS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-[10px] font-bold uppercase text-[#94A3B8]"
          >
            {d}
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
  selectedRange,
  onRangeChange,
  onBook,
  rating,
  cleaningFee = 50,
  calendarDates = [],
  maxGuests = 10,
}: BookingSidebarProps) {
  const { start, end } = selectedRange;
  const nights = start && end ? differenceInDays(end, start) : 0;
  const subtotal = nights > 0 ? nights * pricePerNight : 0;
  const total = subtotal + (nights > 0 ? cleaningFee : 0);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [guestCount, setGuestCount] = useState(1);
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
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
    <div className="sticky top-24 space-y-4">
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
              </span>
              <span className="font-bold text-[#1E293B]">
                {formatPrice(subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#64748B]">დასუფთავების საფასური</span>
              <span className="font-bold text-[#1E293B]">
                {formatPrice(cleaningFee)}
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
          <Button
            onClick={onBook}
            className="h-12 flex-1 gap-2 rounded-full bg-[#F97316] text-[14px] font-bold text-white shadow-[0px_8px_20px_rgba(249,115,22,0.25)] hover:bg-[#EA580C]"
          >
            <Phone className="h-4 w-4" />
            დარეკვა მესაკუთრეთან
          </Button>
          <Button className="h-12 w-12 shrink-0 rounded-full bg-[#25D366] p-0 text-white hover:bg-[#25D366]/90">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </Button>
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
