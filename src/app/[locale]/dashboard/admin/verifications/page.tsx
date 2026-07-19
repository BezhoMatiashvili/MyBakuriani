"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatPhone } from "@/lib/utils/format";
import type { PendingListing } from "@/app/api/admin/listings/pending/route";
import ListingAuditPanel from "@/components/admin/ListingAuditPanel";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";

const PAGE_SIZE = 8;

type FilterKey = "all" | PendingListing["category"];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "ყველა" },
  { key: "rental", label: "ქირავდება" },
  { key: "sale", label: "იყიდება" },
  { key: "food", label: "კვება" },
  { key: "transport", label: "ტრანსპორტი" },
  { key: "entertainment", label: "გართობა" },
  { key: "employment", label: "სამუშაო" },
  { key: "service", label: "სერვისი" },
];

const CATEGORY_BADGE: Record<
  PendingListing["category"],
  { label: string; cls: string }
> = {
  rental: {
    label: "ქირავდება",
    cls: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  },
  sale: {
    label: "იყიდება",
    cls: "border-[#FBCFE8] bg-[#FDF2F8] text-[#9D174D]",
  },
  food: {
    label: "კვება",
    cls: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
  },
  transport: {
    label: "ტრანსპორტი",
    cls: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  },
  entertainment: {
    label: "გართობა",
    cls: "border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]",
  },
  employment: {
    label: "სამუშაო",
    cls: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  },
  service: {
    label: "სერვისი",
    cls: "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]",
  },
};

