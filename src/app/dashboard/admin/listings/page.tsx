"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Star,
  Ban,
  CheckCircle,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";
import type { Enums } from "@/lib/types/database";

type ListingItem = {
  id: string;
  title: string;
  ownerName: string;
  ownerId: string;
  kind: "property" | "service";
  status: Enums<"listing_status"> | null;
  views: number | null;
  createdAt: string | null;
  isVip: boolean | null;
};

type SortField =
  | "title"
  | "ownerName"
  | "kind"
  | "status"
  | "views"
  | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

const statusLabels: Record<Enums<"listing_status">, string> = {
  active: "აქტიური",
  blocked: "დაბლოკილი",
  pending: "მოლოდინში",
  draft: "მონახაზი",
};

const statusBadgeMap: Record<
  Enums<"listing_status">,
  "active" | "blocked" | "pending"
> = {
  active: "active",
  blocked: "blocked",
  pending: "pending",
  draft: "pending",
};

export default function ListingsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ListingItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "property" | "service">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<
    Enums<"listing_status"> | "all"
  >("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      try {
        const [{ data: profiles }, { data: props }, { data: services }] =
          await Promise.all([
            supabase.from("profiles").select("id, display_name"),
            supabase
              .from("properties")
              .select("*")
              .order("created_at", { ascending: false }),
            supabase
              .from("services")
              .select("*")
              .order("created_at", { ascending: false }),
          ]);

        const nameMap = new Map<string, string>();
        profiles?.forEach((p) => nameMap.set(p.id, p.display_name));

        const allItems: ListingItem[] = [
          ...(props?.map((p) => ({
            id: p.id,
            title: p.title,
            ownerName: nameMap.get(p.owner_id) ?? "—",
            ownerId: p.owner_id,
            kind: "property" as const,
            status: p.status,
            views: p.views_count,
            createdAt: p.created_at,
            isVip: p.is_vip,
          })) ?? []),
          ...(services?.map((s) => ({
            id: s.id,
            title: s.title,
            ownerName: nameMap.get(s.owner_id) ?? "—",
            ownerId: s.owner_id,
            kind: "service" as const,
            status: s.status,
            views: s.views_count,
            createdAt: s.created_at,
            isVip: s.is_vip,
          })) ?? []),
        ];

        setItems(allItems);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    let result = [...items];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.ownerName.toLowerCase().includes(q),
      );
    }

    if (kindFilter !== "all") {
      result = result.filter((item) => item.kind === kindFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") cmp = a.title.localeCompare(b.title);
      else if (sortField === "ownerName")
        cmp = a.ownerName.localeCompare(b.ownerName);
      else if (sortField === "kind") cmp = a.kind.localeCompare(b.kind);
      else if (sortField === "status")
        cmp = (a.status ?? "").localeCompare(b.status ?? "");
      else if (sortField === "views") cmp = (a.views ?? 0) - (b.views ?? 0);
      else if (sortField === "createdAt")
        cmp =
          new Date(a.createdAt ?? "").getTime() -
          new Date(b.createdAt ?? "").getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, searchQuery, kindFilter, statusFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) setSelected(new Set());
    else setSelected(new Set(paginated.map((i) => i.id)));
  };

  const handleBulkAction = async (action: "approve" | "block" | "vip") => {
    if (selected.size === 0) return;
    const supabase = createClient();

    for (const id of selected) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      const table = item.kind === "property" ? "properties" : "services";

      if (action === "approve") {
        await supabase
          .from(table)
          .update({ status: "active" as Enums<"listing_status"> })
          .eq("id", id);
      } else if (action === "block") {
        await supabase
          .from(table)
          .update({ status: "blocked" as Enums<"listing_status"> })
          .eq("id", id);
      } else if (action === "vip") {
        await supabase.from(table).update({ is_vip: true }).eq("id", id);
      }
    }

    setItems((prev) =>
      prev.map((item) => {
        if (!selected.has(item.id)) return item;
        if (action === "approve")
          return { ...item, status: "active" as Enums<"listing_status"> };
        if (action === "block")
          return { ...item, status: "blocked" as Enums<"listing_status"> };
        if (action === "vip") return { ...item, isVip: true };
        return item;
      }),
    );
    setSelected(new Set());
  };

  const SortableHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-[#94A3B8] hover:text-[#1E293B]"
    >
      {children}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-black leading-[30px] tracking-[-0.5px] text-[#1E293B]">
          განცხადებები
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          ქონების და სერვისების მართვა
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="ძიება სათაურით ან მესაკუთრით..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 pl-10 pr-4 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] placeholder:text-[#94A3B8] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
          />
        </div>
        <select
          value={kindFilter}
          onChange={(e) => {
            setKindFilter(e.target.value as "all" | "property" | "service");
            setPage(0);
          }}
          className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:outline-none"
        >
          <option value="all">ყველა ტიპი</option>
          <option value="property">ქონება</option>
          <option value="service">სერვისი</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as Enums<"listing_status"> | "all");
            setPage(0);
          }}
          className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:outline-none"
        >
          <option value="all">ყველა სტატუსი</option>
          {Object.entries(statusLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-accent-light px-4 py-2.5"
        >
          <span className="text-sm font-medium text-[#1E293B]">
            {selected.size} მონიშნული
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction("approve")}
          >
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
            დადასტურება
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction("block")}
          >
            <Ban className="mr-1.5 h-3.5 w-3.5" />
            დაბლოკვა
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction("vip")}
          >
            <Star className="mr-1.5 h-3.5 w-3.5" />
            VIP
          </Button>
        </motion.div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Header row */}
            <div className="grid grid-cols-7 gap-4 rounded-t-lg bg-[#F8FAFC] px-4 py-2.5">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={
                    selected.size === paginated.length && paginated.length > 0
                  }
                  onChange={toggleSelectAll}
                  className="mr-3 h-4 w-4 rounded border-[#E2E8F0]"
                />
                <SortableHeader field="title">სათაური</SortableHeader>
              </div>
              <SortableHeader field="ownerName">მესაკუთრე</SortableHeader>
              <SortableHeader field="kind">ტიპი</SortableHeader>
              <SortableHeader field="status">სტატუსი</SortableHeader>
              <SortableHeader field="views">ნახვები</SortableHeader>
              <SortableHeader field="createdAt">თარიღი</SortableHeader>
              <span className="text-xs font-medium text-[#94A3B8]">
                მოქმედება
              </span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {paginated.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-7 items-center gap-4 px-4 py-3 transition-colors hover:bg-[#F8FAFC]/60"
                >
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="mr-3 h-4 w-4 rounded border-[#E2E8F0]"
                    />
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate text-sm font-medium text-[#1E293B]">
                        {item.title}
                      </span>
                      {item.isVip && (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                    </div>
                  </div>
                  <p className="truncate text-sm text-[#94A3B8]">
                    {item.ownerName}
                  </p>
                  <p className="text-sm text-[#94A3B8]">
                    {item.kind === "property" ? "ქონება" : "სერვისი"}
                  </p>
                  <div>
                    <StatusBadge
                      status={statusBadgeMap[item.status ?? "pending"]}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-[#94A3B8]">
                    <Eye className="h-3.5 w-3.5" />
                    {(item.views ?? 0)
                      .toString()
                      .replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
                  </div>
                  <p className="text-sm text-[#94A3B8]">
                    {formatDate(item.createdAt)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const supabase = createClient();
                        const table =
                          item.kind === "property" ? "properties" : "services";
                        const newStatus: Enums<"listing_status"> =
                          item.status === "active" ? "blocked" : "active";
                        await supabase
                          .from(table)
                          .update({ status: newStatus })
                          .eq("id", item.id);
                        setItems((prev) =>
                          prev.map((i) =>
                            i.id === item.id ? { ...i, status: newStatus } : i,
                          ),
                        );
                      }}
                      className="h-7 text-xs"
                    >
                      {item.status === "active" ? "დაბლოკვა" : "აქტივაცია"}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#94A3B8]">
            {filtered.length} განცხადება • გვერდი {page + 1} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-lg border border-[#E2E8F0] p-2 text-[#94A3B8] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-[#E2E8F0] p-2 text-[#94A3B8] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
