"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, CreditCard, Loader2, Lock } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { formatPrice } from "@/lib/utils/format";
import {
  DEFAULT_CARDHOLDER,
  DEFAULT_CVC,
  DEFAULT_EXPIRY,
  TEST_CARDS,
  type TestCard,
} from "@/lib/payments/test-cards";

type Phase = "loading" | "error" | "form" | "processing" | "success";
type DeclineReason =
  | "invalid_card"
  | "expired_card"
  | "declined"
  | "insufficient"
  | "test_card_required"
  | "session_inactive"
  | "payments_disabled";

interface PaymentSession {
  id: string;
  amount: number;
  currency: string;
  purpose: string;
  status: string;
  return_path: string | null;
}

const inputClass =
  "h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#0F172A] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE] placeholder:font-medium placeholder:text-[#94A3B8]/60";

function formatCardNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})(?=.)/g, "$1 ");
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

function isPaymentsDisabled(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("context" in error)) return false;
  const context = (error as { context?: unknown }).context;
  return context instanceof Response && context.status === 503;
}

export default function CheckoutClient() {
  const t = useTranslations("Checkout");
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session") ?? "";
  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardholder, setCardholder] = useState("");
  const [declineReason, setDeclineReason] = useState<DeclineReason | null>(null);
  const [showCards, setShowCards] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!sessionId) {
      setErrorMsg(t("errors.notFound"));
      setPhase("error");
      return;
    }
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, currency, purpose, status, return_path")
        .eq("id", sessionId)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setErrorMsg(t("errors.notFound"));
        setPhase("error");
        return;
      }
      const loaded = { ...data, amount: Number(data.amount) } as PaymentSession;
      setSession(loaded);
      if (loaded.status !== "pending") {
        setErrorMsg(loaded.status === "succeeded" ? t("errors.alreadyPaid") : t("errors.notPending"));
        setPhase("error");
        return;
      }
      setPhase("form");
    })();
    return () => {
      active = false;
    };
  }, [authLoading, sessionId, supabase, t, user]);

  const goBack = (suffix = "") => {
    const returnPath = session?.return_path;
    const safePath = returnPath && /^\/(?!\/)/.test(returnPath) ? returnPath : "/dashboard";
    router.push(`${safePath}${suffix}`);
  };

  const reasonText = (reason: DeclineReason | null) => {
    switch (reason) {
      case "invalid_card": return t("errors.invalidCard");
      case "expired_card": return t("errors.expiredCard");
      case "insufficient": return t("errors.insufficient");
      case "test_card_required": return t("errors.testCardRequired");
      case "session_inactive": return t("errors.notPending");
      case "payments_disabled": return t("errors.paymentsUnavailable");
      default: return t("errors.declined");
    }
  };

  const fillCard = (card: TestCard) => {
    setCardNumber(card.number);
    setExpiry(DEFAULT_EXPIRY);
    setCvc(DEFAULT_CVC);
    setCardholder(DEFAULT_CARDHOLDER);
    setDeclineReason(null);
  };

  const canSubmit =
    cardNumber.replace(/\D/g, "").length === 16 &&
    expiry.replace(/\D/g, "").length === 4 &&
    cvc.length === 3 &&
    cardholder.trim().length > 0;

  const handlePay = async () => {
    if (!session || !canSubmit) return;
    setDeclineReason(null);
    setPhase("processing");
    const [month, year] = expiry.replace(/\s/g, "").split("/");
    try {
      const [{ data, error }] = await Promise.all([
        supabase.functions.invoke("payment-process", {
          body: {
            payment_id: session.id,
            card_number: cardNumber.replace(/\s/g, ""),
            exp_month: Number(month),
            exp_year: Number(year),
            cvc,
          },
        }),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
      if (error) throw error;
      const response = data as { data?: { status?: string; reason?: DeclineReason } };
      if (response.data?.status === "succeeded") {
        setPhase("success");
        window.setTimeout(() => goBack("?payment=success"), 1000);
      } else {
        setDeclineReason(response.data?.reason ?? "declined");
        setPhase("form");
      }
    } catch (error) {
      setDeclineReason(isPaymentsDisabled(error) ? "payments_disabled" : "declined");
      setPhase("form");
    }
  };

  const handleCancel = async () => {
    setCanceling(true);
    try {
      if (session) {
        await supabase.functions.invoke("payment-process", {
          body: { payment_id: session.id, cancel: true },
        });
      }
    } finally {
      goBack();
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-[#EEF2F7] to-[#E2E8F0] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-center gap-2 text-[#0F172A]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F172A] text-white"><Lock className="h-4 w-4" /></span>
          <span className="text-[17px] font-black tracking-tight">{t("brand")}</span>
        </div>
        <section className="overflow-hidden rounded-3xl bg-white shadow-[0px_24px_60px_-20px_rgba(15,23,42,0.35)]">
          <div className="bg-[#0F172A] px-7 py-6 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">{session ? t(`purpose.${session.purpose}`) : t("secure")}</p>
            <p className="mt-1 text-[32px] font-black leading-none">{session ? formatPrice(session.amount) : "—"}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/60"><Lock className="h-3 w-3" /> {t("secure")}</p>
          </div>
          <div className="relative px-7 py-6">
            {phase === "loading" && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-[#94A3B8]" /></div>}
            {phase === "error" && <div className="py-6 text-center"><p className="text-sm font-semibold text-[#0F172A]">{errorMsg}</p><button type="button" onClick={() => goBack()} className="mt-5 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-bold text-white">{t("errors.backToDashboard")}</button></div>}
            {(phase === "form" || phase === "processing" || phase === "success") && session && (
              <div className="space-y-4">
                {declineReason && <div role="alert" className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-[13px] font-semibold text-[#DC2626]">{reasonText(declineReason)}</div>}
                <label className="block text-xs font-bold text-[#64748B]">{t("cardNumber")}<span className="relative mt-1.5 block"><input aria-label={t("cardNumber")} inputMode="numeric" autoComplete="cc-number" value={cardNumber} onChange={(event) => setCardNumber(formatCardNumber(event.target.value))} placeholder="0000 0000 0000 0000" className={`${inputClass} pr-11`} /><CreditCard className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" /></span></label>
                <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-[#64748B]">{t("expiry")}<input aria-label={t("expiry")} inputMode="numeric" autoComplete="cc-exp" value={expiry} onChange={(event) => setExpiry(formatExpiry(event.target.value))} placeholder="MM / YY" className={`${inputClass} mt-1.5`} /></label><label className="text-xs font-bold text-[#64748B]">{t("cvc")}<input aria-label={t("cvc")} inputMode="numeric" autoComplete="cc-csc" value={cvc} onChange={(event) => setCvc(event.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="123" className={`${inputClass} mt-1.5`} /></label></div>
                <label className="block text-xs font-bold text-[#64748B]">{t("cardholder")}<input aria-label={t("cardholder")} autoComplete="cc-name" value={cardholder} onChange={(event) => setCardholder(event.target.value)} placeholder={t("cardholderPlaceholder")} className={`${inputClass} mt-1.5 uppercase`} /></label>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]"><button type="button" onClick={() => setShowCards((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-bold text-[#475569]"><span>{t("testCards.toggle")}</span><ChevronDown className={`h-4 w-4 transition-transform ${showCards ? "rotate-180" : ""}`} /></button>{showCards && <div className="space-y-2 border-t border-[#E2E8F0] px-4 py-3"><p className="text-[12px] leading-[18px] text-[#64748B]">{t("testCards.hint")}</p>{TEST_CARDS.map((card) => <div key={card.number} className="flex items-center justify-between gap-3"><div><p className="font-mono text-[13px] font-bold text-[#0F172A]">{card.number}</p><p className={`text-[11px] font-semibold ${card.result === "approved" ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{t(`testCards.${card.result}`)}</p></div><button type="button" onClick={() => fillCard(card)} className="rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-bold text-[#2563EB]">{t("testCards.fill")}</button></div>)}</div>}</div>
                <button type="button" disabled={!canSubmit || phase !== "form" || canceling} onClick={handlePay} className="flex w-full justify-center rounded-xl bg-[#2563EB] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50">{t("pay", { amount: formatPrice(session.amount) })}</button>
                <button type="button" onClick={handleCancel} disabled={phase !== "form" || canceling} className="w-full py-1 text-center text-[13px] font-semibold text-[#94A3B8] disabled:opacity-50">{t("cancel")}</button>
              </div>
            )}
            <AnimatePresence>{(phase === "processing" || phase === "success") && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 backdrop-blur-sm">{phase === "processing" ? <><Loader2 className="h-9 w-9 animate-spin text-[#2563EB]" /><p className="text-sm font-bold text-[#0F172A]">{t("processing")}</p></> : <><span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DCFCE7]"><CheckCircle2 className="h-8 w-8 text-[#16A34A]" /></span><p className="text-base font-black text-[#0F172A]">{t("successTitle")}</p><p className="text-[13px] font-medium text-[#64748B]">{t("successSubtitle")}</p></>}</motion.div>}</AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  );
}
