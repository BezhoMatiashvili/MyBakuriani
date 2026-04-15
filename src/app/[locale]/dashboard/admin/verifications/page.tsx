"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatPhone } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type VerificationWithRelations = Tables<"verifications"> & {
  user?: Tables<"profiles"> | null;
  property?: Tables<"properties"> | null;
};

const PAGE_SIZE = 8;

export default function VerificationsPage() {
  const [loading, setLoading] = useState(true);
  const [verifications, setVerifications] = useState<
    VerificationWithRelations[]
  >([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/verifications/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "შეცდომა");
      toast.success(
        action === "approve"
          ? "ვერიფიკაცია დამტკიცდა"
          : "ვერიფიკაცია უარყოფილია",
      );
      setVerifications((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    const supabase = createClient();
    async function loadVerifications() {
      try {
        const { data } = await supabase
          .from("verifications")
          .select(
            "*, user:profiles!verifications_user_id_fkey(*), property:properties!verifications_property_id_fkey(*)",
          )
          .order("created_at", { ascending: false });
        setVerifications((data as VerificationWithRelations[]) ?? []);
      } finally {
        setLoading(false);
      }
    }

    loadVerifications();
  }, []);

  const rows = useMemo(() => {
    return verifications.map((item) => {
      const createdAt = new Date(item.created_at ?? "");
      const elapsedHours = Math.max(
        1,
        Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60)),
      );
      const initials = (item.user?.display_name ?? "მ ს")
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      return {
        ...item,
        elapsedHours,
        isOver24: elapsedHours > 24,
        risk: elapsedHours > 24 ? "HIGH RISK" : "LOW RISK",
        initials,
        napr:
          "44.01." +
          String((item.user_id ?? "").length * 12 + 11) +
          "." +
          String((item.id ?? "").length * 17 + 1),
      };
    });
  }, [verifications]);

  const over24Count = rows.filter((item) => item.isOver24).length;
  const highRiskCount = rows.filter((item) => item.risk === "HIGH RISK").length;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginated = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pageWindow = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push("...");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i += 1
    ) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-7 pb-10">
      <div className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          ვერიფიკაციის გვერდი
        </h1>
        <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
          ახალი ობიექტების შემოწმება
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-5 py-2 text-[13px] font-semibold text-[#B45309]">
          <AlertTriangle className="h-4 w-4" />
          &gt;24h რიგში ({over24Count})
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#FECACA] bg-[#FEF2F2] px-5 py-2 text-[13px] font-semibold text-[#B91C1C]">
          <Flame className="h-4 w-4" />
          მაღალი რისკი ({highRiskCount})
        </span>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-[56px_1.4fr_1fr_1.2fr_1.1fr_120px] items-center gap-3 border-b border-[#EDF2F7] px-6 py-4 text-sm font-semibold text-[#64748B]">
          <div className="flex justify-center">
            <input
              type="checkbox"
              checked={
                paginated.length > 0 && selected.size === paginated.length
              }
              onChange={() => {
                if (selected.size === paginated.length) {
                  setSelected(new Set());
                  return;
                }
                setSelected(new Set(paginated.map((item) => item.id)));
              }}
              className="h-5 w-5 rounded-md border-[#CBD5E1]"
            />
          </div>
          <span>მესაკუთრე / ID</span>
          <span>SLA / რისკები</span>
          <span>მოთხოვნა &amp; პაკეტი</span>
          <span>საკადასტრო (NAPR)</span>
          <span className="text-center">მოქმედება</span>
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
            <p className="text-sm">ვერიფიკაციები ვერ მოიძებნა</p>
          </div>
        ) : (
          paginated.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-[56px_1.4fr_1fr_1.2fr_1.1fr_120px] items-center gap-3 border-b border-[#F1F5F9] px-6 py-5 last:border-b-0"
            >
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  className="h-5 w-5 rounded-md border-[#CBD5E1]"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2F7] text-sm font-black text-[#475569]">
                  {item.initials}
                </div>
                <div>
                  <p className="text-[16px] font-black leading-6 text-[#0F172A]">
                    {item.user?.display_name ?? "—"}
                  </p>
                  <p className="text-sm font-medium text-[#94A3B8]">
                    ID: MB-{String(item.user_id ?? "").slice(0, 4)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[20px] font-black leading-7 text-[#B91C1C]">
                  SLA: {item.elapsedHours}h
                </p>
                <p className="text-[14px] font-bold leading-[21px] text-[#B91C1C]">
                  მოლოდინი
                </p>
                <span
                  className={`mt-2 inline-flex items-center rounded-lg px-3 py-1 text-xs font-extrabold tracking-[1.2px] ${
                    item.risk === "HIGH RISK"
                      ? "bg-[#FEE2E2] text-[#B91C1C]"
                      : "bg-[#DCFCE7] text-[#15803D]"
                  }`}
                >
                  {item.risk}
                </span>
              </div>

              <div>
                <span className="inline-flex rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-[14px] font-bold leading-[21px] text-[#1D4ED8]">
                  {item.property?.title ?? "FB პაკეტი"} (30₾)
                </span>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  {formatDate(item.created_at)} •{" "}
                  {item.user?.phone ? formatPhone(item.user.phone) : "—"}
                </p>
              </div>

              <div>
                <span className="inline-flex rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[14px] font-bold leading-[21px] text-[#475569]">
                  {item.property?.cadastral_code ?? "—"}
                </span>
              </div>

              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => moderate(item.id, "approve")}
                  disabled={busyId === item.id}
                  aria-label="დადასტურება"
                  className="inline-flex h-12 min-h-[44px] w-12 items-center justify-center rounded-xl bg-[#059669] text-white shadow-[0px_8px_20px_rgba(5,150,105,0.25)] transition-colors hover:bg-[#047857] disabled:opacity-50"
                >
                  {busyId === item.id ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Check className="h-5 w-5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => moderate(item.id, "reject")}
                  disabled={busyId === item.id}
                  aria-label="უარყოფა"
                  className="inline-flex h-12 min-h-[44px] w-12 items-center justify-center rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] transition-colors hover:bg-[#FEE2E2] disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </section>

      <div className="flex items-center justify-center gap-3">
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
                page === entry
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
    </div>
  );
}
