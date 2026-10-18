"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils/format";
import { gelToTetri } from "@/lib/payments/keepz/amount";

type Refund = {
  id: string;
  amount: number;
  status: string;
  provider_status: string | null;
  last_error: string | null;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
};

type AdminPayment = {
  id: string;
  amount: number;
  status: string;
  provider_status: string | null;
  provider_transaction_id: string | null;
  created_at: string;
  credited_at: string | null;
  refunded_amount: number;
  review_flag: string | null;
  last_error: string | null;
  wallet_balance: number;
  max_refund: number;
  user: { display_name: string | null } | null;
  refunds: Refund[];
};

type View = "all" | "review" | "refunds";
const VIEWS: View[] = ["all", "review", "refunds"];
// Only refunds whose outcome Keepz could not report; a 'submitted' one is
// Keepz's to finish (the server refuses the rest too).
const ADMIN_RESOLVABLE = ["requested", "unknown"];

const gel = (value: number) => `${value.toFixed(2)} ₾`;
const when = (value: string | null) =>
  value ? formatDateTime(new Date(value)) : "—";

const STATUS_STYLE: Record<string, string> = {
  succeeded: "bg-[#DCFCE7] text-[#15803D]",
  pending: "bg-[#DBEAFE] text-[#1D4ED8]",
  declined: "bg-[#FEE2E2] text-[#B91C1C]",
  cancelled: "bg-[#F1F5F9] text-[#475569]",
  expired: "bg-[#F1F5F9] text-[#475569]",
};

/**
 * Keepz card payments (C32): verified status per payment, a Keepz re-check
 * (the only way to notice refunds made on Keepz's side), refunds to the card,
 * and manual resolution of refunds whose outcome Keepz never confirmed.
 */
