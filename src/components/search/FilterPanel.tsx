"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import NumberField from "@/components/shared/NumberField";
import { AMENITY_GROUPS } from "@/lib/constants/listing-options";

const PROPERTY_TYPE_KEYS = [
  "apartment",
  "cottage",
  "hotel",
  "villa",
  "studio",
  // Sale-only in practice: this panel is shared between rent and sale mode and
  // takes no mode prop, so the chip is a no-op in rent mode (same as "hotel").
  "land",
] as const;

// "no_balcony" is excluded: amenity filters are "must have X" matches.
const FILTER_AMENITY_GROUPS = AMENITY_GROUPS.map((group) => ({
  key: group.key,
  options: group.options.filter((opt) => opt.key !== "no_balcony"),
}));

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
  variant?: "card" | "sheet";
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

export function FilterPanel({
  onFilterChange,
  filters,
  variant = "card",
}: FilterPanelProps) {
  const t = useTranslations("FilterPanel");
  const tOpts = useTranslations("ListingOptions");
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
    <div
      className={cn(
        "bg-white",
        variant === "card"
          ? "rounded-[24px] border border-[#E2E8F0] p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]"
          : "p-0",
      )}
    >
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onFilterChange(DEFAULT_FILTERS)}
          className="mb-3 min-h-11 rounded-lg px-2 text-xs font-medium text-brand-accent hover:bg-[#EFF6FF] hover:underline"
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
          <NumberField
            integer
            min={0}
            placeholder={t("min")}
            value={filters.priceMin === "" ? "" : String(filters.priceMin)}
            onChange={(v) => updateFilters({ priceMin: v ? Number(v) : "" })}
          />
          <span className="text-[13px] text-[#94A3B8]">–</span>
          <NumberField
            integer
            min={0}
            placeholder={t("max")}
            value={filters.priceMax === "" ? "" : String(filters.priceMax)}
            onChange={(v) => updateFilters({ priceMax: v ? Number(v) : "" })}
          />
        </div>
      </FilterSection>

      {/* Rooms */}
      <FilterSection
        title={t("rooms")}
        isOpen={!!expanded.rooms}
        onToggle={() => toggleSection("rooms")}
      >
        <div className="flex flex-wrap gap-4 lg:flex-nowrap">
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
                  "flex h-11 min-w-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors lg:h-10 lg:min-w-[42px]",
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
          <NumberField
            integer
            min={0}
            placeholder={t("min")}
            value={filters.areaMin === "" ? "" : String(filters.areaMin)}
            onChange={(v) => updateFilters({ areaMin: v ? Number(v) : "" })}
          />
          <span className="text-[13px] text-[#94A3B8]">–</span>
          <NumberField
            integer
            min={0}
            placeholder={t("max")}
            value={filters.areaMax === "" ? "" : String(filters.areaMax)}
            onChange={(v) => updateFilters({ areaMax: v ? Number(v) : "" })}
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
        <div className="flex flex-col gap-4">
          {FILTER_AMENITY_GROUPS.map((group) => (
            <div key={group.key} className="flex flex-col gap-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">
                {tOpts(`amenityGroupLabels.${group.key}`)}
              </p>
              {group.options.map((opt) => (
                <label
                  key={opt.key}
                  className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#64748B]"
                >
                  <input
                    type="checkbox"
                    checked={filters.amenities.includes(opt.key)}
                    onChange={() => toggleArrayItem("amenities", opt.key)}
                    className="size-5 rounded-[6px] border-[#E2E8F0] accent-brand-accent"
                  />
                  {tOpts(`amenities.${opt.key}`)}
                </label>
              ))}
            </div>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}
