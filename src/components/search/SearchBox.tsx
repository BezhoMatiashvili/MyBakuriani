"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronDown,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateShort, getDateFnsLocale } from "@/lib/utils/format";
import { FALLBACK_ZONES, type Zone } from "@/lib/zones/types";
import { ZoneIcon } from "@/lib/zones/icon";
import { SkierLoader } from "@/components/shared/SkierLoader";
import BottomSheet from "@/components/shared/BottomSheet";
import NumberField from "@/components/shared/NumberField";
import {
  DEFAULT_RENT_FILTERS,
  RENT_PRICE_MAX,
  RENT_PRICE_MIN,
  normalizeRentFilters,
  type RentAdvancedFilters,
} from "@/lib/search/rentSearchQuery";

export interface SearchFilters {
  location: string;
  checkIn: string;
  checkOut: string;
  guests: number | "";
  keyword: string;
  advancedFilters: RentAdvancedFilters;
}

export type ActiveDropdown = "calendar" | "location" | "filters" | null;
type DateRange = { from: Date | undefined; to?: Date };

// Seeded zone slugs have display translations under Zones.<slug>; unknown
// (admin-created) zones fall back to their Georgian name_ka. Display only —
// submitted/compared zone values must stay name_ka (zone matching uses it).
const TRANSLATED_ZONE_SLUGS = new Set<string>(
  FALLBACK_ZONES.map((z) => z.slug),
);

const Calendar = dynamic(
  () => import("@/components/ui/calendar").then((mod) => mod.Calendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[308px] w-full items-center justify-center rounded-2xl bg-[#F1F5F9]">
        <SkierLoader variant="inline" />
      </div>
    ),
  },
);

interface SearchBoxProps {
  onSearch: (filters: SearchFilters) => void;
  className?: string;
  defaultLocation?: string;
  defaultGuests?: number | "";
  defaultKeyword?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  dropdownPortalRef?: React.RefObject<HTMLDivElement | null>;
  dropdownBoundaryRef?: React.RefObject<HTMLElement | null>;
  onActiveDropdownChange?: (active: ActiveDropdown) => void;
  isPending?: boolean;
  phoneLayout?: "default" | "landing-compact";
  zones: Zone[];
  advancedFilters?: RentAdvancedFilters;
}

// ─── Filter constants ────────────────────────────────────────────────
// Values are canonical; labels resolve from the SearchBox messages namespace.
const CAPACITY_OPTIONS = [
  { value: 2, labelKey: "guest2" },
  { value: 4, labelKey: "guest4" },
  { value: 6, labelKey: "guest6" },
  { value: 8, labelKey: "guest8plus" },
] as const;
const BEDROOM_OPTIONS = [1, 2, 3, 4] as const;
const BATHROOM_OPTIONS = [1, 2, 3] as const;
const AMENITIES = [
  { key: "wifi", labelKey: "wifi" },
  { key: "central_heating", labelKey: "centralHeating" },
  { key: "ski_storage", labelKey: "skiStorage" },
  { key: "tv", labelKey: "tv" },
  { key: "fireplace", labelKey: "fireplace" },
  { key: "parking", labelKey: "parking" },
  { key: "washing_machine", labelKey: "washingMachine" },
  { key: "full_kitchen", labelKey: "fullKitchen" },
] as const;

type FilterState = RentAdvancedFilters;
const DEFAULT_FILTERS = DEFAULT_RENT_FILTERS;

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveRangeSelection(
  range: DateRange | undefined,
  current: DateRange | undefined,
): DateRange | undefined {
  if (range?.from && !range.to && current?.from && current?.to) {
    const clicked = range.from;
    if (clicked > current.to) return { from: current.to, to: clicked };
    if (clicked < current.from) return { from: clicked, to: undefined };
  }
  return range;
}

