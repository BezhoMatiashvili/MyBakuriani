"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const PROPERTY_TYPES = [
  { value: "apartment", label: "ბინა" },
  { value: "cottage", label: "კოტეჯი" },
  { value: "hotel", label: "სასტუმრო" },
  { value: "villa", label: "ვილა" },
  { value: "studio", label: "სტუდიო" },
] as const;

const AMENITIES = [
  { value: "wifi", label: "Wi-Fi" },
  { value: "parking", label: "პარკინგი" },
  { value: "ski_storage", label: "სათხილამურო საწყობი" },
  { value: "fireplace", label: "ბუხარი" },
  { value: "balcony", label: "აივანი" },
  { value: "pool", label: "აუზი" },
  { value: "spa", label: "SPA" },
  { value: "restaurant", label: "რესტორანი" },
] as const;

const ROOM_OPTIONS = [1, 2, 3, 4, "5+"] as const;

export interface Filters {
  priceMin: number | "";
  priceMax: number | "";
  rooms: number | null;
  areaMin: number | "";
  areaMax: number | "";
  types: string[];
  amenities: string[];
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
  areaMin: "",
  areaMax: "",
  types: [],
  amenities: [],
};

export function FilterPanel({ onFilterChange, filters }: FilterPanelProps) {
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
    filters.areaMin !== "" ||
    filters.areaMax !== "" ||
    filters.types.length > 0 ||
    filters.amenities.length > 0;

  return (
    <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onFilterChange(DEFAULT_FILTERS)}
          className="mb-3 text-xs font-medium text-brand-accent hover:underline"
        >
          ფილტრების გასუფთავება
        </button>
      )}

      {/* Price */}
      <FilterSection
        title="ფასის მიხედვით"
        isOpen={!!expanded.price}
        onToggle={() => toggleSection("price")}
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="მინ."
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
            placeholder="მაქს."
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
        title="ოთახები"
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
        title="ფართობი"
        isOpen={!!expanded.area}
        onToggle={() => toggleSection("area")}
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="მინ."
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
            placeholder="მაქს."
            value={filters.areaMax}
            onChange={(e) =>
              updateFilters({
                areaMax: e.target.value ? Number(e.target.value) : "",
              })
            }
            className="h-[41px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#DBEAFE] focus:ring-2 focus:ring-[#DBEAFE]/50"
          />
          <span className="text-[13px] text-[#94A3B8]">მ²</span>
        </div>
      </FilterSection>

      {/* Type */}
      <FilterSection
        title="ტიპი"
        isOpen={!!expanded.type}
        onToggle={() => toggleSection("type")}
      >
        <div className="flex flex-col gap-3">
          {PROPERTY_TYPES.map(({ value, label }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#64748B]"
            >
              <input
                type="checkbox"
                checked={filters.types.includes(value)}
                onChange={() => toggleArrayItem("types", value)}
                className="size-5 rounded-[6px] border-[#E2E8F0] accent-brand-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Amenities */}
      <FilterSection
        title="კეთილმოწყობა"
        isOpen={!!expanded.amenities}
        onToggle={() => toggleSection("amenities")}
      >
        <div className="flex flex-col gap-3">
          {AMENITIES.map(({ value, label }) => (
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
              {label}
            </label>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}
