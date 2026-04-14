"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  MapPin,
  ChevronDown,
  Mountain,
  TreePine,
  Check,
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

export type ActiveDropdown = "calendar" | "location" | "filters" | null;

interface SearchBoxProps {
  onSearch: (filters: SearchFilters) => void;
  className?: string;
  defaultLocation?: string;
  defaultGuests?: number | "";
  defaultCadastralCode?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  dropdownPortalRef?: React.RefObject<HTMLDivElement | null>;
  onActiveDropdownChange?: (active: ActiveDropdown) => void;
}

// ─── Location zones ──────────────────────────────────────────────────
const ZONES = [
  {
    value: "დიდველი / კრისტალი",
    title: "დიდველი / კრისტალი",
    description: "ტრასასთან ახლოს, საბაგირეს ხედვით",
    icon: Mountain,
  },
  {
    value: "ცენტრი / პარკი",
    title: "ცენტრი / პარკი",
    description: "გართობა, რესტორნები და ცენტრალური პარკი",
    icon: TreePine,
  },
  {
    value: "კოხტა / მიტარბი",
    title: "კოხტა / მიტარბი",
    description: "პრემიუმ ფარეხი და ახალი საბაგიროები",
    icon: Mountain,
  },
  {
    value: "25-იანები",
    title: "25-იანები",
    description: "იაფფასიანი ბინები და დამწყებთათვის",
    icon: MapPin,
  },
];

// ─── Filter constants ────────────────────────────────────────────────
const CAPACITY_OPTIONS = ["2 სტუმარი", "4 სტუმარი", "6 სტუმარი", "8+ სტუმარი"];
const BEDROOM_OPTIONS = ["1", "2", "3", "4+"];
const BATHROOM_OPTIONS = ["1", "2", "3+"];
const FLOOR_OPTIONS = ["1", "2-5", "6+"];
const AMENITIES = [
  "Wi-Fi",
  "ცენტრალური გათბობა",
  "თხილამურების სათავსო",
  "ცხელი წყალი",
  "ბუხარი",
  "პარკინგი",
  "სარეცხი მანქანა",
  "ჭურჭელი",
];

interface FilterState {
  priceMin: number;
  priceMax: number;
  bedrooms: string | null;
  bathrooms: string | null;
  floors: string | null;
  capacity: string | null;
  amenities: string[];
  verifiedOnly: boolean;
}

const DEFAULT_FILTERS: FilterState = {
  priceMin: 80,
  priceMax: 450,
  bedrooms: null,
  bathrooms: null,
  floors: null,
  capacity: null,
  amenities: [],
  verifiedOnly: false,
};

// ─── Chip button ─────────────────────────────────────────────────────
function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 items-center justify-center rounded-lg border px-4 text-[13px] font-semibold transition-colors",
        selected
          ? "border-[#2563EB] bg-[#2563EB] text-white"
          : "border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]",
      )}
    >
      {label}
    </button>
  );
}

