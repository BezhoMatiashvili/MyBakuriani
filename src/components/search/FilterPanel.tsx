"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const PROPERTY_TYPE_KEYS = [
  "apartment",
  "cottage",
  "hotel",
  "villa",
  "studio",
] as const;

const AMENITY_KEYS = [
  { value: "wifi", key: "wifi" },
  { value: "parking", key: "parking" },
  { value: "ski_storage", key: "skiStorage" },
  { value: "fireplace", key: "fireplace" },
  { value: "balcony", key: "balcony" },
  { value: "pool", key: "pool" },
  { value: "spa", key: "spa" },
  { value: "restaurant", key: "restaurant" },
] as const;

const ROOM_OPTIONS = [1, 2, 3, 4, "5+"] as const;

export interface Filters {
  priceMin: number | "";
  priceMax: number | "";
  rooms: number | null;
  bathrooms: number | null;
  areaMin: number | "";
  areaMax: number | "";
  types: string[];
  amenities: string[];
  verifiedOnly: boolean;
}

interface FilterPanelProps {
  onFilterChange: (filters: Filters) => void;
  filters: Filters;
}

function FilterSection({
  title,
  children,
  isOpen,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[#E2E8F0] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-3 text-[15px] font-bold leading-[22px] text-[#1E293B] transition-colors hover:text-[#64748B]"
      >
        {title}
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="size-4 text-[#94A3B8]" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const DEFAULT_FILTERS: Filters = {
  priceMin: "",
  priceMax: "",
  rooms: null,
  bathrooms: null,
  areaMin: "",
  areaMax: "",
  types: [],
  amenities: [],
  verifiedOnly: false,
};

export function FilterPanel({ onFilterChange, filters }: FilterPanelProps) {
  const t = useTranslations("FilterPanel");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    price: true,
    rooms: false,
    area: false,
    type: false,
    amenities: false,
  });

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateFilters = (partial: Partial<Filters>) => {
    onFilterChange({ ...filters, ...partial });
  };

  const toggleArrayItem = (key: "types" | "amenities", value: string) => {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilters({ [key]: next });
  };

  const hasActiveFilters =
    filters.priceMin !== "" ||
    filters.priceMax !== "" ||
    filters.rooms !== null ||
    filters.bathrooms !== null ||
    filters.areaMin !== "" ||
    filters.areaMax !== "" ||
    filters.types.length > 0 ||
    filters.amenities.length > 0 ||
    filters.verifiedOnly;

  return (
    <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onFilterChange(DEFAULT_FILTERS)}
          className="mb-3 text-xs font-medium text-brand-accent hover:underline"
        >
          {t("clearFilters")}
        </button>
      )}

      {/* Price */}
      <FilterSection
        title={t("byPrice")}
        isOpen={!!expanded.price}
        onToggle={() => toggleSection("price")}
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder={t("min")}
            value={filters.priceMin}
            onChange={(e) =>
              updateFilters({
                priceMin: e.target.value ? Number(e.target.value) : "",
              })
            }
            className="h-[41px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#DBEAFE] focus:ring-2 focus:ring-[#DBEAFE]/50"
          />
          <span className="text-[13px] text-[#94A3B8]">–</span>
          <input
            type="number"
            min={0}
            placeholder={t("max")}
            value={filters.priceMax}
            onChange={(e) =>
              updateFilters({
                priceMax: e.target.value ? Number(e.target.value) : "",
              })
            }
            className="h-[41px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#DBEAFE] focus:ring-2 focus:ring-[#DBEAFE]/50"
          />
          <span className="text-sm text-[#94A3B8]">₾</span>
        </div>
      </FilterSection>

      {/* Rooms */}
      <FilterSection
        title={t("rooms")}
        isOpen={!!expanded.rooms}
        onToggle={() => toggleSection("rooms")}
      >
        <div className="flex gap-4">
          {ROOM_OPTIONS.map((opt) => {
            const numVal = typeof opt === "number" ? opt : 5;
            const isActive = filters.rooms === numVal;
            return (
              <button
                key={String(opt)}
                type="button"
                onClick={() =>
                  updateFilters({ rooms: isActive ? null : numVal })
                }
                className={cn(
                  "flex h-10 min-w-[42px] items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                  isActive
                    ? "border-brand-accent bg-brand-accent text-white"
                    : "border-[#E2E8F0] bg-white text-[#1E293B] hover:bg-[#F8FAFC]",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </FilterSection>

      {/* Area */}
      <FilterSection
        title={t("area")}
        isOpen={!!expanded.area}
        onToggle={() => toggleSection("area")}
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder={t("min")}
            value={filters.areaMin}
            onChange={(e) =>
              updateFilters({
                areaMin: e.target.value ? Number(e.target.value) : "",
              })
            }
            className="h-[41px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#DBEAFE] focus:ring-2 focus:ring-[#DBEAFE]/50"
          />
          <span className="text-[13px] text-[#94A3B8]">–</span>
          <input
            type="number"
            min={0}
            placeholder={t("max")}
            value={filters.areaMax}
            onChange={(e) =>
              updateFilters({
                areaMax: e.target.value ? Number(e.target.value) : "",
              })
            }
            className="h-[41px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#DBEAFE] focus:ring-2 focus:ring-[#DBEAFE]/50"
          />
          <span className="text-[13px] text-[#94A3B8]">{t("sqm")}</span>
        </div>
      </FilterSection>

      {/* Type */}
      <FilterSection
        title={t("type")}
        isOpen={!!expanded.type}
        onToggle={() => toggleSection("type")}
      >
        <div className="flex flex-col gap-3">
          {PROPERTY_TYPE_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#64748B]"
            >
              <input
                type="checkbox"
                checked={filters.types.includes(key)}
                onChange={() => toggleArrayItem("types", key)}
                className="size-5 rounded-[6px] border-[#E2E8F0] accent-brand-accent"
              />
              {t(`types.${key}`)}
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Amenities */}
      <FilterSection
        title={t("amenities")}
        isOpen={!!expanded.amenities}
        onToggle={() => toggleSection("amenities")}
      >
        <div className="flex flex-col gap-3">
          {AMENITY_KEYS.map(({ value, key }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#64748B]"
            >
              <input
                type="checkbox"
                checked={filters.amenities.includes(value)}
                onChange={() => toggleArrayItem("amenities", value)}
                className="size-5 rounded-[6px] border-[#E2E8F0] accent-brand-accent"
              />
              {t(`amenityLabels.${key}`)}
            </label>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}
