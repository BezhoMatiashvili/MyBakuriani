"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { cleanAmenityLabel } from "@/lib/constants/amenity-icons";
import { AMENITY_GROUPS, optionKeyFor } from "@/lib/constants/listing-options";

interface PropertyAmenitiesProps {
  amenities: string[];
  collapsible?: boolean;
  showAllLabel?: string;
  showLessLabel?: string;
}

export default function PropertyAmenities({
  amenities,
  collapsible = false,
  showAllLabel,
  showLessLabel,
}: PropertyAmenitiesProps) {
  const tOpts = useTranslations("ListingOptions");
  const [expanded, setExpanded] = useState(false);
  const visibleAmenities =
    collapsible && !expanded ? amenities.slice(0, 3) : amenities;

  const grouped = AMENITY_GROUPS.map((group) => ({
    key: group.key,
    label: tOpts(`amenityGroupLabels.${group.key}`),
    values: visibleAmenities.filter((raw) => {
      const canonical = optionKeyFor("amenities", raw);
      return group.options.some((option) => option.key === canonical);
    }),
  })).filter((group) => group.values.length > 0);

  const knownKeys = new Set(
    AMENITY_GROUPS.flatMap((group) =>
      group.options.map((option) => option.key),
    ),
  );
  const unknown = visibleAmenities.filter((raw) => {
    const canonical = optionKeyFor("amenities", raw);
    return !canonical || !knownKeys.has(canonical);
  });
  if (unknown.length > 0) {
    grouped.push({ key: "other", label: tOpts("other"), values: unknown });
  }

  return (
    <div className="space-y-5" data-testid="property-amenity-groups">
      {grouped.map((group) => (
        <section key={group.key} data-amenity-group={group.key}>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            {group.label}
          </h3>
          <div className="flex flex-wrap gap-2">
            {group.values.map((raw) => {
              const canonical = optionKeyFor("amenities", raw);
              const label = canonical
                ? tOpts(`amenities.${canonical}`)
                : cleanAmenityLabel(raw);
              if (!label) return null;
              return (
                <span
                  key={raw}
                  data-amenity-value={raw}
                  className="inline-flex min-w-0 max-w-full items-center rounded-[14px] border border-[#DBEAFE] bg-[#EFF6FF] px-4 py-2 text-[13px] font-semibold text-[#2563EB]"
                >
                  <span className="break-words">{label}</span>
                </span>
              );
            })}
          </div>
        </section>
      ))}

      {collapsible && amenities.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[#DBEAFE] bg-[#EFF6FF] px-4 py-2 text-[13px] font-semibold text-[#2563EB] transition-colors hover:bg-[#DBEAFE]"
        >
          {expanded ? (
            <ChevronUp className="size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          )}
          {expanded ? showLessLabel : showAllLabel}
        </button>
      )}
    </div>
  );
}
