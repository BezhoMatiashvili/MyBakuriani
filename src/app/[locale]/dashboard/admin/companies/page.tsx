"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Check, Eye, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { formatDate, formatPhone } from "@/lib/utils/format";
import type { PendingCompany } from "@/app/api/admin/companies/pending/route";

export default function AdminCompaniesPage() {
  const t = useTranslations("Organizations");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingCompany[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    const digits = q.replace(/\D/g, "");
    return items.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.brand_name.toLowerCase().includes(q) ||
        c.legal_name.toLowerCase().includes(q) ||
        c.identification_code.toLowerCase().includes(q) ||
        (c.owner?.display_name ?? "").toLowerCase().includes(q) ||
        (digits.length > 0 &&
          (c.owner?.phone ?? "").replace(/\D/g, "").includes(digits)),
    );
  }, [items, search]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/companies/pending", {
          cache: "no-store",
        });
        const payload = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(payload.error ?? t("loadError"));
        setItems((payload.items ?? []) as PendingCompany[]);
      } catch (err) {
        if (active) toast.error(err instanceof Error ? err.message : "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  async function moderate(
    company: PendingCompany,
    action: "approve" | "reject",
  ) {
    let notes: string | undefined;
    if (action === "reject") {
      const input = window.prompt("მიუთითეთ უარყოფის მიზეზი (არასავალდებულო):");
      if (input === null) return;
      notes = input.trim() || undefined;
    }
    setBusyId(company.id);
    try {
      const res = await fetch("/api/admin/companies/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: company.id, action, notes }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "error");
      toast.success(
        action === "approve"
          ? t("admin.approvedToast")
          : t("admin.rejectedToast"),
      );
      setItems((prev) => prev.filter((c) => c.id !== company.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-7 pb-10">
      <div className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          {t("admin.companiesTab")}
        </h1>
        <p className="text-[14px] font-medium text-[#64748B]">
          {t("pageSubtitle")}
        </p>
      </div>

      <AdminSearchInput
        value={search}
        onChange={setSearch}
        onClear={() => setSearch("")}
        placeholder={t("admin.searchPlaceholder")}
      />

      <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-[#94A3B8]">
            <Search className="h-9 w-9" />
            <p className="text-sm">{t("admin.noCompanies")}</p>
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-4 border-b border-[#F1F5F9] px-6 py-5 last:border-b-0 lg:flex-row lg:items-center"
            >
              <div className="flex flex-1 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EFF6FF]">
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logo_url}
                      alt={c.brand_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-6 w-6 text-[#2563EB]" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-black text-[#0F172A]">
                    {c.brand_name}
                  </p>
                  <p className="truncate text-[13px] font-medium text-[#64748B]">
                    {c.legal_name}
                  </p>
                  <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                    {t("admin.idCode")} {c.identification_code}
                    {" • "}
                    {t("admin.owner")} {c.owner?.display_name ?? "—"}
                    {c.owner?.phone ? ` (${formatPhone(c.owner.phone)})` : ""}
                    {c.created_at ? ` • ${formatDate(c.created_at)}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/sales?company=${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-bold text-[#1D4ED8] transition-colors hover:bg-[#EFF6FF]"
                >
                  <Eye className="h-4 w-4" />
                  {t("admin.view")}
                </a>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => moderate(c, "reject")}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 text-[13px] font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2] disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  {t("admin.reject")}
                </button>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => moderate(c, "approve")}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#059669] px-4 text-[13px] font-bold text-white shadow-[0px_8px_20px_rgba(5,150,105,0.25)] transition-colors hover:bg-[#047857] disabled:opacity-50"
                >
                  {busyId === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {t("admin.approve")}
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
