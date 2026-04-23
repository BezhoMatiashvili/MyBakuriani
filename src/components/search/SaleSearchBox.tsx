"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronDown,
  Check,
  Home,
  Map as MapIcon,
  SlidersHorizontal,
  BedDouble,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SEARCH_LOCATION_ZONES } from "@/lib/constants/locations";

// ─── Types ─────────────────────────────────────────────────────────────

export interface SaleSearchFilters {
  location: string;
  propertyType: string;
  propertyTypes: string[];
  priceMin: number;
  priceMax: number;
  cadastralCode: string;
  statuses: string[];
  rooms: number[];
  areaMin: number;
  areaMax: number;
  amenities: string[];
  payment: string[];
  developers: string[];
  // Investment-mode quick filters (from the 4-dropdown row):
  roiMin: number | null; // 5 | 8 | 10 | null
  constructionStatus: string | null; // "completed" | "under_construction" | null
  renovationStatus: string | null; // "black_frame" | "white_frame" | "furnished" | null
}

type SaleTab = "search" | "appraise";

type SaleActiveDropdown =
  | "type"
  | "rooms"
  | "filters"
  | "roi"
  | "area"
  | "status"
  | "renovation"
  | "zone"
  | null;

interface SaleSearchBoxProps {
  onSearch: (filters: SaleSearchFilters) => void;
  className?: string;
  isPending?: boolean;
  showInvestmentFilters?: boolean;
}

// ─── Option constants ──────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: "apartment", label: "საცხოვრებელი ბინა" },
  { value: "studio", label: "სტუდიო" },
  { value: "villa", label: "ვილა" },
  { value: "cottage", label: "ქოხი" },
  { value: "hotel", label: "სასტუმრო" },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "new", label: "ახალი" },
  { value: "progress", label: "მიმდინარე" },
  { value: "ready", label: "მზადი" },
];

const PAYMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "cash", label: "ნაღდი" },
  { value: "installment", label: "განვადება" },
  { value: "mortgage", label: "იპოთეკა" },
];

const ROOM_OPTIONS = [1, 2, 3, 4] as const;

const AMENITY_CHIPS: Array<{ value: string; label: string }> = [
  { value: "აივანი", label: "აივანი" },
  { value: "ფარდული", label: "ფარდული" },
  { value: "წყალი", label: "წყალი" },
  { value: "გაზი", label: "გაზი" },
  { value: "ავეჯი", label: "ავეჯი" },
];

const DEVELOPER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Moritori Gardens", label: "Moritori Gardens" },
  { value: "Crystal Resort", label: "Crystal Resort" },
  { value: "Mountain Dev Group", label: "Mountain Dev Group" },
  { value: "Bakuriani Invest", label: "Bakuriani Invest" },
];

// Investment quick-filter options (from Figma)
const ROI_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "მნიშვნელობა არ აქვს" },
  { value: 5, label: "5% - დან" },
  { value: 8, label: "8% - დან" },
  { value: 10, label: "10% - დან" },
];

type AreaBucket = "20-40" | "40-70" | "70+" | null;
const AREA_OPTIONS: Array<{ value: AreaBucket; label: string }> = [
  { value: null, label: "ნებისმიერი" },
  { value: "20-40", label: "20-40 მ²" },
  { value: "40-70", label: "40-70 მ²" },
  { value: "70+", label: "70+ მ²" },
];

function areaBucketToRange(b: AreaBucket): { min: number; max: number } {
  switch (b) {
    case "20-40":
      return { min: 20, max: 40 };
    case "40-70":
      return { min: 40, max: 70 };
    case "70+":
      return { min: 70, max: 500 };
    default:
      return { min: 0, max: 500 };
  }
}

const CONSTRUCTION_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: null, label: "ყველა" },
  { value: "completed", label: "მზა (დასრულებული)" },
  { value: "under_construction", label: "მშენებარე" },
];

const RENOVATION_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: null, label: "ნებისმიერი" },
  { value: "black_frame", label: "შავი კარკასი" },
  { value: "white_frame", label: "თეთრი/მწვანე კარკასი" },
  { value: "furnished", label: "გარემონტებული ავეჯით" },
];

const APPRAISAL_ZONES = SEARCH_LOCATION_ZONES;

const PRICE_MIN = 0;
const PRICE_MAX = 1_000_000;
const PRICE_STEP = 5_000;
const DEFAULT_PRICE_MIN = 30_000;
const DEFAULT_PRICE_MAX = 500_000;