function formatDisplayDate(value: Date, locale: string) {
  return formatDateShort(value, locale);
}

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
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 items-center justify-center rounded-lg border px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD] focus-visible:ring-offset-2",
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
  defaultKeyword = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  dropdownPortalRef,
  dropdownBoundaryRef,
  onActiveDropdownChange,
  isPending = false,
  phoneLayout = "default",
  zones,
  advancedFilters,
}: SearchBoxProps) {
  const t = useTranslations("SearchBox");
  const locale = useLocale();
  const dateFnsLocale = getDateFnsLocale(locale);
  const isLandingCompact = phoneLayout === "landing-compact";
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
  const [keyword, setKeyword] = useState(defaultKeyword);

  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [filters, setFilters] = useState<FilterState>(() =>
    normalizeRentFilters(advancedFilters),
  );
  const [filterDraft, setFilterDraft] = useState<FilterState | null>(null);
  const [dateDraft, setDateDraft] = useState<DateRange | undefined>();
  const [locationDraft, setLocationDraft] = useState<string | null>(null);

  useEffect(() => {
    setLocation(defaultLocation);
    setGuests(defaultGuests);
    setKeyword(defaultKeyword);
    if (!defaultCheckIn) {
      setDateRange(undefined);
      return;
    }
    setDateRange({
      from: new Date(`${defaultCheckIn}T00:00:00`),
      to: defaultCheckOut
        ? new Date(`${defaultCheckOut}T00:00:00`)
        : undefined,
    });
  }, [
    defaultCheckIn,
    defaultCheckOut,
    defaultGuests,
    defaultKeyword,
    defaultLocation,
  ]);

  useEffect(() => {
    if (advancedFilters) setFilters(normalizeRentFilters(advancedFilters));
  }, [advancedFilters]);

  const containerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Must match the lg: breakpoint below — the horizontal pill layout has no
    // room for 3 fields + keyword box + button until 1024px (at 768-1023px
    // the location field wraps mid-label).
    const check = () => setIsMobile(window.innerWidth < 1024);
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
      const eventPath = event.composedPath();

      const inContainer = containerRef.current?.contains(target);
      const inPortal = dropdownPortalRef?.current?.contains(target);
      const inBoundary = dropdownBoundaryRef?.current?.contains(target);

      const inContainerPath = containerRef.current
        ? eventPath.includes(containerRef.current)
        : false;
      const inPortalPath = dropdownPortalRef?.current
        ? eventPath.includes(dropdownPortalRef.current)
        : false;
      const inBoundaryPath = dropdownBoundaryRef?.current
        ? eventPath.includes(dropdownBoundaryRef.current)
        : false;

      const isInside =
        inContainer ||
        inPortal ||
        inBoundary ||
        inContainerPath ||
        inPortalPath ||
        inBoundaryPath;

      if (!isInside) {
        setActiveDropdown(null);
      }
    }
    // Phone sheets are rendered outside this form, so treating their controls
    // as an outside click would close the sheet before a filter/date can be
    // selected. Desktop popovers still use the normal outside-click behavior.
    if (activeDropdown && !isMobile) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [activeDropdown, dropdownPortalRef, dropdownBoundaryRef, isMobile]);

  // Track portal readiness — ref can appear one frame later when parent
  // conditionally mounts the portal container.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    if (
      !dropdownPortalRef ||
      activeDropdown === "location" ||
      !activeDropdown
    ) {
      setPortalReady(false);
      return;
    }

    let rafId: number | null = null;
    let cancelled = false;

    const waitForPortal = () => {
      if (cancelled) return;
      const ready = !!dropdownPortalRef.current;
      if (ready) {
        setPortalReady(true);
        return;
      }
      setPortalReady(false);
      rafId = requestAnimationFrame(waitForPortal);
    };

    waitForPortal();
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [dropdownPortalRef, activeDropdown]);
  const usePortal = portalReady;

  const toggleDropdown = useCallback(
    (name: ActiveDropdown) => {
      setActiveDropdown((prev) => {
        if (prev === name) return null;
        if (isMobile && name === "filters") {
          setFilterDraft(normalizeRentFilters(filters));
        }
        if (isMobile && name === "calendar") {
          setDateDraft(dateRange);
        }
        if (isMobile && name === "location") {
          setLocationDraft(location);
        }
        return name;
      });
    },
    [dateRange, filters, isMobile, location],
  );

  const closeMobileSheet = useCallback(() => {
    setActiveDropdown(null);
    setFilterDraft(null);
    setDateDraft(undefined);
    setLocationDraft(null);
  }, []);

  const handleRangeSelect = useCallback(
    (range: DateRange | undefined) => {
      setDateRange(resolveRangeSelection(range, dateRange));
    },
    [dateRange],
  );

  const handleDraftRangeSelect = useCallback(
    (range: DateRange | undefined) => {
      setDateDraft(resolveRangeSelection(range, dateDraft));
    },
    [dateDraft],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      location,
      checkIn: dateRange?.from ? toIsoDate(dateRange.from) : "",
      checkOut: dateRange?.to ? toIsoDate(dateRange.to) : "",
      guests,
      keyword,
      advancedFilters: filters,
    });
  };

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${formatDisplayDate(dateRange.from, locale)} - ${formatDisplayDate(dateRange.to, locale)}`
      : formatDisplayDate(dateRange.from, locale)
    : "";

  const applyFilters = (nextFilters: FilterState) => {
    const committed = normalizeRentFilters(nextFilters);
    const capacityGuests = committed.capacity ?? "";
    setFilters(committed);
    setGuests(capacityGuests);
    setActiveDropdown(null);
    onSearch({
      location,
      checkIn: dateRange?.from ? toIsoDate(dateRange.from) : "",
      checkOut: dateRange?.to ? toIsoDate(dateRange.to) : "",
      guests: capacityGuests,
      keyword,
      advancedFilters: committed,
    });
  };

  const handleApplyFilters = () => applyFilters(filters);
  const handleApplyFilterDraft = () => {
    if (!filterDraft) return;
    applyFilters(filterDraft);
    setFilterDraft(null);
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-phone-layout={phoneLayout}
      className={cn(
        "relative rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.15)]",
        "lg:flex lg:h-[80px] lg:items-center lg:overflow-visible lg:rounded-full lg:border-0 lg:p-2",
        className,
      )}
      ref={containerRef}
    >
      {/* ═══ Mobile/tablet: compact rows, 2×2 from 640px ═══ */}
      <div
        data-testid="search-mobile-layout"
        className={cn(
          "grid grid-cols-1 lg:hidden",
          isLandingCompact
            ? "gap-0 sm:grid-cols-2 sm:gap-3"
            : "gap-3 sm:grid-cols-2",
        )}
      >
        {/* Keyword search */}
        <div
          className={cn(
            "relative order-4 sm:col-span-2",
            isLandingCompact && "mt-[18px] sm:mt-0",
          )}
        >
          <label
            className={cn(
              "mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]",
              isLandingCompact && "sr-only sm:not-sr-only",
            )}
          >
            {t("keywordSearch")}
          </label>
          <div
            className={cn(
              "flex",
              isLandingCompact &&
                "h-12 overflow-hidden rounded-xl bg-[#F8FAFC] sm:h-auto sm:overflow-visible sm:rounded-none sm:bg-transparent",
            )}
          >
            <div className="relative min-w-0 flex-1">
              <Search
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]",
                  isLandingCompact && "left-3.5 size-5 sm:left-3 sm:size-4",
                )}
              />
              <input
                type="text"
                placeholder={t("keywordPlaceholder")}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className={cn(
                  "h-11 w-full rounded-l-xl border border-r-0 border-[#E2E8F0] bg-white pl-9 pr-3 text-base text-[#1E293B] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB]",
                  isLandingCompact &&
                    "h-12 rounded-none border-0 bg-transparent pl-10 focus:bg-transparent sm:h-11 sm:rounded-l-xl sm:border sm:border-r-0 sm:border-[#E2E8F0] sm:bg-white sm:pl-9",
                )}
              />
            </div>
            <Button
              type="submit"
              disabled={isPending}
              aria-label={t("search")}
              className={cn(
                "h-11 min-w-11 shrink-0 gap-2 rounded-l-none rounded-r-xl bg-brand-accent px-4 text-white hover:bg-brand-accent-hover disabled:opacity-70",
                isLandingCompact &&
                  "my-0.5 mr-0.5 size-11 gap-0 rounded-[10px] px-0 sm:m-0 sm:h-11 sm:w-auto sm:rounded-l-none sm:rounded-r-xl sm:px-4",
              )}
            >
              {isPending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Search className="size-4" />
              )}
              <span
                className={cn(
                  "hidden",
                  isLandingCompact ? "sm:inline" : "min-[360px]:inline",
                )}
              >
                {t("search")}
              </span>
            </Button>
          </div>
        </div>

        {/* Location */}
        <div
          className={cn(
            "relative order-2",
            isLandingCompact &&
              "flex h-[69px] flex-col justify-center border-b border-[#E2E8F0] sm:block sm:h-auto sm:border-0",
          )}
        >
          <label
            className={cn(
              "mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]",
              isLandingCompact && "text-center text-[#5B4A42] sm:text-left sm:text-[#94A3B8]",
            )}
          >
            {t("location")}
          </label>
          <button
            type="button"
            onClick={() => toggleDropdown("location")}
            aria-haspopup={isMobile ? "dialog" : "listbox"}
            aria-expanded={activeDropdown === "location"}
            data-testid="search-mobile-location"
            className={cn(
              "flex h-11 w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 text-left text-sm outline-none lg:h-10",
              isLandingCompact &&
                "rounded-none border-0 bg-transparent px-0 sm:rounded-lg sm:border sm:border-[#E2E8F0] sm:bg-white sm:px-3",
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              {isLandingCompact && (
                <MapPin className="size-5 shrink-0 text-[#5B4A42] sm:hidden" />
              )}
              <span
                className={cn(
                  "truncate",
                  location ? "text-[#1E293B]" : "text-[#94A3B8]",
                )}
              >
                {location || t("locationPlaceholder")}
              </span>
            </span>
            <ChevronDown className="size-4 text-[#94A3B8]" />
          </button>
        </div>

        {/* Date Range Picker */}
        <div
          className={cn(
            "relative order-1",
            isLandingCompact &&
              "flex h-[69px] flex-col justify-center border-b border-[#E2E8F0] sm:block sm:h-auto sm:border-0",
          )}
        >
          <label
            className={cn(
              "mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]",
              isLandingCompact && "text-center text-[#5B4A42] sm:text-left sm:text-[#94A3B8]",
            )}
          >
            {t("date")}
          </label>
          <button
            type="button"
            onClick={() => toggleDropdown("calendar")}
            data-testid="search-mobile-dates"
            aria-haspopup={isMobile ? "dialog" : undefined}
            aria-expanded={activeDropdown === "calendar"}
            className={cn(
              "flex h-11 w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 text-left text-sm outline-none lg:h-10",
              isLandingCompact &&
                "rounded-none border-0 bg-transparent px-0 sm:rounded-lg sm:border sm:border-[#E2E8F0] sm:bg-white sm:px-3",
              !dateLabel && "text-[#94A3B8]",
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              {isLandingCompact && (
                <CalendarDays className="size-5 shrink-0 text-[#5B4A42] sm:hidden" />
              )}
              <span className="truncate">{dateLabel || t("selectDate")}</span>
            </span>
            {isLandingCompact && (
              <ChevronDown className="size-4 shrink-0 text-[#5B4A42] sm:hidden" />
            )}
          </button>
        </div>

        {/* Filters */}
        <div
          className={cn(
            "relative order-3",
            isLandingCompact &&
              "flex h-[69px] flex-col justify-center border-b border-[#E2E8F0] sm:block sm:h-auto sm:border-0",
          )}
        >
          <label
            className={cn(
              "mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]",
              isLandingCompact && "text-center text-[#5B4A42] sm:text-left sm:text-[#94A3B8]",
            )}
          >
            {t("filters")}
          </label>
          <button
            type="button"
            onClick={() => toggleDropdown("filters")}
            data-testid="search-mobile-filters"
            aria-haspopup={isMobile ? "dialog" : undefined}
            aria-expanded={activeDropdown === "filters"}
            className={cn(
              "flex h-11 w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 text-left text-sm text-[#94A3B8] outline-none lg:h-10",
              isLandingCompact &&
                "rounded-none border-0 bg-transparent px-0 text-[#5B4A42] sm:rounded-lg sm:border sm:border-[#E2E8F0] sm:bg-white sm:px-3 sm:text-[#94A3B8]",
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              {isLandingCompact && (
                <SlidersHorizontal className="size-5 shrink-0 text-[#5B4A42] sm:hidden" />
              )}
              <span className="truncate">{t("priceCapacity")}</span>
            </span>
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      {/* ═══ Desktop: horizontal pill layout ═══ */}
      <div className="hidden flex-1 items-center lg:flex">
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
            {t("dates")}
          </span>
          <button
            type="button"
            onClick={() => toggleDropdown("calendar")}
            data-testid="search-desktop-dates"
            className={cn(
              "text-left text-[15px] font-bold leading-[22px]",
              activeDropdown === "calendar"
                ? "text-[#2563EB]"
                : dateLabel
                  ? "text-[#1E293B]"
                  : "text-[#94A3B8]",
            )}
          >
            {dateLabel || t("selectDate")}
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
            {t("locationZone")}
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
            {location || t("zones.didveli")}
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
            {t("filters")}
          </span>
          <button
            type="button"
            onClick={() => toggleDropdown("filters")}
            data-testid="search-desktop-filters"
            className={cn(
              "flex w-full items-center gap-1 text-left text-[15px] font-bold leading-[22px] outline-none",
              activeDropdown === "filters"
                ? "text-[#2563EB]"
                : "text-[#94A3B8]",
            )}
          >
            {t("priceCapacity")}
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

        {/* Keyword field (site-wide fuzzy search) */}
        <div className="flex h-[61.5px] items-center justify-center px-2">
          <div className="relative w-[180px] lg:w-[260px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              placeholder={t("keywordSearchShort")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-[45.5px] w-full rounded-full border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-5 text-[13px] font-medium text-[#1E293B] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white"
            />
          </div>
        </div>

        {/* Search button */}
        <Button
          type="submit"
          disabled={isPending}
          className="ml-2 size-[34px] shrink-0 rounded-full bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-70"
        >
          {isPending ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Search className="size-4" />
          )}
        </Button>
      </div>

      {/* ═══ DROPDOWNS ═══ */}
      {(() => {
        if (isMobile) {
          const mobileFooter =
            activeDropdown === "filters" ? (
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setFilterDraft(normalizeRentFilters(DEFAULT_FILTERS))
                  }
                  data-testid="mobile-filter-reset"
                  className="min-h-11 flex-1 rounded-xl"
                >
                  {t("clear")}
                </Button>
                <Button
                  type="button"
                  onClick={handleApplyFilterDraft}
                  data-testid="mobile-filter-apply"
                  className="min-h-11 flex-[1.4] rounded-xl bg-[#2563EB] text-white shadow-[0px_4px_12px_rgba(37,99,235,0.2)] hover:bg-[#1D4ED8]"
                >
                  {t("showResults")}
                </Button>
              </div>
            ) : activeDropdown === "calendar" ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDateDraft(undefined)}
                  data-testid="mobile-calendar-clear"
                  className="min-h-11 px-3 text-[#64748B]"
                >
                  {t("clear")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setDateRange(dateDraft);
                    closeMobileSheet();
                  }}
                  data-testid="mobile-calendar-confirm"
                  className="min-h-11 rounded-xl bg-[#E8612D] px-6 text-white hover:bg-[#D4551F]"
                >
                  {t("confirm")}
                </Button>
              </div>
            ) : activeDropdown === "location" ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLocationDraft("")}
                  data-testid="mobile-location-clear"
                  className="min-h-11 px-3 text-[#64748B]"
                >
                  {t("clear")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setLocation(locationDraft ?? "");
                    closeMobileSheet();
                  }}
                  data-testid="mobile-location-confirm"
                  className="min-h-11 rounded-xl bg-[#2563EB] px-6 text-white hover:bg-[#1D4ED8]"
                >
                  {t("confirm")}
                </Button>
              </div>
            ) : undefined;

          return (
            <BottomSheet
              isOpen={activeDropdown !== null}
              onClose={closeMobileSheet}
              title={
                activeDropdown === "filters"
                  ? t("filters")
                  : activeDropdown === "location"
                    ? t("location")
                    : t("date")
              }
              footer={mobileFooter}
              contentClassName={cn(
                activeDropdown === "calendar" && "px-0 py-3",
                activeDropdown === "location" && "p-2",
                activeDropdown === "filters" && "p-4 sm:p-5",
              )}
            >
              {activeDropdown === "filters" && filterDraft && (
                <FiltersDropdown
                  filters={filterDraft}
                  onChange={setFilterDraft}
                  onApply={handleApplyFilterDraft}
                  onClear={() =>
                    setFilterDraft(normalizeRentFilters(DEFAULT_FILTERS))
                  }
                  mobile
                  sheet
                />
              )}
              {activeDropdown === "calendar" && (
                <Calendar
                  mode="range"
                  selected={dateDraft}
                  onSelect={handleDraftRangeSelect}
                  numberOfMonths={1}
                  min={1}
                  locale={dateFnsLocale}
                  disabled={{ before: new Date() }}
                  showOutsideDays={false}
                  className="mx-auto w-full max-w-[324px] rounded-md bg-white [--cell-size:44px]"
                />
              )}
              {activeDropdown === "location" && (
                <LocationDropdown
                  location={locationDraft ?? location}
                  onSelect={setLocationDraft}
                  zones={zones}
                  sheet
                />
              )}
            </BottomSheet>
          );
        }

        const calendarPanel = activeDropdown === "calendar" && (
          <div
            data-testid="search-desktop-calendar-panel"
            className={cn(
              usePortal
                ? "w-full overflow-x-auto rounded-[32px] border border-[#E2E8F0] bg-white p-8 shadow-[var(--shadow-category-nav)]"
                : "absolute left-0 top-full z-50 mt-2 w-[calc(100vw-2rem)] md:w-[760px] md:max-w-[calc(100vw-3rem)] rounded-[32px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]",
            )}
          >
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={handleRangeSelect}
              numberOfMonths={2}
              showOutsideDays={false}
              min={1}
              locale={dateFnsLocale}
              disabled={{ before: new Date() }}
              className="w-full rounded-md bg-white [--cell-size:40px]"
            />
            <div className="mt-6 flex items-center justify-between border-t border-[#E2E8F0] pt-6">
              <button
                type="button"
                onClick={() => setDateRange(undefined)}
                className="text-[14px] font-medium text-[#64748B] hover:text-[#1E293B]"
              >
                {t("clear")}
              </button>
              <button
                type="button"
                onClick={() => setActiveDropdown(null)}
                className="h-[44px] rounded-xl bg-[#E8612D] px-8 text-[14px] font-bold text-white hover:bg-[#D4551F]"
              >
                {t("confirm")}
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
            zones={zones}
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
          } else {
            // Portal target not ready yet — render inline fallback
            portalContent = portalPanel;
          }
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
  zones,
  sheet,
}: {
  location: string;
  onSelect: (val: string) => void;
  inline?: boolean;
  zones: Zone[];
  sheet?: boolean;
}) {
  const t = useTranslations("SearchBox");
  const tZones = useTranslations("Zones");
  return (
    <div
      role="listbox"
      aria-label={t("locationOptions")}
      className={cn(
        "rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]",
        sheet
          ? "w-full rounded-none border-0 p-0 shadow-none"
          : inline
          ? "w-full"
          : "absolute left-0 top-full z-50 mt-2 w-[calc(100vw-2rem)] md:w-[480px]",
      )}
    >
      {zones.map((zone) => {
        const isSelected = location === zone.name_ka;
        return (
          <button
            key={zone.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(zone.name_ka)}
            className={cn(
              "flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD] sm:px-4",
              isSelected ? "bg-[#F1F5F9]" : "hover:bg-[#F8FAFC]",
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9]">
              <ZoneIcon icon={zone.icon} className="size-5 text-[#64748B]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold leading-5 text-[#1E293B]">
                {TRANSLATED_ZONE_SLUGS.has(zone.slug)
                  ? tZones(`${zone.slug}.name`)
                  : zone.name_ka}
              </div>
              <div className="mt-0.5 line-clamp-2 break-words text-[12px] leading-4 text-[#64748B]">
                {TRANSLATED_ZONE_SLUGS.has(zone.slug)
                  ? tZones(`${zone.slug}.description`)
                  : zone.description_ka}
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
  sheet,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onApply: () => void;
  onClear: () => void;
  mobile?: boolean;
  inline?: boolean;
  sheet?: boolean;
}) {
  const t = useTranslations("SearchBox");
  const minPriceId = useId();
  const maxPriceId = useId();
  const [priceMinInput, setPriceMinInput] = useState(
    String(filters.priceMin),
  );
  const [priceMaxInput, setPriceMaxInput] = useState(
    String(filters.priceMax),
  );

  useEffect(() => setPriceMinInput(String(filters.priceMin)), [filters.priceMin]);
  useEffect(() => setPriceMaxInput(String(filters.priceMax)), [filters.priceMax]);

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

  const updatePriceInput = (
    key: "priceMin" | "priceMax",
    raw: string,
  ) => {
    if (key === "priceMin") setPriceMinInput(raw);
    else setPriceMaxInput(raw);
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const value =
      key === "priceMin"
        ? Math.max(RENT_PRICE_MIN, Math.min(parsed, filters.priceMax - 1))
        : Math.min(RENT_PRICE_MAX, Math.max(parsed, filters.priceMin + 1));
    updateFilter(key, value);
  };

  const normalizePriceInput = (
    key: "priceMin" | "priceMax",
    raw: string,
  ) => {
    const fallback = key === "priceMin" ? RENT_PRICE_MIN : RENT_PRICE_MAX;
    const parsed = raw ? Number(raw) : fallback;
    const value =
      key === "priceMin"
        ? Math.max(
            RENT_PRICE_MIN,
            Math.min(Number.isFinite(parsed) ? parsed : fallback, filters.priceMax - 1),
          )
        : Math.min(
            RENT_PRICE_MAX,
            Math.max(Number.isFinite(parsed) ? parsed : fallback, filters.priceMin + 1),
          );
    if (key === "priceMin") setPriceMinInput(String(value));
    else setPriceMaxInput(String(value));
    updateFilter(key, value);
  };

  return (
    <div
      data-testid={
        sheet
          ? "search-mobile-filter-panel"
          : inline
            ? "search-desktop-filter-panel"
            : undefined
      }
      className={cn(
        "bg-white p-4 sm:p-6 md:p-8",
        sheet && "p-0",
        sheet || inline
          ? "w-full"
          : "absolute z-50 rounded-3xl border border-[#E2E8F0] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]",
        !inline && !sheet &&
          (mobile
            ? "left-0 right-0 top-full mt-2"
            : "left-0 top-full mt-2 w-[700px]"),
      )}
    >
      <div
        className={cn(
          mobile
            ? "grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6"
            : "grid grid-cols-2 gap-8",
        )}
      >
        {/* ── Left column ── */}
        <div className={cn("flex flex-col", mobile ? "gap-5" : "gap-6")}>
          {/* Price range */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              {t("pricePerNight")}
            </span>
            <div className="mt-4">
              <div className="relative h-11">
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
                  aria-label={t("minimumPrice")}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val < filters.priceMax) updateFilter("priceMin", val);
                  }}
                  className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent focus-visible:outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#2563EB] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#2563EB] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
                />
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={filters.priceMax}
                  aria-label={t("maximumPrice")}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val > filters.priceMin) updateFilter("priceMax", val);
                  }}
                  className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent focus-visible:outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#2563EB] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#2563EB] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label htmlFor={minPriceId} className="min-w-0">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-[#94A3B8]">
                    {t("min")}
                  </span>
                  <NumberField
                    id={minPriceId}
                    value={priceMinInput}
                    onChange={(value) => updatePriceInput("priceMin", value)}
                    onBlur={(value) => normalizePriceInput("priceMin", value)}
                    integer
                    min={RENT_PRICE_MIN}
                    max={filters.priceMax - 1}
                    suffix="₾"
                    className="h-11 rounded-lg bg-[#F8FAFC] px-3 font-extrabold"
                  />
                </label>
                <label htmlFor={maxPriceId} className="min-w-0">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-[#94A3B8]">
                    {t("max")}
                  </span>
                  <NumberField
                    id={maxPriceId}
                    value={priceMaxInput}
                    onChange={(value) => updatePriceInput("priceMax", value)}
                    onBlur={(value) => normalizePriceInput("priceMax", value)}
                    integer
                    min={filters.priceMin + 1}
                    max={RENT_PRICE_MAX}
                    suffix="₾"
                    className="h-11 rounded-lg bg-[#F8FAFC] px-3 font-extrabold"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Bedrooms */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              {t("bedrooms")}
            </span>
            <div className="mt-4 flex flex-wrap gap-2">
              {BEDROOM_OPTIONS.map((opt) => (
                <Chip
                  key={opt}
                  label={opt === 4 ? "4+" : String(opt)}
                  selected={
                    filters.bedrooms !== null &&
                    (opt === 4
                      ? filters.bedrooms >= 4
                      : filters.bedrooms === opt)
                  }
                  onClick={() =>
                    updateFilter(
                      "bedrooms",
                      filters.bedrooms !== null &&
                        (opt === 4
                          ? filters.bedrooms >= 4
                          : filters.bedrooms === opt)
                        ? null
                        : opt,
                    )
                  }
                />
              ))}
            </div>
          </div>

          {/* Bathrooms */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              {t("bathrooms")}
            </span>
            <div className="mt-4 flex flex-wrap gap-2">
              {BATHROOM_OPTIONS.map((opt) => (
                <Chip
                  key={opt}
                  label={opt === 3 ? "3+" : String(opt)}
                  selected={
                    filters.bathrooms !== null &&
                    (opt === 3
                      ? filters.bathrooms >= 3
                      : filters.bathrooms === opt)
                  }
                  onClick={() =>
                    updateFilter(
                      "bathrooms",
                      filters.bathrooms !== null &&
                        (opt === 3
                          ? filters.bathrooms >= 3
                          : filters.bathrooms === opt)
                        ? null
                        : opt,
                    )
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className={cn("flex flex-col", mobile ? "gap-5" : "gap-6")}>
          {/* Capacity */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              {t("capacityGuests")}
            </span>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {CAPACITY_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={t(opt.labelKey)}
                  selected={
                    filters.capacity !== null &&
                    (opt.value === 8
                      ? filters.capacity >= 8
                      : filters.capacity === opt.value)
                  }
                  onClick={() =>
                    updateFilter(
                      "capacity",
                      filters.capacity !== null &&
                        (opt.value === 8
                          ? filters.capacity >= 8
                          : filters.capacity === opt.value)
                        ? null
                        : opt.value,
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
                {t("verifiedOnly")}
              </span>
              <p className="text-[11px] font-medium text-[#94A3B8]">
                {t("trustedOwners")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={filters.verifiedOnly}
              aria-label={t("verifiedOnly")}
              onClick={() =>
                updateFilter("verifiedOnly", !filters.verifiedOnly)
              }
              className="relative h-11 w-12 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD] focus-visible:ring-offset-2"
            >
              <span
                className={cn(
                  "absolute inset-x-0 top-2.5 h-6 rounded-full transition-colors",
                  filters.verifiedOnly ? "bg-[#10B981]" : "bg-[#CBD5E1]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.12)] transition-transform",
                    filters.verifiedOnly ? "left-[26px]" : "left-0.5",
                  )}
                />
              </span>
            </button>
          </div>

          {/* Amenities */}
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#64748B]">
              {t("basicComfort")}
            </span>
            <div className="mt-4 flex flex-wrap gap-2">
              {AMENITIES.map((a) => (
                <Chip
                  key={a.key}
                  label={t(`amenities.${a.labelKey}`)}
                  selected={filters.amenities.includes(a.key)}
                  onClick={() => toggleAmenity(a.key)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      {!sheet && <div className="mt-8 flex items-center justify-between border-t border-[#EEF1F4] pt-6">
        <button
          type="button"
          onClick={onClear}
          data-testid={sheet ? "mobile-filter-reset" : undefined}
          className={cn(
            "text-[14px] font-bold text-[#64748B] hover:text-[#1E293B]",
            sheet && "min-h-11 px-2",
          )}
        >
          {t("clear")}
        </button>
        <Button
          type="button"
          onClick={onApply}
          data-testid={sheet ? "mobile-filter-apply" : undefined}
          className="min-h-11 rounded-[12px] bg-[#2563EB] px-8 text-[14px] font-bold text-white shadow-[0px_4px_12px_rgba(37,99,235,0.2)] hover:bg-[#1D4ED8]"
        >
          {t("showResults")}
        </Button>
      </div>}
    </div>
  );
}
