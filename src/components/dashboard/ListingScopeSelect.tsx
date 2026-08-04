"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, ChevronDown, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ListingOption {
  id: string;
  title: string;
}

export interface ListingScopeSelectProps {
  listings: ListingOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export function ListingScopeSelect({
  listings,
  selectedIds,
  onChange,
  className,
}: ListingScopeSelectProps) {
  const t = useTranslations("ListingScopeSelect");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) => l.title.toLowerCase().includes(q));
  }, [listings, query]);

  if (listings.length === 0) return null;

  const allSelected = selectedIds.length === 0;
  const label = allSelected
    ? t("allListings")
    : t("selectedCount", { count: selectedIds.length });

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#CBD5E1]",
          className,
        )}
      >
        <Building2 className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[330px] max-w-[calc(100vw-2rem)] gap-0 p-0 md:w-[330px]"
      >
        <div className="relative border-b border-[#EEF1F4] p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-lg bg-[#F8FAFC] pr-3 pl-9 text-sm font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:bg-white"
          />
        </div>

        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "flex w-full items-center justify-between border-b border-[#EEF1F4] px-4 py-2.5 text-left text-[13px] font-bold transition-colors hover:bg-[#F1F5F9]",
            allSelected ? "bg-[#EFF6FF] text-[#2563EB]" : "text-[#334155]",
          )}
        >
          {t("allListings")}
        </button>

        <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
          {filtered.map((listing) => (
            <label
              key={listing.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9]"
            >
              <input
                type="checkbox"
                className="accent-[#2563EB]"
                checked={selectedIds.includes(listing.id)}
                onChange={() => toggle(listing.id)}
              />
              <span className="min-w-0 flex-1 truncate">{listing.title}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
