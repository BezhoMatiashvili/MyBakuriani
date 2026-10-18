"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Home, Loader2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "./ui";

// A client, listing or service picked through the admin search
// (/api/admin/search), for the finance filters and forms (C42).

export type EntityKind = "client" | "property" | "service";

export type Entity = {
  kind: EntityKind;
  id: string;
  label: string;
  sublabel?: string | null;
};

type SearchResult = {
  kind: string;
  id: string;
  label: string;
  sublabel: string | null;
};

const ICONS = { client: UserRound, property: Home, service: Briefcase };

async function search(q: string, kinds: EntityKind[]): Promise<Entity[]> {
  const response = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return [];
  const payload = (await response.json().catch(() => null)) as {
    results?: SearchResult[];
  } | null;
  return (payload?.results ?? [])
    .filter((r): r is SearchResult & { kind: EntityKind } =>
      (kinds as string[]).includes(r.kind),
    )
    .map((r) => ({
      kind: r.kind,
      id: r.id,
      label: r.label,
      sublabel: r.sublabel,
    }));
}

/** The record behind an id taken from the URL (the search matches ids). */
export async function resolveEntity(
  id: string,
  kinds: EntityKind[],
): Promise<Entity | null> {
  const found = await search(id, kinds);
  return found.find((e) => e.id === id) ?? null;
}

export default function EntityPicker({
  kinds,
  value,
  onChange,
  placeholder,
  id,
  ariaLabel,
}: {
  kinds: EntityKind[];
  value: Entity | null;
  onChange: (value: Entity | null) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("AdminFinances");
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);
  const kindsKey = kinds.join(",");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const requestId = ++latest.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const found = await search(q, kindsKey.split(",") as EntityKind[]);
      if (requestId !== latest.current) return;
      setResults(found);
      setActive(0);
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, kindsKey]);

  function pick(entity: Entity) {
    onChange(entity);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  if (value) {
    const Icon = ICONS[value.kind];
    return (
      <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-3">
        <Icon className="h-4 w-4 shrink-0 text-[#64748B]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[14px] text-[#0F172A]">
          {value.label}
          {value.sublabel && (
            <span className="ml-2 text-[12px] text-[#94A3B8]">
              {value.sublabel}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={t("filters.clear")}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#64748B] hover:bg-[#F1F5F9]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const showList = open && query.trim().length >= 2;

  return (
    <div className="relative">
      <input
        id={id}
        type="search"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter" && showList && results[active]) {
            event.preventDefault();
            pick(results[active]);
          } else if (event.key === "Escape" && showList) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className={cn(inputClass, "pr-9")}
      />
      {loading && (
        <Loader2
          className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-[#94A3B8]"
          aria-hidden
        />
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-1 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.25)]"
        >
          {!loading && results.length === 0 && (
            <li className="px-3 py-2.5 text-[13px] text-[#94A3B8]">
              {t("filters.noMatches")}
            </li>
          )}
          {results.map((entity, index) => {
            const Icon = ICONS[entity.kind];
            return (
              <li
                key={`${entity.kind}:${entity.id}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(entity)}
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-3 text-[14px] text-[#0F172A]",
                  index === active ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-[#64748B]" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{entity.label}</span>
                {entity.sublabel && (
                  <span className="shrink-0 text-[12px] text-[#94A3B8]">
                    {entity.sublabel}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