const AREA_MIN = 0;
const AREA_MAX_SLIDER = 500;
const AREA_STEP = 5;
const DEFAULT_AREA_MIN = 0;
const DEFAULT_AREA_MAX = 500;

function formatUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

// ─── Component ─────────────────────────────────────────────────────────

export function SaleSearchBox({
  onSearch,
  className,
  isPending = false,
  showInvestmentFilters = true,
}: SaleSearchBoxProps) {
  const router = useRouter();

  // Tabs
  const [tab, setTab] = useState<SaleTab>("search");

  // Existing filter state
  const [propertyType, setPropertyType] = useState("");
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [cadastralCode, setCadastralCode] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [rooms, setRooms] = useState<number[]>([]);
  const [areaMin, setAreaMin] = useState(DEFAULT_AREA_MIN);
  const [areaMax, setAreaMax] = useState(DEFAULT_AREA_MAX);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [payment, setPayment] = useState<string[]>([]);
  const [developers, setDevelopers] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(true);

  // Investment quick filters
  const [roiMin, setRoiMin] = useState<number | null>(null);
  const [areaBucket, setAreaBucket] = useState<AreaBucket>(null);
  const [constructionStatus, setConstructionStatus] = useState<string | null>(
    null,
  );
  const [renovationStatus, setRenovationStatus] = useState<string | null>(null);

  // Appraisal tab state
  const [appraisalZone, setAppraisalZone] = useState("");
  const [appraisalArea, setAppraisalArea] = useState("");

  const [activeDropdown, setActiveDropdown] =
    useState<SaleActiveDropdown>(null);

  const containerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!activeDropdown) return;
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeDropdown]);

  const toggleDropdown = useCallback((name: SaleActiveDropdown) => {
    setActiveDropdown((prev) => (prev === name ? null : name));
  }, []);

  const togglePropertyType = useCallback((value: string) => {
    setPropertyTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  const toggleRoomQuick = useCallback((value: number) => {
    setRooms((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value],
    );
  }, []);

  const resetFilters = useCallback(() => {
    setPropertyTypes([]);
    setPriceMin("");
    setPriceMax("");
    setCadastralCode("");
    setStatuses([]);
    setRooms([]);
    setAreaMin(DEFAULT_AREA_MIN);
    setAreaMax(DEFAULT_AREA_MAX);
    setAmenities([]);
    setPayment([]);
    setDevelopers([]);
  }, []);

  const priceMinNum = priceMin ? Number(priceMin) || DEFAULT_PRICE_MIN : 0;
  const priceMaxNum = priceMax
    ? Number(priceMax) || DEFAULT_PRICE_MAX
    : PRICE_MAX;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "appraise") {
      // Appraisal CTA → send user to the appraisal placeholder route with
      // their inputs so a future /sales/appraisal page can pick them up.
      const params = new URLSearchParams();
      if (appraisalZone) params.set("zone", appraisalZone);
      if (appraisalArea) params.set("area", appraisalArea);
      router.push(`/sales/appraisal?${params.toString()}`);
      return;
    }

    // Translate the bucket into explicit min/max that the backend understands.
    const bucketRange = areaBucketToRange(areaBucket);
    const resolvedAreaMin = areaBucket ? bucketRange.min : areaMin;
    const resolvedAreaMax = areaBucket ? bucketRange.max : areaMax;

    onSearch({
      location: "",
      propertyType,
      propertyTypes,
      priceMin: priceMinNum,
      priceMax: priceMaxNum,
      cadastralCode,
      statuses,
      rooms,
      areaMin: resolvedAreaMin,
      areaMax: resolvedAreaMax,
      amenities,
      payment,
      developers,
      roiMin,
      constructionStatus,
      renovationStatus,
    });
  };

  const propertyTypeLabel =
    PROPERTY_TYPES.find((t) => t.value === propertyType)?.label || "ნებისმიერი";
  const roomsLabel =
    rooms.length === 0
      ? "ყველა"
      : rooms
          .slice()
          .sort((a, b) => a - b)
          .map((n) => (n === 4 ? "4+" : String(n)))
          .join(", ");

  const roiLabel =
    ROI_OPTIONS.find((o) => o.value === roiMin)?.label ?? "მნიშვნელობა არ აქვს";
  const areaLabel =
    AREA_OPTIONS.find((o) => o.value === areaBucket)?.label ?? "ნებისმიერი";
  const constructionLabel =
    CONSTRUCTION_OPTIONS.find((o) => o.value === constructionStatus)?.label ??
    "ყველა";
  const renovationLabel =
    RENOVATION_OPTIONS.find((o) => o.value === renovationStatus)?.label ??
    "ნებისმიერი";

  const activeFilterCount =
    propertyTypes.length +
    (priceMin || priceMax ? 1 : 0) +
    (cadastralCode ? 1 : 0) +
    statuses.length +
    rooms.length +
    (areaMin !== DEFAULT_AREA_MIN || areaMax !== DEFAULT_AREA_MAX ? 1 : 0) +
    amenities.length +
    payment.length +
    developers.length;

  const appraisalZoneLabel = appraisalZone || "აირჩიე ზონა";

  return (
    <form
      onSubmit={handleSubmit}
      ref={containerRef}
      className={cn(
        "relative rounded-[24px] bg-white p-4 text-left shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.2)]",
        "md:p-5",
        className,
      )}
    >
      {/* ═══ Tab row ═══ */}
      <div className="mb-4 flex items-center gap-6 border-b border-[#F1F5F9] px-2">
        <TabButton
          active={tab === "search"}
          onClick={() => {
            setTab("search");
            setActiveDropdown(null);
          }}
        >
          ყიდვა / ძიება
        </TabButton>
        <TabButton
          active={tab === "appraise"}
          onClick={() => {
            setTab("appraise");
            setActiveDropdown(null);
          }}
        >
          გაყიდვა / შეფასება
        </TabButton>
      </div>

      {tab === "search" ? (
        <>
          {/* ═══ Mobile: stacked ═══ */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            <MobileField
              label="ტიპი"
              value={propertyTypeLabel}
              onClick={() => toggleDropdown("type")}
              open={activeDropdown === "type"}
            >
              <TypeList
                value={propertyType}
                onSelect={(v) => {
                  setPropertyType(v);
                  setActiveDropdown(null);
                }}
              />
            </MobileField>

            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                ფასი
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Min"
                  value={priceMin}
                  onChange={(e) =>
                    setPriceMin(e.target.value.replace(/\D/g, ""))
                  }
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none placeholder:text-[#94A3B8]"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Max"
                  value={priceMax}
                  onChange={(e) =>
                    setPriceMax(e.target.value.replace(/\D/g, ""))
                  }
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none placeholder:text-[#94A3B8]"
                />
              </div>
            </div>

            <MobileField
              label="ოთახები"
              value={roomsLabel}
              onClick={() => toggleDropdown("rooms")}
              open={activeDropdown === "rooms"}
            >
              <div className="flex flex-wrap gap-2 p-2">
                {ROOM_OPTIONS.map((n) => {
                  const checked = rooms.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleRoomQuick(n)}
                      className={cn(
                        "h-9 min-w-9 rounded-full border px-3 text-[12px] font-bold transition-colors",
                        checked
                          ? "border-[#16A34A] bg-[#16A34A] text-white"
                          : "border-[#E2E8F0] bg-white text-[#1E293B]",
                      )}
                    >
                      {n === 4 ? "4+" : String(n)}
                    </button>
                  );
                })}
              </div>
            </MobileField>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleDropdown("filters")}
                className={cn(
                  "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[13px] font-bold text-[#1E293B] transition-colors",
                  activeDropdown === "filters" &&
                    "border-[#16A34A] text-[#16A34A]",
                )}
              >
                <SlidersHorizontal className="size-3.5" />
                დეტალურად
                {activeFilterCount > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#16A34A] text-[10px] font-black text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowMap((m) => !m)}
                className={cn(
                  "flex h-10 items-center justify-center gap-1.5 rounded-lg border px-4 text-[13px] font-bold transition-colors",
                  showMap
                    ? "border-[#16A34A] bg-[#F0FDF4] text-[#16A34A]"
                    : "border-[#E2E8F0] bg-white text-[#1E293B]",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    showMap ? "bg-[#16A34A]" : "bg-[#CBD5E1]",
                  )}
                />
                <MapIcon className="size-3.5" />
                რუკა
              </button>
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="h-11 gap-2 bg-[#0A1F2E] px-6 text-white hover:bg-[#0F2A40] disabled:opacity-70"
            >
              <Search className="size-4" />
              ძებნა
            </Button>
          </div>

          {/* ═══ Desktop: horizontal pill ═══ */}
          <div className="hidden items-center gap-1 md:flex">
            <DesktopField
              label="ტიპი"
              value={propertyTypeLabel}
              icon={<Home className="size-4 text-[#94A3B8]" />}
              active={activeDropdown === "type"}
              onClick={() => toggleDropdown("type")}
            />

            <div className="h-10 w-px bg-[#F1F5F9]" />

            <div className="flex h-[68px] flex-1 flex-col justify-center px-5">
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[1px]",
                  priceMin || priceMax ? "text-[#16A34A]" : "text-[#94A3B8]",
                )}
              >
                ფასი ($) (დან-მდე)
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Min"
                  value={priceMin}
                  onChange={(e) =>
                    setPriceMin(e.target.value.replace(/\D/g, ""))
                  }
                  className="h-8 w-full min-w-0 rounded-md border border-[#E2E8F0] bg-white px-2 text-[13px] font-bold text-[#1E293B] outline-none placeholder:font-medium placeholder:text-[#94A3B8] focus:border-[#16A34A]"
                />
                <span className="text-[13px] font-bold text-[#CBD5E1]">–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Max"
                  value={priceMax}
                  onChange={(e) =>
                    setPriceMax(e.target.value.replace(/\D/g, ""))
                  }
                  className="h-8 w-full min-w-0 rounded-md border border-[#E2E8F0] bg-white px-2 text-[13px] font-bold text-[#1E293B] outline-none placeholder:font-medium placeholder:text-[#94A3B8] focus:border-[#16A34A]"
                />
              </div>
            </div>

            <div className="h-10 w-px bg-[#F1F5F9]" />

            <DesktopField
              label="ოთახები"
              value={roomsLabel}
              icon={<BedDouble className="size-4 text-[#94A3B8]" />}
              active={activeDropdown === "rooms"}
              onClick={() => toggleDropdown("rooms")}
            />

            <button
              type="button"
              onClick={() => toggleDropdown("filters")}
              className={cn(
                "ml-2 flex h-[48px] shrink-0 items-center gap-2 rounded-full border px-5 text-[13px] font-bold transition-colors",
                activeDropdown === "filters"
                  ? "border-[#16A34A] bg-[#F0FDF4] text-[#16A34A]"
                  : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
              )}
            >
              <SlidersHorizontal className="size-4" />
              დეტალურად
              {activeFilterCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-[#16A34A] text-[10px] font-black text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowMap((m) => !m)}
              className={cn(
                "flex h-[48px] shrink-0 items-center gap-2 rounded-full border px-5 text-[13px] font-bold transition-colors",
                showMap
                  ? "border-[#16A34A] bg-[#F0FDF4] text-[#16A34A]"
                  : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
              )}
              aria-pressed={showMap}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  showMap ? "bg-[#16A34A]" : "bg-[#CBD5E1]",
                )}
              />
              <MapIcon className="size-4" />
              რუკაზე
            </button>

            <Button
              type="submit"
              disabled={isPending}
              className="ml-2 h-[52px] shrink-0 gap-2 rounded-full bg-[#0A1F2E] px-7 text-[14px] font-bold text-white hover:bg-[#0F2A40] disabled:opacity-70"
              aria-label="ძიება"
            >
              {isPending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Search className="size-4" />
                  ძიება
                </>
              )}
            </Button>
          </div>

          {/* ═══ Investment quick-filter row (ROI / Area / Status / Renovation) ═══ */}
          {showInvestmentFilters && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-4">
              <QuickSelect
                label="მინიმალური ROI (%)"
                value={roiLabel}
                active={activeDropdown === "roi"}
                onToggle={() => toggleDropdown("roi")}
              >
                <OptionList
                  options={ROI_OPTIONS.map((o) => ({
                    key: o.value == null ? "null" : String(o.value),
                    label: o.label,
                    selected: o.value === roiMin,
                    onSelect: () => {
                      setRoiMin(o.value);
                      setActiveDropdown(null);
                    },
                  }))}
                />
              </QuickSelect>

              <QuickSelect
                label="ფართი (მ²)"
                value={areaLabel}
                active={activeDropdown === "area"}
                onToggle={() => toggleDropdown("area")}
              >
                <OptionList
                  options={AREA_OPTIONS.map((o) => ({
                    key: o.value ?? "any",
                    label: o.label,
                    selected: o.value === areaBucket,
                    onSelect: () => {
                      setAreaBucket(o.value);
                      setActiveDropdown(null);
                    },
                  }))}
                />
              </QuickSelect>

              <QuickSelect
                label="სტატუსი"
                value={constructionLabel}
                active={activeDropdown === "status"}
                onToggle={() => toggleDropdown("status")}
              >
                <OptionList
                  options={CONSTRUCTION_OPTIONS.map((o) => ({
                    key: o.value ?? "any",
                    label: o.label,
                    selected: o.value === constructionStatus,
                    onSelect: () => {
                      setConstructionStatus(o.value);
                      setActiveDropdown(null);
                    },
                  }))}
                />
              </QuickSelect>

              <QuickSelect
                label="რემონტი"
                value={renovationLabel}
                active={activeDropdown === "renovation"}
                onToggle={() => toggleDropdown("renovation")}
              >
                <OptionList
                  options={RENOVATION_OPTIONS.map((o) => ({
                    key: o.value ?? "any",
                    label: o.label,
                    selected: o.value === renovationStatus,
                    onSelect: () => {
                      setRenovationStatus(o.value);
                      setActiveDropdown(null);
                    },
                  }))}
                />
              </QuickSelect>
            </div>
          )}
        </>
      ) : (
        <AppraisalPane
          zone={appraisalZone}
          zoneLabel={appraisalZoneLabel}
          area={appraisalArea}
          onChangeArea={setAppraisalArea}
          zoneOpen={activeDropdown === "zone"}
          onToggleZone={() => toggleDropdown("zone")}
          onSelectZone={(v) => {
            setAppraisalZone(v);
            setActiveDropdown(null);
          }}
          isPending={isPending}
        />
      )}

      {/* ═══ Pill-level popovers (type / rooms) — search tab only ═══ */}
      {tab === "search" && activeDropdown === "type" && (
        <div className="absolute left-4 top-full z-50 mt-2 hidden w-[300px] rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:block">
          <TypeList
            value={propertyType}
            onSelect={(v) => {
              setPropertyType(v);
              setActiveDropdown(null);
            }}
          />
        </div>
      )}

      {tab === "search" && activeDropdown === "rooms" && (
        <div className="absolute right-[260px] top-full z-50 mt-2 hidden w-[240px] rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:block">
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.6px] text-[#64748B]">
            ოთახების რაოდენობა
          </p>
          <div className="flex flex-wrap gap-2">
            {ROOM_OPTIONS.map((n) => {
              const checked = rooms.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleRoomQuick(n)}
                  className={cn(
                    "h-9 min-w-9 rounded-full border px-3 text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#16A34A] bg-[#16A34A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  {n === 4 ? "4+" : String(n)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === "search" && activeDropdown === "filters" && (
        <div className="absolute left-0 right-0 top-full z-50 mt-3 rounded-[24px] border border-[#E2E8F0] bg-white p-6 text-left shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
          <FiltersPanel
            propertyTypes={propertyTypes}
            onToggleType={togglePropertyType}
            priceMin={priceMinNum}
            priceMax={priceMaxNum}
            onChangeMin={(v) => setPriceMin(String(v))}
            onChangeMax={(v) => setPriceMax(String(v))}
            cadastralCode={cadastralCode}
            onChangeCadastral={setCadastralCode}
            statuses={statuses}
            onToggleStatus={(v) =>
              setStatuses((prev) =>
                prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v],
              )
            }
            rooms={rooms}
            onToggleRoom={toggleRoomQuick}
            areaMin={areaMin}
            areaMax={areaMax}
            onChangeAreaMin={setAreaMin}
            onChangeAreaMax={setAreaMax}
            amenities={amenities}
            onToggleAmenity={(v) =>
              setAmenities((prev) =>
                prev.includes(v) ? prev.filter((a) => a !== v) : [...prev, v],
              )
            }
            payment={payment}
            onTogglePayment={(v) =>
              setPayment((prev) =>
                prev.includes(v) ? prev.filter((p) => p !== v) : [...prev, v],
              )
            }
            developers={developers}
            onToggleDeveloper={(v) =>
              setDevelopers((prev) =>
                prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v],
              )
            }
            onReset={resetFilters}
            onApply={() => setActiveDropdown(null)}
          />
        </div>
      )}
    </form>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex h-10 items-center border-b-2 text-[14px] font-bold transition-colors",
        active
          ? "border-[#0F172A] text-[#0F172A]"
          : "border-transparent text-[#94A3B8] hover:text-[#1E293B]",
      )}
    >
      {children}
    </button>
  );
}

