"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePathname } from "@/i18n/navigation";
import TopUpModal from "@/components/payments/TopUpModal";
import { startCardCheckout } from "@/lib/payments/keepz/browser";

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
  const [creating, setCreating] = useState(false);
  // Same amount again → same idempotency key, so a retry after a lost
  // response reuses the order Keepz already created.
  const attempt = useRef<{ amount: number; requestId: string } | null>(null);

  const startTopUp = async (amount: number) => {
    if (attempt.current?.amount !== amount) {
      attempt.current = { amount, requestId: crypto.randomUUID() };
    }
    setCreating(true);
    const failure = await startCardCheckout({
      requestId: attempt.current.requestId,
      amount,
      returnPath: pathname,
      locale,
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
      />
    </>
  );
}
