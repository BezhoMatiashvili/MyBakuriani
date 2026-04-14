"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import StatusBadge from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatPhone } from "@/lib/utils/format";
import type { Tables, Enums } from "@/lib/types/database";

type ProfileWithCounts = Tables<"profiles"> & {
  listings_count: number;
};

type SortField =
  | "display_name"
  | "phone"
  | "role"
  | "created_at"
  | "is_verified"
  | "listings_count";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

const roleLabels: Record<Enums<"user_role">, string> = {
  guest: "სტუმარი",
  renter: "დამქირავებელი",
  seller: "გამყიდველი",
  cleaner: "დამლაგებელი",
  food: "კვება",
  entertainment: "გართობა",
  transport: "ტრანსპორტი",
  employment: "დასაქმება",
  handyman: "ხელოსანი",
  admin: "ადმინი",
};

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileWithCounts[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Enums<"user_role"> | "all">(
    "all",
  );
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      try {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });

        if (profilesData) {
          const { data: propertiesData } = await supabase
            .from("properties")
            .select("owner_id");

          const countMap = new Map<string, number>();
          propertiesData?.forEach((p) => {
            countMap.set(p.owner_id, (countMap.get(p.owner_id) ?? 0) + 1);
          });

          const enriched: ProfileWithCounts[] = profilesData.map((p) => ({
            ...p,
            listings_count: countMap.get(p.id) ?? 0,
          }));
          setProfiles(enriched);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    let result = [...profiles];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.display_name.toLowerCase().includes(q) || p.phone.includes(q),
      );
    }

    if (roleFilter !== "all") {
      result = result.filter((p) => p.role === roleFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "display_name") {
        cmp = a.display_name.localeCompare(b.display_name);
      } else if (sortField === "phone") {
        cmp = a.phone.localeCompare(b.phone);
      } else if (sortField === "role") {
        cmp = a.role.localeCompare(b.role);
      } else if (sortField === "created_at") {
        cmp =
          new Date(a.created_at ?? "").getTime() -
          new Date(b.created_at ?? "").getTime();
      } else if (sortField === "is_verified") {
        cmp = Number(a.is_verified) - Number(b.is_verified);
      } else if (sortField === "listings_count") {
        cmp = a.listings_count - b.listings_count;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [profiles, searchQuery, roleFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
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

  const roles = Object.entries(roleLabels) as [Enums<"user_role">, string][];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-black leading-[30px] tracking-[-0.5px] text-[#1E293B]">
          კლიენტები
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          რეგისტრირებული მომხმარებლების მართვა
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="ძიება სახელით ან ტელეფონით..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 pl-10 pr-4 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] placeholder:text-[#94A3B8] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as Enums<"user_role"> | "all");
            setPage(0);
          }}
          className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:border-brand-accent focus:outline-none"
        >
          <option value="all">ყველა როლი</option>
          {roles.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header */}
            <div className="grid grid-cols-7 gap-4 rounded-t-lg bg-[#F8FAFC] px-4 py-2.5">
              <SortableHeader field="display_name">სახელი</SortableHeader>
              <SortableHeader field="phone">ტელეფონი</SortableHeader>
              <SortableHeader field="role">როლი</SortableHeader>
              <SortableHeader field="created_at">რეგისტრაცია</SortableHeader>
              <SortableHeader field="is_verified">სტატუსი</SortableHeader>
              <SortableHeader field="listings_count">
                განცხადებები
              </SortableHeader>
              <span className="text-xs font-medium text-[#94A3B8]">
                მოქმედება
              </span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {paginated.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-7 items-center gap-4 px-4 py-3 transition-colors hover:bg-[#F8FAFC]/60"
                >
                  <div>
                    <p className="truncate text-sm font-medium text-[#1E293B]">
                      {p.display_name}
                    </p>
                  </div>
                  <p className="truncate text-sm text-[#94A3B8]">
                    {formatPhone(p.phone)}
                  </p>
                  <p className="text-sm text-[#94A3B8]">{roleLabels[p.role]}</p>
                  <p className="text-sm text-[#94A3B8]">
                    {formatDate(p.created_at)}
                  </p>
                  <div>
                    <StatusBadge
                      status={p.is_verified ? "verified" : "pending"}
                    />
                  </div>
                  <p className="text-sm font-medium text-[#1E293B]">
                    {p.listings_count}
                  </p>
                  <div>
                    <Link
                      href={`/dashboard/admin/clients/${p.id}`}
                      className="text-sm font-medium text-brand-accent hover:underline"
                    >
                      დეტალები
                    </Link>
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
            {filtered.length} მომხმარებელი • გვერდი {page + 1} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-lg border border-[#E2E8F0] p-2 text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-[#E2E8F0] p-2 text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
