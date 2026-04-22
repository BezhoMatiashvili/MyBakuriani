"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type ListingRow = {
  id: string;
  title: string;
  status: string | null;
  views_count: number | null;
  owner: { display_name: string } | null;
  price_per_night?: number | null;
  sale_price?: number | null;
  type?: string;
  category?: string;
  location?: string | null;
};

const CATEGORY_OPTIONS: {
  label: string;
  value: "all" | "property" | "transport" | "services";
}[] = [
  { label: "ყველა კატეგორია", value: "all" },
  { label: "ბინები", value: "property" },
  { label: "ტრანსპორტი", value: "transport" },
  { label: "სერვისები / ხელოსნები", value: "services" },
];

const STATUS_BADGES: Record<string, string> = {
  active: "border-[#D1FAE5] bg-[#ECFDF5] text-[#10B981]",
  blocked: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  pending: "border-[#FEF3C7] bg-[#FEF9C3] text-[#B45309]",
  draft: "border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]",
};

const STATUS_LABELS: Record<string, string> = {
  active: "აქტიური",
  blocked: "გაჩერებული",
  pending: "მოლოდინში",
  draft: "შავი ვარიანტი",
};

export default function ListingsPage() {
  const [category, setCategory] =
    useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [kind, setKind] = useState<"property" | "service">("property");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/listings?category=${category}`, {
      cache: "no-store",
    });
    const text = await res.text();
    const payload = text
      ? (JSON.parse(text) as {
          error?: string;
          kind?: "property" | "service";
          rows?: unknown[];
        })
      : {};
    if (!res.ok || !payload.kind || !payload.rows) {
      toast.error(payload.error ?? `ჩატვირთვა ვერ მოხერხდა (${res.status})`);
      setRows([]);
    } else {
      setKind(payload.kind);
      setRows(
        (payload.rows as (Tables<"properties"> | Tables<"services">)[]).map(
          (r) => {
            const asProperty = r as Tables<"properties"> & {
              owner: { display_name: string } | null;
            };
            const asService = r as Tables<"services"> & {
              owner: { display_name: string } | null;
            };
            return {
              id: r.id,
              title: r.title,
              status: r.status,
              views_count: r.views_count ?? 0,
              owner: (
                r as unknown as { owner: { display_name: string } | null }
              ).owner,
              price_per_night:
                payload.kind === "property" ? asProperty.price_per_night : null,
              sale_price:
                payload.kind === "property" ? asProperty.sale_price : null,
              type: payload.kind === "property" ? asProperty.type : undefined,
              category:
                payload.kind === "service" ? asService.category : undefined,
              location: r.location ?? null,
            } satisfies ListingRow;
          },
        ),
      );
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(
    id: string,
    nextStatus: "active" | "blocked" | "draft",
  ) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/listings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, kind, status: nextStatus }),
      });
      const text = await res.text();
      const payload = text
        ? (JSON.parse(text) as { error?: string })
        : ({} as { error?: string });
      if (!res.ok) throw new Error(payload.error ?? "შეცდომა");
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)),
      );
      toast.success("სტატუსი განახლდა");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setBusyId(null);
    }
  }

  const currentCategory =
    CATEGORY_OPTIONS.find((o) => o.value === category) ?? CATEGORY_OPTIONS[0];

  return (
    <div className="bg-[#F8FAFC]">
      <div className="h-full w-full px-0 py-0">
        <div className="mb-6 flex w-full flex-wrap items-start justify-between gap-6 pb-2">
          <div>
            <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
              განცხადებების მართვა
            </h1>
            <p className="mt-2 text-sm font-medium leading-[21px] text-[#64748B]">
              ხარისხის კონტროლი და ოპერაციული მეტრიკები.
            </p>
          </div>
          <div className="relative w-[240px] shrink-0 pt-2">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex h-[44px] w-full items-center justify-between rounded-xl border border-[#2563EB] bg-white px-4"
            >
              <span className="text-[13px] font-bold text-[#334155]">
                {currentCategory.label}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-[#2563EB] transition-transform ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[48px] z-20 w-full rounded-xl border border-[#ECFDF5] bg-white py-1.5 shadow-[0_15px_35px_rgba(0,0,0,0.08)]">
                {CATEGORY_OPTIONS.map((option) => {
                  const active = option.value === category;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setCategory(option.value);
                        setMenuOpen(false);
                      }}
                      className={`flex h-[44px] w-full items-center justify-between border-t border-[#F8FAFC] px-4 text-left first:border-t-0 ${
                        active ? "bg-[#EFF6FF]" : "bg-white"
                      }`}
                    >
                      <span
                        className={`text-[13px] ${
                          active
                            ? "font-bold text-[#2563EB]"
                            : "font-medium text-[#475569]"
                        }`}
                      >
                        {option.label}
                      </span>
                      <Check
                        className={`h-[13px] w-[13px] text-[#2563EB] ${
                          active ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 border-b border-[#E2E8F0] bg-[#F8FAFCCC] px-6 py-5 text-[11px] font-bold uppercase tracking-[1.2px] text-[#64748B]">
            <span>ობიექტი</span>
            <span>მფლობელი</span>
            <span>ფასი</span>
            <span>სტატუსი</span>
            <span className="text-right">ოპერაციები</span>
          </div>

          {loading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-[#94A3B8]">
              განცხადებები ვერ მოიძებნა
            </div>
          ) : (
            rows.map((row) => {
              const price =
                row.price_per_night != null
                  ? `${formatPrice(row.price_per_night)}/ღამე`
                  : row.sale_price != null
                    ? formatPrice(row.sale_price)
                    : "—";
              const isBusy = busyId === row.id;
              const statusLabel =
                STATUS_LABELS[row.status ?? "pending"] ?? row.status ?? "—";
              const statusBadge =
                STATUS_BADGES[row.status ?? "pending"] ?? STATUS_BADGES.pending;
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 border-b border-[#F1F5F9] px-6 py-5 last:border-b-0"
                >
                  <div>
                    <p className="text-sm font-black leading-[19px] text-[#1E293B]">
                      {row.title}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-[#94A3B8]">
                      {row.type ?? row.category ?? ""} • {row.views_count ?? 0}{" "}
                      ნახვა • {row.location ?? "—"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[#334155]">
                    {row.owner?.display_name ?? "—"}
                  </p>
                  <p className="text-sm font-bold text-[#0F172A]">{price}</p>
                  <span
                    className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.5px] ${statusBadge}`}
                  >
                    {statusLabel}
                  </span>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setStatus(
                          row.id,
                          row.status === "active" ? "blocked" : "active",
                        )
                      }
                      disabled={isBusy}
                      className="inline-flex h-9 min-h-[36px] w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] disabled:opacity-50"
                      aria-label={
                        row.status === "active" ? "გაჩერება" : "აქტივაცია"
                      }
                    >
                      {isBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : row.status === "active" ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(row.id, "draft")}
                      disabled={isBusy}
                      className="inline-flex h-9 min-h-[36px] w-9 items-center justify-center rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] disabled:opacity-50"
                      aria-label="Draft-ში გადატანა"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
