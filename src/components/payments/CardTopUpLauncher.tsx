"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePathname } from "@/i18n/navigation";
import TopUpModal from "@/components/payments/TopUpModal";
import {
  openCheckoutTab,
  startCardCheckout,
} from "@/lib/payments/keepz/browser";
import { TOPUP_PARAM, parseTopUpParam } from "@/lib/support/actions";

/**
 * Wallet top-up by card, used by every balance dashboard (C32). Opens the
 * amount picker, then hands the payer to Keepz's hosted checkout; the server
 * is the only authority on whether card payments are available.
 */
export default function CardTopUpLauncher() {
  const t = useTranslations("DashboardShared");
  const tPayments = useTranslations("Payments");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [initialAmount, setInitialAmount] = useState<number>();
  const [creating, setCreating] = useState(false);

  // `?topup=<GEL>` or `?topup=open` (the support assistant's top-up button,
  // C43) opens the amount picker, at most prefilled; nothing is charged
  // until the payer confirms. The param is dropped so a reload doesn't
  // reopen it.
  const topUpParam = useSearchParams().get(TOPUP_PARAM);
  useEffect(() => {
    const requested = parseTopUpParam(topUpParam);
    if (requested === undefined) return;
    setInitialAmount(requested ?? undefined);
    setOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete(TOPUP_PARAM);
    window.history.replaceState(null, "", url);
  }, [topUpParam]);
  // Same amount again → same idempotency key, so a retry after a lost
  // response reuses the order Keepz already created.
  const attempt = useRef<{ amount: number; requestId: string } | null>(null);

  const startTopUp = async (amount: number) => {
    // Before any await, or the browser blocks the tab Keepz opens in.
    const tab = openCheckoutTab();
    if (attempt.current?.amount !== amount) {
      attempt.current = { amount, requestId: crypto.randomUUID() };
    }
    setCreating(true);
    const failure = await startCardCheckout({
      requestId: attempt.current.requestId,
      amount,
      returnPath: pathname,
      locale,
      tab,
    });
    if (failure) {
      // No usable order came of it: the next try needs a fresh key.
      if (
        failure === "request_conflict" ||
        failure === "provider_rejected" ||
        failure === "provider_unavailable"
      ) {
        attempt.current = null;
      }
      toast.error(tPayments(`errors.${failure}`));
      setCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="card-topup-launcher"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-5 py-3 text-[13px] font-black text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
      >
        {t("topUpBalance")}
      </button>
      <TopUpModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={startTopUp}
        loading={creating}
        initialAmount={initialAmount}
      />
    </>
  );
}