export function SearchBox({
  onSearch,
  className,
  defaultLocation = "",
  defaultGuests = "",
  defaultCadastralCode = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  dropdownPortalRef,
  onActiveDropdownChange,
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
  const [guests] = useState<number | "">(defaultGuests);
  const [cadastralCode, setCadastralCode] = useState(defaultCadastralCode);

  // Custom range handler: when a complete range exists and user clicks a new date,
  // use the OLD end as new start and clicked date as new end
  const handleRangeSelect = useCallback(
    (range: DateRange | undefined) => {
      if (range?.from && !range.to && dateRange?.from && dateRange?.to) {
        // A complete range existed, user clicked a new date (range.from = clicked date, no to yet)
        const clicked = range.from;
        if (clicked > dateRange.to) {
          // Clicked after old end → old end becomes start, clicked becomes end
          setDateRange({ from: dateRange.to, to: clicked });
          return;
        }
        if (clicked < dateRange.from) {
          // Clicked before old start → just start fresh
          setDateRange({ from: clicked, to: undefined });
          return;
        }
      }
      setDateRange(range);
    },
    [dateRange],
  );

  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const containerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    onActiveDropdownChange?.(activeDropdown);
  }, [activeDropdown, onActiveDropdownChange]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inPortal = dropdownPortalRef?.current?.contains(target);
      if (!inContainer && !inPortal) {
        setActiveDropdown(null);
      }
    }
    if (activeDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [activeDropdown, dropdownPortalRef]);

  // Track portal readiness — ref isn't available on the first render frame
  // when the parent conditionally mounts the portal container
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    const ready = !!dropdownPortalRef?.current;
    setPortalReady((prev) => (prev !== ready ? ready : prev));
  }, [dropdownPortalRef, activeDropdown]);
  const usePortal = portalReady;

  const toggleDropdown = useCallback((name: ActiveDropdown) => {
    setActiveDropdown((prev) => (prev === name ? null : name));
  }, []);

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
      ? `${format(dateRange.from, "d MMM", { locale: ka })} - ${format(dateRange.to, "d MMM", { locale: ka })}`
      : format(dateRange.from, "d MMM", { locale: ka })
    : "";

  const handleApplyFilters = () => {
    setActiveDropdown(null);
    onSearch({
      location,
      checkIn: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "",
      checkOut: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "",
      guests,
      cadastralCode,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "relative rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.15)]",
        "md:flex md:h-[80px] md:items-center md:overflow-visible md:rounded-full md:border-0 md:p-2",
        className,
      )}
      ref={containerRef}
    >
      {/* ═══ Mobile: stacked grid layout ═══ */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {/* Location */}
        <div className="relative">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
            ლოკაცია
          </label>
          <button
            type="button"
            onClick={() => toggleDropdown("location")}
            className="flex h-10 w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 text-left text-sm outline-none"
          >
            <span className={location ? "text-[#1E293B]" : "text-[#94A3B8]"}>
              {location || "მაგ. ბაკურიანი"}
            </span>
            <ChevronDown className="size-4 text-[#94A3B8]" />
          </button>
          {activeDropdown === "location" && isMobile && (
            <LocationDropdown
              location={location}
              onSelect={(val) => {
                setLocation(val);
                setActiveDropdown(null);
              }}
            />
          )}
        </div>

        {/* Date Range Picker */}
        <div className="relative">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
            თარიღი
          </label>
          <button
            type="button"
            onClick={() => toggleDropdown("calendar")}
            className={cn(
              "h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-left text-sm outline-none",
              !dateLabel && "text-[#94A3B8]",
            )}
          >
            {dateLabel || "შეარჩიეთ თარიღი"}
          </button>
          {activeDropdown === "calendar" && isMobile && (
            <div className="absolute left-0 top-full z-50 mt-2 max-w-[calc(100vw-2rem)] rounded-[24px] border border-[#E2E8F0] bg-white p-4 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleRangeSelect}
                numberOfMonths={1}
                min={1}
                locale={ka}
                disabled={{ before: new Date() }}
                className="rounded-md [--cell-size:40px]"
              />
              <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-4">
                <button
                  type="button"
                  onClick={() => setDateRange(undefined)}
                  className="text-[14px] font-medium text-[#64748B] hover:text-[#1E293B]"
                >
                  გასუფთავება
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDropdown(null)}
                  className="h-[38px] rounded-xl bg-[#E8612D] px-5 text-[12px] font-bold text-white hover:bg-[#D4551F]"
                >
                  დადასტურება
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="relative">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
            ფილტრები
          </label>
          <button
            type="button"
            onClick={() => toggleDropdown("filters")}
            className="flex h-10 w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 text-left text-sm text-[#94A3B8] outline-none"
          >
            ფასი, თევადობა...
            <ChevronDown className="size-4" />
          </button>
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

      {/* ═══ Desktop: horizontal pill layout ═══ */}
      <div className="hidden flex-1 items-center md:flex">
        {/* Date field */}
        <div className="relative flex h-[64px] flex-1 flex-col justify-center rounded-l-full px-6">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-[1px]",
              activeDropdown === "calendar"
                ? "text-[#2563EB]"
                : "text-[#94A3B8]",
            )}
          >
            თარიღები
          </span>
          <button
            type="button"
            onClick={() => toggleDropdown("calendar")}
            className={cn(
              "text-left text-[15px] font-bold leading-[22px]",
              activeDropdown === "calendar"
                ? "text-[#2563EB]"
                : dateLabel
                  ? "text-[#1E293B]"
                  : "text-[#94A3B8]",
            )}
          >
            {dateLabel || "შეარჩიეთ თარიღი"}
          </button>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-[#F1F5F9]" />

        {/* Location field */}
        <div className="relative flex h-[64px] flex-1 flex-col justify-center px-6">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-[1px]",
              activeDropdown === "location"
                ? "text-[#2563EB]"
                : "text-[#94A3B8]",
            )}
          >
            ლოკაცია (ზონა)
          </span>
          <button
            type="button"
            onClick={() => toggleDropdown("location")}
            className={cn(
              "flex w-full items-center gap-1 text-left text-[15px] font-bold leading-[22px] outline-none",
              activeDropdown === "location"
                ? "text-[#2563EB]"
                : location
                  ? "text-[#1E293B]"
                  : "text-[#94A3B8]",
            )}
          >
            {location || "დიდველი / კრისტალი"}
            <ChevronDown
              className={cn(
                "size-4 shrink-0",
                activeDropdown === "location"
                  ? "text-[#2563EB]"
                  : "text-[#94A3B8]",
              )}
            />
          </button>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-[#F1F5F9]" />

        {/* Filters field */}
        <div className="relative flex h-[64px] flex-1 flex-col justify-center px-6">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-[1px]",
              activeDropdown === "filters"
                ? "text-[#2563EB]"
                : "text-[#94A3B8]",
            )}
          >
            ფილტრები
          </span>
          <button
            type="button"
            onClick={() => toggleDropdown("filters")}
            className={cn(
              "flex w-full items-center gap-1 text-left text-[15px] font-bold leading-[22px] outline-none",
              activeDropdown === "filters"
                ? "text-[#2563EB]"
                : "text-[#94A3B8]",
            )}
          >
            ფასი, თევადობა...
            <ChevronDown
              className={cn(
                "size-4 shrink-0",
                activeDropdown === "filters"
                  ? "text-[#2563EB]"
                  : "text-[#94A3B8]",
              )}
            />
          </button>
        </div>

        {/* Cadastral field */}
        <div className="flex h-[61.5px] items-center justify-center px-2">
          <input
            type="text"
            placeholder="საკადასტრო კოდით..."
            value={cadastralCode}
            onChange={(e) => setCadastralCode(e.target.value)}
            className="h-[45.5px] w-[260px] rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-5 text-[13px] font-medium text-[#1E293B] outline-none placeholder:text-[#94A3B8]"
          />
        </div>

        {/* Search button */}
        <Button
          type="submit"
          className="ml-2 size-[34px] shrink-0 rounded-full bg-brand-accent text-white hover:bg-brand-accent-hover"
        >
          <Search className="size-4" />
        </Button>
      </div>

      {/* ═══ DROPDOWNS ═══ */}
      {(() => {
        if (isMobile) {
          return (
            <>
              {activeDropdown === "filters" && (
                <FiltersDropdown
                  filters={filters}
                  onChange={setFilters}
                  onApply={handleApplyFilters}
                  onClear={() => setFilters(DEFAULT_FILTERS)}
                  mobile
                />
              )}
            </>
          );
        }

        const calendarPanel = activeDropdown === "calendar" && (
          <div
            className={cn(
              usePortal
                ? "w-full rounded-[32px] border border-[#E2E8F0] bg-white p-8 shadow-[var(--shadow-category-nav)]"
                : "absolute left-0 top-full z-50 mt-2 w-[760px] rounded-[32px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]",
            )}
          >
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={handleRangeSelect}
              numberOfMonths={2}
              min={1}
              locale={ka}
              disabled={{ before: new Date() }}
              className="w-full rounded-md [--cell-size:40px]"
            />
            <div className="mt-6 flex items-center justify-between border-t border-[#E2E8F0] pt-6">
              <button
                type="button"
                onClick={() => setDateRange(undefined)}
                className="text-[14px] font-medium text-[#64748B] hover:text-[#1E293B]"
              >
                გასუფთავება
              </button>
              <button
                type="button"
                onClick={() => setActiveDropdown(null)}
                className="h-[44px] rounded-xl bg-[#E8612D] px-8 text-[14px] font-bold text-white hover:bg-[#D4551F]"
              >
                დადასტურება
              </button>
            </div>
          </div>
        );

        // Location — always floats from SearchBox (never portaled)
        const locationPanel = activeDropdown === "location" && (
          <LocationDropdown
            location={location}
            onSelect={(val) => {
              setLocation(val);
              setActiveDropdown(null);
            }}
          />
        );

        // Filters — portals when available
        const filtersPanel = activeDropdown === "filters" && (
          <FiltersDropdown
            filters={filters}
            onChange={setFilters}
            onApply={handleApplyFilters}
            onClear={() => setFilters(DEFAULT_FILTERS)}
            inline={usePortal}
          />
        );

        // Only calendar and filters use portal
        const portalPanel = calendarPanel || filtersPanel || null;
        let portalContent: React.ReactNode = null;
        if (portalPanel) {
          if (usePortal && dropdownPortalRef?.current) {
            // Portal is ready — render inside it
            portalContent = createPortal(
              portalPanel,
              dropdownPortalRef.current,
            );
          } else if (!dropdownPortalRef) {
            // No portal ref provided — render as absolute overlay
            portalContent = portalPanel;
          }
          // If portal ref provided but not ready yet → render nothing (wait for next frame)
        }

        return (
          <>
            {portalContent}
            {locationPanel}
          </>
        );
      })()}
    </form>
  );
}