export default function AdminPaymentsPage() {
  const t = useTranslations("AdminPayments");
  const [view, setView] = useState<View>("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundFor, setRefundFor] = useState<AdminPayment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [resolving, setResolving] = useState<{
    refund: Refund;
    outcome: "succeeded" | "failed";
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(
      `/api/admin/payments?view=${view}&page=${page}`,
      { cache: "no-store" },
    ).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (!response?.ok || !payload) {
      toast.error(t("loadError"));
      setPayments([]);
    } else {
      setPayments(payload.payments ?? []);
      setTotal(payload.total ?? 0);
      setPageSize(payload.pageSize ?? 50);
    }
    setLoading(false);
  }, [view, page, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(url: string, body?: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    return { response, payload };
  }

  async function recheck(payment: AdminPayment) {
    setBusyId(payment.id);
    const { response } = await post(
      `/api/admin/payments/${payment.id}/recheck`,
    );
    toast[response?.ok ? "success" : "error"](
      response?.ok ? t("recheckDone") : t("errors.provider_unavailable"),
    );
    setBusyId(null);
    await load();
  }

  async function submitRefund() {
    if (!refundFor) return;
    const amount = Number(refundAmount);
    setBusyId(refundFor.id);
    const { response, payload } = await post(
      `/api/admin/payments/${refundFor.id}/refund`,
      { amount, reason: refundReason },
    );
    if (response?.ok || response?.status === 202) {
      const status = payload?.status ?? "submitted";
      toast.success(t(`refundResult.${status}`, { amount: gel(amount) }));
    } else {
      const code = payload?.error ?? "failed";
      toast.error(
        t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.failed"),
      );
    }
    setBusyId(null);
    setRefundFor(null);
    await load();
  }

  async function submitResolve() {
    if (!resolving) return;
    setBusyId(resolving.refund.id);
    const { response, payload } = await post(
      `/api/admin/payments/refunds/${resolving.refund.id}/resolve`,
      { outcome: resolving.outcome },
    );
    const code = payload?.error ?? "failed";
    if (response?.ok) toast.success(t("resolveDone"));
    else
      toast.error(
        t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.failed"),
      );
    setBusyId(null);
    setResolving(null);
    await load();
  }

  const refundAmountValue = Number(refundAmount);
  const refundValid =
    !!refundFor &&
    Number.isFinite(refundAmountValue) &&
    refundAmountValue > 0 &&
    refundAmountValue <= refundFor.max_refund &&
    gelToTetri(refundAmountValue) !== null;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 pb-10">
      <div className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="text-[14px] text-[#64748B]">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {VIEWS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            onClick={() => {
              setView(item);
              setPage(0);
            }}
            className={`min-h-[44px] rounded-xl px-4 text-[13px] font-bold transition-colors ${
              view === item
                ? "bg-[#0F172A] text-white"
                : "border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]"
            }`}
          >
            {t(`views.${item}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center text-[14px] text-[#94A3B8]">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[18px] font-black text-[#0F172A]">
                    {gel(payment.amount)}
                    {payment.refunded_amount > 0 && (
                      <span className="ml-2 text-[13px] font-bold text-[#B45309]">
                        {t("refunded", {
                          amount: gel(payment.refunded_amount),
                        })}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[13px] text-[#475569]">
                    {payment.user?.display_name ?? "—"} ·{" "}
                    {when(payment.created_at)}
                  </p>
                  <p className="break-all text-[11px] text-[#94A3B8]">
                    {payment.id}
                    {payment.provider_transaction_id &&
                      ` · Keepz #${payment.provider_transaction_id}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-[12px] font-bold ${
                      STATUS_STYLE[payment.status] ??
                      "bg-[#F1F5F9] text-[#475569]"
                    }`}
                  >
                    {t(`statuses.${payment.status}`)}
                  </span>
                  {payment.provider_status && (
                    <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-[11px] font-semibold text-[#64748B]">
                      Keepz: {payment.provider_status}
                    </span>
                  )}
                </div>
              </div>

              {payment.review_flag && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#FFFBEB] p-3 text-[13px] text-[#92400E]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t(`flags.${payment.review_flag}`)}
                </p>
              )}

              {payment.refunds.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-[#F1F5F9] pt-3">
                  {payment.refunds.map((refund) => (
                    <li
                      key={refund.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
                    >
                      <span className="text-[#0F172A]">
                        {t("refundLine", {
                          amount: gel(refund.amount),
                          status: t(`refundStatuses.${refund.status}`),
                        })}
                        <span className="ml-2 text-[11px] text-[#94A3B8]">
                          {when(refund.created_at)}
                        </span>
                      </span>
                      {ADMIN_RESOLVABLE.includes(refund.status) && (
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setResolving({ refund, outcome: "succeeded" })
                            }
                            className="min-h-[36px] rounded-lg border border-[#E2E8F0] px-3 text-[12px] font-bold text-[#15803D] hover:bg-[#F0FDF4]"
                          >
                            {t("markRefunded")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setResolving({ refund, outcome: "failed" })
                            }
                            className="min-h-[36px] rounded-lg border border-[#E2E8F0] px-3 text-[12px] font-bold text-[#B91C1C] hover:bg-[#FEF2F2]"
                          >
                            {t("markFailed")}
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === payment.id}
                  onClick={() => recheck(payment)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#E2E8F0] px-4 text-[13px] font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  {busyId === payment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t("recheck")}
                </button>
                {payment.max_refund > 0 && (
                  <button
                    type="button"
                    disabled={busyId === payment.id}
                    onClick={() => {
                      setRefundFor(payment);
                      setRefundAmount(payment.max_refund.toFixed(2));
                      setRefundReason("");
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F172A] px-4 text-[13px] font-bold text-white hover:bg-[#1E293B] disabled:opacity-50"
                  >
                    <Undo2 className="h-4 w-4" />
                    {t("refund")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="min-h-[44px] rounded-xl border border-[#E2E8F0] px-4 text-[13px] font-bold disabled:opacity-40"
          >
            {t("prev")}
          </button>
          <span className="text-[13px] text-[#64748B]">
            {page + 1} / {Math.ceil(total / pageSize)}
          </span>
          <button
            type="button"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
            className="min-h-[44px] rounded-xl border border-[#E2E8F0] px-4 text-[13px] font-bold disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      )}

      <Modal
        isOpen={!!refundFor}
        onClose={() => setRefundFor(null)}
        title={t("refundTitle")}
        size="sm"
      >
        {refundFor && (
          <div className="space-y-4">
            <p className="text-[13px] leading-[20px] text-[#475569]">
              {t("refundExplainer", {
                max: gel(refundFor.max_refund),
                wallet: gel(refundFor.wallet_balance),
              })}
            </p>
            <label className="block space-y-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-[#64748B]">
                {t("refundAmount")}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0.01}
                max={refundFor.max_refund}
                step={0.01}
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-[#E2E8F0] px-3 text-[14px]"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-[#64748B]">
                {t("refundReason")}
              </span>
              <textarea
                maxLength={500}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                className="min-h-[80px] w-full rounded-xl border border-[#E2E8F0] p-3 text-[14px]"
              />
            </label>
            <button
              type="button"
              disabled={!refundValid || busyId === refundFor.id}
              onClick={submitRefund}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] text-[13px] font-bold text-white disabled:opacity-50"
            >
              {busyId === refundFor.id && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t("refundConfirm", {
                amount: gel(refundValid ? refundAmountValue : 0),
              })}
            </button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!resolving}
        onClose={() => setResolving(null)}
        title={t("resolveTitle")}
        size="sm"
      >
        {resolving && (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-xl bg-[#FFFBEB] p-3 text-[13px] leading-[20px] text-[#92400E]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t(
                resolving.outcome === "succeeded"
                  ? "resolveSucceededWarning"
                  : "resolveFailedWarning",
                { amount: gel(resolving.refund.amount) },
              )}
            </p>
            <button
              type="button"
              disabled={busyId === resolving.refund.id}
              onClick={submitResolve}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] text-[13px] font-bold text-white disabled:opacity-50"
            >
              {busyId === resolving.refund.id && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {resolving.outcome === "succeeded"
                ? t("markRefunded")
                : t("markFailed")}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
