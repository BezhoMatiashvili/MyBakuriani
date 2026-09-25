"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  executePurchaseIntent,
  forgetPendingPayment,
  readPendingPayment,
} from "@/lib/payments/keepz/browser";
import type { PurchaseIntent } from "@/lib/payments/keepz/intent";

type Payment = {
  id: string;
  status: string;
  amount: number;
  returnPath: string | null;
  checkoutUrl: string | null;
  canResume: boolean;
};

type ResumeState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done" }
  // purchase: it ran and was refused; interrupted: it never got going (retry);
  // lost: it was claimed but we never learned the outcome.
  | { state: "failed"; kind: "purchase"; reason: string }
  | { state: "failed"; kind: "interrupted" | "lost" };

const POLL_MS = 2000;
// ~90 s of polling; after that the page says Keepz is still confirming. The
// callback and the sweeper settle the payment either way.
const MAX_POLLS = 45;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where Keepz sends the payer back (a static URL, success or failure alike).
 * Arriving here proves nothing: the page shows only the server's verified
 * status, and completes a "pay by card" purchase exactly once (C32).
 */
export default function PaymentResultPage() {
  const t = useTranslations("Payments.result");
  const tShared = useTranslations("DashboardShared");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">(
    "loading",
  );
  const [slow, setSlow] = useState(false);
  const [resume, setResume] = useState<ResumeState>({ state: "idle" });
  const resumeStarted = useRef(false);
  const resumeRetried = useRef(false);

  const runResume = useCallback(
    async (paymentId: string) => {
      if (resumeStarted.current) return;
      resumeStarted.current = true;
      setResume({ state: "running" });
      const response = await fetch(
        `/api/payments/keepz/orders/${paymentId}/resume`,
        { method: "POST" },
      ).catch(() => null);
      if (response?.status === 409) {
        // Nothing to resume (another tab did it) — unless an earlier attempt
        // here claimed it and its answer was lost.
        setResume(
          resumeRetried.current
            ? { state: "failed", kind: "lost" }
            : { state: "idle" },
        );
        return;
      }
      const intent = response?.ok
        ? (
            (await response.json().catch(() => null)) as {
              intent?: PurchaseIntent;
            } | null
          )?.intent
        : undefined;
      if (!intent) {
        // Rate limit, server error or a lost answer: let the payer retry.
        resumeStarted.current = false;
        resumeRetried.current = true;
        setResume({ state: "failed", kind: "interrupted" });
        return;
      }
      try {
        await executePurchaseIntent(intent, {
          vipConflict: tShared("superVipBlocksVip"),
          network: tShared("purchaseNetworkError"),
          generic: tShared("genericRetry"),
          insufficient: t("insufficient"),
        });
        setResume({ state: "done" });
      } catch (err) {
        setResume({
          state: "failed",
          kind: "purchase",
          reason: err instanceof Error ? err.message : tShared("genericRetry"),
        });
      }
    },
    [t, tShared],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    const pendingId = readPendingPayment();
    const url =
      pendingId && UUID_RE.test(pendingId)
        ? `/api/payments/keepz/orders/${pendingId}`
        : "/api/payments/keepz/orders/latest";

    async function poll() {
      polls += 1;
      const response = await fetch(url, { cache: "no-store" }).catch(
        () => null,
      );
      if (cancelled) return;
      if (response?.status === 404) {
        forgetPendingPayment();
        setPhase("missing");
        return;
      }
      if (response?.ok) {
        const { payment: next } = (await response.json()) as {
          payment: Payment;
        };
        if (cancelled) return;
        setPayment(next);
        setPhase("ready");
        if (next.status === "succeeded") {
          forgetPendingPayment();
          if (next.canResume) void runResume(next.id);
          return;
        }
        if (next.status === "cancelled" || next.status === "expired") {
          forgetPendingPayment();
          return;
        }
      }
      if (polls >= MAX_POLLS) {
        setSlow(true);
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runResume]);

  const backHref = payment?.returnPath ?? "/dashboard";
  const amount = payment ? `${payment.amount.toFixed(2)} ₾` : "";

  let icon = <Loader2 className="h-10 w-10 animate-spin text-[#2563EB]" />;
  let title = t("checking");
  let body: string | null = slow ? t("slow") : null;

  if (phase === "missing") {
    icon = <AlertTriangle className="h-10 w-10 text-[#F59E0B]" />;
    title = t("missing");
    body = null;
  } else if (payment) {
    switch (payment.status) {
      case "succeeded":
        icon = <CheckCircle2 className="h-10 w-10 text-[#16A34A]" />;
        title = t("succeeded");
        body = t("credited", { amount });
        break;
      case "declined":
        icon = <XCircle className="h-10 w-10 text-[#DC2626]" />;
        title = t("declined");
        body = t("declinedHint");
        break;
      case "cancelled":
      case "expired":
        icon = <XCircle className="h-10 w-10 text-[#64748B]" />;
        title = t(payment.status);
        body = null;
        break;
      default:
        icon = slow ? (
          <Clock className="h-10 w-10 text-[#F59E0B]" />
        ) : (
          <Loader2 className="h-10 w-10 animate-spin text-[#2563EB]" />
        );
        title = t("pending");
        body = slow ? t("slow") : t("pendingHint");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-5 px-4 py-12 text-center">
      {icon}
      <h1 className="text-[24px] font-black leading-8 text-[#0F172A]">
        {title}
      </h1>
      {body && (
        <p className="text-[14px] leading-[22px] text-[#475569]">{body}</p>
      )}

      {payment?.status === "succeeded" && resume.state !== "idle" && (
        <div
          role="status"
          className={`w-full rounded-xl border p-4 text-[13px] leading-[20px] ${
            resume.state === "failed"
              ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
              : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A]"
          }`}
        >
          {resume.state === "running" && (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("resumeRunning")}
            </span>
          )}
          {resume.state === "done" && t("resumeDone")}
          {resume.state === "failed" &&
            resume.kind === "purchase" &&
            t("resumeFailed", { amount, reason: resume.reason })}
          {resume.state === "failed" &&
            resume.kind === "lost" &&
            t("resumeLost")}
          {resume.state === "failed" && resume.kind === "interrupted" && (
            <span className="flex flex-col items-center gap-3">
              {t("resumeInterrupted")}
              <button
                type="button"
                onClick={() => payment && void runResume(payment.id)}
                className="min-h-[44px] rounded-xl bg-[#B91C1C] px-5 text-[13px] font-bold text-white hover:bg-[#991B1B]"
              >
                {t("tryAgain")}
              </button>
            </span>
          )}
        </div>
      )}

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        {payment?.status === "pending" && payment.checkoutUrl && (
          <a
            href={payment.checkoutUrl}
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#2563EB] px-5 py-3 text-[13px] font-bold text-white hover:bg-[#1E40AF]"
          >
            {t("continuePayment")}
          </a>
        )}
        <Link
          href={phase === "missing" ? "/dashboard" : backHref}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#E2E8F0] px-5 py-3 text-[13px] font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
        >
          {payment?.status === "declined" ? t("tryAgain") : t("back")}
        </Link>
      </div>
    </div>
  );
}
