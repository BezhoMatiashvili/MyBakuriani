"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, MapPin, ChevronDown, Check, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SEARCH_LOCATION_ZONES } from "@/lib/constants/locations";

export interface SaleSearchFilters {
  location: string;
  propertyType: string;
  priceMin: number;
  priceMax: number;
  cadastralCode: string;
}

type SaleActiveDropdown = "location" | "type" | "price" | null;

interface SaleSearchBoxProps {
  onSearch: (filters: SaleSearchFilters) => void;
  className?: string;
  isPending?: boolean;
}

const PROPERTY_TYPES = [
  { value: "apartment", label: "აპარტამენტი" },
  { value: "house", label: "კერძო სახლი" },
  { value: "commercial", label: "კომერციული" },
  { value: "land", label: "მიწის ნაკვეთი" },
];

const PRICE_MIN = 0;
const PRICE_MAX = 1_000_000;
const PRICE_STEP = 5_000;
const DEFAULT_PRICE_MIN = 30_000;
const DEFAULT_PRICE_MAX = 500_000;

function formatUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

export function SaleSearchBox({
  onSearch,
  className,
  isPending = false,
}: SaleSearchBoxProps) {
  const [location, setLocation] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [priceMin, setPriceMin] = useState(DEFAULT_PRICE_MIN);
  const [priceMax, setPriceMax] = useState(DEFAULT_PRICE_MAX);
  const [cadastralCode, setCadastralCode] = useState("");
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ location, propertyType, priceMin, priceMax, cadastralCode });
  };

  const propertyTypeLabel =
    PROPERTY_TYPES.find((t) => t.value === propertyType)?.label || "ყველა ტიპი";
  const priceLabel =
    priceMin === DEFAULT_PRICE_MIN && priceMax === DEFAULT_PRICE_MAX
      ? "ნებისმიერი"
      : `${formatUsd(priceMin)} – ${formatUsd(priceMax)}`;

  return (
    <form
      onSubmit={handleSubmit}
      ref={containerRef}
      className={cn(
        "relative rounded-2xl border border-white/20 bg-white p-4 shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.2)]",
        "md:flex md:h-[80px] md:items-center md:rounded-full md:border-0 md:p-2",
        className,
      )}
    >
      {/* ═══ Mobile: stacked ═══ */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        <MobileField
          label="ზონა"
          value={location || "ყველა ზონა"}
          onClick={() => toggleDropdown("location")}
          open={activeDropdown === "location"}
        >
          <ZoneList
            location={location}
            onSelect={(v) => {
              setLocation(v);
              setActiveDropdown(null);
            }}
          />
        </MobileField>

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

        <MobileField
          label="ფასი"
          value={priceLabel}
          onClick={() => toggleDropdown("price")}
          open={activeDropdown === "price"}
        >
          <PriceRangePanel
            priceMin={priceMin}
            priceMax={priceMax}
            onChangeMin={setPriceMin}
            onChangeMax={setPriceMax}
          />
        </MobileField>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
            საკადასტრო კოდი
          </label>
          <input
            type="text"
            value={cadastralCode}
            onChange={(e) => setCadastralCode(e.target.value)}
            placeholder="საკადასტრო კოდი..."
            className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none placeholder:text-[#94A3B8]"
          />
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="h-10 gap-2 bg-[#16A34A] px-6 text-white hover:bg-[#15803D] disabled:opacity-70"
        >
          <Search className="size-4" />
          ძებნა
        </Button>
      </div>

      {/* ═══ Desktop: horizontal pill ═══ */}
      <div className="hidden flex-1 items-center md:flex">
        <DesktopField
          label="ზონა"
          value={location || "ყველა ზონა"}
          icon={<MapPin className="size-4 text-[#94A3B8]" />}
          active={activeDropdown === "location"}
          onClick={() => toggleDropdown("location")}
          rounded="left"
        />

        <div className="h-8 w-px bg-[#F1F5F9]" />

        <DesktopField
          label="ტიპი"
          value={propertyTypeLabel}
          icon={<Home className="size-4 text-[#94A3B8]" />}
          active={activeDropdown === "type"}
          onClick={() => toggleDropdown("type")}
        />

        <div className="h-8 w-px bg-[#F1F5F9]" />

        <DesktopField
          label="ფასი"
          value={priceLabel}
          active={activeDropdown === "price"}
          onClick={() => toggleDropdown("price")}
        />

        <div className="h-8 w-px bg-[#F1F5F9]" />

        <div className="flex h-[61.5px] items-center justify-center px-2">
          <input
            type="text"
            placeholder="საკადასტრო კოდი..."
            value={cadastralCode}
            onChange={(e) => setCadastralCode(e.target.value)}
            className="h-[45.5px] w-[220px] rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-5 text-[13px] font-medium text-[#1E293B] outline-none placeholder:text-[#94A3B8]"
          />
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="ml-2 size-[44px] shrink-0 rounded-full bg-[#16A34A] text-white hover:bg-[#15803D] disabled:opacity-70"
          aria-label="ძებნა"
        >
          {isPending ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Search className="size-4" />
          )}
        </Button>
      </div>

      {/* ═══ Desktop dropdowns (portal-less, absolute under field) ═══ */}
      {activeDropdown === "location" && (
        <div className="absolute left-2 top-full z-50 mt-2 hidden w-[400px] rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:block">
          <ZoneList
            location={location}
            onSelect={(v) => {
              setLocation(v);
              setActiveDropdown(null);
            }}
          />
        </div>
      )}
      {activeDropdown === "type" && (
        <div className="absolute left-[calc(33%-20px)] top-full z-50 mt-2 hidden w-[300px] rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:block">
          <TypeList
            value={propertyType}
            onSelect={(v) => {
              setPropertyType(v);
              setActiveDropdown(null);
            }}
          />
        </div>
      )}
      {activeDropdown === "price" && (
        <div className="absolute left-[calc(66%-60px)] top-full z-50 mt-2 hidden w-[360px] rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:block">
          <PriceRangePanel
            priceMin={priceMin}
            priceMax={priceMax}
            onChangeMin={setPriceMin}
            onChangeMax={setPriceMax}
          />
        </div>
      )}
    </form>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function DesktopField({
  label,
  value,
  icon,
  active,
  onClick,
  rounded,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
  rounded?: "left";
}) {
  return (
    <div
      className={cn(
        "relative flex h-[64px] flex-1 flex-col justify-center px-6",
        rounded === "left" && "rounded-l-full",
      )}
    >
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
          "flex w-full items-center gap-1 text-left text-[15px] font-bold leading-[22px] outline-none",
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

function ZoneList({
  location,
  onSelect,
}: {
  location: string;
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
            !location && "bg-[#F0FDF4] text-[#16A34A]",
          )}
        >
          ყველა ზონა
          {!location && <Check className="size-4" />}
        </button>
      </li>
      {SEARCH_LOCATION_ZONES.map((zone) => (
        <li key={zone}>
          <button
            type="button"
            onClick={() => onSelect(zone)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[14px] font-bold text-[#1E293B] hover:bg-[#F8FAFC]",
              location === zone && "bg-[#F0FDF4] text-[#16A34A]",
            )}
          >
            {zone}
            {location === zone && <Check className="size-4" />}
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
          ყველა ტიპი
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
