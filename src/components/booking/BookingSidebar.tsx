"use client";
import { useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";
import { CallButton } from "@/components/shared/CallButton";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { formatPrice } from "@/lib/utils/format";
import {
  sumNightlyPrice,
  isDiscountActive,
  applyDiscount,
  type PriceOverride,
} from "@/lib/utils/pricing";
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
  ownerWhatsapp?: string | null;
  ownerId?: string | null;
  propertyId?: string | null;
  selectedRange: DateRange;
  onRangeChange?: (range: DateRange) => void;
  rating?: number | null;
  calendarDates?: BlockedDate[];
  maxGuests?: number;
  perPersonPricing?: boolean;
  showGuestCount?: boolean;
  priceOverrides?: PriceOverride[];
  discountPercent?: number | null;
  discountExpiresAt?: string | null;
}

/* ── Inline mini-calendar (rendered inside the sidebar dropdown) ── */
const MINI_CAL_DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

function MiniCalendar({
  selectedRange,
  onDateClick,
  calendarDates = [],
}: {
  selectedRange: DateRange;
  onDateClick: (date: Date) => void;
  calendarDates?: BlockedDate[];
}) {
  const t = useTranslations("BookingSidebar");
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
        {MINI_CAL_DAY_KEYS.map((key) => (
          <div
            key={key}
            className="py-1 text-center text-[10px] font-bold uppercase text-[#94A3B8]"
          >
            <span className="md:hidden">{t(`daysShort.${key}`)}</span>
            <span className="hidden md:inline">{t(`days.${key}`)}</span>
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
              className={`flex h-10 lg:h-8 items-center justify-center rounded-full text-[12px] transition-colors ${
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
  ownerWhatsapp,
  propertyId,
  selectedRange,
  onRangeChange,
  rating,
  calendarDates = [],
  maxGuests = 10,
  perPersonPricing = false,
  showGuestCount = true,
  priceOverrides,
  discountPercent,
  discountExpiresAt,
}: BookingSidebarProps) {
  const t = useTranslations("BookingSidebar");
  const { start, end } = selectedRange;
  const days = start && end ? differenceInDays(end, start) + 1 : 0;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [guestCount, setGuestCount] = useState(1);
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
  const guestMultiplier = perPersonPricing ? guestCount : 1;
  const nightlySum =
    days > 0 && start && end
      ? sumNightlyPrice(start, end, pricePerNight, priceOverrides)
      : 0;
  const subtotal = nightlySum * guestMultiplier;
  const discountActive = isDiscountActive(discountPercent, discountExpiresAt);
  const discountedSubtotal = applyDiscount(
    subtotal,
    discountPercent,
    discountExpiresAt,
  );
  const discountAmount = subtotal - discountedSubtotal;
  const total = discountActive ? discountedSubtotal : subtotal;
  const avgNightly = days > 0 ? Math.round(nightlySum / days) : pricePerNight;
  const hasMixedPricing = days > 0 && nightlySum !== days * pricePerNight;
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
      <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 sm:p-8 shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between">
          <div>
            {discountActive && (
              <span className="block text-[11px] font-bold text-[#94A3B8] line-through">
                {formatPrice(pricePerNight)}
              </span>
            )}
            <span className="text-[32px] font-black leading-[32px] text-[#1E293B]">
              {formatPrice(
                discountActive
                  ? Math.round(
                      applyDiscount(
                        pricePerNight,
                        discountPercent,
                        discountExpiresAt,
                      ),
                    )
                  : pricePerNight,
              )}
            </span>
            <span className="text-[15px] font-medium text-[#64748B]">
              {" "}
              {t("perNight")}
            </span>
          </div>
          {rating != null && (
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-[#1E293B]">
              <Star className="h-4 w-4 fill-[#EAB308] text-[#EAB308]" />{" "}
              {rating.toFixed(1)}
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
                {t("checkIn")}
              </span>
              <p className="mt-0.5 text-[13px] font-bold text-[#1E293B]">
                {start
                  ? format(start, "d MMM, yyyy", { locale: ka })
                  : t("datePlaceholder")}
              </p>
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#F97316]">
                {t("checkOut")}
              </span>
              <p className="mt-0.5 text-[13px] font-bold text-[#1E293B]">
                {end
                  ? format(end, "d MMM, yyyy", { locale: ka })
                  : t("datePlaceholder")}
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
        {showGuestCount && (
          <div className="relative" ref={guestRef}>
            <button
              type="button"
              onClick={() => setGuestDropdownOpen(!guestDropdownOpen)}
              className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${guestDropdownOpen ? "border-[#F97316]" : "border-[#CBD5E1]"} cursor-pointer hover:border-[#F97316]`}
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                  {t("guestsLabel")}
                </span>
                <p className="mt-0.5 text-[13px] font-bold text-[#1E293B]">
                  {t("personCount", { count: guestCount })}
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
                    {t("personCount", { count: n })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {days > 0 && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#64748B]">
                {hasMixedPricing
                  ? `≈${t("daysLine", { price: formatPrice(avgNightly), count: days })}`
                  : t("daysLine", {
                      price: formatPrice(pricePerNight),
                      count: days,
                    })}
                {showGuestCount && perPersonPricing
                  ? ` x ${t("personCount", { count: guestCount })}`
                  : ""}
              </span>
              <span className="font-bold text-[#1E293B]">
                {formatPrice(subtotal)}
              </span>
            </div>
            {hasMixedPricing && (
              <p className="text-[11px] font-medium text-[#94A3B8]">
                {t("mixedPricingNote")}
              </p>
            )}
            {discountActive && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#64748B]">
                  {t("discountLine", { percent: discountPercent ?? 0 })}
                </span>
                <span className="font-bold text-[#1E293B]">
                  -{formatPrice(Math.round(discountAmount))}
                </span>
              </div>
            )}
            <div className="border-t border-[#E2E8F0] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-black italic text-[#1E293B]">
                  {t("total")}
                </span>
                <span className="text-[22px] font-black text-[#1E293B]">
                  {formatPrice(total)}
                </span>
              </div>
            </div>
          </div>
        )}
        <p className="mt-3 text-center text-[11px] font-medium text-[#94A3B8]">
          {t("minBookingNotice", { count: minBookingDays })}
        </p>
        <div className="mt-5 flex gap-2">
          <CallButton
            phone={ownerPhone}
            className="flex-1 shadow-[0px_8px_20px_rgba(34,197,94,0.25)]"
            label={t("callOwner")}
            propertyId={propertyId}
            alwaysShowLabel
          />
          <WhatsAppButton
            phone={ownerWhatsapp ?? ownerPhone}
            propertyId={propertyId}
          />
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
                {t("verifiedOwner")}
              </p>
            )}
            <p className="text-[15px] font-black text-[#1E293B]">{ownerName}</p>
            <p className="text-[11px] text-[#64748B]">{t("hostStats")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