function initialsOf(name: string | null | undefined): string {
  if (!name) return "მ ს";
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function VerificationsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingListing[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/listings/pending", {
          cache: "no-store",
        });
        const payload = await res.json();
        if (!active) return;
        if (!res.ok)
          throw new Error(payload.error ?? "ვერ ჩაიტვირთა მონაცემები");
        setItems((payload.items ?? []) as PendingListing[]);
      } catch (err) {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : "შეცდომა");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function quickModerate(
    item: PendingListing,
    action: "approve" | "reject",
  ) {
    let notes: string | undefined;
    if (action === "reject") {
      const input = window.prompt("მიუთითეთ უარყოფის მიზეზი (არასავალდებულო):");
      if (input === null) return;
      notes = input.trim() || undefined;
    }
    const key = `${item.kind}:${item.id}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/admin/listings/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: item.kind,
          id: item.id,
          action,
          notes,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "შეცდომა");
      toast.success(
        action === "approve" ? "განცხადება დამტკიცდა" : "განცხადება უარყოფილია",
      );
      removeItem(item);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setBusyKey(null);
    }
  }

  function removeItem(item: PendingListing) {
    const key = `${item.kind}:${item.id}`;
    setItems((prev) =>
      prev.filter((it) => !(it.kind === item.kind && it.id === item.id)),
    );
    setExpandedKey((cur) => (cur === key ? null : cur));
  }

  const counts = useMemo(() => {
    const map: Record<FilterKey, number> = {
      all: items.length,
      rental: 0,
      sale: 0,
      food: 0,
      transport: 0,
      entertainment: 0,
      employment: 0,
      service: 0,
    };
    for (const it of items) map[it.category] += 1;
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const byCategory =
      filter === "all" ? items : items.filter((it) => it.category === filter);
    const q = search.trim().toLowerCase();
    if (!q) return byCategory;
    const digits = q.replace(/\D/g, "");
    return byCategory.filter(
      (it) =>
        it.id.toLowerCase().includes(q) ||
        it.title.toLowerCase().includes(q) ||
        (it.owner?.display_name ?? "").toLowerCase().includes(q) ||
        (digits.length > 0 &&
          (it.owner?.phone ?? "").replace(/\D/g, "").includes(digits)),
    );
  }, [items, filter, search]);

  const rows = useMemo(() => {
    return filtered.map((item) => {
      const createdAt = item.created_at ? new Date(item.created_at) : null;
      const elapsedHours = createdAt
        ? Math.max(
            1,
            Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60)),
          )
        : 0;
      return {
        ...item,
        elapsedHours,
        isOver24: elapsedHours > 24,
      };
    });
  }, [filtered]);

  const over24Count = rows.filter((it) => it.isOver24).length;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = rows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const pageWindow = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safePage > 3) pages.push("...");
    for (
      let i = Math.max(2, safePage - 1);
      i <= Math.min(totalPages - 1, safePage + 1);
      i += 1
    ) {
      pages.push(i);
    }
    if (safePage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  }, [safePage, totalPages]);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-7 pb-10">
      <div className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          ვერიფიკაციის გვერდი
        </h1>
        <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
          ყველა კატეგორიის ახალი განცხადებების შემოწმება
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(({ key, label }) => {
          const isActive = filter === key;
          const count = counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors ${
                isActive
                  ? "border-[#2563EB] bg-[#2563EB] text-white"
                  : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-[#F1F5F9] text-[#475569]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {over24Count > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-5 py-2 text-[13px] font-semibold text-[#B45309]">
            <AlertTriangle className="h-4 w-4" />
            &gt;24h რიგში ({over24Count})
          </span>
        </div>
      )}

      <AdminSearchInput
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onClear={() => {
          setSearch("");
          setPage(1);
        }}
        placeholder="ძიება (ID, სახელი, ტელეფონი)..."
      />

      <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="hidden lg:grid lg:grid-cols-[1.2fr_140px_1.6fr_140px_160px_32px] items-center gap-3 border-b border-[#EDF2F7] px-6 py-4 text-sm font-semibold text-[#64748B]">
          <span>მესაკუთრე</span>
          <span>კატეგორია</span>
          <span>განცხადება</span>
          <span>გადახედვა</span>
          <span className="text-center">მოქმედება</span>
          <span />
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Skeleton key={idx} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-[#94A3B8]">
            <Search className="h-9 w-9" />
            <p className="text-sm">დასამტკიცებელი განცხადებები ვერ მოიძებნა</p>
          </div>
        ) : (
          paginated.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const badge = CATEGORY_BADGE[item.category];
            const isExpanded = expandedKey === key;
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="border-b border-[#F1F5F9] last:border-b-0"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedKey(isExpanded ? null : key);
                    }
                  }}
                  aria-expanded={isExpanded}
                  className={`grid cursor-pointer grid-cols-1 gap-3 lg:grid-cols-[1.2fr_140px_1.6fr_140px_160px_32px] items-center px-6 py-5 transition-colors hover:bg-[#F8FAFC] ${
                    isExpanded ? "bg-[#F8FAFC]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2F7] text-sm font-black text-[#475569]">
                      {initialsOf(item.owner?.display_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-black leading-6 text-[#0F172A]">
                        {item.owner?.display_name ?? "—"}
                      </p>
                      <p className="truncate text-sm font-medium text-[#94A3B8]">
                        {item.owner?.phone
                          ? formatPhone(item.owner.phone)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span
                      className={`inline-flex rounded-lg border px-3 py-1.5 text-[12px] font-extrabold tracking-[0.6px] ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold leading-[22px] text-[#0F172A]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-[#94A3B8]">
                      {formatDate(item.created_at)} •{" "}
                      {item.elapsedHours > 0
                        ? `${item.elapsedHours}h რიგში`
                        : "ახალი"}
                    </p>
                  </div>

                  <div>
                    <a
                      href={item.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[13px] font-bold text-[#1D4ED8] transition-colors hover:bg-[#EFF6FF]"
                    >
                      <Eye className="h-4 w-4" />
                      ნახე საიტზე
                    </a>
                  </div>

                  <div className="flex justify-start gap-2 lg:justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        quickModerate(item, "approve");
                      }}
                      disabled={busyKey === key}
                      aria-label="დადასტურება"
                      className="inline-flex h-12 min-h-[44px] w-12 items-center justify-center rounded-xl bg-[#059669] text-white shadow-[0px_8px_20px_rgba(5,150,105,0.25)] transition-colors hover:bg-[#047857] disabled:opacity-50"
                    >
                      {busyKey === key ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Check className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        quickModerate(item, "reject");
                      }}
                      disabled={busyKey === key}
                      aria-label="უარყოფა"
                      className="inline-flex h-12 min-h-[44px] w-12 items-center justify-center rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] transition-colors hover:bg-[#FEE2E2] disabled:opacity-50"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <ChevronDown
                    className={`h-5 w-5 text-[#94A3B8] transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.section
                      key="panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <ListingAuditPanel
                        kind={item.kind}
                        id={item.id}
                        onModerated={() => removeItem(item)}
                      />
                    </motion.section>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#475569]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {pageWindow.map((entry, idx) =>
            entry === "..." ? (
              <span key={`dots-${idx}`} className="px-1 text-xl text-[#94A3B8]">
                ...
              </span>
            ) : (
              <button
                type="button"
                key={entry}
                onClick={() => setPage(entry)}
                className={`inline-flex h-12 w-12 items-center justify-center rounded-full border text-lg font-bold ${
                  safePage === entry
                    ? "border-[#2563EB] bg-[#2563EB] text-white"
                    : "border-[#E2E8F0] bg-white text-[#334155]"
                }`}
              >
                {entry}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#475569]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
