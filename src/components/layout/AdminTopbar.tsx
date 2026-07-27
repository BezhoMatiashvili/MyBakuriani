"use client";

import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  Building2,
  Home,
  Loader2,
  Search,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { LanguageSelector } from "@/components/LanguageSelector";
import { DashboardNotificationBell } from "@/components/layout/DashboardNotificationBell";
import { propertyViewUrl, serviceViewUrl } from "@/lib/utils/listingUrls";
import { formatPhone } from "@/lib/utils/format";
import type { AdminSearchResult } from "@/app/api/admin/search/route";

const KIND_ICONS = {
  client: UserRound,
  property: Home,
  service: Briefcase,
  company: Building2,
} as const;

interface AdminTopbarProps {
  userName: string;
  notificationCount?: number;
}

export function AdminTopbar({
  userName,
  notificationCount = 0,
}: AdminTopbarProps) {
  const tLayout = useTranslations("DashboardLayout");
  const tSidebar = useTranslations("DashboardSidebar");
  const router = useRouter();
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload: { results?: AdminSearchResult[] } | null) => {
          setResults(payload?.results ?? []);
          setActiveIndex(0);
        })
        .catch(() => {
          setResults([]);
          setActiveIndex(0);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (results === null) return;
    function handle(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setResults(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [results]);

  const clients = results?.filter((r) => r.kind === "client") ?? [];
  const listings =
    results?.filter((r) => r.kind === "property" || r.kind === "service") ?? [];
  const companies = results?.filter((r) => r.kind === "company") ?? [];
  const ordered = [...clients, ...listings, ...companies];

  function selectResult(result: AdminSearchResult) {
    setQuery("");
    setResults(null);
    if (result.kind === "client") {
      router.push(
        `/dashboard/admin/clients?q=${encodeURIComponent(result.phone ?? result.label)}`,
      );
    } else if (result.kind === "property") {
      router.push(
        propertyViewUrl({
          id: result.id,
          is_for_sale: result.is_for_sale ?? null,
          type: result.type ?? null,
        }),
      );
    } else if (result.kind === "service") {
      router.push(
        serviceViewUrl({ id: result.id, category: result.category ?? "" }),
      );
    } else {
      router.push("/dashboard/admin/companies");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setResults(null);
      e.currentTarget.blur();
      return;
    }
    if (results === null || ordered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, ordered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = ordered[activeIndex];
      if (result) selectResult(result);
    }
  }

  function renderRow(result: AdminSearchResult, index: number) {
    const Icon = KIND_ICONS[result.kind];
    return (
      <button
        key={`${result.kind}-${result.id}`}
        type="button"
        onClick={() => selectResult(result)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F8FAFC] ${
          index === activeIndex ? "bg-[#F1F5F9]" : ""
        }`}
      >
        <Icon className="h-4 w-4 shrink-0 text-[#64748B]" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold text-[#0F172A]">
            {result.label}
          </span>
          {result.sublabel ? (
            <span className="block text-[12px] text-[#64748B]">
              {result.kind === "client"
                ? formatPhone(result.sublabel)
                : result.sublabel}
            </span>
          ) : null}
        </span>
      </button>
    );
  }

  const groups: {
    header: string;
    items: AdminSearchResult[];
    offset: number;
  }[] = [
    { header: tLayout("topbar.searchClients"), items: clients, offset: 0 },
    {
      header: tLayout("topbar.searchListings"),
      items: listings,
      offset: clients.length,
    },
    {
      header: tLayout("topbar.searchCompanies"),
      items: companies,
      offset: clients.length + listings.length,
    },
  ];

  return (
    <header className="h-20 border-b border-[#E2E8F0] bg-white px-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] sm:px-8 xl:px-10">
      <div className="flex h-full w-full items-center justify-between gap-5">
        <div className="w-full min-w-0 max-w-[505px]">
          <div ref={containerRef} className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={tLayout("topbar.searchIdNumber")}
              className="h-[42px] w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-4 text-[13px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] shadow-[inset_0_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
            />
            {searching ? (
              <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#94A3B8]" />
            ) : null}

            {results !== null ? (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full max-h-[420px] overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white py-2 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)]">
                {ordered.length === 0 ? (
                  <p className="px-4 py-3 text-[13px] font-medium text-[#94A3B8]">
                    {tLayout("topbar.searchEmpty")}
                  </p>
                ) : (
                  groups.map((group) =>
                    group.items.length > 0 ? (
                      <div key={group.header}>
                        <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                          {group.header}
                        </p>
                        {group.items.map((result, i) =>
                          renderRow(result, group.offset + i),
                        )}
                      </div>
                    ) : null,
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-5">
          <LanguageSelector />
          <div className="h-8 w-px bg-[#E2E8F0]" />
          <DashboardNotificationBell
            initialUnreadCount={notificationCount}
            scope="admin"
            triggerClassName="relative inline-flex h-[44px] w-[44px] items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]"
          />
          <div className="hidden items-center gap-3 sm:flex">
            <p className="w-[98px] text-right text-[13px] font-bold leading-4 text-[#1E293B]">
              {tSidebar("roles.superAdmin")}
            </p>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563EB] text-[14px] font-bold leading-5 text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              {initials || "AD"}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
