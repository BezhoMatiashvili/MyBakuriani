"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Ban,
  Download,
  Gift,
  Loader2,
  LogOut,
  Phone,
  RefreshCcw,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import Modal from "@/components/shared/Modal";
import NumberField from "@/components/shared/NumberField";
import { AuditTimeline } from "@/components/admin/AuditTimeline";
import { Link } from "@/i18n/navigation";
import { formatPhone, formatPrice } from "@/lib/utils/format";
import type { Tables, Enums } from "@/lib/types/database";

type ProfileWithCounts = Tables<"profiles"> & {
  listings_count: number;
  balance_amount: number;
};

type Txn = {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
};

const VIP_TX_TYPES = new Set(["vip_boost", "super_vip", "discount_badge"]);

const roleBadgeClasses: Record<Enums<"user_role">, string> = {
  guest: "border border-[#E2E8F0] bg-[#ECFDF5] text-[#475569]",
  renter: "border border-[#DCFCE7] bg-[#EFF6FF] text-[#2563EB]",
  seller: "border border-[#DCFCE7] bg-[#EFF6FF] text-[#2563EB]",
  cleaner: "bg-[#FCE7F3] text-[#BE185D]",
  food: "bg-[#FEE2E2] text-[#B91C1C]",
  entertainment: "bg-[#FEF3C7] text-[#92400E]",
  transport: "bg-[#E0F2FE] text-[#0369A1]",
  employment: "bg-[#F3E8FF] text-[#7E22CE]",
  handyman: "bg-[#CCFBF1] text-[#0F766E]",
  admin: "bg-[#DCFCE7] text-[#166534]",
};