function DesktopField({
  label,
  value,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative flex h-[68px] flex-1 flex-col justify-center px-5">
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-[1px]",
          active ? "text-[#16A34A]" : "text-[#94A3B8]",
        )}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "mt-0.5 flex w-full items-center gap-1.5 text-left text-[14px] font-bold leading-[20px] outline-none",
          active ? "text-[#16A34A]" : "text-[#1E293B]",
        )}
      >
        {icon}
        <span className="truncate">{value}</span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0",
            active ? "text-[#16A34A]" : "text-[#94A3B8]",
          )}
        />
      </button>
    </div>
  );
}

function MobileField({
  label,
  value,
  onClick,
  open,
  children,
}: {
  label: string;
  value: string;
  onClick: () => void;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
        {label}
      </label>
      <button
        type="button"
        onClick={onClick}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 text-left text-sm text-[#1E293B] outline-none"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className="size-4 text-[#94A3B8]" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
          {children}
        </div>
      )}
    </div>
  );
}

function QuickSelect({
  label,
  value,
  active,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
        {label}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-[13px] font-bold transition-colors",
          active
            ? "border-[#16A34A] text-[#16A34A]"
            : "border-[#E2E8F0] text-[#1E293B] hover:border-[#CBD5E1]",
        )}
      >
        <span className="truncate">{value}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0",
            active ? "text-[#16A34A]" : "text-[#94A3B8]",
          )}
        />
      </button>
      {active && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.15)]">
          {children}
        </div>
      )}
    </div>
  );
}

