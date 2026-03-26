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
}

export function SearchBox({
  onSearch,
  className,
  defaultLocation = "",
  defaultGuests = "",
  defaultCadastralCode = "",
}: SearchBoxProps) {
  const [location, setLocation] = useState(defaultLocation);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
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
      className={cn("rounded-2xl bg-white p-4 shadow-lg md:p-6", className)}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-4">
        {/* Location */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
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
        <div className="relative" ref={calendarRef}>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
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

          {calendarOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 max-w-[calc(100vw-2rem)] rounded-xl border bg-white p-3 shadow-xl md:max-w-none">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  if (range?.from && range?.to) {
                    setCalendarOpen(false);
                  }
                }}
                numberOfMonths={isMobile ? 1 : 2}
                disabled={{ before: new Date() }}
                className="rounded-md"
              />
            </div>
          )}
        </div>

        {/* Guests */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
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

        {/* Cadastral Code */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            საკადასტრო კოდი
          </label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="XX.XX.XX.XXX"
              value={cadastralCode}
              onChange={(e) => setCadastralCode(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          className="h-10 gap-2 bg-blue-600 px-6 text-white hover:bg-blue-700"
        >
          <Search className="size-4" />
          ძებნა
        </Button>
      </div>
    </form>
  );
}