// ─── Location Dropdown Component ─────────────────────────────────────
function LocationDropdown({
  location,
  onSelect,
  inline,
}: {
  location: string;
  onSelect: (val: string) => void;
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]",
        inline ? "w-full" : "absolute left-0 top-full z-50 mt-2 w-[480px]",
      )}
    >
      {ZONES.map((zone) => {
        const Icon = zone.icon;
        const isSelected = location === zone.value;
        return (
          <button
            key={zone.value}
            type="button"
            onClick={() => onSelect(zone.value)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors",
              isSelected ? "bg-[#F1F5F9]" : "hover:bg-[#F8FAFC]",
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9]">
              <Icon className="size-5 text-[#64748B]" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-bold leading-5 text-[#1E293B]">
                {zone.title}
              </div>
              <div className="text-[12px] leading-4 text-[#64748B]">
                {zone.description}
              </div>
            </div>
            {isSelected && <Check className="size-5 text-[#2563EB]" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Filters Dropdown Component ──────────────────────────────────────
function FiltersDropdown({
  filters,
  onChange,
  onApply,
  onClear,
  mobile,
  inline,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onApply: () => void;
  onClear: () => void;
  mobile?: boolean;
  inline?: boolean;
}) {
  const updateFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const toggleAmenity = (amenity: string) => {
    const next = filters.amenities.includes(amenity)
      ? filters.amenities.filter((a) => a !== amenity)
      : [...filters.amenities, amenity];
    updateFilter("amenities", next);
  };

  return (
    <div
      className={cn(
        "bg-white p-6 md:p-8",
        inline
          ? "w-full"
          : "absolute z-50 rounded-3xl border border-[#E2E8F0] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]",
        !inline &&
          (mobile
            ? "left-0 right-0 top-full mt-2"
            : "left-0 top-full mt-2 w-[700px]"),
      )}
    >
      <div
        className={cn("gap-8", mobile ? "flex flex-col" : "grid grid-cols-2")}
      >
        {/* ── Left column ── */}
        <div className="flex flex-col gap-6">
          {/* Price range */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              ფასი (ღამე)
            </span>
            <div className="mt-4">
              <div className="relative h-5">
                <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#F1F5F9]" />
                <div
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#2563EB]"
                  style={{
                    left: `${((filters.priceMin - 0) / 1000) * 100}%`,
                    right: `${100 - ((filters.priceMax - 0) / 1000) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={filters.priceMin}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val < filters.priceMax) updateFilter("priceMin", val);
                  }}
                  className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#2563EB] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
                />
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={filters.priceMax}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val > filters.priceMin) updateFilter("priceMax", val);
                  }}
                  className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#2563EB] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
                />
              </div>
              <div className="mt-5 flex gap-4">
                <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
                  <span className="text-[11px] font-bold text-[#94A3B8]">
                    MIN
                  </span>
                  <span className="text-[14px] font-extrabold text-[#0F172A]">
                    {filters.priceMin}
                  </span>
                  <span className="text-[12px] font-bold text-[#94A3B8]">
                    ₾
                  </span>
                </div>
                <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
                  <span className="text-[11px] font-bold text-[#94A3B8]">
                    MAX
                  </span>
                  <span className="text-[14px] font-extrabold text-[#0F172A]">
                    {filters.priceMax}
                  </span>
                  <span className="text-[12px] font-bold text-[#94A3B8]">
                    ₾
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bedrooms */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              საძინებლები
            </span>
            <div className="mt-4 flex flex-wrap gap-2">
              {BEDROOM_OPTIONS.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={filters.bedrooms === opt}
                  onClick={() =>
                    updateFilter(
                      "bedrooms",
                      filters.bedrooms === opt ? null : opt,
                    )
                  }
                />
              ))}
            </div>
          </div>

          {/* Bathrooms */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              სველი წერტილი
            </span>
            <div className="mt-4 flex flex-wrap gap-2">
              {BATHROOM_OPTIONS.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={filters.bathrooms === opt}
                  onClick={() =>
                    updateFilter(
                      "bathrooms",
                      filters.bathrooms === opt ? null : opt,
                    )
                  }
                />
              ))}
            </div>
          </div>

          {/* Floors */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              სართული
            </span>
            <div className="mt-4 flex flex-wrap gap-2">
              {FLOOR_OPTIONS.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={filters.floors === opt}
                  onClick={() =>
                    updateFilter("floors", filters.floors === opt ? null : opt)
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-6">
          {/* Capacity */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              თევადობა (სტუმრები)
            </span>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {CAPACITY_OPTIONS.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={filters.capacity === opt}
                  onClick={() =>
                    updateFilter(
                      "capacity",
                      filters.capacity === opt ? null : opt,
                    )
                  }
                />
              ))}
            </div>
          </div>

          {/* Verified only toggle */}
          <div className="flex items-center justify-between rounded-xl bg-[#F8FAFC] px-4 py-3">
            <div>
              <span className="text-[13px] font-extrabold text-[#0F172A]">
                მხოლოდ ვერიფიცირებული
              </span>
              <p className="text-[11px] font-medium text-[#94A3B8]">
                სანდო მესაკუთრეები
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateFilter("verifiedOnly", !filters.verifiedOnly)
              }
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                filters.verifiedOnly ? "bg-[#10B981]" : "bg-[#CBD5E1]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.05)] transition-transform",
                  filters.verifiedOnly ? "left-[22px]" : "left-0.5",
                )}
              />
            </button>
          </div>

          {/* Amenities */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              საბაზისო კომფორტი
            </span>
            <div className="mt-4 flex flex-wrap gap-2">
              {AMENITIES.map((a) => (
                <Chip
                  key={a}
                  label={a}
                  selected={filters.amenities.includes(a)}
                  onClick={() => toggleAmenity(a)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mt-8 flex items-center justify-between border-t border-[#EEF1F4] pt-6">
        <button
          type="button"
          onClick={onClear}
          className="text-[14px] font-bold text-[#64748B] hover:text-[#1E293B]"
        >
          გასუფთავება
        </button>
        <Button
          type="button"
          onClick={onApply}
          className="h-[47px] rounded-[12px] bg-[#2563EB] px-8 text-[14px] font-bold text-white shadow-[0px_4px_12px_rgba(37,99,235,0.2)] hover:bg-[#1D4ED8]"
        >
          შედეგების ჩვენება (142)
        </Button>
      </div>
    </div>
  );
}
