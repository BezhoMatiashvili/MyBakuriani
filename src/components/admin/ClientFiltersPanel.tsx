"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  Button,
  Field,
  Select,
  inputClass,
} from "@/components/admin/finance/ui";
import {
  countWithOption,
  type ClientFactsRow,
  type ClientFilterKey,
  type ClientFilterOptions,
  type ClientFilters,
} from "@/lib/admin-clients-filter";
import { cn } from "@/lib/utils";

/**
 * The clients directory's filters (src/lib/admin-clients-filter.ts). Each
 * option shows how many clients it would leave with the other filters kept.
 * Phones fold the panel behind its title; from lg it is always open.
 */
export function ClientFiltersPanel({
  rows,
  filters,
  options,
  now,
  activeCount,
  onChange,
  onClear,
}: {
  rows: readonly ClientFactsRow[];
  filters: ClientFilters;
  options: ClientFilterOptions;
  now: number;
  activeCount: number;
  onChange: (key: ClientFilterKey, value: string | null) => void;
  onClear: () => void;
}) {
  const t = useTranslations("AdminClients");
  const tShared = useTranslations("AdminShared");
  const tStatuses = useTranslations("AdminStatuses");
  const [open, setOpen] = useState(false);

  const labels: Record<keyof ClientFilterOptions, (value: string) => string> = {
    role: (value) => tShared(`roles.${value}`),
    membership: (value) => tStatuses(`states.${value}`),
    vip: (value) => t(`filters.vipOptions.${value}`),
    company: (value) =>
      value === "any"
        ? t("filters.companyAny")
        : tStatuses(`companyStates.${value}`),
    seen: (value) => t(`filters.seenOptions.${value}`),
    method: (value) => t(`filters.methodOptions.${value}`),
    balance: (value) => t(`filters.balanceOptions.${value}`),
    verified: (value) => t(`filters.verifiedOptions.${value}`),
  };

  function select(key: keyof ClientFilterOptions) {
    const id = `client-filter-${key}`;
    return (
      <Field key={key} label={t(`filters.${key}`)} htmlFor={id}>
        <Select
          id={id}
          value={filters[key] ?? ""}
          onChange={(value) => onChange(key, value || null)}
          placeholder={t("filters.all")}
          options={options[key].map((value) => ({
            value,
            label: `${labels[key](value)} (${countWithOption(rows, filters, key, value, now)})`,
          }))}
        />
      </Field>
    );
  }

  const title = (
    <>
      <SlidersHorizontal className="h-4 w-4 text-[#2563EB]" />
      {t("filters.title")}
      {activeCount > 0 && (
        <span className="rounded-full bg-[#2563EB] px-2 text-[12px] leading-5 text-white">
          {activeCount}
        </span>
      )}
    </>
  );

  return (
    <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="client-filters"
          className="inline-flex min-h-11 items-center gap-2 text-[14px] font-black text-[#0F172A] lg:hidden"
        >
          {title}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[#64748B] transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <h2 className="hidden items-center gap-2 text-[14px] font-black text-[#0F172A] lg:inline-flex">
          {title}
        </h2>
        {activeCount > 0 && (
          <Button variant="ghost" onClick={onClear}>
            {t("filters.clear")}
          </Button>
        )}
      </div>
      <div
        id="client-filters"
        className={cn(
          "mt-4 grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
          open ? "grid" : "hidden lg:grid",
        )}
      >
        {select("role")}
        {select("membership")}
        {select("vip")}
        {select("company")}
        {select("verified")}
        {select("seen")}
        {select("method")}
        {select("balance")}
        <Field label={t("filters.from")} htmlFor="client-filter-from">
          <input
            id="client-filter-from"
            type="date"
            value={filters.from ?? ""}
            max={filters.to || undefined}
            onChange={(event) => onChange("from", event.target.value || null)}
            className={inputClass}
          />
        </Field>
        <Field label={t("filters.to")} htmlFor="client-filter-to">
          <input
            id="client-filter-to"
            type="date"
            value={filters.to ?? ""}
            min={filters.from || undefined}
            onChange={(event) => onChange("to", event.target.value || null)}
            className={inputClass}
          />
        </Field>
      </div>
    </section>
  );
}
