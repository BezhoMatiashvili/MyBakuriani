"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Wallet, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatPrice } from "@/lib/utils/format";
import type { RenterMembershipPlan } from "@/app/[locale]/dashboard/renter/loadOverview";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  membershipExpiresAt: string | null;
  walletBalance: number;
  plans: RenterMembershipPlan[];
  onPurchased: () => Promise<void>;
}

/** Account-wide renter membership purchase dialog (kept at this path for callers). */
export default function PaymentModal({
  isOpen,
  onClose,
  membershipExpiresAt,
  walletBalance,
  plans,
  onPurchased,
}: PaymentModalProps) {
  const t = useTranslations("PaymentModal");
  const tShared = useTranslations("DashboardShared");
  const locale = useLocale();
  const supabase = createClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isActive = Boolean(membershipExpiresAt);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(plans[0]?.id ?? null);
    setError(null);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, plans]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const selectedPlan = plans.find((plan) => plan.id === selectedId) ?? null;

  async function purchase() {
    if (!selectedPlan || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: invokeError } = await supabase.functions.invoke("purchase-vip", {
      body: { package_id: selectedPlan.id, quantity: 1 },
    });
    if (invokeError) {
      setError((await edgeErrorMessage(invokeError)) ?? t("purchaseFailed"));
      setSubmitting(false);
      return;
    }
    await onPurchased();
    setSubmitting(false);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose}
          />
          <motion.section
            role="dialog" aria-modal="true" aria-labelledby="membership-dialog-title"
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between px-6 pt-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                  <CreditCard className="h-[18px] w-[18px]" />
                </span>
                <h2 id="membership-dialog-title" className="text-[17px] font-extrabold text-[#0F172A]">
                  {isActive ? t("extendTitle") : t("title")}
                </h2>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]" aria-label={tShared("closeAria")}>
                <X className="size-4" />
              </button>
            </div>

            <div className="mx-6 mt-5 rounded-2xl border border-[#EEF1F4] bg-[#FAFBFC] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-[#64748B]">{t("walletBalance")}</span>
                <span className="inline-flex items-center gap-1.5 text-lg font-black text-[#0F172A]"><Wallet className="h-4 w-4 text-[#2563EB]" />{formatPrice(walletBalance)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 border-t border-[#EEF1F4] pt-3">
                <span className="text-sm font-semibold text-[#64748B]">{isActive ? t("validUntil") : t("membershipStatus")}</span>
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#059669]"><CheckCircle2 className="h-4 w-4" />{formatDate(membershipExpiresAt, locale)}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#DC2626]"><AlertCircle className="h-4 w-4" />{t("inactive")}</span>
                )}
              </div>
            </div>

            <p className="mx-6 mt-5 text-[13px] leading-[20px] text-[#64748B]">
              {isActive ? t("extendExplanation") : t("explanationPending")}
            </p>

            {plans.length > 0 ? (
              <div className="mx-6 mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {plans.map((plan) => {
                  const selected = plan.id === selectedId;
                  return (
                    <button key={plan.id} type="button" onClick={() => setSelectedId(plan.id)} aria-pressed={selected}
                      className={`rounded-xl border p-4 text-left transition-colors ${selected ? "border-[#2563EB] bg-[#EFF6FF] ring-1 ring-[#2563EB]" : "border-[#E2E8F0] hover:border-[#93C5FD]"}`}>
                      <span className="block text-sm font-extrabold text-[#0F172A]">{plan.label || t("months", { count: plan.durationMonths })}</span>
                      {plan.description ? <span className="mt-1 block text-xs text-[#64748B]">{plan.description}</span> : null}
                      <span className="mt-3 block text-xl font-black text-[#2563EB]">{formatPrice(Number(plan.amount_gel))}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mx-6 mt-4 rounded-xl bg-[#FFF7ED] p-3 text-sm font-semibold text-[#9A3412]">{t("noPlans")}</p>
            )}

            {error ? (
              <div className="mx-6 mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-sm font-semibold text-[#B91C1C]" role="alert">
                {error} <Link href="/dashboard/renter/balance" className="ml-1 underline">{t("goToBalance")}</Link>
              </div>
            ) : null}

            <div className="px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
              <button type="button" onClick={purchase} disabled={!selectedPlan || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3.5 text-sm font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {isActive ? t("extendButton") : t("payButton")}
              </button>
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}

async function edgeErrorMessage(error: unknown): Promise<string | null> {
  // supabase-js wraps non-2xx Edge responses in FunctionHttpError. Its public
  // message is generic; the response body carries the vetted ApiError text.
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    (error as { context?: unknown }).context instanceof Response
  ) {
    try {
      const body = (await (error as { context: Response }).context
        .clone()
        .json()) as { error?: unknown };
      return typeof body.error === "string" ? body.error : null;
    } catch {
      return null;
    }
  }
  return error instanceof Error && error.message ? error.message : null;
}
