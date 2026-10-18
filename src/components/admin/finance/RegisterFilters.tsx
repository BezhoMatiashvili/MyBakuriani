"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import DateField from "@/components/shared/DateField";
import { addDays, monthStart, tbilisiToday } from "@/lib/finance/filters";
import { cn } from "@/lib/utils";
import EntityPicker, {
  resolveEntity,
  type Entity,
  type EntityKind,
} from "./EntityPicker";
import { Button, Field, Select, inputClass } from "./ui";

// Register filters (spec §13) kept in the URL, so a filtered page can be
// shared, survives a reload, and its export downloads exactly these rows.

export type SelectFilter = {
  param: "type" | "method" | "status" | "source" | "category";
  label: string;
  options: readonly { value: string; label: string }[];
};

export type PickerFilter = {
  param: "payer" | "owner" | "object";
  label: string;
  kinds: EntityKind[];
};

const FILTER_PARAMS = [
  "from",
  "to",
  "type",
  "method",
  "status",
  "source",
  "category",
  "payer",
  "owner",
  "property",
  "service",
  "q",
] as const;

/** The current filters as a query string, and paging. */
export function useRegisterQuery() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const query = searchParams.toString();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const update = useCallback(
    (changes: Record<string, string | null>, keepPage = false) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!keepPage) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  /** Filters only (no page, no page-specific params): for exports. */
  const filterQuery = useMemo(() => {
    const out = new URLSearchParams();
    for (const key of FILTER_PARAMS) {
      const value = searchParams.get(key);
      if (value) out.set(key, value);
    }
    return out.toString();
  }, [searchParams]);

  const activeCount = FILTER_PARAMS.filter((key) =>
    searchParams.get(key),
  ).length;

  return {
    searchParams,
    query,
    filterQuery,
    page,
    activeCount,
    update,
    setPage: (n: number) => update({ page: n > 1 ? String(n) : null }, true),
  };
}

function useUrlEntity(id: string | null, kinds: EntityKind[]) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const kindsKey = kinds.join(",");
  useEffect(() => {
    if (!id) {
      setEntity(null);
      return;
    }
    if (entity?.id === id) return;
    let live = true;
    void resolveEntity(id, kindsKey.split(",") as EntityKind[]).then(
      (found) => {
        if (live) {
          setEntity(
            found ?? {
              kind: kindsKey.split(",")[0] as EntityKind,
              id,
              label: id,
            },
          );
        }
      },
    );
    return () => {
      live = false;
    };
  }, [id, kindsKey, entity?.id]);
  return [entity, setEntity] as const;
}

function PickerControl({
  filter,
  searchParams,
  update,
}: {
  filter: PickerFilter;
  searchParams: URLSearchParams;
  update: (changes: Record<string, string | null>) => void;
}) {
  const t = useTranslations("AdminFinances");
  const id =
    filter.param === "object"
      ? (searchParams.get("property") ?? searchParams.get("service"))
      : searchParams.get(filter.param);
  const [entity, setEntity] = useUrlEntity(id, filter.kinds);
  const inputId = `filter-${filter.param}`;
  return (
    <Field label={filter.label} htmlFor={inputId}>
      <EntityPicker
        id={inputId}
        kinds={filter.kinds}
        value={entity}
        placeholder={
          filter.param === "object"
            ? t("filters.objectPlaceholder")
            : t("filters.userPlaceholder")
        }
        onChange={(next) => {
          setEntity(next);
          if (filter.param === "object") {
            update({
              property: next?.kind === "property" ? next.id : null,
              service: next?.kind === "service" ? next.id : null,
            });
          } else {
            update({ [filter.param]: next?.id ?? null });
          }
        }}
      />
    </Field>
  );
}

export default function RegisterFilters({
  selects = [],
  pickers = [],
  dates = true,
  search = true,
  children,
}: {
  selects?: SelectFilter[];
  pickers?: PickerFilter[];
  dates?: boolean;
  search?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("AdminFinances");
  const { searchParams, update, activeCount } = useRegisterQuery();
  const [open, setOpen] = useState(false);
  const urlQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(urlQ);

  useEffect(() => setQ(urlQ), [urlQ]);
  useEffect(() => {
    if (q === urlQ) return;
    const timer = window.setTimeout(() => update({ q: q.trim() || null }), 400);
    return () => window.clearTimeout(timer);
  }, [q, urlQ, update]);

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const today = tbilisiToday();
  const thisMonth = monthStart(today);
  const lastMonthEnd = addDays(thisMonth, -1);
  const presets = [
    { key: "thisMonth", from: thisMonth, to: today },
    { key: "lastMonth", from: monthStart(lastMonthEnd), to: lastMonthEnd },
    { key: "thisYear", from: `${today.slice(0, 4)}-01-01`, to: today },
  ] as const;

  return (
    <div className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        {search && (
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t("common.searchPlaceholder")}
            aria-label={t("filters.search")}
            className={cn(inputClass, "min-w-0 flex-1 basis-[220px]")}
          />
        )}
        <Button
          className="md:hidden"
          icon={<SlidersHorizontal className="h-4 w-4" />}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("filters.title")}
          {activeCount > 0 && ` (${activeCount})`}
        </Button>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ("");
              update(
                Object.fromEntries(FILTER_PARAMS.map((key) => [key, null])),
              );
            }}
          >
            {t("filters.reset")}
          </Button>
        )}
        {children}
      </div>

      <div
        className={cn(
          "gap-3 sm:grid-cols-2 lg:grid-cols-4",
          open ? "grid" : "hidden md:grid",
        )}
      >
        {dates && (
          <>
            <Field label={t("filters.from")}>
              <DateField
                value={from}
                max={to || undefined}
                clearable
                onChange={(value) => update({ from: value || null })}
              />
            </Field>
            <Field label={t("filters.to")}>
              <DateField
                value={to}
                min={from || undefined}
                clearable
                onChange={(value) => update({ to: value || null })}
              />
            </Field>
          </>
        )}
        {selects.map((filter) => (
          <Field
            key={filter.param}
            label={filter.label}
            htmlFor={`filter-${filter.param}`}
          >
            <Select
              id={`filter-${filter.param}`}
              value={searchParams.get(filter.param) ?? ""}
              placeholder={t("filters.any")}
              options={filter.options}
              onChange={(value) => update({ [filter.param]: value || null })}
            />
          </Field>
        ))}
        {pickers.map((filter) => (
          <PickerControl
            key={filter.param}
            filter={filter}
            searchParams={searchParams}
            update={update}
          />
        ))}
        {dates && (
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => update({ from: preset.from, to: preset.to })}
                className={cn(
                  "min-h-[44px] rounded-xl border px-3 text-[12px] font-bold transition-colors",
                  from === preset.from && to === preset.to
                    ? "border-[#0F172A] bg-[#0F172A] text-white"
                    : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]",
                )}
              >
                {t(`filters.${preset.key}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