export default function ClientsPage() {
  const t = useTranslations("AdminClients");
  const tShared = useTranslations("AdminShared");
  const tLogs = useTranslations("AdminLogs");
  const locale = useLocale();
  const txDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [locale],
  );
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileWithCounts[]>([]);
  const [selectedProfile, setSelectedProfile] =
    useState<ProfileWithCounts | null>(null);
  // null = still loading the selected profile's transactions
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [bonusProfile, setBonusProfile] = useState<ProfileWithCounts | null>(
    null,
  );
  const [bonusAmount, setBonusAmount] = useState<number | "">("");
  const [bonusComment, setBonusComment] = useState("");
  const [bonusSubmitting, setBonusSubmitting] = useState(false);

  // Profiles + listings count + balance arrive pre-joined from one admin
  // RPC instead of downloading profiles, properties and balances separately.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/clients")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { clients?: ProfileWithCounts[] } | null) => {
        if (cancelled) return;
        if (payload?.clients) {
          setProfiles(payload.clients);
        } else {
          // Surface failures (e.g. RPC missing) instead of a silently
          // empty directory that looks like data loss.
          toast.error(tShared("loadFailed"));
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(tShared("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real transaction history for the details modal (admin-only API; the
  // browser client can't read other users' transactions through RLS).
  useEffect(() => {
    if (!selectedProfile) return;
    let cancelled = false;
    setTxns(null);
    fetch(`/api/admin/clients/${selectedProfile.id}/transactions`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { transactions?: Txn[] } | null) => {
        if (!cancelled) setTxns(payload?.transactions ?? []);
      })
      .catch(() => {
        if (!cancelled) setTxns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProfile]);

  const txStats = useMemo(() => {
    if (!txns) return null;
    let vipCount = 0;
    let topupCount = 0;
    let ltv = 0;
    for (const tx of txns) {
      const amount = Number(tx.amount);
      if (VIP_TX_TYPES.has(tx.type)) vipCount += 1;
      if (tx.type === "topup") topupCount += 1;
      // Spend = money out, excluding withdrawals (cash-out is not consumption)
      if (amount < 0 && tx.type !== "withdrawal") ltv += Math.abs(amount);
    }
    return { vipCount, topupCount, ltv };
  }, [txns]);

  function openBonus(profile: ProfileWithCounts) {
    setBonusProfile(profile);
    setBonusAmount("");
    setBonusComment("");
  }

  async function submitBonus(e: React.FormEvent) {
    e.preventDefault();
    if (!bonusProfile) return;
    const amount = Number(bonusAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("bonusAmountInvalid"));
      return;
    }
    setBonusSubmitting(true);
    try {
      const res = await fetch("/api/admin/clients/bonus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: bonusProfile.id,
          amount,
          comment: bonusComment.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        new_balance?: number;
      } | null;
      if (!res.ok) {
        toast.error(payload?.error ?? t("bonusFailed"));
        return;
      }
      const newBalance = Number(payload?.new_balance ?? 0);
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === bonusProfile.id ? { ...p, balance_amount: newBalance } : p,
        ),
      );
      toast.success(t("bonusSuccess"));
      setBonusProfile(null);
    } catch {
      toast.error(t("bonusFailed"));
    } finally {
      setBonusSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10">
      <div className="flex items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[32px] font-black leading-[32px] tracking-[-0.8px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm font-medium leading-[21px] text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-[42px] items-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] shadow-sm hover:bg-[#F8FAFC]"
        >
          <Download className="h-[13px] w-[13px]" />
          {tShared("export")}
        </button>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
          <div className="sticky top-0 z-10 hidden lg:grid grid-cols-[1.5fr_1fr_1.1fr] items-center gap-[48px] border-b border-[#E2E8F0] bg-[#F8FAFC] px-6 py-5 text-[12px] font-bold uppercase tracking-[1.2px] text-[#64748B]">
            <span>{t("colClient")}</span>
            <span>{t("colRoleStatus")}</span>
            <span className="text-right">{t("colActions")}</span>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            profiles.map((profile) => (
              <div
                key={profile.id}
                className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr_1.1fr] lg:gap-[48px] items-center border-b border-[#F1F5F9] px-6 py-[18px] last:border-b-0"
              >
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <button
                      type="button"
                      onClick={() => setSelectedProfile(profile)}
                      className="text-left text-[16px] font-black leading-[21px] text-[#1E293B] hover:text-[#2563EB]"
                    >
                      {profile.display_name}
                    </button>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-[#64748B]">
                      <Phone className="h-[14px] w-[14px] shrink-0 text-[#2563EB]" />
                      {formatPhone(profile.phone)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span
                    className={`inline-flex rounded-lg px-3 py-1 text-[11px] font-black leading-[15px] tracking-[0.275px] ${roleBadgeClasses[profile.role]}`}
                  >
                    {tShared(`roles.${profile.role}`)}
                  </span>
                  <p className="text-[12px] font-semibold leading-[16px] text-[#64748B]">
                    {tShared("balanceLabel", {
                      amount: formatPrice(profile.balance_amount),
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 lg:flex-nowrap lg:justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedProfile(profile)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[12px] bg-[#EFF6FF] px-3.5 text-[12px] font-bold text-[#2563EB] hover:bg-[#DBEAFE]"
                  >
                    <RefreshCcw className="h-3 w-3" />
                    {t("history")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBonus(profile)}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-[12px] border border-[#D1FAE5] bg-[#ECFDF5] px-3.5 text-[12px] font-bold text-[#10B981] hover:bg-[#D1FAE5]"
                  >
                    <Gift className="h-3 w-3" />
                    {t("bonus")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:bg-white"
                  >
                    <LogOut className="h-[13px] w-[13px]" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8] hover:bg-white"
                  >
                    <Ban className="h-[13px] w-[13px]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Modal
        isOpen={Boolean(bonusProfile)}
        onClose={() => setBonusProfile(null)}
        title={t("bonusTitle", { name: bonusProfile?.display_name ?? "" })}
        size="sm"
      >
        <form onSubmit={submitBonus} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#0F172A]">
              {t("bonusAmount")} <span className="text-[#DC2626]">*</span>
            </label>
            <NumberField
              value={bonusAmount === "" ? "" : String(bonusAmount)}
              onChange={(v) => setBonusAmount(v === "" ? "" : Number(v))}
              min={0}
              max={50000}
              decimals={2}
              suffix="₾"
              placeholder="0"
              accent="green"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#0F172A]">
              {t("bonusComment")}
            </label>
            <input
              type="text"
              value={bonusComment}
              onChange={(e) => setBonusComment(e.target.value)}
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setBonusProfile(null)}
              disabled={bonusSubmitting}
              className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              {t("bonusCancel")}
            </button>
            <button
              type="submit"
              disabled={bonusSubmitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-bold text-white hover:bg-[#059669] disabled:opacity-50"
            >
              {bonusSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("bonusSubmitting")}
                </>
              ) : (
                t("bonusSubmit")
              )}
            </button>
          </div>
        </form>
      </Modal>

      {selectedProfile ? (
        <div
          className="fixed bottom-0 right-0 top-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.6)] p-4 backdrop-blur-[2px] lg:left-[281px]"
          onClick={() => setSelectedProfile(null)}
        >
          <div
            className="flex h-auto max-h-full w-full max-w-[700px] flex-col overflow-y-auto rounded-[32px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-8 pb-5 pt-8">
              <div className="flex min-h-10 items-center gap-3 pt-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF]">
                  <UserRound className="h-[17px] w-[17px] text-[#2563EB]" />
                </div>
                <h2 className="flex flex-wrap items-center gap-1.5 text-[20px] font-black leading-[30px] text-[#1E293B]">
                  <span>{t("userDetails")}</span>
                  <span className="text-[#2563EB]">
                    {selectedProfile.display_name}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#F1F5F9] bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9]"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div className="space-y-6 px-8 pb-8 pt-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-[20px] border border-[#FFEDD5] bg-[#ECFDF5] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#F97316]">
                    {t("vipUsage")}
                  </p>
                  <div className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    {txStats ? (
                      tShared("timesCount", { count: txStats.vipCount })
                    ) : (
                      <Skeleton className="h-7 w-16" />
                    )}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#EEF1F4] bg-[#F8FAFC] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#9333EA]">
                    {t("topups")}
                  </p>
                  <div className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    {txStats ? (
                      tShared("timesCount", { count: txStats.topupCount })
                    ) : (
                      <Skeleton className="h-7 w-16" />
                    )}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#E2E8E5] bg-[#ECFDF5] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#10B981]">
                    {t("ltv")}
                  </p>
                  <div className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    {txStats ? (
                      `${txStats.ltv.toFixed(2)} ₾`
                    ) : (
                      <Skeleton className="h-7 w-20" />
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="px-6 py-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[1.3px] text-[#64748B]">
                    {t("txHistory")}
                  </h3>
                </div>
                <div className="max-h-[195px] overflow-x-auto overflow-y-auto">
                  {txns === null ? (
                    <div className="space-y-2 bg-white p-6">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <Skeleton key={idx} className="h-8 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : txns.length === 0 ? (
                    <div className="bg-white px-6 py-10 text-center text-sm font-medium text-[#94A3B8]">
                      {t("txEmpty")}
                    </div>
                  ) : (
                    <table className="w-full min-w-[640px] md:min-w-0">
                      <thead className="bg-[#F8FAFC]">
                        <tr className="border-y border-[#E2E8F0]">
                          <th className="px-6 py-3 text-left text-[11px] font-bold uppercase text-[#94A3B8]">
                            {t("colDate")}
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-bold uppercase text-[#94A3B8]">
                            {t("colAction")}
                          </th>
                          <th className="px-6 py-3 text-right text-[11px] font-bold uppercase text-[#94A3B8]">
                            {t("colAmount")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {txns.map((tx) => {
                          const amount = Number(tx.amount);
                          const isPositive = amount >= 0;
                          return (
                            <tr
                              key={tx.id}
                              className="border-t border-[#F1F5F9]"
                            >
                              <td className="px-6 py-[17px] text-[13px] font-bold text-[#475569]">
                                {txDateFormatter.format(
                                  new Date(tx.created_at),
                                )}
                              </td>
                              <td className="px-6 py-[17px] text-[13px] font-medium text-[#334155]">
                                {tx.description ?? t(`txTypes.${tx.type}`)}
                              </td>
                              <td
                                className={`px-6 py-[16.5px] text-right text-[14px] font-black ${
                                  isPositive
                                    ? "text-[#10B981]"
                                    : "text-[#EF4444]"
                                }`}
                              >
                                {isPositive ? "+ " : "- "}
                                {Math.abs(amount).toFixed(2)} ₾
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="flex items-center justify-between gap-3 px-6 py-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[1.3px] text-[#64748B]">
                    {tLogs("activityTitle")}
                  </h3>
                  <Link
                    href={`/dashboard/admin/logs?user=${selectedProfile.id}`}
                    className="text-[12px] font-bold text-[#2563EB] hover:underline"
                  >
                    {tLogs("fullHistory")}
                  </Link>
                </div>
                <div className="bg-white px-4 pb-4 pt-3">
                  <AuditTimeline
                    userId={selectedProfile.id}
                    compact
                    pageSize={15}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
