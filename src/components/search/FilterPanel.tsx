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
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-3 text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
      >
        {title}
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="size-4" />
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
    <div className="rounded-3xl border border-[#E2E8F0] bg-white p-8">
      {/* Clear all */}
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
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
          />
          <span className="text-sm text-muted-foreground">–</span>
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
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
          />
          <span className="text-sm text-muted-foreground">₾</span>
        </div>
      </FilterSection>

      {/* Rooms */}
      <FilterSection
        title="ოთახები"
        isOpen={!!expanded.rooms}
        onToggle={() => toggleSection("rooms")}
      >
        <div className="flex gap-2">
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
                  "flex h-9 min-w-[40px] items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                  isActive
                    ? "border-brand-accent bg-brand-accent text-white"
                    : "border-border bg-background text-foreground hover:bg-muted",
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
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
          />
          <span className="text-sm text-muted-foreground">–</span>
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
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
          />
          <span className="text-sm text-muted-foreground">მ²</span>
        </div>
      </FilterSection>

      {/* Type */}
      <FilterSection
        title="ტიპი"
        isOpen={!!expanded.type}
        onToggle={() => toggleSection("type")}
      >
        <div className="flex flex-col gap-2">
          {PROPERTY_TYPES.map(({ value, label }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={filters.types.includes(value)}
                onChange={() => toggleArrayItem("types", value)}
                className="size-4 rounded border-border accent-brand-accent"
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
        <div className="flex flex-col gap-2">
          {AMENITIES.map(({ value, label }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={filters.amenities.includes(value)}
                onChange={() => toggleArrayItem("amenities", value)}
                className="size-4 rounded border-border accent-brand-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}
