"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Briefcase, Home, Loader2, Search, UserRound, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { AuditTimeline } from "@/components/admin/AuditTimeline";
import type { AuditSearchResult } from "@/app/api/admin/logs/route";

const KIND_ICONS = {
  user: UserRound,
  property: Home,
  service: Briefcase,
} as const;

const KIND_CHIP_CLASSES = {
  user: "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]",
  property: "bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE]",
  service: "bg-[#ECFDF5] text-[#10B981] hover:bg-[#D1FAE5]",
} as const;

function LogsPageContent() {
  const t = useTranslations("AdminLogs");
  const router = useRouter();
  const searchParams = useSearchParams();

  const userId = searchParams.get("user") ?? undefined;
  const propertyId = searchParams.get("property") ?? undefined;
  const serviceId = searchParams.get("service") ?? undefined;
  const activeFilter = userId
    ? ({ kind: "user", id: userId } as const)
    : propertyId
      ? ({ kind: "property", id: propertyId } as const)
      : serviceId
        ? ({ kind: "service", id: serviceId } as const)
        : null;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuditSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Friendly name of the active filter — known when it was picked from search
  // results; deep links fall back to the generic kind label.
  const [filterLabel, setFilterLabel] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/admin/logs?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload: { results?: AuditSearchResult[] } | null) => {
          setResults(payload?.results ?? []);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function selectResult(result: AuditSearchResult) {
    setFilterLabel(result.label);
    setQuery("");
    setResults(null);
    router.replace(`/dashboard/admin/logs?${result.kind}=${result.id}`);
  }

  function clearFilter() {
    setFilterLabel(null);
    router.replace("/dashboard/admin/logs");
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10">
      <div className="pb-2">
        <h1 className="text-[32px] font-black leading-[32px] tracking-[-0.8px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm font-medium leading-[21px] text-[#64748B]">
          {t("subtitle")}
        </p>
      </div>

      <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-11 pr-10 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
          />
          {searching ? (
            <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#94A3B8]" />
          ) : null}
        </div>

        {results !== null ? (
          results.length === 0 ? (
            <p className="mt-3 text-sm font-medium text-[#94A3B8]">
              {t("searchEmpty")}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {results.map((result) => {
                const Icon = KIND_ICONS[result.kind];
                return (
                  <button
                    key={`${result.kind}-${result.id}`}
                    type="button"
                    onClick={() => selectResult(result)}
                    className={`inline-flex h-11 items-center gap-2 rounded-[12px] px-3.5 text-[13px] font-bold ${KIND_CHIP_CLASSES[result.kind]}`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[220px] truncate">
                      {result.label}
                    </span>
                    {result.sublabel ? (
                      <span className="font-medium opacity-70">
                        {result.sublabel}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )
        ) : null}

        {activeFilter ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[1.2px] text-[#64748B]">
              {t("activeFilter")}
            </span>
            <span
              className={`inline-flex items-center gap-2 rounded-[12px] px-3.5 py-2 text-[13px] font-bold ${KIND_CHIP_CLASSES[activeFilter.kind].split(" hover:")[0]}`}
            >
              {filterLabel ?? t(`kinds.${activeFilter.kind}`)}
              <button
                type="button"
                onClick={clearFilter}
                aria-label={t("clearFilter")}
                className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/60"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        ) : null}
      </section>

      <AuditTimeline
        key={`${userId ?? ""}-${propertyId ?? ""}-${serviceId ?? ""}`}
        userId={userId}
        propertyId={propertyId}
        serviceId={serviceId}
      />
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense>
      <LogsPageContent />
    </Suspense>
  );
}
