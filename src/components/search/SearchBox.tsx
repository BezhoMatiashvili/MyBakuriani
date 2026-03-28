"use client";

import { useState, useRef, useEffect } from "react";
import {
  Search,
  MapPin,
  Calendar as CalendarIcon,
  Users,
  Hash,
} from "lucide-react";
import { format } from "date-fns";
import { ka } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export interface SearchFilters {
  location: string;
  checkIn: string;
  checkOut: string;
  guests: number | "";
  cadastralCode: string;
}

interface SearchBoxProps {
  onSearch: (filters: SearchFilters) => void;
  className?: string;
  defaultLocation?: string;
  defaultGuests?: number | "";
  defaultCadastralCode?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
}

export function SearchBox({
  onSearch,
  className,
  defaultLocation = "",
  defaultGuests = "",
  defaultCadastralCode = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
}: SearchBoxProps) {
  const [location, setLocation] = useState(defaultLocation);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (defaultCheckIn) {
      const from = new Date(defaultCheckIn + "T00:00:00");
      const to = defaultCheckOut
        ? new Date(defaultCheckOut + "T00:00:00")
        : undefined;
      return { from, to };
    }
    return undefined;
  });
  const [guests, setGuests] = useState<number | "">(defaultGuests);
  const [cadastralCode, setCadastralCode] = useState(defaultCadastralCode);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Detect mobile for responsive calendar
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setCalendarOpen(false);
      }
    }
    if (calendarOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [calendarOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      location,
      checkIn: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "",
      checkOut: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "",
      guests,
      cadastralCode,
    });
  };

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "d MMM", { locale: ka })} – ${format(dateRange.to, "d MMM", { locale: ka })}`
      : format(dateRange.from, "d MMM", { locale: ka })
    : "";

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "rounded-2xl bg-white p-4 shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.15)]",
        "md:flex md:h-[80px] md:items-center md:overflow-visible md:rounded-full md:p-2",
        className,
      )}
    >
      {/* Mobile: stacked grid layout */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {/* Location */}
        <div className="relative">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            ლოკაცია
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="მაგ. ბაკურიანი"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>

        {/* Date Range Picker */}
        <div className="relative" ref={isMobile ? calendarRef : undefined}>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            თარიღი
          </label>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setCalendarOpen(!calendarOpen)}
              className={cn(
                "h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-left text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50",
                !dateLabel && "text-muted-foreground",
              )}
            >
              {dateLabel || "შეარჩიეთ თარიღი"}
            </button>
          </div>
          {calendarOpen && isMobile && (
            <div className="absolute left-0 top-full z-50 mt-2 max-w-[calc(100vw-2rem)] rounded-xl border bg-white p-3 shadow-xl">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  if (range?.from && range?.to) setCalendarOpen(false);
                }}
                numberOfMonths={1}
                disabled={{ before: new Date() }}
                className="rounded-md"
              />
            </div>
          )}
        </div>

        {/* Guests */}
        <div className="relative">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            სტუმრები
          </label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number"
              min={1}
              placeholder="რაოდენობა"
              value={guests}
              onChange={(e) =>
                setGuests(e.target.value ? Number(e.target.value) : "")
              }
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            className="h-10 gap-2 bg-brand-accent px-6 text-white hover:bg-brand-accent-hover"
          >
            <Search className="size-4" />
            ძებნა
          </Button>
        </div>
      </div>

      {/* Desktop: horizontal pill layout */}
      <div className="hidden flex-1 items-center md:flex">
        {/* Date field */}
        <div
          className="relative flex h-[64px] flex-1 flex-col justify-center rounded-l-full px-6"
          ref={calendarRef}
        >
          <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            თარიღები
          </span>
          <button
            type="button"
            onClick={() => setCalendarOpen(!calendarOpen)}
            className={cn(
              "text-left text-[15px] font-bold text-[#1E293B]",
              !dateLabel && "text-muted-foreground",
            )}
          >
            {dateLabel || "შეარჩიეთ თარიღი"}
          </button>
          {calendarOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-[730px] rounded-xl border bg-white p-4 shadow-xl">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  if (range?.from && range?.to) setCalendarOpen(false);
                }}
                numberOfMonths={2}
                disabled={{ before: new Date() }}
                className="w-full rounded-md [--cell-size:40px]"
              />
            </div>
          )}
        </div>

        {/* Location field */}
        <div className="flex h-[64px] flex-1 flex-col justify-center px-6">
          <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            ლოკაცია (ზონა)
          </span>
          <input
            type="text"
            placeholder="დიდველი / კრისტალი"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full border-none bg-transparent text-[15px] font-bold text-[#1E293B] outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Filters / Guests field */}
        <div className="flex h-[64px] flex-1 flex-col justify-center px-6">
          <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
            სტუმრები
          </span>
          <input
            type="number"
            min={1}
            placeholder="რაოდენობა"
            value={guests}
            onChange={(e) =>
              setGuests(e.target.value ? Number(e.target.value) : "")
            }
            className="w-full border-none bg-transparent text-[15px] font-bold text-[#1E293B] outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Cadastral field */}
        <div className="flex h-[61.5px] items-center justify-center px-2">
          <div className="relative">
            <input
              type="text"
              placeholder="საკადასტრო კოდი"
              value={cadastralCode}
              onChange={(e) => setCadastralCode(e.target.value)}
              className="h-[45px] w-[260px] rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-5 text-sm text-[#1E293B] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Search button */}
        <Button
          type="submit"
          className="ml-2 h-[64px] w-[64px] shrink-0 rounded-full bg-brand-accent text-white hover:bg-brand-accent-hover"
        >
          <Search className="size-5" />
        </Button>
      </div>
    </form>
  );
}
