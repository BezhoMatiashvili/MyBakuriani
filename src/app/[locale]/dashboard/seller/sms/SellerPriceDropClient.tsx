"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Clock, MessageSquare, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import type { SellerPriceAlertListing } from "@/app/api/seller/price-drop-alerts/route";

type Payload = { sms_remaining: number; listings: SellerPriceAlertListing[] };

export function SellerPriceDropClient() {
  const t = useTranslations("PriceDropSms");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/seller/price-drop-alerts", { cache: "no-store" });
    if (!response.ok) throw new Error("load_failed");
    setPayload((await response.json()) as Payload);
  }, []);

  useEffect(() => {
    void load().catch(() => toast.error(t("loadError")));
  }, [load, t]);

  const toggle = async (listing: SellerPriceAlertListing, enabled: boolean) => {
    if (savingId) return;
    setSavingId(listing.id);
    setPayload((current) => current ? { ...current, listings: current.listings.map((item) => item.id === listing.id ? { ...item, enabled } : item) } : current);
    try {
      const response = await fetch(`/api/seller/price-drop-alerts/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error("save_failed");
      toast.success(t(enabled ? "enabled" : "disabled"));
    } catch {
      setPayload((current) => current ? { ...current, listings: current.listings.map((item) => item.id === listing.id ? { ...item, enabled: listing.enabled } : item) } : current);
      toast.error(t("saveError"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-[28px] font-black text-[#0F172A]">
          <BellRing className="size-7 text-[#2563EB]" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-[#64748B]">{t("subtitle")}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-[260px_1fr]">
        <div className="rounded-[20px] bg-gradient-to-br from-[#1E3A8A] to-[#2563EB] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">{t("balanceLabel")}</p>
          <p className="mt-3 text-2xl font-black">{t("balance", { count: payload?.sms_remaining ?? 0 })}</p>
          <p className="mt-3 text-xs leading-5 text-white/75">{t("chargeNotice")}</p>
        </div>
        <div className="rounded-[20px] border border-[#DBEAFE] bg-[#EFF6FF] p-5">
          <div className="flex gap-3">
            <MessageSquare className="mt-0.5 size-5 shrink-0 text-[#2563EB]" />
            <div>
              <p className="font-black text-[#1E3A8A]">{t("fixedTemplateTitle")}</p>
              <p className="mt-2 text-sm leading-6 text-[#334155]">{t("fixedTemplate")}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-[#64748B]"><Clock className="size-3.5" />{t("windowNotice")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-[#0F172A]">{t("listingsTitle")}</h2>
        {payload === null ? (
          <div className="mt-4 space-y-3">{[0, 1].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}</div>
        ) : payload.listings.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-[#CBD5E1] p-8 text-center text-sm text-[#64748B]">{t("empty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {payload.listings.map((listing) => (
              <li key={listing.id} className="rounded-2xl border border-[#E2E8F0] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-black text-[#0F172A]">{listing.title}</p>
                    <p className="mt-1 text-sm font-bold text-[#2563EB]">{listing.sale_price == null ? "—" : `${listing.sale_price.toLocaleString()} ${listing.currency ?? "$"}`}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-[#64748B]"><Users className="size-3.5" />{t("subscribers", { count: listing.subscriber_count })}</p>
                    {listing.recent_event && <p className="mt-1 text-xs text-[#94A3B8]">{t("eventStatus", { status: t(`statuses.${listing.recent_event.status}`) })}</p>}
                  </div>
                  <Switch checked={listing.enabled} disabled={savingId === listing.id} onCheckedChange={(enabled) => void toggle(listing, enabled)} aria-label={t("toggleAria", { title: listing.title })} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
