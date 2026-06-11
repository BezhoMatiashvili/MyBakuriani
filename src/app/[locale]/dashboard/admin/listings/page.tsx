"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  History,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import ListingAuditPanel from "@/components/admin/ListingAuditPanel";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/utils/format";
import { propertyViewUrl, serviceViewUrl } from "@/lib/utils/listingUrls";
import type { Tables } from "@/lib/types/database";

type ListingRow = {
  id: string;
  kind: "property" | "service";
  title: string;
  status: string | null;
  views_count: number | null;
  owner: { display_name: string } | null;
  price_per_night?: number | null;
  sale_price?: number | null;
  type?: string;
  category?: string;
  location?: string | null;
  is_new?: boolean | null;
  is_for_sale?: boolean | null;
};

const CATEGORY_VALUES = [
  "all",
  "property",
  "transport",
  "services",
  "food",
  "entertainment",
  "employment",
] as const;

const STATUS_BADGES: Record<string, string> = {
  active: "border-[#D1FAE5] bg-[#ECFDF5] text-[#10B981]",
  blocked: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  pending: "border-[#FEF3C7] bg-[#FEF9C3] text-[#B45309]",
  draft: "border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]",
};

export default function ListingsPage() {
  const t = useTranslations("AdminListings");
  const tShared = useTranslations("AdminShared");
  const tDash = useTranslations("DashboardShared");
  const tLogs = useTranslations("AdminLogs");

  const CATEGORY_OPTIONS = useMemo(
    () =>
      CATEGORY_VALUES.map((value) => ({
        value,
        label: t(`categories.${value}`),
      })),
    [t],
  );
  const [category, setCategory] =
    useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // One silent auto-retry per failure: transient auth/network hiccups (e.g.
  // Supabase 522s make requireAdmin briefly return 401) shouldn't strand the
  // admin on an error screen.
  const retriedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/listings?category=${category}`, {
        cache: "no-store",
      });
      const text = await res.text();
      const payload = text
        ? (JSON.parse(text) as { error?: string; rows?: unknown[] })
        : {};
      if (!res.ok || !Array.isArray(payload.rows)) {
        throw new Error(payload.error ?? `status ${res.status}`);
      }
      type RowPayload = (Tables<"properties"> | Tables<"services">) & {
        kind: "property" | "service";
        owner: { display_name: string } | null;
      };
      setRows(
        (payload.rows as RowPayload[]).map((r) => {
          const asProperty = r as Tables<"properties"> & RowPayload;
          const asService = r as Tables<"services"> & RowPayload;
          const isProperty = r.kind === "property";
          return {
            id: r.id,
            kind: r.kind,
            title: r.title,
            status: r.status,
            views_count: r.views_count ?? 0,
            owner: r.owner,
            price_per_night: isProperty ? asProperty.price_per_night : null,
            sale_price: isProperty ? asProperty.sale_price : null,
            type: isProperty ? asProperty.type : undefined,
            category: isProperty ? undefined : asService.category,
            location: r.location ?? null,
            is_new: isProperty ? null : (asService.is_new ?? false),
            is_for_sale: isProperty ? asProperty.is_for_sale : null,
          } satisfies ListingRow;
        }),
      );
      setLoadError(false);
      retriedRef.current = false;
    } catch {
      setRows([]);
      setLoadError(true);
      if (!retriedRef.current) {
        retriedRef.current = true;
        setTimeout(() => {
          load();
        }, 1500);
      }
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
    setExpandedId(null);
  }, [load]);

  async function setStatus(
    id: string,
    kind: "property" | "service",
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
      if (!res.ok) throw new Error(payload.error ?? tShared("error"));
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)),
      );
      toast.success(tShared("statusUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tShared("error"));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleIsNew(id: string, nextValue: boolean) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/listings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, kind: "service", is_new: nextValue }),
      });
      const text = await res.text();
      const payload = text
        ? (JSON.parse(text) as { error?: string })
        : ({} as { error?: string });
      if (!res.ok) throw new Error(payload.error ?? tShared("error"));
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_new: nextValue } : r)),
      );
      toast.success(nextValue ? t("markedNew") : t("unmarkedNew"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tShared("error"));
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
              {t("title")}
            </h1>
            <p className="mt-2 text-sm font-medium leading-[21px] text-[#64748B]">
              {t("subtitle")}
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
          <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 border-b border-[#E2E8F0] bg-[#F8FAFCCC] px-6 py-5 text-[11px] font-bold uppercase tracking-[1.2px] text-[#64748B]">
            <span>{t("colObject")}</span>
            <span>{t("colOwner")}</span>
            <span>{t("colPrice")}</span>
            <span>{t("colStatus")}</span>
            <span className="text-right">{t("colActions")}</span>
          </div>

          {loading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : loadError ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-[#94A3B8]">
              <AlertTriangle className="h-5 w-5 text-[#F59E0B]" />
              <span>{t("loadError")}</span>
              <button
                type="button"
                onClick={() => load()}
                className="inline-flex h-10 items-center rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition-colors hover:bg-[#1D4ED8]"
              >
                {t("retry")}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-[#94A3B8]">
              {t("empty")}
            </div>
          ) : (
            rows.map((row) => {
              const price =
                row.price_per_night != null
                  ? `${formatPrice(row.price_per_night)}${tShared("perNight")}`
                  : row.sale_price != null
                    ? formatPrice(row.sale_price)
                    : "—";
              const isBusy = busyId === row.id;
              const previewUrl = `${
                row.kind === "property"
                  ? propertyViewUrl({
                      id: row.id,
                      is_for_sale: row.is_for_sale,
                      type: row.type,
                    })
                  : serviceViewUrl({ id: row.id, category: row.category ?? "" })
              }?preview=1`;
              const statusKey = row.status ?? "pending";
              const statusLabel = (
                ["active", "blocked", "pending", "draft"] as const
              ).includes(statusKey as "active")
                ? tShared(
                    `listingStatus.${statusKey as "active" | "blocked" | "pending" | "draft"}`,
                  )
                : (row.status ?? "—");
              const statusBadge =
                STATUS_BADGES[row.status ?? "pending"] ?? STATUS_BADGES.pending;
              const isExpanded = expandedId === row.id;
              return (
                <div
                  key={row.id}
                  className="border-b border-[#F1F5F9] last:border-b-0"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : row.id);
                      }
                    }}
                    aria-expanded={isExpanded}
                    className={`grid cursor-pointer grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:gap-4 items-center px-6 py-5 transition-colors hover:bg-[#F8FAFC] ${
                      isExpanded ? "bg-[#F8FAFC]" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-black leading-[19px] text-[#1E293B]">
                        {row.title}
                      </p>
                      <p className="mt-1 text-[11px] font-bold text-[#94A3B8]">
                        {tShared("viewsMeta", {
                          meta: row.type ?? row.category ?? "",
                          views: row.views_count ?? 0,
                          location: row.location ?? "—",
                        })}
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
                    <div className="flex justify-start gap-2 lg:justify-end">
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-9 min-h-[36px] w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1D4ED8]"
                        aria-label={t("viewOnSite")}
                        title={t("viewOnSite")}
                      >
                        <Eye className="h-3 w-3" />
                      </a>
                      <Link
                        href={`/dashboard/admin/logs?${row.kind}=${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-9 min-h-[36px] w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1D4ED8]"
                        aria-label={tLogs("title")}
                        title={tLogs("title")}
                      >
                        <History className="h-3 w-3" />
                      </Link>
                      {row.kind === "service" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleIsNew(row.id, !row.is_new);
                          }}
                          disabled={isBusy}
                          className={`inline-flex h-9 min-h-[36px] w-9 items-center justify-center rounded-xl border disabled:opacity-50 ${
                            row.is_new
                              ? "border-[#FCD34D] bg-[#FEF3C7] text-[#B45309]"
                              : "border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]"
                          }`}
                          aria-label={
                            row.is_new ? t("removeNewBadge") : t("markNew")
                          }
                          title={row.is_new ? t("newOn") : t("newOff")}
                        >
                          <Sparkles className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatus(
                            row.id,
                            row.kind,
                            row.status === "active" ? "blocked" : "active",
                          );
                        }}
                        disabled={isBusy}
                        className="inline-flex h-9 min-h-[36px] w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] disabled:opacity-50"
                        aria-label={
                          row.status === "active" ? t("pause") : t("activate")
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatus(row.id, row.kind, "draft");
                        }}
                        disabled={isBusy}
                        className="inline-flex h-9 min-h-[36px] w-9 items-center justify-center rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] disabled:opacity-50"
                        aria-label={t("moveToDraft")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
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
                          kind={row.kind}
                          id={row.id}
                          onModerated={() => {
                            setExpandedId(null);
                            load();
                          }}
                          onChange={() => load()}
                        />
                      </motion.section>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