function OptionList({
  options,
}: {
  options: Array<{
    key: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
  }>;
}) {
  return (
    <ul className="flex flex-col">
      {options.map((o, idx) => (
        <li key={o.key}>
          <button
            type="button"
            onClick={o.onSelect}
            className={cn(
              "flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-bold transition-colors",
              idx === 0
                ? "bg-[#1E419A] text-white hover:bg-[#1E3A8A]"
                : "text-[#1E293B] hover:bg-[#F8FAFC]",
              o.selected && idx !== 0 && "bg-[#EFF6FF] text-[#1E419A]",
            )}
          >
            <span className="truncate">{o.label}</span>
            {o.selected && idx !== 0 && (
              <Check className="size-4 text-[#1E419A]" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function TypeList({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      <li>
        <button
          type="button"
          onClick={() => onSelect("")}
          className={cn(
            "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[14px] font-bold text-[#1E293B] hover:bg-[#F8FAFC]",
            !value && "bg-[#F0FDF4] text-[#16A34A]",
          )}
        >
          ნებისმიერი
          {!value && <Check className="size-4" />}
        </button>
      </li>
      {PROPERTY_TYPES.map((t) => (
        <li key={t.value}>
          <button
            type="button"
            onClick={() => onSelect(t.value)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[14px] font-bold text-[#1E293B] hover:bg-[#F8FAFC]",
              value === t.value && "bg-[#F0FDF4] text-[#16A34A]",
            )}
          >
            {t.label}
            {value === t.value && <Check className="size-4" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Appraisal pane ────────────────────────────────────────────────────

function AppraisalPane({
  zone,
  zoneLabel,
  area,
  onChangeArea,
  zoneOpen,
  onToggleZone,
  onSelectZone,
  isPending,
}: {
  zone: string;
  zoneLabel: string;
  area: string;
  onChangeArea: (v: string) => void;
  zoneOpen: boolean;
  onToggleZone: () => void;
  onSelectZone: (v: string) => void;
  isPending: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
      <div className="max-w-[520px]">
        <h3 className="text-[20px] font-black leading-[26px] text-[#0F172A] md:text-[22px]">
          გაიგეთ თქვენი ქონების რეალური ფასი
        </h3>
        <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
          ჩვენი ალგორითმი დაგითვლით ბინის ღირებულებას და პოტენციურ ROI-ს.
        </p>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_auto]">
        <div className="relative">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
            ლოკაცია / ზონა
          </label>
          <button
            type="button"
            onClick={onToggleZone}
            className={cn(
              "flex h-11 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-[13px] font-bold transition-colors",
              zoneOpen
                ? "border-[#16A34A] text-[#16A34A]"
                : "border-[#E2E8F0] text-[#1E293B] hover:border-[#CBD5E1]",
            )}
          >
            <span className="truncate">{zoneLabel}</span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0",
                zoneOpen ? "text-[#16A34A]" : "text-[#94A3B8]",
              )}
            />
          </button>
          {zoneOpen && (
            <ul className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.15)]">
              {APPRAISAL_ZONES.map((z) => {
                const selected = z === zone;
                return (
                  <li key={z}>
                    <button
                      type="button"
                      onClick={() => onSelectZone(z)}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-bold transition-colors hover:bg-[#F8FAFC]",
                        selected && "bg-[#F0FDF4] text-[#16A34A]",
                      )}
                    >
                      {z}
                      {selected && <Check className="size-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
            ფართი (მ²)
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="მაგ: 45"
            value={area}
            onChange={(e) => onChangeArea(e.target.value.replace(/\D/g, ""))}
            className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[13px] font-bold text-[#1E293B] outline-none placeholder:font-medium placeholder:text-[#94A3B8] focus:border-[#16A34A]"
          />
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="h-11 shrink-0 gap-2 rounded-lg bg-[#F97316] px-6 text-[13px] font-black text-white hover:bg-[#EA580C] disabled:opacity-70"
        >
          <Sparkles className="size-4" />
          AI შეფასება
        </Button>
      </div>
    </div>
  );
}

// ─── Advanced filters panel + range sliders ───────────────────────────

function PriceRangePanel({
  priceMin,
  priceMax,
  onChangeMin,
  onChangeMax,
}: {
  priceMin: number;
  priceMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}) {
  return (
    <div>
      <div className="relative h-5">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#F1F5F9]" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#16A34A]"
          style={{
            left: `${(priceMin / PRICE_MAX) * 100}%`,
            right: `${100 - (priceMax / PRICE_MAX) * 100}%`,
          }}
        />
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={PRICE_STEP}
          value={priceMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < priceMax) onChangeMin(v);
          }}
          className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#16A34A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
        />
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={PRICE_STEP}
          value={priceMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > priceMin) onChangeMax(v);
          }}
          className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#16A34A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
        />
      </div>
      <div className="mt-5 flex gap-3">
        <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
          <span className="text-[11px] font-bold text-[#94A3B8]">MIN</span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {formatUsd(priceMin)}
          </span>
        </div>
        <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
          <span className="text-[11px] font-bold text-[#94A3B8]">MAX</span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {formatUsd(priceMax)}
          </span>
        </div>
      </div>
    </div>
  );
}

function FiltersPanel({
  propertyTypes,
  onToggleType,
  priceMin,
  priceMax,
  onChangeMin,
  onChangeMax,
  cadastralCode,
  onChangeCadastral,
  statuses,
  onToggleStatus,
  rooms,
  onToggleRoom,
  areaMin,
  areaMax,
  onChangeAreaMin,
  onChangeAreaMax,
  amenities,
  onToggleAmenity,
  payment,
  onTogglePayment,
  developers,
  onToggleDeveloper,
  onReset,
  onApply,
}: {
  propertyTypes: string[];
  onToggleType: (value: string) => void;
  priceMin: number;
  priceMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
  cadastralCode: string;
  onChangeCadastral: (v: string) => void;
  statuses: string[];
  onToggleStatus: (v: string) => void;
  rooms: number[];
  onToggleRoom: (v: number) => void;
  areaMin: number;
  areaMax: number;
  onChangeAreaMin: (v: number) => void;
  onChangeAreaMax: (v: number) => void;
  amenities: string[];
  onToggleAmenity: (v: string) => void;
  payment: string[];
  onTogglePayment: (v: string) => void;
  developers: string[];
  onToggleDeveloper: (v: string) => void;
  onReset: () => void;
  onApply: () => void;
}) {
  return (
    <div className="text-left">
      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.6px] text-[#64748B]">
        სტატუსი
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => {
          const checked = statuses.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onToggleStatus(s.value)}
              className={cn(
                "h-9 rounded-full px-4 text-[13px] font-bold transition-colors",
                checked
                  ? "bg-[#1E419A] text-white"
                  : "border border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#1E419A] hover:text-[#1E419A]",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <FilterCell label="ბინის ტიპი">
          <div className="flex flex-col gap-1.5">
            {PROPERTY_TYPES.map((t) => {
              const checked = propertyTypes.includes(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onToggleType(t.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#1E419A] bg-[#1E419A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                      checked
                        ? "border-white/40 bg-white text-[#1E419A]"
                        : "border-[#CBD5E1] bg-white",
                    )}
                  >
                    {checked && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </FilterCell>

        <FilterCell label="გადახდა">
          <div className="flex flex-col gap-1.5">
            {PAYMENT_OPTIONS.map((p) => {
              const checked = payment.includes(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onTogglePayment(p.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#1E419A] bg-[#1E419A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                      checked
                        ? "border-white/40 bg-white text-[#1E419A]"
                        : "border-[#CBD5E1] bg-white",
                    )}
                  >
                    {checked && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{p.label}</span>
                </button>
              );
            })}
          </div>
        </FilterCell>

        <FilterCell label="ოთახები">
          <div className="flex flex-wrap gap-1.5">
            {ROOM_OPTIONS.map((n) => {
              const checked = rooms.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onToggleRoom(n)}
                  className={cn(
                    "h-9 min-w-9 rounded-full border px-3 text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#1E419A] bg-[#1E419A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  {n === 4 ? "4+" : String(n)}
                </button>
              );
            })}
          </div>
        </FilterCell>

        <FilterCell label="საკადასტრო კოდი">
          <input
            type="text"
            value={cadastralCode}
            onChange={(e) => onChangeCadastral(e.target.value)}
            placeholder="მაგ. 01.00.0000.000"
            className="h-[41px] w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[13px] font-medium text-[#1E293B] outline-none placeholder:text-[#94A3B8]"
          />
        </FilterCell>

        <FilterCell label="ფართობი (მ²)" className="md:col-span-2">
          <AreaRangePanel
            areaMin={areaMin}
            areaMax={areaMax}
            onChangeMin={onChangeAreaMin}
            onChangeMax={onChangeAreaMax}
          />
        </FilterCell>

        <FilterCell label="ფასი ($)" className="md:col-span-2">
          <PriceRangePanel
            priceMin={priceMin}
            priceMax={priceMax}
            onChangeMin={onChangeMin}
            onChangeMax={onChangeMax}
          />
        </FilterCell>

        <FilterCell label="დეველოპერი" className="md:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {DEVELOPER_OPTIONS.map((d) => {
              const checked = developers.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onToggleDeveloper(d.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#1E419A] bg-[#1E419A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </FilterCell>

        <FilterCell label="დამატებითი" className="md:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {AMENITY_CHIPS.map((a) => {
              const checked = amenities.includes(a.value);
              return (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => onToggleAmenity(a.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#16A34A] bg-[#16A34A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </FilterCell>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#F1F5F9] pt-4">
        <button
          type="button"
          onClick={onReset}
          className="h-10 rounded-full px-5 text-[13px] font-bold text-[#64748B] transition-colors hover:text-[#1E293B]"
        >
          გაუქმება
        </button>
        <button
          type="button"
          onClick={onApply}
          className="h-10 rounded-full bg-[#16A34A] px-6 text-[13px] font-bold text-white transition-colors hover:bg-[#15803D]"
        >
          ფილტრის გამოყენება
        </button>
      </div>
    </div>
  );
}

function FilterCell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.6px] text-[#64748B]">
        {label}
      </p>
      {children}
    </div>
  );
}

function AreaRangePanel({
  areaMin,
  areaMax,
  onChangeMin,
  onChangeMax,
}: {
  areaMin: number;
  areaMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}) {
  return (
    <div>
      <div className="relative h-5">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#F1F5F9]" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#1E419A]"
          style={{
            left: `${(areaMin / AREA_MAX_SLIDER) * 100}%`,
            right: `${100 - (areaMax / AREA_MAX_SLIDER) * 100}%`,
          }}
        />
        <input
          type="range"
          min={AREA_MIN}
          max={AREA_MAX_SLIDER}
          step={AREA_STEP}
          value={areaMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < areaMax) onChangeMin(v);
          }}
          className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#1E419A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
        />
        <input
          type="range"
          min={AREA_MIN}
          max={AREA_MAX_SLIDER}
          step={AREA_STEP}
          value={areaMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > areaMin) onChangeMax(v);
          }}
          className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#1E419A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
        />
      </div>
      <div className="mt-5 flex gap-3">
        <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
          <span className="text-[11px] font-bold text-[#94A3B8]">MIN</span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {areaMin} მ²
          </span>
        </div>
        <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
          <span className="text-[11px] font-bold text-[#94A3B8]">MAX</span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {areaMax === AREA_MAX_SLIDER ? `${areaMax}+ მ²` : `${areaMax} მ²`}
          </span>
        </div>
      </div>
    </div>
  );
}
