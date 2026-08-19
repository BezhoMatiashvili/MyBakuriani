"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Check, Clock3, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatPhone, formatPrice } from "@/lib/utils/format";
import type { PendingMembership } from "@/app/api/admin/memberships/route";

export default function AdminMembershipsPage() {
  const t = useTranslations("AdminMemberships");
  const locale = useLocale();
  const [items, setItems] = useState<PendingMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/memberships", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as {
        memberships?: PendingMembership[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(payload?.error ?? t("loadFailed"));
      setItems(payload?.memberships ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(item: PendingMembership, action: "approve" | "reject") {
    let note: string | undefined;
    if (action === "reject") {
      const value = window.prompt(t("rejectPrompt"));
      if (value === null) return;
      note = value.trim() || undefined;
    }

    setBusy(item.id);
    try {
      const res = await fetch("/api/admin/memberships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, action, note }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(payload?.error ?? t("reviewFailed"));
      setItems((current) => current.filter((row) => row.id !== item.id));
      toast.success(action === "approve" ? t("approved") : t("rejected"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("reviewFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10">
      <header>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-[#EDE9FE] text-[#7C3AED]">
            <BadgeCheck className="size-5" />
          </span>
          <div>
            <h1 className="text-[30px] font-black tracking-[-0.7px] text-[#0F172A]">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              {t("subtitle")}
            </p>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm font-semibold text-[#92400E]">
        {t("notice")}
      </div>

      <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
          <h2 className="text-sm font-black text-[#334155]">{t("queue")}</h2>
          <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-xs font-extrabold text-[#B45309]">
            {t("count", { count: items.length })}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-16 text-center">
            <Check className="size-10 text-[#10B981]" />
            <p className="mt-3 text-sm font-bold text-[#475569]">{t("empty")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#EEF2F7]">
            {items.map((item) => {
              const isBusy = busy === item.id;
              return (
                <article
                  key={item.id}
                  data-testid="pending-membership"
                  className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-extrabold text-[#0F172A]">
                        {item.profile?.display_name || t("unnamed")}
                      </p>
                      <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#2563EB]">
                        {item.profile?.role ?? "renter"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#64748B]">
                      {item.profile?.phone ? formatPhone(item.profile.phone) : t("noPhone")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-[#475569]">
                      <span>{item.package?.name ?? t("seasonPlan")}</span>
                      <span>{formatPrice(Number(item.amount_paid ?? 0))}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3.5" />
                        {t("paidAt", { date: formatDate(item.created_at, locale) })}
                      </span>
                      <span>{t("seasonEnds", { date: formatDate(item.expires_at, locale) })}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void review(item, "reject")}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 text-sm font-bold text-[#B91C1C] hover:bg-[#FEE2E2] disabled:opacity-50 lg:flex-none"
                    >
                      {isBusy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                      {t("reject")}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void review(item, "approve")}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 text-sm font-bold text-white hover:bg-[#15803D] disabled:opacity-50 lg:flex-none"
                    >
                      {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      {t("approve")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
